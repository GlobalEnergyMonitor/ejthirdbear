/**
 * Ownership Path Parser
 *
 * Parses "Ownership Path" strings from GEM data into graph edges and nodes.
 * Format: "Parent [50%] -> Subsidiary [75%] -> Asset [100%]"
 *
 * Used by: OwnershipHierarchy, MermaidOwnership, asset/[id]/+page.svelte
 */

export interface ParsedSegment {
  name: string;
  pct: number | null;
}

export interface OwnershipEdge {
  source: string;
  target: string;
  value: number | null;
  depth: number;
}

export interface OwnershipNode {
  id: string;
  Name: string;
}

export interface ParsedOwnershipGraph {
  edges: OwnershipEdge[];
  nodes: OwnershipNode[];
}

/**
 * Parse a single ownership path segment like "Company Name [75%]"
 */
export function parseSegment(seg: string): ParsedSegment {
  const match = seg.match(/^(.+?)\s*\[([^\]]+)\]$/);
  if (match) {
    const name = match[1].trim();
    const pctStr = match[2].trim();
    const pct = pctStr === 'unknown %' ? null : parseFloat(pctStr);
    return { name, pct };
  }
  return { name: seg.trim(), pct: null };
}

/**
 * Sanitize a name into a valid graph node ID
 */
export function sanitizeId(name: string, maxLen = 50): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_').slice(0, maxLen);
}

/**
 * Parse ownership records into a graph structure.
 *
 * @param ownerRecords - Array of records with 'Ownership Path' field
 * @param targetAssetId - The asset ID being visualized
 * @param targetAssetName - The asset name (used to identify terminal node)
 * @returns Graph with deduplicated edges and nodes
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

    const segments = pathStr.split(' -> ');
    if (segments.length < 2) continue;

    const parsedSegments = segments.map(parseSegment);

    for (let i = 0; i < parsedSegments.length - 1; i++) {
      const source = parsedSegments[i];
      const target = parsedSegments[i + 1];
      const depth = parsedSegments.length - 1 - i; // Distance from asset

      const sourceId = sanitizeId(source.name);
      const targetId = target.name === targetAssetName ? targetAssetId : sanitizeId(target.name);

      if (!nodeMap.has(sourceId)) {
        nodeMap.set(sourceId, { id: sourceId, Name: source.name });
      }
      if (!nodeMap.has(targetId)) {
        nodeMap.set(targetId, { id: targetId, Name: target.name });
      }

      const edgeKey = `${sourceId}->${targetId}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, {
          source: sourceId,
          target: targetId,
          value: target.pct,
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

/**
 * Extract the direct ownership chain as a flat array (for simple display).
 * Returns names with percentages from ultimate parent to asset.
 */
export function extractOwnershipChain(
  ownerRecords: Array<{ 'Ownership Path'?: string; [key: string]: unknown }>
): Array<{ name: string; share: number | null }> {
  // Find the longest path (most complete ownership chain)
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
