/**
 * Spatial Tile Loader
 *
 * Loads only the parquet tiles needed for a given geographic area.
 * Tiles are pre-built at build time by scripts/build-spatial-tiles.js
 */

import { initDuckDB, loadParquetFromPath, query } from './duckdb-utils';
import { assets as assetsPath } from '$app/paths';

export interface TileManifest {
  version: number;
  generated: string;
  tileSize: number;
  totalAssets: number;
  totalRows: number;
  tiles: TileInfo[];
}

export interface TileInfo {
  name: string;
  file: string;
  bounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  tileBounds: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  assetCount: number;
  rowCount: number;
  sizeMB: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Cached manifest
let manifest: TileManifest | null = null;
let loadedTiles: Set<string> = new Set();

/**
 * Load the tile manifest (small JSON file)
 */
export async function loadManifest(): Promise<TileManifest> {
  if (manifest) return manifest;

  const basePath = assetsPath || '';
  const response = await fetch(`${basePath}/tiles/manifest.json`);

  if (!response.ok) {
    throw new Error(`Failed to load tile manifest: ${response.statusText}`);
  }

  manifest = await response.json();
  console.log(
    `Loaded manifest: ${manifest!.tiles.length} tiles, ${manifest!.totalAssets.toLocaleString()} assets`
  );

  return manifest!;
}

/**
 * Find which tiles intersect with given bounds
 */
export function findTilesForBounds(bounds: MapBounds, manifest: TileManifest): TileInfo[] {
  const { north, south, east, west } = bounds;

  return manifest.tiles.filter((tile) => {
    const tb = tile.tileBounds;
    // Check for intersection (not complete containment)
    const latOverlap = tb.minLat < north && tb.maxLat > south;
    const lonOverlap = tb.minLon < east && tb.maxLon > west;
    return latOverlap && lonOverlap;
  });
}

/**
 * Estimate download size for a set of tiles
 */
export function estimateSize(tiles: TileInfo[]): { mb: number; rows: number; assets: number } {
  return {
    mb: tiles.reduce((sum, t) => sum + t.sizeMB, 0),
    rows: tiles.reduce((sum, t) => sum + t.rowCount, 0),
    assets: tiles.reduce((sum, t) => sum + t.assetCount, 0),
  };
}

/**
 * Load specific tiles into DuckDB (if not already loaded)
 */
export async function loadTiles(
  tiles: TileInfo[],
  onProgress?: (_loaded: number, _total: number, _current: string) => void
): Promise<void> {
  await initDuckDB();

  const basePath = assetsPath || '';
  const toLoad = tiles.filter((t) => !loadedTiles.has(t.name));

  if (toLoad.length === 0) {
    console.log('All requested tiles already loaded');
    return;
  }

  console.log(`Loading ${toLoad.length} tiles...`);

  for (let i = 0; i < toLoad.length; i++) {
    const tile = toLoad[i];
    onProgress?.(i, toLoad.length, tile.name);

    const result = await loadParquetFromPath(
      `${basePath}/tiles/${tile.file}`,
      tile.name.replace(/-/g, '_') // Table name can't have hyphens
    );

    if (!result.success) {
      console.error(`Failed to load tile ${tile.name}:`, result.error);
      continue;
    }

    loadedTiles.add(tile.name);
    console.log(`Loaded ${tile.name}: ${tile.assetCount} assets`);
  }

  onProgress?.(toLoad.length, toLoad.length, 'complete');
}

/**
 * Query across all loaded tiles
 */
export async function queryLoadedTiles<T>(
  sqlTemplate: (_tableNames: string[]) => string
): Promise<T[]> {
  if (loadedTiles.size === 0) {
    return [];
  }

  const tableNames = Array.from(loadedTiles).map((name) => name.replace(/-/g, '_'));

  const sql = sqlTemplate(tableNames);
  const result = await query<T>(sql);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data || [];
}

/**
 * High-level function: Load tiles for bounds and query
 */
export async function queryBounds<T>(
  bounds: MapBounds,
  buildQuery: (_tableNames: string[]) => string,
  onProgress?: (_loaded: number, _total: number, _current: string) => void
): Promise<{ data: T[]; tilesLoaded: number; estimatedSize: ReturnType<typeof estimateSize> }> {
  const m = await loadManifest();
  const tiles = findTilesForBounds(bounds, m);
  const estimate = estimateSize(tiles);

  console.log(
    `Query needs ${tiles.length} tiles (${estimate.mb.toFixed(1)} MB, ${estimate.assets.toLocaleString()} assets)`
  );

  await loadTiles(tiles, onProgress);

  const data = await queryLoadedTiles<T>(buildQuery);

  return {
    data,
    tilesLoaded: tiles.length,
    estimatedSize: estimate,
  };
}

/**
 * Build a UNION ALL query across multiple tile tables
 */
export function buildUnionQuery(
  tableNames: string[],
  selectClause: string,
  whereClause?: string
): string {
  if (tableNames.length === 0) {
    return `SELECT ${selectClause} WHERE 1=0`; // Empty result
  }

  const queries = tableNames.map(
    (table) => `SELECT ${selectClause} FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`
  );

  return queries.join('\nUNION ALL\n');
}

/**
 * Clear loaded tiles (free memory)
 */
export function clearLoadedTiles(): void {
  loadedTiles.clear();
  console.log('Cleared loaded tiles');
}

/**
 * Get stats about currently loaded tiles
 */
export function getLoadedStats(): { tileCount: number; tileNames: string[] } {
  return {
    tileCount: loadedTiles.size,
    tileNames: Array.from(loadedTiles),
  };
}
