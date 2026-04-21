/**
 * Analytics & breakdown tool handlers.
 */

import { listAssets, resolveApiSlug } from '$lib/ownership-api';
import { API_TYPE_TO_SLUG } from '$lib/data-config/tracker-schema';
import { fetchAssetClasses } from '$lib/api/catalog-api';
import {
  API_BASE,
  fetchApiJson,
  clampLimit,
  type ToolArgs,
  type ToolResult,
  type ToolHandler,
} from './tool-utils';

type OwnerAgg = { name: string; entityId: string; assetCount: number; capacity: number };

/**
 * Page through the /assets endpoint and aggregate owners. Used by both
 * get_top_owners and get_top_owners_by_country so pagination is consistent.
 * Stops when either the full filter set is scanned or maxAssets is reached.
 */
async function aggregateOwnersPaged(params: {
  asset_type?: string;
  asset_class?: string;
  country?: string;
  status?: string;
  maxAssets?: number;
}): Promise<{ ownerMap: Map<string, OwnerAgg>; totalScanned: number; totalAvailable: number }> {
  const BATCH = 500;
  const maxAssets = params.maxAssets ?? 3000;
  const ownerMap = new Map<string, OwnerAgg>();
  let totalScanned = 0;
  let totalAvailable = 0;

  let offset = 0;
  while (offset < maxAssets) {
    const page = await listAssets({
      limit: BATCH,
      offset,
      asset_type: params.asset_type,
      asset_class: params.asset_class,
      country: params.country,
      status: params.status,
    });
    totalAvailable = page.total;
    for (const asset of page.results) {
      if (asset.owners && asset.owners.length > 0) {
        for (const owner of asset.owners) {
          if (!owner.entityId) continue;
          const existing = ownerMap.get(owner.entityId);
          if (existing) {
            existing.assetCount++;
            existing.capacity += asset.capacity || 0;
          } else {
            ownerMap.set(owner.entityId, {
              name: owner.name,
              entityId: owner.entityId,
              assetCount: 1,
              capacity: asset.capacity || 0,
            });
          }
        }
      } else if (asset.ownerName) {
        const key = asset.ownerEntityId || asset.ownerName;
        const existing = ownerMap.get(key);
        if (existing) {
          existing.assetCount++;
          existing.capacity += asset.capacity || 0;
        } else {
          ownerMap.set(key, {
            name: asset.ownerName,
            entityId: asset.ownerEntityId || '',
            assetCount: 1,
            capacity: asset.capacity || 0,
          });
        }
      }
    }
    totalScanned += page.results.length;
    offset += BATCH;
    if (page.results.length < BATCH) break;
  }

  return { ownerMap, totalScanned, totalAvailable };
}

async function getTopOwners(args: ToolArgs): Promise<ToolResult> {
  const tracker = args.tracker as string | null;
  const assetClass = args.asset_class as string | undefined;
  const limit = clampLimit(args.limit, 10, 50);
  const metric = (args.metric as string) === 'capacity' ? 'capacity' : 'assets';
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const { ownerMap, totalScanned, totalAvailable } = await aggregateOwnersPaged({
    asset_type: slug ?? undefined,
    asset_class: assetClass,
    maxAssets: 3000,
  });

  const sorted = [...ownerMap.values()]
    .sort((a, b) => (metric === 'capacity' ? b.capacity - a.capacity : b.assetCount - a.assetCount))
    .slice(0, limit);

  return {
    success: true,
    data: {
      metric,
      tracker: tracker || 'all',
      asset_class: assetClass,
      sampled: totalScanned,
      totalAvailable,
      owners: sorted.map((o) => ({
        name: o.name,
        entityId: o.entityId,
        value: metric === 'capacity' ? o.capacity : o.assetCount,
        assetCount: o.assetCount,
      })),
      note:
        totalScanned < totalAvailable
          ? `Based on ${totalScanned.toLocaleString()} of ${totalAvailable.toLocaleString()} assets (sampled for speed; raise maxAssets to deepen)`
          : undefined,
    },
  };
}

async function getTopOwnersByCountry(args: ToolArgs): Promise<ToolResult> {
  const country = args.country as string;
  const tracker = args.tracker as string | undefined;
  const assetClass = args.asset_class as string | undefined;
  const status = args.status as string | undefined;
  const limit = clampLimit(args.limit, 10, 50);
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const { ownerMap, totalScanned, totalAvailable } = await aggregateOwnersPaged({
    country,
    asset_type: slug ?? undefined,
    asset_class: assetClass,
    status: status?.toLowerCase(),
    maxAssets: 3000,
  });

  if (ownerMap.size === 0) {
    return {
      success: true,
      data: {
        country,
        tracker: tracker || 'all',
        asset_class: assetClass,
        owners: [],
        message: `No assets found in ${country}${tracker ? ` for ${tracker}` : ''}`,
      },
    };
  }

  const sortedOwners = [...ownerMap.values()]
    .sort((a, b) => b.assetCount - a.assetCount)
    .slice(0, limit);

  return {
    success: true,
    data: {
      country,
      tracker: tracker || 'all',
      asset_class: assetClass,
      totalAssetsScanned: totalScanned,
      totalAssetsAvailable: totalAvailable,
      owners: sortedOwners.map((o) => ({
        name: o.name,
        entityId: o.entityId,
        assetCount: o.assetCount,
      })),
      note:
        totalScanned < totalAvailable
          ? `Based on ${totalScanned.toLocaleString()} of ${totalAvailable.toLocaleString()} assets in ${country} (sampled for speed)`
          : undefined,
    },
  };
}

/**
 * List the catalog-defined asset classes (e.g. "captive-power-data-centers",
 * "coal-mines-by-use"). These are multi-tracker or sub-tracker groupings that
 * power the screener. Useful when a user asks about a "type" of asset that
 * doesn't map cleanly to a single tracker.
 */
async function listAssetClasses(args: ToolArgs): Promise<ToolResult> {
  const query = (args.query as string | undefined)?.toLowerCase().trim();
  const classes = await fetchAssetClasses();
  const filtered = query
    ? classes.filter(
        (c) =>
          c.id.toLowerCase().includes(query) ||
          c.label.toLowerCase().includes(query) ||
          (c.description || '').toLowerCase().includes(query) ||
          (c.category || '').toLowerCase().includes(query)
      )
    : classes;

  return {
    success: true,
    data: {
      total: classes.length,
      matched: filtered.length,
      classes: filtered.map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        category: c.category,
        url: c.url,
      })),
      note: 'Pass the `id` field to get_top_owners / get_top_owners_by_country / search_assets as `asset_class` to filter by this class.',
    },
  };
}

async function getCountryBreakdown(args: ToolArgs): Promise<ToolResult> {
  const tracker = args.tracker as string | null;
  const status = args.status as string | undefined;
  const limit = clampLimit(args.limit, 15, 200);
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const sp = new URLSearchParams();
  if (slug) sp.set('asset_type', slug);
  if (status) sp.set('status', status.toLowerCase());
  sp.set('facets', 'true');
  sp.set('limit', '1');
  sp.set('format', 'json');

  const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
  const facets = raw.facets as Record<string, Record<string, number>> | undefined;
  const countryFacets = facets?.country || {};
  const countries = Object.entries(countryFacets)
    .map(([country, assetCount]) => ({ country, assetCount }))
    .sort((a, b) => b.assetCount - a.assetCount)
    .slice(0, limit);
  return {
    success: true,
    data: {
      tracker: tracker || 'all',
      status: status || 'all',
      total: raw.total,
      countries,
    },
  };
}

async function getStatusBreakdown(args: ToolArgs): Promise<ToolResult> {
  const tracker = args.tracker as string | null;
  const country = args.country as string | undefined;
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const sp = new URLSearchParams();
  if (slug) sp.set('asset_type', slug);
  if (country) sp.set('country', country);
  sp.set('facets', 'true');
  sp.set('limit', '1');
  sp.set('format', 'json');

  const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
  const facets = raw.facets as Record<string, Record<string, number>> | undefined;
  const statusFacets = facets?.status || {};
  return {
    success: true,
    data: {
      tracker: tracker || 'all',
      country: country || 'all',
      total: raw.total,
      statuses: Object.entries(statusFacets)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}

async function getTrackerSummary(args: ToolArgs): Promise<ToolResult> {
  void args; // unused but kept for handler signature consistency
  const baseRaw = await fetchApiJson(`${API_BASE}/assets?facets=true&limit=1&format=json`);
  const baseFacets = baseRaw.facets as Record<string, Record<string, number>> | undefined;
  const typeFacets = baseFacets?.asset_type || {};
  const statusFacets = baseFacets?.status || {};

  const topTypes = Object.entries(typeFacets)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4);

  const perTypeStatus = await Promise.all(
    topTypes.map(async ([typeName]) => {
      const slug = API_TYPE_TO_SLUG[typeName];
      if (!slug) return { typeName, statuses: {} };
      const raw = await fetchApiJson(
        `${API_BASE}/assets?facets=true&limit=1&asset_type=${encodeURIComponent(slug)}&format=json`
      );
      const f = raw.facets as Record<string, Record<string, number>> | undefined;
      return { typeName, statuses: f?.status || {} };
    })
  );

  const trackers = Object.entries(typeFacets).map(([tracker, count]) => {
    const typeStatus = perTypeStatus.find((t) => t.typeName === tracker);
    return {
      tracker,
      totalAssets: count,
      operating: (typeStatus?.statuses as Record<string, number>)?.['operating'] || 0,
      retired: (typeStatus?.statuses as Record<string, number>)?.['retired'] || 0,
      proposed:
        ((typeStatus?.statuses as Record<string, number>)?.['proposed'] || 0) +
        ((typeStatus?.statuses as Record<string, number>)?.['announced'] || 0) +
        ((typeStatus?.statuses as Record<string, number>)?.['construction'] || 0),
    };
  });

  return {
    success: true,
    data: {
      trackers,
      totalAssets: baseRaw.total,
      statusSummary: statusFacets,
    },
  };
}

export const analyticsHandlers: Record<string, ToolHandler> = {
  get_top_owners: getTopOwners,
  get_top_owners_by_country: getTopOwnersByCountry,
  get_country_breakdown: getCountryBreakdown,
  get_status_breakdown: getStatusBreakdown,
  get_tracker_summary: getTrackerSummary,
  list_asset_classes: listAssetClasses,
};
