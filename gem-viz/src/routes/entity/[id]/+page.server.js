import { error } from '@sveltejs/kit';
import { listEntities, getEntity, getEntityOwners, getEntityOwned } from '$lib/ownership-api';

// Disable prerendering - pages load client-side with DuckDB
// This dramatically speeds up builds since we don't need to fetch 150k+ pages from API
export const prerender = false;

// This function tells SvelteKit which entity IDs to prerender at build time
export async function entries() {
  try {
    const allIds = new Set();
    const pageSize = 500;
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
    }

    return Array.from(allIds).map((id) => ({ id }));
  } catch {
    // API not reachable - return empty for dev mode
    return [];
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
    // Don't throw 500 - return minimal data and let client-side DuckDB handle it
    console.warn(`[Entity Server] API failed for ${entityId}: ${err.message}`);
    return {
      entityId,
      entityName: null,
      entity: null,
      owners: null,
      owned: null,
      fromAPI: false,
      apiError: err.message,
    };
  }
}
