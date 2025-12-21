/**
 * GEM Ownership Tools - Theme & Colors
 *
 * THIS FILE RE-EXPORTS FROM THE SINGLE SOURCE OF TRUTH: design-tokens.ts
 * Kept for backward compatibility with existing imports.
 *
 * For new code, import directly from '$lib/design-tokens'.
 */

export {
  // UI Colors
  colors,

  // Tracker colors
  trackerColors,
  trackerColorMap,
  colorByTracker,
  renewableTrackerColors,
  renewableTrackerColorMap,
  colorByTrackerRenewable,

  // Status colors
  statusColors,
  statusColorsGranular,
  statusGroups,
  statusColorLegend,
  prospectiveColorLegend,
  colorByStatus,
  statusColorsProspective,
  colorByStatusProspective,
  statusColorsMap,

  // Map colors
  mapColors,
  trackerToMapColor,

  // Ownership colors
  ownershipColors,

  // Typography & Spacing
  fonts,
  fontSizes,
  spacing,

  // Color utilities (THE DOPE CHROMA MATH)
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  setColLightness,
  adjustColLightness,
  adjustColor,
  withOpacity,

  // Status/Tracker helpers
  getTrackerColor,
  getStatusColor,
  getAggregatedStatusColor,
  getStatusGroup,
  regroupStatus,

  // Data config
  fossilTrackers,
  prospectiveStatuses,

  // Aggregated export object
  colMaps,
} from './design-tokens';
