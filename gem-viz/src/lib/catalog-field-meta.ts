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

const FALLBACK_FIELDS: Record<string, { category: string; definition: string }> = {
  Status: { category: 'Main', definition: 'Current operating status of the asset.' },
  Country: { category: 'Geography', definition: 'Country where the asset is located.' },
  Countries: { category: 'Geography', definition: 'Countries the pipeline passes through.' },
  Owner: { category: 'Ownership', definition: 'Primary owner or operator.' },
  'Immediate Owner Entity Name': {
    category: 'Ownership',
    definition: 'Direct ownership entity name.',
  },
  'Start year': {
    category: 'Age',
    definition: 'Year the asset began or is planned to begin operation.',
  },
  'Capacity (MW)': { category: 'Size', definition: 'Generating capacity in megawatts.' },
  'Capacity (Mtpa)': {
    category: 'Size',
    definition: 'Production capacity in million tonnes per annum.',
  },
  'Design capacity (ttpa)': {
    category: 'Size',
    definition: 'Design production capacity in thousand tonnes per annum.',
  },
  'Nominal crude steel capacity (ttpa)': {
    category: 'Size',
    definition: 'Nominal crude steel production capacity in thousand tonnes per annum.',
  },
  'CapacityBcm/y': {
    category: 'Size',
    definition: 'Pipeline capacity in billion cubic meters per year.',
  },
  'Fuel type': { category: 'Details', definition: 'Type of fuel used by the plant.' },
  Technology: { category: 'Details', definition: 'Technology or process type used.' },
  'Mine type': {
    category: 'Details',
    definition: 'Type of mining operation (surface, underground, etc.).',
  },
  Feedstock: { category: 'Details', definition: 'Primary feedstock material for bioenergy.' },
  'Asset Name': { category: 'Names', definition: 'Name of the asset or project.' },
  '% Share of Ownership': { category: 'Ownership', definition: 'Percentage ownership stake.' },
  'Asset Type': { category: 'Main', definition: 'Type of tracked asset (plant, mine, pipeline).' },
  Latitude: {
    category: 'Geography',
    definition: 'Geographic latitude coordinate (decimal degrees).',
  },
  Longitude: {
    category: 'Geography',
    definition: 'Geographic longitude coordinate (decimal degrees).',
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
      // fall through to fallback
    }
  }
  return getFallbackFields();
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
  return { fields: getFallbackFields(), categoriesOrdered: [] };
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
  }));
}
