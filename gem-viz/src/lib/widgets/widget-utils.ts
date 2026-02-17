/**
 * Widget Utilities
 * Shared utilities for exploration widgets that query parquet files
 */

import { initDuckDB, loadParquetFromPath, type QueryResult } from '$lib/duckdb-utils';
import { base } from '$app/paths';
import { browser } from '$app/environment';

// Parquet file paths
export const PARQUET_FILES = {
  ownership: `${base}/all_trackers_ownership@1.parquet`,
  locations: `${base}/asset_locations.parquet`,
};

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize DuckDB and register parquet files
 * Uses promise-based locking to prevent duplicate initialization
 */
export async function initWidgetDB(): Promise<void> {
  // Skip initialization on server (SSR) - DuckDB requires browser APIs
  if (!browser) return;

  // Already fully initialized
  if (initialized) return;

  // Initialization in progress - wait for it
  if (initPromise) return initPromise;

  // Start initialization
  initPromise = (async () => {
    // Double-check after acquiring "lock"
    if (initialized) return;

    await initDuckDB();

    // Check if tables already exist (in case of HMR or race condition)
    const { conn } = await initDuckDB();
    const tablesResult = await conn.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_name IN ('ownership', 'locations')
    `);
    const existingTables = new Set(tablesResult.toArray().map((r) => r.table_name));

    // Load parquet files only if tables don't exist
    if (!existingTables.has('ownership')) {
      const result = await loadParquetFromPath(PARQUET_FILES.ownership, 'ownership');
      if (!result.success) {
        initPromise = null; // Allow retry
        throw new Error(`Failed to load ownership parquet: ${result.error}`);
      }
    } else {
    }

    if (!existingTables.has('locations')) {
      const locResult = await loadParquetFromPath(PARQUET_FILES.locations, 'locations');
      if (!locResult.success) {
        initPromise = null; // Allow retry
        throw new Error(`Failed to load locations parquet: ${locResult.error}`);
      }
    } else {
    }

    initialized = true;
  })();

  return initPromise;
}

/**
 * Run a query against the widget DB
 */
export async function widgetQuery<T = Record<string, unknown>>(
  sql: string
): Promise<QueryResult<T>> {
  // Return empty result on server (SSR)
  if (!browser) {
    return { data: [], success: true, executionTime: 0, rowCount: 0 };
  }

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
