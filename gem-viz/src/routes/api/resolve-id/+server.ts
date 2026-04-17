import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GEM_CORS_ORIGINS } from '$lib/external-links';

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

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

export const GET: RequestHandler = async ({ url, request }) => {
  const ids = url.searchParams.getAll('id');
  const headers = corsHeaders(request);

  if (ids.length === 0) {
    return json({ error: 'Missing id parameter' }, { status: 400, headers });
  }

  if (ids.length === 1) {
    const resolved = await resolveViaApi(ids[0]);
    return json({ resolved }, { headers });
  }

  // Batch mode
  const results: Record<string, string> = {};
  await Promise.all(
    ids.map(async (id) => {
      results[id] = await resolveViaApi(id);
    })
  );
  return json({ results }, { headers });
};

/** Call the /resolve/{id} API and extract the compound asset_id. */
async function resolveViaApi(id: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE}/resolve/${encodeURIComponent(id)}`);
    if (res.ok) {
      const data = await res.json();
      const assetId = data.assets?.[0]?.asset_id;
      if (assetId) return assetId;
    }
  } catch {
    // API unavailable — return as-is
  }
  return id;
}
