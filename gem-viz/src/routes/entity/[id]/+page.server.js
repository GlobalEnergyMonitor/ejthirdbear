import { error } from '@sveltejs/kit';
import { getEntity } from '$lib/server/build-cache.js';

// Dynamic SSR - no prerendering
export const prerender = false;

// Read from in-memory cache - O(1) lookup
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

  return {
    entityId,
    entityName: null,
    entity: null,
    owners: null,
    owned: null,
    fromAPI: false,
    apiError: 'not_cached',
  };
}
