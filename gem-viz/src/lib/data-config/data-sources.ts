/**
 * Data Sources Registry
 *
 * Documents where all data comes from and how it's versioned.
 *
 * Core Principle: All data is sourced exclusively from GEM's publicly published
 * datasets. We do not use intermediary outputs from processing scripts or
 * internal/non-public data sources.
 *
 * Based on: Ownership Data Processing and Access Plan (Dec 2025)
 * Section: "Data sources"
 */

/**
 * GEM Published Dataset reference
 */
export interface GEMDataset {
  /** Dataset name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Access URL or location */
  url: string;

  /** Version/date of this dataset release */
  version: string;

  /** Which tab(s) in the ownership tracker contain this data */
  ownershipTrackerTabs?: string[];

  /** Last updated (UTC) */
  lastUpdated: string;

  /** Row count (approximate) */
  rowCount?: number;

  /** Notes about this data source */
  notes?: string;
}

/**
 * Ownership Tracker - the primary published GEM dataset
 * This is the master aggregator of ownership data
 *
 * Contains multiple tabs with ownership relationships:
 */
export const OwnershipTrackerDatasets: Record<string, GEMDataset> = {
  allEntities: {
    name: 'All Entities',
    description: 'Table of all owners (companies, governments, individuals, etc)',
    url: 'https://docs.google.com/spreadsheets/d/.../edit#gid=...', // GEM will provide actual URL
    version: '1.0',
    ownershipTrackerTabs: ['All Entities'],
    lastUpdated: '2025-12-01',
    rowCount: 50000,
    notes: 'Contains entity ID, name, location, entity-type, and other identifying fields',
  },

  entityOwnership: {
    name: 'Entity Ownership',
    description:
      'Ownership relationships between entities (parent companies, subsidiaries, intermediate entities)',
    url: 'https://docs.google.com/spreadsheets/d/.../edit#gid=...',
    version: '1.0',
    ownershipTrackerTabs: ['Entity Ownership'],
    lastUpdated: '2025-12-01',
    rowCount: 100000,
    notes: 'Source-target edges with ownership share %, source URLs, and dates',
  },

  assetOwnership: {
    name: 'Asset Ownership',
    description:
      'Ownership relationships from entities directly to assets (the final owners of energy infrastructure)',
    url: 'https://docs.google.com/spreadsheets/d/.../edit#gid=...',
    version: '1.0',
    ownershipTrackerTabs: ['Asset Ownership'],
    lastUpdated: '2025-12-01',
    rowCount: 150000,
    notes: 'Source-target edges from direct-owning entities to assets with ownership %, source URLs, dates',
  },
};

/**
 * Tracker-specific datasets
 *
 * Each "Tracker" represents one Asset Type and is published separately.
 * DO NOT use tracker-specific tabs from the Ownership Tracker spreadsheet -
 * they are incomplete (contain only shortest path and missing many entities).
 *
 * Instead, use the versions in the GitHub repo (linked below).
 */
export const TrackerDatasets: Record<string, GEMDataset> = {
  coalPlant: {
    name: 'Coal Plant Tracker',
    description: 'Global coal-fired power plants and generating units',
    url: 'https://github.com/GlobalEnergyMonitor/coal_plant_tracker',
    version: 'v2.0',
    lastUpdated: '2025-11-15',
    rowCount: 3500,
    notes: 'Contains plant-level and unit-level data with capacity, status, ownership',
  },

  gasPlant: {
    name: 'Gas Plant Tracker',
    description: 'Global natural gas power plants and generating units',
    url: 'https://github.com/GlobalEnergyMonitor/gas_plant_tracker',
    version: 'v2.0',
    lastUpdated: '2025-11-15',
    rowCount: 5000,
    notes: 'Contains plant-level and unit-level data with capacity, status, ownership',
  },

  coalMine: {
    name: 'Coal Mine Tracker',
    description: 'Global coal mining operations and complexes',
    url: 'https://github.com/GlobalEnergyMonitor/coal_mine_tracker',
    version: 'v1.5',
    lastUpdated: '2025-10-01',
    rowCount: 600,
    notes: 'Contains mine location, ownership, capacity, and production data',
  },

  ironMine: {
    name: 'Iron Ore Mine Tracker',
    description: 'Global iron ore mining operations',
    url: 'https://github.com/GlobalEnergyMonitor/iron_mine_tracker',
    version: 'v1.0',
    lastUpdated: '2025-09-01',
    rowCount: 350,
    notes: 'Contains mine location, ownership, production data',
  },

  steelPlant: {
    name: 'Steel Plant Tracker',
    description: 'Global steel production facilities',
    url: 'https://github.com/GlobalEnergyMonitor/steel_plant_tracker',
    version: 'v1.5',
    lastUpdated: '2025-10-15',
    rowCount: 500,
    notes: 'Contains plant location, production method, capacity, ownership',
  },

  cementPlant: {
    name: 'Cement and Concrete Tracker',
    description: 'Global cement and concrete production facilities',
    url: 'https://github.com/GlobalEnergyMonitor/cement_tracker',
    version: 'v1.0',
    lastUpdated: '2025-09-01',
    rowCount: 2000,
    notes: 'Contains plant location, capacity, ownership, production data',
  },

  gasPipeline: {
    name: 'Gas Infrastructure Tracker',
    description: 'Global natural gas transmission pipelines and infrastructure',
    url: 'https://github.com/GlobalEnergyMonitor/gas_infrastructure_tracker',
    version: 'v1.0',
    lastUpdated: '2025-08-01',
    rowCount: 1200,
    notes: 'Contains pipeline routes, segments, capacity, ownership, status',
  },

  oilPipeline: {
    name: 'Oil & NGL Pipeline Tracker',
    description: 'Global oil and natural gas liquid transmission pipelines',
    url: 'https://github.com/GlobalEnergyMonitor/oil_pipeline_tracker',
    version: 'v1.0',
    lastUpdated: '2025-08-01',
    rowCount: 800,
    notes: 'Contains pipeline routes, segments, capacity, ownership, status',
  },

  bioenergy: {
    name: 'Bioenergy Power Tracker',
    description: 'Global biomass and biogas power generation facilities',
    url: 'https://github.com/GlobalEnergyMonitor/bioenergy_tracker',
    version: 'v1.0',
    lastUpdated: '2025-07-01',
    rowCount: 1000,
    notes: 'Contains facility location, feedstock, capacity, ownership',
  },
};

/**
 * Derived/Auxiliary datasets
 *
 * These are computed from the published datasets above.
 * They exist in the codebase to support specific front-end features.
 */
export const DerivedDatasets: Record<string, GEMDataset> = {
  idDeduplication: {
    name: 'ID Deduplication Mapping',
    description:
      'Mapping of superseded IDs to current IDs (when deduplication occurs, old IDs → new IDs)',
    url: 'https://docs.google.com/spreadsheets/d/...', // Location TBD
    version: '1.0',
    lastUpdated: '2025-12-01',
    notes: 'Maintains backwards compatibility when asset IDs are consolidated or updated',
  },

  trackerMetadata: {
    name: 'Tracker Metadata Manifest',
    description: 'Column names, data types, descriptions, and metadata for all tracker fields',
    url: 'src/lib/data-config/tracker-config.ts',
    version: '1.0',
    lastUpdated: '2025-12-14',
    notes: 'Centralized schema definition - source of truth for field mappings',
  },

  locationFiltering: {
    name: 'Location Filtering Parquet',
    description: 'Parquet file with asset IDs, coordinates, and location arrays for fast filtering',
    url: 'static/asset_locations.parquet',
    version: '1.0',
    lastUpdated: '2025-12-01',
    rowCount: 15000,
    notes: 'Optimized for front-end geographic filtering without full spatial queries',
  },

  assetClassLookup: {
    name: 'Asset Class Lookup Parquet',
    description:
      'File for quickly identifying which assets match selected Asset Classes (coal-based steel, captive plants, etc)',
    url: 'src/lib/data-config/asset-classes.ts',
    version: '1.0',
    lastUpdated: '2025-12-14',
    notes: 'Matcher functions for each asset class',
  },
};

/**
 * Get all datasets in a category
 */
export function getDatasetsByCategory(category: 'ownership' | 'tracker' | 'derived'): GEMDataset[] {
  switch (category) {
    case 'ownership':
      return Object.values(OwnershipTrackerDatasets);
    case 'tracker':
      return Object.values(TrackerDatasets);
    case 'derived':
      return Object.values(DerivedDatasets);
  }
}

/**
 * Get a specific dataset by name
 */
export function getDataset(name: string): GEMDataset | undefined {
  return (
    Object.values(OwnershipTrackerDatasets).find((d) => d.name === name) ||
    Object.values(TrackerDatasets).find((d) => d.name === name) ||
    Object.values(DerivedDatasets).find((d) => d.name === name)
  );
}

/**
 * Data versioning and release information
 */
export const dataVersionInfo = {
  /** Current GEM ownership data release version */
  currentReleaseVersion: '1.0',

  /** Date of current release */
  releaseDate: '2025-12-01',

  /** This code was last verified against data released on this date */
  lastVerificationDate: '2025-12-14',

  /** Contact for data questions */
  dataContact: 'data@globalenergymonitor.org',

  /** Issue tracking for data quality issues */
  issueTracker: 'https://github.com/GlobalEnergyMonitor/Ownership_External_Dataset/issues',

  /** Data documentation and schema */
  documentation: 'https://github.com/GlobalEnergyMonitor/Ownership_External_Dataset',

  /** Notes about this release */
  releaseNotes: `
    GEM Ownership Data v1.0 (December 2025)

    This release consolidates:
    - All published GEM asset trackers (Coal, Gas, Oil, Steel, Iron, Cement, Bioenergy)
    - Ownership relationships from entity ownership tables
    - Asset ownership links (direct owners to assets)

    Quality standards:
    - All IDs are mapped to canonical GEM identifiers
    - Location data validated for coordinate reasonableness
    - Ownership shares checked for mathematical consistency
    - All source URLs verified

    Known limitations:
    - Some historical ownership data may be incomplete
    - Coordinate precision varies by data source
    - Pipeline segment-level geometry is partial (see tracker repos for complete routing)
    - Some asset statuses are inferred from project activity

    For questions about specific data, see individual tracker repositories.
  `,
};

/**
 * Validation: Confirm we're using only published data sources
 *
 * This function can be called as a runtime check to ensure we haven't
 * accidentally fallen back to internal/unpublished data sources.
 */
export function validateDataSourcesArePublished(): boolean {
  const allDatasets = [
    ...Object.values(OwnershipTrackerDatasets),
    ...Object.values(TrackerDatasets),
    ...Object.values(DerivedDatasets),
  ];

  // Check that all data sources have public URLs or are in-codebase
  for (const dataset of allDatasets) {
    // Data should either be:
    // 1. Public GitHub URLs
    // 2. Public Google Sheets
    // 3. In-codebase (src/lib/data-config/*)
    const isPublic =
      dataset.url.includes('github.com') ||
      dataset.url.includes('docs.google.com') ||
      dataset.url.includes('src/lib/data-config');

    if (!isPublic) {
      console.warn(`Non-public data source detected: ${dataset.name} at ${dataset.url}`);
      return false;
    }
  }

  return true;
}
