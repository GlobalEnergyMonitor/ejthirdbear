/**
 * Widget API client — thin adapter over ownership-api.ts for dynamic embeds.
 *
 * Adds runtime-configurable API base URL (for cross-origin Drupal usage)
 * and a widget-specific resolveAssetId that calls the app's /api/resolve-id.
 *
 * All normalize/helper logic is imported from ownership-api.ts (single source of truth).
 */

import {
  API_SLUG_TO_TYPE as _SCHEMA_SLUG_TO_TYPE,
  IDENTIFIER_TO_API_SLUG as _SCHEMA_ID_TO_SLUG,
} from '$lib/data-config/tracker-schema';
import {
  buildQuery,
  toNumber,
  pickKey,
  extractEntityId,
  pct,
  normalizeEntity,
  normalizeAsset,
  normalizePaginated,
  normalizeEntityGraph,
} from '$lib/ownership-api';

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
  RawEntity,
  RawAsset,
} from '$lib/ownership-api';

import type {
  EntitySummary,
  AssetSummary,
  AssetOwner,
  PaginatedResponse,
  EntityGraphResponse,
  OwnershipGraphResponse,
  GraphNode,
  RawEntity,
  RawAsset,
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

export function getApiBase() {
  return _apiBase;
}
export function getAppBase() {
  return _appBase;
}

// ============================================================================
// API CLIENT (widget-specific: runtime-configurable base URL, no api-log)
// ============================================================================

const API_TIMEOUT_MS = 30_000;

class WidgetAPIError extends Error {
  constructor(
    public _status: number,
    message: string
  ) {
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
      } catch {
        /* ignore */
      }
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
// RESOLVE ASSET ID (widget-specific: uses app's /api/resolve-id endpoint)
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
  } catch {
    /* fallback: return as-is */
  }
  return assetId;
}

// ============================================================================
// ENTITY ENDPOINTS (use widget fetchAPI + shared normalizers)
// ============================================================================

export async function getEntity(entityId: string): Promise<EntitySummary | null> {
  return normalizeEntity(await fetchAPI<RawEntity>(`/entities/${encodeURIComponent(entityId)}`));
}

export async function getEntityOwners(entityId: string) {
  const raw = await fetchAPI<
    Array<{ owner_entity_id?: string; owner_name?: string; ownership_percentage?: number }>
  >(`/entities/${encodeURIComponent(entityId)}/owners`);
  return (raw || []).map((r) => ({
    ownerEntityId: extractEntityId(r.owner_entity_id) || String(r.owner_entity_id || ''),
    ownerName: r.owner_name || String(r.owner_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

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
// ASSET ENDPOINTS
// ============================================================================

export async function listAssets(params?: {
  q?: string;
  status?: string;
  country?: string | string[];
  asset_type?: string;
  limit?: number;
  offset?: number;
  facets?: boolean;
}): Promise<PaginatedResponse<AssetSummary> & { facets?: Record<string, Record<string, number>> }> {
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

export async function getAsset(assetId: string): Promise<AssetSummary> {
  const resolvedId = await resolveAssetId(assetId);
  const raw = await fetchAPI<RawAsset>(`/assets/${encodeURIComponent(resolvedId)}`);
  return normalizeAsset(raw);
}

// ============================================================================
// UNIFIED GRAPH ENDPOINT
// ============================================================================

export async function getOwnershipGraph(params: {
  root: string;
  direction?: 'up' | 'down';
}): Promise<OwnershipGraphResponse> {
  const resolvedRoot = await resolveAssetId(params.root);
  const raw = await fetchAPI<{
    root: Record<string, unknown>;
    nodes: Array<Record<string, unknown>>;
    edges: OwnershipGraphResponse['edges'];
    paths?: OwnershipGraphResponse['paths'];
  }>(
    `/ownership/graph${buildQuery({ root: resolvedRoot, direction: params.direction })}`
  );

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
