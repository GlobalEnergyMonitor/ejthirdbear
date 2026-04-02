/**
 * Shared types for the asset-class screener flow.
 *
 * Used by:
 * - /screener/results/+page.svelte
 * - /screener/owners/+page.svelte
 */

/** Shape of a selected asset class passed through URL search params. */
export interface ScreenerSelectedClass {
  id?: string;
  assetClassId?: string;
  name?: string;
  description?: string;
  tracker?: string;
  gemTrackers?: string[];
  filters?: {
    status?: string;
    statuses?: string[];
    geography?: string | string[];
    geofence?: number[][];
  };
  selectedSubClasses?: string[];
  /**
   * Fully resolved asset URL from the catalog API — includes asset_type, subclass,
   * status, and country params. When present, the results page uses this directly
   * instead of rebuilding the query from individual filter fields.
   */
  catalogUrl?: string;
  /** Same as catalogUrl but for the /owners endpoint. */
  catalogOwnersUrl?: string;
}
