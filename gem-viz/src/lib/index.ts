/**
 * @module lib
 *
 * GEM Viz Library - Main Entry Point
 *
 * This barrel export provides organized access to all library modules.
 * For Neovim: Use `gd` to jump to definitions, `gr` for references.
 *
 * @example
 * // Import commonly used items
 * import { colors, exportList, slugifyId } from '$lib';
 *
 * // Or import from specific modules
 * import { calculateHHI } from '$lib/analysis';
 * import { createLoader } from '$lib/stores';
 */

// =============================================================================
// CONSTANTS & CONFIGURATION
// =============================================================================

export {
  // String limits
  MAX_SLUG_LENGTH,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ERROR_PREVIEW_LENGTH,
  MAX_SQL_PREVIEW_LENGTH,
  // UI limits
  MAX_RECENT_SEARCHES,
  TOP_RESULTS_COUNT,
  EXPANDED_LIST_COUNT,
  // Storage keys
  STORAGE_KEY_EXPORT_LIST,
  STORAGE_KEY_INVESTIGATION_CART,
  STORAGE_KEY_RECENT_SEARCHES,
} from './constants';

// =============================================================================
// DESIGN TOKENS (Colors, Typography, Spacing)
// =============================================================================

export {
  // UI Colors
  colors,
  // Tracker colors
  trackerColors,
  colorByTracker,
  getTrackerColor,
  // Status colors
  statusColors,
  colorByStatus,
  getStatusColor,
  regroupStatus,
  // Typography & Spacing
  fonts,
  fontSizes,
  spacing,
  // Color utilities
  hexToRgb,
  rgbToHex,
  adjustColor,
  withOpacity,
} from './design-tokens';

// =============================================================================
// STORES (Global State)
// =============================================================================

// Export list (bulk operations)
export { exportList, isInExportList, type ExportAsset } from './exportList';

// Investigation cart (research collections)
export {
  investigationCart,
  isInCart,
  type CartItem,
  type CartItemType,
  type CartCounts,
} from './investigationCart';

// Map filter
export {
  mapFilter,
  setMapFilter,
  clearMapFilter,
  isPolygonFilter,
  isBoundsFilter,
  type MapFilter,
  type MapBounds,
  type MapPolygon,
} from './mapFilter';

// =============================================================================
// UTILITIES
// =============================================================================

// Slug/ID utilities
export { slugifyId, isValidSlug, sanitizeName } from './slug';

// Link builders
export { link, assetLink, entityLink, assetPath } from './links';

// =============================================================================
// RE-EXPORTS FROM SUBMODULES
// =============================================================================

// For direct submodule access, import from:
//   '$lib/analysis'      - Statistical analysis (HHI, Gini, outliers)
//   '$lib/stores'        - Data loaders, page context
//   '$lib/utils'         - SQL helpers
//   '$lib/data-config'   - Tracker/field configurations
//   '$lib/component-data' - Component data fetching
