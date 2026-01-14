/**
 * Central data contract for GEM viz components.
 * Uses the Ownership Tracing API for ownership-related data.
 */

import * as ownershipAPI from '$lib/ownership-api';

export interface AssetBasics {
  id: string;
  name: string;
  locationId: string | null;
  ownerEntityId: string | null;
  ownerName?: string | null;
  lat: number | null;
  lon: number | null;
  status: string | null;
  tracker: string | null;
  capacityMw: number | null;
}

export interface OwnershipChainNode {
  id: string;
  name: string;
  share: number | null;
  depth: number;
}

export interface OwnerPortfolio {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, AssetBasics[]>;
  directlyOwned: AssetBasics[];
  matchedEdges: Map<string, { value: number | null }>;
  entityMap: Map<string, { id: string; Name: string; type: string }>;
  assets: AssetBasics[];
}

export interface OwnerStats {
  total_assets: number;
  total_capacity_mw: number | null;
  countries: number;
}

/**
 * Fetch basic asset information
 * NOW USES: Ownership API GET /assets/{id}
 */
export async function fetchAssetBasics(assetId: string): Promise<AssetBasics | null> {
  try {
    const asset = await ownershipAPI.getAsset(assetId);

    return {
      id: asset.id,
      name: asset.name || asset.id,
      locationId: null, // API doesn't return location ID
      ownerEntityId: asset.ownerEntityId || asset.parentEntityId || null,
      ownerName: asset.ownerName || asset.parentName || null,
      lat: asset.latitude || null,
      lon: asset.longitude || null,
      status: asset.status || null,
      tracker: asset.facilityType || null,
      capacityMw: asset.capacity,
    };
  } catch (error) {
    console.warn(`[fetchAssetBasics] API failed for ${assetId}, error:`, error);
    return null;
  }
}

export async function fetchCoordinatesByLocation(_locationId: string): Promise<{
  lat: number | null;
  lon: number | null;
} | null> {
  // Note: Coordinates are stored in the GeoJSON file (static/points.geojson).
  // Return null - the AssetMap component will fall back to GeoJSON lookup.
  return null;
}

/**
 * Fetch assets owned by the same entity
 * NOW USES: Ownership API GET /entities/{id}/graph/down
 */
export async function fetchSameOwnerAssets(
  ownerEntityId: string,
  excludeAssetId: string
): Promise<{ success: boolean; data: AssetBasics[] }> {
  try {
    console.warn(`[fetchSameOwnerAssets] API does not expose assets for entity ${ownerEntityId}`);
    return { success: true, data: [] };
  } catch (error) {
    console.warn(`[fetchSameOwnerAssets] API failed for ${ownerEntityId}:`, error);
    return { success: false, data: [] };
  }
}

/**
 * Fetch assets at the same location
 * NOTE: Ownership API doesn't support location-based queries yet.
 */
export async function fetchCoLocatedAssets(_locationId: string, _excludeAssetId: string) {
  console.warn('[fetchCoLocatedAssets] API does not expose co-located asset queries.');
  return { success: true, data: [] };
}

/**
 * Fetch owner statistics
 * NOW USES: Ownership API GET /entities/{id}/graph/down for asset count
 */
export async function fetchOwnerStats(ownerEntityId: string): Promise<OwnerStats | null> {
  try {
    const entity = await ownershipAPI.getEntity(ownerEntityId);
    const countries = new Set<string>();
    if (entity.headquartersCountry) {
      countries.add(entity.headquartersCountry);
    }

    return {
      total_assets: 0,
      total_capacity_mw: null,
      countries: countries.size || 0,
    };
  } catch (error) {
    console.warn(`[fetchOwnerStats] API failed for ${ownerEntityId}:`, error);
    return null;
  }
}

/**
 * Fetch ownership chain for an asset (trace upward to ultimate owners)
 * NOW USES: Ownership API GET /ownership/graph?root={id}&direction=up
 */
export async function fetchOwnershipChain(assetId: string): Promise<OwnershipChainNode[]> {
  try {
    const graph = await ownershipAPI.getOwnershipGraph({
      root: assetId,
      direction: 'up',
      max_depth: 10,
    });

    // Convert graph nodes to chain format
    const chainNodes: OwnershipChainNode[] = [];
    const seenIds = new Set<string>();

    // Build depth map from edges
    const depthMap = new Map<string, number>();
    depthMap.set(assetId, 0);

    // BFS to calculate depths
    const queue = [assetId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depthMap.get(current) || 0;

      for (const edge of graph.edges || []) {
        if (edge.target === current && !depthMap.has(edge.source)) {
          depthMap.set(edge.source, currentDepth + 1);
          queue.push(edge.source);
        }
      }
    }

    // Convert nodes to chain format
    for (const node of graph.nodes) {
      if (node.type === 'entity' && !seenIds.has(node.id)) {
        seenIds.add(node.id);

        // Find edge to get ownership percentage
        const edge = graph.edges?.find((e) => e.source === node.id);
        const share = edge?.value ?? null;

        chainNodes.push({
          id: node.id,
          name: node.Name,
          share,
          depth: depthMap.get(node.id) || 0,
        });
      }
    }

    // Sort by depth (ultimate parent first)
    const ordered = chainNodes.sort((a, b) => b.depth - a.depth);

    // Append the asset itself as the terminal node
    const assetNode = graph.nodes.find((n) => n.type === 'asset' && n.id === assetId);
    ordered.push({
      id: assetId,
      name: assetNode?.Name || assetId,
      share: null,
      depth: 0,
    });

    return ordered;
  } catch (error) {
    console.warn(`[fetchOwnershipChain] API failed for ${assetId}:`, error);
    return [];
  }
}

/**
 * Build an owner portfolio: subsidiaries, directly owned assets, and edges.
 * NOW USES: Ownership API GET /entities/{id}/graph/down
 */
export async function fetchOwnerPortfolio(ownerEntityId: string): Promise<OwnerPortfolio | null> {
  try {
    const [entity, owned] = await Promise.all([
      ownershipAPI.getEntity(ownerEntityId),
      ownershipAPI.getEntityOwned(ownerEntityId),
    ]);

    const ownerName = entity.name || ownerEntityId;
    const subsidiariesMatched = new Map<string, AssetBasics[]>();
    const matchedEdges = new Map<string, { value: number | null }>();
    const entityMap = new Map<string, { id: string; Name: string; type: string }>();

    for (const sub of owned) {
      subsidiariesMatched.set(sub.entityId, []);
      matchedEdges.set(sub.entityId, { value: sub.ownershipPct ?? null });
      entityMap.set(sub.entityId, { id: sub.entityId, Name: sub.entityName, type: 'entity' });
    }

    return {
      spotlightOwner: { id: ownerEntityId, Name: ownerName },
      subsidiariesMatched,
      directlyOwned: [],
      matchedEdges,
      entityMap,
      assets: [],
    };
  } catch (error) {
    console.warn(`[fetchOwnerPortfolio] API failed for ${ownerEntityId}:`, error);
    return null;
  }
}

/**
 * Exported contract summary (for backend/docs).
 *
 * This now primarily uses the Ownership Tracing API.
 * Ownership API is the primary source; location-based queries are not supported yet.
 */
export const DATA_CONTRACT = {
  api: {
    base: 'Ownership Tracing API (configurable via PUBLIC_OWNERSHIP_API_BASE_URL)',
    endpoints: {
      getAsset: 'GET /assets/{id} -> Asset details',
      getEntity: 'GET /entities/{id} -> Entity details',
      getEntityOwners: 'GET /entities/{id}/owners -> Direct owners with %',
      getEntityOwned: 'GET /entities/{id}/owned -> Directly owned entities',
      getEntityGraphDown: 'GET /entities/{id}/graph/down -> Full ownership graph',
      getOwnershipGraph: 'GET /ownership/graph?root={id}&direction=up|down -> Universal graph',
    },
  },
  fallback: {
    apiLimitations: 'Location-based and portfolio asset queries are not available via API yet.',
  },
};
