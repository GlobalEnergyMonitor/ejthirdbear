/**
 * Centralized Tracker Schema Configuration
 *
 * Single source of truth for:
 * - Available trackers and their metadata
 * - Tracker ↔ API asset type mapping
 * - Status values and country list
 */

// =============================================================================
// TRACKERS
// =============================================================================

export const TRACKERS = [
  'Bioenergy Power',
  'Cement Plant',
  'Coal Mine',
  'Coal Plant',
  'Gas Pipeline',
  'Gas Plant',
  'Iron Mine',
  'Oil Pipeline',
  'Steel Plant',
] as const;

export type TrackerName = (typeof TRACKERS)[number];

// =============================================================================
// TRACKER TO API ASSET TYPE MAPPING
// =============================================================================

/**
 * Maps UI tracker names to REST API asset type values.
 */
export const TRACKER_TO_ASSET_TYPE: Record<TrackerName, string> = {
  'Bioenergy Power': 'Bioenergy Power',
  'Cement Plant': 'Cement or Concrete Plant',
  'Coal Mine': 'Coal Mine',
  'Coal Plant': 'Coal Plant',
  'Gas Pipeline': 'Natural Gas Transmission Pipeline',
  'Gas Plant': 'Gas Plant',
  'Iron Mine': 'Iron Ore Mine',
  'Oil Pipeline': 'Oil or NGL Pipeline',
  'Steel Plant': 'Iron & Steel Plant',
};

/**
 * Get the API asset type for a tracker
 */
export function getAssetTypeForTracker(tracker: string): string | null {
  if (!isValidTracker(tracker)) return null;
  return TRACKER_TO_ASSET_TYPE[tracker] || tracker;
}

/**
 * Check if a string is a valid tracker name
 */
export function isValidTracker(tracker: string): tracker is TrackerName {
  return TRACKERS.includes(tracker as TrackerName);
}

// =============================================================================
// STATUS VALUES
// =============================================================================

export const STATUS_VALUES = [
  'abandoned',
  'announced',
  'cancelled',
  'cancelled - inferred 4 y',
  'construction',
  'demolished',
  'idle',
  'mothballed',
  'mothballed pre-retirement',
  'operating',
  'operating pre-retirement',
  'permitted',
  'pre-construction',
  'pre-permit',
  'proposed',
  'retired',
  'shelved',
  'shelved - inferred 2 y',
] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];

/** Status values grouped into high-level buckets for the screener UI */
export const STATUS_GROUPS = [
  { id: 'operating', label: 'Operating', statuses: ['operating', 'operating pre-retirement'] as StatusValue[] },
  {
    id: 'planned',
    label: 'Planned',
    statuses: [
      'announced',
      'construction',
      'permitted',
      'pre-construction',
      'pre-permit',
      'proposed',
    ] as StatusValue[],
  },
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'cancelled - inferred 4 y', 'shelved', 'shelved - inferred 2 y'] as StatusValue[] },
  { id: 'retired', label: 'Retired', statuses: ['retired', 'mothballed', 'mothballed pre-retirement', 'idle', 'abandoned', 'demolished'] as StatusValue[] },
] as const;

export type StatusGroup = (typeof STATUS_GROUPS)[number];

/** Short help text for the high-level status groups shown in the screener modal */
export const STATUS_GROUP_DESCRIPTIONS: Record<string, string> = {
  operating: 'Assets currently operating or producing.',
  planned: 'Announced, permitted, or under-construction assets not yet operating.',
  cancelled: 'Projects that were cancelled or shelved before operation.',
  retired: 'Assets that have closed, idled, or been mothballed.',
  other: 'Statuses outside the standard screener groupings.',
};

/** Definitions for individual tracker status values shown under Refine */
export const STATUS_VALUE_DESCRIPTIONS: Record<string, string> = {
  abandoned: 'Site abandoned with no plans for reuse.',
  announced: 'Publicly announced but not yet permitted or built.',
  cancelled: 'Project cancelled or failed to advance.',
  'cancelled - inferred 4 y': 'No activity for 4+ years; inferred cancelled.',
  construction: 'Physically under construction.',
  demolished: 'Facility has been demolished.',
  idle: 'Temporarily not operating.',
  mothballed: 'Deactivated but not retired; may restart.',
  'mothballed pre-retirement': 'Mothballed with planned retirement.',
  operating: 'Currently operating or in commercial production.',
  'operating pre-retirement': 'Operating but scheduled for retirement.',
  permitted: 'Permits secured, construction not yet underway.',
  'pre-construction': 'In development before construction begins.',
  'pre-permit': 'Early-stage development before permits are secured.',
  proposed: 'Proposed project without construction underway.',
  retired: 'Permanently closed or decommissioned.',
  shelved: 'Paused indefinitely or put on hold.',
  'shelved - inferred 2 y': 'No activity for 2+ years; inferred shelved.',
};

// =============================================================================
// DYNAMIC STATUS GROUPS (data-driven from API facets)
// =============================================================================

export interface DynamicStatusGroup {
  id: string;
  label: string;
  statuses: { value: string; count: number }[];
  totalCount: number;
}

/** Our 4-group UI mapping — which API taxonomy group each UI group pulls from */
const UI_GROUP_TO_TAXONOMY: Record<string, string[]> = {
  operating: ['operating'],
  planned: ['planned'],
  cancelled: ['retired'], // API groups cancelled/shelved under 'retired'
  retired: ['retired'],
};

/** Sub-statuses that belong in our "cancelled" group (not "retired") */
const CANCELLED_SUB_STATUSES = new Set([
  'cancelled', 'cancelled-inferred', 'cancelled - inferred 4 y',
  'shelved', 'shelved-inferred', 'shelved - inferred 2 y',
]);

/**
 * Build status groups from API facet data, optionally enriched by the taxonomy.
 * Known statuses are placed into their STATUS_GROUPS bucket.
 * Unknown statuses go into an "Other" catch-all.
 * Groups with 0 total are excluded.
 *
 * When taxonomy is provided, sub-statuses and descriptions come from the API
 * instead of hardcoded lists — new sub-statuses added to the backend
 * automatically appear in the UI.
 */
export function discoverStatusGroups(
  facets: Map<string, number>,
  taxonomy?: { statuses: Record<string, { label: string; sub_statuses: Record<string, { label: string; description?: string }> }> } | null,
): DynamicStatusGroup[] {
  // If taxonomy is available, build groups from it
  if (taxonomy?.statuses) {
    return buildGroupsFromTaxonomy(facets, taxonomy.statuses);
  }

  // Fallback: use hardcoded STATUS_GROUPS
  return buildGroupsFromHardcoded(facets);
}

function buildGroupsFromTaxonomy(
  facets: Map<string, number>,
  taxonomyStatuses: Record<string, { label: string; sub_statuses: Record<string, { label: string; description?: string }> }>,
): DynamicStatusGroup[] {
  // Build a reverse map: sub_status key → which UI group it belongs to
  // The API taxonomy has 3 groups (operating, planned, retired)
  // Our UI has 4 (operating, planned, cancelled, retired)
  // We split the API's "retired" into "cancelled" and "retired" based on CANCELLED_SUB_STATUSES

  const groups: DynamicStatusGroup[] = [];
  const seenStatuses = new Set<string>();

  for (const uiGroup of STATUS_GROUPS) {
    const statuses: { value: string; count: number; label?: string; description?: string }[] = [];

    // Gather sub-statuses from taxonomy groups that map to this UI group
    const taxGroups = UI_GROUP_TO_TAXONOMY[uiGroup.id] || [];
    for (const taxGroupId of taxGroups) {
      const taxGroup = taxonomyStatuses[taxGroupId];
      if (!taxGroup?.sub_statuses) continue;

      for (const [subKey, subMeta] of Object.entries(taxGroup.sub_statuses)) {
        // Normalize key to our hyphenated convention
        const normalized = subKey.replace(/_/g, '-');
        const mapped = mapApiSubStatus(normalized);

        // For the retired taxonomy group, split between cancelled and retired UI groups
        if (taxGroupId === 'retired') {
          const isCancelled = CANCELLED_SUB_STATUSES.has(mapped) || CANCELLED_SUB_STATUSES.has(normalized);
          if (uiGroup.id === 'cancelled' && !isCancelled) continue;
          if (uiGroup.id === 'retired' && isCancelled) continue;
        }

        if (seenStatuses.has(mapped)) continue;
        seenStatuses.add(mapped);

        const count = facets.get(mapped) ?? 0;
        statuses.push({ value: mapped, count, label: subMeta.label, description: subMeta.description });

        // Enrich descriptions dynamically
        if (subMeta.description && !STATUS_VALUE_DESCRIPTIONS[mapped]) {
          STATUS_VALUE_DESCRIPTIONS[mapped] = subMeta.description;
        }
      }
    }

    // Also include any hardcoded sub-statuses not in the taxonomy
    for (const s of uiGroup.statuses) {
      if (!seenStatuses.has(s)) {
        seenStatuses.add(s);
        const count = facets.get(s) ?? 0;
        statuses.push({ value: s, count });
      }
    }

    const totalCount = statuses.reduce((sum, s) => sum + s.count, 0);

    // Handle aggregate-only fallback
    const aggregateCount = facets.get(uiGroup.id) ?? 0;
    if (totalCount === 0 && aggregateCount > 0) {
      groups.push({
        id: uiGroup.id,
        label: uiGroup.label,
        statuses: [{ value: uiGroup.id, count: aggregateCount }],
        totalCount: aggregateCount,
      });
    } else if (totalCount > 0) {
      // Filter out zero-count entries for cleaner UI
      groups.push({
        id: uiGroup.id,
        label: uiGroup.label,
        statuses: statuses.filter((s) => s.count > 0),
        totalCount,
      });
    }
  }

  // Collect unclaimed statuses into "Other"
  const otherStatuses: { value: string; count: number }[] = [];
  for (const [status, count] of facets) {
    if (!seenStatuses.has(status) && count > 0) {
      otherStatuses.push({ value: status, count });
    }
  }
  if (otherStatuses.length > 0) {
    otherStatuses.sort((a, b) => b.count - a.count);
    groups.push({
      id: 'other',
      label: 'Other',
      statuses: otherStatuses,
      totalCount: otherStatuses.reduce((sum, s) => sum + s.count, 0),
    });
  }

  return groups;
}

/** Map API snake-case sub-status names to our display convention */
function mapApiSubStatus(key: string): string {
  switch (key) {
    case 'cancelled-inferred': return 'cancelled - inferred 4 y';
    case 'shelved-inferred': return 'shelved - inferred 2 y';
    case 'operating-pre-retirement': return 'operating pre-retirement';
    case 'mothballed-pre-retirement': return 'mothballed pre-retirement';
    case 'mixed-status': return 'operating';
    default: return key;
  }
}

function buildGroupsFromHardcoded(facets: Map<string, number>): DynamicStatusGroup[] {
  const claimedStatuses = new Set<string>();
  for (const sg of STATUS_GROUPS) {
    claimedStatuses.add(sg.id);
    for (const s of sg.statuses) claimedStatuses.add(s);
  }

  const groups: DynamicStatusGroup[] = [];
  for (const sg of STATUS_GROUPS) {
    const statuses: { value: string; count: number }[] = [];
    for (const s of sg.statuses) {
      const count = facets.get(s) ?? 0;
      statuses.push({ value: s, count });
    }
    const totalCount = statuses.reduce((sum, s) => sum + s.count, 0);
    const aggregateCount = facets.get(sg.id) ?? 0;
    if (totalCount === 0 && aggregateCount > 0) {
      groups.push({
        id: sg.id,
        label: sg.label,
        statuses: [{ value: sg.id, count: aggregateCount }],
        totalCount: aggregateCount,
      });
    } else if (totalCount > 0) {
      groups.push({ id: sg.id, label: sg.label, statuses, totalCount });
    }
  }

  const otherStatuses: { value: string; count: number }[] = [];
  for (const [status, count] of facets) {
    if (!claimedStatuses.has(status) && count > 0) {
      otherStatuses.push({ value: status, count });
    }
  }
  if (otherStatuses.length > 0) {
    otherStatuses.sort((a, b) => b.count - a.count);
    groups.push({
      id: 'other',
      label: 'Other',
      statuses: otherStatuses,
      totalCount: otherStatuses.reduce((sum, s) => sum + s.count, 0),
    });
  }

  return groups;
}

// =============================================================================
// COUNTRIES (for geography filter)
// =============================================================================

export const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Angola',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cayman Islands',
  'Chile',
  'China',
  'Colombia',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Estonia',
  'Ethiopia',
  'Finland',
  'France',
  'Gabon',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Guatemala',
  'Guinea',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Liberia',
  'Libya',
  'Lithuania',
  'Luxembourg',
  'Macau',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Mali',
  'Malta',
  'Mauritius',
  'Mexico',
  'Moldova',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Puerto Rico',
  'Qatar',
  'Romania',
  'Russia',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'South Africa',
  'South Korea',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkmenistan',
  'T\u00FCrkiye',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
] as const;

export type Country = (typeof COUNTRIES)[number];
