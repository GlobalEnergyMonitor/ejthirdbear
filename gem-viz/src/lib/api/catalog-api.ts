/**
 * Catalog API Client — session-cached fetchers for all /catalog/ and /metadata endpoints.
 *
 * The API is the single source of truth. Hardcoded fallbacks in tracker-schema.ts
 * exist only for offline/error resilience.
 */

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

// Catalog asset-classes endpoint is on staging until backend deploys to prod.
// Once prod is live this will just equal API_BASE.
const CATALOG_API_BASE =
  import.meta.env.PUBLIC_CATALOG_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  'https://gem-ownership-api-staging.fly.dev';

// =============================================================================
// TYPES
// =============================================================================

export interface StatusTaxonomy {
  statuses: Record<
    string,
    {
      label: string;
      sub_statuses: Record<string, { label: string; description?: string }>;
    }
  >;
  raw_value_mappings: Record<string, string>;
}

export interface CatalogSource {
  source_id: number;
  source_file: string;
  source_sheet: string | null;
  source_table: string;
  asset_type: string;
  load_timestamp: string;
  row_count_input: number | null;
  row_count_output: number;
  rows_filtered: number | null;
  url: string;
}

export interface CatalogFieldMapping {
  source_id: number;
  asset_type: string;
  normalized_field: string;
  original_field: string;
  mapping_type: string;
  notes: string;
  code_friendly_name: string;
}

export interface CatalogFieldDetail {
  name: string;
  definition?: string;
  category?: string;
  data_type?: string;
  data_sub_type?: string;
  is_required?: boolean;
  code_friendly_name?: string;
  unit_name_short?: string;
  unit_name_full?: string;
  allowed_values?: string[] | Array<{ value: string; definition?: string }>;
  values_definitions?: Record<string, string>;
  present_in_tabs?: string[];
  histogram_weight?: number;
}

export interface CatalogTrackerMeta {
  citation?: Record<string, string>;
  sources?: { sheetId?: string; tabs?: string[] };
  fieldCategoriesOrdered?: string[];
  fieldsDetail?: CatalogFieldDetail[];
}

export interface CatalogIndexTracker {
  slug: string;
  name?: string;
}

export interface CatalogIndex {
  trackers: CatalogIndexTracker[];
}

export interface ApiMetadata {
  version: string;
  build_timestamp: string;
  git_commit: string;
  git_branch: string;
  database: {
    file: string;
    size_mb: number;
    asset_count: number;
    source_count: number;
    asset_types: string[];
    entity_count: number;
    ownership_relationships: number;
    asset_ownerships: number;
  };
}

// =============================================================================
// SESSION CACHE
// =============================================================================

const _cache = new Map<string, unknown>();

async function cachedFetch<T>(key: string, endpoint: string): Promise<T | null> {
  if (_cache.has(key)) return _cache.get(key) as T;
  try {
    const url = `${API_BASE}${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data: T = await res.json();
    _cache.set(key, data);
    return data;
  } catch {
    return null;
  }
}

// =============================================================================
// FETCHERS
// =============================================================================

/** Fetch status taxonomy — groups, sub-statuses, labels, descriptions, raw mappings. */
export async function fetchCatalogTaxonomy(): Promise<StatusTaxonomy | null> {
  return cachedFetch<StatusTaxonomy>('taxonomy', '/catalog/metadata/status-taxonomy?format=json');
}

/** Fetch all data sources (11 tracker spreadsheets with row counts and timestamps). */
export async function fetchCatalogSources(): Promise<{ results: CatalogSource[] } | null> {
  return cachedFetch<{ results: CatalogSource[] }>('sources', '/catalog/sources?format=json');
}

/** Fetch the catalog index — ordered list of trackers that have metadata. */
export async function fetchCatalogIndex(): Promise<CatalogIndex | null> {
  return cachedFetch<CatalogIndex>('catalog-index', '/catalog/metadata?format=json');
}

/** Fetch field metadata for a specific tracker (e.g. 'coal-mines'). */
export async function fetchCatalogFieldMeta(
  catalogSlug: string
): Promise<CatalogTrackerMeta | null> {
  return cachedFetch<CatalogTrackerMeta>(
    `field-meta:${catalogSlug}`,
    `/catalog/metadata/${catalogSlug}?format=json`
  );
}

/** Fetch normalized field mappings across all sources. */
export async function fetchCatalogFieldMappings(): Promise<{
  results: CatalogFieldMapping[];
} | null> {
  return cachedFetch<{ results: CatalogFieldMapping[] }>(
    'field-mappings',
    '/catalog/field-mappings?format=json'
  );
}

export interface FieldStats {
  field: string;
  name: string;
  definition?: string;
  data_type: string;
  data_sub_type?: string;
  category?: string;
  is_required?: boolean;
  total_rows: number;
  null_count: number;
  non_null_count: number;
  unique_count: number;
  /** Pre-sorted numeric values (numeric fields only) */
  values?: number[];
  /** Value→count pairs sorted descending (categorical/text fields) */
  value_counts?: Array<{ value: string; count: number }>;
  /** Random sample values (high-cardinality text fields) */
  sample_values?: string[];
  /** Allowed/valid values from metadata */
  allowed_values?: string[] | null;
  unit_name_short?: string;
}

/** @deprecated Use FieldStats instead */
export type NumericFieldStats = FieldStats;

/** Fetch field stats — works for any field type (numeric, categorical, text). */
export async function fetchFieldStats(
  catalogSlug: string,
  codeFriendlyName: string
): Promise<FieldStats | null> {
  return cachedFetch<FieldStats>(
    `field-stats:${catalogSlug}:${codeFriendlyName}`,
    `/catalog/metadata/${catalogSlug}/fields/${codeFriendlyName}/stats`
  );
}

/** @deprecated Use fetchFieldStats instead */
export const fetchNumericFieldStats = fetchFieldStats;

/** Fetch deployment metadata — version, git info, DB stats, canonical asset_types list. */
export async function fetchApiMetadata(): Promise<ApiMetadata | null> {
  return cachedFetch<ApiMetadata>('metadata', '/metadata?format=json');
}

// =============================================================================
// ASSET CLASS CATALOG
// =============================================================================

/** A single entry from /catalog/asset-classes */
export interface CatalogAssetClass {
  id: string;
  label: string;
  category: string;
  /** Optional description (not currently in API response but may be added) */
  description?: string;
  /** Relative URL for fetching assets in this class, e.g. "/assets?asset_type=coal-plant" */
  url?: string;
  /** Relative URL for fetching owners of this class */
  owners_url?: string;
  /** Parent class id — entries that share a parent are OR-combinable subclasses */
  parent?: string;
  /** "TBD" means not yet implemented; treat as disabled */
  notes?: string;
}

// =============================================================================
// TREE HELPERS — build nested hierarchy from flat parent-pointer list
// =============================================================================

/** A catalog class with its children nested recursively. */
export interface CatalogClassTree {
  entry: CatalogAssetClass;
  children: CatalogClassTree[];
}

/**
 * Build a forest of trees from a flat array of catalog classes using `parent` pointers.
 * Root nodes are entries whose `parent` is undefined or points to an ID not in the list.
 */
export function buildCatalogTree(classes: CatalogAssetClass[]): CatalogClassTree[] {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const childrenOf = new Map<string, CatalogAssetClass[]>();
  const roots: CatalogAssetClass[] = [];

  for (const c of classes) {
    if (!c.parent || !byId.has(c.parent)) {
      roots.push(c);
    } else {
      const siblings = childrenOf.get(c.parent) ?? [];
      siblings.push(c);
      childrenOf.set(c.parent, siblings);
    }
  }

  function toNode(entry: CatalogAssetClass): CatalogClassTree {
    const kids = childrenOf.get(entry.id) ?? [];
    return { entry, children: kids.map(toNode) };
  }

  return roots.map(toNode);
}

/** Collect all leaf entry IDs (nodes with no children) from a tree. */
export function getTreeLeafIds(node: CatalogClassTree): string[] {
  if (node.children.length === 0) return [node.entry.id];
  return node.children.flatMap(getTreeLeafIds);
}

/** Collect ALL descendant IDs (including the node itself). */
export function getAllDescendantIds(node: CatalogClassTree): string[] {
  return [node.entry.id, ...node.children.flatMap(getAllDescendantIds)];
}

/** Find a subtree by root ID within a forest. */
export function findSubtree(
  forest: CatalogClassTree[],
  id: string
): CatalogClassTree | undefined {
  for (const tree of forest) {
    if (tree.entry.id === id) return tree;
    const found = findSubtree(tree.children, id);
    if (found) return found;
  }
  return undefined;
}

let _assetClassesCache: CatalogAssetClass[] | null = null;
let _assetClassesFetchedAt = 0;
const ASSET_CLASSES_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Fetch all asset class definitions from the catalog endpoint. Returns [] on error. */
export async function fetchAssetClasses(): Promise<CatalogAssetClass[]> {
  const now = Date.now();
  if (_assetClassesCache && now - _assetClassesFetchedAt < ASSET_CLASSES_TTL_MS) {
    return _assetClassesCache;
  }
  try {
    const res = await fetch(`${CATALOG_API_BASE}/catalog/asset-classes?format=json`);
    if (!res.ok) return [];
    const data: CatalogAssetClass[] = await res.json();
    _assetClassesCache = Array.isArray(data) ? data : [];
    _assetClassesFetchedAt = now;
    return _assetClassesCache;
  } catch {
    return [];
  }
}

/**
 * Combine multiple child catalog URLs into a single OR query.
 *
 * e.g. ["/assets?asset_type=coal-plant&captive__has=aluminum",
 *       "/assets?asset_type=coal-plant&captive__has=nickel"]
 * →    "/assets?asset_type=coal-plant&captive__has=aluminum&captive__has=nickel"
 *
 * Algorithm: find params common to ALL children (same key+value) = base,
 * then append each child's unique params (the OR selectors).
 */
export function combineChildUrls(childUrls: string[]): string {
  if (childUrls.length === 0) return '';
  if (childUrls.length === 1) return childUrls[0];

  const parsed = childUrls.map((u) => new URLSearchParams(u.split('?')[1] ?? ''));
  const pathPart = childUrls[0].split('?')[0];

  // Params common to ALL children with the same value
  const base = new URLSearchParams();
  for (const [key, value] of parsed[0].entries()) {
    if (parsed.every((p) => p.get(key) === value)) {
      base.set(key, value);
    }
  }

  // Unique params from each child (not in base)
  const uniquePairs: [string, string][] = [];
  for (const params of parsed) {
    for (const [key, value] of params.entries()) {
      if (base.get(key) !== value) {
        uniquePairs.push([key, value]);
      }
    }
  }

  const result = new URLSearchParams(base);
  for (const [key, value] of uniquePairs) {
    result.append(key, value);
  }
  return `${pathPart}?${result.toString()}`;
}

/**
 * Build a fully resolved asset URL from a catalog base URL + selected children + user filters.
 *
 * @param baseUrl      Relative URL from catalog entry (parent or leaf)
 * @param childUrls    Relative URLs of selected children (empty = use baseUrl as-is)
 * @param statuses     User-selected statuses — appended as repeated &status= params
 * @param countries    User-selected countries — appended as repeated &country= params
 * @param apiBase      API host to prepend (defaults to CATALOG_API_BASE)
 */
export function buildCatalogUrl(
  baseUrl: string,
  childUrls: string[],
  statuses: string[],
  countries: string[],
  apiBase: string = CATALOG_API_BASE
): string {
  const relUrl = childUrls.length > 0 ? combineChildUrls(childUrls) : baseUrl;
  const [path, qs] = relUrl.split('?');
  const params = new URLSearchParams(qs ?? '');

  for (const s of statuses) params.append('status', s);
  for (const c of countries) params.append('country', c);

  return `${apiBase}${path}?${params.toString()}`;
}

/** Fetch country facets from asset endpoint. Returns country→count map. */
export async function fetchCountryFacets(): Promise<Record<string, number> | null> {
  const cached = _cache.get('country-facets') as Record<string, number> | undefined;
  if (cached) return cached;
  try {
    const url = `${API_BASE}/assets?facets=true&limit=1&format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const countries = data?.facets?.country || {};
    _cache.set('country-facets', countries);
    return countries;
  } catch {
    return null;
  }
}
