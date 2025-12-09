/**
 * GEM Ownership Data Utilities
 * Ported from Observable notebook: bdcdb445752833fa
 *
 * These functions fetch ownership data using recursive CTEs in DuckDB
 */

import { query, loadParquetFromPath } from '$lib/duckdb-utils';

// ID field mapping by tracker type
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

// Capacity field mapping
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

/**
 * Recursive CTE for traversing DOWNSTREAM from an entity to all subsidiaries
 */
function recursiveEdgesCteDownstream(entityId: string): string {
  return `WITH RECURSIVE edges AS (
    SELECT
      o."Interested Party ID" AS parent,
      o."Subject Entity ID" AS child,
      o."Subject Entity ID" AS root_child,
      LIST_VALUE(o."Interested Party ID") AS visited,
      1 AS depth
    FROM ownership o
    WHERE o."Interested Party ID" = '${entityId}'

    UNION ALL

    SELECT
      o."Interested Party ID" AS parent,
      o."Subject Entity ID" AS child,
      e.root_child,
      LIST_APPEND(e.visited, o."Subject Entity ID") AS visited,
      e.depth + 1 AS depth
    FROM ownership o
    JOIN edges e ON o."Interested Party ID" = e.child
    WHERE NOT (o."Subject Entity ID" = ANY(e.visited))
  )`;
}

/**
 * Recursive CTE for traversing UPSTREAM from assets to all parent owners
 */
function recursiveEdgesCteUpstream(immediateOwnerIds: string[]): string {
  const idList = immediateOwnerIds.map(id => `'${id}'`).join(', ');
  return `WITH RECURSIVE edges AS (
    SELECT
      o."Interested Party ID" AS parent,
      o."Subject Entity ID" AS child,
      LIST_VALUE(o."Subject Entity ID") AS visited,
      1 AS depth
    FROM ownership o
    WHERE o."Subject Entity ID" IN (${idList})

    UNION ALL

    SELECT
      o."Interested Party ID" AS parent,
      o."Subject Entity ID" AS child,
      LIST_APPEND(e.visited, o."Subject Entity ID") AS visited,
      e.depth + 1 AS depth
    FROM ownership o
    JOIN edges e ON o."Subject Entity ID" = e.parent
    WHERE NOT (o."Subject Entity ID" = ANY(e.visited))
  )`;
}

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

/**
 * Get all owners of an asset (walks UP the ownership tree)
 * Ported from Observable getAssetOwners()
 */
export async function getAssetOwners(gemAssetId: string): Promise<AssetOwnersData | null> {
  try {
    // Load ownership parquet if not already loaded
    await loadParquetFromPath('/gem-viz/all_trackers_ownership@1.parquet', 'ownership');

    // Get immediate owners of this asset
    const immediateResult = await query(`
      SELECT * FROM ownership
      WHERE "GEM unit ID" = '${gemAssetId}'
        OR "Asset ID" = '${gemAssetId}'
        OR "ProjectID" = '${gemAssetId}'
    `);

    if (!immediateResult.success || !immediateResult.data?.length) {
      console.warn(`No immediate owners found for asset ${gemAssetId}`);
      return null;
    }

    const immediateOwners = immediateResult.data;
    const immediateOwnerIds = immediateOwners
      .map(d => d['Owner GEM Entity ID'] || d['Immediate Owner Entity ID'])
      .filter(Boolean);

    // Get parent owners recursively
    let parentOwners: unknown[] = [];
    if (immediateOwnerIds.length > 0) {
      const parentResult = await query(`
        ${recursiveEdgesCteUpstream(immediateOwnerIds)}
        SELECT DISTINCT e.parent as parent_id, e.child as child_id, e.depth
        FROM edges e
      `);

      if (parentResult.success && parentResult.data) {
        parentOwners = parentResult.data;
      }
    }

    // Format as edges
    const edges: OwnershipEdge[] = [
      ...parentOwners.map((d: any) => ({
        source: d.parent_id,
        target: d.child_id,
        value: d['% Share of Ownership'] || null,
        type: 'intermediateEdge' as const,
        refUrl: d['Data Source URL'] || null,
        imputedShare: d['Share Imputed?'] === 'imputed value',
        depth: d.depth,
      })),
      ...immediateOwners.map((d: any) => ({
        source: d['Owner GEM Entity ID'] || d['Immediate Owner Entity ID'],
        target: gemAssetId,
        value: d['% Share of Ownership'] || null,
        type: 'leafEdge' as const,
        refUrl: null,
        imputedShare: d['Share Imputed?'] === 'imputed value',
        depth: 0,
      })),
    ];

    // Get all entity IDs
    const allEntityIds = Array.from(
      new Set(edges.flatMap(e => [e.source, e.target]))
    ).filter(id => id !== gemAssetId);

    // Get entity node data (simplified - would need entity table)
    const nodes: EntityNode[] = allEntityIds.map(id => ({
      id,
      Name: id, // Would need to look up actual names
      type: 'entity' as const,
    }));

    // Get asset name from first immediate owner record
    const assetName = immediateOwners[0]?.['Unit'] ||
      immediateOwners[0]?.['Project'] ||
      gemAssetId;

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
  const uniqueEdges = edges.filter(e => {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Helper to strip parentheses (Mermaid doesn't like them)
  const stripParens = (s: string) => s.replace(/[()]/g, '');

  // Generate Mermaid lines
  return uniqueEdges.map((e, i) => {
    const sourceName = nodeMap.get(e.source)?.Name || e.source;
    const targetName = nodeMap.get(e.target)?.Name || e.target;

    // Handle "natural persons" and "small shareholders" specially
    const sourceId = ['small shareholder(s)', 'natural person(s)'].includes(sourceName.toLowerCase())
      ? `${e.source}_${i}`
      : e.source;

    const pctLabel = e.value ? `${e.value.toFixed(1)}%` : '';

    return `${sourceId}(${stripParens(sourceName)})-->|${pctLabel}|${e.target}(${stripParens(targetName)});`;
  }).join('\n');
}

/**
 * Summarize assets by various dimensions
 * Ported from Observable summarizeAssets2()
 */
export function summarizeAssets(assets: any[]) {
  const uniqueCount = (arr: any[], field: string) =>
    new Set(arr.map(d => d[field])).size;

  const getStats = (v: any[]) => ({
    assetCount: uniqueCount(v, 'locationID') || uniqueCount(v, 'id'),
    unitCount: uniqueCount(v, 'id'),
    types: new Set(v.map(d => d.tracker)),
  });

  const rollup = (arr: any[], keyFn: (d: any) => string) => {
    const map = new Map<string, any[]>();
    arr.forEach(d => {
      const key = keyFn(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    });
    return new Map(
      Array.from(map.entries()).map(([k, v]) => [k, getStats(v)])
    );
  };

  return {
    total: getStats(assets),
    byCountry: rollup(assets, d => d.country),
    byType: rollup(assets, d => d.tracker),
    byStatus: rollup(assets, d => d.status?.toLowerCase()),
  };
}

export { idFields, capacityFields };
