/* eslint-disable @typescript-eslint/no-explicit-any */
import * as duckdb from '@duckdb/duckdb-wasm';

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

/**
 * Initialize DuckDB with optimized settings for browser use
 * Following best practices for WASM performance
 */
export async function initDuckDB(): Promise<DuckDBInstance> {
  if (db && conn) return { db, conn };

  try {
    console.log('Initializing DuckDB-WASM...');

    // Get bundles from jsdelivr CDN
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

    // Select appropriate bundle
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

    // Create worker for background processing
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' })
    );

    const worker = new Worker(worker_url);
    const logger = new duckdb.ConsoleLogger();

    // Initialize database
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule);

    // Clean up worker URL
    URL.revokeObjectURL(worker_url);

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
        console.log('httpfs extension not available in WASM build');
      });

    console.log('DuckDB initialized successfully');
    return { db, conn };
  } catch (error) {
    console.error('Failed to initialize DuckDB:', error);
    throw error;
  }
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

    const metadata = await conn!.query(metadataQuery);
    console.log('Parquet metadata:', metadata.toArray());

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
    console.log(`Loaded ${count} rows from ${url}`);

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
    console.log(`Loaded ${count} rows from ${file.name}`);

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
      console.log(`[Attempt ${attempt + 1}/${retries + 1}] Fetching ${path}...`);

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const sizeStr = contentLength
        ? `${(Number(contentLength) / 1024 / 1024).toFixed(2)} MB`
        : 'unknown size';
      console.log(`✓ Fetched ${path} (${sizeStr})`);

      const blob = await response.blob();
      console.log(`✓ Blob created: ${(blob.size / 1024 / 1024).toFixed(2)} MB`);

      const fileName = path.split('/').pop()!;

      // Create a File object from the blob
      const file = new File([blob], fileName, { type: 'application/octet-stream' });
      console.log(`✓ File object created: ${fileName}`);

      // Register the file with DuckDB
      await db!.registerFileHandle(
        fileName,
        file,
        duckdb.DuckDBDataProtocol.BROWSER_FILEREADER,
        true
      );
      console.log(`✓ File registered with DuckDB: ${fileName}`);

      // Create table from the file
      console.log(`Creating table ${tableName} from ${fileName}...`);
      await conn!.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM parquet_scan('${fileName}');
      `);
      console.log(`✓ Table ${tableName} created`);

      // Get row count
      const countResult = await conn!.query(`
        SELECT count(*) as total FROM ${tableName};
      `);

      const count = countResult.toArray()[0].total;
      console.log(`✓ Successfully loaded ${Number(count).toLocaleString()} rows from ${path}`);

      return { success: true, rowCount: Number(count) };
    } catch (error) {
      console.error(`✗ Attempt ${attempt + 1} failed:`, error);

      if (attempt < retries) {
        console.log(`Retrying in ${(attempt + 1) * 1000}ms...`);
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
      console.log(`[Attempt ${attempt + 1}/${retries + 1}] Fetching ${path}...`);

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const sizeStr = contentLength
        ? `${(Number(contentLength) / 1024 / 1024).toFixed(2)} MB`
        : 'unknown size';
      console.log(`✓ Fetched ${path} (${sizeStr})`);

      const csvText = await response.text();
      console.log(`✓ CSV text loaded: ${(csvText.length / 1024 / 1024).toFixed(2)} MB`);

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
      console.log(`✓ CSV registered with DuckDB: ${fileName}`);

      // Create table from the CSV file
      console.log(`Creating table ${tableName} from ${fileName}...`);
      await conn!.query(`
        CREATE OR REPLACE TABLE ${tableName} AS
        SELECT * FROM read_csv_auto('${fileName}');
      `);
      console.log(`✓ Table ${tableName} created`);

      // Get row count
      const countResult = await conn!.query(`
        SELECT count(*) as total FROM ${tableName};
      `);

      const count = countResult.toArray()[0].total;
      console.log(`✓ Successfully loaded ${Number(count).toLocaleString()} rows from ${path}`);

      return { success: true, rowCount: Number(count) };
    } catch (error) {
      console.error(`✗ Attempt ${attempt + 1} failed:`, error);

      if (attempt < retries) {
        console.log(`Retrying in ${(attempt + 1) * 1000}ms...`);
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

    console.log(`Query executed in ${executionTime.toFixed(2)}ms`);

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
    console.error('Query failed:', error);
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
  console.log('DuckDB resources cleaned up');
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
