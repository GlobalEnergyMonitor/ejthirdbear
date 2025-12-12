/**
 * Central data contract for GEM viz components.
 * Each component pulls its own data from MotherDuck using these helpers.
 * Keep SQL here so frontend + backend share the same contract.
 */

// Dynamic import to avoid SSR issues (Worker is not defined in Node.js)
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
    // Fallback to known table name
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

export async function fetchAssetBasics(assetId: string): Promise<AssetBasics | null> {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<AssetBasics>(`
    SELECT
      "GEM unit ID" AS id,
      COALESCE("Project", 'Unknown') AS name,
      "GEM location ID" AS locationId,
      "Owner GEM Entity ID" AS ownerEntityId,
      NULL AS lat,
      NULL AS lon,
      "Status" AS status,
      "Tracker" AS tracker,
      CAST("Capacity (MW)" AS DOUBLE) AS capacityMw
    FROM ${assetTable}
    WHERE "GEM unit ID" = '${assetId}'
    LIMIT 1;
  `);

  if (!result.success || !result.data?.length) return null;
  return result.data[0];
}

export async function fetchCoordinatesByLocation(_locationId: string): Promise<{
  lat: number | null;
  lon: number | null;
} | null> {
  // Note: This table doesn't have Latitude/Longitude columns.
  // Coordinates are stored in the GeoJSON file (static/points.geojson).
  // Return null - the AssetMap component will fall back to GeoJSON lookup.
  return null;
}

export async function fetchSameOwnerAssets(ownerEntityId: string, excludeAssetId: string) {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();
  return await motherduck.query<Record<string, unknown>>(`
    SELECT *
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
      AND "GEM unit ID" <> '${excludeAssetId}'
    ORDER BY "Capacity (MW)" DESC NULLS LAST
    LIMIT 24;
  `);
}

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

export async function fetchOwnerStats(ownerEntityId: string): Promise<OwnerStats | null> {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<OwnerStats>(`
    SELECT
      COUNT(DISTINCT "GEM unit ID") AS total_assets,
      SUM(CAST("Capacity (MW)" AS DOUBLE)) AS total_capacity_mw,
      COUNT(DISTINCT "Parent Headquarters Country") AS countries
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}';
  `);

  if (!result.success || !result.data?.length) return null;
  return result.data[0];
}

export async function fetchOwnershipChain(assetId: string): Promise<OwnershipChainNode[]> {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();

  // Get ownership paths for this asset
  const result = await motherduck.query<{ ownership_path: string | null; share: number | null }>(`
    SELECT
      "Ownership Path" AS ownership_path,
      CAST("Share" AS DOUBLE) AS share
    FROM ${assetTable}
    WHERE "GEM unit ID" = '${assetId}'
    LIMIT 10;
  `);

  if (!result.success || !result.data?.length) return [];

  // Parse ownership paths into chain nodes
  // Format: "Parent [50%] -> Subsidiary [75%] -> Asset [100%]"
  const chainNodes: OwnershipChainNode[] = [];
  const seenIds = new Set<string>();

  for (const row of result.data) {
    if (!row.ownership_path) continue;

    const segments = row.ownership_path.split(' -> ');
    segments.forEach((segment, i) => {
      const match = segment.match(/^(.+?)\s*\[([^\]]+)\]$/);
      const name = match ? match[1].trim() : segment.trim();
      const pctStr = match ? match[2].trim() : null;
      const share = pctStr && pctStr !== 'unknown %' ? parseFloat(pctStr) : null;
      const id = name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);

      if (!seenIds.has(id)) {
        seenIds.add(id);
        chainNodes.push({
          id,
          name,
          share,
          depth: segments.length - 1 - i,
        });
      }
    });
  }

  // Sort by depth (ultimate parent first)
  return chainNodes.sort((a, b) => b.depth - a.depth);
}

/**
 * Build an owner portfolio: subsidiaries, directly owned assets, and edges.
 *
 * Note: This database embeds ownership in asset records (no separate edge table).
 * We derive subsidiaries by parsing "Ownership Path" strings.
 */
export async function fetchOwnerPortfolio(ownerEntityId: string): Promise<OwnerPortfolio | null> {
  const { assetTable } = await getTables();
  const motherduck = await getMotherDuck();

  // Get owner display name from assets table using "Parent" column
  const ownerNameResult = await motherduck.query<{ owner: string | null }>(`
    SELECT FIRST("Parent") AS owner
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
       OR "Immediate Project Owner GEM Entity ID" = '${ownerEntityId}'
    LIMIT 1;
  `);
  const ownerName = ownerNameResult.success ? ownerNameResult.data?.[0]?.owner : null;

  // Get all assets owned by this entity - search multiple ownership columns
  // to find assets where this entity is: ultimate parent, immediate owner, or ANYWHERE in the chain
  // Also search by name since Ownership Path contains names, not IDs
  const searchName = ownerName ? ownerName.replace(/'/g, "''") : null;

  const assetsResult = await motherduck.query<{
    asset_id: string;
    name: string | null;
    tracker: string | null;
    status: string | null;
    location_id: string | null;
    capacity_mw: number | null;
    lat: number | null;
    lon: number | null;
    share: number | null;
    ownership_path: string | null;
    immediate_owner: string | null;
    immediate_owner_id: string | null;
    parent_entity_id: string | null;
  }>(`
    SELECT
      "GEM unit ID" AS asset_id,
      "Project" AS name,
      "Tracker" AS tracker,
      "Status" AS status,
      "GEM location ID" AS location_id,
      CAST("Capacity (MW)" AS DOUBLE) AS capacity_mw,
      NULL AS lat,
      NULL AS lon,
      CAST("Share" AS DOUBLE) AS share,
      "Ownership Path" AS ownership_path,
      "Immediate Project Owner" AS immediate_owner,
      "Immediate Project Owner GEM Entity ID" AS immediate_owner_id,
      "Owner GEM Entity ID" AS parent_entity_id
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
       OR "Immediate Project Owner GEM Entity ID" = '${ownerEntityId}'
       OR "Ownership Path" LIKE '%${ownerEntityId}%'
       ${searchName ? `OR "Ownership Path" LIKE '%${searchName}%'` : ''};
  `);

  if (!assetsResult.success) return null;

  const subsidiariesMatched = new Map<string, AssetBasics[]>();
  const matchedEdges = new Map<string, { value: number | null }>();
  const entityMap = new Map<string, { id: string; Name: string; type: string }>();
  const directlyOwned: AssetBasics[] = [];

  // Group assets by immediate owner (subsidiary) vs directly owned
  assetsResult.data?.forEach((row) => {
    const asset: AssetBasics = {
      id: row.asset_id,
      name: row.name || row.asset_id,
      tracker: row.tracker,
      status: row.status,
      locationId: row.location_id,
      ownerEntityId: row.immediate_owner_id || ownerEntityId,
      lat: row.lat,
      lon: row.lon,
      capacityMw: row.capacity_mw,
    };

    // If immediate owner differs from our spotlight owner, it's via subsidiary
    if (row.immediate_owner_id && row.immediate_owner_id !== ownerEntityId) {
      const subId = row.immediate_owner_id;
      if (!subsidiariesMatched.has(subId)) {
        subsidiariesMatched.set(subId, []);
        matchedEdges.set(subId, { value: row.share });
        entityMap.set(subId, {
          id: subId,
          Name: row.immediate_owner || subId,
          type: 'entity',
        });
      }
      subsidiariesMatched.get(subId)!.push(asset);
    } else {
      directlyOwned.push(asset);
    }
  });

  const allAssets = [...Array.from(subsidiariesMatched.values()).flat(), ...directlyOwned];

  return {
    spotlightOwner: { id: ownerEntityId, Name: ownerName || ownerEntityId },
    subsidiariesMatched,
    directlyOwned,
    matchedEdges,
    entityMap,
    assets: allAssets,
  };
}

/**
 * Exported contract summary (for backend/docs).
 *
 * Note: This GEM coal plant dataset embeds ownership in asset records via "Ownership Path" strings.
 * There is no separate ownership edges table - ownership is derived from parsing path strings.
 */
export const DATA_CONTRACT = {
  tables: {
    assetTable:
      'Primary asset facts table (cols: "GEM unit ID", "Project", "Tracker", "Status", "Capacity (MW)", "GEM location ID", "Owner GEM Entity ID", "Parent", "Ownership Path", "Share", "Immediate Project Owner", "Immediate Project Owner GEM Entity ID", "Parent Headquarters Country")',
  },
  endpoints: {
    assetBasics: 'GET /assets/:id -> AssetBasics',
    assetRelated: 'GET /assets/:id/related -> {sameOwnerAssets[], coLocatedAssets[]}',
    ownershipChain: 'GET /assets/:id/ownership-chain -> OwnershipChainNode[] (parsed from Ownership Path)',
    ownerStats: 'GET /owners/:id/stats -> OwnerStats',
    ownerPortfolio: 'GET /owners/:id/portfolio -> OwnerPortfolio (assets grouped by immediate owner)',
  },
};
