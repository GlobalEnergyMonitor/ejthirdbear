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

// =============================================================================
// GEM TRACKER NAME → UI TRACKER NAME BRIDGE
// =============================================================================

/**
 * Maps raw GEM tracker names (used in asset-class-definitions.ts) to the
 * UI TrackerName values that the API understands.
 * Most are identity; only two differ.
 */
const GEM_TO_UI_TRACKER: Record<string, string> = {
  'Oil & Gas Plant': 'Gas Plant',
  'Iron & Steel Plant': 'Steel Plant',
};

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
  country?: string;
  ownerIds?: string[];
  assetClassId?: string;
  selectedSubClasses?: string[];
  [key: string]: unknown;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const OWNERSHIP_API_BASE = getAPIBase();

/** Enable detailed console logging */
const DEBUG = false;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

const ENABLE_BATCH_SEARCH =
  browser && localStorage.getItem('__GEM_SCREENER_BATCH_SEARCH__') === '1';

/** In-memory cache for results */
const resultsCache = new Map<string, { data: ScreenerResultsResponse; timestamp: number }>();

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

/** Get recent query logs for debugging */
export function getQueryLogs(): QueryLog[] {
  return [...queryLogs].slice(-50);
}

/** Clear query logs */
export function clearQueryLogs(): void {
  queryLogs.length = 0;
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
 * REST API implementation: paginate /assets?asset_type={slug} and
 * aggregate owners client-side from the owners[] array on each asset.
 */
async function getOwnersByAssetTypeREST(
  filters: ScreenerFilters,
  limit: number,
  startTime: number
): Promise<ScreenerResultsResponse> {
  const { resolveApiSlug, paginateAssetsByType } = await import('$lib/ownership-api');

  // Resolve tracker name → API slug
  const trackerName = filters.tracker || '';
  const apiSlug = resolveApiSlug(trackerName);
  if (!apiSlug) {
    throw new Error(`Cannot resolve API slug for tracker: ${trackerName}`);
  }

  // Accumulate owners: entityId → { name, assetIds }
  const ownerMap = new Map<string, { name: string; assetIds: Set<string> }>();
  const hasOwnerFilter = filters.ownerIds && filters.ownerIds.length > 0;
  const ownerIdSet = hasOwnerFilter ? new Set(filters.ownerIds) : null;

  // Multi-status filter: use statuses[] array, fall back to singular status
  const statusArray =
    filters.statuses && filters.statuses.length > 0
      ? filters.statuses.map((s) => s.toLowerCase())
      : filters.status
        ? [filters.status.toLowerCase()]
        : null;

  // Don't pass status to API — some trackers have null status (e.g., Steel Plants).
  // All status filtering is done client-side to handle null gracefully.
  const apiStatus = undefined;
  let classMatcher: ((_record: Record<string, unknown>) => boolean) | null = null;

  if (filters.assetClassId) {
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
  for await (const page of paginateAssetsByType(apiSlug, {
    status: apiStatus,
    country: filters.country,
  })) {
    pageCount++;
    for (const asset of page) {
      if (classMatcher && !classMatcher(asset.raw || {})) continue;

      // Client-side status filtering — skip assets whose status doesn't match.
      // Assets with null/undefined status pass through (some trackers don't track status).
      if (statusArray && asset.status) {
        if (!statusArray.includes(asset.status.toLowerCase())) continue;
      }

      if (!asset.owners || asset.owners.length === 0) continue;
      for (const owner of asset.owners) {
        if (!owner.entityId) continue;
        // If ownerIds filter is active, skip non-matching owners
        if (ownerIdSet && !ownerIdSet.has(owner.entityId)) continue;

        let entry = ownerMap.get(owner.entityId);
        if (!entry) {
          entry = { name: owner.name, assetIds: new Set() };
          ownerMap.set(owner.entityId, entry);
        }
        entry.assetIds.add(asset.id);
      }
    }
  }

  // Sort by filtered asset count descending, take top N
  const sorted = [...ownerMap.entries()]
    .map(([entityId, { name, assetIds }]) => ({
      entityId,
      name,
      totalAssets: 0, // cross-type totals not available without full scan
      filteredAssets: assetIds.size,
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
  const response = await fetch(`${OWNERSHIP_API_BASE}/entities/search/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries, limit_per_query: limitPerQuery }),
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
// ASSET TYPE COUNTS (for preset cards)
// =============================================================================

/**
 * Get exact asset counts by type using API facets.
 * Cached for 1 hour since counts rarely change.
 */
export async function getAssetTypeCounts(): Promise<Record<string, number>> {
  const cacheKey = 'asset-type-counts';
  const cached = resultsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
    return cached.data as unknown as Record<string, number>;
  }

  const startTime = performance.now();

  try {
    const { getAssetTypeCounts: getCountsFromAPI } = await import('$lib/ownership-api');

    const countsMap = await getCountsFromAPI();

    const counts: Record<string, number> = {};
    for (const [type, count] of countsMap) {
      counts[type] = count;
    }

    resultsCache.set(cacheKey, {
      data: counts as unknown as ScreenerResultsResponse,
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

// =============================================================================
// CACHE MANAGEMENT
// =============================================================================

/** Clear all cached data */
export function clearCache(): void {
  resultsCache.clear();
  if (DEBUG) console.log('[screener-api] Cache cleared');
}

/** Get cache stats for debugging */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: resultsCache.size,
    keys: [...resultsCache.keys()],
  };
}

// =============================================================================
// DEBUG UTILITIES
// =============================================================================

/** Get API configuration for debugging */
export function getConfig() {
  return {
    apiBase: OWNERSHIP_API_BASE,
    debug: DEBUG,
    cacheTtlMs: CACHE_TTL_MS,
  };
}

/**
 * Run a diagnostic check on data sources.
 * All screener data now flows through the REST API by default.
 */
export async function runDiagnostics(): Promise<{
  restApi: { ok: boolean; latencyMs: number; error?: string };
}> {
  const results = {
    restApi: { ok: false, latencyMs: 0, error: undefined as string | undefined },
  };

  // Test REST API
  const restStart = performance.now();
  try {
    const response = await fetch(`${OWNERSHIP_API_BASE}/entities?limit=1`);
    results.restApi.latencyMs = performance.now() - restStart;
    results.restApi.ok = response.ok;
    if (!response.ok) results.restApi.error = `HTTP ${response.status}`;
  } catch (e) {
    results.restApi.latencyMs = performance.now() - restStart;
    results.restApi.error = e instanceof Error ? e.message : String(e);
  }

  return results;
}
