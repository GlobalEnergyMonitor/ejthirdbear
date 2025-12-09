/**
 * Unified Database Composable
 * Swap between local DuckDB WASM and MotherDuck WASM seamlessly
 */

import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';

export type DatabaseMode = 'local' | 'motherduck';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryResult<T = Record<string, any>> {
  data?: T[];
  executionTime?: number;
  success: boolean;
  error?: string;
  rowCount?: number;
}

// Active database mode
export const dbMode: Writable<DatabaseMode> = writable('motherduck');

// Connection status
export const dbConnected: Writable<boolean> = writable(false);
export const dbStatus: Writable<string> = writable('Not connected');

let currentMode: DatabaseMode = 'motherduck';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let localDb: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let motherDuckConn: any = null;

// Subscribe to mode changes
dbMode.subscribe((mode) => {
  currentMode = mode;
});

/**
 * Initialize the active database
 */
export async function initDb(): Promise<void> {
  if (currentMode === 'motherduck') {
    const motherduck = await import('./motherduck-wasm');
    await motherduck.initMotherDuck();
    motherDuckConn = motherduck;
    dbConnected.set(true);
    dbStatus.set('Connected to MotherDuck');
  } else {
    const duckdb = await import('./duckdb-utils');
    await duckdb.initDuckDB();
    localDb = duckdb;
    dbConnected.set(true);
    dbStatus.set('Connected to local DuckDB');
  }
}

/**
 * Execute a SQL query against the active database
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T = Record<string, any>>(sql: string): Promise<QueryResult<T>> {
  if (currentMode === 'motherduck') {
    if (!motherDuckConn) {
      await initDb();
    }
    return motherDuckConn.query(sql);
  } else {
    if (!localDb) {
      await initDb();
    }
    return localDb.query(sql);
  }
}

/**
 * Switch database mode (local <-> motherduck)
 */
export async function switchMode(mode: DatabaseMode): Promise<void> {
  if (mode === currentMode) return;

  dbConnected.set(false);
  dbStatus.set(`Switching to ${mode}...`);

  dbMode.set(mode);
  await initDb();
}

/**
 * List all tables in current database
 */
export async function listTables(): Promise<QueryResult> {
  return query('SHOW TABLES');
}

/**
 * Get table schema
 */
export async function getTableSchema(tableName: string): Promise<QueryResult> {
  return query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position;
  `);
}

/**
 * Load parquet file (local mode only)
 */
export async function loadParquet(url: string, tableName: string): Promise<QueryResult> {
  if (currentMode !== 'local') {
    return {
      success: false,
      error: 'loadParquet only works in local mode',
    };
  }

  if (!localDb) await initDb();
  return localDb.loadParquetFromPath(url, tableName);
}

// Export default object with all methods
export default {
  mode: dbMode,
  connected: dbConnected,
  status: dbStatus,
  init: initDb,
  query,
  switchMode,
  listTables,
  getTableSchema,
  loadParquet,
};
