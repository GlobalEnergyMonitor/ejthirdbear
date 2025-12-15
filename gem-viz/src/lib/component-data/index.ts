/**
 * GEM Viz Component Data Layer
 *
 * Unified interface for component data access.
 * Prefer Observable-ported functions from ownership-data.ts.
 */

// Types
export * from './types';

// ID helpers (centralized ID resolution - use these!)
export * from './id-helpers';

// Shared utilities (explicit exports to avoid OwnershipEdge conflict with types.ts)
export {
  parseSegment,
  sanitizeId,
  parseOwnershipPaths,
  extractOwnershipChain,
  type ParsedSegment,
  type OwnershipNode,
  type ParsedOwnershipGraph,
} from './ownership-parser';
export * from './sql-helpers';
export {
  getMotherDuck,
  getPageId,
  getPageType,
  requirePageId,
  createHydration,
} from './use-hydration.svelte';

// Schema functions (MotherDuck-based)
export {
  getTables,
  fetchAssetBasics,
  fetchCoordinatesByLocation,
  fetchSameOwnerAssets,
  fetchCoLocatedAssets,
  fetchOwnerStats,
  fetchOwnershipChain,
  fetchOwnerPortfolio,
  DATA_CONTRACT,
} from './schema';

// Observable-ported functions (preferred)
export {
  getAssetOwners,
  getSpotlightOwnerData,
  getTopOwners,
  formatForMermaid,
  summarizeAssets,
  idFields,
  capacityFields,
} from '$lib/ownership-data';
