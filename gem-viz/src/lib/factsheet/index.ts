/**
 * Factsheet module exports
 * Provides types, queries, and utilities for factsheet components
 */

// Types
export type { Asset, PercentileData, FieldInfo, FieldStats } from './types';
export { STATUS_GROUPS, CATEGORIES_ORDERED, getStatusGroup, isMineAsset } from './types';

// Queries
export {
  fetchAssets,
  fetchCapacities,
  fetchFieldStats,
  fetchRowCount,
  clearQueryCache,
} from './queries';

// Card config
export type { CardField, CardTab, TrackerCardConfig } from './tracker-card-config';
export { getTrackerCardConfig, getConfiguredKeys, resolveFieldValue } from './tracker-card-config';

// Re-export formatting utils for convenience
export {
  createPercentileLookup,
  percentileRank,
  formatPercent,
  formatMtCO2,
  formatValueWithUnit,
  shorten,
} from '$lib/format';
