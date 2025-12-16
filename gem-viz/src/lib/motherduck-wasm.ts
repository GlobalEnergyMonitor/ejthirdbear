/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MotherDuck WASM Client Helper
 * Query MotherDuck cloud database directly from the browser
 */

import { MDConnection } from '@motherduck/wasm-client';
import { PUBLIC_MOTHERDUCK_TOKEN } from '$env/static/public';

export interface MotherDuckQueryResult<T = Record<string, any>> {
  data?: T[];
  executionTime?: number;
  success: boolean;
  error?: string;
}

let connection: MDConnection | null = null;

/**
 * Initialize MotherDuck WASM connection
 */
export async function initMotherDuck(): Promise<MDConnection> {
  if (connection) return connection;

  try {
    console.log('Initializing MotherDuck WASM client...');
    console.log('Token present:', !!PUBLIC_MOTHERDUCK_TOKEN);
    console.log('Token length:', PUBLIC_MOTHERDUCK_TOKEN?.length || 0);

    connection = await MDConnection.create({
      mdToken: PUBLIC_MOTHERDUCK_TOKEN,
    });

    console.log('MDConnection created successfully');

    // Use the gem_data database by default
    await connection.evaluateQuery('USE gem_data');

    console.log('[OK] Connected to MotherDuck: gem_data');
    return connection;
  } catch (error) {
    console.error('Failed to initialize MotherDuck:', error);
    console.error('Error type:', typeof error);
    console.error('Error keys:', error ? Object.keys(error) : 'null');
    throw error;
  }
}

/**
 * Execute a query against MotherDuck
 * Works just like duckdb-utils.query but queries the cloud!
 */
export async function query<T = Record<string, any>>(
  sql: string
): Promise<MotherDuckQueryResult<T>> {
  const startTime = performance.now();

  try {
    const conn = await initMotherDuck();

    const result = await conn.evaluateQuery(sql);
    const executionTime = performance.now() - startTime;

    console.log(`Query executed in ${executionTime.toFixed(2)}ms`);

    const data = result.data.toRows() as T[];

    return {
      data,
      executionTime,
      success: true,
    };
  } catch (error) {
    console.error('Query failed:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : JSON.stringify(error);

    return {
      success: false,
      error: errorMessage,
      executionTime: performance.now() - startTime,
    };
  }
}

/**
 * Get table schema from MotherDuck
 */
export async function getTableSchema(tableName: string) {
  const result = await query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = '${tableName}'
    ORDER BY ordinal_position;
  `);

  return result.data || [];
}

/**
 * List all tables in current database
 */
export async function listTables() {
  return await query('SHOW TABLES');
}

/**
 * Get database info
 */
export async function getDatabaseInfo() {
  const result = await query('SELECT current_database() as database');
  return result.data?.[0] || {};
}

// Export singleton instance methods
export default {
  init: initMotherDuck,
  query,
  getTableSchema,
  listTables,
  getDatabaseInfo,
};
