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

type ClassDescriptionInput = {
  name?: string;
  tracker?: string;
  filters?: {
    statuses?: string[];
    status?: string;
    geography?: string | string[];
    geofence?: number[][] | null;
  } | null;
};

/**
 * Build the human-readable "operating/planned Captive Power Data Centers in 2 countries"
 * description used inside the results subtitle. Single source of truth so both the
 * standalone /screener/results route and the GemScreener widget stay aligned.
 *
 * Prefers the class NAME (e.g. "Captive Power Data Centers") over the tracker slug
 * (e.g. "Gas Plant") — the tracker slug is misleading for multi-tracker classes.
 */
export function buildClassDescription(selectedClasses: ClassDescriptionInput[]): string {
  if (!selectedClasses || selectedClasses.length === 0) return 'selected assets';

  const cls = selectedClasses[0];
  const trackerName = cls.name || cls.tracker || 'assets';
  const parts: string[] = [];

  const statuses: string[] = cls.filters?.statuses ?? (cls.filters?.status ? [cls.filters.status] : []);
  if (statuses.length === 1) {
    parts.push(statuses[0]);
  } else if (statuses.length > 1 && statuses.length <= 3) {
    parts.push(statuses.join('/'));
  }
  // 4+ statuses: skip status prefix (too noisy in "Ownership in N ..." text)

  parts.push(trackerName);

  const geo = cls.filters?.geography;
  if (geo) {
    if (Array.isArray(geo)) {
      if (geo.length === 1) parts.push(`in ${geo[0]}`);
      else if (geo.length > 1) parts.push(`in ${geo.length} countries`);
    } else {
      parts.push(`in ${geo}`);
    }
  }

  if (cls.filters?.geofence) {
    parts.push('in custom region');
  }

  return parts.join(' ');
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
