/**
 * Query helpers for factsheet components
 * Uses REST API (gem-api.thirdbear.net) exclusively.
 */

import { listAssetsByType, resolveApiAssetType, type AssetSummary } from '$lib/ownership-api';
import { trackerNameToSlug } from '$lib/data-config/tracker-metadata';
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

/** Map REST API AssetSummary to factsheet Asset type */
function assetSummaryToAsset(a: AssetSummary): Asset {
  const raw = a.raw || {};
  // Fall back to owners[] array when top-level ownerName/parentName aren't set
  const primaryOwner = a.owners?.[0];
  return {
    id: a.id,
    name: a.name,
    status: a.status || '',
    capacity: a.capacity ?? undefined,
    capacityUnit: a.capacityUnit ?? undefined,
    country: a.country ?? undefined,
    lat: a.latitude ?? undefined,
    lon: a.longitude ?? undefined,
    owner: a.ownerName ?? primaryOwner?.name ?? undefined,
    ownershipShare: primaryOwner?.ownershipShare ?? undefined,
    parent: a.parentName ?? undefined,
    tracker: a.facilityType ?? undefined,
    // Extract additional fields from raw API data when available
    startYear: toNum(raw['Start year'] ?? raw['start_year']),
    technology: toStr(raw['Technology'] ?? raw['technology']),
    mineType: toStr(raw['Mine type'] ?? raw['mine_type']),
    miningMethod: toStr(raw['Mining method'] ?? raw['mining_method']),
    state: toStr(
      raw['Subnational unit (province, state)'] ??
        raw['State'] ??
        raw['state'] ??
        raw['state_province']
    ),
    wikiUrl: toStr(raw['Wiki URL'] ?? raw['wiki_url']),
    unitName: toStr(raw['Unit Name'] ?? raw['unit_name']),
    database: toStr(raw['Database'] ?? raw['database'] ?? raw['source_file']),
    coalType: toStr(raw['Coal type'] ?? raw['coal_type']),
    plannedRetirement: toNum(raw['Planned retirement'] ?? raw['planned_retirement']),
    capacityFactor: toNum(raw['Capacity factor'] ?? raw['capacity_factor']),
    annualCO2: toNum(raw['Annual CO2 (million tonnes / annum)'] ?? raw['annual_co2']),
    lifetimeCO2: toNum(raw['Lifetime CO2 (million tonnes)'] ?? raw['lifetime_co2']),
    heatRate: toNum(raw['Heat rate (Btu per kWh)'] ?? raw['heat_rate']),
    remainingLifetime: toNum(raw['Remaining lifetime (years)'] ?? raw['remaining_lifetime']),
    plantAge: toNum(raw['Plant age (years)'] ?? raw['plant_age']),
    production: toNum(raw['Production'] ?? raw['production']),
    productionUnit: toStr(raw['Production unit'] ?? raw['production_unit']),
    location: toStr(raw['Location'] ?? raw['location']),
    raw,
  };
}

/** Map granular status filters to the API's aggregated status value.
 *  API supports single values: "operating", "retired", "planned".
 *  Returns undefined if statuses don't map cleanly (fall back to client-side filtering). */
function resolveApiStatus(statuses: string[]): string | undefined {
  const planned = new Set([
    'announced',
    'proposed',
    'pre-permit',
    'permitted',
    'pre-construction',
    'construction',
  ]);
  const operating = new Set(['operating', 'operating pre-retirement']);
  const retired = new Set(['retired', 'mothballed', 'idle', 'mothballed pre-retirement']);

  const lower = statuses.map((s) => s.toLowerCase());
  if (lower.every((s) => planned.has(s))) return 'planned';
  if (lower.every((s) => operating.has(s))) return 'operating';
  if (lower.every((s) => retired.has(s))) return 'retired';
  return undefined;
}

function toStr(v: unknown): string | undefined {
  return v != null && v !== '' ? String(v) : undefined;
}

function toNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return isNaN(n) ? undefined : n;
}

/** Sort comparator for assets */
function assetComparator(sortBy: string, sortOrder: string) {
  const dir = sortOrder === 'asc' ? 1 : -1;
  return (a: Asset, b: Asset) => {
    let va: number | string, vb: number | string;
    switch (sortBy) {
      case 'capacity':
        va = a.capacity ?? 0;
        vb = b.capacity ?? 0;
        break;
      case 'age':
        va = a.startYear ?? 9999;
        vb = b.startYear ?? 9999;
        break;
      case 'name':
        va = a.name.toLowerCase();
        vb = b.name.toLowerCase();
        break;
      default:
        va = a.capacity ?? 0;
        vb = b.capacity ?? 0;
    }
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  };
}

/** Fetch assets via REST API with filtering and client-side sorting */
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

  try {
    // Convert tracker name to API slug (e.g. "Coal Plant" → "coal-plant")
    const assetType = tracker
      ? trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-')
      : undefined;

    // Map granular status filters to API aggregated status for server-side filtering
    // API supports: "operating", "retired", "planned"
    const apiStatus = statusFilter?.length ? resolveApiStatus(statusFilter) : undefined;

    // Fetch with type filtering; use API status filter when available for better results
    const fetchLimit = Math.max(limit * 5, 200);
    const results = assetType
      ? await listAssetsByType(assetType, { limit: fetchLimit, status: apiStatus })
      : (await import('$lib/ownership-api').then((m) => m.listAssets({ limit: fetchLimit })))
          .results;

    let assets = results.map(assetSummaryToAsset);

    // Client-side status filtering
    // When API already filtered by aggregated status, include that status in match set
    // (API returns "planned"/"operating"/"retired" instead of granular values)
    if (statusFilter && statusFilter.length > 0) {
      const statusSet = new Set(statusFilter.map((s) => s.toLowerCase()));
      if (apiStatus) statusSet.add(apiStatus);
      assets = assets.filter((a) => statusSet.has((a.status || '').toLowerCase()));
    }

    // Client-side sorting
    assets.sort(assetComparator(sortBy, sortOrder));

    // Limit results
    assets = assets.slice(0, limit);

    setCache(cacheKey, assets);
    return { success: true, data: assets };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'API request failed';
    if (import.meta.env.DEV) console.error('[fetchAssets] REST API error:', msg);
    return { success: false, data: [], error: msg };
  }
}

/** Fetch all capacities for percentile calculation via REST API */
export async function fetchCapacities(
  tracker?: string | null
): Promise<{ global: number[]; byCountry: Map<string, number[]> }> {
  const cacheKey = `capacities:${tracker || 'all'}`;
  const cached = getCached<{ global: number[]; byCountry: Map<string, number[]> }>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const assetType = tracker
      ? trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-')
      : undefined;

    // Fetch with proper type filtering for percentile distribution
    const results = assetType
      ? await listAssetsByType(assetType, { limit: 5000 })
      : (await import('$lib/ownership-api').then((m) => m.listAssets({ limit: 500 }))).results;

    const global: number[] = [];
    const byCountry = new Map<string, number[]>();

    for (const a of results) {
      if (a.capacity != null) {
        global.push(a.capacity);
        if (a.country) {
          const arr = byCountry.get(a.country) || [];
          arr.push(a.capacity);
          byCountry.set(a.country, arr);
        }
      }
    }

    const data = { global, byCountry };
    setCache(cacheKey, data);
    return data;
  } catch (err) {
    if (import.meta.env.DEV) console.error('[fetchCapacities] REST API error:', err);
    return { global: [], byCountry: new Map() };
  }
}

/** Fetch field value distribution via REST API with client-side aggregation */
export async function fetchFieldStats(
  tracker: string,
  fieldName: string
): Promise<{ value: string | number | null; count: number }[]> {
  const cacheKey = `fieldStats:${tracker}:${fieldName}`;
  const cached = getCached<{ value: string | number | null; count: number }[]>(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const slug = trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-');
    const assets = await listAssetsByType(slug, { limit: 2000 });

    // Count occurrences of each value for this field
    const counts = new Map<string, number>();
    for (const asset of assets) {
      const raw = asset.raw || {};
      const value = raw[fieldName] ?? raw[fieldName.toLowerCase()] ?? null;
      const strValue = value != null && value !== '' ? String(value) : null;
      if (strValue) {
        counts.set(strValue, (counts.get(strValue) || 0) + 1);
      }
    }

    // Sort by count descending, take top 100
    const data = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([value, count]) => ({ value, count }));

    setCache(cacheKey, data);
    return data;
  } catch (err) {
    if (import.meta.env.DEV)
      console.warn(`[fetchFieldStats] Failed for ${tracker}/${fieldName}:`, err);
    return [];
  }
}

/** Fetch row count for a tracker via REST API */
export async function fetchRowCount(tracker: string): Promise<number> {
  const cacheKey = `rowCount:${tracker}`;
  const cached = getCached<number>(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    // Use getAssetTypeCounts for an estimated count
    const { getAssetTypeCounts } = await import('$lib/ownership-api');
    const apiType = resolveApiAssetType(tracker);
    const counts = await getAssetTypeCounts();
    const count = counts.get(apiType) || 0;
    setCache(cacheKey, count);
    return count;
  } catch (err) {
    if (import.meta.env.DEV) console.warn(`[fetchRowCount] Failed for ${tracker}:`, err);
    return 0;
  }
}

/** Clear the query cache */
export function clearQueryCache(): void {
  queryCache.clear();
}
