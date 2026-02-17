/* eslint-disable @typescript-eslint/no-explicit-any */
import * as duckdb from '@duckdb/duckdb-wasm';
// Use locally bundled WASM/worker assets to avoid CDN fetch failures (e.g. 403s offline)
import duckdb_wasm_mvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_worker_mvp from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_worker_eh from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

// Type definitions
export interface QueryResult<T = Record<string, any>> {
  data?: T[];
  executionTime?: number;
  success: boolean;
  error?: string;
  rowCount?: number;
}

export interface TableSchema {
  column_name: string;
  data_type: string;
}

export interface DuckDBInstance {
  db: duckdb.AsyncDuckDB;
  conn: duckdb.AsyncDuckDBConnection;
}

// Singleton instances
let db: duckdb.AsyncDuckDB | null = null;
let conn: duckdb.AsyncDuckDBConnection | null = null;
let initPromise: Promise<DuckDBInstance> | null = null;

/**
 * Initialize DuckDB with optimized settings for browser use
 * Following best practices for WASM performance
 * Uses promise-based locking to prevent duplicate initialization
 */
export async function initDuckDB(): Promise<DuckDBInstance> {
  // Return existing instance if already initialized
  if (db && conn) return { db, conn };

  // Return existing promise if initialization is in progress
  if (initPromise) return initPromise;

  // Start initialization and store promise to prevent race conditions
  initPromise = (async () => {
    // Double-check in case another call completed while we were waiting
    if (db && conn) return { db, conn };

    try {
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: duckdb_wasm_mvp,
          mainWorker: duckdb_worker_mvp,
        },
        eh: {
          mainModule: duckdb_wasm_eh,
          mainWorker: duckdb_worker_eh,
        },
      };

      // Select appropriate bundle (prefers eh when available)
      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

      // Create worker for background processing using bundled worker file
      const worker = new Worker(bundle.mainWorker);
      const logger = new duckdb.ConsoleLogger();

      // Initialize database
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule);

      // Create connection
      conn = await db.connect();

      // Enable httpfs for remote parquet files
      await conn
        .query(
          `
        INSTALL httpfs;
        LOAD httpfs;
      `
        )
        .catch(() => {
          // httpfs extension not available in WASM build — non-critical
        });

      return { db: db!, conn: conn! };
    } catch (error) {
      console.error('Failed to initialize DuckDB:', error);
      // Clear promise so retry is possible
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Load a Parquet file from URL using best practices
 * Uses HTTP range requests to minimize data transfer
 */
export async function loadParquetFromURL(url: string, tableName = 'data'): Promise<QueryResult> {
  if (!conn) await initDuckDB();

  try {
    // First, get metadata without downloading entire file
    const metadataQuery = `
      SELECT * FROM parquet_metadata('${url}');
    `;

    await conn!.query(metadataQuery);

    // Create table from parquet file
    await conn!.query(`
      CREATE OR REPLACE TABLE ${tableName} AS
      SELECT * FROM parquet_scan('${url}');
    `);

    // Get row count efficiently (uses metadata)
    const countResult = await conn!.query(`
      SELECT count(*) as total FROM ${tableName};
    `);

    const count = countResult.toArray()[0].total;

    return { success: true, rowCount: Number(count) };
  } catch (error) {
    console.error('Failed to load Parquet file:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Load a local Parquet file using file input
 */
export async function loadParquetFromFile(file: File, tableName = 'data'): Promise<QueryResult> {
  if (!conn || !db) await initDuckDB();

  try {
    // Register the file with DuckDB
    await db!.registerFileHandle(
      file.name,
      file,
      duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
      true
    );

    // Create table from the file
    await conn!.query(`
      CREATE OR REPLACE TABLE ${tableName} AS
      SELECT * FROM parquet_scan('${file.name}');
    `);

    // Get row count
    const countResult = await conn!.query(`
      SELECT count(*) as total FROM ${tableName};
    `);

    const count = countResult.toArray()[0].total;

    return { success: true, rowCount: Number(count) };
  } catch (error) {
    console.error('Failed to load Parquet file:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Load a Parquet file from a local path by fetching it first
 */
export async function loadParquetFromPath(
  path: string,
  tableName = 'data',
  retries = 2
): Promise<QueryResult> {
  if (!conn || !db) await initDuckDB();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = path.split('/').pop()!;

      // Create a File object from the blob
      const file = new File([blob], fileName, { type: 'application/octet-stream' });

      // Register the file with DuckDB
      await db!.registerFileHandle(
        fileName,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );

      // Create table from the file
      await conn!.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM parquet_scan('${fileName}');
      `);

      // Get row count
      const countResult = await conn!.query(`
        SELECT count(*) as total FROM ${tableName};
      `);

      const count = countResult.toArray()[0].total;

      return { success: true, rowCount: Number(count) };
    } catch (error) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
      } else {
        console.error(`Failed to load Parquet file after ${retries + 1} attempts:`, error);
        return { success: false, error: (error as Error).message };
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Load a CSV file from a local path by fetching it first
 */
export async function loadCSVFromPath(
  path: string,
  tableName = 'data',
  retries = 2
): Promise<QueryResult> {
  if (!conn || !db) await initDuckDB();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
      }

      const csvText = await response.text();
      const fileName = path.split('/').pop()!;

      // Register the CSV as a file with DuckDB
      const blob = new Blob([csvText], { type: 'text/csv' });
      const file = new File([blob], fileName, { type: 'text/csv' });

      await db!.registerFileHandle(
        fileName,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );

      // Create table from the CSV file
      await conn!.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM read_csv_auto('${fileName}');
      `);

      // Get row count
      const countResult = await conn!.query(`
        SELECT count(*) as total FROM ${tableName};
      `);

      const count = countResult.toArray()[0].total;

      return { success: true, rowCount: Number(count) };
    } catch (error) {
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000));
      } else {
        console.error(`Failed to load CSV file after ${retries + 1} attempts:`, error);
        return { success: false, error: (error as Error).message };
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Execute a query with performance timing
 */
export async function query<T = Record<string, any>>(sql: string): Promise<QueryResult<T>> {
  if (!conn) await initDuckDB();

  const startTime = performance.now();
  try {
    const result = await conn!.query(sql);
    const endTime = performance.now();
    const executionTime = endTime - startTime;

    // Convert BigInt to regular numbers for JSON serialization
    const data = result.toArray().map((row) => {
      const converted: any = {};
      for (const [key, value] of Object.entries(row)) {
        if (typeof value === 'bigint') {
          converted[key] = Number(value);
        } else {
          converted[key] = value;
        }
      }
      return converted as T;
    });

    return {
      data,
      executionTime,
      success: true,
    };
  } catch (error) {
    const preview = sql.length > 500 ? `${sql.slice(0, 500)}...` : sql;
    console.error('Query failed:', error, 'SQL preview:', preview);
    return {
      success: false,
      error: (error as Error).message,
      executionTime: performance.now() - startTime,
    };
  }
}

/**
 * Get table schema efficiently
 */
export async function getTableSchema(tableName: string): Promise<TableSchema[]> {
  const result = await query<TableSchema>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position;
  `);

  return result.data || [];
}

/**
 * Sample data from a table (useful for large datasets)
 */
export async function sampleTable<T = Record<string, any>>(
  tableName: string,
  limit = 1000
): Promise<QueryResult<T>> {
  return await query<T>(`
    SELECT * FROM ${tableName}
    USING SAMPLE ${limit};
  `);
}

/**
 * Clean up resources
 */
export async function cleanup(): Promise<void> {
  if (conn) {
    await conn.close();
    conn = null;
  }
  if (db) {
    await db.terminate();
    db = null;
  }
}

// Export singleton instance methods
export default {
  init: initDuckDB,
  loadParquetFromURL,
  loadParquetFromFile,
  loadParquetFromPath,
  loadCSVFromPath,
  query,
  getTableSchema,
  sampleTable,
  cleanup,
};
