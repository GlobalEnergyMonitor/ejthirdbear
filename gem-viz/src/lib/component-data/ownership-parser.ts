/**
 * ============================================================================
 * OWNERSHIP PATH PARSER
 * ============================================================================
 *
 * Parses "Ownership Path" strings from GEM data into graph structures.
 *
 * OWNERSHIP PATH FORMAT:
 * ----------------------
 * GEM stores ownership as text strings showing the chain from ultimate parent
 * to the asset, with ownership percentages at each step:
 *
 *   "Vanguard Group [5%] -> BlackRock Inc [10%] -> RWE AG [100%] -> Asset [100%]"
 *
 * This module parses these strings into:
 * - Graph edges (for D3/Mermaid visualizations)
 * - Flat chains (for simple list displays)
 * - Deduplicated node sets
 *
 * ID GENERATION:
 * --------------
 * Entity names are converted to graph node IDs using sanitizeId() from id-helpers.
 * This handles entities that don't have GEM Entity IDs (E-prefix).
 *
 * CONSUMERS:
 * ----------
 * - OwnershipHierarchy.svelte
 * - MermaidOwnership.svelte
 * - OwnershipExplorerD3.svelte
 * - asset/[id]/+page.svelte
 * - schema.ts (fetchOwnershipChain)
 *
 * ============================================================================
 */

// Import sanitizeId from the canonical source (id-helpers)
// Re-export it so existing imports from this module still work
import { sanitizeId } from './id-helpers';
export { sanitizeId };

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * A parsed segment from an ownership path.
 *
 * @example
 * parseSegment("BlackRock Inc [5.07%]")
 * // Returns: { name: "BlackRock Inc", pct: 5.07 }
 */
export interface ParsedSegment {
  name: string;
  pct: number | null;
}

/**
 * An edge in the ownership graph.
 *
 * Edges go FROM parent TO child (following the arrow direction in paths).
 * The `depth` indicates distance from the asset (0 = directly connected).
 */
export interface OwnershipEdge {
  source: string; // Sanitized ID of parent entity
  target: string; // Sanitized ID of child entity or asset
  value: number | null; // Ownership percentage (null if unknown)
  depth: number; // Distance from the asset (0 = immediate owner)
}

/**
 * A node in the ownership graph.
 */
export interface OwnershipNode {
  id: string; // Sanitized ID (from sanitizeId())
  Name: string; // Original display name
}

/**
 * Complete parsed ownership graph with edges and nodes.
 */
export interface ParsedOwnershipGraph {
  edges: OwnershipEdge[];
  nodes: OwnershipNode[];
}

/**
 * An item in a flat ownership chain (for list displays).
 */
export interface OwnershipChainItem {
  id: string; // Sanitized ID
  name: string; // Display name
  share: number | null; // Ownership percentage
  depth: number; // Distance from asset (0 = asset itself)
}

// ============================================================================
// SEGMENT PARSING
// ============================================================================

/**
 * Parse a single segment from an ownership path.
 *
 * Segments come in two forms:
 * - With percentage: "Company Name [75%]"
 * - Without percentage: "Company Name" or "Company Name [unknown %]"
 *
 * @param seg - A single segment string
 * @returns Parsed segment with name and percentage
 *
 * @example
 * parseSegment("BlackRock Inc [5.07%]")
 * // { name: "BlackRock Inc", pct: 5.07 }
 *
 * parseSegment("Unknown Holdings [unknown %]")
 * // { name: "Unknown Holdings", pct: null }
 *
 * parseSegment("Some Company")
 * // { name: "Some Company", pct: null }
 */
export function parseSegment(seg: string): ParsedSegment {
  // Match pattern: "Name [percentage]" where percentage can be "50%" or "unknown %"
  const match = seg.match(/^(.+?)\s*\[([^\]]+)\]$/);

  if (match) {
    const name = match[1].trim();
    const pctStr = match[2].trim();
    // Handle "unknown %" as null
    const pct = pctStr === 'unknown %' ? null : parseFloat(pctStr);
    return { name, pct };
  }

  // No brackets - just a name with no percentage info
  return { name: seg.trim(), pct: null };
}

// ============================================================================
// GRAPH PARSING
// ============================================================================

/**
 * Parse ownership records into a complete graph structure.
 *
 * Takes an array of records (each with an "Ownership Path" field) and builds
 * a deduplicated graph of edges and nodes.
 *
 * DEDUPLICATION:
 * Multiple ownership paths might share edges (e.g., if an asset has multiple
 * owners who share a common parent). This function deduplicates them.
 *
 * @param ownerRecords - Array of records with 'Ownership Path' field
 * @param targetAssetId - The GEM ID of the asset being visualized
 * @param targetAssetName - The asset name (used to identify terminal node)
 * @returns Graph with deduplicated edges and nodes
 *
 * @example
 * const records = [
 *   { 'Ownership Path': 'Parent [50%] -> Asset [100%]' },
 *   { 'Ownership Path': 'Parent [50%] -> Other [25%] -> Asset [100%]' }
 * ];
 * const graph = parseOwnershipPaths(records, 'G123', 'Asset');
 * // graph.edges: edges for Parent->Asset, Parent->Other, Other->Asset
 * // graph.nodes: nodes for Parent, Other, Asset
 */
export function parseOwnershipPaths(
  ownerRecords: Array<{ 'Ownership Path'?: string; [key: string]: unknown }>,
  targetAssetId: string,
  targetAssetName: string
): ParsedOwnershipGraph {
  const edgeMap = new Map<string, OwnershipEdge>();
  const nodeMap = new Map<string, OwnershipNode>();

  for (const record of ownerRecords) {
    const pathStr = record['Ownership Path'];
    if (!pathStr) continue;

    // Split path into segments: "A -> B -> C" becomes ["A", "B", "C"]
    const segments = pathStr.split(' -> ');
    if (segments.length < 2) continue; // Need at least 2 nodes for an edge

    const parsedSegments = segments.map(parseSegment);

    // Create edges between consecutive segments
    for (let i = 0; i < parsedSegments.length - 1; i++) {
      const source = parsedSegments[i];
      const target = parsedSegments[i + 1];

      // Depth = distance from asset (last segment is depth 0)
      const depth = parsedSegments.length - 1 - i;

      // Generate IDs - use asset's GEM ID if target matches asset name
      const sourceId = sanitizeId(source.name);
      const targetId = target.name === targetAssetName ? targetAssetId : sanitizeId(target.name);

      // Add nodes (deduped by Map)
      if (!nodeMap.has(sourceId)) {
        nodeMap.set(sourceId, { id: sourceId, Name: source.name });
      }
      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, { id: targetId, Name: target.name });
      }

      // Add edge (deduped by key)
      const edgeKey = `${sourceId}->${targetId}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          source: sourceId,
          target: targetId,
          value: target.pct, // Ownership % is on the target segment
          depth,
        });
      }
    }
  }

  return {
    edges: Array.from(edgeMap.values()),
    nodes: Array.from(nodeMap.values()),
  };
}

// ============================================================================
// CHAIN EXTRACTION
// ============================================================================

/**
 * Extract the ownership chain as a simple flat array.
 *
 * When an asset has multiple owners (multiple Ownership Path records),
 * this finds the LONGEST path and returns it as a simple array.
 * Useful for displaying a linear chain without graph complexity.
 *
 * @param ownerRecords - Array of records with 'Ownership Path' field
 * @returns Array of {name, share} from ultimate parent to asset
 *
 * @example
 * const records = [
 *   { 'Ownership Path': 'A [10%] -> B [20%] -> Asset [100%]' },
 *   { 'Ownership Path': 'C [50%] -> Asset [100%]' }
 * ];
 * extractOwnershipChain(records)
 * // Returns the longer chain: [
 * //   { name: 'A', share: 10 },
 * //   { name: 'B', share: 20 },
 * //   { name: 'Asset', share: 100 }
 * // ]
 */
export function extractOwnershipChain(
  ownerRecords: Array<{ 'Ownership Path'?: string; [key: string]: unknown }>
): Array<{ name: string; share: number | null }> {
  let longestPath: ParsedSegment[] = [];

  for (const record of ownerRecords) {
    const pathStr = record['Ownership Path'];
    if (!pathStr) continue;

    const segments = pathStr.split(' -> ').map(parseSegment);
    if (segments.length > longestPath.length) {
      longestPath = segments;
    }
  }

  return longestPath.map((seg) => ({
    name: seg.name,
    share: seg.pct,
  }));
}

/**
 * Extract ownership chain with IDs and depth information.
 *
 * This is the more comprehensive version used by asset pages. It:
 * - Collects ALL unique entities from ALL ownership paths
 * - Assigns sanitized IDs to each
 * - Tracks depth (distance from asset)
 * - Deduplicates by ID
 * - Sorts by depth (ultimate parent first)
 *
 * @param ownerRecords - Array of records with 'Ownership Path' field
 * @returns Sorted array of chain items (ultimate parent first)
 *
 * @example
 * const records = [
 *   { 'Ownership Path': 'Parent [10%] -> Sub [50%] -> Asset [100%]' }
 * ];
 * extractOwnershipChainWithIds(records)
 * // Returns: [
 * //   { id: 'Parent_a1b2', name: 'Parent', share: 10, depth: 2 },
 * //   { id: 'Sub_c3d4', name: 'Sub', share: 50, depth: 1 },
 * //   { id: 'Asset_e5f6', name: 'Asset', share: 100, depth: 0 }
 * // ]
 */
export function extractOwnershipChainWithIds(
  ownerRecords: Array<{ 'Ownership Path'?: string; [key: string]: unknown }>
): OwnershipChainItem[] {
  const seenIds = new Set<string>();
  const chain: OwnershipChainItem[] = [];

  for (const record of ownerRecords) {
    const pathStr = record['Ownership Path'];
    if (!pathStr) continue;

    const segments = pathStr.split(' -> ');
    segments.forEach((segment, i) => {
      const parsed = parseSegment(segment);
      const id = sanitizeId(parsed.name);

      // Deduplicate by ID
      if (!seenIds.has(id)) {
        seenIds.add(id);
        chain.push({
          id,
          name: parsed.name,
          share: parsed.pct,
          depth: segments.length - 1 - i, // 0 = asset, higher = further up chain
        });
      }
    });
  }

  // Sort by depth descending (ultimate parent first, asset last)
  chain.sort((a, b) => b.depth - a.depth);
  return chain;
}
