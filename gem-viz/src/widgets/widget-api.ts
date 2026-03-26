/**
 * Widget API client — standalone version of ownership-api.ts for dynamic embeds.
 * No SvelteKit dependencies ($app/*, import.meta.env, api-log.svelte).
 * Configurable API base URL for cross-origin usage from Drupal.
 */

import {
  API_SLUG_TO_TYPE as _SCHEMA_SLUG_TO_TYPE,
  API_TYPE_TO_SLUG as _SCHEMA_TYPE_TO_SLUG,
  IDENTIFIER_TO_API_SLUG as _SCHEMA_ID_TO_SLUG,
  normalizeSubStatus,
} from '$lib/data-config/tracker-schema';

// Re-export types from ownership-api so widget wrappers can import from one place
export type {
  EntitySummary,
  AssetSummary,
  AssetOwner,
  EntityGraphResponse,
  OwnershipGraphResponse,
  GraphNode,
  GraphEdge,
  PaginatedResponse,
} from '$lib/ownership-api';

// ============================================================================
// CONFIGURATION
// ============================================================================

let _apiBase = 'https://gem-api.thirdbear.net';
let _appBase = 'https://gem-viz.fly.dev';

/** Configure widget API endpoints. Call before mounting any widgets. */
export function configure(opts: { apiBase?: string; appBase?: string }) {
  if (opts.apiBase) _apiBase = opts.apiBase.replace(/\/$/, '');
  if (opts.appBase) _appBase = opts.appBase.replace(/\/$/, '');
}

export function getApiBase() { return _apiBase; }
export function getAppBase() { return _appBase; }

// ============================================================================
// API CLIENT (no api-log dependency)
// ============================================================================

const API_TIMEOUT_MS = 30_000;

class WidgetAPIError extends Error {
  constructor(public _status: number, message: string) {
    super(message);
    this.name = 'WidgetAPIError';
  }
}

const inflightRequests = new Map<string, Promise<unknown>>();

function deduplicatedFetch<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  if (inflightRequests.has(key)) {
    return inflightRequests.get(key) as Promise<T>;
  }
  const promise = fetchFn().finally(() => inflightRequests.delete(key));
  inflightRequests.set(key, promise);
  return promise;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${_apiBase}${endpoint}`;
  const method = options?.method?.toUpperCase() || 'GET';
  if (method === 'GET') {
    return deduplicatedFetch<T>(url, () => _doFetch<T>(url, options));
  }
  return _doFetch<T>(url, options);
}

async function _doFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.statusText}`;
      try {
        const errorBody = await response.text();
        if (errorBody && !errorBody.startsWith('<!')) {
          errorMessage = `API error (${response.status}): ${errorBody.slice(0, 200)}`;
        }
      } catch { /* ignore */ }
      throw new WidgetAPIError(response.status, errorMessage);
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new WidgetAPIError(0, `API request timed out after ${API_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================================
// HELPERS (same as ownership-api.ts)
// ============================================================================

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

const pct = (v?: number) => (typeof v === 'number' ? v : null);

function buildQuery(params?: Record<string, string | number | string[] | undefined | null>): string {
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

// ============================================================================
// RESOLVE ASSET ID (uses absolute URL to gem-viz.fly.dev)
// ============================================================================

const gPrefixToCompoundCache = new Map<string, string>();

export async function resolveAssetId(assetId: string): Promise<string> {
  if (!assetId.startsWith('G') || assetId.includes('_')) return assetId;
  if (gPrefixToCompoundCache.has(assetId)) return gPrefixToCompoundCache.get(assetId)!;

  try {
    const res = await fetch(`${_appBase}/api/resolve-id?id=${encodeURIComponent(assetId)}`);
    if (res.ok) {
      const data = await res.json();
      const resolved = data.resolved as string;
      if (resolved && resolved !== assetId) {
        if (gPrefixToCompoundCache.size > 5000) gPrefixToCompoundCache.clear();
        gPrefixToCompoundCache.set(assetId, resolved);
        return resolved;
      }
    }
  } catch { /* fallback: return as-is */ }
  return assetId;
}

// ============================================================================
// NORMALIZE (same as ownership-api.ts)
// ============================================================================

interface RawEntity { [key: string]: unknown }
interface RawAsset { [key: string]: unknown }

import type { EntitySummary, AssetSummary, AssetOwner, PaginatedResponse } from '$lib/ownership-api';
import {
  FK_ID, FK_NAME, FK_FACILITY_TYPE, FK_STATUS, FK_SUB_STATUS,
  FK_CAPACITY, FK_CAPACITY_UNIT, FK_COUNTRY, FK_LATITUDE, FK_LONGITUDE,
  FK_OWNER, FK_OWNER_ENTITY_ID, FK_PARENT, FK_PARENT_ENTITY_ID,
  FK_ENTITY_ID, FK_ENTITY_NAME, FK_FULL_NAME, FK_HQ_COUNTRY,
} from '$lib/field-keys';

function normalizeEntity(raw: RawEntity): EntitySummary | null {
  const idRaw = pickKey(raw, FK_ENTITY_ID);
  const id = extractEntityId(idRaw) || String(idRaw || '').trim();
  if (!id) return null;
  const str = (keys: readonly string[]) => { const v = pickKey(raw, keys); return v ? String(v) : null; };
  return {
    id,
    name: String(pickKey(raw, FK_ENTITY_NAME) || id).trim() || id,
    fullName: str(FK_FULL_NAME),
    headquartersCountry: str(FK_HQ_COUNTRY),
    raw,
  };
}

function normalizeAsset(raw: RawAsset): AssetSummary {
  const str = (keys: readonly string[]) => { const v = pickKey(raw, keys); return v ? String(v) : null; };
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
  if (Array.isArray(raw)) return { total: null, limit: null, offset: null, count: raw.length, results: raw };
  return { total: raw.total ?? null, limit: raw.limit ?? null, offset: raw.offset ?? null, count: raw.count ?? raw.results?.length ?? 0, results: raw.results ?? [] };
}

// ============================================================================
// ENTITY ENDPOINTS
// ============================================================================

export async function getEntity(entityId: string): Promise<EntitySummary | null> {
  return normalizeEntity(await fetchAPI<RawEntity>(`/entities/${encodeURIComponent(entityId)}`));
}

export async function getEntityOwners(entityId: string) {
  const raw = await fetchAPI<Array<{ owner_entity_id?: string; owner_name?: string; ownership_percentage?: number }>>(
    `/entities/${encodeURIComponent(entityId)}/owners`
  );
  return (raw || []).map((r) => ({
    ownerEntityId: extractEntityId(r.owner_entity_id) || String(r.owner_entity_id || ''),
    ownerName: r.owner_name || String(r.owner_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

interface RawEntityGraph {
  root_entity_id: string;
  root_entity_name: string;
  nodes: Array<{ entity_id: string; entity_name: string; is_terminal?: boolean; is_root?: boolean }>;
  edges: Array<{ from_entity_id: string; to_entity_id: string; ownership_percentage?: number }>;
  terminal_node_ids?: string[];
}

import type { EntityGraphResponse, OwnershipGraphResponse, GraphNode } from '$lib/ownership-api';

function normalizeEntityGraph(raw: RawEntityGraph): EntityGraphResponse {
  return {
    rootEntityId: raw.root_entity_id,
    rootEntityName: raw.root_entity_name,
    nodes: (raw.nodes || []).map((n) => ({
      id: n.entity_id, Name: n.entity_name, type: 'entity' as const,
      is_terminal: n.is_terminal, is_root: n.is_root,
    })),
    edges: (raw.edges || []).map((e) => ({
      source: e.from_entity_id, target: e.to_entity_id, value: pct(e.ownership_percentage),
    })),
    terminalIds: raw.terminal_node_ids || [],
  };
}

async function getEntityGraph(entityId: string, direction: 'up' | 'down'): Promise<EntityGraphResponse> {
  const raw = await fetchAPI<RawEntityGraph>(`/entities/${encodeURIComponent(entityId)}/graph/${direction}`);
  return normalizeEntityGraph(raw);
}

export const getEntityGraphUp = (id: string) => getEntityGraph(id, 'up');
export const getEntityGraphDown = (id: string) => getEntityGraph(id, 'down');

// ============================================================================
// ASSET ENDPOINTS
// ============================================================================

export async function listAssets(params?: {
  q?: string; status?: string; country?: string | string[];
  asset_type?: string; limit?: number; offset?: number; facets?: boolean;
}): Promise<PaginatedResponse<AssetSummary> & { facets?: Record<string, Record<string, number>> }> {
  const queryParams: Record<string, string | number | string[] | undefined | null> = {
    q: params?.q, status: params?.status, country: params?.country,
    asset_type: params?.asset_type, limit: params?.limit, offset: params?.offset, format: 'json',
  };
  if (params?.facets) queryParams.facets = 'true';
  const raw = await fetchAPI<PaginatedResponse<RawAsset> & { facets?: Record<string, Record<string, number>> }>(
    `/assets${buildQuery(queryParams)}`
  );
  const page = normalizePaginated(raw);
  const facets = !Array.isArray(raw) ? raw.facets : undefined;
  return { ...page, results: page.results.map(normalizeAsset), facets };
}

export async function getAsset(assetId: string): Promise<AssetSummary> {
  const resolvedId = await resolveAssetId(assetId);
  const raw = await fetchAPI<RawAsset>(`/assets/${encodeURIComponent(resolvedId)}`);
  return normalizeAsset(raw);
}

// ============================================================================
// UNIFIED GRAPH ENDPOINT
// ============================================================================

export async function getOwnershipGraph(params: {
  root: string; direction?: 'up' | 'down'; max_depth?: number;
}): Promise<OwnershipGraphResponse> {
  const resolvedRoot = await resolveAssetId(params.root);
  const raw = await fetchAPI<{
    root: Record<string, unknown>;
    nodes: Array<Record<string, unknown>>;
    edges: OwnershipGraphResponse['edges'];
    paths?: OwnershipGraphResponse['paths'];
  }>(`/ownership/graph${buildQuery({ root: resolvedRoot, direction: params.direction, max_depth: params.max_depth })}`);

  const root = {
    id: String(raw.root.entity_id || raw.root.asset_id || ''),
    Name: String(raw.root.name || raw.root.asset_name || ''),
    type: (raw.root.node_type as 'entity' | 'asset') || 'asset',
  };

  const nodes: GraphNode[] = (raw.nodes || []).map((n) => ({
    id: String(n.entity_id || n.asset_id || ''),
    Name: String(n.name || n.asset_name || ''),
    type: (n.node_type as 'entity' | 'asset') || 'entity',
    is_terminal: n.is_terminal as boolean | undefined,
    is_root: n.is_root as boolean | undefined,
    entity_id: n.entity_id as string | undefined,
    headquarters_country: n.headquarters_country as string | undefined,
    entity_type: n.entity_type as string | undefined,
    publiclylisted: (n.publiclylisted || n.publicly_listed) as boolean | undefined,
    asset_type: n.asset_type as string | undefined,
  }));

  return { root, nodes, edges: raw.edges || [], paths: raw.paths };
}

// ============================================================================
// SLUG MAPPING (re-exported from tracker-schema)
// ============================================================================

export const SLUG_TO_API_TYPE: Record<string, string> = {
  ..._SCHEMA_SLUG_TO_TYPE,
  'gas-plant': _SCHEMA_SLUG_TO_TYPE['oil-gas-plant'],
  'iron-mine': _SCHEMA_SLUG_TO_TYPE['iron-ore-mine'],
  'steel-plant': _SCHEMA_SLUG_TO_TYPE['iron-steel-plant'],
  bioenergy: _SCHEMA_SLUG_TO_TYPE['bioenergy-plant'],
};

export function resolveApiSlug(tracker: string): string | null {
  return _SCHEMA_ID_TO_SLUG[tracker] ?? null;
}

// ============================================================================
// COAL PLANT LOCATION
// ============================================================================

import type { CoalPlantLocation } from '$lib/components/cards/coal-plant-types';

export async function fetchCoalPlantLocation(locationId: string): Promise<CoalPlantLocation> {
  return fetchAPI<CoalPlantLocation>(`/locations/${encodeURIComponent(locationId)}`);
}
