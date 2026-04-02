/**
 * GEM Data Configuration Module
 *
 * Central registry for:
 * - Tracker schema and status taxonomy (tracker-schema.ts)
 * - Asset class definitions and rules (asset-classes.ts)
 * - Data source documentation (data-sources.ts)
 */

// Export tracker schema (single source of truth)
export {
  TRACKERS,
  TRACKER_TO_ASSET_TYPE,
  TRACKER_ID_FIELD,
  API_SLUG_TO_TYPE,
  API_TYPE_TO_SLUG,
  API_TYPE_TO_TRACKER,
  TRACKER_TO_URL_SLUG,
  URL_SLUG_TO_TRACKER,
  IDENTIFIER_TO_API_SLUG,
  getAssetTypeForTracker,
  getIdFieldForTracker,
  isValidTracker,
  STATUS_VALUES,
  STATUS_GROUPS,
  STATUS_TO_GROUP,
  STATUS_GROUP_DESCRIPTIONS,
  STATUS_VALUE_DESCRIPTIONS,
  FOSSIL_TRACKERS,
  PROSPECTIVE_STATUSES,
  OPERATING_STATUSES,
  PLANNED_STATUSES,
  CANCELLED_STATUSES,
  RETIRED_STATUSES,
  STATUS_GROUP_ORDER,
  getStatusGroupId,
  discoverStatusGroups,
  normalizeSubStatus,
  matchesStatusFilter,
  COUNTRIES,
  initFromApi,
  getApiTaxonomy,
  fetchLiveCountries,
  type TrackerName,
  type StatusValue,
  type StatusGroup,
  type DynamicStatusGroup,
  type Country,
} from './tracker-schema';

// Export asset class definitions and matching logic
export {
  getAssetClass,
  getAssetClassesForTracker,
  getAssetClassesForRecord,
  getRelevantFieldsForClass,
  buildFieldsForAssetClass,
  allAssetClasses,
  assetClassMetadata,
  type AssetClassDefinition,
  type AssetClassRelevantFields,
} from './asset-classes';

// Export data source documentation
export {
  getDatasetsByCategory,
  getDataset,
  dataVersionInfo,
  validateDataSourcesArePublished,
  OwnershipTrackerDatasets,
  TrackerDatasets,
  DerivedDatasets,
  type GEMDataset,
} from './data-sources';
