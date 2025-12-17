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
const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_URL || 'https://6b7c36096b12.ngrok.app';

// ============================================================================
// TYPES
// ============================================================================

export interface Entity {
  'Entity ID': string;
  Name: string;
  'Full Name'?: string;
  'Headquarters Country'?: string;
}

export interface Asset {
  gem_unit_id: string;
  facility_name: string;
  facility_type?: string;
  status?: string;
  capacity?: number | string;
  capacity_unit?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  owner?: string;
  owner_entity_id?: string;
}

export interface DirectOwnership {
  owner_entity_id: string;
  owner_name: string;
  ownership_pct: number;
}

export interface DirectOwned {
  entity_id: string;
  entity_name: string;
  ownership_pct: number;
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
  ownership_pct?: number;
}

export interface OwnershipGraphResponse {
  root: OwnershipTraceNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  terminal_ids: string[];
}

export interface UnifiedGraphResponse {
  root_node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PaginatedResponse<T> {
  total: number;
  limit: number;
  offset: number;
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
}): Promise<PaginatedResponse<Entity>> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  return fetchAPI(`/entities${query ? `?${query}` : ''}`);
}

/**
 * Get complete details for a specific entity
 */
export async function getEntity(entityId: string): Promise<Entity> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}`);
}

/**
 * Get all entities that directly own the specified entity
 */
export async function getEntityOwners(entityId: string): Promise<DirectOwnership[]> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/owners`);
}

/**
 * Get all entities directly owned by the specified entity
 */
export async function getEntityOwned(entityId: string): Promise<DirectOwned[]> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/owned`);
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
export async function getEntityGraphUp(entityId: string): Promise<OwnershipGraphResponse> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/graph/up`);
}

/**
 * Build complete ownership graph by traversing downwards
 */
export async function getEntityGraphDown(entityId: string): Promise<OwnershipGraphResponse> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/graph/down`);
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
}): Promise<PaginatedResponse<Asset>> {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set('q', params.q);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.country) searchParams.set('country', params.country);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  return fetchAPI(`/assets${query ? `?${query}` : ''}`);
}

/**
 * Get full asset details
 */
export async function getAsset(assetId: string): Promise<Asset> {
  return fetchAPI(`/assets/${encodeURIComponent(assetId)}`);
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
}): Promise<UnifiedGraphResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('root', params.root);
  if (params.direction) searchParams.set('direction', params.direction);
  if (params.max_depth) searchParams.set('max_depth', String(params.max_depth));

  return fetchAPI(`/ownership/graph?${searchParams.toString()}`);
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Get entity with ownership stats (parallel fetch)
 * Replaces: fetchOwnerStats + fetchOwnerPortfolio
 */
export async function getEntityWithPortfolio(entityId: string): Promise<{
  entity: Entity;
  owners: DirectOwnership[];
  owned: DirectOwned[];
  graphDown: OwnershipGraphResponse;
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
  graphDown: OwnershipGraphResponse
): {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: [string, unknown[]][];
  directlyOwned: unknown[];
  matchedEdges: [string, { value: number }][];
  entityMap: [string, { id: string; Name: string; type: string }][];
  assets: unknown[];
} {
  // Group nodes by type
  const entities = graphDown.nodes.filter((n) => n.type === 'entity' && n.id !== entityId);
  const assets = graphDown.nodes.filter((n) => n.type === 'asset');

  // Build edge map for ownership percentages
  const edgeMap = new Map<string, number>();
  for (const edge of graphDown.edges || []) {
    if (edge.source === entityId && edge.ownership_pct) {
      edgeMap.set(edge.target, edge.ownership_pct);
    }
  }

  // Group assets by their parent entity (subsidiary)
  const subsidiaryAssets = new Map<string, unknown[]>();
  const directlyOwned: unknown[] = [];

  for (const asset of assets) {
    // Find which entity owns this asset
    const ownerEdge = graphDown.edges?.find((e) => e.target === asset.id);
    if (ownerEdge && ownerEdge.source !== entityId) {
      // Owned via subsidiary
      const subAssets = subsidiaryAssets.get(ownerEdge.source) || [];
      subAssets.push({
        id: asset.id,
        name: asset.Name,
        tracker: 'Unknown', // API doesn't provide tracker info yet
        status: 'Unknown',
      });
      subsidiaryAssets.set(ownerEdge.source, subAssets);
    } else {
      // Directly owned
      directlyOwned.push({
        id: asset.id,
        name: asset.Name,
        tracker: 'Unknown',
        status: 'Unknown',
      });
    }
  }

  // Convert to expected format
  const subsidiariesMatched: [string, unknown[]][] = Array.from(subsidiaryAssets.entries());
  const matchedEdges: [string, { value: number }][] = entities.map((e) => [
    e.id,
    { value: edgeMap.get(e.id) || 0 },
  ]);
  const entityMap: [string, { id: string; Name: string; type: string }][] = entities.map((e) => [
    e.id,
    { id: e.id, Name: e.Name, type: 'entity' },
  ]);

  return {
    spotlightOwner: { id: entityId, Name: entityName },
    subsidiariesMatched,
    directlyOwned,
    matchedEdges,
    entityMap,
    assets: assets.map((a) => ({
      id: a.id,
      name: a.Name,
      tracker: 'Unknown',
      status: 'Unknown',
    })),
  };
}

// Export the API base for debugging
export const getAPIBase = () => API_BASE;
