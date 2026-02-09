/**
 * Tracker Metadata - Rich descriptions and configuration for tracker pages
 *
 * This file contains extended metadata for each tracker beyond what's in tracker-config.ts.
 * Used by /tracker and /tracker/[slug] pages.
 */

export interface TrackerMetadata {
  /** URL slug (lowercase, hyphenated) */
  slug: string;

  /** Tracker name as it appears in the database */
  name: string;

  /** Short description (1-2 sentences) */
  description: string;

  /** Color for cards/charts (CSS color) */
  color: string;

  /** Asset type icon (optional emoji or icon name) */
  icon?: string;

  /** External links */
  externalLinks: {
    gemPage?: string;
    github?: string;
    methodology?: string;
  };

  /** Citation text */
  citation: string;

  /** Key fields to highlight in data cards */
  keyFields: string[];
}

/**
 * Slug to tracker name mapping
 */
export const slugToTrackerName: Record<string, string> = {
  'coal-plant': 'Coal Plant',
  'gas-plant': 'Gas Plant',
  'coal-mine': 'Coal Mine',
  'iron-mine': 'Iron Mine',
  'steel-plant': 'Steel Plant',
  'gas-pipeline': 'Gas Pipeline',
  bioenergy: 'Bioenergy Power',
};

/**
 * Tracker name to slug mapping (reverse of above)
 */
export const trackerNameToSlug: Record<string, string> = Object.fromEntries(
  Object.entries(slugToTrackerName).map(([slug, name]) => [name, slug])
);

/**
 * Rich metadata for each tracker
 */
export const trackerMetadata: Record<string, TrackerMetadata> = {
  'coal-plant': {
    slug: 'coal-plant',
    name: 'Coal Plant',
    description:
      'Comprehensive database of coal-fired power plants worldwide, tracking capacity, ownership, and operating status from announcement through retirement.',
    color: '#4a4a4a',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-coal-plant-tracker/',
      github: 'https://github.com/GlobalEnergyMonitor/coal-plant-tracker',
    },
    citation:
      'Global Energy Monitor, Global Coal Plant Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Capacity (MW)', 'Country', 'Owner', 'Start year'],
  },

  'gas-plant': {
    slug: 'gas-plant',
    name: 'Gas Plant',
    description:
      'Tracks gas-fired power generation facilities globally, including LNG terminals and combined-cycle plants, with detailed ownership and capacity data.',
    color: '#1D4961',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-gas-plant-tracker/',
    },
    citation:
      'Global Energy Monitor, Global Gas Plant Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Capacity (MW)', 'Country', 'Owner', 'Fuel type'],
  },

  'coal-mine': {
    slug: 'coal-mine',
    name: 'Coal Mine',
    description:
      'Documents coal mining operations and proposed projects worldwide, tracking production capacity, mine type, and ownership structures.',
    color: '#2c3e50',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-coal-mine-tracker/',
      github: 'https://github.com/GlobalEnergyMonitor/coal-mine-tracker',
    },
    citation:
      'Global Energy Monitor, Global Coal Mine Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Capacity (Mtpa)', 'Country', 'Owner', 'Mine type'],
  },

  'iron-mine': {
    slug: 'iron-mine',
    name: 'Iron Mine',
    description:
      'Tracks iron ore mining operations globally, providing data on extraction capacity, ownership, and development status.',
    color: '#8b4513',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-iron-mine-tracker/',
    },
    citation:
      'Global Energy Monitor, Global Iron Mine Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Design capacity (ttpa)', 'Country', 'Owner'],
  },

  'steel-plant': {
    slug: 'steel-plant',
    name: 'Steel Plant',
    description:
      'Comprehensive database of steel manufacturing facilities worldwide, tracking crude steel capacity, production technology, and ownership.',
    color: '#5a6a7a',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-steel-plant-tracker/',
    },
    citation:
      'Global Energy Monitor, Global Steel Plant Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Nominal crude steel capacity (ttpa)', 'Country', 'Owner', 'Technology'],
  },

  'gas-pipeline': {
    slug: 'gas-pipeline',
    name: 'Gas Pipeline',
    description:
      'Documents natural gas pipeline infrastructure globally, tracking pipeline length, capacity, and cross-border connections.',
    color: '#1D4961',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-gas-pipeline-tracker/',
    },
    citation:
      'Global Energy Monitor, Global Gas Pipeline Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'CapacityBcm/y', 'Countries', 'Owner'],
  },

  bioenergy: {
    slug: 'bioenergy',
    name: 'Bioenergy Power',
    description:
      'Tracks bioenergy power generation facilities including biomass, biogas, and waste-to-energy plants with capacity and feedstock data.',
    color: '#2d5a3d',
    externalLinks: {
      gemPage: 'https://globalenergymonitor.org/projects/global-bioenergy-power-tracker/',
    },
    citation:
      'Global Energy Monitor, Global Bioenergy Power Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    keyFields: ['Status', 'Capacity (MW)', 'Country', 'Owner', 'Feedstock'],
  },
};

/**
 * Get metadata for a tracker by slug
 */
export function getTrackerMetadata(slug: string): TrackerMetadata | null {
  return trackerMetadata[slug] || null;
}

/**
 * Get metadata for a tracker by name
 */
export function getTrackerMetadataByName(name: string): TrackerMetadata | null {
  const slug = trackerNameToSlug[name];
  return slug ? trackerMetadata[slug] : null;
}

/**
 * Get all tracker slugs
 */
export function getAllTrackerSlugs(): string[] {
  return Object.keys(trackerMetadata);
}
