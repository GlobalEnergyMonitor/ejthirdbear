/** Ownership API client — REST API for entity/asset ownership relationships */

import { logApiCall } from './api-log.svelte';
import {
  API_SLUG_TO_TYPE as _SCHEMA_SLUG_TO_TYPE,
  API_TYPE_TO_SLUG as _SCHEMA_TYPE_TO_SLUG,
  IDENTIFIER_TO_API_SLUG as _SCHEMA_ID_TO_SLUG,
  normalizeSubStatus,
} from '$lib/data-config/tracker-schema';
import {
  FK_ID,
  FK_NAME,
  FK_FACILITY_TYPE,
  FK_STATUS,
  FK_SUB_STATUS,
  FK_CAPACITY,
  FK_CAPACITY_UNIT,
  FK_COUNTRY,
  FK_LATITUDE,
  FK_LONGITUDE,
  FK_OWNER,
  FK_OWNER_ENTITY_ID,
  FK_PARENT,
  FK_PARENT_ENTITY_ID,
  FK_ENTITY_ID,
  FK_ENTITY_NAME,
  FK_FULL_NAME,
  FK_HQ_COUNTRY,
} from '$lib/field-keys';

// API base URL (env override or production default)
const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net'; // Fallback to production API

// Default timeout for API requests (30 seconds)
const API_TIMEOUT_MS = 30_000;

// Thread-local-style reason tracker for API call logging.
// Set before each fetchAPI call so _doFetch can include it in the log.
let _currentReason = '';

// Cache for G-prefix to compound ID mappings
const gPrefixToCompoundCache = new Map<string, string>();

/**
 * Resolve a coal plant G-prefix ID to compound L_G format required by the API.
 *
 * Coal plants: API needs "L100000104107_G100000102961", app uses "G100000102961"
 * Coal mines: Work fine with simple M-prefix IDs like "M7043"
 *
 * @param assetId - The asset ID (G-prefix coal plant, or M-prefix coal mine)
 * @returns The compound ID if G-prefix, or original ID if M-prefix/other
 */
export async function resolveAssetId(assetId: string): Promise<string> {
  // Only process G-prefix IDs that aren't already compound
  if (!assetId.startsWith('G') || assetId.includes('_')) {
    return assetId;
  }

  // Check cache first
  if (gPrefixToCompoundCache.has(assetId)) {
    return gPrefixToCompoundCache.get(assetId)!;
  }

  // Resolve via server-side endpoint (id-map.json stays server-only)
  try {
    const res = await fetch(`/api/resolve-id?id=${encodeURIComponent(assetId)}`);
    if (res.ok) {
      const data = await res.json();
      const resolved = data.resolved as string;
      if (resolved && resolved !== assetId) {
        if (gPrefixToCompoundCache.size > 5000) gPrefixToCompoundCache.clear();
        gPrefixToCompoundCache.set(assetId, resolved);
        return resolved;
      }
    }
  } catch {
    // Fallback: return as-is if endpoint unavailable
  }

  return assetId;
}

// ============================================================================
// TYPES
// ============================================================================

export interface RawEntity {
  [key: string]: unknown;
}

export interface RawAsset {
  [key: string]: unknown;
}

export interface EntitySummary {
  id: string;
  name: string;
  fullName?: string | null;
  headquartersCountry?: string | null;
  raw: RawEntity;
}

export interface AssetOwner {
  entityId: string;
  name: string;
  ownershipShare: number | null;
  hqCountry?: string | null;
}

export interface AssetSummary {
  id: string;
  name: string;
  facilityType?: string | null;
  status?: string | null;
  subStatus?: string | null;
  capacity?: number | null;
  capacityUnit?: string | null;
  country?: string | null;
  stateProvince?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ownerName?: string | null;
  ownerEntityId?: string | null;
  parentName?: string | null;
  parentEntityId?: string | null;
  owners?: AssetOwner[];
  raw: RawAsset;
}

export interface DirectOwnership {
  ownerEntityId: string;
  ownerName: string;
  ownershipPct: number | null;
}

export interface DirectOwned {
  entityId: string;
  entityName: string;
  ownershipPct: number | null;
}

export interface OwnershipTraceNode {
  id: string;
  Name: string;
  type: 'entity' | 'asset';
}

// OwnershipTracePath and OwnershipTraceResponse removed — the /trace/ endpoints
// exist in the API but we use /ownership/graph instead (richer data).

export interface GraphNode {
  id: string;
  Name: string;
  type: 'entity' | 'asset';
  is_terminal?: boolean;
  is_root?: boolean;
  entity_id?: string;
  headquarters_country?: string;
  asset_type?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  value?: number | null;
  closes_cycle?: boolean;
}

export interface EntityGraphResponse {
  rootEntityId: string;
  rootEntityName: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  terminalIds: string[];
}

export interface OwnershipGraphResponse {
  root: OwnershipTraceNode;
  nodes: GraphNode[];
  edges: Array<
    GraphEdge & {
      type?: 'leafEdge' | 'intermediateEdge';
      refUrl?: string | null;
      imputed_share?: boolean;
      closes_cycle?: boolean;
      depth?: number;
    }
  >;
  paths?: Record<string, Array<{ route: string[]; cumulative_pct: number }>>;
}

export interface PaginatedResponse<T> {
  total: number | null;
  limit: number | null;
  offset: number | null;
  count: number;
  results: T[];
}

// ============================================================================
// API CLIENT
// ============================================================================

class OwnershipAPIError extends Error {
  constructor(
    public _status: number,
    message: string
  ) {
    super(message);
    this.name = 'OwnershipAPIError';
  }
}

// In-flight request deduplication cache.
// Prevents duplicate network requests when multiple components request the same endpoint concurrently.
const inflightRequests = new Map<string, Promise<unknown>>();

function deduplicatedFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key) as Promise<T>;
  }
  const promise = fetchFn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

// eslint-disable-next-line no-undef
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new OwnershipAPIError(
      0,
      'API base URL not configured. Set PUBLIC_OWNERSHIP_API_BASE_URL.'
    );
  }

  const url = `${API_BASE}${endpoint}`;

  // Deduplicate concurrent GET requests to the same endpoint
  const method = options?.method?.toUpperCase() || 'GET';
  if (method === 'GET') {
    return deduplicatedFetch<T>(url, () => _doFetch<T>(url, options));
  }

  return _doFetch<T>(url, options);
}

// eslint-disable-next-line no-undef
async function _doFetch<T>(url: string, options?: RequestInit): Promise<T> {
  // Add timeout via AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const method = options?.method?.toUpperCase() || 'GET';
  const reason = _currentReason || undefined;
  const t0 = performance.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      // Try to get error details from response body
      let errorMessage = `API error: ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody && !errorBody.startsWith('<!')) {
          errorMessage = `API error (${response.status}): ${errorBody.slice(0, 200)}`;
        }
      } catch {
        // Ignore body read errors
      }
      logApiCall({
        url,
        method,
        status: response.status,
        durationMs: performance.now() - t0,
        timestamp: new Date(),
        error: errorMessage,
        reason,
      });
      throw new OwnershipAPIError(response.status, errorMessage);
    }

    logApiCall({
      url,
      method,
      status: response.status,
      durationMs: performance.now() - t0,
      timestamp: new Date(),
      reason,
    });
    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      logApiCall({
        url,
        method,
        status: null,
        durationMs: performance.now() - t0,
        timestamp: new Date(),
        error: 'timeout',
        reason,
      });
      throw new OwnershipAPIError(
        0,
        `API request timed out after ${API_TIMEOUT_MS / 1000}s: ${url}`
      );
    }
    // Log non-API errors (network failures etc.) only if not already logged above
    if (!(err instanceof OwnershipAPIError)) {
      logApiCall({
        url,
        method,
        status: null,
        durationMs: performance.now() - t0,
        timestamp: new Date(),
        error: String(err),
        reason,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function pickKey<T extends Record<string, unknown>>(obj: T, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

function extractEntityId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/E\d+/);
    return match ? match[0] : value;
  }
  return null;
}

function normalizeEntity(raw: RawEntity): EntitySummary | null {
  const idRaw = pickKey(raw, FK_ENTITY_ID);
  const id = extractEntityId(idRaw) || String(idRaw || '').trim();
  if (!id) return null; // skip ghost entries with empty IDs

  const str = (keys: readonly string[]) => {
    const v = pickKey(raw, keys);
    return v ? String(v) : null;
  };
  return {
    id,
    name: String(pickKey(raw, FK_ENTITY_NAME) || id).trim() || id,
    fullName: str(FK_FULL_NAME),
    headquartersCountry: str(FK_HQ_COUNTRY),
    raw,
  };
}

function normalizeAsset(raw: RawAsset): AssetSummary {
  // Helpers: pick first non-empty key as string or number
  const str = (keys: readonly string[]) => {
    const v = pickKey(raw, keys);
    return v ? String(v) : null;
  };
  const num = (keys: readonly string[]) => toNumber(pickKey(raw, keys));

  const id = String(pickKey(raw, FK_ID) || '').trim();
  return {
    id,
    name: String(pickKey(raw, FK_NAME) || id).trim(),
    facilityType: str(FK_FACILITY_TYPE),
    status: str(FK_STATUS),
    subStatus: str(FK_SUB_STATUS),
    capacity: num(FK_CAPACITY),
    capacityUnit: str(FK_CAPACITY_UNIT),
    country: str(FK_COUNTRY),
    latitude: num(FK_LATITUDE),
    longitude: num(FK_LONGITUDE),
    ownerName: str(FK_OWNER),
    ownerEntityId: extractEntityId(pickKey(raw, FK_OWNER_ENTITY_ID)),
    parentName: str(FK_PARENT),
    parentEntityId: extractEntityId(pickKey(raw, FK_PARENT_ENTITY_ID)),
    owners: normalizeOwners(raw),
    raw,
  };
}

function normalizeOwners(raw: RawAsset): AssetOwner[] | undefined {
  const arr = raw.owners;
  if (!Array.isArray(arr) || arr.length === 0) return undefined;
  return (arr as Array<Record<string, unknown>>).map((o) => ({
    entityId: String(o.entity_id || ''),
    name: String(o.name || ''),
    ownershipShare: toNumber(o.ownership_share),
    hqCountry: o.hq_country ? String(o.hq_country) : null,
  }));
}

function normalizePaginated<T>(raw: T[] | PaginatedResponse<T>): PaginatedResponse<T> {
  if (Array.isArray(raw))
    return { total: null, limit: null, offset: null, count: raw.length, results: raw };
  return {
    total: raw.total ?? null,
    limit: raw.limit ?? null,
    offset: raw.offset ?? null,
    count: raw.count ?? raw.results?.length ?? 0,
    results: raw.results ?? [],
  };
}

// ============================================================================
// ENTITY ENDPOINTS
// ============================================================================

// Build query string from an object, skipping nullish values.
// Supports arrays: repeated keys for multi-value params (e.g. country=X&country=Y).
// Also used by src/widgets/widget-api.ts (imported from here).
export function buildQuery(
  params?: Record<string, string | number | string[] | undefined | null>
): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item != null && item !== '') sp.append(k, String(item));
      }
    } else {
      sp.set(k, String(v));
    }
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** Search and retrieve entities with optional filtering */
export async function listEntities(params?: {
  q?: string;
  country?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<EntitySummary>> {
  _currentReason = `listEntities${params?.q ? ` q="${params.q}"` : ''}`;
  const raw = await fetchAPI<RawEntity[] | PaginatedResponse<RawEntity>>(
    `/entities${buildQuery(params)}`
  );
  const page = normalizePaginated(raw);
  return {
    ...page,
    results: page.results.map(normalizeEntity).filter((e): e is EntitySummary => e !== null),
  };
}

export async function getEntity(entityId: string): Promise<EntitySummary | null> {
  _currentReason = `getEntity ${entityId}`;
  return normalizeEntity(await fetchAPI<RawEntity>(`/entities/${encodeURIComponent(entityId)}`));
}

// Helper: extract ownership percentage from API row
const pct = (v?: number) => (typeof v === 'number' ? v : null);

export async function getEntityOwners(entityId: string): Promise<DirectOwnership[]> {
  _currentReason = `getEntityOwners ${entityId}`;
  const raw = await fetchAPI<
    Array<{ owner_entity_id?: string; owner_name?: string; ownership_percentage?: number }>
  >(`/entities/${encodeURIComponent(entityId)}/owners`);
  return (raw || []).map((r) => ({
    ownerEntityId: extractEntityId(r.owner_entity_id) || String(r.owner_entity_id || ''),
    ownerName: r.owner_name || String(r.owner_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

export async function getEntityOwned(entityId: string): Promise<DirectOwned[]> {
  _currentReason = `getEntityOwned ${entityId}`;
  const raw = await fetchAPI<
    Array<{
      subject_entity_id?: string;
      subject_entity_name?: string;
      ownership_percentage?: number;
    }>
  >(`/entities/${encodeURIComponent(entityId)}/owned`);
  return (raw || []).map((r) => ({
    entityId: extractEntityId(r.subject_entity_id) || String(r.subject_entity_id || ''),
    entityName: r.subject_entity_name || String(r.subject_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

// traceEntityUp / traceEntityDown removed — we use /ownership/graph instead.
// The /entities/{id}/trace/{up|down} endpoints still exist in the API if needed.

// Raw shape returned by /entities/{id}/graph/{direction}
interface RawEntityGraph {
  root_entity_id: string;
  root_entity_name: string;
  nodes: Array<{
    entity_id: string;
    entity_name: string;
    is_terminal?: boolean;
    is_root?: boolean;
  }>;
  edges: Array<{ from_entity_id: string; to_entity_id: string; ownership_percentage?: number }>;
  terminal_node_ids?: string[];
}

function normalizeEntityGraph(raw: RawEntityGraph): EntityGraphResponse {
  return {
    rootEntityId: raw.root_entity_id,
    rootEntityName: raw.root_entity_name,
    nodes: (raw.nodes || []).map((n) => ({
      id: n.entity_id,
      Name: n.entity_name,
      type: 'entity' as const,
      is_terminal: n.is_terminal,
      is_root: n.is_root,
    })),
    edges: (raw.edges || []).map((e) => ({
      source: e.from_entity_id,
      target: e.to_entity_id,
      value: pct(e.ownership_percentage),
    })),
    terminalIds: raw.terminal_node_ids || [],
  };
}

/** Build entity ownership graph in given direction (up = ancestors, down = descendants) */
async function getEntityGraph(
  entityId: string,
  direction: 'up' | 'down'
): Promise<EntityGraphResponse> {
  const raw = await fetchAPI<RawEntityGraph>(
    `/entities/${encodeURIComponent(entityId)}/graph/${direction}`
  );
  return normalizeEntityGraph(raw);
}

export const getEntityGraphUp = (id: string) => getEntityGraph(id, 'up');
export const getEntityGraphDown = (id: string) => getEntityGraph(id, 'down');

// ============================================================================
// ASSET TYPE MAPPING
// ============================================================================

/**
 * Slug/type maps — sourced from tracker-schema.ts (single source of truth).
 * These re-exports exist for backward compatibility with existing importers.
 */
export const SLUG_TO_API_TYPE: Record<string, string> = {
  ..._SCHEMA_SLUG_TO_TYPE,
  // Backward-compat aliases (old URL slugs → API types)
  'gas-plant': _SCHEMA_SLUG_TO_TYPE['oil-gas-plant'],
  'iron-mine': _SCHEMA_SLUG_TO_TYPE['iron-ore-mine'],
  'steel-plant': _SCHEMA_SLUG_TO_TYPE['iron-steel-plant'],
  bioenergy: _SCHEMA_SLUG_TO_TYPE['bioenergy-plant'],
};

export const API_TYPE_TO_SLUG: Record<string, string> = { ..._SCHEMA_TYPE_TO_SLUG };

/** Resolve any tracker identifier (slug, display name, or API type) to API display type name */
export function resolveApiAssetType(tracker: string): string {
  return (
    SLUG_TO_API_TYPE[tracker] ||
    (_SCHEMA_ID_TO_SLUG[tracker] && SLUG_TO_API_TYPE[_SCHEMA_ID_TO_SLUG[tracker]]) ||
    tracker
  );
}

/** Resolve any tracker identifier to the API slug used in ?asset_type= filter.
 *  Handles URL-encoded ampersands (%26, &amp;) that can appear when tracker
 *  names like "Oil & Gas Plant" round-trip through URL query parameters. */
export function resolveApiSlug(tracker: string): string | null {
  // Direct match first (fast path)
  const direct = _SCHEMA_ID_TO_SLUG[tracker];
  if (direct) return direct;

  // Normalize encoded ampersands and retry
  const normalized = tracker
    .split('&amp;').join('&')
    .split('%26').join('&')
    .trim();
  return _SCHEMA_ID_TO_SLUG[normalized] ?? null;
}

// ============================================================================
// ASSET ENDPOINTS
// ============================================================================

/** Search and retrieve assets with optional filtering */
export async function listAssets(params?: {
  q?: string;
  status?: string;
  country?: string | string[];
  asset_type?: string;
  limit?: number;
  offset?: number;
  facets?: boolean;
}): Promise<PaginatedResponse<AssetSummary> & { facets?: Record<string, Record<string, number>> }> {
  if (!_currentReason)
    _currentReason = `listAssets${params?.asset_type ? ` type=${params.asset_type}` : ''}${params?.facets ? ' (facets)' : ''}`;
  // Build query params — always request JSON format (coal-plant slug returns HTML without it)
  const queryParams: Record<string, string | number | string[] | undefined | null> = {
    q: params?.q,
    status: params?.status,
    country: params?.country,
    asset_type: params?.asset_type,
    limit: params?.limit,
    offset: params?.offset,
    format: 'json',
  };
  if (params?.facets) queryParams.facets = 'true';
  const raw = await fetchAPI<
    PaginatedResponse<RawAsset> & { facets?: Record<string, Record<string, number>> }
  >(`/assets${buildQuery(queryParams)}`);
  const page = normalizePaginated(raw);
  const facets = !Array.isArray(raw) ? raw.facets : undefined;
  return { ...page, results: page.results.map(normalizeAsset), facets };
}

/**
 * Fetch assets filtered by tracker type with auto-pagination.
 * Uses the working API asset_type slug filter for server-side filtering.
 *
 * @param assetType - Slug, display name, or API type name
 * @param opts - limit (default 100), plus optional status/country filters
 */
export async function listAssetsByType(
  assetType: string,
  opts?: { limit?: number; status?: string; country?: string | string[] }
): Promise<AssetSummary[]> {
  _currentReason = `listAssetsByType ${assetType}${opts?.status ? ` status=${opts.status}` : ''}`;
  const apiSlug = resolveApiSlug(assetType);
  const limit = opts?.limit ?? 100;
  const results: AssetSummary[] = [];
  let offset = 0;
  const BATCH = 500; // API max
  const MAX_FETCH = 25000; // safety: don't fetch more than this

  while (results.length < limit && offset < MAX_FETCH) {
    const page = await listAssets({
      limit: BATCH,
      offset,
      asset_type: apiSlug ?? undefined,
      status: opts?.status,
      country: opts?.country,
    });
    results.push(...page.results);
    offset += BATCH;
    if (page.results.length < BATCH) break;
  }

  return results.slice(0, limit);
}

/**
 * Async generator that yields pages of assets filtered by type.
 * Used by the screener to paginate through all assets for owner aggregation.
 */
export async function* paginateAssetsByType(
  apiSlug: string,
  opts?: { status?: string; country?: string | string[]; limit?: number }
): AsyncGenerator<AssetSummary[], void, unknown> {
  _currentReason = `paginateAssetsByType ${apiSlug} (screener)`;
  const BATCH = opts?.limit ?? 500;
  let offset = 0;
  const MAX_OFFSET = 50000;

  while (offset < MAX_OFFSET) {
    const page = await listAssets({
      asset_type: apiSlug,
      limit: BATCH,
      offset,
      status: opts?.status,
      country: opts?.country,
    });
    if (page.results.length === 0) break;
    yield page.results;
    offset += BATCH;
    if (page.results.length < BATCH) break;
  }
}

/**
 * Get exact asset counts per tracker type using the API facets feature.
 * Falls back to sampling if facets are unavailable.
 * Returns a Map of API type name → exact count.
 */
export async function getAssetTypeCounts(): Promise<Map<string, number>> {
  _currentReason = 'getAssetTypeCounts (facets)';
  // Try facets first (single request, exact counts)
  try {
    const page = await listAssets({ limit: 1, facets: true });
    if (page.facets?.asset_type) {
      const counts = new Map<string, number>();
      for (const [type, count] of Object.entries(page.facets.asset_type)) {
        counts.set(type, count);
      }
      return counts;
    }
  } catch {
    // Fall through to sampling
  }

  // Fallback: sample pages and extrapolate
  const SAMPLE_PAGES = 3;
  const BATCH = 500;
  const counts = new Map<string, number>();
  let totalSampled = 0;
  let apiTotal = 0;

  for (let i = 0; i < SAMPLE_PAGES; i++) {
    const page = await listAssets({ limit: BATCH, offset: i * BATCH });
    if (i === 0) apiTotal = page.total ?? page.count;
    for (const asset of page.results) {
      const t = asset.facilityType || 'Unknown';
      counts.set(t, (counts.get(t) || 0) + 1);
    }
    totalSampled += page.results.length;
    if (page.results.length < BATCH) break;
  }

  if (totalSampled > 0 && apiTotal > totalSampled) {
    const scale = apiTotal / totalSampled;
    for (const [type, count] of counts) {
      counts.set(type, Math.round(count * scale));
    }
  }

  return counts;
}

/**
 * Get full asset details
 * Note: G-prefix IDs are automatically resolved to compound L_G format
 */
export async function getAsset(assetId: string): Promise<AssetSummary> {
  _currentReason = `getAsset ${assetId}`;
  const resolvedId = await resolveAssetId(assetId);
  const raw = await fetchAPI<RawAsset>(`/assets/${encodeURIComponent(resolvedId)}`);
  return normalizeAsset(raw);
}

// ============================================================================
// UNIFIED GRAPH ENDPOINT
// ============================================================================

/** Universal ownership graph — works with both entities and assets (auto-resolves G-prefix IDs) */
export async function getOwnershipGraph(params: {
  root: string;
  direction?: 'up' | 'down';
  max_depth?: number;
}): Promise<OwnershipGraphResponse> {
  _currentReason = `getOwnershipGraph ${params.direction || 'up'} ${params.root}`;
  const resolvedRoot = await resolveAssetId(params.root);
  const raw = await fetchAPI<{
    root: Record<string, unknown>;
    nodes: Array<Record<string, unknown>>;
    edges: OwnershipGraphResponse['edges'];
    paths?: OwnershipGraphResponse['paths'];
  }>(
    `/ownership/graph${buildQuery({ root: resolvedRoot, direction: params.direction, max_depth: params.max_depth })}`
  );

  // Normalize root node
  const root: OwnershipTraceNode = {
    id: String(raw.root.entity_id || raw.root.asset_id || ''),
    Name: String(raw.root.name || raw.root.asset_name || ''),
    type: (raw.root.node_type as 'entity' | 'asset') || 'asset',
  };

  // Normalize nodes: API returns entity_id/asset_id, node_type, name/asset_name
  const nodes: GraphNode[] = (raw.nodes || []).map((n) => ({
    id: String(n.entity_id || n.asset_id || ''),
    Name: String(n.name || n.asset_name || ''),
    type: (n.node_type as 'entity' | 'asset') || (n.asset_type ? 'asset' : 'entity'),
    is_terminal: n.is_terminal as boolean | undefined,
    is_root: n.is_root as boolean | undefined,
    // Preserve useful raw fields for side panel and entity type classification
    entity_id: n.entity_id as string | undefined,
    headquarters_country: n.headquarters_country as string | undefined,
    entity_type: n.entity_type as string | undefined,
    publiclylisted: (n.publiclylisted || n.publicly_listed) as boolean | undefined,
    asset_type: n.asset_type as string | undefined,
  }));

  return {
    root,
    nodes,
    edges: raw.edges || [],
    paths: raw.paths,
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/** Parallel fetch: entity details + ownership stats + downstream graph */
export async function getEntityWithPortfolio(entityId: string) {
  const [entity, owners, owned, graphDown] = await Promise.all([
    getEntity(entityId),
    getEntityOwners(entityId),
    getEntityOwned(entityId),
    getEntityGraphDown(entityId),
  ]);
  return { entity, owners, owned, graphDown };
}

/** Convert API graph response to a portable data shape for ownership visualizations */
export function graphToExplorerData(
  entityId: string,
  entityName: string,
  graphDown: EntityGraphResponse
) {
  const subs = graphDown.nodes.filter((n) => n.id !== entityId);
  // Build direct-edge lookup: entity → ownership %
  const directEdges = new Map(
    (graphDown.edges || [])
      .filter((e) => e.source === entityId)
      .map((e) => [e.target, e.value ?? null])
  );
  return {
    spotlightOwner: { id: entityId, Name: entityName },
    subsidiariesMatched: subs.map((e) => [e.id, []] as [string, unknown[]]),
    directlyOwned: [] as unknown[],
    matchedEdges: subs.map(
      (e) => [e.id, { value: directEdges.get(e.id) ?? null }] as [string, { value: number | null }]
    ),
    entityMap: subs.map(
      (e) =>
        [e.id, { id: e.id, Name: e.Name, type: 'entity' }] as [
          string,
          { id: string; Name: string; type: string },
        ]
    ),
    assets: [] as unknown[],
  };
}

/**
 * Fetch status facets for a given asset type.
 * Uses limit=1 since we only need the facet metadata, not the assets themselves.
 */
export async function fetchStatusFacets(assetTypeSlug?: string): Promise<Map<string, number>> {
  _currentReason = `fetchStatusFacets${assetTypeSlug ? ` type=${assetTypeSlug}` : ''}`;
  const res = await listAssets({
    asset_type: assetTypeSlug,
    facets: true,
    limit: 1,
  });
  // Prefer sub_status facets (granular) over status facets (aggregate)
  const rawFacets = res.facets?.sub_status ?? res.facets?.status ?? {};
  // Normalize snake_case keys to our display convention via normalizeSubStatus
  const normalized = new Map<string, number>();
  for (const [k, v] of Object.entries(rawFacets)) {
    const mapped = normalizeSubStatus(k);
    if (!mapped) continue;
    normalized.set(mapped, (normalized.get(mapped) ?? 0) + v);
  }
  return normalized;
}

// =============================================================================
// STATUS TAXONOMY — re-exported from catalog-api.ts (single source of truth)
// =============================================================================

export { fetchCatalogTaxonomy as fetchStatusTaxonomy } from '$lib/api/catalog-api';
export type { StatusTaxonomy } from '$lib/api/catalog-api';

// Export the API base for debugging
export const getAPIBase = () => API_BASE;

// =============================================================================
// COAL PLANT LOCATION
// =============================================================================

import type { CoalPlantLocation } from '$lib/components/cards/coal-plant-types';

/**
 * Fetch all units for a coal plant by location ID.
 * Returns top-line plant info plus a units[] array of unit-level data.
 */
export async function fetchCoalPlantLocation(locationId: string): Promise<CoalPlantLocation> {
  _currentReason = `fetchCoalPlantLocation ${locationId}`;
  return fetchAPI<CoalPlantLocation>(`/locations/${encodeURIComponent(locationId)}`);
}
