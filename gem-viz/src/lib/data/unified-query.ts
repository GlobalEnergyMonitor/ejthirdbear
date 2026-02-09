/**
 * Unified Query Layer
 * ====================
 *
 * Single entry point for all DuckDB-style queries.
 * Uses MotherDuck (cloud DuckDB) exclusively - no local fallback.
 *
 * Data Source Hierarchy:
 * 1. REST API - for ownership/entity/asset lookups (see ownership-api.ts)
 * 2. MotherDuck - for bulk analytics queries (this module)
 *
 * If MotherDuck fails, the query fails. No local parquet fallback.
 */

import { browser } from '$app/environment';

// =============================================================================
// TYPES
// =============================================================================

export interface UnifiedQueryResult<T = Record<string, unknown>> {
  data: T[];
  success: boolean;
  error?: string;
  source: 'motherduck' | 'none';
  executionTime: number;
  rowCount: number;
}

export type DataSource = 'motherduck';

interface QueryOptions {
  /** Timeout in ms (default: 15000) */
  timeout?: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Default timeout for MotherDuck queries */
const MOTHERDUCK_TIMEOUT_MS = 15_000;

/** MotherDuck table names (updated schema October 2025) */
export const TABLES = {
  ownership: 'gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership',
  locations: 'gem_data.ownership.asset_locations', // May not exist in new schema
} as const;

// Track MotherDuck availability
let motherDuckAvailable = true;
let lastMotherDuckError: string | null = null;

// =============================================================================
// MAIN QUERY FUNCTION
// =============================================================================

/**
 * Execute a SQL query against MotherDuck.
 *
 * @param sql - SQL query using local table names ('ownership', 'locations')
 *              Table names are automatically mapped to MotherDuck paths.
 * @param options - Query options
 * @returns Query result with source metadata
 *
 * @example
 * ```typescript
 * const result = await unifiedQuery<{ count: number }>(`
 *   SELECT COUNT(*) as count FROM ownership WHERE "Tracker" = 'Coal Plant'
 * `);
 * if (result.success) {
 *   console.log(`Found ${result.data[0].count} coal plants`);
 *   console.log(`Query took ${result.executionTime}ms via ${result.source}`);
 * }
 * ```
 */
export async function unifiedQuery<T = Record<string, unknown>>(
  sql: string,
  options: QueryOptions = {}
): Promise<UnifiedQueryResult<T>> {
  const startTime = performance.now();

  // Server-side: return empty (MotherDuck WASM requires browser)
  if (!browser) {
    return {
      data: [],
      success: true,
      source: 'none',
      executionTime: 0,
      rowCount: 0,
    };
  }

  const { timeout = MOTHERDUCK_TIMEOUT_MS } = options;

  return executeMotherDuckQuery<T>(sql, timeout, startTime);
}

// =============================================================================
// MOTHERDUCK EXECUTION
// =============================================================================

async function executeMotherDuckQuery<T>(
  sql: string,
  timeout: number,
  startTime: number
): Promise<UnifiedQueryResult<T>> {
  try {
    const motherduck = await import('$lib/motherduck-wasm');

    // Adapt SQL for MotherDuck (use fully qualified table names)
    const adaptedSql = adaptSqlForMotherDuck(sql);

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error(`MotherDuck query timed out after ${timeout}ms`)),
        timeout
      );
    });

    // Race query against timeout
    const result = await Promise.race([motherduck.query<T>(adaptedSql), timeoutPromise]);

    const executionTime = performance.now() - startTime;

    if (!result.success) {
      throw new Error(result.error || 'Unknown MotherDuck error');
    }

    // Reset availability on success
    if (!motherDuckAvailable) {
      motherDuckAvailable = true;
      lastMotherDuckError = null;
      console.log('[unified-query] MotherDuck connection restored');
    }

    console.log(
      `[unified-query] MotherDuck: ${result.data?.length || 0} rows in ${executionTime.toFixed(0)}ms`
    );

    return {
      data: result.data || [],
      success: true,
      source: 'motherduck',
      executionTime,
      rowCount: result.data?.length || 0,
    };
  } catch (error) {
    const executionTime = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Track availability for monitoring
    motherDuckAvailable = false;
    lastMotherDuckError = errorMessage;
    console.error(`[unified-query] MotherDuck error: ${errorMessage}`);

    return {
      data: [],
      success: false,
      error: errorMessage,
      source: 'motherduck',
      executionTime,
      rowCount: 0,
    };
  }
}

// =============================================================================
// SQL ADAPTATION
// =============================================================================

/**
 * Adapt SQL for MotherDuck (map local table names to cloud paths)
 */
function adaptSqlForMotherDuck(sql: string): string {
  return sql
    .replace(/\bownership\b/gi, TABLES.ownership)
    .replace(/\blocations\b/gi, TABLES.locations);
}

// =============================================================================
// STATUS UTILITIES
// =============================================================================

/**
 * Get current MotherDuck availability status
 */
export function getMotherDuckStatus(): {
  available: boolean;
  lastError: string | null;
} {
  return {
    available: motherDuckAvailable,
    lastError: lastMotherDuckError,
  };
}

/**
 * Reset MotherDuck availability (e.g., for retry after network recovery)
 */
export function resetMotherDuckStatus(): void {
  motherDuckAvailable = true;
  lastMotherDuckError = null;
  console.log('[unified-query] MotherDuck status reset');
}

/**
 * Force MotherDuck to unavailable (for testing/debugging)
 */
export function disableMotherDuck(): void {
  motherDuckAvailable = false;
  lastMotherDuckError = 'Disabled manually';
}
