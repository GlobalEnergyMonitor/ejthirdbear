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

// Re-export stats utils for convenience
export {
  createPercentileLookup,
  percentileRank,
  formatPercent,
  formatMtCO2,
  formatCapacity,
  shorten,
} from '$lib/stats-utils';
