/**
 * @module stores
 *
 * Svelte stores for global state management.
 *
 * @example
 * import { currentAssetId, createLoader } from '$lib/stores';
 */

// Page context - reactive URL params
export {
  currentAssetId,
  currentEntityId,
  pageType,
  contextId,
  getCurrentId,
} from './page-context';

// Data loading utilities
export {
  // Types
  type LoaderState,
  type LoaderStore,
  type LoadOptions,
  type KeyedLoaderStore,
  // Cache functions
  getCached,
  setCache,
  clearCache,
  // Store creators
  createLoader,
  createKeyedLoader,
  combineLoaders,
} from './data-loader';
