/**
 * Asset search & detail tool handlers.
 */

import { getAsset, getOwnershipGraph, resolveApiSlug } from '$lib/ownership-api';
import {
  API_BASE,
  fetchApiJson,
  clampLimit,
  type ToolArgs,
  type ToolResult,
  type ToolHandler,
} from './tool-utils';

async function searchAssets(args: ToolArgs): Promise<ToolResult> {
  const tracker = args.tracker as string | undefined;
  const slug = tracker ? resolveApiSlug(tracker) : null;
  const statusArr = Array.isArray(args.statuses)
    ? args.statuses
    : args.status
      ? [args.status]
      : undefined;
  const statuses = statusArr?.map((s: unknown) => String(s).toLowerCase());
  const countryArr = Array.isArray(args.countries)
    ? args.countries
    : args.country
      ? [args.country]
      : undefined;
  const countries = countryArr?.map((c: unknown) => String(c));
  const limit = clampLimit(args.limit, 20, 500);

  const sp = new URLSearchParams();
  if (slug) sp.set('asset_type', slug);
  if (statuses) for (const s of statuses) sp.append('status', s);
  if (countries) for (const c of countries) sp.append('country', c);
  if (args.query) sp.set('q', String(args.query));
  sp.set('limit', String(limit));
  sp.set('format', 'json');

  let facetData: Record<string, unknown> | undefined;
  if (args.include_facets) {
    const facetSp = new URLSearchParams(sp);
    facetSp.set('facets', 'true');
    facetSp.set('limit', '1');
    try {
      const facetRaw = await fetchApiJson(`${API_BASE}/assets?${facetSp.toString()}`);
      facetData = facetRaw.facets as Record<string, unknown>;
    } catch {
      /* skip facets on error */
    }
  }

  const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
  const results = (raw.results as Array<Record<string, unknown>>) || [];

  return {
    success: true,
    data: {
      total: raw.total,
      count: raw.count,
      ...(facetData ? { facets: facetData } : {}),
      assets: results.slice(0, limit).map((a) => ({
        id: a.asset_id || a.gem_id || a.id,
        name: a.asset_name || a.name,
        type: a.asset_type || a.tracker,
        status: a.operating_status || a.status,
        capacity: a.capacity_value ?? a.capacity,
        capacityUnit: a.capacity_unit,
        country: a.country,
        latitude: a.latitude,
        longitude: a.longitude,
        owner: (a.owners as Array<Record<string, unknown>>)?.[0]?.name || null,
        owners: (a.owners as Array<Record<string, unknown>>)?.map((o) => ({
          name: o.name,
          entityId: o.entity_id,
          share: o.ownership_share,
          hqCountry: o.hq_country,
        })),
      })),
      filters: {
        tracker: tracker || 'all',
        statuses: statuses || [],
        countries: countries || [],
        query: args.query || null,
      },
    },
  };
}

async function getAssetDetails(args: ToolArgs): Promise<ToolResult> {
  const asset = await getAsset(args.asset_id as string);
  const data: Record<string, unknown> = {
    id: asset.id,
    name: asset.name,
    type: asset.facilityType,
    status: asset.status,
    capacity: asset.capacity,
    capacityUnit: asset.capacityUnit,
    country: asset.country,
    latitude: asset.latitude,
    longitude: asset.longitude,
    owner: asset.ownerName,
    ownerEntityId: asset.ownerEntityId,
    parent: asset.parentName,
    parentEntityId: asset.parentEntityId,
  };

  if (args.include_ownership_chain && asset.ownerEntityId) {
    try {
      const graph = await getOwnershipGraph({
        root: asset.ownerEntityId,
        direction: 'up',
      });
      data.ownershipChain = graph.nodes.slice(0, 20).map((n) => ({
        id: n.id,
        name: n.Name || n.id,
      }));
      data.ownershipEdges = graph.edges.slice(0, 30).map((e) => ({
        from: e.source,
        to: e.target,
        pct: e.value,
      }));
    } catch {
      /* skip */
    }
  }

  return { success: true, data };
}

export const assetHandlers: Record<string, ToolHandler> = {
  search_assets: searchAssets,
  get_asset_details: getAssetDetails,
};
