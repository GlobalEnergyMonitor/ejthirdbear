/**
 * Export Panel utility functions
 * Fetches asset/entity data via ownership-api.ts
 */

import { getAsset, getEntityGraphDown, type AssetSummary } from '$lib/ownership-api';
import { getStatusGroup, statusColors } from '$lib/design-tokens';
import { STATUS_GROUPS } from '$lib/data-config/tracker-schema';
import { formatCapacity } from '$lib/format';

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

export function nowIso(): string {
  return new Date().toISOString();
}

export function formatNumber(n: unknown): string {
  const num = Number(n);
  return Number.isFinite(num) ? num.toLocaleString() : String(n ?? '');
}

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

export function escapeCSVVal(val: unknown): string {
  if (val == null) return '';
  const s = String(val);
  if (/\n|\r|"|,/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function sparklinePoints(values: number[]): string {
  const nums = values.map((v) => Number(v) || 0);
  const max = Math.max(...nums, 1);
  const normalized = nums.map((n) => n / max);
  return normalized
    .map((v, i) => {
      const x = (i / Math.max(1, normalized.length - 1)) * 80;
      const y = 18 - v * 18;
      return `${x},${y}`;
    })
    .join(' ');
}

export function buildExportManifest(
  kind: string,
  selection: { assets: string[]; entities: string[] },
  result: unknown,
  sql: { sql: string },
  app: { version: string; buildTime: string; buildHash: string }
): ExportManifest {
  return { kind, selection, result, sql, app };
}

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

// Batch-fetch assets with concurrency limit
async function batchGetAssets(ids: string[], concurrency = 5): Promise<AssetSummary[]> {
  const results: AssetSummary[] = [];
  const unique = [...new Set(ids)];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((id) => getAsset(id)));
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value);
    }
  }

  return results;
}

// Resolve entity IDs to their terminal asset IDs via graph
async function resolveEntityAssetIds(entityIds: string[]): Promise<string[]> {
  const assetIds: string[] = [];
  const settled = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));

  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    const graph = result.value;
    const terminalSet = new Set(graph.terminalIds || []);
    for (const node of graph.nodes) {
      if (terminalSet.has(node.id) || node.is_terminal) {
        assetIds.push(node.id);
      }
    }
  }

  return assetIds;
}

// Build preflight stats from asset data
function buildPreflightFromAssets(assets: AssetSummary[]): PreflightStats {
  const trackerCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const entitySet = new Set<string>();
  let totalCapacity = 0;

  for (const asset of assets) {
    const tracker = asset.facilityType || 'Unknown';
    const status = asset.status || 'Unknown';
    const country = asset.country || 'Unknown';
    trackerCounts.set(tracker, (trackerCounts.get(tracker) || 0) + 1);
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
    totalCapacity += asset.capacity || 0;
    for (const o of asset.owners || []) {
      if (o.entityId) entitySet.add(o.entityId);
    }
  }

  const sortedEntries = (m: Map<string, number>) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, rows]) => ({ key, rows }));

  return {
    ok: true,
    sql: {
      summary: 'REST API',
      topTrackers: 'REST API',
      topStatuses: 'REST API',
      topCountries: 'REST API',
    },
    summary: {
      ownership_rows: assets.length,
      distinct_assets: assets.length,
      distinct_entities: entitySet.size,
      distinct_trackers: trackerCounts.size,
      distinct_statuses: statusCounts.size,
      distinct_countries: countryCounts.size,
      total_capacity_mw: Math.round(totalCapacity),
      rows_missing_coords: assets.filter((a) => a.latitude == null || a.longitude == null).length,
    },
    topTrackers: sortedEntries(trackerCounts),
    topStatuses: sortedEntries(statusCounts),
    topCountries: sortedEntries(countryCounts),
  };
}

export async function runPreflight({
  assetIds,
  entityIds,
}: {
  assetIds: string[];
  entityIds: string[];
}): Promise<PreflightResult> {
  // Resolve entity → asset IDs
  const entityAssetIds = entityIds.length > 0 ? await resolveEntityAssetIds(entityIds) : [];
  const allIds = [...new Set([...assetIds, ...entityAssetIds])];

  // Fetch asset details (sample for performance)
  const sampleIds = allIds.slice(0, 100);
  const allAssets = await batchGetAssets(sampleIds);

  const assetOnlyAssets =
    assetIds.length > 0 ? allAssets.filter((a) => assetIds.includes(a.id)) : [];
  const entityOnlyAssets =
    entityAssetIds.length > 0 ? allAssets.filter((a) => entityAssetIds.includes(a.id)) : [];

  return {
    generatedAt: nowIso(),
    ownershipSchema: null,
    locationsSchema: null,
    combined: buildPreflightFromAssets(allAssets),
    assets: assetIds.length ? buildPreflightFromAssets(assetOnlyAssets) : null,
    entities: entityIds.length ? buildPreflightFromAssets(entityOnlyAssets) : null,
  };
}

// ---------------------------------------------------------------------------
// Aggregation and briefing helpers
// ---------------------------------------------------------------------------

export interface StatusBreakdown {
  group: string;
  count: number;
  capacity: number;
}

export interface CountryBreakdown {
  country: string;
  count: number;
  capacity: number;
}

export interface TypeBreakdown {
  type: string;
  count: number;
  capacity: number;
}

export interface AggregatedStats {
  totalCapacity: number;
  statusBreakdown: StatusBreakdown[];
  countryBreakdown: CountryBreakdown[];
  typeBreakdown: TypeBreakdown[];
}

/**
 * Aggregate asset stats by status group, country, and type.
 * Status groups use getStatusGroup() from design-tokens.
 */
export function aggregateAssetStats(assets: AssetSummary[]): AggregatedStats {
  let totalCapacity = 0;
  const statusMap = new Map<string, { count: number; capacity: number }>();
  const countryMap = new Map<string, { count: number; capacity: number }>();
  const typeMap = new Map<string, { count: number; capacity: number }>();

  for (const asset of assets) {
    const cap = asset.capacity || 0;
    totalCapacity += cap;

    const group = getStatusGroup(asset.status ?? undefined);
    const existing = statusMap.get(group) || { count: 0, capacity: 0 };
    statusMap.set(group, { count: existing.count + 1, capacity: existing.capacity + cap });

    const country = asset.country || 'Unknown';
    const cEntry = countryMap.get(country) || { count: 0, capacity: 0 };
    countryMap.set(country, { count: cEntry.count + 1, capacity: cEntry.capacity + cap });

    const type = asset.facilityType || 'Unknown';
    const tEntry = typeMap.get(type) || { count: 0, capacity: 0 };
    typeMap.set(type, { count: tEntry.count + 1, capacity: tEntry.capacity + cap });
  }

  // Sort statuses by canonical group order
  const statusOrder = [...STATUS_GROUPS.map((g) => g.id), 'unknown'];
  const statusBreakdown = statusOrder
    .filter((g) => statusMap.has(g))
    .map((g) => ({ group: g, ...statusMap.get(g)! }));

  const countryBreakdown = [...countryMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([country, v]) => ({ country, ...v }));

  const typeBreakdown = [...typeMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([type, v]) => ({ type, ...v }));

  return { totalCapacity, statusBreakdown, countryBreakdown, typeBreakdown };
}

/**
 * Generate a plain-text briefing paragraph suitable for copy-paste into articles or policy docs.
 */
export function generateBriefing(
  assets: AssetSummary[],
  owners: { name: string }[],
  assetClassName: string
): string {
  if (assets.length === 0) return 'No assets to summarize.';

  const stats = aggregateAssetStats(assets);

  // Owner names (up to 3, then "and N others")
  const ownerNames = owners.map((o) => o.name).filter(Boolean);
  let ownerStr: string;
  if (ownerNames.length <= 3) {
    ownerStr = ownerNames.join(', ');
  } else {
    ownerStr = `${ownerNames.slice(0, 3).join(', ')} and ${ownerNames.length - 3} others`;
  }

  const countryCount = stats.countryBreakdown.length;
  const assetLabel = assetClassName ? `${assetClassName.toLowerCase()}s` : 'assets';

  // Status parts
  const parts: string[] = [];
  const operating = stats.statusBreakdown.find((s) => s.group === 'operating');
  if (operating) {
    const capStr = formatCapacity(operating.capacity);
    parts.push(`${operating.count} are currently operating${capStr ? ` (${capStr})` : ''}`);
  }
  const retired = stats.statusBreakdown.find((s) => s.group === 'retired');
  if (retired) parts.push(`${retired.count} are retired`);
  const planned = stats.statusBreakdown.find((s) => s.group === 'planned');
  if (planned) parts.push(`${planned.count} are proposed or under development`);
  const cancelled = stats.statusBreakdown.find((s) => s.group === 'cancelled');
  if (cancelled) parts.push(`${cancelled.count} are cancelled`);

  const statusStr = parts.length > 0 ? ` ${parts.join(', ')}.` : '';

  // Top country
  const topCountry = stats.countryBreakdown[0];
  const countryStr = topCountry
    ? ` The largest concentration is in ${topCountry.country} (${topCountry.count} assets).`
    : '';

  const dateStr = new Date().toISOString().split('T')[0];

  return `${ownerStr} collectively hold${owners.length === 1 ? 's' : ''} stakes in ${assets.length} ${assetLabel} across ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}.${statusStr}${countryStr} Data: Global Energy Monitor, ${dateStr}.`;
}

// ---------------------------------------------------------------------------
// Synchronous export helpers (for screener inline export)
// ---------------------------------------------------------------------------

const ASSET_CSV_COLUMNS = [
  'asset_id',
  'asset_name',
  'asset_type',
  'status',
  'country',
  'latitude',
  'longitude',
  'capacity',
  'capacity_unit',
  'owner_name',
  'owner_entity_id',
  'ownership_share',
];

/**
 * Convert an array of AssetSummary objects to a CSV string.
 * One row per asset-owner relationship (denormalized).
 */
export function assetsToCSV(assets: AssetSummary[]): string {
  const lines: string[] = [ASSET_CSV_COLUMNS.map(escapeCSVVal).join(',')];

  for (const asset of assets) {
    const owners = asset.owners || [];
    if (owners.length === 0) {
      lines.push(
        [
          asset.id,
          asset.name,
          asset.facilityType || '',
          asset.status || '',
          asset.country || '',
          String(asset.latitude ?? ''),
          String(asset.longitude ?? ''),
          String(asset.capacity ?? ''),
          asset.capacityUnit || '',
          asset.ownerName || '',
          asset.ownerEntityId || '',
          '',
        ]
          .map(escapeCSVVal)
          .join(',')
      );
    } else {
      for (const o of owners) {
        lines.push(
          [
            asset.id,
            asset.name,
            asset.facilityType || '',
            asset.status || '',
            asset.country || '',
            String(asset.latitude ?? ''),
            String(asset.longitude ?? ''),
            String(asset.capacity ?? ''),
            asset.capacityUnit || '',
            o.name,
            o.entityId,
            String(o.ownershipShare ?? ''),
          ]
            .map(escapeCSVVal)
            .join(',')
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Convert assets with coordinates to a GeoJSON FeatureCollection string.
 * Assets without lat/lon are skipped.
 */
export function assetsToGeoJSON(assets: AssetSummary[]): string {
  const features = assets
    .filter((a) => a.latitude != null && a.longitude != null)
    .map((a) => ({
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [a.longitude!, a.latitude!],
      },
      properties: {
        asset_id: a.id,
        name: a.name,
        asset_type: a.facilityType || null,
        status: a.status || null,
        country: a.country || null,
        capacity: a.capacity ?? null,
        capacity_unit: a.capacityUnit || null,
        owners: (a.owners || []).map((o) => ({
          name: o.name,
          entity_id: o.entityId,
          ownership_share: o.ownershipShare ?? null,
        })),
      },
    }));

  return JSON.stringify({ type: 'FeatureCollection', features }, null, 2);
}

/**
 * Extract and serialize an SVG element from a container, inlining key styles.
 * Returns SVG string or null if no SVG found.
 */
export function serializeSVG(container: HTMLElement): string | null {
  const svg = container.querySelector('svg');
  if (!svg) return null;

  const clone = svg.cloneNode(true) as SVGElement;

  // Inline key computed styles on all elements for portability
  const stylesToCopy = ['fill', 'stroke', 'stroke-width', 'font-size', 'font-family', 'opacity'];
  const origElements = svg.querySelectorAll('*');
  const cloneElements = clone.querySelectorAll('*');

  for (let i = 0; i < origElements.length; i++) {
    const computed = window.getComputedStyle(origElements[i]);
    const cloneEl = cloneElements[i] as SVGElement;
    for (const prop of stylesToCopy) {
      const val = computed.getPropertyValue(prop);
      if (val) cloneEl.style.setProperty(prop, val);
    }
  }

  // Ensure xmlns
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return new XMLSerializer().serializeToString(clone);
}

// CSV column definitions for export
const CSV_COLUMNS = [
  'asset_id',
  'asset_name',
  'asset_type',
  'status',
  'country',
  'latitude',
  'longitude',
  'capacity',
  'capacity_unit',
  'owner_name',
  'owner_entity_id',
  'ownership_share',
];

function assetToCSVRows(asset: AssetSummary): string[][] {
  const owners = asset.owners || [];
  if (owners.length === 0) {
    return [
      [
        asset.id,
        asset.name,
        asset.facilityType || '',
        asset.status || '',
        asset.country || '',
        String(asset.latitude ?? ''),
        String(asset.longitude ?? ''),
        String(asset.capacity ?? ''),
        asset.capacityUnit || '',
        asset.ownerName || '',
        asset.ownerEntityId || '',
        '',
      ],
    ];
  }
  return owners.map((o) => [
    asset.id,
    asset.name,
    asset.facilityType || '',
    asset.status || '',
    asset.country || '',
    String(asset.latitude ?? ''),
    String(asset.longitude ?? ''),
    String(asset.capacity ?? ''),
    asset.capacityUnit || '',
    o.name,
    o.entityId,
    String(o.ownershipShare ?? ''),
  ]);
}

/**
 * Fetch and format assets as CSV string
 */
export async function fetchAssetsAsCSV(
  assetIds: string[],
  onProgress?: (_msg: string) => void
): Promise<{ csv: string; rowCount: number }> {
  onProgress?.(`Fetching ${assetIds.length} assets...`);
  const assets = await batchGetAssets(assetIds);

  onProgress?.('Formatting CSV...');
  const lines: string[] = [CSV_COLUMNS.map(escapeCSVVal).join(',')];
  let rowCount = 0;

  for (const asset of assets) {
    for (const row of assetToCSVRows(asset)) {
      lines.push(row.map(escapeCSVVal).join(','));
      rowCount++;
    }
  }

  return { csv: lines.join('\n'), rowCount };
}

/**
 * Fetch entity portfolio assets and format as CSV
 */
export async function fetchEntityAssetsAsCSV(
  entityIds: string[],
  onProgress?: (_msg: string) => void
): Promise<{ csv: string; rowCount: number }> {
  onProgress?.(`Resolving ${entityIds.length} entity portfolios...`);
  const assetIds = await resolveEntityAssetIds(entityIds);
  onProgress?.(`Found ${assetIds.length} assets, fetching details...`);
  return fetchAssetsAsCSV(assetIds, onProgress);
}

/**
 * Fetch combined (asset + entity) data as CSV
 */
export async function fetchCombinedCSV(
  assetIds: string[],
  entityIds: string[],
  onProgress?: (_msg: string) => void
): Promise<{ csv: string; rowCount: number }> {
  const entityAssetIds = entityIds.length > 0 ? await resolveEntityAssetIds(entityIds) : [];
  const allIds = [...new Set([...assetIds, ...entityAssetIds])];
  onProgress?.(`Fetching ${allIds.length} total assets...`);
  return fetchAssetsAsCSV(allIds, onProgress);
}
