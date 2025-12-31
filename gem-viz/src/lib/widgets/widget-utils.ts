/**
 * Widget Utilities
 * Shared utilities for exploration widgets that query parquet files
 * Includes BM25 full-text search via DuckDB FTS extension
 */

import { initDuckDB, loadParquetFromPath, type QueryResult } from '$lib/duckdb-utils';
import { base } from '$app/paths';

// Parquet file paths
export const PARQUET_FILES = {
  ownership: `${base}/all_trackers_ownership@1.parquet`,
  locations: `${base}/asset_locations.parquet`,
};

let initialized = false;
let ftsInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize DuckDB and register parquet files
 */
export async function initWidgetDB(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initDuckDB();

    // Load parquet files by fetching and registering them
    // (DuckDB WASM can't query URL paths directly - needs file registration)
    const ownershipResult = await loadParquetFromPath(PARQUET_FILES.ownership, 'ownership');
    if (!ownershipResult.success) {
      throw new Error(`Failed to load ownership parquet: ${ownershipResult.error}`);
    }

    const locationsResult = await loadParquetFromPath(PARQUET_FILES.locations, 'locations');
    if (!locationsResult.success) {
      console.warn(`Failed to load locations parquet: ${locationsResult.error}`);
      // Continue anyway - locations is optional for country data
    }

    initialized = true;
    console.log('Widget DB initialized with ownership and locations tables');

    // Initialize FTS index in background (non-blocking)
    initFTSIndex().catch((err) => console.warn('FTS index creation failed:', err));
  })();

  return initPromise;
}

/**
 * Initialize Full-Text Search index for BM25 queries
 * Creates index on Project and Owner columns
 */
async function initFTSIndex(): Promise<void> {
  if (ftsInitialized) return;

  try {
    const { conn } = await initDuckDB();

    // Install and load FTS extension
    await conn.query(`INSTALL fts`);
    await conn.query(`LOAD fts`);

    // Create FTS index on ownership table
    // Index Project (asset name) and Owner (entity name) for search
    await conn.query(`
      PRAGMA create_fts_index(
        'ownership',
        'GEM unit ID',
        'Project',
        'Owner',
        stemmer = 'english',
        stopwords = 'english',
        lower = 1,
        strip_accents = 1,
        overwrite = 1
      )
    `);

    ftsInitialized = true;
    console.log('FTS index created for BM25 search');
  } catch (error) {
    console.error('Failed to create FTS index:', error);
    throw error;
  }
}

/**
 * Check if FTS index is ready
 */
export function isFTSReady(): boolean {
  return ftsInitialized;
}

/**
 * Wait for FTS index to be ready (with timeout)
 */
export async function waitForFTS(timeoutMs = 5000): Promise<boolean> {
  if (ftsInitialized) return true;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (ftsInitialized) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return ftsInitialized;
}

/**
 * Run a query against the widget DB
 */
export async function widgetQuery<T = Record<string, unknown>>(
  sql: string
): Promise<QueryResult<T>> {
  const startTime = Date.now();

  try {
    await initWidgetDB();
    const { conn } = await initDuckDB();

    const result = await conn.query(sql);
    const data = result.toArray().map((row) => {
      const obj: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        let val = row[key];
        // Convert BigInt to number for JSON compatibility
        if (typeof val === 'bigint') val = Number(val);
        obj[key] = val;
      }
      return obj as T;
    });

    return {
      data,
      success: true,
      executionTime: Date.now() - startTime,
      rowCount: data.length,
    };
  } catch (error) {
    console.error('Widget query error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
    };
  }
}
