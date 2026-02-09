/**
 * DuckDB Queries - Internal API
 * ============================================================================
 *
 * Centralized DuckDB queries for features not yet supported by REST API.
 * This module serves as:
 *   1. Single source of truth for all DuckDB usage
 *   2. Documentation for REST API team (wishlist of needed endpoints)
 *   3. Easy migration path when REST API adds these features
 *
 * DATA SOURCE HIERARCHY:
 *   1. REST API (preferred) - not implemented here, see ownership-api.ts
 *   2. MotherDuck (cloud) - tried first by unifiedQuery for fresh data
 *   3. Local parquet (fallback) - used when MotherDuck unavailable
 *
 * See DATA_SOURCE_AUDIT.md for full wishlist of REST API endpoints needed.
 *
 * MIGRATION NOTES FOR REST API TEAM:
 * Each function documents the ideal REST endpoint that would replace it.
 * When an endpoint is added, update the function to use REST API instead.
 *
 * ============================================================================
 */

import { unifiedQuery, type UnifiedQueryResult } from '$lib/data/unified-query';
import type { QueryResult } from '$lib/duckdb-utils';
import { getAssetTypeForTracker } from '$lib/data-config/tracker-schema';
import { ASSET_ID_COALESCE, ASSET_ID_COALESCE_O } from '$lib/queries/constants';

// Re-export UnifiedQueryResult for consumers who want source metadata
export type { UnifiedQueryResult };

// ============================================================================
// ID COLUMN REFERENCE (verified 2026-01-28)
// ============================================================================
// Each tracker uses a DIFFERENT ID column for assets:
//
// | Tracker         | ID Column        | Prefix | Example        | Count  |
// |-----------------|------------------|--------|----------------|--------|
// | Coal Plant      | GEM unit ID      | G      | G100000100001  | 61,156 |
// | Gas Plant       | GEM unit ID      | G      | G100000105917  | 52,925 |
// | Gas Pipeline    | ProjectID        | P      | P1857          | 17,364 |
// | Coal Mine       | GEM Mine ID      | M      | M3356          |  8,561 |
// | Steel Plant     | Steel Plant ID   | P      | P100000120624  |  8,029 |
// | Bioenergy Power | GEM unit ID      | G      | G100000201467  |  5,022 |
// | Iron Mine       | GEM Asset ID     | P      | P100000128718  |  2,947 |
//
// P-prefix IDs vary in format:
//   - Gas Pipeline: short (P0061 to P7108)
//   - Steel Plant:  long  (P100000120xxx)
//   - Iron Mine:    long  (P100000128xxx)
//
// Entity IDs:      E prefix (E100000000650) - Owner GEM Entity ID
// Location IDs:    L prefix (L100000104254) - only for Coal/Gas/Bioenergy
//
// COALESCE covers 100% of rows (156,004 total, 0 orphans)
// Use ASSET_ID_COALESCE in queries to get the correct ID for any tracker.
// ============================================================================

// Re-export constants for backwards compatibility
export { ASSET_ID_COALESCE, ASSET_ID_COALESCE_O } from '$lib/queries/constants';

// ============================================================================
// TYPES
// ============================================================================

export interface GeoPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tracker?: string;
  status?: string;
  capacity?: number;
  country?: string;
}

export interface FacetCount {
  value: string;
  count: number;
}

export interface FieldDistribution {
  value: string | number | null;
  count: number;
}

export interface TrackerStats {
  tracker: string;
  assetCount: number;
  totalCapacity: number;
  operatingCount: number;
  proposedCount: number;
}

// ============================================================================
// MAP / GLOBE QUERIES
// ============================================================================
// REST API WISHLIST: GET /assets/geo?tracker=...&status=...&bounds=...
// Returns: Array of { id, name, lat, lon, tracker, status, capacity }
// ============================================================================

/**
 * Get all asset coordinates for globe/map visualization
 *
 * REST API equivalent needed:
 *   GET /assets/geo
 *   GET /assets/geo?tracker=Coal+Plant
 *   GET /assets/geo?bounds=lat1,lon1,lat2,lon2
 *
 * Returns ~50k points for full globe, needs to be fast
 */
export async function getAssetGeoPoints(filters?: {
  tracker?: string;
  status?: string;
  country?: string;
}): Promise<QueryResult<GeoPoint>> {
  const conditions: string[] = ['l."Latitude" IS NOT NULL'];

  if (filters?.tracker) {
    conditions.push(`o."Asset Type" = '${filters.tracker}'`);
  }
  if (filters?.status) {
    conditions.push(`o."Status" = '${filters.status}'`);
  }
  if (filters?.country) {
    conditions.push(`o."Country" = '${filters.country}'`);
  }

  const sql = `
    SELECT DISTINCT
      ${ASSET_ID_COALESCE_O} as id,
      o."Project" as name,
      l."Latitude" as lat,
      l."Longitude" as lon,
      o."Asset Type" as tracker,
      o."Status" as status,
      o."Capacity (MW)" as capacity,
      o."Country" as country
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${conditions.join(' AND ')}
  `;

  return unifiedQuery<GeoPoint>(sql);
}

/**
 * Get coordinates for specific asset IDs (for investigation maps)
 *
 * REST API equivalent needed:
 *   POST /assets/geo { ids: ["G123", "G456"] }
 *   or extend GET /assets/{id} to include lat/lon
 */
export async function getAssetCoordinates(assetIds: string[]): Promise<QueryResult<GeoPoint>> {
  if (assetIds.length === 0) {
    return { success: true, data: [] };
  }

  const idList = assetIds.map((id) => `'${id}'`).join(',');

  const sql = `
    SELECT DISTINCT
      ${ASSET_ID_COALESCE_O} as id,
      o."Project" as name,
      l."Latitude" as lat,
      l."Longitude" as lon,
      o."Asset Type" as tracker,
      o."Status" as status
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${ASSET_ID_COALESCE_O} IN (${idList})
      AND l."Latitude" IS NOT NULL
  `;

  return unifiedQuery<GeoPoint>(sql);
}

// ============================================================================
// FACETED FILTER QUERIES
// ============================================================================
// REST API WISHLIST: GET /facets?field=tracker (or /stats/facets)
// Returns: Array of { value, count } for building filter UIs
// ============================================================================

/**
 * Get facet counts for a field (for filter dropdowns)
 *
 * REST API equivalent needed:
 *   GET /facets/tracker
 *   GET /facets/status
 *   GET /facets/country
 *
 * Used in screener to show "Coal Plant (1,234)" style counts
 */
export async function getFacetCounts(
  field: 'Tracker' | 'Status' | 'Country'
): Promise<QueryResult<FacetCount>> {
  // Map 'Tracker' to actual column name 'Asset Type'
  const sqlField = field === 'Tracker' ? 'Asset Type' : field;
  const sql = `
    SELECT
      "${sqlField}" as value,
      COUNT(DISTINCT ${ASSET_ID_COALESCE}) as count
    FROM ownership
    WHERE "${sqlField}" IS NOT NULL
    GROUP BY "${sqlField}"
    ORDER BY count DESC
  `;

  return unifiedQuery<FacetCount>(sql);
}

/**
 * Get filtered asset count (for "X assets match" display)
 *
 * REST API equivalent needed:
 *   GET /assets/count?tracker=Coal+Plant&status=operating
 */
export async function getFilteredCount(filters: {
  trackers?: string[];
  statuses?: string[];
  countries?: string[];
}): Promise<number> {
  const conditions: string[] = ['1=1'];

  if (filters.trackers?.length) {
    const list = filters.trackers.map((t) => `'${t}'`).join(',');
    conditions.push(`"Asset Type" IN (${list})`);
  }
  if (filters.statuses?.length) {
    const list = filters.statuses.map((s) => `'${s}'`).join(',');
    conditions.push(`"Status" IN (${list})`);
  }
  if (filters.countries?.length) {
    const list = filters.countries.map((c) => `'${c}'`).join(',');
    conditions.push(`"Country" IN (${list})`);
  }

  const sql = `
    SELECT COUNT(DISTINCT ${ASSET_ID_COALESCE}) as count
    FROM ownership
    WHERE ${conditions.join(' AND ')}
  `;

  const result = await unifiedQuery<{ count: number }>(sql);
  return result.success ? result.data?.[0]?.count || 0 : 0;
}

// ============================================================================
// FACTSHEET / STATISTICS QUERIES
// ============================================================================
// REST API WISHLIST: GET /trackers/{tracker}/stats
// Returns: Field distributions, null counts, unique values
// ============================================================================

/**
 * Get field value distribution for factsheet
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/fields/{field}/distribution
 *
 * Shows what values exist and how common they are
 */
export async function getFieldDistribution(
  tracker: string,
  fieldName: string
): Promise<QueryResult<FieldDistribution>> {
  const sql = `
    SELECT
      "${fieldName}" as value,
      COUNT(*) as count
    FROM ownership
    WHERE "Asset Type" = '${tracker}'
    GROUP BY "${fieldName}"
    ORDER BY count DESC
  `;

  return unifiedQuery<FieldDistribution>(sql);
}

/**
 * Get row count for a tracker
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/count
 */
export async function getTrackerRowCount(tracker: string): Promise<number> {
  const assetType = getAssetTypeForTracker(tracker) || tracker;
  const sql = `
    SELECT COUNT(*) as count
    FROM ownership
    WHERE "Asset Type" = '${assetType}'
  `;

  const result = await unifiedQuery<{ count: number }>(sql);
  return result.success ? result.data?.[0]?.count || 0 : 0;
}

/**
 * Get tracker-level statistics
 *
 * REST API equivalent needed:
 *   GET /trackers/stats
 *   GET /stats/by-tracker
 */
export async function getTrackerStats(): Promise<QueryResult<TrackerStats>> {
  // Note: MotherDuck schema only has Asset Type, Asset ID, Asset Name, and owner info
  // Status and Capacity are not available
  const sql = `
    SELECT
      "Asset Type" as tracker,
      COUNT(DISTINCT ${ASSET_ID_COALESCE}) as assetCount,
      0 as totalCapacity,
      0 as operatingCount,
      0 as proposedCount
    FROM ownership
    WHERE "Asset Type" IS NOT NULL
    GROUP BY "Asset Type"
    ORDER BY assetCount DESC
  `;

  return unifiedQuery<TrackerStats>(sql);
}

// ============================================================================
// REPORT / EXPORT QUERIES
// ============================================================================
// REST API WISHLIST: GET /reports/owner-portfolio?entityId=...
// These are more complex analytical queries for reports
// ============================================================================

/**
 * Get assets for an owner (for report generation)
 *
 * REST API: Partially covered by GET /entities/{id}/graph/down
 * But reports need flattened tabular data, not graph structure
 *
 * Ideal endpoint:
 *   GET /entities/{id}/assets?format=table
 *
 * @param ownerEntityId - The owner entity ID
 * @param limit - Maximum number of assets to return (default: 500, max: 2000)
 * @param offset - Number of assets to skip for pagination (default: 0)
 */
export async function getOwnerAssets(
  ownerEntityId: string,
  limit = 500,
  offset = 0
): Promise<QueryResult<Record<string, unknown>>> {
  // Cap the limit to prevent memory issues
  const safeLimit = Math.min(limit, 2000);

  const sql = `
    SELECT
      ${ASSET_ID_COALESCE_O} as id,
      o."Project" as name,
      o."Asset Type" as tracker,
      o."Status" as status,
      o."Capacity (MW)" as capacity,
      COALESCE(l."Country.Area", 'Unknown') as country,
      o."Share" as ownershipShare
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."Owner GEM Entity ID" = '${ownerEntityId}'
    ORDER BY o."Asset Type", o."Status", o."Project"
    LIMIT ${safeLimit}
    OFFSET ${offset}
  `;

  return unifiedQuery<Record<string, unknown>>(sql);
}

/**
 * Get count of assets for an owner (for showing totals before loading all)
 */
export async function getOwnerAssetCount(ownerEntityId: string): Promise<number> {
  const sql = `
    SELECT COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as count
    FROM ownership o
    WHERE o."Owner GEM Entity ID" = '${ownerEntityId}'
  `;

  const result = await unifiedQuery<{ count: number }>(sql);
  return result.success ? result.data?.[0]?.count || 0 : 0;
}

/**
 * Get country breakdown for an owner
 *
 * REST API equivalent needed:
 *   GET /entities/{id}/stats/by-country
 */
export async function getOwnerCountryBreakdown(
  ownerEntityId: string
): Promise<QueryResult<FacetCount>> {
  const sql = `
    SELECT
      COALESCE(l."Country.Area", 'Unknown') as value,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as count
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."Owner GEM Entity ID" = '${ownerEntityId}'
      AND l."Country.Area" IS NOT NULL
    GROUP BY l."Country.Area"
    ORDER BY count DESC
  `;

  return unifiedQuery<FacetCount>(sql);
}

// ============================================================================
// ID RESOLUTION (needed until API handles all ID formats)
// ============================================================================

/**
 * Resolve G-prefix ID to compound L_G format for API
 *
 * REST API fix needed: Accept G-prefix IDs directly
 * This is a workaround for API expecting compound IDs
 */
export async function resolveGPrefixId(gPrefixId: string): Promise<string | null> {
  if (!gPrefixId.startsWith('G')) {
    return gPrefixId;
  }

  const sql = `
    SELECT DISTINCT "GEM location ID" as locationId
    FROM ownership
    WHERE ${ASSET_ID_COALESCE} = '${gPrefixId}'
    LIMIT 1
  `;

  const result = await unifiedQuery<{ locationId: string }>(sql);
  if (result.success && result.data?.[0]?.locationId) {
    return `${result.data[0].locationId}_${gPrefixId}`;
  }
  return null;
}

// Widget Queries - moved to $lib/queries/widget-queries.ts
export {
  getTopOwners,
  getStatusDistribution,
  getCountryBreakdown,
  type TopOwnerResult,
  type StatusCount,
  type CountryCount,
} from '$lib/queries/widget-queries';

// Investigation Map Queries - moved to $lib/queries/investigation-map.ts
export { getInvestigationLocations, type InvestigationLocation } from '$lib/queries/investigation-map';

// ============================================================================
// FACTSHEET QUERIES
// ============================================================================
// REST API WISHLIST: GET /trackers/{tracker}/assets, GET /trackers/{tracker}/capacities
// These power the factsheet pages with tracker-specific data
// ============================================================================

export interface FactsheetAsset {
  id: string;
  name: string;
  status: string;
  capacity: number | null;
  capacityUnit: string;
  country: string;
  state: string;
  owner: string;
  tracker: string;
  startYear: number | null;
  technology: string | null;
  mineType: string | null;
}

/**
 * Get assets for factsheet with optional filtering
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/assets?sortBy=capacity&limit=10
 */
export async function getFactsheetAssets(options: {
  tracker?: string | null;
  statusFilter?: string[] | null;
  sortBy?: 'capacity' | 'age' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}): Promise<QueryResult<FactsheetAsset>> {
  const { tracker, statusFilter, sortBy = 'capacity', sortOrder = 'desc', limit = 10 } = options;

  const conditions: string[] = [];
  if (tracker) {
    const assetType = getAssetTypeForTracker(tracker) || tracker;
    conditions.push(`"Asset Type" = '${assetType.replace(/'/g, "''")}'`);
  }
  if (statusFilter && statusFilter.length > 0) {
    const escaped = statusFilter.map((s) => `'${s.toLowerCase().replace(/'/g, "''")}'`).join(', ');
    conditions.push(`LOWER("Status") IN (${escaped})`);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortColumns: Record<string, string> = {
    capacity: 'COALESCE("Capacity (MW)", "Capacity (Mtpa)")',
    age: '"Start year"',
    name: '"Project"',
  };
  const sortCol = sortColumns[sortBy] || sortColumns.capacity;
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT DISTINCT
      "Asset ID" as id,
      "Project" as name,
      "Status" as status,
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      CASE WHEN "Capacity (Mtpa)" IS NOT NULL THEN 'Mtpa' ELSE 'MW' END as capacityUnit,
      "Country" as country,
      "State" as state,
      "Owner" as owner,
      "Asset Type" as tracker,
      "Start year" as startYear,
      "Technology" as technology,
      "Mine type" as mineType
    FROM ownership
    ${whereClause}
    ORDER BY ${sortCol} ${orderDir} NULLS LAST
    LIMIT ${limit}
  `;

  return unifiedQuery<FactsheetAsset>(sql);
}

export interface CapacityData {
  capacity: number;
  country: string;
}

/**
 * Get all capacities for percentile calculations
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/capacities
 */
export async function getCapacities(tracker?: string | null): Promise<QueryResult<CapacityData>> {
  const assetType = tracker ? getAssetTypeForTracker(tracker) || tracker : null;
  const whereClause = assetType
    ? `WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}' AND COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`
    : `WHERE COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`;

  const sql = `
    SELECT DISTINCT
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      "Country" as country
    FROM ownership
    ${whereClause}
  `;

  return unifiedQuery<CapacityData>(sql);
}

/**
 * Get field statistics with limit
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/fields/{field}/stats?limit=100
 */
export async function getFieldStats(
  tracker: string,
  fieldName: string,
  limit = 100
): Promise<QueryResult<FieldDistribution>> {
  const assetType = getAssetTypeForTracker(tracker) || tracker;
  const sql = `
    SELECT
      "${fieldName.replace(/"/g, '""')}" as value,
      COUNT(*) as count
    FROM ownership
    WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
    GROUP BY "${fieldName.replace(/"/g, '""')}"
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return unifiedQuery<FieldDistribution>(sql);
}

// ============================================================================
// ASSET FALLBACK QUERIES (when REST API fails)
// ============================================================================
// These provide DuckDB fallback for asset detail pages
// ============================================================================

export interface AssetFallbackData {
  id: string;
  name: string;
  tracker: string;
  status: string;
  capacity: number | null;
  owner: string;
}

export interface AssetOwnerFallback {
  ownerName: string;
  ownerEntityId: string;
  share: number | null;
  ownershipPath: string;
}

export interface AssetLocationFallback {
  latitude: number;
  longitude: number;
  country: string;
}

/**
 * Get asset details fallback
 *
 * Used when REST API is unavailable
 */
export async function getAssetFallback(assetId: string): Promise<QueryResult<AssetFallbackData>> {
  const sql = `
    SELECT DISTINCT
      ${ASSET_ID_COALESCE} as id,
      "Project" as name,
      "Asset Type" as tracker,
      "Status" as status,
      "Capacity (MW)" as capacity,
      "Owner" as owner
    FROM ownership
    WHERE ${ASSET_ID_COALESCE} = '${assetId.replace(/'/g, "''")}'
    LIMIT 1
  `;

  return unifiedQuery<AssetFallbackData>(sql);
}

/**
 * Get asset owners fallback
 *
 * Used when REST API is unavailable
 */
export async function getAssetOwnersFallback(
  assetId: string
): Promise<QueryResult<AssetOwnerFallback>> {
  const sql = `
    SELECT
      "Owner" as ownerName,
      "Owner GEM Entity ID" as ownerEntityId,
      "Share" as share,
      "Ownership Path" as ownershipPath
    FROM ownership
    WHERE ${ASSET_ID_COALESCE} = '${assetId.replace(/'/g, "''")}'
      AND "Owner" IS NOT NULL
  `;

  return unifiedQuery<AssetOwnerFallback>(sql);
}

/**
 * Get asset location fallback
 *
 * Used when REST API is unavailable
 */
export async function getAssetLocationFallback(
  assetId: string
): Promise<QueryResult<AssetLocationFallback>> {
  const sql = `
    SELECT
      l."Latitude" as latitude,
      l."Longitude" as longitude,
      l."Country.Area" as country
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${ASSET_ID_COALESCE_O} = '${assetId.replace(/'/g, "''")}'
      AND l."Latitude" IS NOT NULL
    LIMIT 1
  `;

  return unifiedQuery<AssetLocationFallback>(sql);
}

// ============================================================================
// SAMPLE ASSETS QUERY (for factsheet pages)
// ============================================================================

export interface SampleAsset {
  id: string;
  name: string;
  status: string;
  capacity: number | null;
  country: string;
  state: string;
  owner: string;
}

/**
 * Get sample assets for a tracker (largest by capacity)
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/sample?limit=5
 */
export async function getSampleAssets(
  tracker: string,
  limit = 5
): Promise<QueryResult<SampleAsset>> {
  const assetType = getAssetTypeForTracker(tracker) || tracker;
  const sql = `
    SELECT DISTINCT
      ${ASSET_ID_COALESCE} as id,
      "Asset Name" as name,
      "Status" as status,
      "Capacity" as capacity,
      "Country" as country,
      "State/Province" as state,
      "Immediate Owner Entity Name" as owner
    FROM ownership
    WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
    ORDER BY capacity DESC NULLS LAST
    LIMIT ${limit}
  `;

  return unifiedQuery<SampleAsset>(sql);
}

// ============================================================================
// TRACKER PAGE QUERIES
// ============================================================================
// REST API WISHLIST: GET /trackers/{tracker}/countries, GET /trackers/{tracker}/top-owners
// These power the /tracker/[slug] pages with tracker-specific breakdowns
// ============================================================================

export interface TrackerCountryBreakdown {
  country: string;
  assetCount: number;
  totalCapacity: number;
}

/**
 * Get top countries for a tracker
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/countries?limit=10
 */
export async function getTrackerCountryBreakdown(
  _tracker: string,
  _limit = 10
): Promise<QueryResult<TrackerCountryBreakdown>> {
  // Note: MotherDuck schema doesn't have country data
  // Return empty result
  return {
    success: true,
    data: [],
  };
}

export interface TrackerTopOwner {
  ownerName: string;
  entityId: string;
  assetCount: number;
  totalCapacity: number;
}

/**
 * Get top owners for a tracker
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/top-owners?limit=5
 */
export async function getTrackerTopOwners(
  tracker: string,
  limit = 5
): Promise<QueryResult<TrackerTopOwner>> {
  const assetType = getAssetTypeForTracker(tracker) || tracker;
  const sql = `
    SELECT
      "Immediate Owner Entity Name" as ownerName,
      "Immediate Owner Entity ID" as entityId,
      COUNT(DISTINCT ${ASSET_ID_COALESCE}) as assetCount,
      0 as totalCapacity
    FROM ownership
    WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
      AND "Immediate Owner Entity Name" IS NOT NULL
      AND "Immediate Owner Entity Name" != ''
    GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
    ORDER BY assetCount DESC
    LIMIT ${limit}
  `;

  return unifiedQuery<TrackerTopOwner>(sql);
}

export interface TrackerFieldSchema {
  fieldName: string;
  uniqueCount: number;
  nullCount: number;
  totalCount: number;
  sampleValues: string[];
}

/**
 * Get schema information for a tracker - all fields with unique value counts
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/schema
 *
 * NOTE: MotherDuck schema is limited. Only these fields exist:
 * - Asset Type, Asset ID, Asset Unit ID, Asset Name
 * - Immediate Owner Entity ID, Immediate Owner Entity Name
 * - % Share of Ownership
 */
export async function getTrackerSchema(tracker: string): Promise<QueryResult<TrackerFieldSchema>> {
  const assetType = getAssetTypeForTracker(tracker) || tracker;
  // Only analyze fields that exist in the MotherDuck schema
  const fieldsToAnalyze = [
    'Asset Type',
    'Asset Name',
    'Immediate Owner Entity Name',
    '% Share of Ownership',
  ];

  const fieldQueries = fieldsToAnalyze.map(
    (field) => `
    SELECT
      '${field}' as fieldName,
      COUNT(DISTINCT "${field}") as uniqueCount,
      SUM(CASE WHEN "${field}" IS NULL THEN 1 ELSE 0 END) as nullCount,
      COUNT(*) as totalCount
    FROM ownership
    WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
  `
  );

  const sql = fieldQueries.join(' UNION ALL ');

  const result = await unifiedQuery<Omit<TrackerFieldSchema, 'sampleValues'>>(sql);

  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  // Filter to fields that actually exist (uniqueCount > 0 or have data)
  const fieldsWithData = result.data.filter((f) => f.uniqueCount > 0 || f.nullCount < f.totalCount);

  return {
    success: true,
    data: fieldsWithData.map((f) => ({ ...f, sampleValues: [] })),
  };
}

export interface FieldEnumValue {
  value: string;
  count: number;
  percentage: number;
}

/**
 * Get enum values for a specific field in a tracker
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/fields/{field}/values
 *
 * NOTE: Only fields in the ownership table schema will return data.
 */
export async function getTrackerFieldValues(
  tracker: string,
  fieldName: string,
  limit = 20
): Promise<QueryResult<FieldEnumValue>> {
  // Whitelist of fields available in the ownership table
  const validFields = [
    'Asset Type',
    'Asset Name',
    'Immediate Owner Entity Name',
    '% Share of Ownership',
    'Status',
    'Country',
    'Capacity (MW)',
    'Capacity (Mtpa)',
    'Nominal crude steel capacity (ttpa)',
    'Nominal iron capacity (ttpa)',
    'CapacityBcm/y',
    'Project',
    'Owner',
    'Start year',
    'Fuel type',
    'Technology',
    'Mine type',
    'Feedstock',
  ];

  if (!validFields.includes(fieldName)) {
    // Field doesn't exist in ownership table schema
    return { success: true, data: [] };
  }

  const assetType = getAssetTypeForTracker(tracker) || tracker;
  const sql = `
    WITH total AS (
      SELECT COUNT(*) as total_rows
      FROM ownership
      WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
    )
    SELECT
      COALESCE(CAST("${fieldName.replace(/"/g, '""')}" AS VARCHAR), '(null)') as value,
      COUNT(*) as count,
      ROUND(COUNT(*) * 100.0 / MAX(total.total_rows), 1) as percentage
    FROM ownership, total
    WHERE "Asset Type" = '${assetType.replace(/'/g, "''")}'
    GROUP BY "${fieldName.replace(/"/g, '""')}"
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return unifiedQuery<FieldEnumValue>(sql);
}
