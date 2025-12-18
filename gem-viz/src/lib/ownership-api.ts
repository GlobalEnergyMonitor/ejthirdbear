/**
 * Ownership Tracing API Client
 *
 * REST API for mapping ownership relationships between entities and assets.
 * Replaces MotherDuck queries for ownership-related data.
 *
 * API Base: Configurable via environment variable
 * Docs: /docs (Swagger UI)
 */

// API base URL - can be overridden via environment
const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://6b7c36096b12.ngrok.app';

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

export interface AssetSummary {
  id: string;
  name: string;
  facilityType?: string | null;
  status?: string | null;
  capacity?: number | null;
  capacityUnit?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  ownerName?: string | null;
  ownerEntityId?: string | null;
  parentName?: string | null;
  parentEntityId?: string | null;
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

export interface OwnershipTracePath {
  terminal: OwnershipTraceNode;
  path: Array<{ node: OwnershipTraceNode; share?: number }>;
}

export interface OwnershipTraceResponse {
  root: OwnershipTraceNode;
  terminals: OwnershipTracePath[];
}

export interface GraphNode {
  id: string;
  Name: string;
  type: 'entity' | 'asset';
  is_terminal?: boolean;
  is_root?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  value?: number | null;
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
      imputedShare?: boolean;
      depth?: number;
    }
  >;
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
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'OwnershipAPIError';
  }
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new OwnershipAPIError(response.status, `API error: ${response.statusText}`);
  }

  return response.json();
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

function pickKey<T extends Record<string, unknown>>(obj: T, keys: string[]): unknown {
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

function normalizeEntity(raw: RawEntity): EntitySummary {
  const idRaw = pickKey(raw, ['Entity ID', 'GEM Entity ID', 'entity_id', 'id']);
  const id = extractEntityId(idRaw) || String(idRaw || '').trim();
  const name =
    String(pickKey(raw, ['Name', 'Entity Name', 'entity_name', 'name']) || id || '').trim() || id;
  const fullName = pickKey(raw, ['Full Name', 'full_name']);
  const headquartersCountry = pickKey(raw, [
    'Headquarters Country',
    'Headquarters country',
    'headquarters_country',
  ]);

  return {
    id,
    name,
    fullName: fullName ? String(fullName) : null,
    headquartersCountry: headquartersCountry ? String(headquartersCountry) : null,
    raw,
  };
}

function normalizeAsset(raw: RawAsset): AssetSummary {
  const idRaw = pickKey(raw, [
    'GEM Unit Phase ID',
    'GEM Unit ID',
    'GEM unit ID',
    'gem_unit_id',
    'id',
  ]);
  const id = String(idRaw || '').trim();
  const name = String(
    pickKey(raw, ['Facility Name', 'Project', 'Unit Name', 'asset_name', 'name']) || id
  ).trim();
  const facilityType = pickKey(raw, ['Facility Type', 'Tracker', 'facility_type']);
  const status = pickKey(raw, ['Status', 'status']);
  const capacity = toNumber(pickKey(raw, ['Capacity', 'Capacity (MW)', 'capacity']));
  const capacityUnit = pickKey(raw, ['Capacity Unit', 'capacity_unit']);
  const country = pickKey(raw, ['Country Area', 'Country', 'country']);
  const latitude = toNumber(pickKey(raw, ['Latitude', 'lat', 'latitude']));
  const longitude = toNumber(pickKey(raw, ['Longitude', 'lon', 'longitude']));
  const ownerName = pickKey(raw, ['Owner', 'Immediate Project Owner', 'owner']);
  const ownerEntityRaw = pickKey(raw, [
    'Owner GEM Entity ID',
    'Immediate Project Owner GEM Entity ID',
    'owner_entity_id',
  ]);
  const parentName = pickKey(raw, ['Parent', 'parent']);
  const parentEntityRaw = pickKey(raw, ['Parent GEM Entity ID', 'parent_entity_id']);

  return {
    id,
    name,
    facilityType: facilityType ? String(facilityType) : null,
    status: status ? String(status) : null,
    capacity,
    capacityUnit: capacityUnit ? String(capacityUnit) : null,
    country: country ? String(country) : null,
    latitude,
    longitude,
    ownerName: ownerName ? String(ownerName) : null,
    ownerEntityId: extractEntityId(ownerEntityRaw),
    parentName: parentName ? String(parentName) : null,
    parentEntityId: extractEntityId(parentEntityRaw),
    raw,
  };
}

function normalizePaginated<T>(raw: T[] | PaginatedResponse<T>): PaginatedResponse<T> {
  if (Array.isArray(raw)) {
    return {
      total: null,
      limit: null,
      offset: null,
      count: raw.length,
      results: raw,
    };
  }

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

/**
 * Search and retrieve entities with optional filtering
 */
export async function listEntities(params?: {
  q?: string;
  country?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<EntitySummary>> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const raw = await fetchAPI<RawEntity[] | PaginatedResponse<RawEntity>>(
    `/entities${query ? `?${query}` : ''}`
  );
  const page = normalizePaginated(raw);
  return {
    ...page,
    results: page.results.map((entity) => normalizeEntity(entity)),
  };
}

/**
 * Get complete details for a specific entity
 */
export async function getEntity(entityId: string): Promise<EntitySummary> {
  const raw = await fetchAPI<RawEntity>(`/entities/${encodeURIComponent(entityId)}`);
  return normalizeEntity(raw);
}

/**
 * Get all entities that directly own the specified entity
 */
export async function getEntityOwners(entityId: string): Promise<DirectOwnership[]> {
  const raw = await fetchAPI<
    Array<{
      owner_entity_id?: string;
      owner_name?: string;
      ownership_percentage?: number;
    }>
  >(`/entities/${encodeURIComponent(entityId)}/owners`);
  return (raw || []).map((row) => ({
    ownerEntityId: extractEntityId(row.owner_entity_id) || String(row.owner_entity_id || ''),
    ownerName: row.owner_name || String(row.owner_entity_id || ''),
    ownershipPct: typeof row.ownership_percentage === 'number' ? row.ownership_percentage : null,
  }));
}

/**
 * Get all entities directly owned by the specified entity
 */
export async function getEntityOwned(entityId: string): Promise<DirectOwned[]> {
  const raw = await fetchAPI<
    Array<{
      subject_entity_id?: string;
      subject_entity_name?: string;
      ownership_percentage?: number;
    }>
  >(`/entities/${encodeURIComponent(entityId)}/owned`);
  return (raw || []).map((row) => ({
    entityId: extractEntityId(row.subject_entity_id) || String(row.subject_entity_id || ''),
    entityName: row.subject_entity_name || String(row.subject_entity_id || ''),
    ownershipPct: typeof row.ownership_percentage === 'number' ? row.ownership_percentage : null,
  }));
}

/**
 * Trace ownership upwards to all terminal ancestors
 */
export async function traceEntityUp(entityId: string): Promise<OwnershipTraceResponse> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/trace/up`);
}

/**
 * Trace ownership downwards to all terminal descendants
 */
export async function traceEntityDown(entityId: string): Promise<OwnershipTraceResponse> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/trace/down`);
}

/**
 * Build complete ownership graph by traversing upwards
 */
export async function getEntityGraphUp(entityId: string): Promise<EntityGraphResponse> {
  const raw = await fetchAPI<{
    root_entity_id: string;
    root_entity_name: string;
    nodes: Array<{
      entity_id: string;
      entity_name: string;
      is_terminal?: boolean;
      is_root?: boolean;
    }>;
    edges: Array<{
      from_entity_id: string;
      from_entity_name?: string;
      to_entity_id: string;
      to_entity_name?: string;
      ownership_percentage?: number;
    }>;
    terminal_node_ids?: string[];
  }>(`/entities/${encodeURIComponent(entityId)}/graph/up`);
  return {
    rootEntityId: raw.root_entity_id,
    rootEntityName: raw.root_entity_name,
    nodes: (raw.nodes || []).map((n) => ({
      id: n.entity_id,
      Name: n.entity_name,
      type: 'entity',
      is_terminal: n.is_terminal,
      is_root: n.is_root,
    })),
    edges: (raw.edges || []).map((e) => ({
      source: e.from_entity_id,
      target: e.to_entity_id,
      value: typeof e.ownership_percentage === 'number' ? e.ownership_percentage : null,
    })),
    terminalIds: raw.terminal_node_ids || [],
  };
}

/**
 * Build complete ownership graph by traversing downwards
 */
export async function getEntityGraphDown(entityId: string): Promise<EntityGraphResponse> {
  const raw = await fetchAPI<{
    root_entity_id: string;
    root_entity_name: string;
    nodes: Array<{
      entity_id: string;
      entity_name: string;
      is_terminal?: boolean;
      is_root?: boolean;
    }>;
    edges: Array<{
      from_entity_id: string;
      from_entity_name?: string;
      to_entity_id: string;
      to_entity_name?: string;
      ownership_percentage?: number;
    }>;
    terminal_node_ids?: string[];
  }>(`/entities/${encodeURIComponent(entityId)}/graph/down`);
  return {
    rootEntityId: raw.root_entity_id,
    rootEntityName: raw.root_entity_name,
    nodes: (raw.nodes || []).map((n) => ({
      id: n.entity_id,
      Name: n.entity_name,
      type: 'entity',
      is_terminal: n.is_terminal,
      is_root: n.is_root,
    })),
    edges: (raw.edges || []).map((e) => ({
      source: e.from_entity_id,
      target: e.to_entity_id,
      value: typeof e.ownership_percentage === 'number' ? e.ownership_percentage : null,
    })),
    terminalIds: raw.terminal_node_ids || [],
  };
}

// ============================================================================
// ASSET ENDPOINTS
// ============================================================================

/**
 * Search and retrieve assets with optional filtering
 */
export async function listAssets(params?: {
  q?: string;
  status?: string;
  country?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedResponse<AssetSummary>> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const raw = await fetchAPI<RawAsset[] | PaginatedResponse<RawAsset>>(
    `/assets${query ? `?${query}` : ''}`
  );
  const page = normalizePaginated(raw);
  return {
    ...page,
    results: page.results.map((asset) => normalizeAsset(asset)),
  };
}

/**
 * Get full asset details
 */
export async function getAsset(assetId: string): Promise<AssetSummary> {
  const raw = await fetchAPI<RawAsset>(`/assets/${encodeURIComponent(assetId)}`);
  return normalizeAsset(raw);
}

// ============================================================================
// UNIFIED GRAPH ENDPOINT
// ============================================================================

/**
 * Universal ownership graph - works with both entities and assets
 */
export async function getOwnershipGraph(params: {
  root: string;
  direction?: 'up' | 'down';
  max_depth?: number;
}): Promise<OwnershipGraphResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('root', params.root);
  if (params.direction) searchParams.set('direction', params.direction);
  if (params.max_depth) searchParams.set('max_depth', String(params.max_depth));

  const raw = await fetchAPI<{
    root: OwnershipTraceNode;
    nodes: GraphNode[];
    edges: Array<{
      source: string;
      target: string;
      value?: number | null;
      type?: 'leafEdge' | 'intermediateEdge';
      refUrl?: string | null;
      imputedShare?: boolean;
      depth?: number;
    }>;
  }>(`/ownership/graph?${searchParams.toString()}`);
  return {
    root: raw.root,
    nodes: raw.nodes || [],
    edges: raw.edges || [],
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get entity with ownership stats (parallel fetch)
 * Replaces: fetchOwnerStats + fetchOwnerPortfolio
 */
export async function getEntityWithPortfolio(entityId: string): Promise<{
  entity: EntitySummary;
  owners: DirectOwnership[];
  owned: DirectOwned[];
  graphDown: EntityGraphResponse;
}> {
  const [entity, owners, owned, graphDown] = await Promise.all([
    getEntity(entityId),
    getEntityOwners(entityId),
    getEntityOwned(entityId),
    getEntityGraphDown(entityId),
  ]);

  return { entity, owners, owned, graphDown };
}

/**
 * Convert API graph response to the format expected by OwnershipExplorerD3
 * This matches the shape of ownerExplorerData in +page.server.js
 */
export function graphToExplorerData(
  entityId: string,
  entityName: string,
  graphDown: EntityGraphResponse
): {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: [string, unknown[]][];
  directlyOwned: unknown[];
  matchedEdges: [string, { value: number }][];
  entityMap: [string, { id: string; Name: string; type: string }][];
  assets: unknown[];
} {
  const entities = graphDown.nodes.filter((n) => n.id !== entityId);
  const edgeMap = new Map<string, number | null>();
  for (const edge of graphDown.edges || []) {
    if (edge.source === entityId) {
      edgeMap.set(edge.target, edge.value ?? null);
    }
  }

  const subsidiariesMatched: [string, unknown[]][] = entities.map((e) => [e.id, []]);
  const matchedEdges: [string, { value: number | null }][] = entities.map((e) => [
    e.id,
    { value: edgeMap.get(e.id) ?? null },
  ]);
  const entityMap: [string, { id: string; Name: string; type: string }][] = entities.map((e) => [
    e.id,
    { id: e.id, Name: e.Name, type: 'entity' },
  ]);

  return {
    spotlightOwner: { id: entityId, Name: entityName },
    subsidiariesMatched,
    directlyOwned: [],
    matchedEdges,
    entityMap,
    assets: [],
  };
}

// Export the API base for debugging
export const getAPIBase = () => API_BASE;
