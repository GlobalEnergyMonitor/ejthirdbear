/**
 * GEM Ownership Data Utilities
 * Ported from Observable notebook: bdcdb445752833fa
 *
 * Updated to use the Ownership API instead of direct MotherDuck queries.
 * Maintains backward-compatible function signatures where possible.
 */

import {
  getOwnershipGraph,
  getEntityGraphDown,
  getEntityOwned,
  getAsset,
  listEntities,
  type GraphNode,
  type GraphEdge,
  type AssetSummary,
} from '$lib/ownership-api';

// ID field mapping by tracker type (preserved for compatibility)
const idFields = new Map([
  ['Bioenergy Power', 'GEM unit ID'],
  ['Coal Plant', 'GEM unit ID'],
  ['Gas Plant', 'GEM unit ID'],
  ['Coal Mine', 'GEM Mine ID'],
  ['Iron Mine', 'GEM Asset ID'],
  ['Gas Pipeline', 'ProjectID'],
  ['Oil & NGL Pipeline', 'ProjectID'],
  ['Steel Plant', 'Steel Plant ID'],
  ['Cement and Concrete', 'GEM Plant ID'],
]);

// Capacity field mapping (preserved for compatibility)
const capacityFields = new Map([
  ['Bioenergy Power', 'Capacity (MW)'],
  ['Coal Plant', 'Capacity (MW)'],
  ['Gas Plant', 'Capacity (MW)'],
  ['Coal Mine', 'Capacity (Mtpa)'],
  ['Iron Mine', 'Production 2023 (ttpa)'],
  ['Gas Infrastructure', 'CapacityBcm/y'],
  ['Oil Infrastructure', 'CapacityBOEd'],
  ['Steel Plant', 'Nominal crude steel capacity (ttpa)'],
  ['Cement and Concrete', 'Cement Capacity (millions metric tonnes per annum)'],
]);

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
}

export interface SpotlightOwnerData {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, SpotlightAsset[]>;
  directlyOwned: SpotlightAsset[];
  assets: SpotlightAsset[];
  entityMap: Map<string, { id: string; Name: string }>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;
  truncated?: boolean; // True if results were limited for performance
  totalCount?: number; // Actual total count before limiting
}

// ============================================================================
// REST API HELPERS (replacing DuckDB getOwnerAssets/getOwnerAssetCount)
// ============================================================================

/** Convert AssetSummary to the row shape expected by rowToAsset */
function assetToRow(a: AssetSummary, ownershipPct?: number | null): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    tracker: a.facilityType || 'Unknown',
    status: a.status || 'Unknown',
    country: a.country || 'Unknown',
    capacity: a.capacity,
    ownershipShare: ownershipPct ?? null,
  };
}

/** Fetch assets owned by an entity via REST API (replaces DuckDB getOwnerAssets) */
async function fetchOwnerAssets(
  entityId: string,
  limit = 500
): Promise<{ success: boolean; data: Record<string, unknown>[] }> {
  try {
    const owned = await getEntityOwned(entityId);
    const limited = owned.slice(0, limit);
    const results: Record<string, unknown>[] = [];

    // Batch getAsset calls to avoid overwhelming the API
    const BATCH = 15;
    for (let i = 0; i < limited.length; i += BATCH) {
      const batch = limited.slice(i, i + BATCH);
      const settled = await Promise.allSettled(
        batch.map((item) => getAsset(item.entityId))
      );
      for (let j = 0; j < settled.length; j++) {
        const r = settled[j];
        if (r.status === 'fulfilled') {
          results.push(assetToRow(r.value, batch[j].ownershipPct));
        }
      }
    }
    return { success: true, data: results };
  } catch (err) {
    console.error(`[fetchOwnerAssets] Failed for ${entityId}:`, err);
    return { success: false, data: [] };
  }
}

/** Count assets owned by an entity via REST API (replaces DuckDB getOwnerAssetCount) */
async function fetchOwnerAssetCount(entityId: string): Promise<number> {
  try {
    const owned = await getEntityOwned(entityId);
    return owned.length;
  } catch {
    return 0;
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
      console.warn(`No ownership data found for asset ${gemAssetId}`);
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
    console.error('Error fetching asset owners:', err);
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
  const MAX_DIRECT_ASSETS = 500;
  const MAX_SUBSIDIARIES = 50;
  const MAX_ASSETS_PER_SUBSIDIARY = 200;
  const MAX_TOTAL_ASSETS = 5000;

  const subsidiariesMatched = new Map<string, SpotlightAsset[]>();
  const directlyOwned: SpotlightAsset[] = [];
  const allAssets: SpotlightAsset[] = [];
  const entityMap = new Map<string, { id: string; Name: string }>();
  const matchedEdges = new Map<string, { value: number | null }>();
  let effectiveEntityName = entityName || entityId;
  let truncated = false;
  let totalAssetCount = 0;

  // Helper to convert DuckDB row to SpotlightAsset
  const rowToAsset = (row: Record<string, unknown>): SpotlightAsset => ({
    id: String(row.id || ''),
    name: String(row.name || row.id || ''),
    tracker: String(row.tracker || 'Unknown'),
    status: String(row.status || 'Unknown'),
    country: String(row.country || 'Unknown'),
  });

  // Helper to build current portfolio state
  const buildPortfolio = (): SpotlightOwnerData & { truncated?: boolean; totalCount?: number } => {
    const trackers = new Set<string>();
    allAssets.forEach((a) => {
      if (a.tracker && a.tracker !== 'Unknown') trackers.add(a.tracker);
    });

    const assetClassName =
      trackers.size === 1
        ? Array.from(trackers)[0]
        : trackers.size > 0
          ? `assets (${trackers.size} types)`
          : 'assets';

    return {
      spotlightOwner: { id: entityId, Name: effectiveEntityName },
      subsidiariesMatched: new Map(subsidiariesMatched),
      directlyOwned: [...directlyOwned],
      assets: [...allAssets],
      entityMap: new Map(entityMap),
      matchedEdges: new Map(matchedEdges),
      assetClassName,
      truncated,
      totalCount: totalAssetCount,
    };
  };

  try {
    // Phase 1: Initialize
    yield { phase: 'init', message: 'Loading ownership data...', portfolio: null };

    // Phase 2: First get the count to know if this is a large entity
    yield { phase: 'direct', message: 'Checking entity size...', portfolio: null };

    const directCount = await fetchOwnerAssetCount(entityId);
    totalAssetCount = directCount;

    // Now fetch direct assets with limit
    yield {
      phase: 'direct',
      message: `Loading directly owned assets (${directCount} total)...`,
      portfolio: null,
    };

    const directResult = await fetchOwnerAssets(entityId, MAX_DIRECT_ASSETS);

    if (directResult.success && directResult.data) {
      for (const row of directResult.data) {
        const asset = rowToAsset(row);
        directlyOwned.push(asset);
        allAssets.push(asset);
      }
    }

    if (directCount > MAX_DIRECT_ASSETS) {
      truncated = true;
    }

    // Set entity in map
    entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });

    // Yield first batch of data
    const directMsg =
      directCount > MAX_DIRECT_ASSETS
        ? `Loaded ${directlyOwned.length} of ${directCount} directly owned assets (limited for performance)`
        : `Found ${directlyOwned.length} directly owned assets`;

    yield {
      phase: 'direct',
      message: directMsg,
      portfolio: buildPortfolio(),
    };

    // Phase 3: Fetch subsidiaries
    yield {
      phase: 'subsidiaries',
      message: 'Loading subsidiary ownership graph...',
      portfolio: buildPortfolio(),
    };

    // Get entity graph from API
    let subsidiaryIds: string[] = [];
    try {
      const graphData = await Promise.race([
        getEntityGraphDown(entityId).catch((err) => {
          console.error('[streamOwnerPortfolio] API error fetching entity graph:', err);
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)),
      ]);

      if (graphData && graphData.nodes && graphData.nodes.length > 0) {
        effectiveEntityName = entityName || graphData.rootEntityName || entityId;
        entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });

        for (const node of graphData.nodes) {
          if (node.id !== entityId) {
            entityMap.set(node.id, { id: node.id, Name: node.Name });
            subsidiaryIds.push(node.id);
          }
        }

        for (const edge of graphData.edges) {
          if (edge.source === entityId) {
            matchedEdges.set(edge.target, { value: edge.value || null });
          }
        }
      }
    } catch (apiErr) {
      console.warn('[streamOwnerPortfolio] Entity graph API failed:', apiErr);
    }

    // Limit subsidiaries for large entities
    const totalSubsidiaries = subsidiaryIds.length;
    if (subsidiaryIds.length > MAX_SUBSIDIARIES) {
      subsidiaryIds = subsidiaryIds.slice(0, MAX_SUBSIDIARIES);
      truncated = true;
    }

    // Yield update with subsidiary count
    const subMsg =
      totalSubsidiaries > MAX_SUBSIDIARIES
        ? `Found ${totalSubsidiaries} subsidiaries (processing first ${MAX_SUBSIDIARIES} for performance)...`
        : `Found ${subsidiaryIds.length} subsidiaries, loading their assets...`;

    yield {
      phase: 'subsidiaries',
      message: subMsg,
      portfolio: buildPortfolio(),
    };

    // Fetch subsidiary assets in batches and yield progress
    const BATCH_SIZE = 5;
    for (let i = 0; i < subsidiaryIds.length; i += BATCH_SIZE) {
      // Check if we've hit the total asset limit
      if (allAssets.length >= MAX_TOTAL_ASSETS) {
        truncated = true;
        yield {
          phase: 'subsidiaries',
          message: `Reached ${MAX_TOTAL_ASSETS} asset limit for performance. Stopping load.`,
          portfolio: buildPortfolio(),
        };
        break;
      }

      const batch = subsidiaryIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (subId) => {
          const subResult = await fetchOwnerAssets(subId, MAX_ASSETS_PER_SUBSIDIARY);
          if (subResult.success && subResult.data && subResult.data.length > 0) {
            return { subId, assets: subResult.data.map(rowToAsset) };
          }
          return { subId, assets: [] };
        })
      );

      for (const { subId, assets } of batchResults) {
        if (assets.length > 0) {
          // Only add up to the remaining budget
          const remaining = MAX_TOTAL_ASSETS - allAssets.length;
          const toAdd = assets.slice(0, remaining);
          if (toAdd.length < assets.length) {
            truncated = true;
          }
          subsidiariesMatched.set(subId, toAdd);
          allAssets.push(...toAdd);
        }
      }

      // Yield progress update after each batch
      const processedCount = Math.min(i + BATCH_SIZE, subsidiaryIds.length);
      yield {
        phase: 'subsidiaries',
        message: `Processed ${processedCount}/${subsidiaryIds.length} subsidiaries (${allAssets.length} total assets)`,
        portfolio: buildPortfolio(),
      };
    }

    // Phase 4: Done
    const doneMsg = truncated
      ? `Complete: ${allAssets.length} assets loaded (limited for performance, entity has more)`
      : `Complete: ${allAssets.length} assets loaded`;

    yield {
      phase: 'done',
      message: doneMsg,
      portfolio: buildPortfolio(),
    };
  } catch (err) {
    console.error('Error in streamOwnerPortfolio:', err);
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
  // Performance limits to prevent browser freeze
  const MAX_DIRECT_ASSETS = 500;
  const MAX_SUBSIDIARIES = 50;
  const MAX_ASSETS_PER_SUBSIDIARY = 200;
  const MAX_TOTAL_ASSETS = 5000;

  try {
    // First, get assets directly owned by this entity via REST API
    const directResult = await fetchOwnerAssets(entityId, MAX_DIRECT_ASSETS);

    // Build asset list
    const subsidiariesMatched = new Map<string, SpotlightAsset[]>();
    const directlyOwned: SpotlightAsset[] = [];
    const allAssets: SpotlightAsset[] = [];
    const entityMap = new Map<string, { id: string; Name: string }>();
    const matchedEdges = new Map<string, { value: number | null }>();
    let truncated = false;

    // Helper to convert DuckDB row to SpotlightAsset
    const rowToAsset = (row: Record<string, unknown>): SpotlightAsset => ({
      id: String(row.id || ''),
      name: String(row.name || row.id || ''),
      tracker: String(row.tracker || 'Unknown'),
      status: String(row.status || 'Unknown'),
      country: String(row.country || 'Unknown'),
    });

    // Add direct assets
    if (directResult.success && directResult.data) {
      for (const row of directResult.data) {
        const asset = rowToAsset(row);
        directlyOwned.push(asset);
        allAssets.push(asset);
      }
      // Check if we hit the limit
      if (directResult.data.length >= MAX_DIRECT_ASSETS) {
        truncated = true;
      }
    }

    // Try to get entity graph from API (with short timeout fallback)
    let effectiveEntityName = entityName || entityId;
    try {
      const graphData = await Promise.race([
        getEntityGraphDown(entityId).catch((err) => {
          console.error('[getSpotlightOwnerData] API error fetching entity graph:', err);
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000)), // 10s timeout
      ]);

      if (graphData && graphData.nodes && graphData.nodes.length > 0) {
        effectiveEntityName = entityName || graphData.rootEntityName || entityId;
        entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });

        // Get subsidiary IDs and fetch their assets
        let subsidiaryIds: string[] = [];
        for (const node of graphData.nodes) {
          if (node.id !== entityId) {
            entityMap.set(node.id, { id: node.id, Name: node.Name });
            subsidiaryIds.push(node.id);
          }
        }

        // Limit subsidiaries for large entities
        if (subsidiaryIds.length > MAX_SUBSIDIARIES) {
          subsidiaryIds = subsidiaryIds.slice(0, MAX_SUBSIDIARIES);
          truncated = true;
        }

        // Build edge map
        for (const edge of graphData.edges) {
          if (edge.source === entityId) {
            matchedEdges.set(edge.target, { value: edge.value || null });
          }
        }

        // Fetch assets for each subsidiary (in parallel for speed)
        const subPromises = subsidiaryIds.map(async (subId) => {
          const subResult = await fetchOwnerAssets(subId, MAX_ASSETS_PER_SUBSIDIARY);
          if (subResult.success && subResult.data && subResult.data.length > 0) {
            return { subId, assets: subResult.data.map(rowToAsset) };
          }
          return { subId, assets: [] };
        });

        const subResults = await Promise.allSettled(subPromises);
        for (const result of subResults) {
          if (result.status === 'rejected') {
            console.warn('[getSpotlightOwnerData] Subsidiary asset load failed:', result.reason);
            continue;
          }
          const { subId, assets } = result.value;
          if (assets.length > 0) {
            // Only add up to the remaining budget
            const remaining = MAX_TOTAL_ASSETS - allAssets.length;
            if (remaining <= 0) {
              truncated = true;
              break;
            }
            const toAdd = assets.slice(0, remaining);
            if (toAdd.length < assets.length) {
              truncated = true;
            }
            subsidiariesMatched.set(subId, toAdd);
            allAssets.push(...toAdd);
          }
        }
      }
    } catch (apiErr) {
      console.warn('[getSpotlightOwnerData] Entity graph API failed:', apiErr);
      // Continue with just direct assets if graph API fails
    }

    // Always set entity map for main entity
    if (!entityMap.has(entityId)) {
      entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });
    }

    // Determine asset class from tracker types
    const trackers = new Set<string>();
    allAssets.forEach((a) => {
      if (a.tracker && a.tracker !== 'Unknown') {
        trackers.add(a.tracker);
      }
    });

    const assetClassName =
      trackers.size === 1
        ? Array.from(trackers)[0]
        : trackers.size > 0
          ? `assets (${trackers.size} types)`
          : 'assets';

    return {
      spotlightOwner: { id: entityId, Name: effectiveEntityName },
      subsidiariesMatched,
      directlyOwned,
      assets: allAssets,
      entityMap,
      matchedEdges,
      assetClassName,
      truncated,
    };
  } catch (err) {
    console.error('Error fetching spotlight owner data:', err);
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
  asset_count: number;
  ownership_count: number;
}

export async function getTopOwners(limit: number = 20): Promise<TopOwner[]> {
  try {
    const response = await listEntities({ limit });

    // Transform to match the old format
    return response.results.map((entity) => ({
      id: entity.id,
      name: entity.name,
      // Note: asset_count and ownership_count not available from this endpoint
      // These would need to be fetched separately or added to the API
      asset_count: 0,
      ownership_count: 0,
    }));
  } catch (err) {
    console.error('Error fetching top owners:', err);
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

// Export field mappings for backward compatibility
export { idFields, capacityFields };
