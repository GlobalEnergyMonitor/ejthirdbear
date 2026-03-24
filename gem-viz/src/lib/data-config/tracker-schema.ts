/**
 * Centralized Tracker Schema Configuration
 *
 * Single source of truth for:
 * - Available trackers and their metadata
 * - Tracker ↔ API asset type mapping
 * - Status values and country list
 *
 * Hardcoded values serve as FALLBACKS only.
 * The API (/catalog/metadata/status-taxonomy, /metadata, /assets?facets=true)
 * is the primary source. Call initFromApi() at app startup to populate live data.
 */

import { fetchCatalogTaxonomy, fetchCountryFacets, type StatusTaxonomy } from '$lib/catalog-api';

// =============================================================================
// API-DRIVEN STATE (populated by initFromApi)
// =============================================================================

let _apiTaxonomy: StatusTaxonomy | null = null;
let _liveCountries: string[] | null = null;

/** Initialize schema from API. Call once at app startup or first use. */
export async function initFromApi(): Promise<void> {
  const taxonomy = await fetchCatalogTaxonomy();
  if (taxonomy) {
    _apiTaxonomy = taxonomy;
    // API descriptions override hardcoded — if they tweak copy on the backend, we show it
    for (const group of Object.values(taxonomy.statuses)) {
      for (const [, sub] of Object.entries(group.sub_statuses)) {
        if (sub.description && sub.label) {
          STATUS_VALUE_DESCRIPTIONS[sub.label.toLowerCase()] = sub.description;
        }
      }
    }
  }

  // Enrich tracker citations from API (non-blocking, dynamic import to avoid circular dep)
  import('./tracker-metadata').then((m) => m.enrichTrackerMetadataFromApi()).catch(() => {});
}

/** Get the live taxonomy (or null if not yet loaded). */
export function getApiTaxonomy(): StatusTaxonomy | null {
  return _apiTaxonomy;
}

/** Fetch live countries from API facets. Falls back to hardcoded COUNTRIES. */
export async function fetchLiveCountries(): Promise<string[]> {
  if (_liveCountries) return _liveCountries;
  const facets = await fetchCountryFacets();
  if (facets && Object.keys(facets).length > 0) {
    _liveCountries = Object.keys(facets).sort();
    return _liveCountries;
  }
  return [...COUNTRIES];
}

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

// =============================================================================
// TRACKER ID FIELD MAPPING
// =============================================================================

/**
 * Maps tracker names to their primary ID field in the data.
 * Different trackers use different column names for the asset identifier.
 */
export const TRACKER_ID_FIELD: Record<TrackerName, string> = {
  'Bioenergy Power': 'GEM unit ID',
  'Cement Plant': 'GEM Plant ID',
  'Coal Mine': 'GEM Mine ID',
  'Coal Plant': 'GEM unit ID',
  'Gas Pipeline': 'ProjectID',
  'Gas Plant': 'GEM unit ID',
  'Iron Mine': 'GEM Asset ID',
  'Oil Pipeline': 'ProjectID',
  'Steel Plant': 'Steel Plant ID',
};

/**
 * Get the primary ID field name for a tracker.
 */
export function getIdFieldForTracker(tracker: string): string | null {
  if (!isValidTracker(tracker)) return null;
  return TRACKER_ID_FIELD[tracker] || null;
}

// =============================================================================
// API SLUG MAPPINGS (canonical, single source of truth)
// =============================================================================

/** The 8 canonical API slugs → API display type names */
export const API_SLUG_TO_TYPE: Record<string, string> = {
  'coal-plant': 'Coal Plant',
  'oil-gas-plant': 'Oil & Gas Plant',
  'bioenergy-plant': 'Bioenergy Plant',
  'gas-pipeline': 'Natural Gas Transmission Pipeline',
  'cement-plant': 'Cement or Concrete Plant',
  'oil-pipeline': 'Oil or NGL Pipeline',
  'iron-steel-plant': 'Iron & Steel Plant',
  'iron-ore-mine': 'Iron Ore Mine',
};

/** Reverse: API display type → canonical API slug */
export const API_TYPE_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(API_SLUG_TO_TYPE).map(([slug, type]) => [type, slug])
);

/** API display name → UI tracker name (reverse of TRACKER_TO_ASSET_TYPE) */
export const API_TYPE_TO_TRACKER: Record<string, string> = Object.fromEntries(
  Object.entries(TRACKER_TO_ASSET_TYPE).map(([tracker, apiType]) => [apiType, tracker])
);

/** URL slug → catalog metadata endpoint slug (e.g. 'coal-mine' → 'coal-mines') */
export const URL_SLUG_TO_CATALOG_SLUG: Record<string, string> = {
  'coal-mine': 'coal-mines',
  'coal-plant': 'coal-plants',
  'gas-plant': 'gas-plants',
  'iron-mine': 'iron-mines',
  'steel-plant': 'steel-plants',
  'gas-pipeline': 'gas-pipelines',
  bioenergy: 'bioenergy-plants',
  'oil-pipeline': 'oil-pipelines',
  'cement-plant': 'cement-plants',
};

/** UI tracker name → URL slug (for /tracker/ pages) */
export const TRACKER_TO_URL_SLUG: Record<string, string> = {
  'Coal Plant': 'coal-plant',
  'Gas Plant': 'gas-plant',
  'Coal Mine': 'coal-mine',
  'Iron Mine': 'iron-mine',
  'Steel Plant': 'steel-plant',
  'Gas Pipeline': 'gas-pipeline',
  'Bioenergy Power': 'bioenergy',
  'Oil Pipeline': 'oil-pipeline',
  'Cement Plant': 'cement-plant',
};

/** Reverse: URL slug → UI tracker name */
export const URL_SLUG_TO_TRACKER: Record<string, string> = Object.fromEntries(
  Object.entries(TRACKER_TO_URL_SLUG).map(([name, slug]) => [slug, name])
);

/**
 * Universal identifier → API slug resolver map.
 * Accepts: UI tracker names, API display names, URL slugs, API slugs.
 */
export const IDENTIFIER_TO_API_SLUG: Record<string, string> = {
  // UI tracker names (from TRACKERS array)
  'Coal Plant': 'coal-plant',
  'Gas Plant': 'oil-gas-plant',
  'Coal Mine': 'coal-mine',
  'Iron Mine': 'iron-ore-mine',
  'Steel Plant': 'iron-steel-plant',
  'Gas Pipeline': 'gas-pipeline',
  'Bioenergy Power': 'bioenergy-plant',
  'Oil Pipeline': 'oil-pipeline',
  'Cement Plant': 'cement-plant',
  // API display names
  'Oil & Gas Plant': 'oil-gas-plant',
  'Iron Ore Mine': 'iron-ore-mine',
  'Iron & Steel Plant': 'iron-steel-plant',
  'Bioenergy Plant': 'bioenergy-plant',
  'Natural Gas Transmission Pipeline': 'gas-pipeline',
  'Oil or NGL Pipeline': 'oil-pipeline',
  'Cement or Concrete Plant': 'cement-plant',
  // API slugs (identity)
  'coal-plant': 'coal-plant',
  'oil-gas-plant': 'oil-gas-plant',
  'iron-ore-mine': 'iron-ore-mine',
  'iron-steel-plant': 'iron-steel-plant',
  'gas-pipeline': 'gas-pipeline',
  'bioenergy-plant': 'bioenergy-plant',
  'cement-plant': 'cement-plant',
  'oil-pipeline': 'oil-pipeline',
  'coal-mine': 'coal-mine',
  // Old/alternative URL slugs
  'gas-plant': 'oil-gas-plant',
  'iron-mine': 'iron-ore-mine',
  'steel-plant': 'iron-steel-plant',
  bioenergy: 'bioenergy-plant',
};

// =============================================================================
// TRACKER UTILITIES
// =============================================================================

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
  {
    id: 'operating',
    label: 'Operating',
    statuses: ['operating', 'operating pre-retirement'] as StatusValue[],
  },
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
  {
    id: 'cancelled',
    label: 'Cancelled',
    statuses: [
      'cancelled',
      'cancelled - inferred 4 y',
      'shelved',
      'shelved - inferred 2 y',
    ] as StatusValue[],
  },
  {
    id: 'retired',
    label: 'Retired',
    statuses: [
      'retired',
      'mothballed',
      'mothballed pre-retirement',
      'idle',
      'abandoned',
      'demolished',
    ] as StatusValue[],
  },
] as const;

export type StatusGroup = (typeof STATUS_GROUPS)[number];

/** Flat lookup: individual status value → group id (e.g. 'announced' → 'planned') */
export const STATUS_TO_GROUP: Record<string, string> = {};
for (const group of STATUS_GROUPS) {
  for (const s of group.statuses) {
    STATUS_TO_GROUP[s] = group.id;
  }
}

// =============================================================================
// CLASSIFICATION LISTS
// =============================================================================

/** Trackers covering fossil fuel assets */
export const FOSSIL_TRACKERS = ['Coal Plant', 'Gas Plant', 'Coal Mine', 'Gas Pipeline'] as const;

/** Status values indicating planned/prospective assets.
 * Includes 'planned' as API aggregate fallback — some trackers return
 * aggregate 'planned' instead of granular sub-statuses. */
export const PROSPECTIVE_STATUSES = [
  'permitted',
  'pre-permit',
  'pre-construction',
  'construction',
  'proposed',
  'announced',
  'planned',
] as const;

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
// STATUS MATCHING — single source of truth for status/sub-status comparison
// =============================================================================

/**
 * Map API `operating_sub_status` snake_case values to the human-readable
 * names used in STATUS_VALUES / STATUS_GROUPS.
 *
 * The API returns values like "cancelled_inferred" or "shelved_inferred",
 * but the screener UI and facet labels use "cancelled - inferred 4 y", etc.
 */
export function normalizeSubStatus(raw: string | null | undefined): string {
  if (!raw) return '';
  const s = raw.toLowerCase().replace(/_/g, '-');
  switch (s) {
    case 'cancelled-inferred':
      return 'cancelled - inferred 4 y';
    case 'shelved-inferred':
      return 'shelved - inferred 2 y';
    case 'operating-pre-retirement':
      return 'operating pre-retirement';
    case 'mothballed-pre-retirement':
      return 'mothballed pre-retirement';
    default:
      return s;
  }
}

/**
 * The API's 3 coarse status buckets. Use with `?status=` param.
 */
export const API_COARSE_STATUSES = ['operating', 'planned', 'retired'] as const;

/**
 * Convert a display status name to the API's snake_case sub_status key.
 *
 * Our UI uses names like "cancelled - inferred 4 y" but the API expects
 * "cancelled_inferred" in `?sub_status=`. This is the reverse of normalizeSubStatus().
 *
 * Returns null if the value doesn't map to any known API sub_status
 * (e.g. "abandoned" and "demolished" don't exist in the API).
 */
const DISPLAY_TO_API_SUB_STATUS: Record<string, string> = {
  'cancelled - inferred 4 y': 'cancelled_inferred',
  'shelved - inferred 2 y': 'shelved_inferred',
  'operating pre-retirement': 'operating_pre_retirement',
  'mothballed pre-retirement': 'mothballed_pre_retirement',
  'pre-construction': 'pre_construction',
  'pre-permit': 'pre_permit',
  'mixed-status': 'mixed_status',
  // These exist in the API as-is (no transform needed)
  operating: 'operating',
  retired: 'retired',
  cancelled: 'cancelled',
  announced: 'announced',
  construction: 'construction',
  permitted: 'permitted',
  proposed: 'proposed',
  mothballed: 'mothballed',
  shelved: 'shelved',
  idle: 'idle',
  unknown: 'unknown',
};

/**
 * Convert a display status name to the API's sub_status key, or null
 * if it's not a value the API recognizes (e.g. "abandoned", "demolished").
 */
export function displayStatusToApiKey(displayName: string): string | null {
  const lower = displayName.toLowerCase();
  return DISPLAY_TO_API_SUB_STATUS[lower] ?? null;
}

/**
 * Check whether a status value is one of the 3 coarse API statuses
 * (operating, planned, retired) that work with `?status=`.
 */
export function isCoarseStatus(val: string): boolean {
  return (API_COARSE_STATUSES as readonly string[]).includes(val.toLowerCase());
}

/**
 * Check whether an asset matches a list of allowed status values.
 *
 * Compares against both the high-level `operating_status` (e.g. "retired")
 * and the granular `operating_sub_status` (e.g. "mothballed"), because the
 * screener UI exposes sub-statuses as selectable values.
 *
 * @param status      - high-level operating_status
 * @param subStatus   - granular operating_sub_status
 * @param allowed     - lowercase status values the user selected
 */
export function matchesStatusFilter(
  status: string | null | undefined,
  subStatus: string | null | undefined,
  allowed: string[]
): boolean {
  const s = (status || '').toLowerCase();
  const sub = normalizeSubStatus(subStatus);
  return allowed.includes(s) || allowed.includes(sub);
}

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
  'cancelled',
  'cancelled-inferred',
  'cancelled - inferred 4 y',
  'shelved',
  'shelved-inferred',
  'shelved - inferred 2 y',
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
  taxonomy?: {
    statuses: Record<
      string,
      { label: string; sub_statuses: Record<string, { label: string; description?: string }> }
    >;
  } | null
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
  taxonomyStatuses: Record<
    string,
    { label: string; sub_statuses: Record<string, { label: string; description?: string }> }
  >
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
          const isCancelled =
            CANCELLED_SUB_STATUSES.has(mapped) || CANCELLED_SUB_STATUSES.has(normalized);
          if (uiGroup.id === 'cancelled' && !isCancelled) continue;
          if (uiGroup.id === 'retired' && isCancelled) continue;
        }

        if (seenStatuses.has(mapped)) continue;
        seenStatuses.add(mapped);

        const count = facets.get(mapped) ?? 0;
        statuses.push({
          value: mapped,
          count,
          label: subMeta.label,
          description: subMeta.description,
        });

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
    case 'cancelled-inferred':
      return 'cancelled - inferred 4 y';
    case 'shelved-inferred':
      return 'shelved - inferred 2 y';
    case 'operating-pre-retirement':
      return 'operating pre-retirement';
    case 'mothballed-pre-retirement':
      return 'mothballed pre-retirement';
    case 'mixed-status':
      return 'operating';
    default:
      return key;
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
