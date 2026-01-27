import { error } from '@sveltejs/kit';
import { getAsset } from '$lib/server/build-cache.js';

// Dynamic SSR - no prerendering
export const prerender = false;

// Read from in-memory cache - O(1) lookup
export async function load({ params }) {
  const assetId = params.id;
  if (!assetId) throw error(404, 'Missing asset ID');

  const cached = getAsset(assetId);
  if (cached?.success) {
    return { asset: cached.asset, graph: cached.graph, fromAPI: true };
  }

  return { asset: null, graph: null, fromAPI: false, apiError: 'not_cached', assetId };
}
