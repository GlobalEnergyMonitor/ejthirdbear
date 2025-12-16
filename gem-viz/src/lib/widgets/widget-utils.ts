/**
 * Widget Utilities
 * Shared utilities for exploration widgets that query parquet files
 */

import { initDuckDB, loadParquetFromPath, type QueryResult } from '$lib/duckdb-utils';
import { base } from '$app/paths';

// Parquet file paths
export const PARQUET_FILES = {
  ownership: `${base}/all_trackers_ownership@1.parquet`,
  locations: `${base}/asset_locations.parquet`,
};

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize DuckDB and register parquet files
 */
export async function initWidgetDB(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await initDuckDB();

    // Load parquet file by fetching and registering it
    // (DuckDB WASM can't query URL paths directly - needs file registration)
    const result = await loadParquetFromPath(PARQUET_FILES.ownership, 'ownership');
    if (!result.success) {
      throw new Error(`Failed to load ownership parquet: ${result.error}`);
    }

    initialized = true;
    console.log('Widget DB initialized with ownership table');
  })();

  return initPromise;
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
