import { error } from '@sveltejs/kit';
import { getEntity } from '$lib/server/build-cache.js';
import { fetchEntityData } from '$lib/server/api-client.js';

// Dynamic SSR - no prerendering
export const prerender = false;

// Read from cache first, fall back to runtime API
export async function load({ params }) {
  const entityId = params.id;
  if (!entityId) throw error(404, 'Missing entity ID');

  // Try in-memory cache first (for static builds)
  const cached = getEntity(entityId);
  if (cached?.success) {
    return {
      entityId,
      entityName: cached.entity?.Name || cached.entity?.name,
      entity: cached.entity,
      owners: cached.owners,
      owned: cached.owned,
      fromAPI: true,
    };
  }

  // Fall back to runtime API (for SSR on Fly.io)
  const data = await fetchEntityData(entityId);
  if (data.success) {
    return {
      entityId,
      entityName: data.entity?.Name || data.entity?.name,
      entity: data.entity,
      owners: data.owners,
      owned: data.owned,
      fromAPI: true,
    };
  }

  // Return error state for client-side handling
  return {
    entityId,
    entityName: null,
    entity: null,
    owners: null,
    owned: null,
    fromAPI: false,
    apiError: data.error || 'Failed to load entity',
  };
}
