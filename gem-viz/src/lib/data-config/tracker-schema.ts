/**
 * Centralized Tracker Schema Configuration
 *
 * Single source of truth for:
 * - Available trackers and their metadata
 * - Fields available per tracker (from consolidated parquet)
 * - Field types (for operator selection)
 * - SQL column mappings
 * - Status values
 * - Quick-add presets for screener
 *
 * This config reflects what's actually available in the consolidated
 * ownership parquet file. For detailed tracker fields, see asset-classes.ts.
 */

// Import and re-export SQL utilities for convenience
import { escapeSQL as _escapeSQL } from '$lib/utils/sql';
export const escapeSQL = _escapeSQL;

// =============================================================================
// TRACKERS
// =============================================================================

export const TRACKERS = [
  'Bioenergy Power',
  'Coal Mine',
  'Coal Plant',
  'Gas Pipeline',
  'Gas Plant',
  'Iron Mine',
  'Steel Plant',
] as const;

export type TrackerName = (typeof TRACKERS)[number];

// =============================================================================
// TRACKER TO MOTHERDUCK ASSET TYPE MAPPING
// =============================================================================

/**
 * Maps UI tracker names to MotherDuck "Asset Type" column values.
 * Use this when querying the ownership table.
 */
export const TRACKER_TO_ASSET_TYPE: Record<TrackerName, string> = {
  'Bioenergy Power': 'Bioenergy Power',
  'Coal Mine': 'Coal Mine',
  'Coal Plant': 'Coal Plant',
  'Gas Pipeline': 'Natural Gas Transmission Pipeline',
  'Gas Plant': 'Gas Plant',
  'Iron Mine': 'Iron Ore Mine',
  'Steel Plant': 'Iron & Steel Plant',
};

/**
 * Trackers that have ownership data available in MotherDuck for aggregation queries.
 * Other trackers are available in the REST API but not yet loaded into MotherDuck.
 * This is used to show appropriate warnings in the screener UI.
 */
export const TRACKERS_WITH_MOTHERDUCK_DATA: TrackerName[] = [
  'Bioenergy Power',
  'Coal Plant',
  'Gas Plant',
  'Steel Plant',
];

/**
 * Check if a tracker has aggregation data in MotherDuck
 */
export function hasMotherDuckData(tracker: string): boolean {
  return TRACKERS_WITH_MOTHERDUCK_DATA.includes(tracker as TrackerName);
}

/**
 * Get the MotherDuck asset type for a tracker
 */
export function getAssetTypeForTracker(tracker: string): string | null {
  if (!isValidTracker(tracker)) return null;
  return TRACKER_TO_ASSET_TYPE[tracker] || tracker;
}

// =============================================================================
// FIELDS BY TRACKER (available in consolidated parquet)
// =============================================================================

export interface FieldConfig {
  /** Display label */
  label: string;
  /** SQL column name (with quotes if needed) */
  sql: string;
  /** Field type for operator selection */
  type: 'numeric' | 'text' | 'enum';
  /** For enum fields, the valid values */
  enumValues?: readonly string[];
}

/**
 * Common fields available across all trackers
 */
const COMMON_FIELDS: Record<string, FieldConfig> = {
  Status: {
    label: 'Status',
    sql: 'Status',
    type: 'enum',
    enumValues: [], // populated from STATUS_VALUES
  },
  'Owner Headquarters Country': {
    label: 'Owner HQ Country',
    sql: '"Owner Headquarters Country"',
    type: 'enum',
    enumValues: [], // populated from COUNTRIES
  },
  'Owner Registration Country': {
    label: 'Owner Registration Country',
    sql: '"Owner Registration Country"',
    type: 'enum',
    enumValues: [],
  },
};

/**
 * Tracker-specific fields (capacity fields vary by tracker)
 */
export const FIELDS_BY_TRACKER: Record<TrackerName, Record<string, FieldConfig>> = {
  'Coal Plant': {
    'Capacity (MW)': { label: 'Capacity (MW)', sql: '"Capacity (MW)"', type: 'numeric' },
    ...COMMON_FIELDS,
  },
  'Gas Plant': {
    'Capacity (MW)': { label: 'Capacity (MW)', sql: '"Capacity (MW)"', type: 'numeric' },
    ...COMMON_FIELDS,
  },
  'Bioenergy Power': {
    'Capacity (MW)': { label: 'Capacity (MW)', sql: '"Capacity (MW)"', type: 'numeric' },
    ...COMMON_FIELDS,
  },
  'Coal Mine': {
    'Capacity (Mtpa)': { label: 'Capacity (Mtpa)', sql: '"Capacity (Mtpa)"', type: 'numeric' },
    ...COMMON_FIELDS,
  },
  'Steel Plant': {
    'Nominal crude steel capacity (ttpa)': {
      label: 'Steel Capacity (ttpa)',
      sql: '"Nominal crude steel capacity (ttpa)"',
      type: 'numeric',
    },
    'Nominal iron capacity (ttpa)': {
      label: 'Iron Capacity (ttpa)',
      sql: '"Nominal iron capacity (ttpa)"',
      type: 'numeric',
    },
    ...COMMON_FIELDS,
  },
  'Iron Mine': {
    'Nominal iron capacity (ttpa)': {
      label: 'Iron Capacity (ttpa)',
      sql: '"Nominal iron capacity (ttpa)"',
      type: 'numeric',
    },
    ...COMMON_FIELDS,
  },
  'Gas Pipeline': {
    'CapacityBcm/y': { label: 'Capacity (Bcm/y)', sql: '"CapacityBcm/y"', type: 'numeric' },
    ...COMMON_FIELDS,
  },
};

/**
 * Check if a string is a valid tracker name
 */
export function isValidTracker(tracker: string): tracker is TrackerName {
  return TRACKERS.includes(tracker as TrackerName);
}

/**
 * Get field names for a tracker (for select dropdowns)
 */
export function getFieldsForTracker(tracker: string): string[] {
  if (!isValidTracker(tracker)) return [];
  return Object.keys(FIELDS_BY_TRACKER[tracker] || {});
}

/**
 * Get field config
 */
export function getFieldConfig(tracker: string, field: string): FieldConfig | undefined {
  if (!isValidTracker(tracker)) return undefined;
  return FIELDS_BY_TRACKER[tracker]?.[field];
}

// =============================================================================
// STATUS VALUES
// =============================================================================

export const STATUS_VALUES = [
  'announced',
  'cancelled',
  'construction',
  'idle',
  'mothballed',
  'operating',
  'permitted',
  'pre-construction',
  'pre-permit',
  'proposed',
  'retired',
  'shelved',
] as const;

export type StatusValue = (typeof STATUS_VALUES)[number];

// =============================================================================
// OPERATORS
// =============================================================================

export interface Operator {
  value: string;
  label: string;
}

export const NUMERIC_OPERATORS: Operator[] = [
  { value: '>', label: 'greater than' },
  { value: '<', label: 'less than' },
  { value: '>=', label: 'at least' },
  { value: '<=', label: 'at most' },
  { value: '=', label: 'equals' },
];

export const TEXT_OPERATORS: Operator[] = [
  { value: '=', label: 'is exactly' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of' },
  { value: 'not_empty', label: 'has a value' },
];

export function getOperatorsForField(fieldConfig: FieldConfig | undefined): Operator[] {
  if (!fieldConfig) return [];
  return fieldConfig.type === 'numeric' ? NUMERIC_OPERATORS : TEXT_OPERATORS;
}

// =============================================================================
// SQL HELPERS
// =============================================================================

/**
 * Build SQL condition from filter parameters
 */
export function buildSqlCondition(
  tracker: TrackerName,
  field: string,
  operator: string,
  value: string | number | undefined
): string | null {
  const config = getFieldConfig(tracker, field);
  if (!config) return null;

  const sqlField = config.sql;

  switch (operator) {
    case '>':
    case '<':
    case '>=':
    case '<=':
      return `${sqlField} ${operator} ${Number(value) || 0}`;
    case '=':
      return `${sqlField} ILIKE '${escapeSQL(String(value))}'`;
    case 'contains':
      return `${sqlField} ILIKE '%${escapeSQL(String(value))}%'`;
    case 'not_empty':
      return `${sqlField} IS NOT NULL AND ${sqlField} != ''`;
    case 'in': {
      const vals = String(value)
        .split(',')
        .map((v) => `'${escapeSQL(v.trim())}'`)
        .join(',');
      return `${sqlField} IN (${vals})`;
    }
    default:
      return null;
  }
}

// =============================================================================
// SCREENER PRESETS
// =============================================================================

export interface ScreenerPreset {
  id: string;
  name: string;
  description: string;
  tracker: TrackerName;
  filters: {
    field?: string;
    operator?: string;
    value?: string | number;
    status?: string;
    geography?: string;
  };
  subLabel?: string;
}

/**
 * Quick-add presets for the screener
 * These use only fields available in the consolidated parquet
 */
export const SCREENER_PRESETS: ScreenerPreset[] = [
  // Tracker-based presets
  {
    id: 'coal-plant',
    name: 'Coal Plants',
    description: 'All coal-fired power plants.',
    tracker: 'Coal Plant',
    filters: {},
  },
  {
    id: 'steel-plant',
    name: 'Steel Plants',
    description: 'All steel production facilities.',
    tracker: 'Steel Plant',
    filters: {},
  },
  {
    id: 'gas-plant',
    name: 'Gas Plants',
    description: 'Natural gas power plants.',
    tracker: 'Gas Plant',
    filters: {},
  },
  {
    id: 'gas-pipeline',
    name: 'Gas Pipelines',
    description: 'Natural gas transmission pipelines.',
    tracker: 'Gas Pipeline',
    filters: {},
  },
  {
    id: 'coal-mine',
    name: 'Coal Mines',
    description: 'Coal extraction operations.',
    tracker: 'Coal Mine',
    filters: {},
  },
  {
    id: 'iron-mine',
    name: 'Iron Mines',
    description: 'Iron ore extraction operations.',
    tracker: 'Iron Mine',
    filters: {},
  },
  {
    id: 'bioenergy',
    name: 'Bioenergy',
    description: 'Bioenergy power plants.',
    tracker: 'Bioenergy Power',
    filters: {},
  },
  // Status-specific variants
  {
    id: 'operating-coal',
    name: 'Operating Coal',
    description: 'Currently operating coal plants.',
    tracker: 'Coal Plant',
    filters: { status: 'operating' },
  },
  {
    id: 'retired-coal',
    name: 'Retired Coal',
    description: 'Coal plants that have been retired.',
    tracker: 'Coal Plant',
    filters: { status: 'retired' },
  },
  {
    id: 'proposed-coal',
    name: 'Proposed Coal',
    description: 'Coal plants announced or in development.',
    tracker: 'Coal Plant',
    filters: { status: 'announced' },
  },
  {
    id: 'construction-coal',
    name: 'Coal Under Construction',
    description: 'Coal plants currently being built.',
    tracker: 'Coal Plant',
    filters: { status: 'construction' },
  },
  {
    id: 'pipeline-construction',
    name: 'Pipelines',
    description: 'Gas pipelines under construction.',
    tracker: 'Gas Pipeline',
    filters: { status: 'construction' },
    subLabel: 'construction',
  },
];

// =============================================================================
// COUNTRIES (for geography filter)
// =============================================================================

export const COUNTRIES = [
  'Afghanistan',
  'Albania',
  'Algeria',
  'Angola',
  'Argentina',
  'Armenia',
  'Australia',
  'Austria',
  'Azerbaijan',
  'Bahamas',
  'Bahrain',
  'Bangladesh',
  'Barbados',
  'Belarus',
  'Belgium',
  'Bermuda',
  'Bhutan',
  'Bolivia',
  'Bosnia and Herzegovina',
  'Botswana',
  'Brazil',
  'Brunei',
  'Bulgaria',
  'Cambodia',
  'Cameroon',
  'Canada',
  'Cayman Islands',
  'Chile',
  'China',
  'Colombia',
  'Congo',
  'Costa Rica',
  'Croatia',
  'Cuba',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Dominican Republic',
  'Ecuador',
  'Egypt',
  'El Salvador',
  'Estonia',
  'Ethiopia',
  'Finland',
  'France',
  'Gabon',
  'Georgia',
  'Germany',
  'Ghana',
  'Greece',
  'Guatemala',
  'Guinea',
  'Honduras',
  'Hong Kong',
  'Hungary',
  'Iceland',
  'India',
  'Indonesia',
  'Iran',
  'Iraq',
  'Ireland',
  'Israel',
  'Italy',
  'Ivory Coast',
  'Jamaica',
  'Japan',
  'Jordan',
  'Kazakhstan',
  'Kenya',
  'Kuwait',
  'Kyrgyzstan',
  'Laos',
  'Latvia',
  'Lebanon',
  'Liberia',
  'Libya',
  'Lithuania',
  'Luxembourg',
  'Macau',
  'Madagascar',
  'Malawi',
  'Malaysia',
  'Mali',
  'Malta',
  'Mauritius',
  'Mexico',
  'Moldova',
  'Mongolia',
  'Montenegro',
  'Morocco',
  'Mozambique',
  'Myanmar',
  'Namibia',
  'Nepal',
  'Netherlands',
  'New Zealand',
  'Nicaragua',
  'Niger',
  'Nigeria',
  'North Korea',
  'North Macedonia',
  'Norway',
  'Oman',
  'Pakistan',
  'Panama',
  'Papua New Guinea',
  'Paraguay',
  'Peru',
  'Philippines',
  'Poland',
  'Portugal',
  'Puerto Rico',
  'Qatar',
  'Romania',
  'Russia',
  'Saudi Arabia',
  'Senegal',
  'Serbia',
  'Sierra Leone',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'South Africa',
  'South Korea',
  'Spain',
  'Sri Lanka',
  'Sudan',
  'Sweden',
  'Switzerland',
  'Syria',
  'Taiwan',
  'Tajikistan',
  'Tanzania',
  'Thailand',
  'Timor-Leste',
  'Trinidad and Tobago',
  'Tunisia',
  'Turkmenistan',
  'Türkiye',
  'Uganda',
  'Ukraine',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Uruguay',
  'Uzbekistan',
  'Venezuela',
  'Vietnam',
  'Yemen',
  'Zambia',
  'Zimbabwe',
] as const;

export type Country = (typeof COUNTRIES)[number];
