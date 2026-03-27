/**
 * Catalog API Client — session-cached fetchers for all /catalog/ and /metadata endpoints.
 *
 * The API is the single source of truth. Hardcoded fallbacks in tracker-schema.ts
 * exist only for offline/error resilience.
 */

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

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

export interface NumericFieldStats {
  field: string;
  name: string;
  definition?: string;
  data_type: string;
  total_rows: number;
  null_count: number;
  non_null_count: number;
  unique_count: number;
  values: number[]; // pre-sorted ascending, nulls excluded
}

/** Fetch numeric field stats (pre-sorted values array) for histogram binning. */
export async function fetchNumericFieldStats(
  catalogSlug: string,
  codeFriendlyName: string
): Promise<NumericFieldStats | null> {
  return cachedFetch<NumericFieldStats>(
    `field-stats:${catalogSlug}:${codeFriendlyName}`,
    `/catalog/metadata/${catalogSlug}/fields/${codeFriendlyName}/stats`
  );
}

/** Fetch deployment metadata — version, git info, DB stats, canonical asset_types list. */
export async function fetchApiMetadata(): Promise<ApiMetadata | null> {
  return cachedFetch<ApiMetadata>('metadata', '/metadata?format=json');
}

/** Fetch country facets from asset endpoint. Returns country→count map. */
export async function fetchCountryFacets(): Promise<Record<string, number> | null> {
  const cached = _cache.get('country-facets') as Record<string, number> | undefined;
  if (cached) return cached;
  try {
    const url = `${API_BASE}/assets?facets=true&limit=0&format=json`;
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
