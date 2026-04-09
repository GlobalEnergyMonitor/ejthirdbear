/**
 * Centralized field metadata fetcher.
 *
 * API first (/catalog/metadata/{slug}), hardcoded fallback for resilience.
 * Eliminates 4 copy-pasted fieldDescriptions objects across page files.
 */

import { fetchCatalogFieldMeta, type CatalogFieldDetail } from './api/catalog-api';
import { URL_SLUG_TO_CATALOG_SLUG } from '$lib/data-config/tracker-schema';

// =============================================================================
// TYPES
// =============================================================================

export interface FieldMeta {
  columnName: string;
  category: string;
  definition: string;
  dataType?: string;
  dataSubType?: string;
  unit?: string;
  codeFriendlyName?: string;
  histogramWeight?: number;
  allowedValues?: string[] | Array<{ value: string; definition?: string }>;
  valuesDefinitions?: Record<string, string>;
  fieldValue?: string | null;
  valueDefinition?: string | null;
}

// =============================================================================
// TRACKER → CATALOG SLUG MAPPING
// =============================================================================

// Slug mapping imported from tracker-schema.ts (single source of truth)
const TRACKER_TO_CATALOG_SLUG = URL_SLUG_TO_CATALOG_SLUG;

// =============================================================================
// HARDCODED FALLBACK (common fields across all trackers)
// =============================================================================

/**
 * Fallback fields derived from the normalized API schema.
 * These match actual top-level fields on every asset — no phantom fields.
 * codeFriendlyName maps to the API field key for distribution fetching.
 * facetKey (when set) enables fast distribution via /assets?facets=true.
 */
interface FallbackField {
  category: string;
  definition: string;
  codeFriendlyName: string;
  dataType?: string;
  dataSubType?: string;
  unit?: string;
  /** If set, distribution can be fetched from facets endpoint */
  facetKey?: string;
}

const FALLBACK_FIELDS: Record<string, FallbackField> = {
  Status: {
    category: 'Main',
    definition: 'Current operating status of the asset.',
    codeFriendlyName: 'operating_status',
    dataType: 'text',
    dataSubType: 'categorical',
    facetKey: 'status',
  },
  'Sub-Status': {
    category: 'Main',
    definition: 'Detailed operating sub-status.',
    codeFriendlyName: 'operating_sub_status',
    dataType: 'text',
    dataSubType: 'categorical',
    facetKey: 'sub_status',
  },
  Country: {
    category: 'Geography',
    definition: 'Country where the asset is located.',
    codeFriendlyName: 'country',
    dataType: 'text',
    dataSubType: 'categorical',
    facetKey: 'country',
  },
  'State / Province': {
    category: 'Geography',
    definition: 'State or province where the asset is located.',
    codeFriendlyName: 'state_province',
    dataType: 'text',
    dataSubType: 'categorical',
  },
  'Asset Name': {
    category: 'Names',
    definition: 'Name of the asset or project.',
    codeFriendlyName: 'asset_name',
    dataType: 'text',
  },
  Capacity: {
    category: 'Size',
    definition: 'Production or generating capacity (unit varies by tracker).',
    codeFriendlyName: 'capacity_value',
    dataType: 'numeric',
  },
  Latitude: {
    category: 'Geography',
    definition: 'Geographic latitude coordinate (decimal degrees).',
    codeFriendlyName: 'latitude',
    dataType: 'numeric',
  },
  Longitude: {
    category: 'Geography',
    definition: 'Geographic longitude coordinate (decimal degrees).',
    codeFriendlyName: 'longitude',
    dataType: 'numeric',
  },
};

// =============================================================================
// FETCHER
// =============================================================================

/**
 * Fetch field metadata for a tracker. API first, fallback to hardcoded.
 *
 * @param trackerSlug - Our URL slug (e.g. 'coal-mine', 'gas-plant')
 * @param expandValues - If true, expand allowed_values into separate rows (for fieldguide)
 */
export async function getFieldsForTracker(
  trackerSlug: string,
  expandValues = false
): Promise<FieldMeta[]> {
  const catalogSlug = TRACKER_TO_CATALOG_SLUG[trackerSlug];
  if (catalogSlug) {
    try {
      const apiData = await fetchCatalogFieldMeta(catalogSlug);
      if (apiData?.fieldsDetail?.length) {
        return mapApiFields(apiData.fieldsDetail, expandValues);
      }
    } catch {
      // API unreachable — return empty, don't show phantom factsheet
    }
  }
  return [];
}

/**
 * Fetch both fields and the API-provided category order for a tracker.
 * Use this in FieldGuide pages so category groupings respect the tracker
 * team's intended ordering. Falls back to order-of-appearance from fieldsDetail.
 */
export async function getTrackerFieldData(trackerSlug: string): Promise<{
  fields: FieldMeta[];
  categoriesOrdered: string[];
}> {
  const catalogSlug = TRACKER_TO_CATALOG_SLUG[trackerSlug];
  if (catalogSlug) {
    try {
      const apiData = await fetchCatalogFieldMeta(catalogSlug);
      if (apiData?.fieldsDetail?.length) {
        return {
          fields: mapApiFields(apiData.fieldsDetail, true),
          categoriesOrdered: apiData.fieldCategoriesOrdered ?? [],
        };
      }
    } catch {
      // fall through to fallback
    }
  }
  return { fields: [], categoriesOrdered: [] };
}

function mapApiFields(fields: CatalogFieldDetail[], expandValues: boolean): FieldMeta[] {
  if (!expandValues) {
    return fields.map((f) => ({
      columnName: f.name,
      category: f.category || 'Other',
      definition: f.definition || `${f.name} field.`,
      dataType: f.data_type,
      dataSubType: f.data_sub_type,
      unit: f.unit_name_short,
      codeFriendlyName: f.code_friendly_name,
      histogramWeight: (f as unknown as { histogram_weight?: number }).histogram_weight,
      allowedValues: f.allowed_values,
      valuesDefinitions: f.values_definitions,
    }));
  }

  // Expand allowed values into separate rows (for fieldguide display)
  const expanded: FieldMeta[] = [];
  for (const f of fields) {
    expanded.push({
      columnName: f.name,
      category: f.category || 'Other',
      definition: f.definition || `${f.name} field.`,
      dataType: f.data_type,
      dataSubType: f.data_sub_type,
      unit: f.unit_name_short,
      codeFriendlyName: f.code_friendly_name,
      fieldValue: null,
      valueDefinition: null,
    });
    // Add rows for each allowed value that has a definition
    if (f.values_definitions) {
      for (const [value, def] of Object.entries(f.values_definitions)) {
        expanded.push({
          columnName: f.name,
          category: f.category || 'Other',
          definition: f.definition || '',
          fieldValue: value,
          valueDefinition: def,
        });
      }
    }
  }
  return expanded;
}

function getFallbackFields(): FieldMeta[] {
  return Object.entries(FALLBACK_FIELDS).map(([name, meta]) => ({
    columnName: name,
    category: meta.category,
    definition: meta.definition,
    codeFriendlyName: meta.codeFriendlyName,
    dataType: meta.dataType,
    dataSubType: meta.dataSubType,
    unit: meta.unit,
  }));
}

/**
 * For a given field, return the facet key if it can be resolved via the
 * /assets?facets=true endpoint (much faster than paginating all assets).
 */
export function getFacetKeyForField(fieldName: string): string | undefined {
  return FALLBACK_FIELDS[fieldName]?.facetKey;
}
