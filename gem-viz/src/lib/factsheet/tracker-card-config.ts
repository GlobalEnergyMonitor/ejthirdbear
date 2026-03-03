/**
 * Per-tracker tab and field configurations for ProjectCard.
 *
 * Each tracker defines an ordered list of tabs, and each tab lists the fields
 * to display in a 4-column grid. Fields reference either a typed `Asset` key
 * or a `raw.*` key for pass-through API fields.
 */

import type { Asset } from './types';

/** A single field cell in the tab grid */
export interface CardField {
  /** Display label */
  label: string;
  /** Asset property key OR raw.* key (e.g. "raw.Combustion technology") */
  key: string;
  /** Optional formatter name — applied client-side */
  format?: 'capacity' | 'pct' | 'co2' | 'heatRate' | 'years' | 'coords';
}

/** One tab in the card layout */
export interface CardTab {
  name: string;
  fields: CardField[];
}

/** Full card config for a tracker */
export interface TrackerCardConfig {
  tabs: CardTab[];
}

// ---------------------------------------------------------------------------
// Field helpers — resolve a CardField key to a display value from an Asset
// ---------------------------------------------------------------------------

/** Resolve a field key to its raw value from an Asset */
export function resolveFieldValue(asset: Asset, key: string): unknown {
  if (key.startsWith('raw.')) {
    const rawKey = key.slice(4);
    return asset.raw?.[rawKey] ?? undefined;
  }
  const lookup = asset as unknown as Record<string, unknown>;
  return lookup[key] ?? undefined;
}

// ---------------------------------------------------------------------------
// Per-tracker configs
// ---------------------------------------------------------------------------

const COAL_PLANT: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Other names', key: 'raw.Other names' },
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Coal type', key: 'coalType' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Capacity factor', key: 'capacityFactor', format: 'pct' },
        { label: 'Combustion technology', key: 'technology' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
        { label: 'Lifetime CO2', key: 'lifetimeCO2', format: 'co2' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
        { label: 'Annual CO2', key: 'annualCO2', format: 'co2' },
        { label: 'Heat rate', key: 'heatRate', format: 'heatRate' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Planned retirement', key: 'plannedRetirement' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
        { label: 'Raw.Planned start year', key: 'raw.Planned start year' },
        { label: 'Announced retirement', key: 'raw.Announced retirement' },
      ],
    },
    {
      name: 'Operations',
      fields: [
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Capacity factor', key: 'capacityFactor', format: 'pct' },
        { label: 'Heat rate', key: 'heatRate', format: 'heatRate' },
        { label: 'Combustion technology', key: 'technology' },
        { label: 'Coal type', key: 'coalType' },
        { label: 'Annual CO2', key: 'annualCO2', format: 'co2' },
        { label: 'Lifetime CO2', key: 'lifetimeCO2', format: 'co2' },
        { label: 'Annual generation (GWh)', key: 'raw.Annual generation (GWh)' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

const COAL_MINE: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Other names', key: 'raw.Other names' },
        { label: 'Status', key: 'status' },
        { label: 'Production', key: 'production', format: 'capacity' },
        { label: 'Mine type', key: 'mineType' },
        { label: 'Location', key: 'location' },
        { label: 'Opening year', key: 'startYear' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Mine size', key: 'raw.Mine size' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Mine age', key: 'plantAge', format: 'years' },
        { label: 'Coal type', key: 'coalType' },
        { label: 'Mine depth', key: 'raw.Mine depth' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
        { label: 'Mining method', key: 'miningMethod' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Opening year', key: 'startYear' },
        { label: 'Planned closure', key: 'plannedRetirement' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
        { label: 'Mine age', key: 'plantAge', format: 'years' },
      ],
    },
    {
      name: 'Operations',
      fields: [
        { label: 'Production', key: 'production', format: 'capacity' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Mine type', key: 'mineType' },
        { label: 'Mining method', key: 'miningMethod' },
        { label: 'Mine depth', key: 'raw.Mine depth' },
        { label: 'Mine size', key: 'raw.Mine size' },
        { label: 'Coal type', key: 'coalType' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
    {
      name: 'Methane',
      fields: [
        { label: 'Methane emissions (Mt CO2e)', key: 'raw.Methane emissions (Mt CO2e)' },
        { label: 'Methane intensity', key: 'raw.Methane intensity' },
        { label: 'Methane category', key: 'raw.Methane category' },
      ],
    },
  ],
};

const GAS_PLANT: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Other names', key: 'raw.Other names' },
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Fuel type', key: 'raw.Fuel type' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Technology', key: 'technology' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
        { label: 'Annual CO2', key: 'annualCO2', format: 'co2' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Planned retirement', key: 'plannedRetirement' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

const IRON_MINE: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Design capacity', key: 'capacity', format: 'capacity' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Mine type', key: 'mineType' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Planned closure', key: 'plannedRetirement' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

const STEEL_PLANT: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Technology', key: 'technology' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

const GAS_PIPELINE: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Length (km)', key: 'raw.Length (km)' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

const BIOENERGY: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Feedstock', key: 'raw.Feedstock' },
        { label: 'Technology', key: 'technology' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

/** Default fallback config for unknown trackers */
const DEFAULT_CONFIG: TrackerCardConfig = {
  tabs: [
    {
      name: 'Overview',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Capacity', key: 'capacity', format: 'capacity' },
        { label: 'Location', key: 'location' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Primary owner', key: 'owner' },
        { label: 'Technology', key: 'technology' },
        { label: 'Coordinates', key: 'lat', format: 'coords' },
      ],
    },
    {
      name: 'Status',
      fields: [
        { label: 'Status', key: 'status' },
        { label: 'Start year', key: 'startYear' },
        { label: 'Planned retirement', key: 'plannedRetirement' },
        { label: 'Plant age', key: 'plantAge', format: 'years' },
        { label: 'Remaining lifetime', key: 'remainingLifetime', format: 'years' },
      ],
    },
    {
      name: 'Ownership',
      fields: [
        { label: 'Primary owner', key: 'owner' },
        { label: 'Parent', key: 'parent' },
        { label: 'Ownership share', key: 'ownershipShare', format: 'pct' },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Lookup — maps tracker name (from API `facilityType`) to its config
// ---------------------------------------------------------------------------

const CONFIG_MAP: Record<string, TrackerCardConfig> = {
  'Coal Plant': COAL_PLANT,
  'Coal Mine': COAL_MINE,
  'Oil & Gas Plant': GAS_PLANT,
  'Gas Plant': GAS_PLANT,
  'Iron Ore Mine': IRON_MINE,
  'Iron Mine': IRON_MINE,
  'Iron & Steel Plant': STEEL_PLANT,
  'Steel Plant': STEEL_PLANT,
  'Natural Gas Transmission Pipeline': GAS_PIPELINE,
  'Gas Pipeline': GAS_PIPELINE,
  'Bioenergy Plant': BIOENERGY,
  'Bioenergy Power': BIOENERGY,
};

/** Get card config for a tracker. Falls back to DEFAULT_CONFIG. */
export function getTrackerCardConfig(tracker: string | undefined): TrackerCardConfig {
  if (!tracker) return DEFAULT_CONFIG;
  return CONFIG_MAP[tracker] ?? DEFAULT_CONFIG;
}

/** Collect all field keys used by a config (for "extra fields" detection) */
export function getConfiguredKeys(config: TrackerCardConfig): Set<string> {
  const keys = new Set<string>();
  for (const tab of config.tabs) {
    for (const field of tab.fields) {
      keys.add(field.key);
    }
  }
  return keys;
}
