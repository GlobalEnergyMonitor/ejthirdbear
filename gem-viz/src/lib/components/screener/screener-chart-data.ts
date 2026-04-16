/**
 * Data adapter: transforms REST API ownership graph into chart visualization data.
 *
 * Flow: getOwnershipGraph() → walk edges → build chart structures from graph node metadata
 */

import { getOwnershipGraph, type GraphNode, type AssetSummary } from '$lib/ownership-api';
import { getStatusGroup } from '$lib/design-tokens';
import { STATUS_GROUPS } from '$lib/data-config/tracker-schema';
import { scaleR } from '$lib/components/ownership/molecule-renderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartUnit {
  id: string;
  name: string;
  tracker: string;
  status: string;
  subStatus: string;
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

export interface SubsidiaryExpansion {
  subGroups: SubsidiaryGroupData[];
  entityMap: Map<string, { id: string; Name: string; type: string }>;
  /** value = cumulative root→target % (for pies); directValue = single-hop subId→target % (for tooltips) */
  matchedEdges: Map<string, { source: string; target: string; value: number; directValue?: number }>;
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
  expansion?: SubsidiaryExpansion;
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
  assetDetails: Map<string, AssetSummary>;
  /** Cached graph node map — used by expandSubsidiary */
  graphNodeMap: Map<string, GraphNode>;
  /** Cumulative ownership paths from spotlight owner → each node, keyed by node ID */
  graphPaths: Record<string, Array<{ route: string[]; cumulative_pct: number }>> | undefined;
  /** Direct edge ownership % keyed by "sourceId::targetId" — used by expandSubsidiary */
  graphEdgeMap: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// No batch fetching needed — graph API returns full asset metadata on each node.

// ---------------------------------------------------------------------------
// Layout params (shared with render module)
// ---------------------------------------------------------------------------

export const LAYOUT = {
  subsidX: 20,
  subsidiaryMarkHeight: 19,
  subsidiaryMinHeight: 120,
  yPadding: 28,
  assetsX: 532,
  regionPadding: 32, // keeps region right edge fixed as assetsX shifts right
  assetSpacing: 9,
  assetMarkHeightSingle: 16,
  assetMarkHeightCombined: 26,
  /** Rightward shift applied to assets (and parent region width) when a subsidiary is expanded. */
  expansionShift: 45,
} as const;

// ---------------------------------------------------------------------------
// Main fetch + transform
// ---------------------------------------------------------------------------

/**
 * Fetch ownership graph and transform into chart-ready data.
 * Uses asset metadata from graph response directly (no individual getAsset() calls).
 *
 * @param catalogUrl  Optional fully-qualified assets URL (from the screener's catalogUrl).
 *                    When provided, fetches all matching asset IDs from that URL and uses
 *                    them to filter the graph — so only assets in the selected asset class
 *                    are shown, not all assets owned by the entity.
 */
export async function fetchChartData(
  entityId: string,
  catalogUrl?: string,
  onProgress?: (_msg: string) => void
): Promise<ScreenerChartData> {
  onProgress?.('Loading ownership graph...');

  const graph = await getOwnershipGraph({
    root: entityId,
    direction: 'down',
  });

  // If a catalogUrl is provided, fetch the set of asset IDs (and location IDs) matching the
  // selected asset class. The ownership graph returns the full graph for the entity; this set
  // is used to restrict which graph nodes are included in the chart output.
  //
  // The catalog API returns ALL units of any project where any unit meets the criteria, so
  // classAssetIds will contain units that may have different tracker types. We match by
  // asset ID first; location ID is a secondary fallback for cases where the graph uses a
  // different asset ID format than the catalog (common for gas pipelines and other types
  // that use non-G-prefix IDs).
  let classAssetIds: Set<string> | null = null;
  let classLocationIds: Set<string> | null = null;
  if (catalogUrl) {
    onProgress?.('Filtering to selected asset class...');
    const { listAssets } = await import('$lib/ownership-api');
    const [, qs] = catalogUrl.split('?');
    const rawParams = new URLSearchParams(qs ?? '');
    const paramMap: Record<string, string | string[]> = {};
    for (const [key, value] of rawParams.entries()) {
      const cur = paramMap[key];
      if (cur === undefined) paramMap[key] = value;
      else if (Array.isArray(cur)) cur.push(value);
      else paramMap[key] = [cur, value];
    }
    classAssetIds = new Set<string>();
    classLocationIds = new Set<string>();
    let offset = 0;
    const BATCH = 500;
    for (;;) {
      const page = await listAssets({ ...paramMap, limit: BATCH, offset } as Parameters<typeof listAssets>[0]);
      if (!page?.results?.length) break;
      for (const asset of page.results) {
        classAssetIds.add(asset.id);
        if (asset.locationId) classLocationIds.add(asset.locationId);
      }
      if (page.results.length < BATCH) break;
      offset += BATCH;
    }
  }

  // Helper: check if a graph node is in the selected asset class.
  // Matches by asset ID (primary) or location ID (fallback for ID format differences).
  function inClass(nodeId: string, node: GraphNode): boolean {
    if (!classAssetIds) return true; // no filter → include all
    if (classAssetIds.has(nodeId)) return true;
    if (classLocationIds && node.location_id && classLocationIds.has(node.location_id)) return true;
    return false;
  }

  // Node lookup
  const nodeMap = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const rootId = graph.root.id;
  const paths = graph.paths ?? {};

  // Single pass over paths — classify nodes, build all subsidiary/asset/intermediary maps.
  // route[0] = root, route[1] = top-level subsidiary, route.length === 2 → direct child of root.
  const subsidiaryIds: string[] = [];
  const directAssetIds: string[] = [];
  const subsidiaryToAssets = new Map<string, string[]>();
  const assetToSubsidiaries = new Map<string, string[]>();
  const subDescendantEntityIds = new Map<string, Set<string>>();
  const subMaxDepth = new Map<string, number>();

  // First sub-pass: classify direct children of root (route.length === 2)
  for (const [nodeId, nodePaths] of Object.entries(paths)) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    if (!nodePaths.some((p) => p.route.length === 2)) continue;
    if (node.type === 'entity') {
      subsidiaryIds.push(nodeId);
    } else if (inClass(nodeId, node)) {
      directAssetIds.push(nodeId);
    }
  }

  const subsidiaryIdSet = new Set(subsidiaryIds);

  // Second sub-pass: group assets and intermediary entities by top-level subsidiary
  for (const [nodeId, nodePaths] of Object.entries(paths)) {
    const node = nodeMap.get(nodeId);
    if (!node || nodeId === rootId) continue;

    if (node.type === 'asset') {
      if (!inClass(nodeId, node)) continue;
      const viaSubs = new Set<string>();
      for (const p of nodePaths) {
        const subId = p.route[1];
        if (subId && subsidiaryIdSet.has(subId)) viaSubs.add(subId);
      }
      for (const subId of viaSubs) {
        if (!subsidiaryToAssets.has(subId)) subsidiaryToAssets.set(subId, []);
        subsidiaryToAssets.get(subId)!.push(nodeId);
      }
      if (viaSubs.size > 0) assetToSubsidiaries.set(nodeId, [...viaSubs]);
    } else {
      // Intermediary entity — track depth per subsidiary for the expand-icon indicator
      for (const p of nodePaths) {
        const subId = p.route[1];
        if (!subId || !subsidiaryIdSet.has(subId)) continue;
        if (!subDescendantEntityIds.has(subId)) subDescendantEntityIds.set(subId, new Set());
        subDescendantEntityIds.get(subId)!.add(nodeId);
        // depth from subId = route.length - 2 (subtract root entry)
        subMaxDepth.set(subId, Math.max(subMaxDepth.get(subId) ?? 0, p.route.length - 2));
      }
    }
  }

  const intermediaryData = new Map<string, { total_descendants: number; max_generations: number }>();
  for (const subId of subsidiaryIds) {
    const descendants = subDescendantEntityIds.get(subId);
    if (descendants && descendants.size > 0) {
      intermediaryData.set(subId, {
        total_descendants: descendants.size,
        max_generations: subMaxDepth.get(subId) ?? 0,
      });
    }
  }

  // The graph API already returns full asset metadata (operating_status, asset_type,
  // location_id, capacity, etc.) on each node — no need for individual getAsset() calls.
  const assetDetails = new Map<string, AssetSummary>();

  // Cumulative ownership % the spotlight owner holds in a node: sum of cumulative_pct across all paths.
  function ownershipPctFor(nodeId: string): number {
    const nodePaths = paths[nodeId];
    if (!nodePaths?.length) return 100;
    return nodePaths.reduce((sum, p) => sum + (p.cumulative_pct ?? 0), 0);
  }

  // Convert graph node → ChartUnit (all data from graph response, zero extra fetches)
  function toChartUnit(assetId: string, isDirect: boolean): ChartUnit {
    const graphNode = nodeMap.get(assetId);
    const name = graphNode?.Name || assetId;
    const tracker = graphNode?.asset_type || 'Unknown';
    const status = graphNode?.operating_status || 'unknown';
    const subStatus = graphNode?.operating_sub_status || '';
    const pct = ownershipPctFor(assetId);
    const locationID = graphNode?.location_id || (assetId.includes('_') ? assetId.split('_')[0] : assetId);

    return {
      id: assetId,
      name,
      tracker,
      status,
      subStatus,
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

  // Build matchedEdges (root → subsidiary ownership %)
  // Uses cumulative paths when available, so the pie reflects total spotlight-owner share.
  const matchedEdges = new Map<string, { source: string; target: string; value: number }>();
  for (const subId of subsidiaryIds) {
    matchedEdges.set(subId, { source: rootId, target: subId, value: ownershipPctFor(subId) });
  }

  // Sort subsidiaries by ownership percentage (desc), then asset count (desc).
  // This mirrors notebook default behavior (sortByOwnershipPct=true).
  const sortedSubsidiaries = new Map(
    Array.from(subsidiariesMatched).sort((a, b) => {
      const aOwnership = matchedEdges.get(a[0])?.value || 0;
      const bOwnership = matchedEdges.get(b[0])?.value || 0;
      if (bOwnership !== aOwnership) return bOwnership - aOwnership;
      return b[1].length - a[1].length;
    })
  );

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

  // Build direct-edge map: "sourceId::targetId" → direct ownership %
  const graphEdgeMap = new Map<string, number>();
  for (const edge of graph.edges) {
    if (edge.value != null) {
      graphEdgeMap.set(`${edge.source}::${edge.target}`, edge.value);
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
    assetDetails,
    graphNodeMap: nodeMap,
    graphPaths: graph.paths,
    graphEdgeMap,
  };
}

// ---------------------------------------------------------------------------
// Frequency table helper
// ---------------------------------------------------------------------------

function computeSummaryData(allUnits: ChartUnit[]): { tracker: BarDatum[]; status: BarDatum[] } {
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
  const statusOrder = [...STATUS_GROUPS.map((g) => g.id), 'unknown'];
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

  return { tracker: trackerData, status: statusData };
}

// ---------------------------------------------------------------------------
// Build subsidiary groups (layout computation)
// ---------------------------------------------------------------------------

/**
 * Recursively compute layout for a sub-group at any depth.
 * Assumes sg.top is already set. Sets sg.height, sg.bottom, sg.summary_data,
 * and recursively lays out sg.expansion.subGroups if present.
 */
function layoutSubGroup(
  sg: SubsidiaryGroupData,
  expansions: Map<string, SubsidiaryExpansion>,
  intermediaryBottom: number,
  parentPath: string,
  //depth = 1
): void {
  const scopedKey = `${parentPath}::${sg.id}`;
  if (expansions.has(scopedKey)) {
    sg.expansion = expansions.get(scopedKey)!;
  } else {
    sg.expansion = undefined; // clear stale expansion so collapsed state is reflected in layout
  }

  if (sg.expansion && sg.expansion.subGroups.length > 0) {
    // Sub-sub-groups use tighter spacing than top-level groups
    const subGap = LAYOUT.assetSpacing * 2; // 18px between sub-sub-groups
    // Deeper nesting uses compact intermediary widgets so needs less vertical offset
    const startOffset =  intermediaryBottom - 50;
    let ssy = sg.top + startOffset + subGap;
    for (const ssg of sg.expansion.subGroups) {
      ssg.top = ssy;
      layoutSubGroup(ssg, expansions, intermediaryBottom, scopedKey, /*depth + 1*/);
      ssg.bottom = ssg.top + ssg.height;
      ssg.summary_data = computeSummaryData(ssg.locations.flatMap((l) => l.units));
      ssy = ssg.bottom + subGap;
    }
    const lastSsg = sg.expansion.subGroups[sg.expansion.subGroups.length - 1];
    sg.height = lastSsg.bottom - sg.top + subGap;
  } else {
    let ssy = sg.top;
    const nLoc = sg.locations.length;
    for (let j = 0; j < nLoc; j++) {
      const loc = sg.locations[j];
      const nU = loc.units.length;
      const h = nU === 1
        ? LAYOUT.assetMarkHeightSingle
        : Math.max(LAYOUT.assetMarkHeightSingle, LAYOUT.assetMarkHeightCombined * scaleR(nU));
      loc.y = ssy - sg.top + h / 2;
      loc.r = nU === 1
        ? LAYOUT.assetMarkHeightSingle / 2
        : (LAYOUT.assetMarkHeightCombined / 2) * scaleR(nU);
      ssy += h + (j === nLoc - 1 ? 0 : LAYOUT.assetSpacing);
    }
    // Minimum height to fit intermediary path widget — compact widget (depth>1) needs less room
    const subGroupMinH = sg.intermediary_data
      ? ( intermediaryBottom )
      : LAYOUT.subsidiaryMarkHeight + LAYOUT.assetSpacing;
    sg.height = Math.max(ssy - sg.top + LAYOUT.assetSpacing, subGroupMinH);
  }
}

export function buildSubsidiaryGroups(
  chartData: ScreenerChartData,
  expansions: Map<string, SubsidiaryExpansion> = new Map()
): SubsidiaryGroupData[] {
  const groups: Array<[string, ChartUnit[]]> = Array.from(chartData.subsidiariesMatched);
  if (chartData.directlyOwned.length > 0) {
    groups.push(['Directly owned', chartData.directlyOwned]);
  }

  if (groups.length === 0) return [];

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

    if (expansions.has(id)) {
      subData.expansion = expansions.get(id)!;
    }

    return subData;
  });

  // Compute layout heights — start at yPadding/2 (= MARGIN.top in the render) so the
  // first region's bezier top lands exactly at y=0 in the SVG (bottom of the sticky header)
  let y = LAYOUT.yPadding / 2;

  for (const d of subsidiariesData) {
    d.top = y;

    if (d.expansion && d.expansion.subGroups.length > 0) {
      // Reserve space for intermediary path + expand icon before sub-groups.
      // curveR = 60% of yPadding (matches drawIntermediaryPathForItem); icon radius 8.
      const markR = (LAYOUT.subsidiaryMarkHeight / 2) * 0.7;
      const curveR = Math.round(LAYOUT.yPadding * 0.9);
      const intermediaryBottom = 26 + markR * 2 + 18 + curveR + 16;
      let sy = y + intermediaryBottom + LAYOUT.yPadding;
      for (const sg of d.expansion.subGroups) {
        sg.top = sy;
        layoutSubGroup(sg, expansions, intermediaryBottom, d.id);
        sg.bottom = sg.top + sg.height;
        sg.summary_data = computeSummaryData(sg.locations.flatMap((l) => l.units));
        sy = sg.bottom + LAYOUT.yPadding;
      }
      const lastSg = d.expansion.subGroups[d.expansion.subGroups.length - 1];
      d.height = Math.max(lastSg.bottom - d.top + LAYOUT.yPadding, LAYOUT.subsidiaryMinHeight);
    } else {
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
    }

    d.bottom = d.top + d.height;
    y = d.top + d.height + LAYOUT.yPadding;
  }

  // Compute frequency tables (tracker/status bars) for top-level groups
  for (const s of subsidiariesData) {
    const allUnits: ChartUnit[] = [];
    for (const loc of s.locations) allUnits.push(...loc.units);
    s.summary_data = computeSummaryData(allUnits);
  }

  // Compute frequency tables for sub-groups within expanded subsidiaries
  for (const s of subsidiariesData) {
    if (s.expansion) {
      for (const sg of s.expansion.subGroups) {
        const allUnits: ChartUnit[] = [];
        for (const loc of sg.locations) allUnits.push(...loc.units);
        sg.summary_data = computeSummaryData(allUnits);
      }
    }
  }

  return subsidiariesData;
}

// ---------------------------------------------------------------------------
// Fetch sub-graph expansion for a subsidiary
// ---------------------------------------------------------------------------

/**
 * Build sub-group layout data for a subsidiary expansion using the cached graph.
 * Avoids a second API call — all data was already fetched by fetchChartData.
 * Re-uses the parent's ChartUnit objects (same asset metadata, just reorganized).
 */
export function expandSubsidiary(
  subId: string,
  parentUnits: ChartUnit[],
  graphNodeMap: Map<string, GraphNode>,
  graphPaths: Record<string, Array<{ route: string[]; cumulative_pct: number }>>,
  graphEdgeMap?: Map<string, number>,
): SubsidiaryExpansion {
  const parentUnitMap = new Map<string, ChartUnit>(parentUnits.map((u) => [u.id, u]));

  // Single pass over ALL paths to build expansion data for subId at any depth.
  // We find subId's position dynamically using lastIndexOf so this works whether subId
  // is a top-level subsidiary (route[1]) or a deeper node (route[2], route[3], …).
  // Using lastIndexOf guards against circular paths that repeat a node ID.

  const subSubIdSet = new Set<string>();
  const directAssetIdSet = new Set<string>(); // Set prevents duplicates across multi-path assets
  const subToUnitSets = new Map<string, Set<string>>(); // direct-child entity ID → asset IDs
  const ssDescendantEntityIds = new Map<string, Set<string>>();
  const ssMaxDepth = new Map<string, number>();

  for (const [nodeId, nodePaths] of Object.entries(graphPaths)) {
    const node = graphNodeMap.get(nodeId);
    if (!node) continue;

    for (const p of nodePaths) {
      const subIdx = p.route.lastIndexOf(subId);
      if (subIdx < 0) continue; // path doesn't pass through subId

      const childId = p.route[subIdx + 1]; // immediate child of subId in this path
      if (!childId) continue; // subId is terminal in this path

      if (childId === nodeId) {
        // nodeId is a direct child of subId
        if (node.type === 'entity') {
          subSubIdSet.add(nodeId);
        } else if (node.type === 'asset' && parentUnitMap.has(nodeId)) {
          directAssetIdSet.add(nodeId);
        }
      } else if (node.type === 'asset' && parentUnitMap.has(nodeId)) {
        // Asset deeper than a direct child — attribute it to childId (direct child entity)
        const childNode = graphNodeMap.get(childId);
        if (childNode?.type === 'entity') {
          if (!subToUnitSets.has(childId)) subToUnitSets.set(childId, new Set());
          subToUnitSets.get(childId)!.add(nodeId);
        }
      } else if (node.type === 'entity' && nodeId !== subId && childId !== nodeId) {
        // Intermediary entity deeper than the direct child — track under childId
        const childNode = graphNodeMap.get(childId);
        if (childNode?.type === 'entity') {
          if (!ssDescendantEntityIds.has(childId)) ssDescendantEntityIds.set(childId, new Set());
          ssDescendantEntityIds.get(childId)!.add(nodeId);
          const nodeIdx = p.route.lastIndexOf(nodeId);
          const depth = nodeIdx >= 0 ? nodeIdx - subIdx - 1 : 1;
          ssMaxDepth.set(childId, Math.max(ssMaxDepth.get(childId) ?? 0, depth));
        }
      }
    }
  }

  const directAssetIds = [...directAssetIdSet];

  // Assets in parentUnits not reached through any sub-subsidiary → directly owned by subId
  const matchedAssetIds = new Set<string>(directAssetIds);
  for (const ids of subToUnitSets.values()) ids.forEach((id) => matchedAssetIds.add(id));
  const directUnits = [
    ...directAssetIds.map((id) => parentUnitMap.get(id)!).filter(Boolean),
    ...parentUnits.filter((u) => !matchedAssetIds.has(u.id)),
  ];

  // Build SubsidiaryGroupData (no layout yet — buildSubsidiaryGroups will add it)
  function makeGroup(id: string, units: ChartUnit[]): SubsidiaryGroupData {
    const locationMap = new Map<string, ChartUnit[]>();
    for (const unit of units) {
      if (!locationMap.has(unit.locationID)) locationMap.set(unit.locationID, []);
      locationMap.get(unit.locationID)!.push(unit);
    }
    const locations: LocationGroup[] = Array.from(locationMap, ([locId, locUnits]) => {
      locUnits.sort((a, b) => a.name.localeCompare(b.name));
      return { locationID: locId, units: locUnits, y: 0, r: 0 };
    });
    locations.sort((a, b) => a.units[0].name.localeCompare(b.units[0].name));
    const group: SubsidiaryGroupData = { id, locations, top: 0, bottom: 0, height: 0, summary_data: { tracker: [], status: [] } };
    const descendants = ssDescendantEntityIds.get(id);
    if (descendants && descendants.size > 0) {
      group.intermediary_data = { total_descendants: descendants.size, max_generations: ssMaxDepth.get(id) ?? 0 };
    }
    return group;
  }

  const subGroups: SubsidiaryGroupData[] = [];
  for (const ssId of subSubIdSet) {
    const ids = subToUnitSets.get(ssId);
    if (ids?.size) subGroups.push(makeGroup(ssId, [...ids].map((id) => parentUnitMap.get(id)!).filter(Boolean)));
  }
  if (directUnits.length > 0) {
    subGroups.push(makeGroup(`${subId}:direct`, directUnits));
  }

  // entityMap for sub-label rendering
  const entityMap = new Map<string, { id: string; Name: string; type: string }>();
  for (const node of graphNodeMap.values()) {
    if (node.type === 'entity') entityMap.set(node.id, { id: node.id, Name: node.Name, type: 'entity' });
  }
  if (directUnits.length > 0) {
    entityMap.set(`${subId}:direct`, { id: `${subId}:direct`, Name: 'Directly owned', type: 'entity' });
  }

  // matchedEdges: value = cumulative root→ssId % (for pies); directValue = single-hop subId→ssId % (for tooltips)
  const matchedEdges = new Map<string, { source: string; target: string; value: number; directValue?: number }>();
  for (const ssId of subSubIdSet) {
    const ssPathEntries = graphPaths[ssId] ?? [];
    const value = ssPathEntries.reduce((sum, p) => sum + (p.cumulative_pct ?? 0), 0);
    const directValue = graphEdgeMap?.get(`${subId}::${ssId}`);
    matchedEdges.set(ssId, { source: subId, target: ssId, value, directValue });
  }

  return { subGroups, entityMap, matchedEdges };
}
