import { error } from '@sveltejs/kit';
import { getAssetIds, getAsset } from '$lib/server/build-cache.js';

export const prerender = true;

// Return cached IDs - cache is loaded ONCE and kept in memory
export async function entries() {
  const ids = getAssetIds();
  if (ids.length > 0) {
    console.log(`[Asset] Prerendering ${ids.length} pages from memory cache...`);
    return ids.map(id => ({ id }));
  }
  console.warn('[Asset] No cache found - run npm run prefetch first');
  return [];
}

// Read from in-memory cache - O(1) lookup, no file I/O
export async function load({ params }) {
  const assetId = params.id;
  if (!assetId) throw error(404, 'Missing asset ID');

  const cached = getAsset(assetId);
  if (cached?.success) {
    return { asset: cached.asset, graph: cached.graph, fromAPI: true };
  }

  return { asset: null, graph: null, fromAPI: false, apiError: 'not_cached', assetId };
}
