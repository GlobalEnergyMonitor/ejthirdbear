import { getDb, type Article, type SearchResult, type IssueInfo, type SearchStats, type TagCount } from './db';

/**
 * Cosine similarity between two Float32Arrays.
 */
function cosineSim(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Convert BLOB to Float32Array.
 */
function blobToFloat32(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

/**
 * Weighted Reciprocal Rank Fusion: merge two ranked lists.
 * bm25Weight: 0..1 (semantic weight is 1 - bm25Weight)
 * k=60 is the standard RRF constant.
 */
function weightedRRF(
  bm25Ids: number[],
  semanticIds: number[],
  bm25Weight = 0.5,
  k = 60
): Map<number, number> {
  const semanticWeight = 1 - bm25Weight;
  const scores = new Map<number, number>();

  for (let i = 0; i < bm25Ids.length; i++) {
    const id = bm25Ids[i];
    scores.set(id, (scores.get(id) ?? 0) + bm25Weight * (1 / (k + i + 1)));
  }

  for (let i = 0; i < semanticIds.length; i++) {
    const id = semanticIds[i];
    scores.set(id, (scores.get(id) ?? 0) + semanticWeight * (1 / (k + i + 1)));
  }

  return scores;
}

/**
 * BM25 search via SQLite FTS5.
 */
export function searchBM25(query: string, limit = 30): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `
      SELECT
        a.id, a.issue_number, a.title, a.date, a.section, a.content, a.url, a.links,
        fts.rank AS rank,
        snippet(articles_fts, 2, '<mark>', '</mark>', '…', 40) AS snippet
      FROM articles_fts fts
      JOIN articles a ON a.id = fts.rowid
      WHERE articles_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `
    )
    .all(query, limit) as SearchResult[];

  return rows.map((r) => ({ ...r, score: -r.rank, match_type: 'bm25' as const }));
}

/**
 * Semantic search via precomputed embeddings.
 * Requires a query embedding vector from the caller.
 */
export function searchSemantic(queryEmbedding: Float32Array, limit = 30): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare(
      `SELECT e.article_id, e.embedding, a.id, a.issue_number, a.title, a.date,
              a.section, a.content, a.url, a.links
       FROM embeddings e
       JOIN articles a ON a.id = e.article_id`
    )
    .all() as (Article & { article_id: number; embedding: Buffer })[];

  if (rows.length === 0) return [];

  const scored = rows.map((row) => {
    const emb = blobToFloat32(row.embedding);
    const sim = cosineSim(queryEmbedding, emb);
    return { ...row, score: sim };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r) => ({
    id: r.id,
    issue_number: r.issue_number,
    title: r.title,
    date: r.date,
    section: r.section,
    content: r.content,
    url: r.url,
    links: r.links,
    rank: 0,
    snippet: r.content.slice(0, 200) + '…',
    score: r.score,
    match_type: 'semantic' as const,
  }));
}

/**
 * "Find similar" — given an article ID, find articles with similar embeddings.
 */
export function findSimilar(articleId: number, limit = 10): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  const source = db
    .prepare('SELECT embedding FROM embeddings WHERE article_id = ?')
    .get(articleId) as any;

  if (!source) return [];

  const queryEmb = blobToFloat32(source.embedding);
  const results = searchSemantic(queryEmb, limit + 1);

  // Exclude the source article
  return results.filter((r) => r.id !== articleId).slice(0, limit);
}

export interface SearchOptions {
  query: string;
  limit?: number;
  mode?: 'bm25' | 'semantic' | 'hybrid';
  bm25Weight?: number; // 0..1, default 0.5
  queryEmbedding?: Float32Array | null;
  section?: string;
  dateFrom?: string;
  dateTo?: string;
  country?: string;
  topic?: string;
}

/**
 * Unified search with configurable mode and weights.
 */
export function search(opts: SearchOptions): SearchResult[] {
  const {
    query,
    limit = 20,
    mode = 'bm25',
    bm25Weight = 0.5,
    queryEmbedding = null,
    section,
    dateFrom,
    dateTo,
    country,
    topic,
  } = opts;

  // Pre-filter article IDs by tags if country/topic specified
  let tagFilterIds: Set<number> | null = null;
  const db = getDb();
  if (db && (country || topic)) {
    let ids: number[] | null = null;
    if (country) {
      const rows = db.prepare(
        "SELECT article_id FROM article_tags WHERE tag_type = 'country' AND tag_value = ?"
      ).all(country) as { article_id: number }[];
      ids = rows.map((r) => r.article_id);
    }
    if (topic) {
      const rows = db.prepare(
        "SELECT article_id FROM article_tags WHERE tag_type = 'topic' AND tag_value = ?"
      ).all(topic) as { article_id: number }[];
      const topicIds = new Set(rows.map((r) => r.article_id));
      ids = ids ? ids.filter((id) => topicIds.has(id)) : [...topicIds];
    }
    if (ids) tagFilterIds = new Set(ids);
  }

  let results: SearchResult[];

  if (mode === 'semantic' && queryEmbedding) {
    results = searchSemantic(queryEmbedding, limit * 2);
  } else if (mode === 'hybrid' && queryEmbedding) {
    const bm25 = searchBM25(query, limit * 3);
    const semantic = searchSemantic(queryEmbedding, limit * 3);

    if (semantic.length === 0) {
      results = bm25;
    } else {
      const bm25Ids = bm25.map((r) => r.id);
      const semanticIds = semantic.map((r) => r.id);
      const fusedScores = weightedRRF(bm25Ids, semanticIds, bm25Weight);

      const articleMap = new Map<number, SearchResult>();
      for (const r of bm25) articleMap.set(r.id, r);
      for (const r of semantic) if (!articleMap.has(r.id)) articleMap.set(r.id, r);

      results = [...fusedScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, score]) => {
          const article = articleMap.get(id)!;
          const inBm25 = bm25Ids.includes(id);
          const inSemantic = semanticIds.includes(id);
          return {
            ...article,
            score,
            match_type: (inBm25 && inSemantic ? 'hybrid' : inBm25 ? 'bm25' : 'semantic') as SearchResult['match_type'],
          };
        });
    }
  } else {
    results = searchBM25(query, limit * 2);
  }

  // Post-filter by section
  if (section) {
    results = results.filter((r) => r.section.toLowerCase() === section.toLowerCase());
  }

  // Post-filter by date range
  if (dateFrom) {
    results = results.filter((r) => r.date >= dateFrom);
  }
  if (dateTo) {
    results = results.filter((r) => r.date <= dateTo);
  }

  // Post-filter by tags
  if (tagFilterIds) {
    results = results.filter((r) => tagFilterIds!.has(r.id));
  }

  return results.slice(0, limit);
}

/**
 * Browse issues by date (most recent first).
 */
export function browseIssues(limit = 50, offset = 0): IssueInfo[] {
  const db = getDb();
  if (!db) return [];

  return db
    .prepare(
      `
      SELECT issue_number, MIN(title) as title, date, MIN(url) as url,
             COUNT(*) as article_count
      FROM articles
      GROUP BY issue_number
      ORDER BY date DESC, issue_number DESC
      LIMIT ? OFFSET ?
    `
    )
    .all(limit, offset) as IssueInfo[];
}

/**
 * Get all articles in a specific issue.
 */
export function getIssue(issueNumber: number) {
  const db = getDb();
  if (!db) return [];

  return db
    .prepare('SELECT * FROM articles WHERE issue_number = ? ORDER BY id')
    .all(issueNumber);
}

/**
 * Get distinct sections for filter UI.
 */
export function getSections(): string[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .prepare("SELECT DISTINCT section FROM articles WHERE section != '' ORDER BY section")
    .all() as { section: string }[];

  return rows.map((r) => r.section);
}

/**
 * Get database stats.
 */
export function getStats(): SearchStats | null {
  const db = getDb();
  if (!db) return null;

  const counts = db.prepare(
    `SELECT COUNT(*) as total_articles,
            COUNT(DISTINCT issue_number) as total_issues,
            MIN(date) as min_date,
            MAX(date) as max_date
     FROM articles`
  ).get() as { total_articles: number; total_issues: number; min_date: string; max_date: string };

  let hasEmbeddings = false;
  try {
    const embCount = db.prepare('SELECT COUNT(*) as n FROM embeddings').get() as { n: number };
    hasEmbeddings = embCount.n > 0;
  } catch {}

  let hasTags = false;
  try {
    const tagCount = db.prepare('SELECT COUNT(*) as n FROM article_tags').get() as { n: number };
    hasTags = tagCount.n > 0;
  } catch {}

  return {
    total_articles: counts.total_articles,
    total_issues: counts.total_issues,
    date_range: { min: counts.min_date, max: counts.max_date },
    has_embeddings: hasEmbeddings,
    has_tags: hasTags,
  };
}

/**
 * Get distinct tag values by type, ordered by frequency.
 */
export function getTags(tagType: string): TagCount[] {
  const db = getDb();
  if (!db) return [];

  try {
    return db
      .prepare(
        `SELECT tag_value as value, COUNT(*) as count
         FROM article_tags WHERE tag_type = ?
         GROUP BY tag_value ORDER BY count DESC`
      )
      .all(tagType) as TagCount[];
  } catch {
    return [];
  }
}
