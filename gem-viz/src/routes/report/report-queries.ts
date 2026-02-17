/**
 * Report page query functions
 * Extracted from +page.svelte to reduce file size
 */

import { widgetQuery } from '$lib/widgets/widget-utils';
import { buildIdList } from '$lib/utils/sql';
import { getEntityGraphUp } from '$lib/ownership-api';
import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';

export interface ReportSummary {
  totalAssets: number;
  totalCapacity: number;
  countries: number;
  totalOwners: number;
  trackers: string[];
}

import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';

export interface OwnershipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  paths?: Record<string, OwnershipPathEntry[]>;
}

/**
 * Query entity portfolios (when entities in cart)
 */
export async function queryEntityPortfolios(
  entityIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  if (entityIds.length < 1) return [];
  log(`Querying portfolios for ${entityIds.length} entities`);

  const idList = buildIdList(entityIds);
  const sql = `
    SELECT
      o."Owner GEM Entity ID" as entity_id,
      MAX(o."Owner") as entity_name,
      MAX(o."Owner Headquarters Country") as hq_country,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
      SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
      AVG(CAST(o."Share" AS DOUBLE)) as avg_share_pct,
      COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN ${ASSET_ID_COALESCE_O} END) as operating,
      COUNT(DISTINCT CASE WHEN o."Status" IN ('proposed', 'announced', 'pre-permit', 'permitted') THEN ${ASSET_ID_COALESCE_O} END) as proposed,
      COUNT(DISTINCT CASE WHEN o."Status" IN ('construction', 'under construction') THEN ${ASSET_ID_COALESCE_O} END) as construction,
      STRING_AGG(DISTINCT o."Tracker", ', ') as trackers
    FROM ownership o
    WHERE o."Owner GEM Entity ID" IN (${idList})
    GROUP BY o."Owner GEM Entity ID"
    ORDER BY total_capacity_mw DESC
  `;

  const result = await widgetQuery(sql);
  log(`Entity portfolios: ${result.success ? result.data?.length : 'error'}`);
  return result.success ? result.data || [] : [];
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

  // Fetch graphs in parallel (limit to 5 concurrent)
  const batchSize = 5;
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (id) => {
        try {
          const graph = await getEntityGraphUp(id);
          return { id, graph };
        } catch (err) {
          console.warn(`Failed to fetch ownership graph for ${id}:`, err);
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
  if (entityIds.length < 2) return []; // Need at least 2 entities to find shared assets
  log(`Querying shared assets for ${entityIds.length} entities`);

  const idList = buildIdList(entityIds);
  const sql = `
    WITH entity_assets AS (
      SELECT
        ${ASSET_ID_COALESCE_O} as asset_id,
        o."Project" as asset_name,
        o."Tracker" as tracker,
        o."Status" as status,
        COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw,
        o."Owner GEM Entity ID" as entity_id,
        o."Owner" as owner_name
      FROM ownership o
      WHERE o."Owner GEM Entity ID" IN (${idList})
        AND ${ASSET_ID_COALESCE_O} IS NOT NULL
    )
    SELECT
      asset_id,
      asset_name,
      tracker,
      status,
      MAX(capacity_mw) as capacity_mw,
      COUNT(DISTINCT entity_id) as co_owner_count,
      STRING_AGG(DISTINCT owner_name, '; ') as co_owners
    FROM entity_assets
    GROUP BY asset_id, asset_name, tracker, status
    HAVING COUNT(DISTINCT entity_id) > 1
    ORDER BY co_owner_count DESC, capacity_mw DESC
    LIMIT 100
  `;

  const result = await widgetQuery(sql);
  log(`Shared assets: ${result.success ? result.data?.length : 'error'}`);
  return result.success ? result.data || [] : [];
}

/**
 * Query common owners (when assets in cart)
 */
export async function queryCommonOwners(
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  if (assetIds.length < 1) return [];
  log(`Querying common owners for ${assetIds.length} assets`);

  const idList = buildIdList(assetIds);
  const sql = `
    SELECT
      o."Owner GEM Entity ID" as entity_id,
      MAX(o."Owner") as entity_name,
      MAX(o."Owner Headquarters Country") as hq_country,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
      SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
      AVG(CAST(o."Share" AS DOUBLE)) as avg_share_pct
    FROM ownership o
    WHERE ${ASSET_ID_COALESCE_O} IN (${idList})
      AND o."Owner" IS NOT NULL AND o."Owner" != ''
    GROUP BY o."Owner GEM Entity ID"
    ORDER BY asset_count DESC, total_capacity_mw DESC
    LIMIT 100
  `;

  const result = await widgetQuery(sql);
  log(`Common owners: ${result.success ? result.data?.length : 'error'}`);
  return result.success ? result.data || [] : [];
}

/**
 * Query geographic breakdown
 */
export async function queryGeoBreakdown(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  log('Querying geographic breakdown');
  const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
  const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

  const sql = `
    SELECT
      COALESCE(l."Country.Area", 'Unknown') as country,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
      SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
      COUNT(DISTINCT o."Owner GEM Entity ID") as entity_count
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."Owner GEM Entity ID" IN (${entityList})
       OR ${ASSET_ID_COALESCE_O} IN (${assetList})
    GROUP BY 1
    ORDER BY asset_count DESC
    LIMIT 20
  `;

  const result = await widgetQuery(sql);
  log(`Geo breakdown: ${result.success ? result.data?.length : 'error'}`);
  return result.success ? result.data || [] : [];
}

/**
 * Query tracker breakdown
 */
export async function queryTrackerBreakdown(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<unknown[]> {
  log('Querying tracker breakdown');
  const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
  const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

  const sql = `
    SELECT
      o."Tracker" as tracker,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
      SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
      COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN ${ASSET_ID_COALESCE_O} END) as operating,
      COUNT(DISTINCT CASE WHEN o."Status" IN ('proposed', 'announced', 'pre-permit', 'permitted') THEN ${ASSET_ID_COALESCE_O} END) as proposed
    FROM ownership o
    WHERE o."Owner GEM Entity ID" IN (${entityList})
       OR ${ASSET_ID_COALESCE_O} IN (${assetList})
    GROUP BY 1
    ORDER BY asset_count DESC
  `;

  const result = await widgetQuery(sql);
  log(`Tracker breakdown: ${result.success ? result.data?.length : 'error'}`);
  return result.success ? result.data || [] : [];
}

/**
 * Query summary stats
 */
export async function querySummary(
  entityIds: string[],
  assetIds: string[],
  log: (_msg: string) => void
): Promise<ReportSummary> {
  log('Querying summary');
  const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
  const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

  const sql = `
    SELECT
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as total_assets,
      SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
      COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as countries,
      COUNT(DISTINCT o."Owner GEM Entity ID") as total_owners,
      STRING_AGG(DISTINCT o."Tracker", ', ') as trackers
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE o."Owner GEM Entity ID" IN (${entityList})
       OR ${ASSET_ID_COALESCE_O} IN (${assetList})
  `;

  const result = await widgetQuery(sql);
  if (result.success && result.data?.length > 0) {
    const row = result.data[0] as Record<string, unknown>;
    return {
      totalAssets: Number(row.total_assets) || 0,
      totalCapacity: Math.round(Number(row.total_capacity) || 0),
      countries: Number(row.countries) || 0,
      totalOwners: Number(row.total_owners) || 0,
      trackers: row.trackers ? String(row.trackers).split(', ') : [],
    };
  }
  return { totalAssets: 0, totalCapacity: 0, countries: 0, totalOwners: 0, trackers: [] };
}

/**
 * Default loading steps configuration
 */
export const defaultLoadingSteps = [
  { id: 'init', label: 'Initializing DuckDB connection', status: 'pending' as const },
  { id: 'portfolios', label: 'Querying entity portfolios', status: 'pending' as const },
  { id: 'ownership', label: 'Fetching ownership graphs', status: 'pending' as const },
  { id: 'shared', label: 'Finding co-owned assets', status: 'pending' as const },
  { id: 'owners', label: 'Identifying common owners', status: 'pending' as const },
  { id: 'geo', label: 'Analyzing geographic distribution', status: 'pending' as const },
  { id: 'trackers', label: 'Breaking down by asset type', status: 'pending' as const },
  { id: 'summary', label: 'Computing summary statistics', status: 'pending' as const },
];
