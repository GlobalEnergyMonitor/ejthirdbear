/**
 * Shared utility functions for the screener chart components.
 * Used by both AssetScreener.svelte and screener-chart-render.ts.
 */

/**
 * Build the Step 3 results-page subtitle.
 * Single source of truth so the widget and standalone route stay aligned.
 */
export function buildResultsSubtitle(
  viewMode: 'filtered' | 'all',
  selectedOwnerCount: number,
  classDescription: string
): string {
  return viewMode === 'filtered'
    ? `Showing ${selectedOwnerCount} selected companies and their ownership in ${classDescription}.`
    : `Showing all companies with ownership stakes in ${classDescription}.`;
}

/**
 * Clean an asset name for display. Prefers project_name from API when available,
 * otherwise falls back to trimming facility-type suffixes from asset_name.
 */
export function cleanAssetName(name: string, projectName?: string): string {
  if (projectName) return projectName;
  if (!name) return '';
  return name.replace(/\b(plant|station|project|center|centre|complex|facility)\b[\s\S]*$/i, '$1');
}

/**
 * Wrap text into max 2 lines at a word boundary, truncating with ellipsis.
 * Returns an array of 1-2 lines.
 */
export function wrapTextLines(text: string, maxChars = 25): string[] {
  if (!text || text.length <= maxChars) return [text || ''];
  const breakPos = text.lastIndexOf(' ', maxChars);
  const pos = breakPos === -1 ? maxChars : breakPos;
  const line1 = text.slice(0, pos).trim();
  let line2 = text.slice(pos).trim();
  if (line2.length > maxChars) {
    line2 = line2.slice(0, maxChars).trim() + '...';
  }
  return [line1, line2].filter(Boolean);
}
