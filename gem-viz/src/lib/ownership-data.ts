/**
 * GEM Ownership Data Utilities
 * Ported from Observable notebook: bdcdb445752833fa
 *
 * Uses the Ownership REST API for all data access.
 */

import {
  getOwnershipGraph,
  listEntities,
  type GraphNode,
  type GraphEdge,
  type AssetSummary,
} from '$lib/ownership-api';
import { logApiCall } from '$lib/api-log.svelte';

// ============================================================================
// TYPES
// ============================================================================

export interface OwnershipEdge {
  source: string;
  target: string;
  value: number | null;
  type: 'intermediateEdge' | 'leafEdge';
  refUrl: string | null;
  imputedShare: boolean;
  depth: number;
}

export interface EntityNode {
  id: string;
  Name: string;
  type: 'entity' | 'asset';
  [key: string]: unknown;
}

export interface AssetOwnersData {
  assetId: string;
  assetName: string;
  edges: OwnershipEdge[];
  nodes: EntityNode[];
  immediateOwners: unknown[];
  parentOwners: unknown[];
  allEntityIds: string[];
}

export interface SpotlightAsset {
  id: string;
  name: string;
  tracker: string;
  status: string;
  country: string;
  capacityMw?: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SpotlightOwnerData {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, SpotlightAsset[]>;
  directlyOwned: SpotlightAsset[];
  assets: SpotlightAsset[];
  entityMap: Map<string, { id: string; Name: string }>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;
  summary?: {
    totalAssets: number;
    totalCapacityMw: number | null;
    countries: number;
    trackerTypes: number;
  };
  truncated?: boolean; // True if results were limited for performance
  totalCount?: number; // Actual total count before limiting
}

// ============================================================================
// REST API HELPERS
// ============================================================================

/** Convert AssetSummary to the row shape expected by rowToAsset */
function _assetToRow(
  a: AssetSummary,
  ownershipPct?: number | null,
  ownerEntityId?: string | null
): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    tracker: a.facilityType || 'Unknown',
    status: a.status || 'Unknown',
    country: a.country || 'Unknown',
    capacity: a.capacity,
    ownershipShare: ownershipPct ?? null,
    ownerEntityId: ownerEntityId ?? null,
    latitude: a.latitude ?? null,
    longitude: a.longitude ?? null,
  };
}

/** API base URL for direct fetch calls */
const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

/**
 * Fetch entity's owned assets via the /ownership/graph endpoint.
 *
 * This is the only fast way to get entity → assets: a single API call to
 * /ownership/graph?root=ENTITY_ID&direction=down returns both subsidiary
 * entities AND their assets with full metadata (type, status, capacity, etc).
 *
 * @param entityId - Root entity ID
 * @returns Asset rows + entity graph info for building the portfolio
 */
async function fetchOwnershipGraphDown(entityId: string): Promise<{
  success: boolean;
  assets: Record<string, unknown>[];
  entities: Array<{ id: string; name: string }>;
  edges: Array<{ source: string; target: string; value: number | null }>;
  rootName: string;
}> {
  try {
    const fetchUrl = `${API_BASE}/ownership/graph?root=${encodeURIComponent(entityId)}&direction=down&max_depth=5`;
    const t0 = performance.now();
    const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(30_000) });
    logApiCall({ url: fetchUrl, method: 'GET', status: resp.status, durationMs: performance.now() - t0, timestamp: new Date(), error: resp.ok ? undefined : `${resp.status}`, reason: `fetchOwnershipGraphDown ${entityId}` });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    const data = await resp.json();

    const rootName = String(data.root?.name || data.root?.full_name || entityId);
    const assets: Record<string, unknown>[] = [];
    const entities: Array<{ id: string; name: string }> = [];

    for (const node of data.nodes || []) {
      if (node.node_type === 'asset' && node.asset_id) {
        assets.push({
          id: String(node.asset_id),
          name: String(node.asset_name || node.asset_id),
          tracker: String(node.asset_type || 'Unknown'),
          status: String(node.operating_status || 'Unknown'),
          country: String(node.country || 'Unknown'),
          capacity: typeof node.capacity_value === 'number' ? node.capacity_value : null,
          latitude: typeof node.latitude === 'number' ? node.latitude : null,
          longitude: typeof node.longitude === 'number' ? node.longitude : null,
        });
      } else if (node.entity_id) {
        entities.push({
          id: String(node.entity_id),
          name: String(node.name || node.full_name || node.entity_id),
        });
      }
    }

    const edges = (data.edges || []).map((e: Record<string, unknown>) => ({
      source: String(e.source || ''),
      target: String(e.target || ''),
      value: typeof e.value === 'number' ? e.value : null,
    }));

    return { success: true, assets, entities, edges, rootName };
  } catch (err) {
    if (import.meta.env.DEV) console.error(`[fetchOwnershipGraphDown] Failed:`, err);
    return { success: false, assets: [], entities: [], edges: [], rootName: entityId };
  }
}

// ============================================================================
// ASSET OWNERSHIP FUNCTIONS
// ============================================================================

/**
 * Get all owners of an asset (walks UP the ownership tree)
 * Uses the Ownership API to fetch the ownership graph for an asset.
 *
 * @param gemAssetId - The GEM asset ID (e.g., GEM unit ID, ProjectID, etc.)
 * @returns Asset ownership data with edges and nodes, or null if not found
 */
export async function getAssetOwners(gemAssetId: string): Promise<AssetOwnersData | null> {
  try {
    // Fetch the ownership graph going UP from this asset
    const graphData = await getOwnershipGraph({
      root: gemAssetId,
      direction: 'up',
    });

    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      if (import.meta.env.DEV) console.warn(`No ownership data found for asset ${gemAssetId}`);
      return null;
    }

    // Convert API graph to our legacy edge format
    const edges: OwnershipEdge[] = graphData.edges.map((edge: GraphEdge) => {
      // Determine if this is a leaf edge (connects directly to the asset)
      const isLeafEdge = edge.target === gemAssetId;

      return {
        source: edge.source,
        target: edge.target,
        value: edge.value || null,
        type: isLeafEdge ? 'leafEdge' : 'intermediateEdge',
        refUrl: null, // API doesn't provide source URLs yet
        imputedShare: false, // API doesn't provide imputed flag yet
        depth: 0, // Could calculate from graph traversal if needed
      };
    });

    // Get immediate owners (edges that point directly to the asset)
    const immediateOwnerEdges = edges.filter((e) => e.target === gemAssetId);
    const immediateOwners = immediateOwnerEdges.map((edge) => ({
      'Owner GEM Entity ID': edge.source,
      '% Share of Ownership': edge.value,
      'Share Imputed?': edge.imputedShare ? 'imputed value' : null,
    }));

    // Get parent owners (all other edges)
    const parentOwners = edges
      .filter((e) => e.target !== gemAssetId)
      .map((edge) => ({
        parent_id: edge.source,
        child_id: edge.target,
        '% Share of Ownership': edge.value,
        depth: edge.depth,
      }));

    // Extract all entity IDs
    const allEntityIds = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]))).filter(
      (id) => id !== gemAssetId
    );

    // Convert API nodes to our legacy format
    const nodes: EntityNode[] = graphData.nodes
      .filter((node: GraphNode) => node.id !== gemAssetId)
      .map((node: GraphNode) => ({
        id: node.id,
        Name: node.Name,
        type: node.type,
      }));

    // Get asset name from root node
    const assetNode = graphData.nodes.find((n: GraphNode) => n.id === gemAssetId);
    const assetName = assetNode?.Name || gemAssetId;

    return {
      assetId: gemAssetId,
      assetName,
      edges,
      nodes,
      immediateOwners,
      parentOwners,
      allEntityIds,
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error fetching asset owners:', err);
    return null;
  }
}

// ============================================================================
// ENTITY OWNERSHIP FUNCTIONS
// ============================================================================

/**
 * Progressive streaming version of getSpotlightOwnerData
 * Yields updates as data becomes available for a smoother UX.
 *
 * Performance limits for large entities (like BlackRock):
 * - Max 500 direct assets per entity
 * - Max 50 subsidiaries processed
 * - Max 200 assets per subsidiary
 * - Max 5000 total assets
 *
 * @param entityId - The GEM entity ID
 * @param entityName - Optional entity name
 * @yields Progress updates with partial portfolio data
 */
export async function* streamOwnerPortfolio(
  entityId: string,
  entityName?: string
): AsyncGenerator<{
  phase: 'init' | 'direct' | 'subsidiaries' | 'done' | 'error';
  message: string;
  portfolio: SpotlightOwnerData | null;
  error?: string;
}> {
  // Performance limits to prevent browser freeze
  const _MAX_DIRECT_ASSETS = 500;
  const _MAX_SUBSIDIARIES = 50;
  const _MAX_ASSETS_PER_SUBSIDIARY = 200;
  const MAX_TOTAL_ASSETS = 5000;

  const subsidiariesMatched = new Map<string, SpotlightAsset[]>();
  const directlyOwned: SpotlightAsset[] = [];
  const allAssets: SpotlightAsset[] = [];
  const entityMap = new Map<string, { id: string; Name: string }>();
  const matchedEdges = new Map<string, { value: number | null }>();
  const summaryCountries = new Set<string>();
  const summaryTrackers = new Set<string>();
  let summaryCapacity = 0;
  let effectiveEntityName = entityName || entityId;
  let truncated = false;
  let totalAssetCount = 0;

  // Helper to convert API row to SpotlightAsset
  const rowToAsset = (row: Record<string, unknown>): SpotlightAsset => ({
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    tracker: String(row.tracker || 'Unknown'),
    status: String(row.status || 'Unknown'),
    country: String(row.country || 'Unknown'),
    capacityMw: typeof row.capacity === 'number' ? row.capacity : undefined,
    latitude: typeof row.latitude === 'number' ? row.latitude : null,
    longitude: typeof row.longitude === 'number' ? row.longitude : null,
  });

  const addToSummary = (asset: SpotlightAsset) => {
    if (asset.country && asset.country !== 'Unknown') summaryCountries.add(asset.country);
    if (asset.tracker && asset.tracker !== 'Unknown') summaryTrackers.add(asset.tracker);
    if (asset.capacityMw) summaryCapacity += Number(asset.capacityMw) || 0;
  };

  // Helper to build current portfolio state (avoid cloning large structures)
  const buildPortfolio = (): SpotlightOwnerData & { truncated?: boolean; totalCount?: number } => {
    const trackerList = Array.from(summaryTrackers);
    const assetClassName =
      trackerList.length === 1
        ? trackerList[0]
        : trackerList.length > 0
          ? `assets (${trackerList.length} types)`
          : 'assets';

    return {
      spotlightOwner: { id: entityId, Name: effectiveEntityName },
      subsidiariesMatched,
      directlyOwned,
      assets: allAssets,
      entityMap,
      matchedEdges,
      assetClassName,
      summary: {
        totalAssets: allAssets.length,
        totalCapacityMw: summaryCapacity > 0 ? summaryCapacity : null,
        countries: summaryCountries.size,
        trackerTypes: trackerList.length,
      },
      truncated,
      totalCount: totalAssetCount,
    };
  };

  try {
    // Phase 1: Initialize
    yield { phase: 'init', message: 'Loading ownership data...', portfolio: null };

    // Single API call: /ownership/graph returns both entities AND assets
    const graphResult = await fetchOwnershipGraphDown(entityId);

    if (!graphResult.success) {
      yield {
        phase: 'error',
        message: `Failed to load ownership data for ${entityId}`,
        portfolio: null,
        error: 'API request failed',
      };
      return;
    }

    effectiveEntityName = entityName || graphResult.rootName || entityId;
    entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });

    // Build entity map and edge map from graph
    const subsidiaryIds: string[] = [];
    for (const ent of graphResult.entities) {
      if (ent.id !== entityId) {
        entityMap.set(ent.id, { id: ent.id, Name: ent.name });
        subsidiaryIds.push(ent.id);
      }
    }

    for (const edge of graphResult.edges) {
      if (edge.source === entityId) {
        matchedEdges.set(edge.target, { value: edge.value });
      }
    }

    yield {
      phase: 'direct',
      message: `Found ${graphResult.assets.length} assets, ${subsidiaryIds.length} subsidiaries`,
      portfolio: buildPortfolio(),
    };

    // Phase 2: Process assets from graph
    // Assets from the graph don't have direct owner info in the node,
    // but edges connect entities to assets. Build asset→owner map from edges.
    const assetOwnerMap = new Map<string, string>();
    for (const edge of graphResult.edges) {
      // If target is an asset ID (not an entity ID), map it
      if (!entityMap.has(edge.target) && edge.target !== entityId) {
        assetOwnerMap.set(edge.target, edge.source);
      }
    }

    for (const row of graphResult.assets) {
      if (allAssets.length >= MAX_TOTAL_ASSETS) {
        truncated = true;
        break;
      }

      const asset = rowToAsset(row);
      const ownerEntityId = assetOwnerMap.get(String(row.id)) || entityId;

      if (ownerEntityId === entityId) {
        directlyOwned.push(asset);
      } else if (subsidiaryIds.includes(ownerEntityId)) {
        const existing = subsidiariesMatched.get(ownerEntityId) || [];
        existing.push(asset);
        subsidiariesMatched.set(ownerEntityId, existing);
      } else {
        directlyOwned.push(asset);
      }

      allAssets.push(asset);
      addToSummary(asset);
    }

    totalAssetCount = allAssets.length;

    // If no assets and no subsidiaries, entity might not exist
    if (allAssets.length === 0 && subsidiaryIds.length === 0) {
      yield {
        phase: 'error',
        message: `Entity ${entityId} not found or has no ownership data`,
        portfolio: null,
        error: `Entity ${entityId} not found`,
      };
      return;
    }

    yield {
      phase: 'subsidiaries',
      message: `Found ${allAssets.length} assets across ${subsidiaryIds.length} subsidiaries`,
      portfolio: buildPortfolio(),
    };

    // Phase 3: Done
    yield {
      phase: 'done',
      message: `Complete: ${allAssets.length} assets loaded`,
      portfolio: buildPortfolio(),
    };
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error in streamOwnerPortfolio:', err);
    yield {
      phase: 'error',
      message: 'Failed to load entity data',
      portfolio: buildPortfolio(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get all subsidiaries and assets owned by an entity (walks DOWN the ownership tree)
 * Uses REST API for asset queries and entity metadata.
 *
 * Performance limits for large entities:
 * - Max 500 direct assets per entity
 * - Max 50 subsidiaries processed
 * - Max 200 assets per subsidiary
 * - Max 5000 total assets
 *
 * @param entityId - The GEM entity ID
 * @param entityName - Optional entity name (will be fetched if not provided)
 * @returns Spotlight owner data with subsidiaries and assets, or null if not found
 */
export async function getSpotlightOwnerData(
  entityId: string,
  entityName?: string
): Promise<SpotlightOwnerData | null> {
  // Non-streaming version — consumes streamOwnerPortfolio and returns final result
  let portfolio: SpotlightOwnerData | null = null;

  try {
    for await (const update of streamOwnerPortfolio(entityId, entityName)) {
      if (update.portfolio) portfolio = update.portfolio;
      if (update.phase === 'error') return null;
    }
    return portfolio;
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error fetching spotlight owner data:', err);
    return null;
  }
}

/**
 * Get a list of top owners by asset count for demo purposes
 *
 * NOTE: The current API doesn't support sorting entities by asset count.
 * This function returns the first N entities from the API.
 * TODO: Update when API adds sorting/aggregation support.
 *
 * @param limit - Maximum number of owners to return (default: 20)
 * @returns Array of owner entities
 */
interface TopOwner {
  id: string;
  name: string;
  asset_count: number | null;
  ownership_count: number | null;
}

export async function getTopOwners(limit: number = 20): Promise<TopOwner[]> {
  try {
    const response = await listEntities({ limit });

    // Transform to match the old format
    return response.results.map((entity) => ({
      id: entity.id,
      name: entity.name,
      asset_count: null, // Not available from list endpoint
      ownership_count: null,
    }));
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error fetching top owners:', err);
    return [];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format ownership edges for Mermaid diagram
 * Ported from Observable formatForMermaid()
 */
export function formatForMermaid(
  edges: OwnershipEdge[],
  nodeMap: Map<string, { Name: string }>
): string {
  // Dedupe edges by source-target pair
  const seen = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Helper to strip parentheses (Mermaid doesn't like them)
  const stripParens = (s: string) => s.replace(/[()]/g, '');

  // Generate Mermaid lines
  return uniqueEdges
    .map((e, i) => {
      const sourceName = nodeMap.get(e.source)?.Name || e.source;
      const targetName = nodeMap.get(e.target)?.Name || e.target;

      // Handle "natural persons" and "small shareholders" specially
      const sourceId = ['small shareholder(s)', 'natural person(s)'].includes(
        sourceName.toLowerCase()
      )
        ? `${e.source}_${i}`
        : e.source;

      const pctLabel = e.value ? `${e.value.toFixed(1)}%` : '';

      return `${sourceId}(${stripParens(sourceName)})-->|${pctLabel}|${e.target}(${stripParens(targetName)});`;
    })
    .join('\n');
}

/**
 * Generic asset record for summarization
 */
interface SummarizeAsset {
  id?: string;
  locationID?: string;
  tracker?: string;
  country?: string;
  status?: string;
  [key: string]: unknown;
}

interface AssetStats {
  assetCount: number;
  unitCount: number;
  types: Set<string | undefined>;
}

/**
 * Summarize assets by various dimensions
 * Ported from Observable summarizeAssets2()
 */
export function summarizeAssets(assets: SummarizeAsset[]) {
  const uniqueCount = (arr: SummarizeAsset[], field: string) =>
    new Set(arr.map((d) => d[field])).size;

  const getStats = (v: SummarizeAsset[]): AssetStats => ({
    assetCount: uniqueCount(v, 'locationID') || uniqueCount(v, 'id'),
    unitCount: uniqueCount(v, 'id'),
    types: new Set(v.map((d) => d.tracker)),
  });

  const rollup = (arr: SummarizeAsset[], keyFn: (_d: SummarizeAsset) => string) => {
    const map = new Map<string, SummarizeAsset[]>();
    arr.forEach((d) => {
      const key = keyFn(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return new Map(Array.from(map.entries()).map(([k, v]) => [k, getStats(v)]));
  };

  return {
    total: getStats(assets),
    byCountry: rollup(assets, (d) => d.country || 'Unknown'),
    byType: rollup(assets, (d) => d.tracker || 'Unknown'),
    byStatus: rollup(assets, (d) => d.status?.toLowerCase() || 'unknown'),
  };
}
