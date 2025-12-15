/**
 * GEM Asset Classes Rulebook
 *
 * Asset Class: A set of units/assets from one or more trackers that have shared
 * characteristics of interest to investigators/users.
 *
 * Examples:
 * - Captive coal plants (coal plant not for grid, but for other use)
 * - Coal-based steel plants (Iron & Steel with blast furnaces)
 * - Deep water infrastructure
 * - Etc.
 *
 * Each asset class defines:
 * 1. Which trackers may contain matching assets
 * 2. A function to identify/match assets in those trackers
 * 3. Additional fields/transformations relevant to that class
 *
 * ⚠️  IMPORTANT: DATA SOURCE REQUIREMENTS
 *
 * The matchers in this file reference DETAILED tracker fields (e.g., 'Main production
 * equipment', 'Captive', 'Water Depth (m)') that are NOT available in the consolidated
 * ownership tracker parquet currently used by gem-viz.
 *
 * The consolidated parquet only has: GEM unit ID, Project, Status, Capacity (MW), Owner, etc.
 *
 * To use these matchers, you need to:
 * 1. Load data from the detailed tracker CSVs on GitHub (see data-sources.ts), OR
 * 2. Join the consolidated parquet with detailed tracker data
 *
 * Until detailed tracker data is integrated, these matchers will return false for all
 * records from the consolidated parquet.
 *
 * Based on: Ownership Data Processing and Access Plan (Dec 2025)
 */

import { getTrackerConfig } from './tracker-config';

/**
 * Additional data fields relevant to an asset class
 * Tells data processing which fields to pull when querying this class
 */
export interface AssetClassRelevantFields {
  /** Main fields that define/identify assets in this class */
  identifyingFields: string[];

  /** Additional fields that provide context about assets in this class */
  contextFields: string[];

  /** Fields that show what status change is planned/upcoming */
  transitionFields?: string[];
}

/**
 * Asset class definition and matching logic
 */
export interface AssetClassDefinition {
  /** Canonical asset class name */
  name: string;

  /** Human-readable description */
  description: string;

  /** Tracker(s) that may contain assets of this class */
  applicableTrackers: string[];

  /**
   * Function to test if an asset row belongs to this class
   * Returns true if asset matches this class definition
   */
  matcher: (record: Record<string, unknown>) => boolean;

  /**
   * Fields that are relevant to this asset class
   * Used by data processing to know which fields to extract/expose
   */
  relevantFields: AssetClassRelevantFields;

  /**
   * Reference to documentation about this class
   * (Observable notebook sections, GitHub issues, etc.)
   */
  docsRef?: string;
}

/**
 * Coal-Based Steel Plants
 *
 * Definition: Steel plants that use coal/coke as their primary energy or
 * material input. Identified by:
 * 1. Being in Steel Plant tracker
 * 2. Having "BF" (Blast Furnace) in "Main production equipment" field
 * 3. Supporting coal-based production methods
 *
 * Required field: 'Main production equipment' (from detailed Steel Plant tracker)
 */
export const CoalBasedSteelClass: AssetClassDefinition = {
  name: 'Coal-Based Steel Plants',
  description:
    'Steel plants using coal/coke-based production, identified by blast furnaces (BF) as main production equipment',
  applicableTrackers: ['Steel Plant'],
  matcher: (record: Record<string, unknown>) => {
    const equipment = String(record['Main production equipment'] || '').toUpperCase();
    return equipment.includes('BF'); // BF = Blast Furnace
  },
  relevantFields: {
    identifyingFields: ['Main production equipment', 'Plant name (English)'],
    contextFields: [
      'Steel Plant ID',
      'Latitude',
      'Longitude',
      'Country/Area',
      'Subnational unit (province, state)',
      'Status',
      'Nominal crude steel capacity (ttpa)',
    ],
    transitionFields: ['Planned relining date', 'Decommissioning date'],
  },
  docsRef: 'Plan Section: Asset Classes - Coal-Based Steel',
};

/**
 * Captive Coal Plants
 *
 * Definition: Coal-fired power plants not generating for the electric grid,
 * but for captive use (e.g., mining operations, industrial facilities).
 *
 * Identified by:
 * 1. Being in Coal Plant tracker
 * 2. Having a value in "Captive" field (what the plant is captive for)
 *
 * Required field: 'Captive' (from detailed Coal Plant tracker)
 */
export const CaptiveCoalPlantClass: AssetClassDefinition = {
  name: 'Captive Coal Plants',
  description:
    'Coal-fired power plants serving captive (non-grid) use such as mining operations or industrial facilities',
  applicableTrackers: ['Coal Plant'],
  matcher: (record: Record<string, unknown>) => {
    const captiveField = String(record['Captive'] || '').trim();
    return captiveField.length > 0 && captiveField.toLowerCase() !== 'nan';
  },
  relevantFields: {
    identifyingFields: ['Captive', 'Captive industrial', 'Captive residential'],
    contextFields: [
      'GEM unit ID',
      'Plant name',
      'Unit name',
      'Latitude',
      'Longitude',
      'Country/Area',
      'Subnational unit (province, state)',
      'Status',
      'Capacity (MW)',
    ],
  },
  docsRef: 'Plan Section: Asset Classes - Captive Coal Plant',
};

/**
 * Deep Water Infrastructure
 *
 * Definition: Oil & gas infrastructure (pipelines, platforms) in deep water
 * (typically >200m depth).
 *
 * Identification depends on tracker:
 * - Oil/Gas Pipelines: "Water Depth (m)" field > 200
 * - Oil/Gas Platforms: Similar depth field
 *
 * Required field: 'Water Depth (m)' or 'Max Water Depth (m)' (from detailed pipeline trackers)
 */
export const DeepWaterInfraClass: AssetClassDefinition = {
  name: 'Deep Water Infrastructure',
  description: 'Oil and gas infrastructure in deep water (>200m depth)',
  applicableTrackers: ['Oil & NGL Pipeline', 'Gas Pipeline'],
  matcher: (record: Record<string, unknown>) => {
    const depthField = record['Water Depth (m)'] || record['Max Water Depth (m)'];
    if (!depthField) return false;
    const depth = Number(depthField);
    return isFinite(depth) && depth > 200;
  },
  relevantFields: {
    identifyingFields: ['Water Depth (m)', 'Max Water Depth (m)', 'Pipeline Route'],
    contextFields: [
      'ProjectID',
      'PipelineName',
      'Latitude',
      'Longitude',
      'Countries',
      'States/Provinces',
      'Status',
      'CapacityBOEd',
      'CapacityBcm/y',
    ],
  },
  docsRef: 'Plan Section: Asset Classes - Deep Water Infrastructure',
};

/**
 * All defined asset classes
 *
 * This is the canonical registry of asset classes.
 * Add new asset classes here to make them available to filtering and analysis tools.
 */
export const allAssetClasses: AssetClassDefinition[] = [
  CoalBasedSteelClass,
  CaptiveCoalPlantClass,
  DeepWaterInfraClass,
  // Future asset classes:
  // - LNG Facilities
  // - Renewable Energy Clusters
  // - Aging Coal Infrastructure (>30 years)
  // - Stranded Assets at Risk
  // Etc.
];

/**
 * Get an asset class by name
 */
export function getAssetClass(name: string): AssetClassDefinition | undefined {
  return allAssetClasses.find((ac) => ac.name === name);
}

/**
 * Get all asset classes applicable to a specific tracker
 */
export function getAssetClassesForTracker(trackerName: string): AssetClassDefinition[] {
  return allAssetClasses.filter((ac) => ac.applicableTrackers.includes(trackerName));
}

/**
 * Test if an asset record belongs to one or more asset classes
 *
 * Usage:
 *   const classes = getAssetClassesForRecord(myCoalPlantRecord);
 *   // classes might be: ['Captive Coal Plants']
 */
export function getAssetClassesForRecord(
  trackerName: string,
  record: Record<string, unknown>
): string[] {
  const applicableClasses = getAssetClassesForTracker(trackerName);
  return applicableClasses.filter((ac) => ac.matcher(record)).map((ac) => ac.name);
}

/**
 * Extract relevant fields for an asset class
 *
 * Usage:
 *   const fields = getRelevantFieldsForClass('Coal-Based Steel Plants');
 *   // fields.identifyingFields: ['Main production equipment', 'Plant name (English)']
 */
export function getRelevantFieldsForClass(
  className: string
): AssetClassRelevantFields | undefined {
  const assetClass = getAssetClass(className);
  return assetClass?.relevantFields;
}

/**
 * Build an extended query to include all relevant fields for an asset class
 *
 * This is useful when building data export features that want to include
 * asset-class-specific fields alongside base asset data.
 *
 * Usage:
 *   const fields = buildFieldsForAssetClass('Coal-Based Steel Plants');
 *   // fields: ['Main production equipment', 'Plant name (English)', 'Steel Plant ID', ...]
 */
export function buildFieldsForAssetClass(className: string): string[] {
  const assetClass = getAssetClass(className);
  if (!assetClass) return [];

  const fields = new Set<string>();

  // Add identifying fields
  assetClass.relevantFields.identifyingFields.forEach((f) => fields.add(f));

  // Add context fields
  assetClass.relevantFields.contextFields.forEach((f) => fields.add(f));

  // Add transition fields if present
  if (assetClass.relevantFields.transitionFields) {
    assetClass.relevantFields.transitionFields.forEach((f) => fields.add(f));
  }

  return Array.from(fields);
}

/**
 * Metadata about asset classes - useful for UX/documentation
 */
export const assetClassMetadata = {
  CoalBasedSteel: {
    icon: '🏭',
    color: '#7F142A', // Coal color from GEM brand
    category: 'Energy Intensive Industry',
    concernAreas: [
      'Coal dependence',
      'Air quality impacts',
      'Closure risk',
      'Capital intensity',
    ],
  },
  CaptiveCoalPlant: {
    icon: '⚡',
    color: '#CA4A50',
    category: 'Stranded Assets',
    concernAreas: ['Industry decarbonization', 'Closure timing', 'Stranded costs'],
  },
  DeepWaterInfra: {
    icon: '🌊',
    color: '#061F5F',
    category: 'Oil & Gas Infrastructure',
    concernAreas: ['Environmental risk', 'Capital intensity', 'Decommissioning costs'],
  },
};
