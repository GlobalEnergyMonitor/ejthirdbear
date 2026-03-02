import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import idMap from '$lib/server/id-map.json';

const map = idMap as Record<string, string>;

export const GET: RequestHandler = ({ url }) => {
  const ids = url.searchParams.getAll('id');

  if (ids.length === 0) {
    return json({ error: 'Missing id parameter' }, { status: 400 });
  }

  if (ids.length === 1) {
    const resolved = map[ids[0]] ?? ids[0];
    return json({ resolved });
  }

  // Batch mode
  const results: Record<string, string> = {};
  for (const id of ids) {
    results[id] = map[id] ?? id;
  }
  return json({ results });
};
