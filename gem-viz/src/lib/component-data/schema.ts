/**
 * Central data contract for GEM viz components.
 * Uses the Ownership Tracing API for ownership-related data.
 * Falls back to MotherDuck WASM for data not available via API.
 */

import * as ownershipAPI from '$lib/ownership-api';

// Dynamic import for MotherDuck (fallback for non-API data)
async function getMotherDuck() {
  const mod = await import('$lib/motherduck-wasm');
  return mod.default;
}

export interface AssetBasics {
  id: string;
  name: string;
  locationId: string | null;
  ownerEntityId: string | null;
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

interface ResolvedTables {
  assetTable: string;
  ownershipTable: string;
}

const TABLE_CACHE: Partial<ResolvedTables> = {};

// Discover the primary asset table (largest non-metadata table)
// Still needed for location-based queries not supported by API
async function resolveAssetTable(): Promise<string> {
  if (TABLE_CACHE.assetTable) return TABLE_CACHE.assetTable;

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<{
    schema_name: string;
    table_name: string;
  }>(`
    SELECT schema_name, table_name
    FROM catalog
    WHERE row_count > 100
      AND LOWER(table_name) NOT IN ('about', 'metadata', 'readme')
    ORDER BY row_count DESC
    LIMIT 1;
  `);

  if (!result.success || !result.data?.length) {
    TABLE_CACHE.assetTable = 'public.assets';
    return TABLE_CACHE.assetTable;
  }

  const { schema_name, table_name } = result.data[0];
  TABLE_CACHE.assetTable = `${schema_name}.${table_name}`;
  return TABLE_CACHE.assetTable;
}

// Discover ownership table (prefers names containing "ownership")
async function resolveOwnershipTable(): Promise<string> {
  if (TABLE_CACHE.ownershipTable) return TABLE_CACHE.ownershipTable;

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<{ schema_name: string; table_name: string }>(`
    SELECT schema_name, table_name
    FROM catalog
    WHERE LOWER(table_name) LIKE '%ownership%'
    ORDER BY row_count DESC
    LIMIT 1;
  `);

  if (!result.success || !result.data?.length) {
    TABLE_CACHE.ownershipTable = 'public.ownership';
    return TABLE_CACHE.ownershipTable;
  }

  const { schema_name, table_name } = result.data[0];
  TABLE_CACHE.ownershipTable = `${schema_name}.${table_name}`;
  return TABLE_CACHE.ownershipTable;
}

export async function getTables(): Promise<ResolvedTables> {
  const [assetTable, ownershipTable] = await Promise.all([
    resolveAssetTable(),
    resolveOwnershipTable(),
  ]);
  return { assetTable, ownershipTable };
}

/**
 * Fetch basic asset information
 * NOW USES: Ownership API GET /assets/{id}
 */
export async function fetchAssetBasics(assetId: string): Promise<AssetBasics | null> {
  try {
    const asset = await ownershipAPI.getAsset(assetId);

    return {
      id: asset.gem_unit_id,
      name: asset.facility_name || 'Unknown',
      locationId: null, // API doesn't return location ID
      ownerEntityId: asset.owner_entity_id || null,
      lat: asset.latitude || null,
      lon: asset.longitude || null,
      status: asset.status || null,
      tracker: asset.facility_type || null,
      capacityMw: typeof asset.capacity === 'number' ? asset.capacity : null,
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
    const graphDown = await ownershipAPI.getEntityGraphDown(ownerEntityId);

    // Filter to assets only (not entities), exclude the current asset
    const assets = graphDown.nodes
      .filter((n) => n.type === 'asset' && n.id !== excludeAssetId)
      .slice(0, 24)
      .map((n) => ({
        id: n.id,
        name: n.Name,
        locationId: null,
        ownerEntityId: ownerEntityId,
        lat: null,
        lon: null,
        status: null,
        tracker: null,
        capacityMw: null,
      }));

    return { success: true, data: assets };
  } catch (error) {
    console.warn(`[fetchSameOwnerAssets] API failed for ${ownerEntityId}:`, error);
    return { success: false, data: [] };
  }
}

/**
 * Fetch assets at the same location
 * STILL USES: MotherDuck (API doesn't support location-based queries)
 */
export async function fetchCoLocatedAssets(locationId: string, excludeAssetId: string) {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();
  return await motherduck.query<Record<string, unknown>>(`
    SELECT *
    FROM ${assetTable}
    WHERE "GEM location ID" = '${locationId}'
      AND "GEM unit ID" <> '${excludeAssetId}';
  `);
}

/**
 * Fetch owner statistics
 * NOW USES: Ownership API GET /entities/{id}/graph/down for asset count
 */
export async function fetchOwnerStats(ownerEntityId: string): Promise<OwnerStats | null> {
  try {
    const [entity, graphDown] = await Promise.all([
      ownershipAPI.getEntity(ownerEntityId),
      ownershipAPI.getEntityGraphDown(ownerEntityId),
    ]);

    // Count assets from graph
    const assets = graphDown.nodes.filter((n) => n.type === 'asset');

    // Get unique countries from asset names (API doesn't provide country directly)
    // This is a limitation - we'd need to fetch each asset for country info
    const countries = new Set<string>();
    // For now, estimate from entity headquarters
    if (entity['Headquarters Country']) {
      countries.add(entity['Headquarters Country']);
    }

    return {
      total_assets: assets.length,
      total_capacity_mw: null, // API doesn't aggregate capacity yet
      countries: countries.size || 1,
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
        const share = edge?.ownership_pct || null;

        chainNodes.push({
          id: node.id,
          name: node.Name,
          share,
          depth: depthMap.get(node.id) || 0,
        });
      }
    }

    // Sort by depth (ultimate parent first)
    return chainNodes.sort((a, b) => b.depth - a.depth);
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
    const [entity, graphDown] = await Promise.all([
      ownershipAPI.getEntity(ownerEntityId),
      ownershipAPI.getEntityGraphDown(ownerEntityId),
    ]);

    const ownerName = entity.Name || entity['Full Name'] || ownerEntityId;

    // Separate entities (subsidiaries) from assets
    const subsidiaryNodes = graphDown.nodes.filter(
      (n) => n.type === 'entity' && n.id !== ownerEntityId
    );
    const assetNodes = graphDown.nodes.filter((n) => n.type === 'asset');

    // Build edge lookup: source -> target -> percentage
    const edgeLookup = new Map<string, Map<string, number>>();
    for (const edge of graphDown.edges || []) {
      if (!edgeLookup.has(edge.source)) {
        edgeLookup.set(edge.source, new Map());
      }
      edgeLookup.get(edge.source)!.set(edge.target, edge.ownership_pct || 0);
    }

    // Build subsidiary data structures
    const subsidiariesMatched = new Map<string, AssetBasics[]>();
    const matchedEdges = new Map<string, { value: number | null }>();
    const entityMap = new Map<string, { id: string; Name: string; type: string }>();
    const directlyOwned: AssetBasics[] = [];

    // Add subsidiaries to entity map
    for (const sub of subsidiaryNodes) {
      entityMap.set(sub.id, { id: sub.id, Name: sub.Name, type: 'entity' });

      // Get ownership edge from spotlight owner to subsidiary
      const ownerEdges = edgeLookup.get(ownerEntityId);
      const share = ownerEdges?.get(sub.id) || null;
      matchedEdges.set(sub.id, { value: share });
      subsidiariesMatched.set(sub.id, []);
    }

    // Categorize assets: directly owned vs via subsidiary
    for (const assetNode of assetNodes) {
      const asset: AssetBasics = {
        id: assetNode.id,
        name: assetNode.Name,
        locationId: null,
        ownerEntityId: ownerEntityId,
        lat: null,
        lon: null,
        status: null,
        tracker: null,
        capacityMw: null,
      };

      // Find which entity owns this asset
      let ownerOfAsset: string | null = null;
      for (const [source, targets] of edgeLookup) {
        if (targets.has(assetNode.id)) {
          ownerOfAsset = source;
          break;
        }
      }

      if (ownerOfAsset && ownerOfAsset !== ownerEntityId && subsidiariesMatched.has(ownerOfAsset)) {
        // Owned via subsidiary
        subsidiariesMatched.get(ownerOfAsset)!.push(asset);
      } else {
        // Directly owned
        directlyOwned.push(asset);
      }
    }

    const allAssets = [...Array.from(subsidiariesMatched.values()).flat(), ...directlyOwned];

    return {
      spotlightOwner: { id: ownerEntityId, Name: ownerName },
      subsidiariesMatched,
      directlyOwned,
      matchedEdges,
      entityMap,
      assets: allAssets,
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
 * MotherDuck is only used for location-based queries.
 */
export const DATA_CONTRACT = {
  api: {
    base: 'Ownership Tracing API (configurable via PUBLIC_OWNERSHIP_API_URL)',
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
    motherduck: 'Used only for location-based queries (fetchCoLocatedAssets)',
  },
};
