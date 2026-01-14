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

// Shared utilities
export {
  parseSegment,
  sanitizeId,
  parseOwnershipPaths,
  extractOwnershipChain,
  type ParsedSegment,
  type OwnershipNode,
  type ParsedOwnershipGraph,
} from './ownership-parser';
export { getPageId, getPageType, requirePageId, createHydration } from './use-hydration.svelte';

// Schema functions (Ownership API-based)
export {
  fetchAssetBasics,
  fetchCoordinatesByLocation,
  fetchSameOwnerAssets,
  fetchCoLocatedAssets,
  fetchOwnerStats,
  fetchOwnershipChain,
  fetchOwnerPortfolio,
  DATA_CONTRACT,
} from './schema';

// Observable-ported functions (available for components that need ownership data)
export { getAssetOwners, getSpotlightOwnerData } from '$lib/ownership-data';
