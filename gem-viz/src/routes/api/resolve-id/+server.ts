import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import idMap from '$lib/server/id-map.json';
import { GEM_CORS_ORIGINS } from '$lib/external-links';

const map = idMap as Record<string, string>;

// CORS: allow dynamic widget embeds on Drupal to call this endpoint
const ALLOWED_ORIGINS = GEM_CORS_ORIGINS;

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {};
}

export const OPTIONS: RequestHandler = ({ request }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
};

export const GET: RequestHandler = ({ url, request }) => {
  const ids = url.searchParams.getAll('id');
  const headers = corsHeaders(request);

  if (ids.length === 0) {
    return json({ error: 'Missing id parameter' }, { status: 400, headers });
  }

  if (ids.length === 1) {
    const resolved = map[ids[0]] ?? ids[0];
    return json({ resolved }, { headers });
  }

  // Batch mode
  const results: Record<string, string> = {};
  for (const id of ids) {
    results[id] = map[id] ?? id;
  }
  return json({ results }, { headers });
};
