/**
 * =============================================================================
 * SCREENER DATA LAYER
 * =============================================================================
 *
 * Centralized data fetching for the Asset Class Screener flow.
 * All screener pages should import from here, NOT directly from
 * ownership-api.ts.
 *
 * =============================================================================
 * DATA FLOW (as of Feb 2026)
 * =============================================================================
 *
 * STEP 1: Asset Class Selection (/screener)
 *   Data: Static config from tracker-schema.ts — instant, no API calls
 *
 * STEP 2: Owner Search (/screener/owners)
 *   Data: REST API — GET /entities?q={search}
 *
 * STEP 3: Results (/screener/results)
 *   getAssetTypeCounts(): ✅ REST API — ?facets=true (exact counts)
 *   getOwnersByAssetType(): ✅ REST API — paginated /assets with owners[]
 *     Paginates GET /assets?asset_type={slug}&status=X&country=Y
 *     Aggregates owners client-side from the owners[] array per asset
 *     Paginates all assets and aggregates owners client-side
 *
 * =============================================================================
 */

import { browser } from '$app/environment';
import { getAPIBase } from '$lib/ownership-api';
import { logApiCall } from '$lib/api-log.svelte';
import { pointInPolygon } from '$lib/utils/geo-utils';
import { matchesStatusFilter } from '$lib/data-config/tracker-schema';

// =============================================================================
// GEM TRACKER NAME → UI TRACKER NAME BRIDGE
// =============================================================================

/**
 * Maps raw GEM tracker names (used in asset-class-definitions.ts) to the
 * UI TrackerName values that the API understands.
 * Most are identity; only two differ.
 */
import { API_TYPE_TO_TRACKER } from '$lib/data-config/tracker-schema';

const GEM_TO_UI_TRACKER: Record<string, string> = API_TYPE_TO_TRACKER;

export function gemTrackerToUiTracker(gemName: string): string {
  return GEM_TO_UI_TRACKER[gemName] ?? gemName;
}

// =============================================================================
// TYPES
// =============================================================================

export interface ScreenerOwner {
  entityId: string;
  name: string;
  totalAssets: number;
  filteredAssets: number;
  totalProjects: number;
  filteredProjects: number;
  /** Flattened values from the external_ids object — used for fast local ID search */
  externalIds?: string[];
  /** Alternative names: full_name, name_local, name_other, abbreviation (non-null) */
  altNames?: string[];
}

export interface ScreenerResultsResponse {
  owners: ScreenerOwner[];
  source: 'rest-api' | 'cache';
  queryTimeMs: number;
  totalCount?: number;
}

export interface EntitySearchResult {
  id: string;
  name: string;
  headquartersCountry?: string | null;
  assetCount?: number;
}

export interface BulkSearchResponse {
  results: Record<string, EntitySearchResult[]>;
  source: 'rest-api' | 'rest-api-sequential';
  queryTimeMs: number;
  apiCallCount: number;
}

export interface ScreenerFilters {
  tracker: string;
  status?: string;
  statuses?: string[];
  country?: string | string[];
  ownerIds?: string[];
  assetClassId?: string;
  selectedSubClasses?: string[];
  geofence?: number[][];
  [key: string]: unknown;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const OWNERSHIP_API_BASE = getAPIBase();

/**
 * Entity IDs that represent aggregated placeholder owners (not real companies).
 * "small shareholders" and "natural person(s)" appear as a single entity each
 * but actually represent many separate real-world owners — they should be
 * excluded from owner lists, examples, and visualizations.
 */
export const EXCLUDED_ENTITY_IDS = new Set([
  'E100001015587', // small shareholders
  'E100000123261', // natural person(s)
  'E100000132388', // unknown
]);

/** Enable detailed console logging (gated to dev mode) */
const DEBUG = import.meta.env.DEV;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Cache TTL for asset type counts (1 hour — counts rarely change) */
const CACHE_TTL_COUNTS_MS = 60 * 60 * 1000;

const ENABLE_BATCH_SEARCH =
  browser && localStorage.getItem('__GEM_SCREENER_BATCH_SEARCH__') === '1';

/** In-memory cache for owner results */
const resultsCache = new Map<string, { data: ScreenerResultsResponse; timestamp: number }>();

/** In-memory cache for asset type counts */
const countsCache = new Map<string, { data: Record<string, number>; timestamp: number }>();

// =============================================================================
// LOGGING / PROFILING
// =============================================================================

interface QueryLog {
  timestamp: Date;
  operation: string;
  durationMs: number;
  source: string;
  params: Record<string, unknown>;
  resultCount: number;
  error?: string;
}

const queryLogs: QueryLog[] = [];

function logQuery(log: QueryLog) {
  queryLogs.push(log);
  if (queryLogs.length > 100) queryLogs.splice(0, queryLogs.length - 100);
  if (DEBUG) {
    const status = log.error ? '❌' : '✅';
    console.log(
      `[screener-api] ${status} ${log.operation} | ${log.durationMs.toFixed(0)}ms | ${log.resultCount} results | ${log.source}`
    );
    if (log.error) console.error(`[screener-api] Error:`, log.error);
  }
}

// =============================================================================
// RESULTS PAGE: GET OWNERS BY ASSET TYPE
// =============================================================================

/**
 * Get owners with stakes in a specific asset type.
 *
 * REST API — paginates /assets?asset_type={slug} and aggregates
 * owners client-side from the owners[] array on each asset.
 */
export async function getOwnersByAssetType(
  filters: ScreenerFilters,
  options: { limit?: number; skipCache?: boolean } = {}
): Promise<ScreenerResultsResponse> {
  const startTime = performance.now();
  const { limit = 200, skipCache = false } = options;

  // Build cache key (sort filter keys for consistent caching)
  const sortedFilters = Object.keys(filters)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = filters[k];
      return acc;
    }, {});
  const cacheKey = JSON.stringify({ filters: sortedFilters, limit });

  // Check cache first
  if (!skipCache) {
    const cached = resultsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      logQuery({
        timestamp: new Date(),
        operation: 'getOwnersByAssetType',
        durationMs: performance.now() - startTime,
        source: 'cache',
        params: filters,
        resultCount: cached.data.owners.length,
      });
      return { ...cached.data, source: 'cache' };
    }
  }

  const restResult = await getOwnersByAssetTypeREST(filters, limit, startTime);
  resultsCache.set(cacheKey, { data: restResult, timestamp: Date.now() });
  return restResult;
}

/**
 * Async generator that paginates a fully-qualified catalog URL.
 * Uses listAssets() so results go through normalizeAsset() field mapping.
 */
async function* paginateCatalogUrl(
  baseUrl: string
): AsyncGenerator<import('$lib/ownership-api').AssetSummary[], void, unknown> {
  const { listAssets } = await import('$lib/ownership-api');
  const BATCH = 500;
  let offset = 0;
  const MAX_OFFSET = 50000;

  // Parse the catalog URL to extract path params and pass them to listAssets
  const [, existingQs] = baseUrl.split('?');
  const existingParams = new URLSearchParams(existingQs ?? '');

  // Collect all params into a plain object for listAssets
  // listAssets uses buildQuery() which handles repeated keys via arrays
  const paramMap: Record<string, string | string[]> = {};
  for (const [key, value] of existingParams.entries()) {
    const existing = paramMap[key];
    if (existing === undefined) {
      paramMap[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      paramMap[key] = [existing, value];
    }
  }

  while (offset < MAX_OFFSET) {
    const page = await listAssets({ ...paramMap, limit: BATCH, offset } as Parameters<
      typeof listAssets
    >[0]);
    if (!page?.results?.length) break;
    yield page.results;
    if (page.results.length < BATCH) break;
    offset += BATCH;
  }
}

/**
 * REST API implementation: paginate /assets?asset_type={slug} and
 * aggregate owners client-side from the owners[] array on each asset.
 *
 * When filters.catalogUrl is present, uses that URL directly (server already
 * encodes asset_type + subclass + status + country params). Falls back to the
 * legacy tracker-slug approach otherwise.
 */
async function getOwnersByAssetTypeREST(
  filters: ScreenerFilters,
  limit: number,
  startTime: number
): Promise<ScreenerResultsResponse> {
  const { resolveApiSlug, paginateAssetsByType } = await import('$lib/ownership-api');

  // ── Catalog URL fast path ─────────────────────────────────────────
  // When a catalogUrl is present, skip slug resolution and class matching entirely.
  // The server has already encoded all subclass/status/country filters in the URL.
  const catalogUrl = filters.catalogUrl as string | undefined;

  let pageIterator: AsyncGenerator<import('$lib/ownership-api').AssetSummary[], void, unknown>;

  if (catalogUrl) {
    pageIterator = paginateCatalogUrl(catalogUrl);
  } else {
    // Legacy path: resolve tracker name → API slug
    const trackerName = filters.tracker || '';
    const apiSlug = resolveApiSlug(trackerName);
    if (!apiSlug) {
      throw new Error(`Cannot resolve API slug for tracker: ${trackerName}`);
    }
    pageIterator = paginateAssetsByType(apiSlug, {
      status: undefined,
      country: filters.country,
    });
  }

  // Accumulate owners: entityId → { name, totalAssetIds (pre-filter), filteredAssetIds (post-filter) }
  const ownerMap = new Map<
    string,
    { name: string; totalAssetIds: Set<string>; filteredAssetIds: Set<string> }
  >();
  const hasOwnerFilter = filters.ownerIds && filters.ownerIds.length > 0;
  const ownerIdSet = hasOwnerFilter ? new Set(filters.ownerIds) : null;

  // Multi-status filter: only needed for legacy path (catalogUrl encodes status server-side)
  const statusArray =
    !catalogUrl && filters.statuses && filters.statuses.length > 0
      ? filters.statuses.map((s) => s.toLowerCase())
      : !catalogUrl && filters.status
        ? [filters.status.toLowerCase()]
        : null;

  const geofence = filters.geofence || null;

  // Class matcher only needed for legacy path (catalogUrl encodes subclass server-side)
  let classMatcher: ((_record: Record<string, unknown>) => boolean) | null = null;
  if (!catalogUrl && filters.assetClassId) {
    const { getAssetClassById, buildClassMatcher } = await import(
      '$lib/data-config/asset-class-definitions'
    );
    const assetClass = getAssetClassById(filters.assetClassId);
    if (assetClass) {
      const selectedSubClassIds = Array.isArray(filters.selectedSubClasses)
        ? filters.selectedSubClasses
        : undefined;
      classMatcher = buildClassMatcher(assetClass, selectedSubClassIds);
    }
  }

  let pageCount = 0;
  for await (const page of pageIterator) {
    pageCount++;
    for (const asset of page) {
      if (classMatcher && !classMatcher(asset.raw || {})) continue;
      if (!asset.owners || asset.owners.length === 0) continue;

      // Determine if this asset passes the status/geofence filters
      let passesFilters = true;

      if (geofence) {
        const lng = asset.longitude ?? (asset.raw as Record<string, unknown>)?.longitude;
        const lat = asset.latitude ?? (asset.raw as Record<string, unknown>)?.latitude;
        if (typeof lng !== 'number' || typeof lat !== 'number') passesFilters = false;
        else if (!pointInPolygon([lng, lat], geofence)) passesFilters = false;
      }

      if (passesFilters && statusArray) {
        if (!matchesStatusFilter(asset.status, asset.subStatus, statusArray)) {
          passesFilters = false;
        }
      }

      for (const owner of asset.owners) {
        if (!owner.entityId) continue;
        if (ownerIdSet && !ownerIdSet.has(owner.entityId)) continue;

        let entry = ownerMap.get(owner.entityId);
        if (!entry) {
          entry = { name: owner.name, totalAssetIds: new Set(), filteredAssetIds: new Set() };
          ownerMap.set(owner.entityId, entry);
        }
        entry.totalAssetIds.add(asset.id);
        if (passesFilters) {
          entry.filteredAssetIds.add(asset.id);
        }
      }
    }
  }

  // Sort by filtered asset count descending, take top N
  const sorted = [...ownerMap.entries()]
    .filter(([entityId, { filteredAssetIds }]) => filteredAssetIds.size > 0 && !EXCLUDED_ENTITY_IDS.has(entityId))
    .map(([entityId, { name, totalAssetIds, filteredAssetIds }]) => ({
      entityId,
      name,
      totalAssets: totalAssetIds.size,
      filteredAssets: filteredAssetIds.size,
      totalProjects: 0,
      filteredProjects: 0,
    }))
    .sort((a, b) => b.filteredAssets - a.filteredAssets)
    .slice(0, limit);

  const queryTimeMs = performance.now() - startTime;

  logQuery({
    timestamp: new Date(),
    operation: 'getOwnersByAssetType',
    durationMs: queryTimeMs,
    source: 'rest-api',
    params: { ...filters, pages: pageCount },
    resultCount: sorted.length,
  });

  return { owners: sorted, source: 'rest-api', queryTimeMs };
}

// =============================================================================
// OWNERS PAGE: ENTITY SEARCH
// =============================================================================

/**
 * Search for entities by name or ID.
 *
 * CURRENT IMPLEMENTATION:
 * - Single REST API call to GET /entities?q={query}
 *
 * This one is fine for single searches. The problem is bulk search.
 */
export async function searchEntities(
  query: string,
  options: { limit?: number } = {}
): Promise<EntitySearchResult[]> {
  const startTime = performance.now();
  const { limit = 20 } = options;

  try {
    const { listEntities, getEntity } = await import('$lib/ownership-api');

    // Check if it's a GEM Entity ID (E followed by digits)
    if (/^E\d+$/i.test(query.trim())) {
      try {
        const entity = await getEntity(query.trim().toUpperCase());
        if (entity) {
          logQuery({
            timestamp: new Date(),
            operation: 'searchEntities',
            durationMs: performance.now() - startTime,
            source: 'rest-api',
            params: { query, type: 'direct-id' },
            resultCount: 1,
          });
          return [
            {
              id: entity.id,
              name: entity.name,
              headquartersCountry: entity.headquartersCountry,
            },
          ];
        }
      } catch {
        // Fall through to search
      }
    }

    // Text search
    const response = await listEntities({ q: query, limit });
    const results: EntitySearchResult[] = (response.results || []).map((e) => ({
      id: e.id,
      name: e.name,
      headquartersCountry: e.headquartersCountry,
    }));

    logQuery({
      timestamp: new Date(),
      operation: 'searchEntities',
      durationMs: performance.now() - startTime,
      source: 'rest-api',
      params: { query, limit },
      resultCount: results.length,
    });

    return results;
  } catch (error) {
    logQuery({
      timestamp: new Date(),
      operation: 'searchEntities',
      durationMs: performance.now() - startTime,
      source: 'rest-api',
      params: { query },
      resultCount: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Bulk search for multiple entities.
 *
 * CURRENT IMPLEMENTATION (SLOW):
 * - Fires N parallel requests, one per search term
 * - Can overwhelm API, hit rate limits
 *
 * FUTURE IMPLEMENTATION (when backend ready):
 * - Single POST /entities/search/batch request
 *
 * @param queries - Array of search terms
 * @param options - Limit per query, max concurrent requests
 */
export async function searchEntitiesBulk(
  queries: string[],
  options: { limitPerQuery?: number; maxConcurrent?: number } = {}
): Promise<BulkSearchResponse> {
  const startTime = performance.now();
  const { limitPerQuery = 10, maxConcurrent = 10 } = options;

  // Dedupe and clean queries
  const cleanQueries = [...new Set(queries.map((q) => q.trim()).filter((q) => q.length > 0))];

  if (cleanQueries.length === 0) {
    return { results: {}, source: 'rest-api-sequential', queryTimeMs: 0, apiCallCount: 0 };
  }

  // Try batch endpoint first (when backend ships it)
  if (ENABLE_BATCH_SEARCH) {
    try {
      return await searchEntitiesBulkREST(cleanQueries, limitPerQuery, startTime);
    } catch (e) {
      if (import.meta.env.DEV)
        console.warn('[screener-api] Batch search endpoint failed, falling back to sequential:', e);
    }
  }

  // Fallback: parallel individual requests
  return await searchEntitiesBulkSequential(cleanQueries, limitPerQuery, maxConcurrent, startTime);
}

/**
 * CURRENT: Sequential/parallel individual requests (slow, hammers API)
 *
 * This fires up to maxConcurrent requests at a time.
 * We want to replace this with a single batch request.
 */
async function searchEntitiesBulkSequential(
  queries: string[],
  limitPerQuery: number,
  maxConcurrent: number,
  startTime: number
): Promise<BulkSearchResponse> {
  const results: Record<string, EntitySearchResult[]> = {};
  let apiCallCount = 0;

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < queries.length; i += maxConcurrent) {
    const batch = queries.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(async (query) => {
        apiCallCount++;
        try {
          const entities = await searchEntities(query, { limit: limitPerQuery });
          return { query, entities };
        } catch {
          return { query, entities: [] };
        }
      })
    );

    for (const { query, entities } of batchResults) {
      results[query] = entities;
    }
  }

  const queryTimeMs = performance.now() - startTime;

  logQuery({
    timestamp: new Date(),
    operation: 'searchEntitiesBulk',
    durationMs: queryTimeMs,
    source: 'rest-api-sequential',
    params: { queryCount: queries.length, maxConcurrent },
    resultCount: Object.values(results).reduce((sum, arr) => sum + arr.length, 0),
  });

  return {
    results,
    source: 'rest-api-sequential',
    queryTimeMs,
    apiCallCount,
  };
}

/**
 * Batch REST API implementation for entity search.
 * Enable via: localStorage.setItem('__GEM_SCREENER_BATCH_SEARCH__', '1')
 *
 * Expects backend endpoint:
 * POST /entities/search/batch
 * Body: { queries: ["Shell", "BP", ...], limit_per_query: 10 }
 * Returns: { results: { "Shell": [...], "BP": [...] } }
 */
async function searchEntitiesBulkREST(
  queries: string[],
  limitPerQuery: number,
  startTime: number
): Promise<BulkSearchResponse> {
  const fetchUrl = `${OWNERSHIP_API_BASE}/entities/search/batch`;
  const t0 = performance.now();
  const response = await fetch(fetchUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries, limit_per_query: limitPerQuery }),
  });
  logApiCall({
    url: fetchUrl,
    method: 'POST',
    status: response.status,
    durationMs: performance.now() - t0,
    timestamp: new Date(),
    error: response.ok ? undefined : `${response.status}`,
    reason: 'searchEntitiesBulk (screener)',
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Batch search failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const queryTimeMs = performance.now() - startTime;

  // Normalize — each result entry should match EntitySearchResult shape
  const results: Record<string, EntitySearchResult[]> = {};
  for (const [term, entities] of Object.entries(data.results || {})) {
    results[term] = (entities as Array<Record<string, unknown>>).map((e) => ({
      id: String(e.id || e.entity_id || ''),
      name: String(e.name || e.full_name || ''),
      headquartersCountry: (e.headquarters_country || e.headquartersCountry || null) as
        | string
        | null,
    }));
  }

  logQuery({
    timestamp: new Date(),
    operation: 'searchEntitiesBulk',
    durationMs: queryTimeMs,
    source: 'rest-api',
    params: { queryCount: queries.length },
    resultCount: Object.values(results).flat().length,
  });

  return { results, source: 'rest-api', queryTimeMs, apiCallCount: 1 };
}

// =============================================================================
// OWNERS PAGE: GET OWNERS BY FILTER (calls /owners endpoint)
// =============================================================================

export interface OwnersFilterParams {
  tracker: string;
  assetClassId?: string;
  status?: string | string[];
  country?: string | string[];
  /** Pre-built catalog /owners URL — when present, bypasses tracker → slug resolution and uses this URL directly (with pagination appended). Status and geography are already encoded in the URL. */
  catalogOwnersUrl?: string;
}

/** In-memory cache for /owners endpoint responses */
const ownersByFilterCache = new Map<
  string,
  { data: ScreenerResultsResponse; timestamp: number }
>();

/**
 * Fetch the pre-aggregated owner list from the `/owners` REST endpoint.
 * Falls back to `getOwnersByAssetType()` if the endpoint is unavailable.
 *
 * Called when the user lands on the owners search page so that:
 *  - "View all owners" can show the full list instantly
 *  - "Try" examples can be drawn from real top owners
 *  - Search results can be cross-referenced to determine which entities
 *    actually have assets in the selected class (Tier 1 vs Tier 2)
 */
export async function getOwnersByFilter(
  params: OwnersFilterParams,
  options: { limit?: number; skipCache?: boolean } = {}
): Promise<ScreenerResultsResponse> {
  const startTime = performance.now();
  const { skipCache = false } = options;

  const cacheKey = JSON.stringify({ params });
  if (!skipCache) {
    const cached = ownersByFilterCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.data, source: 'cache' };
    }
  }

  try {
    const { logApiCall } = await import('$lib/api-log.svelte');
    const PAGE_SIZE = 500; // API hard cap

    // Build base params — either from catalogOwnersUrl or tracker slug
    let baseParams: URLSearchParams;
    if (params.catalogOwnersUrl) {
      // catalogOwnersUrl already encodes asset_type, status, geography etc.
      // Strip any existing limit/offset so we control pagination.
      const parsed = new URLSearchParams(params.catalogOwnersUrl.split('?')[1] ?? '');
      parsed.delete('limit');
      parsed.delete('offset');
      baseParams = parsed;
    } else {
      const { resolveApiSlug } = await import('$lib/ownership-api');
      const apiSlug = resolveApiSlug(params.tracker);
      if (!apiSlug) throw new Error(`Cannot resolve API slug for tracker: ${params.tracker}`);
      baseParams = new URLSearchParams();
      baseParams.set('asset_type', apiSlug);
      const statuses = Array.isArray(params.status)
        ? params.status
        : params.status
          ? [params.status]
          : [];
      for (const s of statuses) baseParams.append('status', s);
      const countries = Array.isArray(params.country)
        ? params.country
        : params.country
          ? [params.country]
          : [];
      for (const c of countries) baseParams.append('country', c);
    }
    baseParams.set('limit', String(PAGE_SIZE));

    const rawOwners: Array<Record<string, unknown>> = [];
    let offset = 0;
    let total = Infinity;

    while (rawOwners.length < total) {
      const p = new URLSearchParams(baseParams);
      p.set('offset', String(offset));
      const base = params.catalogOwnersUrl
        ? params.catalogOwnersUrl.split('?')[0]
        : `${OWNERSHIP_API_BASE}/owners`;
      const url = `${base}?${p.toString()}`;
      const t0 = performance.now();
      const resp = await fetch(url);
      logApiCall({
        url,
        method: 'GET',
        status: resp.status,
        durationMs: performance.now() - t0,
        timestamp: new Date(),
        error: resp.ok ? undefined : `${resp.status}`,
        reason: 'getOwnersByFilter (screener owners page)',
      });

      if (!resp.ok) throw new Error(`/owners returned ${resp.status}`);

      const data = await resp.json();

      if (import.meta.env.DEV && offset === 0) {
        const sample = Array.isArray(data) ? data[0] : (data.results ?? data.owners ?? [])[0];
        console.log('[screener-api] /owners raw response sample:', sample);
      }

      const page: Array<Record<string, unknown>> = Array.isArray(data)
        ? data
        : (data.results ?? data.owners ?? []);

      rawOwners.push(...page);
      total = typeof data.total === 'number' ? data.total : rawOwners.length;
      offset += PAGE_SIZE;

      // Stop if the page was empty or we've fetched everything
      if (page.length === 0) break;
    }

    const owners: ScreenerOwner[] = rawOwners
      .map((o) => {
        // Flatten external_ids (object, array, or null) into a searchable string array
        const rawExtIds = o.external_ids;
        let externalIds: string[] | undefined;
        if (rawExtIds && typeof rawExtIds === 'object') {
          const vals = Array.isArray(rawExtIds)
            ? rawExtIds
            : Object.values(rawExtIds as Record<string, unknown>);
          const ids = vals.filter((v): v is string => typeof v === 'string' && Boolean(v));
          if (ids.length > 0) externalIds = ids;
        }

        // Collect non-null alternative name fields into a flat array
        const altNameCandidates = [o.full_name, o.name_local, o.name_other, o.abbreviation]
          .filter((v): v is string => typeof v === 'string' && Boolean(v));
        const altNames = altNameCandidates.length > 0 ? altNameCandidates : undefined;

        return {
          entityId: String(
            o.entity_id ?? o.entityId ??
            (o.entity && typeof o.entity === 'object' ? (o.entity as Record<string, unknown>).id : undefined) ??
            o.id ?? ''
          ),
          name: String(
            o.entity_name ?? o.name ?? o.full_name ?? o.owner_name ??
            o.display_name ??
            (o.entity && typeof o.entity === 'object' ? (o.entity as Record<string, unknown>).name : undefined) ??
            ''
          ),
          totalAssets: Number(
            o.total_asset_count ?? o.total_assets ?? o.totalAssets ?? o.asset_count ?? o.count ?? 0
          ),
          filteredAssets: Number(
            o.asset_count ?? o.filtered_asset_count ?? o.filtered_assets ??
            o.total_asset_count ?? o.total_assets ?? o.count ?? 0
          ),
          totalProjects: Number(
            o.total_location_count ?? 0
          ),
          filteredProjects: Number(
            o.location_count ?? 0
          ),
          ...(externalIds && { externalIds }),
          ...(altNames && { altNames }),
        };
      })
      .filter((o) => o.entityId && o.name && !EXCLUDED_ENTITY_IDS.has(o.entityId));

    const result: ScreenerResultsResponse = {
      owners,
      source: 'rest-api',
      queryTimeMs: performance.now() - startTime,
      totalCount: owners.length,
    };

    if (import.meta.env.DEV) {
      console.log(`[screener-api] /owners OK — ${owners.length} owners via rest-api in ${result.queryTimeMs.toFixed(0)}ms`);
    }

    ownersByFilterCache.set(cacheKey, { data: result, timestamp: Date.now() });

    logQuery({
      timestamp: new Date(),
      operation: 'getOwnersByFilter',
      durationMs: result.queryTimeMs,
      source: 'rest-api',
      params: params as unknown as Record<string, unknown>,
      resultCount: owners.length,
    });

    return result;
  } catch (err) {
    // Fallback: derive owner list the old way (expensive but reliable)
    if (import.meta.env.DEV) {
      console.warn('[screener-api] /owners endpoint unavailable, falling back to asset scan:', err);
    }
    const filters: ScreenerFilters = {
      tracker: params.tracker,
      assetClassId: params.assetClassId,
      status: Array.isArray(params.status) ? params.status[0] : params.status,
      statuses: Array.isArray(params.status) ? params.status : params.status ? [params.status] : undefined,
      country: params.country,
    };
    return getOwnersByAssetType(filters, { skipCache });
  }
}

// =============================================================================
// ASSET TYPE COUNTS (for preset cards)
// =============================================================================

/**
 * Get exact asset counts by type using API facets.
 * Cached for 1 hour since counts rarely change.
 */
export async function getAssetTypeCounts(): Promise<Record<string, number>> {
  const cacheKey = 'asset-type-counts';
  const cached = countsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_COUNTS_MS) {
    return cached.data;
  }

  const startTime = performance.now();

  try {
    const { getAssetTypeCounts: getCountsFromAPI } = await import('$lib/ownership-api');

    const countsMap = await getCountsFromAPI();

    const counts: Record<string, number> = {};
    for (const [type, count] of countsMap) {
      counts[type] = count;
    }

    countsCache.set(cacheKey, {
      data: counts,
      timestamp: Date.now(),
    });

    logQuery({
      timestamp: new Date(),
      operation: 'getAssetTypeCounts',
      durationMs: performance.now() - startTime,
      source: 'rest-api',
      params: { method: 'facets' },
      resultCount: Object.keys(counts).length,
    });

    return counts;
  } catch (error) {
    logQuery({
      timestamp: new Date(),
      operation: 'getAssetTypeCounts',
      durationMs: performance.now() - startTime,
      source: 'rest-api',
      params: {},
      resultCount: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}
