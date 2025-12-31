/**
 * Optional DuckDB Geography Extension Configuration
 *
 * This module provides optional hooks for using DuckDB's geography extension
 * for enhanced spatial operations. All features are opt-in and non-breaking.
 *
 * To enable geography features:
 * 1. Set ENABLE_GEOGRAPHY=true in .env
 * 2. Features will be computed at build time and stored alongside existing data
 * 3. Existing code paths remain unchanged
 */

/**
 * Geography feature configuration
 * All features are opt-in and require ENABLE_GEOGRAPHY=true
 */
export interface GeographyConfig {
  /** Enable geography extension and all related features */
  enabled: boolean;

  /** Compute S2 cell IDs at build time (hierarchical spatial indexing) */
  computeS2Cells: boolean;

  /** S2 cell levels to precompute (lower = larger cells, faster queries) */
  s2Levels: number[];

  /** Compute WKB geometries for spatial operations */
  computeGeometries: boolean;

  /** Pre-validate coordinates and enrich with geographic metadata */
  enrichGeography: boolean;

  /** Log geography operations at build time */
  verbose: boolean;
}

/**
 * Default configuration: all features disabled (backward compatible)
 */
const DEFAULT_CONFIG: GeographyConfig = {
  enabled: false,
  computeS2Cells: false,
  s2Levels: [20, 10], // Levels 20 (~100m) and 10 (~100km)
  computeGeometries: false,
  enrichGeography: false,
  verbose: false,
};

/**
 * Load geography configuration from environment
 * Uses import.meta.env for Vite compatibility
 */
export function getGeographyConfig(): GeographyConfig {
  // Use import.meta.env for Vite, fallback to defaults if not available
  const env: Record<string, string | undefined> =
    typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const envEnabled = env.VITE_ENABLE_GEOGRAPHY === 'true';

  return {
    ...DEFAULT_CONFIG,
    enabled: envEnabled,
    computeS2Cells: envEnabled && env.VITE_GEOGRAPHY_S2_CELLS !== 'false',
    computeGeometries: envEnabled && env.VITE_GEOGRAPHY_GEOMETRIES === 'true',
    enrichGeography: envEnabled && env.VITE_GEOGRAPHY_ENRICH !== 'false',
    verbose: envEnabled && env.VITE_GEOGRAPHY_VERBOSE === 'true',
  };
}

/**
 * Geography extension setup SQL
 * Safe to call even if extension is not available (will be no-op in some DuckDB versions)
 */
export function getGeographySetupSQL(): string {
  return `
    -- Load optional geography extension (community extension)
    INSTALL geography;
    LOAD geography;
  `;
}

/**
 * Build S2 cell computation SQL for a given asset
 *
 * Computes hierarchical S2 cell IDs for spatial indexing.
 * S2 cells form a hierarchical grid on the sphere.
 *
 * Example S2 cell levels:
 * - Level 0-3: Continental (10,000+ km)
 * - Level 4-9: Country/region (100-1000 km)
 * - Level 10-15: City (1-100 km)
 * - Level 16-20: Street (1cm-1m)
 * - Level 21-30: Exact position (<1cm)
 */
export function buildS2CellSQL(latCol: string, lonCol: string, levels: number[]): string {
  if (levels.length === 0) return '';

  const cellSelects = levels
    .map((level) => `s2_cell_id(${lonCol}, ${latCol}, ${level}) as s2_cell_level_${level}`)
    .join(',\n    ');

  return `, ${cellSelects}`;
}

/**
 * Build geometry computation SQL for a given asset
 *
 * Creates WKB geometry columns for spatial operations like distance, intersection, etc.
 */
export function buildGeometrySQL(latCol: string, lonCol: string): string {
  return `, st_geomfromtext('POINT(' || CAST(${lonCol} AS VARCHAR) || ' ' || CAST(${latCol} AS VARCHAR) || ')') as point_geometry`;
}

/**
 * Build SQL to enrich geography metadata
 *
 * Validates coordinates and optionally enriches with authoritative country/region data
 */
export function buildGeographyEnrichmentSQL(latCol: string, lonCol: string): string {
  return `, ${lonCol} BETWEEN -180 AND 180 as valid_longitude,
    ${latCol} BETWEEN -90 AND 90 as valid_latitude`;
}

/**
 * Example: Query template for finding assets within S2 cell
 *
 * Use this pattern in queries to leverage pre-computed S2 cells
 */
export function exampleS2CellQuery(): string {
  return `
    -- Find all assets in same S2 cell level 10 (~100km)
    SELECT asset1_id, asset2_id, distance_km
    FROM asset_pairs
    WHERE s2_cell_level_10 = ?  -- parameter: user's S2 cell at level 10
    ORDER BY distance_km ASC;
  `;
}

/**
 * Example: Query template for distance calculations
 *
 * Use pre-computed geometries for distance queries
 */
export function exampleDistanceQuery(): string {
  return `
    -- Find assets within 50km of a location
    SELECT
      id, name,
      st_distance(point_geometry, st_point(?, ?)) / 1000 as distance_km
    FROM assets
    WHERE st_distance(point_geometry, st_point(?, ?)) < 50000  -- 50km in meters
    ORDER BY distance_km ASC;
  `;
}

/**
 * Enhanced asset row with optional geography fields
 */
export interface AssetRowWithGeography extends Record<string, unknown> {
  // Original fields
  Tracker?: string;
  Latitude?: number;
  Longitude?: number;

  // Optional S2 cell fields (if computeS2Cells = true)
  s2_cell_level_20?: string;
  s2_cell_level_10?: string;
  [key: `s2_cell_level_${number}`]: string | undefined;

  // Optional geometry field (if computeGeometries = true)
  point_geometry?: string; // WKB format

  // Optional enrichment fields (if enrichGeography = true)
  valid_latitude?: boolean;
  valid_longitude?: boolean;
}

export default {
  getGeographyConfig,
  getGeographySetupSQL,
  buildS2CellSQL,
  buildGeometrySQL,
  buildGeographyEnrichmentSQL,
  exampleS2CellQuery,
  exampleDistanceQuery,
};
