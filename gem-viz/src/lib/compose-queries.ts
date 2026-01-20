/**
 * Compose Page Query Functions
 * Extracted from compose/+page.svelte for better organization
 */

import { browser } from '$app/environment';

type WidgetQuery = (
  _sql: string
) => Promise<{ success: boolean; data?: unknown[]; error?: string }>;
type InitWidgetDB = () => Promise<void>;

let widgetQuery: WidgetQuery;
let initWidgetDB: InitWidgetDB;

async function ensureDB() {
  if (!browser) return false;
  if (!widgetQuery) {
    const utils = await import('$lib/widgets/widget-utils');
    widgetQuery = utils.widgetQuery;
    initWidgetDB = utils.initWidgetDB;
    await initWidgetDB();
  }
  return true;
}

// ============================================================================
// Types
// ============================================================================

export interface FacetOption {
  value: string;
  count: number;
}

export interface RangeData {
  min: number;
  max: number;
}

export interface ColumnNames {
  tracker: string | null;
  status: string | null;
  country: string | null;
  ownerCountry: string | null;
  owner: string | null;
  project: string | null;
  capacity: string | null;
  share: string | null;
  startYear: string | null;
}

// ============================================================================
// Schema Queries
// ============================================================================

export async function fetchOwnershipColumns(): Promise<string[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'ownership'
    ORDER BY ordinal_position
  `);

  return ((result.data as { column_name: string }[]) || [])
    .map((r) => r.column_name)
    .filter(Boolean);
}

export function deriveColumnNames(columns: string[]): ColumnNames {
  const columnSet = new Set(columns);
  const startYearColumn = columnSet.has('Start Year')
    ? 'Start Year'
    : columnSet.has('Start year')
      ? 'Start year'
      : null;

  return {
    tracker: columnSet.has('Tracker') ? 'Tracker' : null,
    status: columnSet.has('Status') ? 'Status' : null,
    country: null,
    ownerCountry: columnSet.has('Owner Headquarters Country') ? 'Owner Headquarters Country' : null,
    owner: columnSet.has('Owner') ? 'Owner' : null,
    project: columnSet.has('Project') ? 'Project' : null,
    capacity: columnSet.has('Capacity (MW)') ? 'Capacity (MW)' : null,
    share: columnSet.has('Share') ? 'Share' : null,
    startYear: startYearColumn,
  };
}

// ============================================================================
// Facet Queries
// ============================================================================

// Deduplicated locations subquery - locations table has duplicate GEM.location.ID values
// which causes JOIN multiplication. Use this subquery to get one row per location ID.
const LOCATIONS_DEDUP = `(
  SELECT * FROM locations
  QUALIFY ROW_NUMBER() OVER (PARTITION BY "GEM.location.ID" ORDER BY "GEM.location.ID") = 1
)`;

export async function fetchCountries(): Promise<FacetOption[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT l."Country.Area" as value, COUNT(*) as cnt
    FROM ownership o
    LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
    GROUP BY l."Country.Area"
    ORDER BY cnt DESC
  `);

  return ((result.data as { value: string; cnt: number }[]) || [])
    .map((r) => ({ value: r.value, count: r.cnt }))
    .filter((r) => r.value);
}

export async function fetchOwnerCountries(): Promise<FacetOption[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT DISTINCT "Owner Headquarters Country" as value, COUNT(*) as cnt
    FROM ownership
    WHERE "Owner Headquarters Country" IS NOT NULL AND "Owner Headquarters Country" != ''
    GROUP BY "Owner Headquarters Country"
    ORDER BY cnt DESC
  `);

  return ((result.data as { value: string; cnt: number }[]) || [])
    .map((r) => ({ value: r.value, count: r.cnt }))
    .filter((r) => r.value);
}

export async function fetchOwners(limit = 1000): Promise<FacetOption[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT DISTINCT "Owner" as value, COUNT(*) as cnt
    FROM ownership
    WHERE "Owner" IS NOT NULL AND "Owner" != ''
    GROUP BY "Owner"
    ORDER BY cnt DESC
    LIMIT ${limit}
  `);

  return ((result.data as { value: string; cnt: number }[]) || [])
    .map((r) => ({ value: r.value, count: r.cnt }))
    .filter((r) => r.value);
}

export async function fetchTrackers(): Promise<FacetOption[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT DISTINCT "Tracker" as value, COUNT(*) as cnt
    FROM ownership
    WHERE "Tracker" IS NOT NULL
    GROUP BY "Tracker"
    ORDER BY cnt DESC
  `);

  return ((result.data as { value: string; cnt: number }[]) || []).map((r) => ({
    value: r.value,
    count: r.cnt,
  }));
}

export async function fetchStatuses(): Promise<FacetOption[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    SELECT DISTINCT "Status" as value, COUNT(*) as cnt
    FROM ownership
    WHERE "Status" IS NOT NULL
    GROUP BY "Status"
    ORDER BY cnt DESC
  `);

  return ((result.data as { value: string; cnt: number }[]) || []).map((r) => ({
    value: r.value,
    count: r.cnt,
  }));
}

// ============================================================================
// Range Queries
// ============================================================================

export async function fetchCapacityRange(): Promise<RangeData> {
  if (!(await ensureDB())) return { min: 0, max: 10000 };

  const result = await widgetQuery(`
    SELECT MIN(TRY_CAST("Capacity (MW)" AS DOUBLE)) as min_val,
           MAX(TRY_CAST("Capacity (MW)" AS DOUBLE)) as max_val
    FROM ownership
    WHERE TRY_CAST("Capacity (MW)" AS DOUBLE) IS NOT NULL
  `);

  const row = (result.data as { min_val: number; max_val: number }[])?.[0];
  return {
    min: Math.floor(Number(row?.min_val) || 0),
    max: Math.ceil(Number(row?.max_val) || 10000),
  };
}

export async function fetchStartYearRange(): Promise<RangeData> {
  if (!(await ensureDB())) return { min: 1950, max: 2035 };

  // Check if "Start Year" column exists (not all trackers have it)
  try {
    const result = await widgetQuery(`
      SELECT MIN(TRY_CAST("Start Year" AS INTEGER)) as min_val,
             MAX(TRY_CAST("Start Year" AS INTEGER)) as max_val
      FROM ownership
      WHERE TRY_CAST("Start Year" AS INTEGER) IS NOT NULL
        AND TRY_CAST("Start Year" AS INTEGER) > 1900
        AND TRY_CAST("Start Year" AS INTEGER) < 2100
    `);

    const row = (result.data as { min_val: number; max_val: number }[])?.[0];
    return {
      min: Number(row?.min_val) || 1950,
      max: Number(row?.max_val) || 2035,
    };
  } catch {
    // Column doesn't exist in the current data
    return { min: 1950, max: 2035 };
  }
}

export async function fetchCapacityHistogram(buckets = 20): Promise<number[]> {
  if (!(await ensureDB())) return [];

  const result = await widgetQuery(`
    WITH capacity_stats AS (
      SELECT MIN(TRY_CAST("Capacity (MW)" AS DOUBLE)) as min_cap,
             MAX(TRY_CAST("Capacity (MW)" AS DOUBLE)) as max_cap
      FROM ownership
      WHERE TRY_CAST("Capacity (MW)" AS DOUBLE) IS NOT NULL
    ),
    buckets AS (
      SELECT FLOOR((TRY_CAST("Capacity (MW)" AS DOUBLE) - min_cap) / NULLIF((max_cap - min_cap) / ${buckets}, 0)) as bucket,
             COUNT(*) as cnt
      FROM ownership, capacity_stats
      WHERE TRY_CAST("Capacity (MW)" AS DOUBLE) IS NOT NULL
      GROUP BY bucket
    )
    SELECT bucket, cnt FROM buckets WHERE bucket IS NOT NULL ORDER BY bucket
  `);

  const bucketData = new Array(buckets).fill(0);
  for (const row of (result.data as { bucket: number; cnt: number }[]) || []) {
    const idx = Math.min(buckets - 1, Math.max(0, Number(row.bucket) || 0));
    bucketData[idx] = Number(row.cnt) || 0;
  }
  return bucketData;
}

// ============================================================================
// Parametric Count Queries (for faceted filtering)
// ============================================================================

export async function fetchParametricCounts(whereClause: string): Promise<{
  trackers: FacetOption[];
  statuses: FacetOption[];
  countries: FacetOption[];
  ownerCountries: FacetOption[];
  owners: FacetOption[];
}> {
  if (!(await ensureDB())) {
    return { trackers: [], statuses: [], countries: [], ownerCountries: [], owners: [] };
  }

  const [trackerResult, statusResult, countryResult, ownerCountryResult, ownerResult] =
    await Promise.all([
      widgetQuery(`
        SELECT o."Tracker" as value, COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
        GROUP BY o."Tracker"
        ORDER BY cnt DESC
      `),
      widgetQuery(`
        SELECT o."Status" as value, COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
        GROUP BY o."Status"
        ORDER BY cnt DESC
      `),
      widgetQuery(`
        SELECT l."Country.Area" as value, COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
          AND l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
        GROUP BY l."Country.Area"
        ORDER BY cnt DESC
      `),
      widgetQuery(`
        SELECT o."Owner Headquarters Country" as value, COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
          AND o."Owner Headquarters Country" IS NOT NULL AND o."Owner Headquarters Country" != ''
        GROUP BY o."Owner Headquarters Country"
        ORDER BY cnt DESC
      `),
      widgetQuery(`
        SELECT o."Owner" as value, COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
          AND o."Owner" IS NOT NULL AND o."Owner" != ''
        GROUP BY o."Owner"
        ORDER BY cnt DESC
        LIMIT 1000
      `),
    ]);

  const toFacets = (data: unknown[]): FacetOption[] =>
    ((data as { value: string; cnt: number }[]) || [])
      .map((r) => ({ value: r.value, count: r.cnt }))
      .filter((r) => r.value);

  return {
    trackers: toFacets(trackerResult.data || []),
    statuses: toFacets(statusResult.data || []),
    countries: toFacets(countryResult.data || []),
    ownerCountries: toFacets(ownerCountryResult.data || []),
    owners: toFacets(ownerResult.data || []),
  };
}

// ============================================================================
// Results Query
// ============================================================================

export interface AssetResult {
  asset_id: string;
  name: string;
  tracker: string;
  status: string;
  country: string;
  capacity_mw: number | null;
  start_year: number | null;
  owner: string;
  owner_id: string;
}

export async function fetchResults(
  whereClause: string,
  columnNames: ColumnNames,
  limit = 50,
  offset = 0
): Promise<{ results: AssetResult[]; totalCount: number }> {
  if (!(await ensureDB())) return { results: [], totalCount: 0 };

  const capacitySelect = columnNames.capacity
    ? `TRY_CAST(o."${columnNames.capacity}" AS DOUBLE) as capacity_mw`
    : 'NULL::DOUBLE as capacity_mw';
  const startYearSelect = columnNames.startYear
    ? `TRY_CAST(o."${columnNames.startYear}" AS INTEGER) as start_year`
    : 'NULL::INTEGER as start_year';

  const [countResult, dataResult] = await Promise.all([
    widgetQuery(`
      SELECT COUNT(*) as cnt
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
    `),
    widgetQuery(`
      SELECT DISTINCT
        o."GEM unit ID" as asset_id,
        o."Project" as name,
        o."Tracker" as tracker,
        o."Status" as status,
        l."Country.Area" as country,
        ${capacitySelect},
        ${startYearSelect},
        o."Owner" as owner,
        o."Owner GEM Entity ID" as owner_id
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
      ORDER BY capacity_mw DESC NULLS LAST
      LIMIT ${limit}
      OFFSET ${offset}
    `),
  ]);

  if (!countResult.success || !dataResult.success) {
    throw new Error(countResult.error || dataResult.error || 'Query failed');
  }

  return {
    results: (dataResult.data as AssetResult[]) || [],
    totalCount: Number((countResult.data as { cnt: number }[])?.[0]?.cnt || 0),
  };
}

// ============================================================================
// Tracker Column Availability
// ============================================================================

export interface TrackerColumnInfo {
  hasCapacity: boolean;
  hasStartYear: boolean;
  hasShare: boolean;
}

export async function fetchTrackerColumnInfo(
  trackers: string[],
  columnNames: ColumnNames
): Promise<Record<string, TrackerColumnInfo>> {
  if (!(await ensureDB())) return {};

  const columnInfo: Record<string, TrackerColumnInfo> = {};

  for (const tracker of trackers) {
    const escapedTracker = tracker.replace(/'/g, "''");
    const capacitySelect = columnNames.capacity
      ? `COUNT(CASE WHEN TRY_CAST(o."${columnNames.capacity}" AS DOUBLE) IS NOT NULL THEN 1 END) as has_capacity`
      : '0 as has_capacity';
    const startYearSelect = columnNames.startYear
      ? `COUNT(CASE WHEN TRY_CAST(o."${columnNames.startYear}" AS INTEGER) IS NOT NULL THEN 1 END) as has_start_year`
      : '0 as has_start_year';
    const shareSelect = columnNames.share
      ? `COUNT(CASE WHEN o."${columnNames.share}" IS NOT NULL THEN 1 END) as has_share`
      : '0 as has_share';

    const result = await widgetQuery(`
      SELECT ${capacitySelect}, ${startYearSelect}, ${shareSelect}
      FROM ownership o
      WHERE o."Tracker" = '${escapedTracker}'
    `);

    if (result.success && result.data?.[0]) {
      const row = result.data[0] as {
        has_capacity: number;
        has_start_year: number;
        has_share: number;
      };
      columnInfo[tracker] = {
        hasCapacity: Number(row.has_capacity) > 0,
        hasStartYear: Number(row.has_start_year) > 0,
        hasShare: Number(row.has_share) > 0,
      };
    }
  }

  return columnInfo;
}

// ============================================================================
// Asset Metadata Lookup
// ============================================================================

export interface AssetMetadata {
  id: string;
  name: string;
  tracker: string | null;
  status: string | null;
  country: string | null;
}

/**
 * Fetch metadata for a list of asset IDs from DuckDB.
 * Useful for enriching API data that doesn't include tracker/status/country.
 *
 * @param assetIds - Array of GEM unit IDs to look up
 * @returns Map of asset ID -> metadata
 */
export async function fetchAssetMetadata(assetIds: string[]): Promise<Map<string, AssetMetadata>> {
  const metadataMap = new Map<string, AssetMetadata>();

  if (!assetIds.length || !(await ensureDB())) {
    return metadataMap;
  }

  // Escape and format IDs for SQL IN clause
  const escapedIds = assetIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');

  const result = await widgetQuery(`
    SELECT DISTINCT
      o."GEM unit ID" as id,
      o."Project" as name,
      o."Tracker" as tracker,
      o."Status" as status,
      l."Country.Area" as country
    FROM ownership o
    LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."GEM unit ID" IN (${escapedIds})
  `);

  if (result.success && result.data) {
    for (const row of result.data as Array<{
      id: string;
      name: string;
      tracker: string | null;
      status: string | null;
      country: string | null;
    }>) {
      metadataMap.set(row.id, {
        id: row.id,
        name: row.name || row.id,
        tracker: row.tracker || null,
        status: row.status || null,
        country: row.country || null,
      });
    }
  }

  return metadataMap;
}
