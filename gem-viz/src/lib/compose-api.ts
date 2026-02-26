/**
 * Compose Page API Layer
 *
 * Replaces DuckDB-based compose-queries.ts with REST API calls.
 * Uses hybrid approach: server-side filters for tracker/status/country,
 * client-side filtering for owner/capacity/share after progressive fetch.
 *
 * API supports multi-value filters via duplicate params:
 *   asset_type=coal-plant&asset_type=oil-gas-plant
 *   status=operating&status=retired
 *   country=China&country=India
 */

import {
  resolveApiSlug,
  resolveApiAssetType,
  type AssetSummary,
  type PaginatedResponse,
} from './ownership-api';
import type { FacetOption, RangeData, ColumnNames } from './compose-queries';

// API base URL (same as ownership-api)
const API_BASE =
  // @ts-expect-error Vite env vars
  import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL ||
  // @ts-expect-error Vite env vars
  import.meta.env?.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

const API_TIMEOUT_MS = 30_000;

/**
 * Fetch assets with multi-value filter support.
 * Uses duplicate query params (asset_type=a&asset_type=b) which the API supports.
 */
async function listAssetsMulti(
  params: ApiParams,
  opts: { limit?: number; offset?: number; facets?: boolean }
): Promise<PaginatedResponse<AssetSummary> & { facets?: Record<string, Record<string, number>> }> {
  const queryStr = buildMultiQuery(params, {
    limit: opts.limit,
    offset: opts.offset,
    facets: opts.facets ? 'true' : undefined,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/assets${queryStr}`, {
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }
    const raw = await response.json();

    // Normalize: API returns array or paginated object
    const page = Array.isArray(raw)
      ? { total: null, limit: null, offset: null, count: raw.length, results: raw }
      : { total: raw.total ?? null, limit: raw.limit ?? null, offset: raw.offset ?? null, count: raw.count ?? raw.results?.length ?? 0, results: raw.results ?? [] };

    // Import normalizeAsset logic — reuse listAssets for asset normalization
    // Actually, we'll use listAssets for single-value and our direct fetch for multi-value
    const { results: _, ...rest } = page;
    const facets = raw.facets;

    // Normalize assets using the same logic as ownership-api
    // We import listAssets which normalizes, but we need to normalize ourselves here
    // Use a simpler normalization that matches what ownership-api does
    const results = page.results.map(normalizeAssetRaw);

    return { ...rest, results, facets };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`API request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Lightweight asset normalization matching ownership-api's normalizeAsset */
function normalizeAssetRaw(raw: Record<string, unknown>): AssetSummary {
  const toNumber = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number' && !Number.isNaN(v)) return v;
    if (typeof v === 'string') {
      const parsed = Number(v.replace(/[^0-9.-]/g, ''));
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };
  const str = (keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && v !== '') return String(v);
    }
    return null;
  };
  const num = (keys: string[]) => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null) return toNumber(v);
    }
    return null;
  };

  const id = String(raw.asset_id || raw.id || '').trim();
  const owners = Array.isArray(raw.owners)
    ? (raw.owners as Array<Record<string, unknown>>).map((o) => ({
        entityId: String(o.entity_id || ''),
        name: String(o.name || ''),
        ownershipShare: toNumber(o.ownership_share),
        hqCountry: o.hq_country ? String(o.hq_country) : null,
      }))
    : undefined;

  return {
    id,
    name: String(raw.asset_name || raw.name || id).trim(),
    facilityType: str(['asset_type', 'Facility Type', 'Tracker', 'facility_type']),
    status: str(['operating_status', 'Status', 'status']),
    capacity: num(['capacity_value', 'Capacity', 'Capacity (MW)', 'capacity']),
    capacityUnit: str(['capacity_unit', 'Capacity Unit']),
    country: str(['country', 'Country Area', 'Country']),
    latitude: num(['latitude', 'Latitude', 'lat']),
    longitude: num(['longitude', 'Longitude', 'lon']),
    ownerName: owners?.[0]?.name || str(['owner', 'Owner']),
    ownerEntityId: owners?.[0]?.entityId || null,
    parentName: null,
    parentEntityId: null,
    owners,
    raw,
  };
}

// Re-export types used by compose-state
export type { FacetOption, RangeData, ColumnNames };

// ============================================================================
// Filter → API param mapping
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
 * Multi-value API params. The API supports duplicate query params
 * (e.g., asset_type=coal-plant&asset_type=oil-gas-plant).
 */
interface ApiParams {
  asset_type?: string[];
  status?: string[];
  country?: string[];
  q?: string;
}

/**
 * Build a query string from ApiParams, supporting arrays as duplicate params.
 */
function buildMultiQuery(params: ApiParams, extra?: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  if (params.asset_type) {
    for (const v of params.asset_type) sp.append('asset_type', v);
  }
  if (params.status) {
    for (const v of params.status) sp.append('status', v);
  }
  if (params.country) {
    for (const v of params.country) sp.append('country', v);
  }
  if (params.q) sp.set('q', params.q);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== '') sp.set(k, String(v));
    }
  }
  sp.set('format', 'json');
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/**
 * Map FilterState to API query params.
 * Multi-value tracker/status/country are sent as duplicate params (API supports this).
 * Only owner/capacity/share filters need client-side processing.
 */
export function filtersToApiParams(filters: FilterState): ApiParams {
  const params: ApiParams = {};

  // Tracker: combine OR + AND selections → resolve to API slugs
  const allTrackers = [...(filters.trackers || []), ...(filters.trackersAnd || [])];
  if (allTrackers.length > 0) {
    const slugs = allTrackers.map(resolveApiSlug).filter((s): s is string => s !== null);
    if (slugs.length > 0) params.asset_type = slugs;
  }

  // Status: combine OR + AND selections
  // API is case-sensitive — always send lowercase
  const allStatuses = [...(filters.statuses || []), ...(filters.statusesAnd || [])];
  if (allStatuses.length > 0) {
    params.status = allStatuses.map((s) => s.toLowerCase());
  }

  // Country: combine OR + AND selections
  const allCountries = [...(filters.countries || []), ...(filters.countriesAnd || [])];
  if (allCountries.length > 0) {
    params.country = allCountries;
  }

  // Text search
  if (filters.search) {
    params.q = filters.search;
  }

  return params;
}

/**
 * Returns true if any active filter requires client-side processing
 * (i.e., cannot be handled by the API alone).
 * Tracker/status/country are now all server-side (multi-value via duplicate params).
 */
export function hasClientSideFilters(filters: FilterState): boolean {
  // Owner filters always need client-side
  if (filters.owners?.length || filters.ownersAnd?.length) return true;

  // Owner country always needs client-side
  if (filters.ownerCountries?.length || filters.ownerCountriesAnd?.length) return true;

  // Numeric range filters need client-side
  if (filters.capacityMin != null || filters.capacityMax != null) return true;
  if (filters.shareMin != null || filters.shareMax != null) return true;

  return false;
}

// ============================================================================
// API Facets
// ============================================================================

export interface ApiFacetsResult {
  trackers: FacetOption[];
  statuses: FacetOption[];
  countries: FacetOption[];
  total: number;
}

/**
 * Single API call to get parametric facet counts.
 * API facets are parametric: each dimension excludes its own filter.
 */
export async function fetchApiFacets(
  filters: Partial<FilterState>
): Promise<ApiFacetsResult> {
  const params = filtersToApiParams(filters as FilterState);

  const response = await listAssetsMulti(params, { limit: 1, facets: true });

  const facets = response.facets || {};
  const total = response.total ?? response.count ?? 0;

  // Convert facet objects to FacetOption arrays
  const toOptions = (obj: Record<string, number> | undefined): FacetOption[] => {
    if (!obj) return [];
    return Object.entries(obj)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);
  };

  return {
    trackers: toOptions(facets.asset_type),
    statuses: toOptions(facets.status),
    countries: toOptions(facets.country),
    total,
  };
}

// ============================================================================
// API Results
// ============================================================================

export interface ComposeRow {
  asset_id: string;
  name: string;
  tracker: string;
  status: string;
  country: string;
  capacity_mw: number | null;
  owner: string;
  owner_id: string;
}

/**
 * Fetch a page of results from the API, mapped to compose row format.
 */
export async function fetchApiResults(
  filters: FilterState,
  limit = 50,
  offset = 0
): Promise<{ results: ComposeRow[]; totalCount: number }> {
  const params = filtersToApiParams(filters);

  const response = await listAssetsMulti(params, { limit, offset });

  const results = response.results.map(assetToComposeRow);
  return {
    results,
    totalCount: response.total ?? response.count ?? results.length,
  };
}

function assetToComposeRow(asset: AssetSummary): ComposeRow {
  const firstOwner = asset.owners?.[0];
  return {
    asset_id: asset.id,
    name: asset.name,
    tracker: asset.facilityType || '',
    status: asset.status || '',
    country: asset.country || '',
    capacity_mw: asset.capacity ?? null,
    owner: firstOwner?.name || asset.ownerName || '',
    owner_id: firstOwner?.entityId || asset.ownerEntityId || '',
  };
}

// ============================================================================
// Progressive Fetch (for client-side filtering)
// ============================================================================

/**
 * Paginate through all matching assets from the API.
 * Calls onProgress for UI feedback.
 */
export async function paginateAllMatching(
  filters: FilterState,
  onProgress?: (fetched: number, total: number) => void
): Promise<AssetSummary[]> {
  const params = filtersToApiParams(filters);
  const BATCH = 500;
  const MAX_OFFSET = 50000;
  const allAssets: AssetSummary[] = [];
  let offset = 0;
  let total = 0;

  while (offset < MAX_OFFSET) {
    const response = await listAssetsMulti(params, {
      limit: BATCH,
      offset,
      facets: offset === 0, // only get facets on first request for total
    });

    if (offset === 0) {
      total = response.total ?? response.count ?? 0;
    }

    allAssets.push(...response.results);
    onProgress?.(allAssets.length, total);

    if (response.results.length < BATCH) break;
    offset += BATCH;
  }

  return allAssets;
}

// ============================================================================
// Client-Side Filtering
// ============================================================================

/**
 * Filter an array of AssetSummary objects using the full filter state.
 * Used after progressive fetch for filters the API doesn't support.
 */
export function clientSideFilter(
  assets: AssetSummary[],
  filters: FilterState
): AssetSummary[] {
  return assets.filter((asset) => {
    // Multi-value tracker filter
    const allTrackers = [...(filters.trackers || []), ...(filters.trackersAnd || [])];
    if (allTrackers.length > 1) {
      const apiType = asset.facilityType || '';
      if (!allTrackers.some((t) => resolveApiAssetType(t) === apiType || t === apiType)) {
        return false;
      }
    }

    // Multi-value status filter
    const allStatuses = [...(filters.statuses || []), ...(filters.statusesAnd || [])];
    if (allStatuses.length > 1) {
      const status = (asset.status || '').toLowerCase();
      if (!allStatuses.some((s) => s.toLowerCase() === status)) {
        return false;
      }
    }

    // Multi-value country filter
    const allCountries = [...(filters.countries || []), ...(filters.countriesAnd || [])];
    if (allCountries.length > 1) {
      if (!allCountries.includes(asset.country || '')) {
        return false;
      }
    }

    // Owner filter (OR)
    if (filters.owners?.length) {
      const ownerNames = (asset.owners || []).map((o) => o.name);
      if (!ownerNames.length && asset.ownerName) ownerNames.push(asset.ownerName);
      if (!filters.owners.some((o) => ownerNames.includes(o))) {
        return false;
      }
    }

    // Owner AND filter: asset must have ALL specified owners
    if (filters.ownersAnd?.length) {
      const ownerNames = new Set((asset.owners || []).map((o) => o.name));
      if (asset.ownerName) ownerNames.add(asset.ownerName);
      if (!filters.ownersAnd.every((o) => ownerNames.has(o))) {
        return false;
      }
    }

    // Owner country filter
    const allOwnerCountries = [
      ...(filters.ownerCountries || []),
      ...(filters.ownerCountriesAnd || []),
    ];
    if (allOwnerCountries.length) {
      const ownerCountries = (asset.owners || [])
        .map((o) => o.hqCountry)
        .filter(Boolean) as string[];
      if (!allOwnerCountries.some((c) => ownerCountries.includes(c))) {
        return false;
      }
    }

    // Capacity range
    if (filters.capacityMin != null) {
      if (asset.capacity == null || asset.capacity < filters.capacityMin) return false;
    }
    if (filters.capacityMax != null) {
      if (asset.capacity == null || asset.capacity > filters.capacityMax) return false;
    }

    // Share range (check all owners)
    if (filters.shareMin != null || filters.shareMax != null) {
      const shares = (asset.owners || [])
        .map((o) => o.ownershipShare)
        .filter((s): s is number => s != null);
      if (!shares.length) return false;
      const maxShare = Math.max(...shares);
      if (filters.shareMin != null && maxShare < filters.shareMin) return false;
      if (filters.shareMax != null && maxShare > filters.shareMax) return false;
    }

    return true;
  });
}

// ============================================================================
// Client-Side Facet Derivation
// ============================================================================

/**
 * Create a copy of filters with one dimension zeroed out.
 * Used for parametric faceting: each dimension's counts exclude its own filter.
 */
function filtersExcluding(
  filters: FilterState,
  exclude: string
): FilterState {
  const copy = { ...filters };
  switch (exclude) {
    case 'trackers':
      copy.trackers = [];
      copy.trackersAnd = [];
      break;
    case 'statuses':
      copy.statuses = [];
      copy.statusesAnd = [];
      break;
    case 'countries':
      copy.countries = [];
      copy.countriesAnd = [];
      break;
    case 'ownerCountries':
      copy.ownerCountries = [];
      copy.ownerCountriesAnd = [];
      break;
    case 'owners':
      copy.owners = [];
      copy.ownersAnd = [];
      break;
    case 'capacity':
      copy.capacityMin = null;
      copy.capacityMax = null;
      break;
    case 'share':
      copy.shareMin = null;
      copy.shareMax = null;
      break;
  }
  return copy;
}

/** Derive owner facet options from cached assets */
export function deriveOwnerFacets(assets: AssetSummary[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const owners = asset.owners || [];
    if (owners.length) {
      for (const o of owners) {
        if (o.name) counts.set(o.name, (counts.get(o.name) || 0) + 1);
      }
    } else if (asset.ownerName) {
      counts.set(asset.ownerName, (counts.get(asset.ownerName) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 1000);
}

/** Derive owner HQ country facet options from cached assets */
export function deriveOwnerCountryFacets(assets: AssetSummary[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    for (const o of asset.owners || []) {
      if (o.hqCountry) counts.set(o.hqCountry, (counts.get(o.hqCountry) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Derive tracker facet from assets */
function deriveTrackerFacets(assets: AssetSummary[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const t = asset.facilityType || '';
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Derive status facet from assets */
function deriveStatusFacets(assets: AssetSummary[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const s = asset.status || '';
    if (s) counts.set(s, (counts.get(s) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/** Derive country facet from assets */
function deriveCountryFacets(assets: AssetSummary[]): FacetOption[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    const c = asset.country || '';
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Derive ALL parametric facet counts from cached assets.
 * Each dimension excludes its own filter (proper parametric behavior).
 */
export function deriveAllParametricFacets(
  cachedAssets: AssetSummary[],
  filters: FilterState
): {
  trackers: FacetOption[];
  statuses: FacetOption[];
  countries: FacetOption[];
  owners: FacetOption[];
  ownerCountries: FacetOption[];
} {
  // For each dimension, filter excluding that dimension, then count
  const trackersFiltered = clientSideFilter(cachedAssets, filtersExcluding(filters, 'trackers'));
  const statusesFiltered = clientSideFilter(cachedAssets, filtersExcluding(filters, 'statuses'));
  const countriesFiltered = clientSideFilter(cachedAssets, filtersExcluding(filters, 'countries'));
  const ownersFiltered = clientSideFilter(cachedAssets, filtersExcluding(filters, 'owners'));
  const ownerCountriesFiltered = clientSideFilter(cachedAssets, filtersExcluding(filters, 'ownerCountries'));

  return {
    trackers: deriveTrackerFacets(trackersFiltered),
    statuses: deriveStatusFacets(statusesFiltered),
    countries: deriveCountryFacets(countriesFiltered),
    owners: deriveOwnerFacets(ownersFiltered),
    ownerCountries: deriveOwnerCountryFacets(ownerCountriesFiltered),
  };
}

/** Derive capacity range from cached assets */
export function deriveCapacityRange(assets: AssetSummary[]): RangeData {
  let min = Infinity;
  let max = -Infinity;
  for (const asset of assets) {
    if (asset.capacity != null && !isNaN(asset.capacity)) {
      if (asset.capacity < min) min = asset.capacity;
      if (asset.capacity > max) max = asset.capacity;
    }
  }
  return {
    min: min === Infinity ? 0 : Math.floor(min),
    max: max === -Infinity ? 10000 : Math.ceil(max),
  };
}

// ============================================================================
// Static Column/Tracker Info
// ============================================================================

/** Hardcoded column names (schema is stable across API) */
export const STATIC_COLUMN_NAMES: ColumnNames = {
  tracker: 'Tracker',
  status: 'Status',
  country: null,
  ownerCountry: 'Owner Headquarters Country',
  owner: 'Owner',
  project: 'Project',
  capacity: 'Capacity (MW)',
  share: 'Share',
  startYear: null, // API doesn't return start_year
};

/** Hardcoded ownership columns list */
export const STATIC_COLUMNS = [
  'Tracker',
  'Status',
  'Owner',
  'Owner Headquarters Country',
  'Project',
  'Capacity (MW)',
  'Share',
];

/** Static tracker column availability (all API asset types have capacity) */
export const STATIC_TRACKER_COLUMNS: Record<
  string,
  { hasCapacity: boolean; hasStartYear: boolean; hasShare: boolean }
> = {
  'Coal Plant': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Oil & Gas Plant': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Iron Ore Mine': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Iron & Steel Plant': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Natural Gas Transmission Pipeline': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Oil or NGL Pipeline': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Cement or Concrete Plant': { hasCapacity: true, hasStartYear: false, hasShare: true },
  'Bioenergy Plant': { hasCapacity: true, hasStartYear: false, hasShare: true },
};

/**
 * Get the cache key for server-side filter params.
 * Used to invalidate the client-side cache when server-side filters change.
 */
export function getServerCacheKey(filters: FilterState): string {
  const params = filtersToApiParams(filters);
  return JSON.stringify(params);
}
