/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MotherDuck Node.js Client
 * For build-time queries during static site generation
 * Uses native Node.js DuckDB (not WASM)
 */

import duckdb from 'duckdb';
import { PUBLIC_MOTHERDUCK_TOKEN } from '$env/static/public';
import { getGeographyConfig, getGeographySetupSQL } from './geography-config';

const { Database } = duckdb;
let db: typeof Database.prototype | null = null;

export interface QueryResult<T = Record<string, any>> {
  data: T[];
  executionTime?: number;
  success: boolean;
  error?: string;
}

/**
 * Initialize DuckDB connection to MotherDuck
 */
async function init(options?: { includeGeography?: boolean }): Promise<any> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    db = new Database(':memory:', (err: Error | null) => {
      if (err) {
        console.error('Failed to create DuckDB database:', err);
        reject(err);
        return;
      }

      // Build initialization SQL
      let initSQL = `
        INSTALL motherduck;
        LOAD motherduck;
        SET motherduck_token='${PUBLIC_MOTHERDUCK_TOKEN}';
        ATTACH 'md:gem_data' AS gem;
        USE gem;
      `;

      // Optionally load geography extension
      const shouldLoadGeography = options?.includeGeography ?? getGeographyConfig().enabled;
      if (shouldLoadGeography) {
        const geoConfig = getGeographyConfig();
        if (geoConfig.verbose) {
          console.log('🌍 Loading DuckDB geography extension...');
        }
        initSQL += '\n' + getGeographySetupSQL();
      }

      // Install and load MotherDuck extension
      db!.exec(initSQL, (err: Error | null) => {
        if (err) {
          console.error('Failed to connect to MotherDuck:', err);
          reject(err);
          return;
        }
        console.log('✓ Connected to MotherDuck (Node.js)');
        if (shouldLoadGeography) {
          console.log('✓ Geography extension loaded');
        }
        resolve(db!);
      });
    });
  });
}

/**
 * Execute a query against MotherDuck
 */
export async function query<T = Record<string, any>>(sql: string): Promise<QueryResult<T>> {
  const startTime = Date.now();

  try {
    const database = await init();

    return new Promise((resolve) => {
      database.all(sql, (err: Error | null, rows: any[]) => {
        const executionTime = Date.now() - startTime;

        if (err) {
          console.error('Query failed:', err);
          resolve({
            data: [],
            executionTime,
            success: false,
            error: err.message,
          });
          return;
        }

        console.log(`Query executed in ${executionTime}ms`);
        resolve({
          data: rows as T[],
          executionTime,
          success: true,
        });
      });
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      data: [],
      executionTime: Date.now() - startTime,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Close the database connection
 */
export async function close(): Promise<void> {
  if (!db) return;

  return new Promise((resolve, reject) => {
    db!.close((err: Error | null) => {
      if (err) {
        console.error('Failed to close database:', err);
        reject(err);
        return;
      }
      db = null;
      resolve();
    });
  });
}

export default {
  init,
  query,
  close,
};
