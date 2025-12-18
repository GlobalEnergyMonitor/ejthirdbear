import { error } from '@sveltejs/kit';
import { listEntities, getEntity, getEntityOwners, getEntityOwned } from '$lib/ownership-api';

// Only prerender in production builds - dev mode uses client-side fetching
export const prerender = process.env.NODE_ENV !== 'development';

// This function tells SvelteKit which entity IDs to prerender at build time
export async function entries() {
  try {
    console.log('ENTITY FETCH: Loading all entities from Ownership API...');
    const startTime = Date.now();

    const allIds = new Set();
    const pageSize = 1000;
    let offset = 0;
    let pageCount = 0;
    let hasMore = true;

    while (hasMore && pageCount < 500) {
      const response = await listEntities({ limit: pageSize, offset });
      response.results.forEach((entity) => {
        if (entity.id) allIds.add(entity.id);
      });

      pageCount += 1;
      offset += pageSize;
      hasMore = response.results.length === pageSize;

      console.log(`  [OK] Fetched ${allIds.size} entities so far...`);
    }

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  [OK] Fetched ${allIds.size} entity IDs in ${fetchTime}s`);

    return Array.from(allIds).map((id) => ({ id }));
  } catch (err) {
    console.error('\n❌ ENTITY ENTRIES FAILED: Ownership API is not reachable!');
    console.error(`   Error: ${err.message || err}`);
    console.error('   Is your collaborator\'s machine running with ngrok?\n');
    process.exit(1);
  }
}

// Load function runs at build time for prerendered pages
export async function load({ params }) {
  const entityId = params.id;
  if (!entityId) throw error(404, 'Missing entity ID');

  try {
    const [entity, owners, owned] = await Promise.all([
      getEntity(entityId),
      getEntityOwners(entityId),
      getEntityOwned(entityId),
    ]);

    return {
      entityId,
      entityName: entity.name,
      entity,
      owners,
      owned,
      fromAPI: true,
    };
  } catch (err) {
    console.error(`Failed to fetch entity ${entityId}:`, err);
    throw error(500, `Failed to fetch entity from API: ${err.message}`);
  }
}
