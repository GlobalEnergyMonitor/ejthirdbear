import { error } from '@sveltejs/kit';
import { listAssets, getAsset, getOwnershipGraph } from '$lib/ownership-api';

// Only prerender in production builds - dev mode uses API fetching
export const prerender = process.env.NODE_ENV !== 'development';

// This function tells SvelteKit which asset IDs to prerender at build time
export async function entries() {
  try {
    console.log('ASSET FETCH: Loading all assets from Ownership API...');
    const startTime = Date.now();

    const allIds = new Set();
    const pageSize = 1000;
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

      console.log(`  [OK] Fetched ${allIds.size} assets so far...`);
    }

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  [OK] Fetched ${allIds.size} asset IDs in ${fetchTime}s`);

    return Array.from(allIds).map((id) => ({ id }));
  } catch (err) {
    console.error('\n❌ ASSET ENTRIES FAILED: Ownership API is not reachable!');
    console.error(`   Error: ${err.message || err}`);
    console.error('   Is your collaborator\'s machine running with ngrok?\n');
    process.exit(1);
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
    console.error(`Failed to fetch asset ${assetId}:`, err);
    throw error(500, `Failed to fetch asset from API: ${err.message}`);
  }
}
