/**
 * Data adapter: transforms REST API ownership graph into chart visualization data.
 *
 * Flow: getOwnershipGraph() → walk edges → enrich asset nodes → build chart structures
 */

import {
  getOwnershipGraph,
  getAsset,
  type OwnershipGraphResponse,
  type GraphNode,
  type AssetSummary,
} from '$lib/ownership-api';
import { getStatusGroup } from '$lib/design-tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartUnit {
  id: string;
  name: string;
  tracker: string;
  status: string;
  status_agg: string;
  spotlightOwnershipSharePct: number;
  directlyOwnedBySpotlightOwner: boolean;
  locationID: string;
}

export interface LocationGroup {
  locationID: string;
  units: ChartUnit[];
  y: number;
  r: number;
}

export interface BarDatum {
  tracker?: string;
  status?: string;
  count: number;
  percentage: number;
  x_percentage: number;
  x_percentage_offset?: number;
}

export interface SubsidiaryGroupData {
  id: string;
  locations: LocationGroup[];
  top: number;
  bottom: number;
  height: number;
  summary_data: {
    tracker: BarDatum[];
    status: BarDatum[];
  };
  intermediary_data?: {
    total_descendants: number;
    max_generations: number;
  };
}

export interface ScreenerChartData {
  assets: ChartUnit[];
  subsidiariesMatched: Map<string, ChartUnit[]>;
  directlyOwned: ChartUnit[];
  spotlightOwner: { id: string; Name: string };
  matchedEdges: Map<string, { source: string; target: string; value: number }>;
  entityMap: Map<string, { id: string; Name: string; type: string }>;
  multiplePathAssets: Map<string, string[]>;
  intermediaryData: Map<string, { total_descendants: number; max_generations: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 25;
const MAX_ASSET_FETCHES = 150;

// ---------------------------------------------------------------------------
// Layout params (shared with render module)
// ---------------------------------------------------------------------------

export const LAYOUT = {
  subsidX: 20,
  subsidiaryMarkHeight: 19,
  subsidiaryMinHeight: 145,
  yPadding: 50,
  assetsX: 500,
  assetSpacing: 9,
  assetMarkHeightSingle: 16,
  assetMarkHeightCombined: 26,
} as const;

// ---------------------------------------------------------------------------
// Main fetch + transform
// ---------------------------------------------------------------------------

/**
 * Fetch ownership graph and transform into chart-ready data.
 * Enriches asset nodes with details (status, tracker) via parallel getAsset() calls.
 */
export async function fetchChartData(
  entityId: string,
  onProgress?: (msg: string) => void
): Promise<ScreenerChartData> {
  onProgress?.('Loading ownership graph...');

  const graph = await getOwnershipGraph({
    root: entityId,
    direction: 'down',
    max_depth: 4,
  });

  // Build adjacency maps
  const childrenOf = new Map<string, Array<{ id: string; value: number }>>();
  const parentOf = new Map<string, Array<{ id: string; value: number }>>();

  for (const edge of graph.edges) {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source)!.push({ id: edge.target, value: edge.value ?? 0 });
    if (!parentOf.has(edge.target)) parentOf.set(edge.target, []);
    parentOf.get(edge.target)!.push({ id: edge.source, value: edge.value ?? 0 });
  }

  // Node lookup
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const rootId = graph.root.id;
  const rootChildren = childrenOf.get(rootId) || [];

  // Classify direct children: entities → subsidiaries, assets → directly owned
  const subsidiaryIds: string[] = [];
  const directAssetIds: string[] = [];

  for (const child of rootChildren) {
    const node = nodeMap.get(child.id);
    if (!node) continue;
    if (node.type === 'entity') {
      subsidiaryIds.push(child.id);
    } else {
      directAssetIds.push(child.id);
    }
  }

  // BFS from each subsidiary to find all reachable asset nodes
  const subsidiaryToAssets = new Map<string, string[]>();
  const assetToSubsidiaries = new Map<string, string[]>();
  const intermediaryData = new Map<
    string,
    { total_descendants: number; max_generations: number }
  >();

  for (const subId of subsidiaryIds) {
    const assets: string[] = [];
    const visited = new Set<string>([rootId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: subId, depth: 0 }];
    visited.add(subId);
    let maxDepth = 0;
    let totalDescendants = 0;

    while (queue.length > 0) {
      const { id: current, depth } = queue.shift()!;
      const children = childrenOf.get(current) || [];

      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        const childNode = nodeMap.get(child.id);
        if (!childNode) continue;

        if (childNode.type === 'asset') {
          assets.push(child.id);
          if (!assetToSubsidiaries.has(child.id)) assetToSubsidiaries.set(child.id, []);
          assetToSubsidiaries.get(child.id)!.push(subId);
        } else {
          totalDescendants++;
          maxDepth = Math.max(maxDepth, depth + 1);
          queue.push({ id: child.id, depth: depth + 1 });
        }
      }
    }

    subsidiaryToAssets.set(subId, assets);
    if (totalDescendants > 0) {
      intermediaryData.set(subId, {
        total_descendants: totalDescendants,
        max_generations: maxDepth,
      });
    }
  }

  // Collect all unique asset IDs
  const allAssetIds = new Set<string>(directAssetIds);
  for (const assets of subsidiaryToAssets.values()) {
    for (const id of assets) allAssetIds.add(id);
  }

  // Fetch asset details in parallel batches
  onProgress?.(`Fetching details for ${Math.min(allAssetIds.size, MAX_ASSET_FETCHES)} assets...`);
  const assetDetails = new Map<string, AssetSummary>();
  const assetIdsToFetch = Array.from(allAssetIds).slice(0, MAX_ASSET_FETCHES);

  for (let i = 0; i < assetIdsToFetch.length; i += BATCH_SIZE) {
    const batch = assetIdsToFetch.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(batch.map((id) => getAsset(id)));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value) {
        assetDetails.set(batch[idx], result.value);
      }
    });
    onProgress?.(
      `Loaded ${Math.min(i + BATCH_SIZE, assetIdsToFetch.length)} / ${assetIdsToFetch.length} assets`
    );
  }

  // Helper: get ownership % from edge to this asset
  function getOwnershipPct(assetId: string): number {
    const parents = parentOf.get(assetId) || [];
    return parents.length > 0 ? parents[0].value || 100 : 100;
  }

  // Convert graph node → ChartUnit
  function toChartUnit(assetId: string, isDirect: boolean): ChartUnit {
    const detail = assetDetails.get(assetId);
    const graphNode = nodeMap.get(assetId);
    const name = detail?.name || graphNode?.Name || assetId;
    const tracker = detail?.facilityType || 'Unknown';
    const status = detail?.status || 'unknown';
    const pct = getOwnershipPct(assetId);

    // Extract locationID from compound ID (L_G → L part)
    let locationID = assetId;
    if (assetId.includes('_')) {
      locationID = assetId.split('_')[0];
    }

    return {
      id: assetId,
      name,
      tracker,
      status,
      status_agg: getStatusGroup(status) || 'unknown',
      spotlightOwnershipSharePct: pct,
      directlyOwnedBySpotlightOwner: isDirect,
      locationID,
    };
  }

  // Build chart data
  const directlyOwned = directAssetIds.map((id) => toChartUnit(id, true));
  const allAssets: ChartUnit[] = [...directlyOwned];

  const subsidiariesMatched = new Map<string, ChartUnit[]>();
  for (const [subId, assetIds] of subsidiaryToAssets) {
    const units = assetIds.map((id) => toChartUnit(id, false));
    if (units.length > 0) {
      subsidiariesMatched.set(subId, units);
      allAssets.push(...units);
    }
  }

  // Sort subsidiaries by asset count (descending)
  const sortedSubsidiaries = new Map(
    Array.from(subsidiariesMatched).sort((a, b) => b[1].length - a[1].length)
  );

  // Build matchedEdges (root → subsidiary ownership %)
  const matchedEdges = new Map<string, { source: string; target: string; value: number }>();
  for (const subId of subsidiaryIds) {
    const rootEdge = rootChildren.find((c) => c.id === subId);
    if (rootEdge) {
      matchedEdges.set(subId, { source: rootId, target: subId, value: rootEdge.value });
    }
  }

  // Build entity map
  const entityMap = new Map<string, { id: string; Name: string; type: string }>();
  for (const node of graph.nodes) {
    if (node.type === 'entity') {
      entityMap.set(node.id, { id: node.id, Name: node.Name, type: 'entity' });
    }
  }

  // Build multiplePathAssets (assets reachable via >1 subsidiary)
  const multiplePathAssets = new Map<string, string[]>();
  for (const [assetId, subs] of assetToSubsidiaries) {
    if (subs.length > 1) {
      multiplePathAssets.set(assetId, subs);
    }
  }

  onProgress?.('Done');

  return {
    assets: allAssets,
    subsidiariesMatched: sortedSubsidiaries,
    directlyOwned,
    spotlightOwner: { id: rootId, Name: graph.root.Name },
    matchedEdges,
    entityMap,
    multiplePathAssets,
    intermediaryData,
  };
}

// ---------------------------------------------------------------------------
// Build subsidiary groups (layout computation)
// ---------------------------------------------------------------------------

export function buildSubsidiaryGroups(chartData: ScreenerChartData): SubsidiaryGroupData[] {
  const groups: Array<[string, ChartUnit[]]> = Array.from(chartData.subsidiariesMatched);
  if (chartData.directlyOwned.length > 0) {
    groups.push(['Directly owned', chartData.directlyOwned]);
  }

  if (groups.length === 0) return [];

  const scaleR = (n: number): number => {
    if (n <= 2) return 0.5;
    if (n >= 20) return 1.5;
    return 0.5 + ((n - 2) / 18);
  };

  let subsidiariesData: SubsidiaryGroupData[] = groups.map(([id, units]) => {
    // Group units by location
    const locationMap = new Map<string, ChartUnit[]>();
    for (const unit of units) {
      const locId = unit.locationID;
      if (!locationMap.has(locId)) locationMap.set(locId, []);
      locationMap.get(locId)!.push(unit);
    }

    const locations: LocationGroup[] = Array.from(locationMap, ([locId, locUnits]) => {
      locUnits.sort((a, b) => a.name.localeCompare(b.name));
      return { locationID: locId, units: locUnits, y: 0, r: 0 };
    });
    locations.sort((a, b) => a.units[0].name.localeCompare(b.units[0].name));

    const subData: SubsidiaryGroupData = {
      id,
      locations,
      top: 0,
      bottom: 0,
      height: 0,
      summary_data: { tracker: [], status: [] },
    };

    if (chartData.intermediaryData.has(id)) {
      subData.intermediary_data = chartData.intermediaryData.get(id);
    }

    return subData;
  });

  // Compute layout heights
  let y = 0;
  for (const d of subsidiariesData) {
    d.top = y;
    const nLocations = d.locations.length;

    for (let j = 0; j < d.locations.length; j++) {
      const loc = d.locations[j];
      const nUnits = loc.units.length;
      const height =
        nUnits === 1
          ? LAYOUT.assetMarkHeightSingle
          : Math.max(LAYOUT.assetMarkHeightSingle, LAYOUT.assetMarkHeightCombined * scaleR(nUnits));
      loc.y = y - d.top + height / 2;
      loc.r =
        nUnits === 1
          ? LAYOUT.assetMarkHeightSingle / 2
          : (LAYOUT.assetMarkHeightCombined / 2) * scaleR(nUnits);
      y += height + (j === nLocations - 1 ? 0 : LAYOUT.assetSpacing);
    }

    d.height = Math.max(y - d.top, LAYOUT.subsidiaryMarkHeight, LAYOUT.subsidiaryMinHeight);
    d.bottom = d.top + d.height;
    y = d.top + d.height + LAYOUT.yPadding;
  }

  // Compute frequency tables (tracker/status bars)
  for (const s of subsidiariesData) {
    const allUnits: ChartUnit[] = [];
    for (const loc of s.locations) allUnits.push(...loc.units);

    const trackerFreq = new Map<string, number>();
    const statusFreq = new Map<string, number>();
    for (const u of allUnits) {
      trackerFreq.set(u.tracker, (trackerFreq.get(u.tracker) || 0) + 1);
      statusFreq.set(u.status_agg, (statusFreq.get(u.status_agg) || 0) + 1);
    }

    const total = allUnits.length || 1;

    // Tracker bars
    const trackerData: BarDatum[] = Array.from(trackerFreq, ([tracker, count]) => ({
      tracker,
      count,
      percentage: count / total,
      x_percentage: 0,
    }));
    trackerData.sort((a, b) => b.count - a.count);
    let x = 0;
    for (const d of trackerData) {
      d.x_percentage = x;
      x += d.percentage;
    }

    // Status bars
    const statusOrder = ['proposed', 'operating', 'retired', 'cancelled', 'unknown'];
    const statusData: BarDatum[] = Array.from(statusFreq, ([status, count]) => ({
      status,
      count,
      percentage: count / total,
      x_percentage: 0,
    }));
    statusData.sort(
      (a, b) => statusOrder.indexOf(a.status || '') - statusOrder.indexOf(b.status || '')
    );
    x = 0;
    for (const d of statusData) {
      d.x_percentage = x;
      x += d.percentage;
    }

    s.summary_data = { tracker: trackerData, status: statusData };
  }

  return subsidiariesData;
}
