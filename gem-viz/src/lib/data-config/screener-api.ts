/**
 * =============================================================================
 * SCREENER DATA LAYER
 * =============================================================================
 *
 * Centralized data fetching for the Asset Class Screener flow.
 * All screener pages should import from here, NOT directly from
 * unified-query.ts or ownership-api.ts.
 *
 * This makes it easy to:
 * 1. Swap implementations when backend provides new endpoints
 * 2. Add caching
 * 3. Profile/debug performance
 * 4. Mock for testing
 *
 * =============================================================================
 * CURRENT DATA FLOW (as of Feb 2026)
 * =============================================================================
 *
 * STEP 1: Asset Class Selection (/screener)
 * -----------------------------------------
 * Data: Static config from tracker-schema.ts
 * Speed: Instant (no API calls)
 * Status: ✅ Fine
 *
 *
 * STEP 2: Owner Search (/screener/owners)
 * ---------------------------------------
 * Data: REST API (gem-api.thirdbear.net - Cloudflare cached)
 * Endpoints used:
 *   - GET /entities?q={search} (single search)
 *   - GET /entities/{id} (direct ID lookup)
 *
 * CURRENT PROBLEMS:
 *   - Bulk search fires 30 parallel requests (one per search term)
 *   - No debouncing on input
 *   - 30 second timeout suggests known slowness
 *
 * BACKEND REQUEST #1: Batch entity search
 *   POST /entities/search/batch
 *   Body: { "queries": ["Shell", "BP", "TotalEnergies"] }
 *   Returns: { "results": { "Shell": [...], "BP": [...] } }
 *
 *
 * STEP 3: Results (/screener/results)
 * -----------------------------------
 * Data: MotherDuck (DuckDB WASM in browser)
 * Table: gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership
 *
 * CURRENT PROBLEMS:
 *   - Complex CTE scans ownership table TWICE
 *   - First scan: count all assets per owner
 *   - Second scan: count filtered assets per owner (by asset type)
 *   - No indexes, runs in browser WASM (limited resources)
 *   - Debug query runs on every page load
 *
 * BACKEND REQUEST #2: Pre-aggregated owner counts
 *   Option A: Materialized table in MotherDuck
 *     CREATE TABLE owner_asset_counts AS
 *     SELECT entity_id, name, asset_type, COUNT(DISTINCT asset_id) as cnt
 *     FROM ownership GROUP BY 1,2,3;
 *
 *   Option B: REST endpoint
 *     GET /owners/by-asset-type?type=Coal%20Plant&status=operating&limit=200
 *     Returns: [{ entity_id, name, total_assets, filtered_assets }, ...]
 *
 * =============================================================================
 * ENDPOINT WISHLIST FOR BACKEND
 * =============================================================================
 *
 * Priority 1 (Critical):
 * ----------------------
 * GET /screener/owners
 *   Params: asset_type, status?, country?, limit?, offset?
 *   Returns: { owners: [{ entity_id, name, total_assets, filtered_assets }], total }
 *   Notes: This replaces the expensive CTE query entirely
 *
 * Priority 2 (High):
 * ------------------
 * POST /entities/search/batch
 *   Body: { queries: string[], limit_per_query?: number }
 *   Returns: { results: Record<string, EntitySummary[]> }
 *   Notes: Batch multiple name searches into one request
 *
 * Priority 3 (Medium):
 * --------------------
 * GET /screener/asset-type-counts
 *   Returns: { "Coal Plant": 1234, "Steel Plant": 567, ... }
 *   Notes: For showing counts on preset cards, cache aggressively
 *
 * GET /screener/owner/{entity_id}/exposure
 *   Params: asset_type?, status?, country?
 *   Returns: { total_assets, filtered_assets, assets: [...] }
 *   Notes: Detailed breakdown for a single owner
 *
 * =============================================================================
 */

import { browser } from '$app/environment';
import { getAssetTypeForTracker } from '$lib/data-config/tracker-schema';

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
  source: 'rest-api' | 'motherduck' | 'cache';
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
  country?: string;
  ownerIds?: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const OWNERSHIP_API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

/** Enable detailed console logging */
const DEBUG = true;

/** Cache TTL in milliseconds (5 minutes) */
const CACHE_TTL_MS = 5 * 60 * 1000;

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
 * CURRENT IMPLEMENTATION:
 * - Uses MotherDuck CTE query (slow, scans table twice)
 *
 * FUTURE IMPLEMENTATION (when backend ready):
 * - REST API: GET /screener/owners?asset_type=Coal%20Plant
 *
 * @param filters - Asset type, status, country filters
 * @param options - Limit, skip cache, etc.
 */
export async function getOwnersByAssetType(
  filters: ScreenerFilters,
  options: { limit?: number; skipCache?: boolean } = {}
): Promise<ScreenerResultsResponse> {
  const startTime = performance.now();
  const { limit = 200, skipCache = false } = options;

  // Build cache key
  const cacheKey = JSON.stringify({ filters, limit });

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

  // TODO: When backend provides REST endpoint, use this:
  // return await getOwnersByAssetTypeREST(filters, limit);

  // Current implementation: MotherDuck query
  return await getOwnersByAssetTypeMotherDuck(filters, limit, startTime, cacheKey);
}

/**
 * CURRENT: MotherDuck implementation (slow)
 *
 * This is what we want to replace with a REST endpoint.
 * The query scans the ownership table twice which is expensive.
 */
async function getOwnersByAssetTypeMotherDuck(
  filters: ScreenerFilters,
  limit: number,
  startTime: number,
  cacheKey: string
): Promise<ScreenerResultsResponse> {
  if (!browser) {
    return { owners: [], source: 'motherduck', queryTimeMs: 0 };
  }

  try {
    const { unifiedQuery } = await import('$lib/data/unified-query');

    const assetTypeVal = filters.tracker ? getAssetTypeForTracker(filters.tracker) : null;
    const hasOwnerFilter = filters.ownerIds && filters.ownerIds.length > 0;

    // Build filter clauses
    // PROBLEM: These string interpolations scan the table twice
    const trackerClause = assetTypeVal
      ? `AND "Asset Type" = '${assetTypeVal.replace(/'/g, "''")}'`
      : '';

    const ownerClause = hasOwnerFilter
      ? `AND "Immediate Owner Entity ID" IN (${filters.ownerIds!.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')})`
      : '';

    // Status filter (e.g., operating, retired, proposed)
    const statusClause = filters.status
      ? `AND "Status" ILIKE '${filters.status.replace(/'/g, "''")}'`
      : '';

    /*
     * THIS IS THE EXPENSIVE QUERY WE WANT TO REPLACE
     *
     * It does TWO full table scans:
     * 1. owner_totals: COUNT all assets per owner (no filter)
     * 2. owner_filtered: COUNT assets per owner (with asset type + status filter)
     *
     * Then JOINs them together.
     *
     * BACKEND: Please provide GET /screener/owners that returns this pre-computed.
     */
    const sql = `
      WITH owner_totals AS (
        SELECT
          "Immediate Owner Entity Name" as name,
          "Immediate Owner Entity ID" as entity_id,
          COUNT(DISTINCT "Asset ID") as total_assets
        FROM ownership
        WHERE "Immediate Owner Entity Name" IS NOT NULL
          AND "Immediate Owner Entity Name" != ''
          ${ownerClause}
        GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
      ),
      owner_filtered AS (
        SELECT
          "Immediate Owner Entity Name" as name,
          "Immediate Owner Entity ID" as entity_id,
          COUNT(DISTINCT "Asset ID") as filtered_assets
        FROM ownership
        WHERE "Immediate Owner Entity Name" IS NOT NULL
          AND "Immediate Owner Entity Name" != ''
          ${ownerClause}
          ${trackerClause}
          ${statusClause}
        GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
      )
      SELECT
        t.name,
        t.entity_id,
        t.total_assets,
        COALESCE(f.filtered_assets, 0) as filtered_assets
      FROM owner_totals t
      LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
      WHERE f.filtered_assets > 0 OR ${hasOwnerFilter ? 'TRUE' : 'FALSE'}
      ORDER BY f.filtered_assets DESC, t.total_assets DESC
      LIMIT ${limit}
    `;

    const result = await unifiedQuery<{
      name: string;
      entity_id: string;
      total_assets: number;
      filtered_assets: number;
    }>(sql);

    const queryTimeMs = performance.now() - startTime;

    if (!result.success) {
      throw new Error(result.error || 'Query failed');
    }

    const owners: ScreenerOwner[] = (result.data || []).map((row) => ({
      entityId: row.entity_id || '',
      name: row.name || 'Unknown',
      totalAssets: Number(row.total_assets) || 0,
      filteredAssets: Number(row.filtered_assets) || 0,
    }));

    const response: ScreenerResultsResponse = {
      owners,
      source: 'motherduck',
      queryTimeMs,
    };

    // Cache the result
    resultsCache.set(cacheKey, { data: response, timestamp: Date.now() });

    logQuery({
      timestamp: new Date(),
      operation: 'getOwnersByAssetType',
      durationMs: queryTimeMs,
      source: 'motherduck',
      params: filters,
      resultCount: owners.length,
    });

    return response;
  } catch (error) {
    const queryTimeMs = performance.now() - startTime;
    logQuery({
      timestamp: new Date(),
      operation: 'getOwnersByAssetType',
      durationMs: queryTimeMs,
      source: 'motherduck',
      params: filters,
      resultCount: 0,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * FUTURE: REST API implementation
 *
 * Uncomment and use when backend provides:
 * GET /screener/owners?asset_type=X&status=Y&country=Z&limit=N
 */
// async function getOwnersByAssetTypeREST(
//   filters: ScreenerFilters,
//   limit: number
// ): Promise<ScreenerResultsResponse> {
//   const startTime = performance.now();
//
//   const params = new URLSearchParams();
//   if (filters.tracker) params.set('asset_type', getAssetTypeForTracker(filters.tracker) || filters.tracker);
//   if (filters.status) params.set('status', filters.status);
//   if (filters.country) params.set('country', filters.country);
//   params.set('limit', String(limit));
//
//   const response = await fetch(`${OWNERSHIP_API_BASE}/screener/owners?${params}`);
//   if (!response.ok) throw new Error(`API error: ${response.status}`);
//
//   const data = await response.json();
//   const queryTimeMs = performance.now() - startTime;
//
//   return {
//     owners: data.owners || data.results || [],
//     source: 'rest-api',
//     queryTimeMs,
//     totalCount: data.total,
//   };
// }

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

  // TODO: When backend provides batch endpoint, use this:
  // return await searchEntitiesBulkREST(cleanQueries, limitPerQuery);

  // Current implementation: parallel individual requests
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
 * FUTURE: Batch REST API implementation
 *
 * Uncomment and use when backend provides:
 * POST /entities/search/batch
 * Body: { queries: ["Shell", "BP", ...], limit_per_query: 10 }
 */
// async function searchEntitiesBulkREST(
//   queries: string[],
//   limitPerQuery: number
// ): Promise<BulkSearchResponse> {
//   const startTime = performance.now();
//
//   const response = await fetch(`${OWNERSHIP_API_BASE}/entities/search/batch`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ queries, limit_per_query: limitPerQuery }),
//   });
//
//   if (!response.ok) throw new Error(`API error: ${response.status}`);
//
//   const data = await response.json();
//   const queryTimeMs = performance.now() - startTime;
//
//   logQuery({
//     timestamp: new Date(),
//     operation: 'searchEntitiesBulk',
//     durationMs: queryTimeMs,
//     source: 'rest-api',
//     params: { queryCount: queries.length },
//     resultCount: Object.values(data.results || {}).flat().length,
//   });
//
//   return {
//     results: data.results || {},
//     source: 'rest-api',
//     queryTimeMs,
//     apiCallCount: 1,
//   };
// }

// =============================================================================
// ASSET TYPE COUNTS (for preset cards)
// =============================================================================

/**
 * Get asset counts by type.
 *
 * CURRENT IMPLEMENTATION:
 * - MotherDuck query (runs on every page load as "debug" query)
 *
 * FUTURE IMPLEMENTATION:
 * - REST API: GET /screener/asset-type-counts
 * - Cache aggressively (counts rarely change)
 */
export async function getAssetTypeCounts(): Promise<Record<string, number>> {
  const cacheKey = 'asset-type-counts';
  const cached = resultsCache.get(cacheKey);

  // Cache for longer (1 hour) since this rarely changes
  if (cached && Date.now() - cached.timestamp < 60 * 60 * 1000) {
    return cached.data as unknown as Record<string, number>;
  }

  if (!browser) {
    return {};
  }

  const startTime = performance.now();

  try {
    const { unifiedQuery } = await import('$lib/data/unified-query');

    const result = await unifiedQuery<{ asset_type: string; cnt: number }>(`
      SELECT "Asset Type" as asset_type, COUNT(*) as cnt
      FROM ownership
      GROUP BY "Asset Type"
      ORDER BY cnt DESC
    `);

    const counts: Record<string, number> = {};
    for (const row of result.data || []) {
      if (row.asset_type) {
        counts[row.asset_type] = Number(row.cnt) || 0;
      }
    }

    // Cache it
    resultsCache.set(cacheKey, { data: counts as unknown as ScreenerResultsResponse, timestamp: Date.now() });

    logQuery({
      timestamp: new Date(),
      operation: 'getAssetTypeCounts',
      durationMs: performance.now() - startTime,
      source: 'motherduck',
      params: {},
      resultCount: Object.keys(counts).length,
    });

    return counts;
  } catch (error) {
    logQuery({
      timestamp: new Date(),
      operation: 'getAssetTypeCounts',
      durationMs: performance.now() - startTime,
      source: 'motherduck',
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
 * Run a diagnostic check on all data sources
 */
export async function runDiagnostics(): Promise<{
  restApi: { ok: boolean; latencyMs: number; error?: string };
  motherduck: { ok: boolean; latencyMs: number; error?: string };
}> {
  const results = {
    restApi: { ok: false, latencyMs: 0, error: undefined as string | undefined },
    motherduck: { ok: false, latencyMs: 0, error: undefined as string | undefined },
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

  // Test MotherDuck
  if (browser) {
    const mdStart = performance.now();
    try {
      const { unifiedQuery } = await import('$lib/data/unified-query');
      const result = await unifiedQuery('SELECT 1 as test');
      results.motherduck.latencyMs = performance.now() - mdStart;
      results.motherduck.ok = result.success;
      if (!result.success) results.motherduck.error = result.error;
    } catch (e) {
      results.motherduck.latencyMs = performance.now() - mdStart;
      results.motherduck.error = e instanceof Error ? e.message : String(e);
    }
  }

  return results;
}
