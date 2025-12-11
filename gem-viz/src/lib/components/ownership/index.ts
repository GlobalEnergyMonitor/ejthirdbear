/**
 * GEM Ownership Visualization Components
 * Ported from Observable notebooks
 *
 * Usage:
 *   import { OwnershipScreener, OwnershipHierarchy, OwnershipArc } from '$lib/components/ownership';
 *   import { colors, colorByTracker, colorByStatus } from '$lib/ownership-theme';
 *   import { getAssetOwners, formatForMermaid } from '$lib/ownership-data';
 */

// Visual components
export { default as OwnershipPie } from '../OwnershipPie.svelte';
export { default as OwnershipArc } from '../OwnershipArc.svelte';
export { default as OwnershipPath } from '../OwnershipPath.svelte';
export { default as OwnershipScreener } from '../OwnershipScreener.svelte';
export { default as OwnershipHierarchy } from '../OwnershipHierarchy.svelte';
export { default as MermaidOwnership } from '../MermaidOwnership.svelte';

// Re-export theme utilities
export {
  colors,
  colorByTracker,
  colorByStatus,
  colorByStatusProspective,
  statusColors,
  fossilTrackers,
  prospectiveStatuses,
  setColLightness,
  adjustColLightness,
  idFields,
  capacityFields,
} from '$lib/ownership-theme';

// Re-export data utilities
export { getAssetOwners, formatForMermaid, summarizeAssets } from '$lib/ownership-data';
