import { error } from '@sveltejs/kit';
import { getAsset } from '$lib/server/build-cache.js';
import { fetchAssetData } from '$lib/server/api-client.js';

// Dynamic SSR - no prerendering
export const prerender = false;

// Read from cache first, fall back to runtime API
export async function load({ params }) {
  const assetId = params.id;
  if (!assetId) throw error(404, 'Missing asset ID');

  // Try in-memory cache first (for static builds)
  const cached = getAsset(assetId);
  if (cached?.success) {
    return { asset: cached.asset, graph: cached.graph, fromAPI: true };
  }

  // Fall back to runtime API (for SSR on Fly.io)
  const data = await fetchAssetData(assetId);
  if (data.success) {
    return { asset: data.asset, graph: data.graph, fromAPI: true };
  }

  // Return error state for client-side handling
  return {
    asset: null,
    graph: null,
    fromAPI: false,
    apiError: data.error || 'Failed to load asset',
    assetId,
  };
}
