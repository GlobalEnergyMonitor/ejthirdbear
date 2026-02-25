/**
 * Compose Page Query Functions — REST API version
 *
 * Replaces DuckDB-based compose-queries.ts with calls to the
 * gem-api.thirdbear.net REST API using ?facets=true for parametric counting.
 *
 * Same return types (FacetOption[], RangeData, AssetResult[]) so the swap
 * in compose-state is mechanical.
 */

import type { FacetOption, RangeData, AssetResult } from './compose-queries';

// ============================================================================
// API Client (reuse base URL from ownership-api.ts)
// ============================================================================

const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

const API_TIMEOUT_MS = 30_000;

async function apiFetch<T>(endpoint: string): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API error (${response.status}): ${response.statusText}`);
    }
    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`API request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// Name Mapping: API type ↔ App display name
// ============================================================================

/** App display name → API asset_type */
const TRACKER_TO_API: Record<string, string> = {
  'Coal Plant': 'Coal Plant',
  'Coal Mine': 'Coal Mine',
  'Gas Plant': 'Oil & Gas Plant',
  'Iron Mine': 'Iron Ore Mine',
  'Steel Plant': 'Iron & Steel Plant',
  'Gas Pipeline': 'Natural Gas Transmission Pipeline',
  'Bioenergy Power': 'Bioenergy Plant',
  'Cement Plant': 'Cement or Concrete Plant',
};

/** API asset_type → App display name */
const API_TO_TRACKER: Record<string, string> = Object.fromEntries(
  Object.entries(TRACKER_TO_API).map(([display, api]) => [api, display])
);

/** Convert API type to display name (pass through if no mapping) */
function apiTypeToDisplay(apiType: string): string {
  return API_TO_TRACKER[apiType] || apiType;
}

/** Convert display name to API type (pass through if no mapping) */
function displayToApiType(display: string): string {
  return TRACKER_TO_API[display] || display;
}

// ============================================================================
// API Response Types
// ============================================================================

interface ApiAsset {
  asset_id: string;
  asset_name: string;
  asset_type: string;
  operating_status: string;
  capacity_value: number | null;
  capacity_unit: string | null;
  country: string;
  state_province: string | null;
  latitude: number | null;
  longitude: number | null;
  url: string;
  owners: Array<{
    entity_id: string;
    name: string;
    ownership_share: number | null;
    hq_country: string | null;
  }>;
}

interface ApiFacets {
  asset_type: Record<string, number>;
  status: Record<string, number>;
  country: Record<string, number>;
}

interface ApiStats {
  capacity_range: { min: number | null; max: number | null };
}

interface ApiResponse {
  total: number;
  limit: number;
  offset: number;
  count: number;
  results: ApiAsset[];
  facets: ApiFacets;
  stats: ApiStats;
}

// ============================================================================
// Filter → URL Params
// ============================================================================

interface FilterState {
  trackers: string[];
  trackersAnd: string[];
  statuses: string[];
  statusesAnd: string[];
  countries: string[];
  countriesAnd: string[];
  ownerCountries: string[];
  ownerCountriesAnd: string[];
  owners: string[];
  ownersAnd: string[];
  capacityMin: number | null;
  capacityMax: number | null;
  shareMin: number | null;
  shareMax: number | null;
  startYearMin: number | null;
  startYearMax: number | null;
  search: string;
  logic: string;
}

/**
 * Convert FilterState to API query string.
 * Owner/ownerCountry/startYear/share are not supported by the API — callers
 * should use DuckDB fallback for those.
 */
export function buildApiParams(filters: FilterState): string {
  const params = new URLSearchParams();

  // Tracker → asset_type
  const allTrackers = [...(filters.trackers || []), ...(filters.trackersAnd || [])];
  if (allTrackers.length) {
    // API accepts comma-separated asset_type values
    const apiTypes = allTrackers.map(displayToApiType);
    params.set('asset_type', apiTypes.join(','));
  }

  // Statuses
  const allStatuses = [...(filters.statuses || []), ...(filters.statusesAnd || [])];
  if (allStatuses.length) {
    params.set('status', allStatuses.join(','));
  }

  // Countries
  const allCountries = [...(filters.countries || []), ...(filters.countriesAnd || [])];
  if (allCountries.length) {
    params.set('country', allCountries.join(','));
  }

  // Search
  if (filters.search) {
    params.set('q', filters.search);
  }

  return params.toString();
}

// ============================================================================
// API Facets → FacetOption[]
// ============================================================================

function facetObjectToOptions(
  facetObj: Record<string, number>,
  nameMapper?: (name: string) => string
): FacetOption[] {
  return Object.entries(facetObj)
    .map(([value, count]) => ({
      value: nameMapper ? nameMapper(value) : value,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

// ============================================================================
// API Asset → AssetResult
// ============================================================================

function apiAssetToResult(asset: ApiAsset): AssetResult {
  const firstOwner = asset.owners?.[0];
  return {
    asset_id: asset.asset_id,
    name: asset.asset_name,
    tracker: apiTypeToDisplay(asset.asset_type),
    status: asset.operating_status,
    country: asset.country,
    capacity_mw: asset.capacity_value,
    start_year: null, // API doesn't return start year
    owner: firstOwner?.name || '',
    owner_id: firstOwner?.entity_id || '',
  };
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Fetch initial (unfiltered) facets + capacity range in a single API call.
 * Replaces: fetchTrackers + fetchStatuses + fetchCountries + fetchCapacityRange
 */
export async function fetchInitialFacets(): Promise<{
  trackers: FacetOption[];
  statuses: FacetOption[];
  countries: FacetOption[];
  capacityRange: RangeData;
}> {
  const data = await apiFetch<ApiResponse>('/assets?facets=true&limit=1');

  return {
    trackers: facetObjectToOptions(data.facets.asset_type, apiTypeToDisplay),
    statuses: facetObjectToOptions(data.facets.status),
    countries: facetObjectToOptions(data.facets.country),
    capacityRange: {
      min: Math.floor(data.stats.capacity_range.min ?? 0),
      max: Math.ceil(data.stats.capacity_range.max ?? 10000),
    },
  };
}

/**
 * Fetch filtered results with facets in a single API call.
 * Returns results, totalCount, AND updated parametric facet counts.
 */
export async function fetchResults(
  filters: FilterState,
  limit = 50,
  offset = 0
): Promise<{
  results: AssetResult[];
  totalCount: number;
  facets: {
    trackers: FacetOption[];
    statuses: FacetOption[];
    countries: FacetOption[];
  };
}> {
  const filterParams = buildApiParams(filters);
  const paginationParams = `limit=${limit}&offset=${offset}`;
  const queryString = [filterParams, paginationParams, 'facets=true'].filter(Boolean).join('&');

  const data = await apiFetch<ApiResponse>(`/assets?${queryString}`);

  return {
    results: data.results.map(apiAssetToResult),
    totalCount: data.total,
    facets: {
      trackers: facetObjectToOptions(data.facets.asset_type, apiTypeToDisplay),
      statuses: facetObjectToOptions(data.facets.status),
      countries: facetObjectToOptions(data.facets.country),
    },
  };
}

/**
 * Fetch parametric counts for a single facet dimension.
 *
 * The API automatically does exclusion-based faceting — each facet dimension's
 * counts exclude its own filter but include all other filters. So a single call
 * with all active filters returns properly cross-filtered facets for all 3
 * dimensions (tracker, status, country).
 *
 * This function is kept for API compatibility with compose-state but internally
 * just wraps a single faceted API call.
 */
export async function fetchParametricCounts(filters: FilterState): Promise<{
  trackers: FacetOption[];
  statuses: FacetOption[];
  countries: FacetOption[];
}> {
  const filterParams = buildApiParams(filters);
  const queryString = [filterParams, 'facets=true', 'limit=1'].filter(Boolean).join('&');

  const data = await apiFetch<ApiResponse>(`/assets?${queryString}`);

  return {
    trackers: facetObjectToOptions(data.facets.asset_type, apiTypeToDisplay),
    statuses: facetObjectToOptions(data.facets.status),
    countries: facetObjectToOptions(data.facets.country),
  };
}

/**
 * Fetch all matching asset IDs for bulk operations (cart, select all).
 * Paginates through results in batches.
 */
export async function fetchAllMatchingIds(
  filters: FilterState,
  maxResults = 10000
): Promise<Array<{ asset_id: string; name: string }>> {
  const results: Array<{ asset_id: string; name: string }> = [];
  const BATCH = 500;
  let offset = 0;

  while (results.length < maxResults) {
    const filterParams = buildApiParams(filters);
    const queryString = [filterParams, `limit=${BATCH}`, `offset=${offset}`]
      .filter(Boolean)
      .join('&');

    const data = await apiFetch<ApiResponse>(`/assets?${queryString}`);

    for (const asset of data.results) {
      results.push({ asset_id: asset.asset_id, name: asset.asset_name });
    }

    offset += BATCH;
    if (data.results.length < BATCH || results.length >= data.total) break;
  }

  return results.slice(0, maxResults);
}

/**
 * Fetch all matching assets for CSV/JSON export.
 * Same paginated approach as fetchAllMatchingIds but returns full AssetResult.
 */
export async function fetchAllForExport(
  filters: FilterState,
  maxResults = 50000
): Promise<AssetResult[]> {
  const results: AssetResult[] = [];
  const BATCH = 500;
  let offset = 0;

  while (results.length < maxResults) {
    const filterParams = buildApiParams(filters);
    const queryString = [filterParams, `limit=${BATCH}`, `offset=${offset}`]
      .filter(Boolean)
      .join('&');

    const data = await apiFetch<ApiResponse>(`/assets?${queryString}`);

    for (const asset of data.results) {
      results.push(apiAssetToResult(asset));
    }

    offset += BATCH;
    if (data.results.length < BATCH || results.length >= data.total) break;
  }

  return results.slice(0, maxResults);
}
