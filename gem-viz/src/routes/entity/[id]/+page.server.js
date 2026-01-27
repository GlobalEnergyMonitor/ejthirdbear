import { error } from '@sveltejs/kit';
import { getEntityIds, getEntity } from '$lib/server/build-cache.js';

export const prerender = true;

// Return cached IDs - cache is loaded ONCE and kept in memory
export async function entries() {
  const ids = getEntityIds();
  if (ids.length > 0) {
    console.log(`[Entity] Prerendering ${ids.length} pages from memory cache...`);
    return ids.map(id => ({ id }));
  }
  console.warn('[Entity] No cache found - run npm run prefetch first');
  return [];
}

// Read from in-memory cache - O(1) lookup, no file I/O
export async function load({ params }) {
  const entityId = params.id;
  if (!entityId) throw error(404, 'Missing entity ID');

  const cached = getEntity(entityId);
  if (cached?.success) {
    return {
      entityId,
      entityName: cached.entity?.name,
      entity: cached.entity,
      owners: cached.owners,
      owned: cached.owned,
      fromAPI: true,
    };
  }

  return { entityId, entityName: null, entity: null, owners: null, owned: null, fromAPI: false, apiError: 'not_cached' };
}
