/**
 * Optimized query helpers for factsheet components
 * Provides parameterized queries and result caching
 */

import { widgetQuery } from '$lib/widgets/widget-utils';
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

/** Escape string for SQL (prevent injection) */
function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

/** Build WHERE clause from filters */
function buildWhereClause(tracker?: string | null, statusFilter?: string[] | null): string {
  const conditions: string[] = [];

  if (tracker) {
    conditions.push(`"Tracker" = '${escapeSQL(tracker)}'`);
  }

  if (statusFilter && statusFilter.length > 0) {
    const escaped = statusFilter.map((s) => `'${escapeSQL(s.toLowerCase())}'`).join(', ');
    conditions.push(`LOWER("Status") IN (${escaped})`);
  }

  return conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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

  const whereClause = buildWhereClause(tracker, statusFilter);

  // Determine sort column based on sortBy
  const sortColumns: Record<string, string> = {
    capacity: 'COALESCE("Capacity (MW)", "Capacity (Mtpa)")',
    age: '"Start year"',
    name: '"Project"',
  };
  const sortCol = sortColumns[sortBy] || sortColumns.capacity;
  const orderDir = sortOrder === 'asc' ? 'ASC' : 'DESC';

  const query = `
    SELECT DISTINCT
      COALESCE("GEM unit ID", "GEM Mine ID", "GEM Asset ID") as id,
      "Project" as name,
      "Status" as status,
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      CASE WHEN "Capacity (Mtpa)" IS NOT NULL THEN 'Mtpa' ELSE 'MW' END as capacityUnit,
      "Country" as country,
      "State" as state,
      "Owner" as owner,
      "Tracker" as tracker
    FROM ownership
    ${whereClause}
    ORDER BY ${sortCol} ${orderDir} NULLS LAST
    LIMIT ${limit}
  `;

  const result = await widgetQuery<Asset>(query);

  if (result.success && result.data) {
    setCache(cacheKey, result.data);
  }

  return {
    success: result.success,
    data: result.data || [],
    error: result.error,
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

  const whereClause = tracker
    ? `WHERE "Tracker" = '${escapeSQL(tracker)}' AND COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`
    : `WHERE COALESCE("Capacity (MW)", "Capacity (Mtpa)") IS NOT NULL`;

  const result = await widgetQuery<{ capacity: number; country: string }>(`
    SELECT DISTINCT
      COALESCE("Capacity (MW)", "Capacity (Mtpa)") as capacity,
      "Country" as country
    FROM ownership
    ${whereClause}
  `);

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

  const result = await widgetQuery<{ value: string | number | null; count: number }>(`
    SELECT
      "${escapeSQL(fieldName)}" as value,
      COUNT(*) as count
    FROM ownership
    WHERE "Tracker" = '${escapeSQL(tracker)}'
    GROUP BY "${escapeSQL(fieldName)}"
    ORDER BY count DESC
    LIMIT 100
  `);

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

  const result = await widgetQuery<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM ownership
    WHERE "Tracker" = '${escapeSQL(tracker)}'
  `);

  const count = result.data?.[0]?.count || 0;
  setCache(cacheKey, count);
  return count;
}

/** Clear the query cache */
export function clearQueryCache(): void {
  queryCache.clear();
}
