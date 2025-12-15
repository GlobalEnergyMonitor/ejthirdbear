/**
 * GEM Tracker Configuration
 *
 * Single source of truth for tracker metadata and field mappings.
 * Based on: Ownership Data Processing and Access Plan (Dec 2025)
 *
 * IMPORTANT: This config describes the CONSOLIDATED OWNERSHIP TRACKER schema
 * (the parquet files currently in use), NOT the detailed underlying trackers.
 *
 * The Ownership Tracker is an aggregated table with:
 * - Asset identification (GEM unit ID, Project/asset name)
 * - Ownership chain (Owner, Parent, Share, etc.)
 * - Basic metrics (Status, Capacity where available)
 * - Simplified status field (not tracker-specific variations)
 *
 * Detailed fields from underlying trackers (lat/lon, plant name, unit name, etc.)
 * are NOT available in this parquet. Those would come from:
 * - Location data: stored separately in GeoJSON (static/points.geojson)
 * - Detailed tracker data: available from GEM GitHub repos (see data-sources.ts)
 *
 * The config maps tracker types to the fields available for them.
 */

/**
 * Operating status categories (normalized across all trackers)
 */
export type OperatingStatus = 'operating' | 'proposed' | 'retired' | 'cancelled' | 'unknown';

/**
 * Base tracker metadata - fields common to most trackers
 */
export interface TrackerFieldMapping {
  /** Tracker name as it appears in Ownership Tracker */
  name: string;

  /** Asset type category */
  assetType: 'mine' | 'plant' | 'pipeline';

  /** GEM data source (which tracker spreadsheet) */
  sourceTab: string;

  /** Field containing the primary asset ID (used for URLs and lookups) */
  idField: string;

  /** Field(s) containing asset name - can be single field or array for concatenation */
  nameFields: string | string[];

  /** Separator when concatenating name fields (e.g., " - " or " ") */
  nameSeparator?: string;

  /** Field containing capacity/production metric */
  capacityField?: string;

  /** Unit of capacity (MW, Mtpa, ttpa, etc.) */
  capacityUnit?: string;

  /** Field containing operating status */
  statusField: string;

  /** Mapping from raw status values to normalized operating status */
  statusMap: Record<string, OperatingStatus>;

  /** Location fields */
  location: {
    latField: string;
    lonField: string;
    countryField: string;
    stateField: string;
    /** Optional geojson field for complex geometries (e.g., pipelines) */
    geoJsonField?: string;
  };

  /** Any special transformations needed for this tracker */
  transformations?: {
    /** Fields where '*' should be replaced with null */
    nullOutAsterisk?: string[];
    /** Fields where values should be parsed as numbers */
    parseAsNumber?: string[];
  };

  /** Reference to deeper documentation (Observable notebook sections, etc.) */
  docsRef?: string;
}

/**
 * Complete tracker configuration mapping all asset types
 *
 * VALIDATED AGAINST ACTUAL DATA (December 2025)
 * This config matches the consolidated Ownership Tracker parquet schema.
 * Fields not listed here are not available in the current parquet (e.g., lat/lon).
 */
export const trackerConfigs = new Map<string, TrackerFieldMapping>([
  // All trackers currently consolidated into single Ownership Tracker parquet
  // They share the same schema with these fields
  //
  // NOTE: Use the short names ('Coal Plant', not 'Global Coal Plant Tracker')
  // as they match the Tracker field values in the parquet data.

  [
    'Coal Plant',
    {
      name: 'Coal Plant',
      assetType: 'plant',
      sourceTab: 'Ownership Tracker (Coal Plant rows)',
      idField: 'GEM unit ID',
      nameFields: 'Project',
      capacityField: 'Capacity (MW)',
      capacityUnit: 'MW',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
      docsRef:
        'For detailed tracker fields, see GEM Coal Plant Tracker on GitHub: github.com/GlobalEnergyMonitor/coal_plant_tracker',
    },
  ],

  [
    'Gas Plant',
    {
      name: 'Gas Plant',
      assetType: 'plant',
      sourceTab: 'Ownership Tracker (Gas Plant rows)',
      idField: 'GEM unit ID',
      nameFields: 'Project',
      capacityField: 'Capacity (MW)',
      capacityUnit: 'MW',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],

  [
    'Coal Mine',
    {
      name: 'Coal Mine',
      assetType: 'mine',
      sourceTab: 'Ownership Tracker (Coal Mine rows)',
      idField: 'GEM Mine ID',
      nameFields: 'Project',
      capacityField: 'Capacity (Mtpa)',
      capacityUnit: 'Mtpa',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],

  [
    'Iron Mine',
    {
      name: 'Iron Mine',
      assetType: 'mine',
      sourceTab: 'Ownership Tracker (Iron Mine rows)',
      idField: 'GEM Asset ID',
      nameFields: 'Project',
      capacityField: 'Design capacity (ttpa)',
      capacityUnit: 'ttpa',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],

  [
    'Gas Pipeline',
    {
      name: 'Gas Pipeline',
      assetType: 'pipeline',
      sourceTab: 'Ownership Tracker (Gas Pipeline rows)',
      idField: 'ProjectID',
      nameFields: 'Project',
      capacityField: 'CapacityBcm/y',
      capacityUnit: 'Bcm/y',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],

  // NOTE: Oil & NGL Pipeline not yet in parquet - add when available
  // NOTE: Cement and Concrete not yet in parquet - add when available

  [
    'Steel Plant',
    {
      name: 'Steel Plant',
      assetType: 'plant',
      sourceTab: 'Ownership Tracker (Steel Plant rows)',
      idField: 'Steel Plant ID',
      nameFields: 'Project',
      capacityField: 'Nominal crude steel capacity (ttpa)',
      capacityUnit: 'ttpa',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],

  [
    'Bioenergy Power',
    {
      name: 'Bioenergy Power',
      assetType: 'plant',
      sourceTab: 'Ownership Tracker (Bioenergy rows)',
      idField: 'GEM unit ID',
      nameFields: 'Project',
      capacityField: 'Capacity (MW)',
      capacityUnit: 'MW',
      statusField: 'Status',
      statusMap: {
        operating: 'operating',
        announced: 'proposed',
        construction: 'proposed',
        permitted: 'proposed',
        'pre-permit': 'proposed',
        cancelled: 'cancelled',
        retired: 'retired',
        shelved: 'retired',
        mothballed: 'retired',
      },
      location: {
        latField: null,
        lonField: null,
        countryField: null,
        stateField: null,
      },
    },
  ],
]);

/**
 * Get tracker configuration by name
 * Returns null if tracker not found
 */
export function getTrackerConfig(trackerName: string): TrackerFieldMapping | null {
  return trackerConfigs.get(trackerName) || null;
}

/**
 * Get all tracker names in canonical order
 */
export function getAllTrackerNames(): string[] {
  return Array.from(trackerConfigs.keys());
}

/**
 * Get trackers by asset type
 */
export function getTrackersByType(assetType: 'mine' | 'plant' | 'pipeline'): TrackerFieldMapping[] {
  return Array.from(trackerConfigs.values()).filter((tc) => tc.assetType === assetType);
}

/**
 * Get all capacity field names and their units
 * Useful for building capacity-related features
 */
export function getCapacityFields(): Array<{
  tracker: string;
  field: string;
  unit: string;
}> {
  const fields: Array<{ tracker: string; field: string; unit: string }> = [];

  trackerConfigs.forEach((config) => {
    if (config.capacityField && config.capacityUnit) {
      fields.push({
        tracker: config.name,
        field: config.capacityField,
        unit: config.capacityUnit,
      });
    }
  });

  return fields;
}

/**
 * Normalize an operating status value for a specific tracker
 * Returns 'unknown' if status not found in tracker's status map
 */
export function normalizeStatus(
  trackerName: string,
  rawStatus: string | undefined
): OperatingStatus {
  if (!rawStatus) return 'unknown';

  const config = getTrackerConfig(trackerName);
  if (!config) return 'unknown';

  const normalized = config.statusMap[rawStatus.toLowerCase()];
  return normalized || 'unknown';
}

/**
 * Construct an asset name from fields according to tracker rules
 * Handles both single-field and multi-field (concatenated) names
 */
export function constructAssetName(
  trackerName: string,
  record: Record<string, unknown>
): string | null {
  const config = getTrackerConfig(trackerName);
  if (!config) return null;

  const { nameFields, nameSeparator = ' ' } = config;

  if (typeof nameFields === 'string') {
    // Single field
    return (record[nameFields] as string) || null;
  } else {
    // Multiple fields - concatenate
    const parts = nameFields
      .map((field) => record[field])
      .filter((val) => val && String(val).trim() !== '')
      .map(String);

    return parts.length > 0 ? parts.join(nameSeparator) : null;
  }
}

/**
 * Get the location data from a record according to tracker rules
 *
 * NOTE: Location fields are not available in the consolidated Ownership Tracker parquet.
 * Location data (coordinates) should be retrieved from GeoJSON file instead.
 * This function returns null for location in current setup.
 */
export function extractLocation(
  trackerName: string,
  record: Record<string, unknown>
): {
  lat: number | null;
  lon: number | null;
  country: string | null;
  state: string | null;
} | null {
  const config = getTrackerConfig(trackerName);
  if (!config) return null;

  const { location } = config;

  // Location fields are not available in consolidated parquet
  if (!location.latField || !location.lonField) {
    return { lat: null, lon: null, country: null, state: null };
  }

  const lat = (() => {
    const val = record[location.latField!];
    return val ? Number(val) : null;
  })();

  const lon = (() => {
    const val = record[location.lonField!];
    return val ? Number(val) : null;
  })();

  const country = (record[location.countryField!] as string) || null;
  const state = (record[location.stateField!] as string) || null;

  return {
    lat: lat && isFinite(lat) ? lat : null,
    lon: lon && isFinite(lon) ? lon : null,
    country,
    state,
  };
}
