/** Ownership API client — REST API for entity/asset ownership relationships */

// API base URL (env override or production default)
const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net'; // Fallback to production API

// Default timeout for API requests (30 seconds)
const API_TIMEOUT_MS = 30_000;

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

  // G-prefix IDs need compound L_G format for the API.
  // Without DuckDB, we can't resolve them. Log a warning and return as-is.
  console.warn(`[ID Resolver] Cannot resolve G-prefix ID ${assetId} — compound L_G ID required by API`);
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
  entity_id?: string;
  headquarters_country?: string;
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
      imputed_share?: boolean;
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
      throw new OwnershipAPIError(response.status, errorMessage);
    }

    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OwnershipAPIError(
        0,
        `API request timed out after ${API_TIMEOUT_MS / 1000}s: ${url}`
      );
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

function normalizeEntity(raw: RawEntity): EntitySummary | null {
  const idRaw = pickKey(raw, ['Entity ID', 'GEM Entity ID', 'entity_id', 'id']);
  const id = extractEntityId(idRaw) || String(idRaw || '').trim();
  if (!id) return null; // skip ghost entries with empty IDs

  const str = (keys: string[]) => { const v = pickKey(raw, keys); return v ? String(v) : null; };
  return {
    id,
    name: String(pickKey(raw, ['Name', 'Entity Name', 'entity_name', 'name']) || id).trim() || id,
    fullName: str(['Full Name', 'full_name']),
    headquartersCountry: str(['Headquarters Country', 'Headquarters country', 'headquarters_country']),
    raw,
  };
}

function normalizeAsset(raw: RawAsset): AssetSummary {
  // Helpers: pick first non-empty key as string or number
  const str = (keys: string[]) => { const v = pickKey(raw, keys); return v ? String(v) : null; };
  const num = (keys: string[]) => toNumber(pickKey(raw, keys));

  const id = String(pickKey(raw, ['GEM Unit Phase ID', 'GEM Unit ID', 'GEM unit ID', 'gem_unit_id', 'asset_id', 'id']) || '').trim();
  return {
    id,
    name: String(pickKey(raw, ['Facility Name', 'Project', 'Unit Name', 'asset_name', 'name']) || id).trim(),
    facilityType: str(['Facility Type', 'Tracker', 'facility_type', 'asset_type']),
    status: str(['Status', 'status', 'operating_status']),
    capacity: num(['Capacity', 'Capacity (MW)', 'capacity']),
    capacityUnit: str(['Capacity Unit', 'capacity_unit']),
    country: str(['Country Area', 'Country', 'country']),
    latitude: num(['Latitude', 'lat', 'latitude']),
    longitude: num(['Longitude', 'lon', 'longitude']),
    ownerName: str(['Owner', 'Immediate Project Owner', 'owner']),
    ownerEntityId: extractEntityId(pickKey(raw, ['Owner GEM Entity ID', 'Immediate Project Owner GEM Entity ID', 'owner_entity_id'])),
    parentName: str(['Parent', 'parent']),
    parentEntityId: extractEntityId(pickKey(raw, ['Parent GEM Entity ID', 'parent_entity_id'])),
    raw,
  };
}

function normalizePaginated<T>(raw: T[] | PaginatedResponse<T>): PaginatedResponse<T> {
  if (Array.isArray(raw)) return { total: null, limit: null, offset: null, count: raw.length, results: raw };
  return { total: raw.total ?? null, limit: raw.limit ?? null, offset: raw.offset ?? null, count: raw.count ?? raw.results?.length ?? 0, results: raw.results ?? [] };
}

// ============================================================================
// ENTITY ENDPOINTS
// ============================================================================

// Build query string from an object, skipping nullish values
function buildQuery(params?: Record<string, string | number | undefined | null>): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** Search and retrieve entities with optional filtering */
export async function listEntities(params?: {
  q?: string; country?: string; limit?: number; offset?: number;
}): Promise<PaginatedResponse<EntitySummary>> {
  const raw = await fetchAPI<RawEntity[] | PaginatedResponse<RawEntity>>(
    `/entities${buildQuery(params)}`
  );
  const page = normalizePaginated(raw);
  return { ...page, results: page.results.map(normalizeEntity) };
}

export async function getEntity(entityId: string): Promise<EntitySummary> {
  return normalizeEntity(await fetchAPI<RawEntity>(`/entities/${encodeURIComponent(entityId)}`));
}

// Helper: extract ownership percentage from API row
const pct = (v?: number) => typeof v === 'number' ? v : null;

export async function getEntityOwners(entityId: string): Promise<DirectOwnership[]> {
  const raw = await fetchAPI<Array<{ owner_entity_id?: string; owner_name?: string; ownership_percentage?: number }>>(
    `/entities/${encodeURIComponent(entityId)}/owners`
  );
  return (raw || []).map((r) => ({
    ownerEntityId: extractEntityId(r.owner_entity_id) || String(r.owner_entity_id || ''),
    ownerName: r.owner_name || String(r.owner_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

export async function getEntityOwned(entityId: string): Promise<DirectOwned[]> {
  const raw = await fetchAPI<Array<{ subject_entity_id?: string; subject_entity_name?: string; ownership_percentage?: number }>>(
    `/entities/${encodeURIComponent(entityId)}/owned`
  );
  return (raw || []).map((r) => ({
    entityId: extractEntityId(r.subject_entity_id) || String(r.subject_entity_id || ''),
    entityName: r.subject_entity_name || String(r.subject_entity_id || ''),
    ownershipPct: pct(r.ownership_percentage),
  }));
}

/** Trace ownership in given direction to all terminal nodes */
function traceEntity(entityId: string, dir: 'up' | 'down'): Promise<OwnershipTraceResponse> {
  return fetchAPI(`/entities/${encodeURIComponent(entityId)}/trace/${dir}`);
}
export const traceEntityUp = (id: string) => traceEntity(id, 'up');
export const traceEntityDown = (id: string) => traceEntity(id, 'down');

// Raw shape returned by /entities/{id}/graph/{direction}
interface RawEntityGraph {
  root_entity_id: string;
  root_entity_name: string;
  nodes: Array<{ entity_id: string; entity_name: string; is_terminal?: boolean; is_root?: boolean }>;
  edges: Array<{ from_entity_id: string; to_entity_id: string; ownership_percentage?: number }>;
  terminal_node_ids?: string[];
}

function normalizeEntityGraph(raw: RawEntityGraph): EntityGraphResponse {
  return {
    rootEntityId: raw.root_entity_id,
    rootEntityName: raw.root_entity_name,
    nodes: (raw.nodes || []).map((n) => ({ id: n.entity_id, Name: n.entity_name, type: 'entity' as const, is_terminal: n.is_terminal, is_root: n.is_root })),
    edges: (raw.edges || []).map((e) => ({ source: e.from_entity_id, target: e.to_entity_id, value: pct(e.ownership_percentage) })),
    terminalIds: raw.terminal_node_ids || [],
  };
}

/** Build entity ownership graph in given direction (up = ancestors, down = descendants) */
async function getEntityGraph(entityId: string, direction: 'up' | 'down'): Promise<EntityGraphResponse> {
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
 * Mapping from our URL slugs to the actual API asset_type values.
 * The API's asset_type filter param is currently non-functional,
 * so we filter client-side using these names.
 */
export const SLUG_TO_API_TYPE: Record<string, string> = {
  'coal-plant': 'Coal Plant',
  'coal-mine': 'Coal Mine',
  'gas-plant': 'Oil & Gas Plant',
  'iron-mine': 'Iron Ore Mine',
  'steel-plant': 'Iron & Steel Plant',
  'gas-pipeline': 'Natural Gas Transmission Pipeline',
  bioenergy: 'Bioenergy Plant',
};

/** Reverse mapping: API type → our slug */
export const API_TYPE_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_API_TYPE).map(([slug, apiType]) => [apiType, slug])
);

/** Also map our tracker display names to API types */
const TRACKER_NAME_TO_API_TYPE: Record<string, string> = {
  'Coal Plant': 'Coal Plant',
  'Coal Mine': 'Coal Mine',
  'Gas Plant': 'Oil & Gas Plant',
  'Iron Mine': 'Iron Ore Mine',
  'Steel Plant': 'Iron & Steel Plant',
  'Gas Pipeline': 'Natural Gas Transmission Pipeline',
  'Bioenergy Power': 'Bioenergy Plant',
};

/** Resolve any tracker identifier (slug, display name, or API type) to API type */
export function resolveApiAssetType(tracker: string): string {
  return SLUG_TO_API_TYPE[tracker] || TRACKER_NAME_TO_API_TYPE[tracker] || tracker;
}

// ============================================================================
// ASSET ENDPOINTS
// ============================================================================

/** Search and retrieve assets with optional filtering */
export async function listAssets(params?: {
  q?: string; status?: string; country?: string; asset_type?: string; limit?: number; offset?: number;
}): Promise<PaginatedResponse<AssetSummary>> {
  // NOTE: The API's asset_type filter is non-functional (always returns all types).
  // We pass it anyway (in case it gets fixed) but also filter client-side.
  const raw = await fetchAPI<RawAsset[] | PaginatedResponse<RawAsset>>(
    `/assets${buildQuery(params)}`
  );
  const page = normalizePaginated(raw);
  return { ...page, results: page.results.map(normalizeAsset) };
}

/**
 * Fetch assets filtered by tracker type with auto-pagination.
 * Works around the broken API asset_type filter by fetching pages
 * and filtering client-side until we have enough results.
 *
 * @param assetType - Slug, display name, or API type name
 * @param opts - limit (default 100), plus optional status/country filters
 */
export async function listAssetsByType(
  assetType: string,
  opts?: { limit?: number; status?: string; country?: string }
): Promise<AssetSummary[]> {
  const apiTypeName = resolveApiAssetType(assetType);
  const limit = opts?.limit ?? 100;
  const results: AssetSummary[] = [];
  let offset = 0;
  const BATCH = 500; // API max
  const MAX_FETCH = 25000; // safety: don't fetch more than this

  while (results.length < limit && offset < MAX_FETCH) {
    const page = await listAssets({ limit: BATCH, offset, status: opts?.status, country: opts?.country });
    const filtered = page.results.filter(a => a.facilityType === apiTypeName);
    results.push(...filtered);
    offset += BATCH;
    if (page.results.length < BATCH) break; // exhausted all data
  }

  return results.slice(0, limit);
}

/**
 * Get asset counts per tracker type.
 * Fetches a sample and extrapolates based on proportions.
 * Returns a Map of API type name → estimated count.
 */
export async function getAssetTypeCounts(): Promise<Map<string, number>> {
  const SAMPLE_PAGES = 3; // 1500 assets = good sample for proportions
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

  // Extrapolate to full dataset
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
  const resolvedRoot = await resolveAssetId(params.root);
  const raw = await fetchAPI<{
    root: Record<string, unknown>;
    nodes: Array<Record<string, unknown>>;
    edges: OwnershipGraphResponse['edges'];
    paths?: OwnershipGraphResponse['paths'];
  }>(`/ownership/graph${buildQuery({ root: resolvedRoot, direction: params.direction, max_depth: params.max_depth })}`);

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
    type: (n.node_type as 'entity' | 'asset') || 'entity',
    is_terminal: n.is_terminal as boolean | undefined,
    is_root: n.is_root as boolean | undefined,
    // Preserve useful raw fields for side panel
    entity_id: n.entity_id as string | undefined,
    headquarters_country: n.headquarters_country as string | undefined,
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
    getEntity(entityId), getEntityOwners(entityId), getEntityOwned(entityId), getEntityGraphDown(entityId),
  ]);
  return { entity, owners, owned, graphDown };
}

/** Convert API graph to shape expected by OwnershipExplorerD3 */
export function graphToExplorerData(entityId: string, entityName: string, graphDown: EntityGraphResponse) {
  const subs = graphDown.nodes.filter((n) => n.id !== entityId);
  // Build direct-edge lookup: entity → ownership %
  const directEdges = new Map(
    (graphDown.edges || []).filter((e) => e.source === entityId).map((e) => [e.target, e.value ?? null])
  );
  return {
    spotlightOwner: { id: entityId, Name: entityName },
    subsidiariesMatched: subs.map((e) => [e.id, []] as [string, unknown[]]),
    directlyOwned: [] as unknown[],
    matchedEdges: subs.map((e) => [e.id, { value: directEdges.get(e.id) ?? null }] as [string, { value: number | null }]),
    entityMap: subs.map((e) => [e.id, { id: e.id, Name: e.Name, type: 'entity' }] as [string, { id: string; Name: string; type: string }]),
    assets: [] as unknown[],
  };
}

// Export the API base for debugging
export const getAPIBase = () => API_BASE;
