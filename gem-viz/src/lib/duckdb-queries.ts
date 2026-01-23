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
}): Promise<{ success: boolean; data: GeoPoint[] }> {
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
export async function getAssetCoordinates(
  assetIds: string[]
): Promise<{ success: boolean; data: GeoPoint[] }> {
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
): Promise<{ success: boolean; data: FacetCount[] }> {
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
): Promise<{ success: boolean; data: FieldDistribution[] }> {
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
export async function getTrackerStats(): Promise<{
  success: boolean;
  data: TrackerStats[];
}> {
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
): Promise<{ success: boolean; data: Record<string, unknown>[] }> {
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
): Promise<{ success: boolean; data: FacetCount[] }> {
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
export async function resolveGPrefixId(
  gPrefixId: string
): Promise<string | null> {
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
