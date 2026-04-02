import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';
import { UMAP } from 'umap-js';
import type { RequestHandler } from './$types';

function blobToFloat32(blob: Buffer): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
}

/**
 * DBSCAN clustering.
 */
function dbscan(points: number[][], eps: number, minPts: number): number[] {
  const n = points.length;
  const labels = new Array(n).fill(-1);
  let clusterId = 0;

  function neighbors(idx: number): number[] {
    const result: number[] = [];
    const p = points[idx];
    for (let i = 0; i < n; i++) {
      const dx = points[i][0] - p[0], dy = points[i][1] - p[1];
      if (dx * dx + dy * dy <= eps * eps) result.push(i);
    }
    return result;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== -1) continue;
    const nb = neighbors(i);
    if (nb.length < minPts) continue;
    labels[i] = clusterId;
    const queue = [...nb];
    const seen = new Set(nb);
    seen.add(i);
    while (queue.length) {
      const j = queue.pop()!;
      if (labels[j] !== -1 && labels[j] !== clusterId) continue;
      labels[j] = clusterId;
      const jn = neighbors(j);
      if (jn.length >= minPts) {
        for (const k of jn) {
          if (!seen.has(k)) { seen.add(k); queue.push(k); }
        }
      }
    }
    clusterId++;
  }
  return labels;
}

/**
 * Extract top keywords from a set of texts, excluding stopwords.
 */
function extractKeywords(texts: string[], topN = 2): string {
  const stop = new Set([
    'the', 'and', 'for', 'from', 'with', 'that', 'this', 'are', 'was', 'has', 'its', 'coal',
    'coalwire', 'wire', 'new', 'more', 'will', 'not', 'but', 'have', 'been', 'all', 'can',
    'about', 'one', 'had', 'would', 'could', 'into', 'over', 'also', 'than', 'other', 'after',
    'which', 'their', 'may', 'most', 'says', 'said', 'two', 'year', 'years', 'first', 'last',
    'just', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september',
    'october', 'november', 'december', 'editors', 'editor', 'note', 'notes', 'week', 'weekly',
    'news', 'report', 'reports', 'energy', 'power', 'plant', 'plants', 'global', 'world',
    'please', 'tell', 'survey', 'here', 'read', 'view', 'http', 'https', 'www', 'page', 'full',
    'issue', 'issues', 'company', 'companies', 'market', 'markets', 'price', 'according',
    'million', 'billion', 'government', 'state', 'states', 'country', 'countries', 'climate',
    'industry', 'china', 'india', 'project', 'mining', 'mine', 'mines', 'sector', 'development',
  ]);
  const counts = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const w of t.toLowerCase().split(/\W+/)) {
      if (w.length > 3 && !stop.has(w) && !/^\d+$/.test(w) && !seen.has(w)) {
        counts.set(w, (counts.get(w) ?? 0) + 1);
        seen.add(w);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(e => e[0])
    .join(' · ') || '';
}

interface ClusterInfo {
  id: number;
  centroid: [number, number];
  count: number;
  label: string;
  scale: 'macro' | 'meso' | 'micro';
}

let cache: { points: unknown[]; clusters: ClusterInfo[] } | null = null;

export const GET: RequestHandler = () => {
  if (cache) return json(cache);

  const db = getDb();
  if (!db) return json({ points: [], clusters: [] });

  const rows = db.prepare(`
    SELECT e.article_id, e.embedding,
           a.id, a.title, a.date, a.section, a.issue_number, a.content, a.url
    FROM embeddings e
    JOIN articles a ON a.id = e.article_id
  `).all() as { article_id: number; embedding: Buffer; id: number; title: string; date: string; section: string; issue_number: number; content: string; url: string }[];

  if (rows.length === 0) return json({ points: [], clusters: [] });

  const vectors = rows.map(r => Array.from(blobToFloat32(r.embedding)));
  const umap = new UMAP({ nNeighbors: 8, minDist: 0.05, nComponents: 2, spread: 1.0 });
  const coords = umap.fit(vectors);

  // Normalize to 0-1 range
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const c of coords) {
    if (c[0] < xMin) xMin = c[0]; if (c[0] > xMax) xMax = c[0];
    if (c[1] < yMin) yMin = c[1]; if (c[1] > yMax) yMax = c[1];
  }
  const xRange = xMax - xMin || 1, yRange = yMax - yMin || 1;
  const norm = coords.map((c: number[]) => [(c[0] - xMin) / xRange, (c[1] - yMin) / yRange]);

  // Multi-scale DBSCAN
  const scales: { name: 'macro' | 'meso' | 'micro'; eps: number; minPts: number }[] = [
    { name: 'macro', eps: 0.06, minPts: 8 },
    { name: 'meso', eps: 0.035, minPts: 4 },
    { name: 'micro', eps: 0.018, minPts: 3 },
  ];

  const clusters: ClusterInfo[] = [];
  let cid = 0;

  for (const scale of scales) {
    const labels = dbscan(norm, scale.eps, scale.minPts);
    const groups = new Map<number, number[]>();
    labels.forEach((l, i) => {
      if (l === -1) return;
      if (!groups.has(l)) groups.set(l, []);
      groups.get(l)!.push(i);
    });

    for (const [, members] of groups) {
      // Skip clusters that cover > 30% of points (not informative at any scale)
      if (members.length > rows.length * 0.3) continue;
      if (members.length < scale.minPts) continue;

      const cx = members.reduce((s, i) => s + norm[i][0], 0) / members.length;
      const cy = members.reduce((s, i) => s + norm[i][1], 0) / members.length;

      const texts = members.map(i => rows[i].title + ' ' + rows[i].content.slice(0, 150));
      const label = extractKeywords(texts);
      if (!label) continue;

      clusters.push({ id: cid++, centroid: [cx, cy], count: members.length, label, scale: scale.name });
    }
  }

  const points = rows.map((r, i) => ({
    id: r.id,
    x: norm[i][0],
    y: norm[i][1],
    title: r.title,
    date: r.date,
    section: r.section,
    issue_number: r.issue_number,
    url: r.url || null,
  }));

  cache = { points, clusters };
  return json(cache);
};
