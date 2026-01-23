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
 * MIGRATION NOTES FOR REST API TEAM:
 * Each function documents the ideal REST endpoint that would replace it.
 * When an endpoint is added, update the function to use REST API instead.
 *
 * ============================================================================
 */

import { widgetQuery } from '$lib/widgets/widget-utils';
import type { QueryResult } from '$lib/duckdb-utils';

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
    conditions.push(`o."Tracker" = '${filters.tracker}'`);
  }
  if (filters?.status) {
    conditions.push(`o."Status" = '${filters.status}'`);
  }
  if (filters?.country) {
    conditions.push(`o."Country" = '${filters.country}'`);
  }

  const sql = `
    SELECT DISTINCT
      o."GEM unit ID" as id,
      o."Project" as name,
      l."Latitude" as lat,
      l."Longitude" as lon,
      o."Tracker" as tracker,
      o."Status" as status,
      o."Capacity (MW)" as capacity,
      o."Country" as country
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${conditions.join(' AND ')}
  `;

  return widgetQuery<GeoPoint>(sql);
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
      o."GEM unit ID" as id,
      o."Project" as name,
      l."Latitude" as lat,
      l."Longitude" as lon,
      o."Tracker" as tracker,
      o."Status" as status
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."GEM unit ID" IN (${idList})
      AND l."Latitude" IS NOT NULL
  `;

  return widgetQuery<GeoPoint>(sql);
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
  const sql = `
    SELECT
      "${field}" as value,
      COUNT(DISTINCT "GEM unit ID") as count
    FROM ownership
    WHERE "${field}" IS NOT NULL
    GROUP BY "${field}"
    ORDER BY count DESC
  `;

  return widgetQuery<FacetCount>(sql);
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
    conditions.push(`"Tracker" IN (${list})`);
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
    SELECT COUNT(DISTINCT "GEM unit ID") as count
    FROM ownership
    WHERE ${conditions.join(' AND ')}
  `;

  const result = await widgetQuery<{ count: number }>(sql);
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
    WHERE "Tracker" = '${tracker}'
    GROUP BY "${fieldName}"
    ORDER BY count DESC
  `;

  return widgetQuery<FieldDistribution>(sql);
}

/**
 * Get row count for a tracker
 *
 * REST API equivalent needed:
 *   GET /trackers/{tracker}/count
 */
export async function getTrackerRowCount(tracker: string): Promise<number> {
  const sql = `
    SELECT COUNT(*) as count
    FROM ownership
    WHERE "Tracker" = '${tracker}'
  `;

  const result = await widgetQuery<{ count: number }>(sql);
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
  const sql = `
    SELECT
      "Tracker" as tracker,
      COUNT(DISTINCT "GEM unit ID") as assetCount,
      SUM(COALESCE("Capacity (MW)", 0)) as totalCapacity,
      COUNT(DISTINCT CASE WHEN "Status" = 'operating' THEN "GEM unit ID" END) as operatingCount,
      COUNT(DISTINCT CASE WHEN "Status" IN ('announced', 'construction', 'permitted', 'pre-permit') THEN "GEM unit ID" END) as proposedCount
    FROM ownership
    WHERE "Tracker" IS NOT NULL
    GROUP BY "Tracker"
    ORDER BY assetCount DESC
  `;

  return widgetQuery<TrackerStats>(sql);
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
 */
export async function getOwnerAssets(
  ownerEntityId: string
): Promise<QueryResult<Record<string, unknown>>> {
  const sql = `
    SELECT
      "GEM unit ID" as id,
      "Project" as name,
      "Tracker" as tracker,
      "Status" as status,
      "Capacity (MW)" as capacity,
      "Country" as country,
      "Share" as ownershipShare
    FROM ownership
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
    ORDER BY "Tracker", "Status", "Project"
  `;

  return widgetQuery<Record<string, unknown>>(sql);
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
      "Country" as value,
      COUNT(DISTINCT "GEM unit ID") as count
    FROM ownership
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
      AND "Country" IS NOT NULL
    GROUP BY "Country"
    ORDER BY count DESC
  `;

  return widgetQuery<FacetCount>(sql);
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
    WHERE "GEM unit ID" = '${gPrefixId}'
    LIMIT 1
  `;

  const result = await widgetQuery<{ locationId: string }>(sql);
  if (result.success && result.data?.[0]?.locationId) {
    return `${result.data[0].locationId}_${gPrefixId}`;
  }
  return null;
}

// ============================================================================
// WIDGET QUERIES
// ============================================================================
// REST API WISHLIST: GET /stats/top-owners, GET /stats/status-distribution
// These power dashboard widgets with aggregated statistics
// ============================================================================

export interface TopOwnerResult {
  owner_name: string;
  entity_id: string;
  value: number;
  asset_count: number;
}

/**
 * Get top owners by asset count or capacity
 *
 * REST API equivalent needed:
 *   GET /stats/top-owners?metric=assets&limit=10
 *   GET /stats/top-owners?metric=capacity&tracker=Coal+Plant
 */
export async function getTopOwners(options: {
  limit?: number;
  metric?: 'assets' | 'capacity';
  tracker?: string | null;
}): Promise<QueryResult<TopOwnerResult>> {
  const { limit = 10, metric = 'assets', tracker = null } = options;
  const trackerFilter = tracker ? `AND "Tracker" = '${tracker}'` : '';
  const capacityCol = metric === 'capacity' ? 'SUM(COALESCE("Capacity (MW)", 0))' : 'COUNT(*)';

  const sql = `
    SELECT
      "Owner" as owner_name,
      "Owner GEM Entity ID" as entity_id,
      ${capacityCol} as value,
      COUNT(DISTINCT "GEM unit ID") as asset_count
    FROM ownership
    WHERE "Owner" IS NOT NULL AND "Owner" != ''
    ${trackerFilter}
    GROUP BY "Owner", "Owner GEM Entity ID"
    ORDER BY value DESC
    LIMIT ${limit}
  `;

  return widgetQuery<TopOwnerResult>(sql);
}

export interface StatusCount {
  status: string;
  count: number;
}

/**
 * Get status distribution (raw counts before regrouping)
 *
 * REST API equivalent needed:
 *   GET /stats/status-distribution
 *   GET /stats/status-distribution?tracker=Coal+Plant
 */
export async function getStatusDistribution(
  tracker?: string | null
): Promise<QueryResult<StatusCount>> {
  const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';

  const sql = `
    SELECT
      "Status" as status,
      COUNT(DISTINCT "GEM unit ID") as count
    FROM ownership
    ${trackerFilter}
    GROUP BY "Status"
    ORDER BY count DESC
  `;

  return widgetQuery<StatusCount>(sql);
}

export interface CountryCount {
  country: string;
  asset_count: number;
  total_capacity: number;
}

/**
 * Get assets by country breakdown
 *
 * REST API equivalent needed:
 *   GET /stats/by-country?limit=15
 *   GET /stats/by-country?tracker=Coal+Plant
 */
export async function getCountryBreakdown(options: {
  limit?: number;
  tracker?: string | null;
}): Promise<QueryResult<CountryCount>> {
  const { limit = 15, tracker = null } = options;
  const trackerFilter = tracker ? `WHERE o."Tracker" = '${tracker}'` : '';

  const sql = `
    SELECT
      COALESCE(l."Country.Area", 'Unknown') as country,
      COUNT(DISTINCT o."GEM unit ID") as asset_count,
      SUM(COALESCE(o."Capacity (MW)", 0)) as total_capacity
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    ${trackerFilter}
    GROUP BY 1
    ORDER BY asset_count DESC
    LIMIT ${limit}
  `;

  return widgetQuery<CountryCount>(sql);
}

// ============================================================================
// INVESTIGATION MAP QUERIES
// ============================================================================
// REST API WISHLIST: POST /assets/locations { entityIds: [...], assetIds: [...] }
// Returns locations for assets owned by entities or specific asset IDs
// ============================================================================

export interface InvestigationLocation {
  asset_id: string;
  name: string;
  tracker: string;
  status: string;
  lat: number;
  lng: number;
  country: string;
  capacity: number | null;
  owner: string;
}

/**
 * Get asset locations for investigation map
 *
 * REST API equivalent needed:
 *   POST /assets/locations { entityIds: [...], assetIds: [...] }
 *
 * Used by InvestigationMap to show assets for selected entities
 */
export async function getInvestigationLocations(
  entityIds: string[],
  assetIds: string[]
): Promise<QueryResult<InvestigationLocation>> {
  if (entityIds.length === 0 && assetIds.length === 0) {
    return { success: true, data: [] };
  }

  const entityList =
    entityIds.length > 0 ? entityIds.map((id) => `'${id}'`).join(',') : "'__none__'";
  const assetList = assetIds.length > 0 ? assetIds.map((id) => `'${id}'`).join(',') : "'__none__'";

  const sql = `
    SELECT DISTINCT
      o."GEM unit ID" as asset_id,
      o."Project" as name,
      o."Tracker" as tracker,
      o."Status" as status,
      l."Latitude" as lat,
      l."Longitude" as lng,
      l."Country.Area" as country,
      TRY_CAST(o."Capacity (MW)" AS DOUBLE) as capacity,
      o."Owner" as owner
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE (o."Owner GEM Entity ID" IN (${entityList})
       OR o."GEM unit ID" IN (${assetList}))
      AND l."Latitude" IS NOT NULL
      AND l."Longitude" IS NOT NULL
    LIMIT 500
  `;

  return widgetQuery<InvestigationLocation>(sql);
}

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
    conditions.push(`"Tracker" = '${tracker.replace(/'/g, "''")}'`);
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
      COALESCE("GEM unit ID", "GEM Mine ID", "GEM Asset ID") as id,
      "Project" as name,
      "Status" as status,
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      CASE WHEN "Capacity (Mtpa)" IS NOT NULL THEN 'Mtpa' ELSE 'MW' END as capacityUnit,
      "Country" as country,
      "State" as state,
      "Owner" as owner,
      "Tracker" as tracker
    FROM ownership
    ${whereClause}
    ORDER BY ${sortCol} ${orderDir} NULLS LAST
    LIMIT ${limit}
  `;

  return widgetQuery<FactsheetAsset>(sql);
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
  const whereClause = tracker
    ? `WHERE "Tracker" = '${tracker.replace(/'/g, "''")}' AND COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`
    : `WHERE COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`;

  const sql = `
    SELECT DISTINCT
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      "Country" as country
    FROM ownership
    ${whereClause}
  `;

  return widgetQuery<CapacityData>(sql);
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
  const sql = `
    SELECT
      "${fieldName.replace(/"/g, '""')}" as value,
      COUNT(*) as count
    FROM ownership
    WHERE "Tracker" = '${tracker.replace(/'/g, "''")}'
    GROUP BY "${fieldName.replace(/"/g, '""')}"
    ORDER BY count DESC
    LIMIT ${limit}
  `;

  return widgetQuery<FieldDistribution>(sql);
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
      "GEM unit ID" as id,
      "Project" as name,
      "Tracker" as tracker,
      "Status" as status,
      "Capacity (MW)" as capacity,
      "Owner" as owner
    FROM ownership
    WHERE "GEM unit ID" = '${assetId.replace(/'/g, "''")}'
    LIMIT 1
  `;

  return widgetQuery<AssetFallbackData>(sql);
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
    WHERE "GEM unit ID" = '${assetId.replace(/'/g, "''")}'
      AND "Owner" IS NOT NULL
  `;

  return widgetQuery<AssetOwnerFallback>(sql);
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
    WHERE o."GEM unit ID" = '${assetId.replace(/'/g, "''")}'
      AND l."Latitude" IS NOT NULL
    LIMIT 1
  `;

  return widgetQuery<AssetLocationFallback>(sql);
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
  const sql = `
    SELECT DISTINCT
      "GEM unit ID" as id,
      "Project" as name,
      "Status" as status,
      "Capacity (Mtpa)" as capacity,
      "Country" as country,
      "State" as state,
      "Owner" as owner
    FROM ownership
    WHERE "Tracker" = '${tracker.replace(/'/g, "''")}'
    ORDER BY capacity DESC NULLS LAST
    LIMIT ${limit}
  `;

  return widgetQuery<SampleAsset>(sql);
}
