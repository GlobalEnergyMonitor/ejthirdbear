import { json } from '@sveltejs/kit';
import { search, getSections, getStats, getTags } from '$lib/search';
import { embedQuery } from '$lib/embeddings';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q')?.trim();
  if (!q) {
    const sections = getSections();
    const stats = getStats();
    const countries = getTags('country');
    const topics = getTags('topic');
    return json({ results: [], query: '', sections, stats, countries, topics });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20') || 20, 100);
  const rawMode = url.searchParams.get('mode') ?? 'bm25';
  const mode = (['bm25', 'semantic', 'hybrid'].includes(rawMode) ? rawMode : 'bm25') as 'bm25' | 'semantic' | 'hybrid';
  const bm25Weight = parseFloat(url.searchParams.get('bm25w') ?? '0.5') || 0.5;
  const section = url.searchParams.get('section') || undefined;
  const dateFrom = url.searchParams.get('from') || undefined;
  const dateTo = url.searchParams.get('to') || undefined;
  const country = url.searchParams.get('country') || undefined;
  const topic = url.searchParams.get('topic') || undefined;
  const debug = url.searchParams.get('debug') === 'true';

  // Generate query embedding for hybrid/semantic modes
  const needsEmbedding = mode === 'hybrid' || mode === 'semantic';
  const queryEmbedding = needsEmbedding ? await embedQuery(q) : null;

  const results = search({
    query: q,
    limit,
    mode,
    bm25Weight: Math.max(0, Math.min(1, bm25Weight)),
    queryEmbedding,
    section,
    dateFrom,
    dateTo,
    country,
    topic,
    debug,
  });

  // Strip content field from response (large, not needed by client)
  const cleaned = results.map(({ content, ...rest }) => rest);

  return json({ results: cleaned, query: q, mode, bm25Weight, debug });
};
