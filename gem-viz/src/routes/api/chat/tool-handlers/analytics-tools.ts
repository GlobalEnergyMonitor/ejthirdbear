/**
 * Analytics & breakdown tool handlers.
 */

import { listAssets, resolveApiSlug } from '$lib/ownership-api';
import {
  API_BASE,
  fetchApiJson,
  clampLimit,
  type ToolArgs,
  type ToolResult,
  type ToolHandler,
} from './tool-utils';

async function getTopOwners(args: ToolArgs): Promise<ToolResult> {
  const tracker = args.tracker as string | null;
  const limit = clampLimit(args.limit, 10, 50);
  const metric = (args.metric as string) === 'capacity' ? 'capacity' : 'assets';
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const MAX_ASSETS = 2000;
  const BATCH = 500;
  const ownerMap = new Map<
    string,
    { name: string; entityId: string; assetCount: number; capacity: number }
  >();
  let totalScanned = 0;
  let totalAvailable = 0;

  let offset = 0;
  while (offset < MAX_ASSETS) {
    const page = await listAssets({
      limit: BATCH,
      offset,
      asset_type: slug ?? undefined,
    });
    totalAvailable = page.total;
    for (const asset of page.results) {
      if (asset.owners) {
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
      }
    }
    totalScanned += page.results.length;
    offset += BATCH;
    if (page.results.length < BATCH) break;
  }

  const sorted = [...ownerMap.values()]
    .sort((a, b) =>
      metric === 'capacity' ? b.capacity - a.capacity : b.assetCount - a.assetCount
    )
    .slice(0, limit);

  return {
    success: true,
    data: {
      metric,
      tracker: tracker || 'all',
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
          ? `Based on ${totalScanned.toLocaleString()} of ${totalAvailable.toLocaleString()} assets (sampled for speed)`
          : undefined,
    },
  };
}

async function getTopOwnersByCountry(args: ToolArgs): Promise<ToolResult> {
  const country = args.country as string;
  const tracker = args.tracker as string | undefined;
  const status = args.status as string | undefined;
  const limit = clampLimit(args.limit, 10, 50);
  const slug = tracker ? resolveApiSlug(tracker) : null;

  const assetsResult = await listAssets({
    country: country,
    asset_type: slug ?? undefined,
    status: status?.toLowerCase(),
    limit: 500,
  });

  if (assetsResult.count === 0) {
    return {
      success: true,
      data: {
        country,
        tracker: tracker || 'all',
        owners: [],
        message: `No assets found in ${country}${tracker ? ` for ${tracker}` : ''}`,
      },
    };
  }

  const ownerCounts = new Map<string, { name: string; count: number; entityId: string }>();
  for (const asset of assetsResult.results) {
    if (asset.owners && asset.owners.length > 0) {
      for (const owner of asset.owners) {
        if (!owner.entityId) continue;
        const existing = ownerCounts.get(owner.entityId);
        if (existing) {
          existing.count++;
        } else {
          ownerCounts.set(owner.entityId, {
            name: owner.name,
            count: 1,
            entityId: owner.entityId,
          });
        }
      }
    } else if (asset.ownerName) {
      const key = asset.ownerEntityId || asset.ownerName;
      const existing = ownerCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        ownerCounts.set(key, {
          name: asset.ownerName,
          count: 1,
          entityId: asset.ownerEntityId || '',
        });
      }
    }
  }

  const sortedOwners = [...ownerCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return {
    success: true,
    data: {
      country,
      tracker: tracker || 'all',
      totalAssetsSearched: assetsResult.count,
      owners: sortedOwners.map((o) => ({
        name: o.name,
        entityId: o.entityId,
        assetCount: o.count,
      })),
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

  const slugMap: Record<string, string> = {
    'Coal Plant': 'coal-plant',
    'Oil & Gas Plant': 'oil-gas-plant',
    'Bioenergy Plant': 'bioenergy-plant',
    'Natural Gas Transmission Pipeline': 'gas-pipeline',
    'Cement or Concrete Plant': 'cement-plant',
    'Oil or NGL Pipeline': 'oil-pipeline',
    'Iron & Steel Plant': 'iron-steel-plant',
    'Iron Ore Mine': 'iron-ore-mine',
  };

  const topTypes = Object.entries(typeFacets)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 4);

  const perTypeStatus = await Promise.all(
    topTypes.map(async ([typeName]) => {
      const slug = slugMap[typeName];
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
};
