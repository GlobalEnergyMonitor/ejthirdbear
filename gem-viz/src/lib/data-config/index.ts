/**
 * GEM Data Configuration Module
 *
 * Central registry for:
 * - Tracker metadata and field mappings (tracker-config.ts)
 * - Asset class definitions and rules (asset-classes.ts)
 * - Standardized field access helpers (field-mappings.ts)
 * - Data source documentation (data-sources.ts)
 *
 * This module encodes the Ownership Data Processing and Access Plan
 * into executable, type-safe code structures.
 *
 * Usage:
 *   import { getTrackerConfig, getAssetClass, getOperatingStatus } from '$lib/data-config';
 *   const coalPlantConfig = getTrackerConfig('Coal Plant');
 *   const status = getOperatingStatus('Coal Plant', assetRecord);
 */

// Export tracker configuration and utilities
export {
  getTrackerConfig,
  getAllTrackerNames,
  getTrackersByType,
  getCapacityFields,
  normalizeStatus,
  constructAssetName,
  extractLocation,
  type TrackerFieldMapping,
  type OperatingStatus,
  trackerConfigs,
} from './tracker-config';

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

// Export field mapping utilities
export {
  getAssetIdByTracker,
  getAssetName,
  getOperatingStatus,
  getLocation,
  getCapacity,
  deepKeyLookup,
  categorizeStatus,
  getTrackerFieldNames,
  validateRecordForTracker,
  getFieldDescription,
  fieldDescriptions,
  type NormalizedOperatingStatus,
  type LocationData,
  type CapacityData,
} from './field-mappings';

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
