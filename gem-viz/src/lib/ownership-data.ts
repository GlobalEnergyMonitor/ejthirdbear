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
  listEntities,
  type UnifiedGraphResponse,
  type OwnershipGraphResponse,
  type GraphNode,
  type GraphEdge,
} from '$lib/ownership-api';

// ID field mapping by tracker type (preserved for compatibility)
const idFields = new Map([
  ['Bioenergy Power', 'GEM unit ID'],
  ['Coal Plant', 'GEM unit ID'],
  ['Gas Plant', 'GEM unit ID'],
  ['Coal Mine', 'GEM Mine ID'],
  ['Iron Ore Mine', 'GEM Asset ID'],
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
  ['Iron Ore Mine', 'Production 2023 (ttpa)'],
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

export interface SpotlightOwnerData {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, any[]>;
  directlyOwned: any[];
  assets: any[];
  entityMap: Map<string, { id: string; Name: string }>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;
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
    const edges: OwnershipEdge[] = graphData.edges.map((edge: GraphEdge, index: number) => {
      // Determine if this is a leaf edge (connects directly to the asset)
      const isLeafEdge = edge.target === gemAssetId;

      return {
        source: edge.source,
        target: edge.target,
        value: edge.ownership_pct || null,
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
 * Get all subsidiaries and assets owned by an entity (walks DOWN the ownership tree)
 * Uses the Ownership API to fetch the ownership graph for an entity.
 *
 * @param entityId - The GEM entity ID
 * @param entityName - Optional entity name (will be fetched if not provided)
 * @returns Spotlight owner data with subsidiaries and assets, or null if not found
 */
export async function getSpotlightOwnerData(
  entityId: string,
  entityName?: string
): Promise<SpotlightOwnerData | null> {
  try {
    // Fetch the ownership graph going DOWN from this entity
    const graphData: OwnershipGraphResponse = await getEntityGraphDown(entityId);

    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) {
      console.warn(`No ownership data found for entity ${entityId}`);
      return null;
    }

    // Use the root name from the API if entity name not provided
    const effectiveEntityName = entityName || graphData.root?.Name || entityId;

    // Build entity map from all entity nodes
    const entityMap = new Map<string, { id: string; Name: string }>();
    entityMap.set(entityId, { id: entityId, Name: effectiveEntityName });

    // Build matched edges map (ownership percentages)
    const matchedEdges = new Map<string, { value: number | null }>();

    // Group nodes by type
    const entityNodes = graphData.nodes.filter((n) => n.type === 'entity' && n.id !== entityId);
    const assetNodes = graphData.nodes.filter((n) => n.type === 'asset');

    // Add all entities to the entity map
    for (const node of entityNodes) {
      entityMap.set(node.id, { id: node.id, Name: node.Name });
    }

    // Build edge map for direct subsidiaries of the root entity
    const directSubsidiaryIds = new Set<string>();
    for (const edge of graphData.edges) {
      if (edge.source === entityId) {
        directSubsidiaryIds.add(edge.target);
        matchedEdges.set(edge.target, { value: edge.ownership_pct || null });
      }
    }

    // Group assets by their direct owner
    const subsidiariesMatched = new Map<string, any[]>();
    const directlyOwned: any[] = [];

    for (const assetNode of assetNodes) {
      // Find the edge that owns this asset
      const ownerEdge = graphData.edges.find((e) => e.target === assetNode.id);

      if (!ownerEdge) {
        // No owner found, skip
        continue;
      }

      const assetData = {
        id: assetNode.id,
        name: assetNode.Name,
        tracker: 'Unknown', // API doesn't provide tracker type yet
        status: 'Unknown', // API doesn't provide status yet
        country: 'Unknown', // API doesn't provide country yet
      };

      if (ownerEdge.source === entityId) {
        // Directly owned by the root entity
        directlyOwned.push(assetData);
      } else {
        // Owned by a subsidiary
        if (!subsidiariesMatched.has(ownerEdge.source)) {
          subsidiariesMatched.set(ownerEdge.source, []);
        }
        subsidiariesMatched.get(ownerEdge.source)!.push(assetData);
      }
    }

    // Determine asset class from tracker types
    const trackers = new Set<string>();
    const allAssets = [...directlyOwned];
    subsidiariesMatched.forEach((assets) => {
      allAssets.push(...assets);
      assets.forEach((a) => {
        if (a.tracker && a.tracker !== 'Unknown') {
          trackers.add(a.tracker);
        }
      });
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
export async function getTopOwners(limit: number = 20): Promise<any[]> {
  try {
    const response = await listEntities({ limit });

    // Transform to match the old format
    return response.results.map((entity) => ({
      id: entity['Entity ID'],
      name: entity.Name,
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
 * Summarize assets by various dimensions
 * Ported from Observable summarizeAssets2()
 */
export function summarizeAssets(assets: any[]) {
  const uniqueCount = (arr: any[], field: string) => new Set(arr.map((d) => d[field])).size;

  const getStats = (v: any[]) => ({
    assetCount: uniqueCount(v, 'locationID') || uniqueCount(v, 'id'),
    unitCount: uniqueCount(v, 'id'),
    types: new Set(v.map((d) => d.tracker)),
  });

  const rollup = (arr: any[], keyFn: (_d: any) => string) => {
    const map = new Map<string, any[]>();
    arr.forEach((d) => {
      const key = keyFn(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return new Map(Array.from(map.entries()).map(([k, v]) => [k, getStats(v)]));
  };

  return {
    total: getStats(assets),
    byCountry: rollup(assets, (d) => d.country),
    byType: rollup(assets, (d) => d.tracker),
    byStatus: rollup(assets, (d) => d.status?.toLowerCase()),
  };
}

// Export field mappings for backward compatibility
export { idFields, capacityFields };
