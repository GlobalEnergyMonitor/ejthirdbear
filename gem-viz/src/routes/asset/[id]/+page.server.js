import { error } from '@sveltejs/kit';
import { listAssets, getAsset, getOwnershipGraph } from '$lib/ownership-api';

// Only prerender in production builds - dev mode uses API fetching
export const prerender = process.env.NODE_ENV !== 'development';

// This function tells SvelteKit which asset IDs to prerender at build time
export async function entries() {
  try {
    const allIds = new Set();
    const pageSize = 500;
    let offset = 0;
    let pageCount = 0;
    let hasMore = true;

    while (hasMore && pageCount < 500) {
      const response = await listAssets({ limit: pageSize, offset });
      response.results.forEach((asset) => {
        if (asset.id) allIds.add(asset.id);
      });

      pageCount += 1;
      offset += pageSize;
      hasMore = response.results.length === pageSize;
    }

    return Array.from(allIds).map((id) => ({ id }));
  } catch {
    // API not reachable - return empty for dev mode
    return [];
  }
}

// Load function runs at build time for prerendered pages
export async function load({ params }) {
  const assetId = params.id;
  if (!assetId) throw error(404, 'Missing asset ID');

  try {
    const [asset, graph] = await Promise.all([
      getAsset(assetId),
      getOwnershipGraph({ root: assetId, direction: 'up', max_depth: 12 }),
    ]);

    return {
      asset,
      graph,
      fromAPI: true,
    };
  } catch (err) {
    // Return empty data and let client-side try DuckDB fallback
    // This allows the page to render and attempt local data loading
    return {
      asset: null,
      graph: null,
      fromAPI: false,
      apiError: err._status === 404 ? 'not_found' : 'api_error',
      assetId, // Pass ID so client can try DuckDB
    };
  }
}
