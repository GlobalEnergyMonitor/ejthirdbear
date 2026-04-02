/**
 * Report page query functions — REST API data fetching
 */

import {
  getEntityGraphUp,
  getEntityGraphDown,
  getAsset,
  type AssetSummary,
  type EntityGraphResponse,
} from '$lib/ownership-api';

import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';
import { PROSPECTIVE_STATUSES } from '$lib/data-config/tracker-schema';

export interface ReportSummary {
  totalAssets: number;
  totalCapacity: number;
  countries: number;
  totalOwners: number;
  trackers: string[];
}

export interface OwnershipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths?: Record<string, OwnershipPathEntry[]>;
}

// Batch-fetch assets with concurrency limit
async function batchGetAssets(
  assetIds: string[],
  concurrency = 5
): Promise<Map<string, AssetSummary>> {
  const results = new Map<string, AssetSummary>();
  const unique = [...new Set(assetIds)];

  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((id) => getAsset(id)));
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === 'fulfilled') {
        const asset = (settled[j] as PromiseFulfilledResult<AssetSummary>).value;
        results.set(batch[j], asset);
      }
    }
  }

  return results;
}

// Extract terminal asset IDs from an entity graph
function getTerminalAssetIds(graph: EntityGraphResponse): string[] {
  const terminalSet = new Set(graph.terminalIds || []);
  return graph.nodes.filter((n) => terminalSet.has(n.id) || n.is_terminal).map((n) => n.id);
}

/**
 * Query entity portfolios via REST API graphs
 */
export async function queryEntityPortfolios(
  entityIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  if (entityIds.length < 1) return [];
  log(`Querying portfolios for ${entityIds.length} entities via REST API`);

  const results: unknown[] = [];

  // Fetch downstream graphs for each entity
  const graphs = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));

  for (let i = 0; i < entityIds.length; i++) {
    const entityId = entityIds[i];
    if (graphs[i].status !== 'fulfilled') continue;

    const graph = (graphs[i] as PromiseFulfilledResult<EntityGraphResponse>).value;
    const terminalIds = getTerminalAssetIds(graph);

    // Fetch a sample of terminal assets for stats
    const sampleIds = terminalIds.slice(0, 20);
    const assets = await batchGetAssets(sampleIds);

    const assetList = [...assets.values()];
    const totalCapacity = assetList.reduce((sum, a) => sum + (a.capacity || 0), 0);
    const trackerSet = new Set(assetList.map((a) => a.facilityType).filter(Boolean));
    const operating = assetList.filter((a) => a.status?.toLowerCase() === 'operating').length;
    const proposed = assetList.filter((a) =>
      PROSPECTIVE_STATUSES.includes(
        a.status?.toLowerCase() as (typeof PROSPECTIVE_STATUSES)[number]
      )
    ).length;
    const construction = assetList.filter((a) => a.status?.toLowerCase() === 'construction').length;

    results.push({
      entity_id: entityId,
      entity_name: graph.rootEntityName,
      hq_country: null,
      asset_count: terminalIds.length,
      total_capacity_mw: Math.round(totalCapacity),
      avg_share_pct: null,
      operating,
      proposed,
      construction,
      trackers: [...trackerSet].join(', '),
    });
  }

  log(`Entity portfolios: ${results.length}`);
  return results;
}

/**
 * Fetch ownership graphs for all entities (via API)
 */
export async function fetchOwnershipGraphs(
  entityIds: string[],
  log: (_msg: string) => void
): Promise<Map<string, OwnershipGraph>> {
  if (entityIds.length < 1) return new Map();
  log(`Fetching ownership graphs for ${entityIds.length} entities`);

  const graphs = new Map<string, OwnershipGraph>();
  const batchSize = 5;

  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          const graph = await getEntityGraphUp(id);
          return { id, graph };
        } catch (err) {
          if (import.meta.env.DEV) console.warn(`Failed to fetch ownership graph for ${id}:`, err);
          return { id, graph: null };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.graph) {
        const { id, graph } = result.value;
        graphs.set(id, {
          nodes: graph.nodes || [],
          edges: graph.edges || [],
        });
      }
    }
  }

  log(`Fetched ${graphs.size} ownership graphs`);
  return graphs;
}

/**
 * Query shared assets (when multiple entities in cart)
 */
export async function querySharedAssets(
  entityIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  if (entityIds.length < 2) return [];
  log(`Querying shared assets for ${entityIds.length} entities via REST API`);

  // Get downstream graphs for all entities
  const graphResults = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));

  // Build entity→assets mapping
  const entityAssets = new Map<string, Set<string>>();
  const allAssetIds = new Set<string>();

  for (let i = 0; i < entityIds.length; i++) {
    if (graphResults[i].status !== 'fulfilled') continue;
    const graph = (graphResults[i] as PromiseFulfilledResult<EntityGraphResponse>).value;
    const terminals = new Set(getTerminalAssetIds(graph));
    entityAssets.set(entityIds[i], terminals);
    for (const id of terminals) allAssetIds.add(id);
  }

  // Find assets owned by multiple entities
  const sharedIds: string[] = [];
  for (const assetId of allAssetIds) {
    let ownerCount = 0;
    for (const terminals of entityAssets.values()) {
      if (terminals.has(assetId)) ownerCount++;
    }
    if (ownerCount > 1) sharedIds.push(assetId);
  }

  if (sharedIds.length === 0) {
    log('Shared assets: 0');
    return [];
  }

  // Fetch details for shared assets (limit 100)
  const assets = await batchGetAssets(sharedIds.slice(0, 100));
  const results = sharedIds
    .slice(0, 100)
    .filter((id) => assets.has(id))
    .map((id) => {
      const asset = assets.get(id)!;
      const coOwners: string[] = [];
      for (const [entityId, terminals] of entityAssets) {
        if (terminals.has(id)) coOwners.push(entityId);
      }
      return {
        asset_id: asset.id,
        asset_name: asset.name,
        tracker: asset.facilityType || '',
        status: asset.status || '',
        capacity_mw: asset.capacity || 0,
        co_owner_count: coOwners.length,
        co_owners: coOwners.join('; '),
      };
    })
    .sort(
      (a, b) => b.co_owner_count - a.co_owner_count || (b.capacity_mw || 0) - (a.capacity_mw || 0)
    );

  log(`Shared assets: ${results.length}`);
  return results;
}

/**
 * Query common owners (when assets in cart)
 */
export async function queryCommonOwners(
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  if (assetIds.length < 1) return [];
  log(`Querying common owners for ${assetIds.length} assets via REST API`);

  const assets = await batchGetAssets(assetIds);

  // Aggregate owners across all assets
  const ownerMap = new Map<
    string,
    {
      entity_id: string;
      entity_name: string;
      hq_country: string | null;
      assets: Set<string>;
      totalCapacity: number;
    }
  >();

  for (const [assetId, asset] of assets) {
    for (const owner of asset.owners || []) {
      if (!owner.entityId) continue;
      const existing = ownerMap.get(owner.entityId);
      if (existing) {
        existing.assets.add(assetId);
        existing.totalCapacity += asset.capacity || 0;
      } else {
        ownerMap.set(owner.entityId, {
          entity_id: owner.entityId,
          entity_name: owner.name,
          hq_country: owner.hqCountry || null,
          assets: new Set([assetId]),
          totalCapacity: asset.capacity || 0,
        });
      }
    }
  }

  const results = [...ownerMap.values()]
    .map((o) => ({
      entity_id: o.entity_id,
      entity_name: o.entity_name,
      hq_country: o.hq_country,
      asset_count: o.assets.size,
      total_capacity_mw: Math.round(o.totalCapacity),
      avg_share_pct: null,
    }))
    .sort((a, b) => b.asset_count - a.asset_count || b.total_capacity_mw - a.total_capacity_mw)
    .slice(0, 100);

  log(`Common owners: ${results.length}`);
  return results;
}

/**
 * Query geographic breakdown
 */
export async function queryGeoBreakdown(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  log('Querying geographic breakdown via REST API');

  const allAssetIds = new Set<string>(assetIds);

  // Get terminal assets from entity graphs
  if (entityIds.length > 0) {
    const graphs = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));
    for (const result of graphs) {
      if (result.status === 'fulfilled') {
        for (const id of getTerminalAssetIds(result.value)) {
          allAssetIds.add(id);
        }
      }
    }
  }

  // Fetch asset details (sample for performance)
  const sampleIds = [...allAssetIds].slice(0, 200);
  const assets = await batchGetAssets(sampleIds);

  // Count by country
  const countryMap = new Map<
    string,
    { asset_count: number; total_capacity: number; entities: Set<string> }
  >();
  for (const asset of assets.values()) {
    const country = asset.country || 'Unknown';
    const existing = countryMap.get(country);
    if (existing) {
      existing.asset_count++;
      existing.total_capacity += asset.capacity || 0;
      for (const o of asset.owners || []) {
        if (o.entityId) existing.entities.add(o.entityId);
      }
    } else {
      const entities = new Set<string>();
      for (const o of asset.owners || []) {
        if (o.entityId) entities.add(o.entityId);
      }
      countryMap.set(country, {
        asset_count: 1,
        total_capacity: asset.capacity || 0,
        entities,
      });
    }
  }

  const results = [...countryMap.entries()]
    .map(([country, data]) => ({
      country,
      asset_count: data.asset_count,
      total_capacity: Math.round(data.total_capacity),
      entity_count: data.entities.size,
    }))
    .sort((a, b) => b.asset_count - a.asset_count)
    .slice(0, 20);

  log(`Geo breakdown: ${results.length}`);
  return results;
}

/**
 * Query tracker breakdown
 */
export async function queryTrackerBreakdown(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  log('Querying tracker breakdown via REST API');

  const allAssetIds = new Set<string>(assetIds);

  if (entityIds.length > 0) {
    const graphs = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));
    for (const result of graphs) {
      if (result.status === 'fulfilled') {
        for (const id of getTerminalAssetIds(result.value)) {
          allAssetIds.add(id);
        }
      }
    }
  }

  const sampleIds = [...allAssetIds].slice(0, 200);
  const assets = await batchGetAssets(sampleIds);

  const trackerMap = new Map<
    string,
    { asset_count: number; total_capacity: number; operating: number; proposed: number }
  >();

  for (const asset of assets.values()) {
    const tracker = asset.facilityType || 'Unknown';
    const status = (asset.status || '').toLowerCase();
    const existing = trackerMap.get(tracker);

    const isOperating = status === 'operating' ? 1 : 0;
    const isProposed = PROSPECTIVE_STATUSES.includes(
      status as (typeof PROSPECTIVE_STATUSES)[number]
    )
      ? 1
      : 0;

    if (existing) {
      existing.asset_count++;
      existing.total_capacity += asset.capacity || 0;
      existing.operating += isOperating;
      existing.proposed += isProposed;
    } else {
      trackerMap.set(tracker, {
        asset_count: 1,
        total_capacity: asset.capacity || 0,
        operating: isOperating,
        proposed: isProposed,
      });
    }
  }

  const results = [...trackerMap.entries()]
    .map(([tracker, data]) => ({
      tracker,
      asset_count: data.asset_count,
      total_capacity: Math.round(data.total_capacity),
      operating: data.operating,
      proposed: data.proposed,
    }))
    .sort((a, b) => b.asset_count - a.asset_count);

  log(`Tracker breakdown: ${results.length}`);
  return results;
}

/**
 * Query summary stats
 */
export async function querySummary(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<ReportSummary> {
  log('Querying summary via REST API');

  const allAssetIds = new Set<string>(assetIds);
  const allOwnerIds = new Set<string>();

  if (entityIds.length > 0) {
    const graphs = await Promise.allSettled(entityIds.map((id) => getEntityGraphDown(id)));
    for (const result of graphs) {
      if (result.status === 'fulfilled') {
        for (const id of getTerminalAssetIds(result.value)) {
          allAssetIds.add(id);
        }
      }
    }
  }

  const sampleIds = [...allAssetIds].slice(0, 200);
  const assets = await batchGetAssets(sampleIds);

  const countrySet = new Set<string>();
  const trackerSet = new Set<string>();
  let totalCapacity = 0;

  for (const asset of assets.values()) {
    if (asset.country) countrySet.add(asset.country);
    if (asset.facilityType) trackerSet.add(asset.facilityType);
    totalCapacity += asset.capacity || 0;
    for (const o of asset.owners || []) {
      if (o.entityId) allOwnerIds.add(o.entityId);
    }
  }

  const summary: ReportSummary = {
    totalAssets: allAssetIds.size,
    totalCapacity: Math.round(totalCapacity),
    countries: countrySet.size,
    totalOwners: allOwnerIds.size,
    trackers: [...trackerSet],
  };

  log(`Summary: ${summary.totalAssets} assets, ${summary.totalCapacity} MW`);
  return summary;
}

/**
 * Default loading steps configuration
 */
export const defaultLoadingSteps = [
  { id: 'init', label: 'Connecting to API', status: 'pending' as const },
  { id: 'portfolios', label: 'Querying entity portfolios', status: 'pending' as const },
  { id: 'ownership', label: 'Fetching ownership graphs', status: 'pending' as const },
  { id: 'shared', label: 'Finding co-owned assets', status: 'pending' as const },
  { id: 'owners', label: 'Identifying common owners', status: 'pending' as const },
  { id: 'geo', label: 'Analyzing geographic distribution', status: 'pending' as const },
  { id: 'trackers', label: 'Breaking down by asset type', status: 'pending' as const },
  { id: 'summary', label: 'Computing summary statistics', status: 'pending' as const },
];
