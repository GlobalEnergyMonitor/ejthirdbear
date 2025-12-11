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
      COALESCE("Project", "Unit Name", "Name", 'Unknown') AS name,
      "GEM location ID" AS locationId,
      "Owner GEM Entity ID" AS ownerEntityId,
      CAST("Latitude" AS DOUBLE) AS lat,
      CAST("Longitude" AS DOUBLE) AS lon,
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

export async function fetchCoordinatesByLocation(locationId: string): Promise<{
  lat: number | null;
  lon: number | null;
} | null> {
  const { assetTable } = await getTables();

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<{ lat: number | null; lon: number | null }>(`
    SELECT
      CAST(FIRST("Latitude") AS DOUBLE) AS lat,
      CAST(FIRST("Longitude") AS DOUBLE) AS lon
    FROM ${assetTable}
    WHERE "GEM location ID" = '${locationId}'
    LIMIT 1;
  `);

  if (!result.success || !result.data?.length) return null;
  return result.data[0];
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
      COUNT(DISTINCT "Country.Area") AS countries
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}';
  `);

  if (!result.success || !result.data?.length) return null;
  return result.data[0];
}

export async function fetchOwnershipChain(assetId: string): Promise<OwnershipChainNode[]> {
  const { ownershipTable } = await getTables();

  const motherduck = await getMotherDuck();
  const result = await motherduck.query<OwnershipChainNode>(`
    WITH RECURSIVE edges AS (
      SELECT
        o."Interested Party ID" AS parent,
        o."Subject Entity ID" AS child,
        CAST(o."% Share of Ownership" AS DOUBLE) AS share,
        LIST_VALUE(o."Subject Entity ID") AS visited,
        1 AS depth
      FROM ${ownershipTable} o
      WHERE o."GEM unit ID" = '${assetId}'
        OR o."Asset ID" = '${assetId}'
        OR o."ProjectID" = '${assetId}'

      UNION ALL

      SELECT
        o."Interested Party ID" AS parent,
        o."Subject Entity ID" AS child,
        CAST(o."% Share of Ownership" AS DOUBLE) AS share,
        LIST_APPEND(e.visited, o."Subject Entity ID") AS visited,
        e.depth + 1 AS depth
      FROM ${ownershipTable} o
      JOIN edges e ON o."Subject Entity ID" = e.parent
      WHERE NOT (o."Subject Entity ID" = ANY(e.visited))
    )
    SELECT
      child AS id,
      child AS name,
      share,
      depth
    FROM edges
    ORDER BY depth ASC;
  `);

  if (!result.success || !result.data) return [];
  return result.data;
}

/**
 * Build an owner portfolio: subsidiaries, directly owned assets, and edges.
 */
export async function fetchOwnerPortfolio(ownerEntityId: string): Promise<OwnerPortfolio | null> {
  const { assetTable, ownershipTable } = await getTables();
  const motherduck = await getMotherDuck();

  // Get owner display name from assets table (fallback to ID)
  const ownerNameResult = await motherduck.query<{ owner: string | null }>(`
    SELECT FIRST("Owner") AS owner
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
    LIMIT 1;
  `);
  const ownerName = ownerNameResult.success ? ownerNameResult.data?.[0]?.owner : null;

  // Subsidiary assets via ownership edges
  const viaSubsResult = await motherduck.query<{
    subsidiary_id: string;
    share: number | null;
    asset_id: string;
    name: string | null;
    tracker: string | null;
    status: string | null;
    location_id: string | null;
  }>(`
    WITH subs AS (
      SELECT DISTINCT
        o."Subject Entity ID" AS subsidiary_id,
        CAST(FIRST(o."% Share of Ownership") OVER (PARTITION BY o."Subject Entity ID") AS DOUBLE) AS share
      FROM ${ownershipTable} o
      WHERE o."Interested Party ID" = '${ownerEntityId}'
    )
    SELECT
      subs.subsidiary_id,
      subs.share,
      a."GEM unit ID" AS asset_id,
      a."Project" AS name,
      a."Tracker" AS tracker,
      a."Status" AS status,
      a."GEM location ID" AS location_id,
      CAST(a."Capacity (MW)" AS DOUBLE) AS capacity_mw,
      CAST(a."Latitude" AS DOUBLE) AS lat,
      CAST(a."Longitude" AS DOUBLE) AS lon
    FROM subs
    JOIN ${assetTable} a ON a."Owner GEM Entity ID" = subs.subsidiary_id;
  `);

  if (!viaSubsResult.success) return null;

  // Directly owned assets (owner is immediate owner)
  const directResult = await motherduck.query<{
    asset_id: string;
    name: string | null;
    tracker: string | null;
    status: string | null;
    location_id: string | null;
    capacity_mw: number | null;
    lat: number | null;
    lon: number | null;
  }>(`
    SELECT
      "GEM unit ID" AS asset_id,
      "Project" AS name,
      "Tracker" AS tracker,
      "Status" AS status,
      "GEM location ID" AS location_id,
      CAST("Capacity (MW)" AS DOUBLE) AS capacity_mw,
      CAST("Latitude" AS DOUBLE) AS lat,
      CAST("Longitude" AS DOUBLE) AS lon
    FROM ${assetTable}
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}';
  `);

  if (!directResult.success) return null;

  // Entity names for subsidiaries (if available)
  const entityResult = await motherduck.query<{ id: string }>(`
    SELECT DISTINCT
      "Subject Entity ID" AS id
    FROM ${ownershipTable}
    WHERE "Interested Party ID" = '${ownerEntityId}';
  `);

  const subsidiariesMatched = new Map<string, AssetBasics[]>();
  const matchedEdges = new Map<string, { value: number | null }>();
  const entityMap = new Map<string, { id: string; Name: string; type: string }>();

  viaSubsResult.data?.forEach((row) => {
    if (!subsidiariesMatched.has(row.subsidiary_id)) {
      subsidiariesMatched.set(row.subsidiary_id, []);
      matchedEdges.set(row.subsidiary_id, { value: row.share });
    }
    subsidiariesMatched.get(row.subsidiary_id)!.push({
      id: row.asset_id,
      name: row.name || row.asset_id,
      tracker: row.tracker,
      status: row.status,
      locationId: row.location_id,
      ownerEntityId: row.subsidiary_id,
      lat: row.lat,
      lon: row.lon,
      capacityMw: row.capacity_mw,
    });
  });

  const directlyOwned = (directResult.data || []).map((row) => ({
    id: row.asset_id,
    name: row.name || row.asset_id,
    tracker: row.tracker,
    status: row.status,
    locationId: row.location_id,
    ownerEntityId: ownerEntityId,
    lat: row.lat,
    lon: row.lon,
    capacityMw: row.capacity_mw,
  }));

  const allAssets = [
    ...Array.from(subsidiariesMatched.values()).flat(),
    ...directlyOwned,
  ];

  entityResult.data?.forEach((row) => {
    entityMap.set(row.id, {
      id: row.id,
      Name: row.id,
      type: 'entity',
    });
  });

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
 */
export const DATA_CONTRACT = {
  tables: {
    assetTable: 'Primary asset facts table (cols: "GEM unit ID", "Project", "Tracker", "Status", "Capacity (MW)", "GEM location ID", "Latitude", "Longitude", "Owner GEM Entity ID")',
    ownershipTable:
      'Ownership edges table (cols: "Interested Party ID", "Subject Entity ID", "% Share of Ownership", "GEM unit ID"/"Asset ID"/"ProjectID")',
  },
  endpoints: {
    assetBasics: 'GET /assets/:id -> AssetBasics',
    assetRelated: 'GET /assets/:id/related -> {sameOwnerAssets[], coLocatedAssets[]}',
    ownershipChain: 'GET /assets/:id/ownership-chain -> OwnershipChainNode[]',
    ownerStats: 'GET /owners/:id/stats -> OwnerStats',
    mapTiles:
      'GET /map/tiles?west&east&south&north -> [{lon,lat,id,name,status}] limited set for viewport',
  },
};
