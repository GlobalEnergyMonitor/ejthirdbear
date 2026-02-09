/**
 * Data Layer - Central Hub
 * =========================
 *
 * All data fetching flows through this module. Import from here, not individual files.
 *
 * ```typescript
 * import { getAsset, getTopOwners, unifiedQuery } from '$lib/data';
 * ```
 *
 * ## Data Sources
 *
 * | Source      | Module                | Use Case                    | Freshness  |
 * |-------------|-----------------------|-----------------------------|------------|
 * | REST API    | $lib/ownership-api    | Ownership, entities, assets | Real-time  |
 * | MotherDuck  | $lib/data/unified-query | Bulk queries, analytics   | Hours      |
 *
 * ## Query Routing
 *
 * - Ownership/entity/asset lookups → REST API (ownership-api.ts)
 * - Bulk analytics (facets, stats, geo) → unifiedQuery() → MotherDuck
 *
 * ## REST API Wishlist (queries to migrate from MotherDuck)
 *
 * | Query Function          | Ideal Endpoint                          | Priority |
 * |-------------------------|-----------------------------------------|----------|
 * | getAssetGeoPoints()     | GET /assets/geo                         | HIGH     |
 * | getFacetCounts()        | GET /facets/{field}                     | HIGH     |
 * | getFilteredCount()      | GET /assets/count                       | HIGH     |
 * | getTopOwners()          | GET /stats/top-owners                   | MED      |
 * | getOwnerAssets()        | GET /entities/{id}/assets               | HIGH     |
 * | getTrackerStats()       | GET /trackers/stats                     | MED      |
 * | getStatusDistribution() | GET /stats/status-distribution          | LOW      |
 * | getCountryBreakdown()   | GET /stats/by-country                   | LOW      |
 *
 * When REST API adds these endpoints, update duckdb-queries.ts to use REST.
 */

// =============================================================================
// UNIFIED QUERY (MotherDuck - no local fallback)
// =============================================================================

export {
  unifiedQuery,
  getMotherDuckStatus,
  resetMotherDuckStatus,
  disableMotherDuck,
  TABLES,
  type UnifiedQueryResult,
  type DataSource,
} from './unified-query';

// =============================================================================
// REST API CLIENT (Primary for ownership data)
// =============================================================================

export {
  // Entity operations
  listEntities,
  getEntity,
  getEntityOwners,
  getEntityOwned,
  traceEntityUp,
  traceEntityDown,
  getEntityGraphUp,
  getEntityGraphDown,
  // Asset operations
  listAssets,
  getAsset,
  // Universal graph
  getOwnershipGraph,
  // ID resolution
  resolveAssetId,
  // Types
  type EntitySummary,
  type AssetSummary,
  type DirectOwnership,
  type DirectOwned,
  type GraphNode,
  type GraphEdge,
  type OwnershipGraphResponse,
  type EntityGraphResponse,
  type PaginatedResponse,
} from '$lib/ownership-api';

// =============================================================================
// BULK QUERIES (via unifiedQuery - MotherDuck preferred)
// =============================================================================

export {
  // Map/Globe
  getAssetGeoPoints,
  getAssetCoordinates,
  getInvestigationLocations,
  // Faceted filtering
  getFacetCounts,
  getFilteredCount,
  // Statistics
  getFieldDistribution,
  getTrackerRowCount,
  getTrackerStats,
  // Reports
  getOwnerAssets,
  getOwnerAssetCount,
  getOwnerCountryBreakdown,
  // Widgets
  getTopOwners,
  getStatusDistribution,
  getCountryBreakdown,
  // Factsheet
  getFactsheetAssets,
  getCapacities,
  getFieldStats,
  getSampleAssets,
  // Fallbacks (when REST API fails)
  getAssetFallback,
  getAssetOwnersFallback,
  getAssetLocationFallback,
  // ID utilities
  resolveGPrefixId,
  ASSET_ID_COALESCE,
  // Types
  type GeoPoint,
  type FacetCount,
  type FieldDistribution,
  type TrackerStats,
  type TopOwnerResult,
  type StatusCount,
  type CountryCount,
  type InvestigationLocation,
  type FactsheetAsset,
  type SampleAsset,
} from '$lib/duckdb-queries';

// =============================================================================
// SMART ASSET FETCHER (API → MotherDuck fallback)
// =============================================================================

export {
  fetchAssetData,
  isCompoundId,
  isGPrefixId,
  isMPrefixId,
  extractUnitId,
  type AssetDataResult,
} from '$lib/asset-data';
