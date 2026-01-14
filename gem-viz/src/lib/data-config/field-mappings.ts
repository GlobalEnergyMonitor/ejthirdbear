/**
 * Field Mapping Utilities
 *
 * Standardized functions to extract common data types from tracker records
 * despite variations in field naming and formatting across trackers.
 *
 * Based on: Ownership Data Processing and Access Plan (Dec 2025)
 * Section: "Deep key lookups"
 */

import {
  getTrackerConfig,
  normalizeStatus,
  constructAssetName,
  extractLocation,
  type OperatingStatus,
} from './tracker-config';

/**
 * Operating Status - normalized and grouped
 */
export interface NormalizedOperatingStatus {
  raw: string | undefined;
  normalized: OperatingStatus;
  /** Human-readable label */
  label: string;
}

/**
 * Location data - standardized across all trackers
 */
export interface LocationData {
  lat: number | null;
  lon: number | null;
  country: string | null;
  state: string | null;
}

/**
 * Capacity/Production data - with units
 */
export interface CapacityData {
  value: number | null;
  unit: string | null;
  /** Raw field name from tracker (for reference) */
  fieldName: string | null;
}

/**
 * Get asset ID using tracker-specific rules
 * @see getAssetId in id-helpers.ts for column-based extraction
 */
export function getAssetIdByTracker(
  trackerName: string,
  record: Record<string, unknown>
): string | null {
  const config = getTrackerConfig(trackerName);
  if (!config) return null;

  return (record[config.idField] as string) || null;
}

/**
 * Get asset name using tracker-specific concatenation rules
 */
export function getAssetName(trackerName: string, record: Record<string, unknown>): string | null {
  return constructAssetName(trackerName, record);
}

/**
 * Get operating status with normalization
 *
 * Returns the raw status from the tracker plus the normalized 4-state status
 * (operating, proposed, retired, cancelled)
 */
export function getOperatingStatus(
  trackerName: string,
  record: Record<string, unknown>
): NormalizedOperatingStatus {
  const config = getTrackerConfig(trackerName);

  const rawStatus = (record[config?.statusField || 'Status'] as string) || undefined;
  const normalized = normalizeStatus(trackerName, rawStatus);

  const labels: Record<OperatingStatus, string> = {
    operating: 'Operating',
    proposed: 'Proposed/Under Construction',
    retired: 'Retired/Mothballed',
    cancelled: 'Cancelled/Shelved',
    unknown: 'Unknown Status',
  };

  return {
    raw: rawStatus,
    normalized,
    label: labels[normalized],
  };
}

/**
 * Get location data with standardized field names
 */
export function getLocation(
  trackerName: string,
  record: Record<string, unknown>
): LocationData | null {
  return extractLocation(trackerName, record);
}

/**
 * Get capacity/production with units
 */
export function getCapacity(trackerName: string, record: Record<string, unknown>): CapacityData {
  const config = getTrackerConfig(trackerName);

  if (!config?.capacityField) {
    return { value: null, unit: null, fieldName: null };
  }

  const rawValue = record[config.capacityField];
  const value = rawValue ? Number(rawValue) : null;

  return {
    value: value && isFinite(value) ? value : null,
    unit: config.capacityUnit || null,
    fieldName: config.capacityField,
  };
}

/**
 * Deep key lookup: Find where to get a specific type of data from a tracker
 *
 * This is the main "where should I look for X in tracker Y" function.
 * It returns the field name(s) to query based on tracker and data type.
 *
 * Usage:
 *   const statusField = deepKeyLookup('Coal Plant', 'operating_status');
 *   // Returns: 'Status'
 *
 *   const nameFields = deepKeyLookup('Coal Plant', 'asset_name');
 *   // Returns: ['Plant name', 'Unit name']
 */
export function deepKeyLookup(
  trackerName: string,
  dataType: 'asset_id' | 'asset_name' | 'operating_status' | 'capacity' | 'location'
): string | string[] | Record<string, string | null> | null {
  const config = getTrackerConfig(trackerName);
  if (!config) return null;

  switch (dataType) {
    case 'asset_id':
      return config.idField;

    case 'asset_name':
      return Array.isArray(config.nameFields) ? config.nameFields : [config.nameFields];

    case 'operating_status':
      return config.statusField;

    case 'capacity':
      return config.capacityField || null;

    case 'location':
      return {
        lat: config.location.latField,
        lon: config.location.lonField,
        country: config.location.countryField,
        state: config.location.stateField,
      };
  }
}

/**
 * Status categorization helper
 *
 * Used for filtering/grouping assets by status category
 */
export function categorizeStatus(status: OperatingStatus): 'operating' | 'developing' | 'offline' {
  switch (status) {
    case 'operating':
      return 'operating';
    case 'proposed':
      return 'developing';
    case 'retired':
    case 'cancelled':
    case 'unknown':
      return 'offline';
  }
}

/**
 * Get all field names from a tracker
 *
 * Useful for building dynamic schemas or validating field existence
 */
export function getTrackerFieldNames(trackerName: string): {
  idField: string;
  nameFields: string[];
  statusField: string;
  capacityField: string | null;
  locationFields: {
    lat: string;
    lon: string;
    country: string;
    state: string;
  };
} | null {
  const config = getTrackerConfig(trackerName);
  if (!config) return null;

  return {
    idField: config.idField,
    nameFields: Array.isArray(config.nameFields) ? config.nameFields : [config.nameFields],
    statusField: config.statusField,
    capacityField: config.capacityField || null,
    locationFields: {
      lat: config.location.latField,
      lon: config.location.lonField,
      country: config.location.countryField,
      state: config.location.stateField,
    },
  };
}

/**
 * Validate that a record has required fields for a tracker
 *
 * Returns an array of missing field names, or empty array if all present
 *
 * NOTE: Location fields are not validated because they're not in the consolidated
 * ownership tracker parquet - location data comes from GeoJSON instead.
 */
export function validateRecordForTracker(
  trackerName: string,
  record: Record<string, unknown>
): string[] {
  const config = getTrackerConfig(trackerName);
  if (!config) return ['Unknown tracker'];

  const missing: string[] = [];

  // Only check fields that exist in the consolidated parquet
  // Location fields are null in config because they come from GeoJSON
  const requiredFields = [config.idField, config.statusField].filter(Boolean);

  for (const field of requiredFields) {
    if (!(field in record) || record[field] === null || record[field] === undefined) {
      missing.push(field);
    }
  }

  return missing;
}

/**
 * Metadata about common fields across trackers
 *
 * Useful for generating documentation or field descriptions in UX
 */
export const fieldDescriptions: Record<string, string> = {
  'GEM unit ID': 'Global Energy Monitor identifier for individual power generation units',
  'GEM Mine ID': 'Global Energy Monitor identifier for mine operations',
  'Steel Plant ID': 'Global Energy Monitor identifier for steel production facility',
  'GEM Plant ID': 'Global Energy Monitor identifier for cement/concrete plant',
  ProjectID: 'Unique identifier for pipeline project',
  'Capacity (MW)': 'Electric generation capacity in megawatts',
  'Capacity (Mtpa)': 'Production capacity in million tonnes per annum',
  'Production 2023 (ttpa)': 'Actual production in 2023 measured in tonnes per annum',
  'Nominal crude steel capacity (ttpa)':
    'Maximum crude steel production capacity in tonnes per annum',
  'Cement Capacity (millions metric tonnes per annum)':
    'Cement production capacity in millions of metric tonnes per year',
  CapacityBcm_y: 'Gas pipeline capacity in billions of cubic meters per year',
  CapacityBOEd: 'Oil pipeline capacity in barrels of oil equivalent per day',
  Status: 'Operating status of the facility (operating, proposed, retired, cancelled, etc.)',
  Latitude: 'Geographic latitude coordinate (decimal degrees)',
  Longitude: 'Geographic longitude coordinate (decimal degrees)',
  'Country/Area': 'Country or territory where facility is located',
  'Subnational unit (province, state)': 'State, province, or other subnational jurisdiction',
  'Ownership Path':
    'Text representation of ownership chain from owner through intermediaries to asset',
  'Interested Party ID': 'Global Energy Monitor identifier for owning entity',
  'Subject Entity ID': 'Global Energy Monitor identifier for owned entity or asset',
  'Share of Ownership': 'Percentage ownership share (0-100)',
};

/**
 * Get description for a field
 */
export function getFieldDescription(fieldName: string): string | undefined {
  return fieldDescriptions[fieldName];
}
