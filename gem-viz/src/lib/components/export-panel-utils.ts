/**
 * Export Panel utility functions
 * Extracted from ExportPanel.svelte to reduce file size
 */

import { query } from '$lib/duckdb-utils';
import { buildIdList } from '$lib/utils/sql';
import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';

export interface PreflightStats {
  ok: boolean;
  sql: {
    summary: string;
    topTrackers: string;
    topStatuses: string;
    topCountries: string;
  };
  summary: Record<string, unknown> | null;
  topTrackers: unknown[];
  topStatuses: unknown[];
  topCountries: unknown[];
}

export interface PreflightResult {
  generatedAt: string;
  ownershipSchema: unknown[] | null;
  locationsSchema: unknown[] | null;
  combined: PreflightStats;
  assets: PreflightStats | null;
  entities: PreflightStats | null;
}

export interface ExportManifest {
  kind: string;
  selection: { assets: string[]; entities: string[] };
  result: unknown;
  sql: { sql: string };
  app: {
    version: string;
    buildTime: string;
    buildHash: string;
  };
}

/**
 * Get current ISO timestamp
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Format number with locale formatting
 */
export function formatNumber(n: unknown): string {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : String(n ?? '');
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: unknown): string {
  const b = Number(bytes);
  if (!Number.isFinite(b)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = b;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  return `${value.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
}

/**
 * Escape a value for CSV format
 */
export function escapeCSVVal(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (/\n|\r|"|,/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Generate sparkline points from values
 */
export function sparklinePoints(values: number[]): string[] {
  const nums = values.map((v) => Number(v) || 0);
  const max = Math.max(...nums, 1);
  const normalized = nums.map((n) => n / max);
  return normalized.map((v, i) => {
    const x = (i / Math.max(1, normalized.length - 1)) * 80;
    const y = 18 - v * 18;
    return `${x},${y}`;
  });
}

/**
 * Build export manifest object
 */
export function buildExportManifest(
  kind: string,
  selection: { assets: string[]; entities: string[] },
  result: unknown,
  sql: { sql: string },
  app: { version: string; buildTime: string; buildHash: string }
): ExportManifest {
  return {
    kind,
    selection,
    result,
    sql,
    app,
  };
}

/**
 * Download file to browser
 */
export async function downloadFile(
  data: string,
  filename: string,
  mimeType: string
): Promise<void> {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Describe a table schema
 */
export async function describeTable(tableName: string): Promise<unknown[] | null> {
  const res = await query(`DESCRIBE SELECT * FROM ${tableName}`);
  if (!res.success) return null;
  return (res.data || []).map((row: Record<string, unknown>) => ({
    name: row.column_name,
    type: row.column_type,
    nullable: row.null ? String(row.null) : undefined,
  }));
}

/**
 * Get preflight statistics for a selection
 */
export async function getPreflightStats({
  assetIds = [],
  entityIds = [],
}: {
  assetIds?: string[];
  entityIds?: string[];
}): Promise<PreflightStats> {
  const whereParts: string[] = [];
  if (entityIds.length > 0)
    whereParts.push(`o."Owner GEM Entity ID" IN (${buildIdList(entityIds)})`);
  if (assetIds.length > 0)
    whereParts.push(`${ASSET_ID_COALESCE_O} IN (${buildIdList(assetIds)})`);
  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' OR ')}` : 'WHERE 1=0';

  const summarySql = `
    SELECT
      COUNT(*) as ownership_rows,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as distinct_assets,
      COUNT(DISTINCT o."Owner GEM Entity ID") as distinct_entities,
      COUNT(DISTINCT o."Tracker") as distinct_trackers,
      COUNT(DISTINCT o."Status") as distinct_statuses,
      COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as distinct_countries,
      COALESCE(SUM(CAST(o."Capacity (MW)" AS DOUBLE)), 0) as total_capacity_mw,
      SUM(CASE WHEN l."Latitude" IS NULL OR l."Longitude" IS NULL THEN 1 ELSE 0 END) as rows_missing_coords
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    ${whereClause}
  `;

  const topTrackersSql = `
    SELECT
      COALESCE(o."Tracker", 'Unknown') as key,
      COUNT(*) as rows
    FROM ownership o
    ${whereClause}
    GROUP BY 1
    ORDER BY rows DESC
    LIMIT 10
  `;

  const topStatusesSql = `
    SELECT
      COALESCE(o."Status", 'Unknown') as key,
      COUNT(*) as rows
    FROM ownership o
    ${whereClause}
    GROUP BY 1
    ORDER BY rows DESC
    LIMIT 10
  `;

  const topCountriesSql = `
    SELECT
      COALESCE(l."Country.Area", 'Unknown') as key,
      COUNT(*) as rows
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    ${whereClause}
    GROUP BY 1
    ORDER BY rows DESC
    LIMIT 10
  `;

  const [summary, topTrackers, topStatuses, topCountries] = await Promise.all([
    query(summarySql),
    query(topTrackersSql),
    query(topStatusesSql),
    query(topCountriesSql),
  ]);

  const summaryRow =
    summary.success && summary.data?.[0] ? (summary.data[0] as Record<string, unknown>) : null;
  return {
    ok: Boolean(summaryRow),
    sql: {
      summary: summarySql.trim(),
      topTrackers: topTrackersSql.trim(),
      topStatuses: topStatusesSql.trim(),
      topCountries: topCountriesSql.trim(),
    },
    summary: summaryRow,
    topTrackers: topTrackers.success ? topTrackers.data || [] : [],
    topStatuses: topStatuses.success ? topStatuses.data || [] : [],
    topCountries: topCountries.success ? topCountries.data || [] : [],
  };
}

/**
 * Run preflight analysis for export
 */
export async function runPreflight({
  assetIds,
  entityIds,
}: {
  assetIds: string[];
  entityIds: string[];
}): Promise<PreflightResult> {
  const [ownershipSchema, locationsSchema, combined, assets, entities] = await Promise.all([
    describeTable('ownership'),
    describeTable('locations'),
    getPreflightStats({ assetIds, entityIds }),
    assetIds.length ? getPreflightStats({ assetIds }) : Promise.resolve(null),
    entityIds.length ? getPreflightStats({ entityIds }) : Promise.resolve(null),
  ]);

  return {
    generatedAt: nowIso(),
    ownershipSchema,
    locationsSchema,
    combined,
    assets,
    entities,
  };
}

/**
 * Build SQL query for asset export
 */
export function buildAssetQuery(assetIds: string[]): string {
  return `
    SELECT
      o.*, l."Latitude", l."Longitude", l."Country.Area" as "Country"
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${ASSET_ID_COALESCE_O} IN (${buildIdList(assetIds)})
  `;
}

/**
 * Build SQL query for entity export
 */
export function buildEntityQuery(entityIds: string[]): string {
  return `
    SELECT
      o.*, l."Latitude", l."Longitude", l."Country.Area" as "Country"
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."Owner GEM Entity ID" IN (${buildIdList(entityIds)})
  `;
}

/**
 * Build SQL query for combined export
 */
export function buildCombinedQuery(assetIds: string[], entityIds: string[]): string {
  const whereClause = [
    assetIds.length ? `${ASSET_ID_COALESCE_O} IN (${buildIdList(assetIds)})` : null,
    entityIds.length ? `o."Owner GEM Entity ID" IN (${buildIdList(entityIds)})` : null,
  ]
    .filter(Boolean)
    .join(' OR ');

  return `
    SELECT
      o.*, l."Latitude", l."Longitude", l."Country.Area" as "Country"
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE ${whereClause}
  `;
}
