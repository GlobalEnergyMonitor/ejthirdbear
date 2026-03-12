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
  'announced',
  'cancelled',
  'construction',
  'idle',
  'mothballed',
  'operating',
  'permitted',
  'pre-construction',
  'pre-permit',
  'proposed',
  'retired',
  'shelved',
] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];

/** Status values grouped into high-level buckets for the screener UI */
export const STATUS_GROUPS = [
  { id: 'operating', label: 'Operating', statuses: ['operating'] as StatusValue[] },
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
  { id: 'cancelled', label: 'Cancelled', statuses: ['cancelled', 'shelved'] as StatusValue[] },
  { id: 'retired', label: 'Retired', statuses: ['retired', 'mothballed', 'idle'] as StatusValue[] },
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
  announced: 'Publicly announced but not yet permitted or built.',
  construction: 'Physically under construction.',
  idle: 'Temporarily not operating.',
  mothballed: 'Suspended and preserved for possible restart.',
  operating: 'Currently operating.',
  permitted: 'Permits secured, construction not yet underway.',
  'pre-construction': 'In development before construction begins.',
  'pre-permit': 'Early-stage development before permits are secured.',
  proposed: 'Proposed project without construction underway.',
  retired: 'Permanently closed or decommissioned.',
  cancelled: 'Project cancelled.',
  shelved: 'Paused indefinitely or put on hold.',
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

/**
 * Build status groups from API facet data.
 * Known statuses are placed into their STATUS_GROUPS bucket.
 * Unknown statuses go into an "Other" catch-all.
 * Groups with 0 total are excluded.
 */
export function discoverStatusGroups(facets: Map<string, number>): DynamicStatusGroup[] {
  // Build a set of all statuses claimed by known groups (including group ids themselves)
  const claimedStatuses = new Set<string>();
  for (const sg of STATUS_GROUPS) {
    claimedStatuses.add(sg.id);
    for (const s of sg.statuses) claimedStatuses.add(s);
  }

  // Build known groups from facet data.
  // Include ALL known sub-statuses (even with 0 count) so the Refine
  // toggle appears for groups that have multiple sub-statuses.
  // Also handle the case where the API returns an aggregate group id (e.g. "planned")
  // instead of granular sub-statuses — in that case, use it as the sole sub-status.
  const groups: DynamicStatusGroup[] = [];
  for (const sg of STATUS_GROUPS) {
    const statuses: { value: string; count: number }[] = [];
    for (const s of sg.statuses) {
      const count = facets.get(s) ?? 0;
      statuses.push({ value: s, count });
    }
    let totalCount = statuses.reduce((sum, s) => sum + s.count, 0);
    // If the API returned the group id itself as an aggregate status (e.g. "planned": 500),
    // use that as the sole entry so the group still shows (without granular Refine).
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

  // Collect unclaimed statuses into "Other"
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
