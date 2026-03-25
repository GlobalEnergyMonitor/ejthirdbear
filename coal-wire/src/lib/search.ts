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
 *
 * Semantic-only results (not in BM25 list) that don't contain any query terms
 * get a penalty to prevent "vibes-only" results from outranking keyword matches.
 */
function weightedRRF(
  bm25Ids: number[],
  semanticIds: number[],
  bm25Weight = 0.5,
  k = 60,
  query?: string,
  articleContentMap?: Map<number, string>,
): Map<number, number> {
  const semanticWeight = 1 - bm25Weight;
  const scores = new Map<number, number>();
  const bm25Set = new Set(bm25Ids);

  // Extract query terms for content checking
  const queryTerms = query
    ? query.toLowerCase().split(/\s+/).filter(t => t.length > 1 && !['and', 'or', 'not', 'near'].includes(t))
    : [];

  for (let i = 0; i < bm25Ids.length; i++) {
    const id = bm25Ids[i];
    scores.set(id, (scores.get(id) ?? 0) + bm25Weight * (1 / (k + i + 1)));
  }

  for (let i = 0; i < semanticIds.length; i++) {
    const id = semanticIds[i];
    let weight = semanticWeight;

    // Penalize semantic-only results based on keyword overlap
    if (!bm25Set.has(id) && queryTerms.length > 0 && articleContentMap) {
      const content = (articleContentMap.get(id) ?? '').toLowerCase();
      const matchedTerms = queryTerms.filter(t => content.includes(t));
      const coverage = matchedTerms.length / queryTerms.length;

      if (coverage === 0) {
        // No keyword overlap at all — vibes only
        weight *= 0.1;
      } else if (coverage < 1) {
        // Partial overlap (e.g. has "valley" but not "hudson") — significant penalty
        weight *= 0.3;
      }
      // coverage === 1: all terms present, no penalty
    }

    scores.set(id, (scores.get(id) ?? 0) + weight * (1 / (k + i + 1)));
  }

  return scores;
}

/**
 * HTML-escape a string.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Clean content for snippet display: collapse whitespace, strip markdown-ish chars.
 */
function cleanContent(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/gm, '')
    .trim();
}

/**
 * Generate a snippet from content that highlights query terms.
 * Returns HTML with <mark> tags around whole-word matched terms.
 */
function generateSnippet(content: string, query: string, maxLen = 220): string {
  const clean = cleanContent(content);
  if (!clean || !query) return escapeHtml(clean.slice(0, maxLen)) + '…';

  // Extract individual query terms (split on whitespace, remove FTS operators)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1 && !['and', 'or', 'not', 'near'].includes(t))
    .map(t => t.replace(/['"*()]/g, ''));

  if (terms.length === 0) return escapeHtml(clean.slice(0, maxLen)) + '…';

  const cleanLower = clean.toLowerCase();

  // Find the best window: position where the most query terms appear as whole words
  let bestPos = 0;
  let bestCount = 0;

  for (const term of terms) {
    // Use word-boundary-aware search for window finding
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    let m;
    while ((m = re.exec(cleanLower)) !== null) {
      const idx = m.index;
      const windowStart = Math.max(0, idx - 80);
      const windowEnd = Math.min(clean.length, idx + maxLen - 80);
      const windowText = cleanLower.slice(windowStart, windowEnd);
      let count = 0;
      for (const t of terms) {
        if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(windowText)) count++;
      }
      if (count > bestCount || (count === bestCount && idx < bestPos)) {
        bestCount = count;
        bestPos = Math.max(0, idx - 80);
      }
    }
  }

  // Extract window — extend to word boundary
  const start = bestPos;
  let end = Math.min(clean.length, start + maxLen);
  if (end < clean.length) {
    const nextSpace = clean.indexOf(' ', end);
    if (nextSpace !== -1 && nextSpace - end < 20) end = nextSpace;
  }
  let snippet = clean.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clean.length ? '…' : '';

  // Escape HTML
  snippet = escapeHtml(snippet);

  // Highlight whole-word matches only (word boundary before, lookahead allows partial suffix)
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match term at a word boundary — highlight the full word containing the term
    const re = new RegExp(`\\b(${escaped}\\w*)`, 'gi');
    snippet = snippet.replace(re, '<mark>$1</mark>');
  }

  return prefix + snippet + suffix;
}

export interface BM25Options {
  query: string;
  limit?: number;
  section?: string;
  dateFrom?: string;
  dateTo?: string;
}

/**
 * BM25 search via SQLite FTS5.
 * Date/section filters are pushed into SQL to avoid post-filter truncation.
 *
 * Uses column filter {title section content} to exclude url/links from matching.
 */
export function searchBM25(opts: string | BM25Options, limit?: number): SearchResult[] {
  const db = getDb();
  if (!db) return [];

  // Support both old (query, limit) and new (opts) signatures
  const o: BM25Options = typeof opts === 'string'
    ? { query: opts, limit: limit ?? 30 }
    : opts;

  // Scope FTS5 MATCH to title, section, content columns only (exclude url, links)
  const ftsQuery = `{title section content} : ${o.query}`;
  const params: (string | number)[] = [ftsQuery];
  const clauses: string[] = ['articles_fts MATCH ?'];

  if (o.section) {
    clauses.push("a.section = ?");
    params.push(o.section);
  }
  if (o.dateFrom) {
    clauses.push("a.date >= ?");
    params.push(o.dateFrom);
  }
  if (o.dateTo) {
    clauses.push("a.date <= ?");
    params.push(o.dateTo);
  }

  const effectiveLimit = o.limit ?? 30;
  params.push(effectiveLimit);

  try {
    const rows = db
      .prepare(
        `
        SELECT
          a.id, a.issue_number, a.title, a.date, a.section, a.content, a.url, a.links,
          fts.rank AS rank
        FROM articles_fts fts
        JOIN articles a ON a.id = fts.rowid
        WHERE ${clauses.join(' AND ')}
        ORDER BY fts.rank
        LIMIT ?
      `
      )
      .all(...params) as (SearchResult & { content: string })[];

    // Apply recency boost: newer articles get a small multiplier
    const now = Date.now();
    return rows.map((r) => {
      const baseScore = -r.rank;
      const ageMs = r.date ? now - new Date(r.date).getTime() : Infinity;
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      // Recency boost: articles within 1 year get up to 1.3x, decays to 1.0x over 5 years
      const recencyBoost = 1 + 0.3 * Math.max(0, 1 - ageDays / (365 * 5));
      return {
        ...r,
        snippet: generateSnippet(r.content, o.query),
        score: baseScore * recencyBoost,
        match_type: 'bm25' as const,
      };
    }).sort((a, b) => b.score - a.score);
  } catch {
    // FTS5 parse error from malformed query syntax (unbalanced quotes, bare operators, etc.)
    return [];
  }
}

/**
 * Cached embeddings — loaded once from DB, reused across requests.
 * At 870 articles × 384 dims × 4 bytes ≈ 1.3 MB — fine to keep in memory.
 */
let embeddingCache: { article: Article; embedding: Float32Array }[] | null = null;

function getEmbeddings(): { article: Article; embedding: Float32Array }[] {
  if (embeddingCache) return embeddingCache;
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

  embeddingCache = rows.map((row) => ({
    article: { id: row.id, issue_number: row.issue_number, title: row.title, date: row.date, section: row.section, content: row.content, url: row.url, links: row.links },
    embedding: blobToFloat32(row.embedding),
  }));

  return embeddingCache;
}

/**
 * Semantic search via precomputed embeddings.
 * Requires a query embedding vector from the caller.
 */
export function searchSemantic(queryEmbedding: Float32Array, limit = 30): (SearchResult & { semantic_score?: number })[] {
  const cached = getEmbeddings();
  if (cached.length === 0) return [];

  const scored = cached.map((row) => {
    const sim = cosineSim(queryEmbedding, row.embedding);
    return { ...row.article, score: sim };
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
    snippet: '', // will be generated later with query context
    score: r.score,
    semantic_score: r.score,
    match_type: 'semantic' as const,
  }));
}

/**
 * "Find similar" — given an article ID, find articles with similar embeddings.
 */
export function findSimilar(articleId: number, limit = 10): SearchResult[] {
  const cached = getEmbeddings();
  const source = cached.find((r) => r.article.id === articleId);
  if (!source) return [];

  const results = searchSemantic(source.embedding, limit + 1);

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
  debug?: boolean;
}

export interface DebugInfo {
  bm25_rank?: number;
  bm25_score?: number;
  semantic_score?: number;
  rrf_score?: number;
  bm25_position?: number;
  semantic_position?: number;
  explanation?: string;
}

/**
 * Unified search with configurable mode and weights.
 */
export function search(opts: SearchOptions): (SearchResult & { debug?: DebugInfo })[] {
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
    debug = false,
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

  let results: (SearchResult & { debug?: DebugInfo })[];

  // BM25 options: push date/section filters into SQL for better recall
  const bm25Opts: BM25Options = { query, limit: limit * 3, section, dateFrom, dateTo };

  if (mode === 'semantic' && queryEmbedding) {
    const semantic = searchSemantic(queryEmbedding, limit * 2);
    results = semantic.map(r => ({
      ...r,
      snippet: generateSnippet(r.content, query),
      ...(debug ? { debug: {
        semantic_score: r.semantic_score,
        explanation: `Semantic similarity: ${(r.semantic_score ?? r.score).toFixed(4)}`,
      }} : {}),
    }));
  } else if (mode === 'hybrid' && queryEmbedding) {
    const bm25 = searchBM25(bm25Opts);
    const semantic = searchSemantic(queryEmbedding, limit * 3);

    if (semantic.length === 0) {
      results = bm25.map(r => ({
        ...r,
        ...(debug ? { debug: {
          bm25_rank: r.rank,
          bm25_score: r.score,
          explanation: `BM25 only (no embeddings). Score: ${r.score.toFixed(4)}`,
        }} : {}),
      }));
    } else {
      const bm25Ids = bm25.map((r) => r.id);
      const semanticIds = semantic.map((r) => r.id);

      // Build position lookups for debug
      const bm25PosMap = new Map(bm25Ids.map((id, i) => [id, i]));
      const semanticPosMap = new Map(semanticIds.map((id, i) => [id, i]));

      const articleMap = new Map<number, SearchResult>();
      const semanticScoreMap = new Map<number, number>();
      const contentMap = new Map<number, string>();
      for (const r of bm25) {
        articleMap.set(r.id, r);
        contentMap.set(r.id, r.content);
      }
      for (const r of semantic) {
        if (!articleMap.has(r.id)) articleMap.set(r.id, r);
        contentMap.set(r.id, r.content);
        semanticScoreMap.set(r.id, r.semantic_score ?? r.score);
      }

      const fusedScores = weightedRRF(bm25Ids, semanticIds, bm25Weight, 60, query, contentMap);

      results = [...fusedScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id, score]) => {
          const article = articleMap.get(id)!;
          const inBm25 = bm25PosMap.has(id);
          const inSemantic = semanticPosMap.has(id);
          const matchType = (inBm25 && inSemantic ? 'hybrid' : inBm25 ? 'bm25' : 'semantic') as SearchResult['match_type'];

          // Generate snippet with query term highlighting for ALL results
          const snippet = generateSnippet(article.content, query);

          let debugInfo: DebugInfo | undefined;
          if (debug) {
            const bm25Pos = bm25PosMap.get(id);
            const semPos = semanticPosMap.get(id);
            const bm25Score = inBm25 ? bm25.find(r => r.id === id)?.score : undefined;
            const semScore = semanticScoreMap.get(id);

            const fmtScore = (n: number | undefined) => {
              if (n === undefined) return '?';
              return Math.abs(n) < 0.001 ? n.toExponential(2) : n.toFixed(4);
            };
            const parts: string[] = [];
            if (inBm25) parts.push(`BM25 #${(bm25Pos! + 1)} (score: ${fmtScore(bm25Score)})`);
            if (inSemantic) parts.push(`Semantic #${(semPos! + 1)} (sim: ${fmtScore(semScore)})`);
            // Check if this semantic-only result was penalized
            if (!inBm25 && inSemantic) {
              const contentLower = (contentMap.get(id) ?? '').toLowerCase();
              const qTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
              const matched = qTerms.filter(t => contentLower.includes(t));
              if (matched.length === 0) {
                parts.push('(penalized: no keyword match)');
              } else if (matched.length < qTerms.length) {
                const missing = qTerms.filter(t => !contentLower.includes(t));
                parts.push(`(penalized: missing "${missing.join('", "')}")`);
              }
            }
            parts.push(`RRF: ${score.toFixed(6)}`);
            parts.push(`Weights: BM25=${bm25Weight}, Semantic=${(1 - bm25Weight).toFixed(2)}`);

            debugInfo = {
              bm25_rank: inBm25 ? bm25.find(r => r.id === id)?.rank : undefined,
              bm25_score: bm25Score,
              semantic_score: semScore,
              rrf_score: score,
              bm25_position: bm25Pos !== undefined ? bm25Pos + 1 : undefined,
              semantic_position: semPos !== undefined ? semPos + 1 : undefined,
              explanation: parts.join(' | '),
            };
          }

          return {
            ...article,
            snippet,
            score,
            match_type: matchType,
            ...(debugInfo ? { debug: debugInfo } : {}),
          };
        });
    }
  } else {
    results = searchBM25(bm25Opts).map(r => ({
      ...r,
      ...(debug ? { debug: {
        bm25_rank: r.rank,
        bm25_score: r.score,
        explanation: `BM25 score: ${Math.abs(r.score) < 0.001 ? r.score.toExponential(2) : r.score.toFixed(4)}`,
      }} : {}),
    }));
  }

  // Post-filter: date/section on semantic results (BM25 already filtered in SQL)
  if (mode === 'semantic' || mode === 'hybrid') {
    if (section) {
      results = results.filter((r) => r.section.toLowerCase() === section.toLowerCase());
    }
    if (dateFrom) {
      results = results.filter((r) => r.date >= dateFrom);
    }
    if (dateTo) {
      results = results.filter((r) => r.date <= dateTo);
    }
  }

  // Post-filter by tags (always post-filter — tag join in FTS is complex)
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
