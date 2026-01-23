/**
 * Optimized query helpers for factsheet components
 * Provides parameterized queries and result caching
 *
 * Uses centralized DuckDB queries from $lib/duckdb-queries
 */

import {
  getFactsheetAssets,
  getCapacities,
  getFieldStats,
  getTrackerRowCount,
} from '$lib/duckdb-queries';
import type { Asset } from './types';

/** Simple in-memory cache with TTL */
const queryCache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 60_000; // 1 minute

function getCached<T>(key: string): T | null {
  const cached = queryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T;
  }
  queryCache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  queryCache.set(key, { data, timestamp: Date.now() });
}

/** Escape string for SQL (prevent injection) - kept for potential future use */
function _escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

/** Fetch assets with optional filtering */
export async function fetchAssets(options: {
  tracker?: string | null;
  statusFilter?: string[] | null;
  sortBy?: 'capacity' | 'age' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}): Promise<{ success: boolean; data: Asset[]; error?: string }> {
  const { tracker, statusFilter, sortBy = 'capacity', sortOrder = 'desc', limit = 10 } = options;

  const cacheKey = `assets:${tracker}:${statusFilter?.join(',')}:${sortBy}:${sortOrder}:${limit}`;
  const cached = getCached<Asset[]>(cacheKey);
  if (cached) {
    return { success: true, data: cached };
  }

  // Use centralized DuckDB query
  const result = await getFactsheetAssets({ tracker, statusFilter, sortBy, sortOrder, limit });

  if (result.success && result.data) {
    // Map FactsheetAsset to Asset type
    const assets: Asset[] = result.data.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      capacity: row.capacity ?? undefined,
      capacityUnit: row.capacityUnit,
      country: row.country,
      state: row.state,
      owner: row.owner,
      tracker: row.tracker,
    }));
    setCache(cacheKey, assets);
    return { success: true, data: assets };
  }

  return {
    success: result.success,
    data: [],
    error: 'Query failed',
  };
}

/** Fetch all capacities for percentile calculation (cached) */
export async function fetchCapacities(
  tracker?: string | null
): Promise<{ global: number[]; byCountry: Map<string, number[]> }> {
  const cacheKey = `capacities:${tracker || 'all'}`;
  const cached = getCached<{ global: number[]; byCountry: Map<string, number[]> }>(cacheKey);
  if (cached) {
    return cached;
  }

  // Use centralized DuckDB query
  const result = await getCapacities(tracker);

  const global: number[] = [];
  const byCountry = new Map<string, number[]>();

  if (result.success && result.data) {
    for (const row of result.data) {
      if (row.capacity != null) {
        global.push(row.capacity);
        if (row.country) {
          const arr = byCountry.get(row.country) || [];
          arr.push(row.capacity);
          byCountry.set(row.country, arr);
        }
      }
    }
  }

  const data = { global, byCountry };
  setCache(cacheKey, data);
  return data;
}

/** Fetch field value distribution */
export async function fetchFieldStats(
  tracker: string,
  fieldName: string
): Promise<{ value: string | number | null; count: number }[]> {
  const cacheKey = `fieldStats:${tracker}:${fieldName}`;
  const cached = getCached<{ value: string | number | null; count: number }[]>(cacheKey);
  if (cached) {
    return cached;
  }

  // Use centralized DuckDB query
  const result = await getFieldStats(tracker, fieldName, 100);
  const data = result.data || [];
  setCache(cacheKey, data);
  return data;
}

/** Fetch row count for a tracker */
export async function fetchRowCount(tracker: string): Promise<number> {
  const cacheKey = `rowCount:${tracker}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  // Use centralized DuckDB query
  const count = await getTrackerRowCount(tracker);
  setCache(cacheKey, count);
  return count;
}

/** Clear the query cache */
export function clearQueryCache(): void {
  queryCache.clear();
}
