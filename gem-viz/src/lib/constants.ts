/**
 * @module constants
 * @description Application-wide constants and limits.
 *
 * Shared magic numbers and limits used across the codebase.
 * Centralizing these makes them easier to find and adjust.
 *
 * @example
 * import { MAX_SLUG_LENGTH, STORAGE_KEY_EXPORT_LIST } from '$lib/constants';
 */

// =============================================================================
// STRING LIMITS
// =============================================================================

/** Maximum length for slug/ID strings */
export const MAX_SLUG_LENGTH = 100;

/** Maximum length for sanitized display names */
export const MAX_DISPLAY_NAME_LENGTH = 200;

/** Maximum length for sanitized names (with extra buffer) */
export const MAX_NAME_LENGTH = 500;

/** Maximum length for error message previews */
export const MAX_ERROR_PREVIEW_LENGTH = 200;

/** Maximum length for SQL debug previews */
export const MAX_SQL_PREVIEW_LENGTH = 500;

// =============================================================================
// UI LIMITS
// =============================================================================

/** Number of recent searches to store */
export const MAX_RECENT_SEARCHES = 10;

/** Number of items to show in "top N" lists */
export const TOP_RESULTS_COUNT = 3;

/** Number of items to show in expanded lists */
export const EXPANDED_LIST_COUNT = 5;

// =============================================================================
// STORAGE KEYS
// =============================================================================

/** localStorage key for export list */
export const STORAGE_KEY_EXPORT_LIST = 'gem-export-list';

/** localStorage key for investigation cart */
export const STORAGE_KEY_INVESTIGATION_CART = 'gem-investigation-cart';

/** localStorage key for recent searches */
export const STORAGE_KEY_RECENT_SEARCHES = 'gem-recent-searches';
