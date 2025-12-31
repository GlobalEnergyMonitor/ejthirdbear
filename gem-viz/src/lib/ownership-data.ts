/**
 * GEM Ownership Data Utilities
 * Ported from Observable notebook: bdcdb445752833fa
 *
 * These functions fetch ownership data using recursive CTEs in DuckDB
 */

import { query, loadParquetFromPath } from '$lib/duckdb-utils';
import { base } from '$app/paths';

// Helper to get the parquet file path (works in both dev and prod)
const getOwnershipParquetPath = () => `${base}/all_trackers_ownership@1.parquet`;

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
 * Note: Kept for future use, currently only upstream traversal is implemented
 */
function _recursiveEdgesCteDownstream(entityId: string): string {
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
  const idList = immediateOwnerIds.map((id) => `'${id}'`).join(', ');
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

/** Raw ownership record from parquet file */
interface OwnershipRecord {
  'Owner GEM Entity ID'?: string;
  'Immediate Owner Entity ID'?: string;
  '% Share of Ownership'?: number;
  'Share Imputed?'?: string;
  Unit?: string;
  Project?: string;
  [key: string]: unknown;
}

/** Parent owner record from recursive CTE */
interface ParentOwnerRecord {
  parent_id: string;
  child_id: string;
  depth: number;
  '% Share of Ownership'?: number;
  'Data Source URL'?: string;
  'Share Imputed?'?: string;
}

/** Asset for summarization */
export interface SummarizableAsset {
  id: string;
  locationID?: string;
  tracker?: string;
  country?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AssetOwnersData {
  assetId: string;
  assetName: string;
  edges: OwnershipEdge[];
  nodes: EntityNode[];
  immediateOwners: OwnershipRecord[];
  parentOwners: ParentOwnerRecord[];
  allEntityIds: string[];
}

/**
 * Get all owners of an asset (walks UP the ownership tree)
 * Ported from Observable getAssetOwners()
 */
export async function getAssetOwners(gemAssetId: string): Promise<AssetOwnersData | null> {
  try {
    // Load ownership parquet if not already loaded
    await loadParquetFromPath(getOwnershipParquetPath(), 'ownership');

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

    const immediateOwners = immediateResult.data as OwnershipRecord[];
    const immediateOwnerIds = immediateOwners
      .map((d) => d['Owner GEM Entity ID'] || d['Immediate Owner Entity ID'])
      .filter((id): id is string => Boolean(id));

    // Get parent owners recursively
    let parentOwners: ParentOwnerRecord[] = [];
    if (immediateOwnerIds.length > 0) {
      const parentResult = await query(`
        ${recursiveEdgesCteUpstream(immediateOwnerIds)}
        SELECT DISTINCT e.parent as parent_id, e.child as child_id, e.depth
        FROM edges e
      `);

      if (parentResult.success && parentResult.data) {
        parentOwners = parentResult.data as ParentOwnerRecord[];
      }
    }

    // Format as edges
    const edges: OwnershipEdge[] = [
      ...parentOwners.map((d: ParentOwnerRecord) => ({
        source: d.parent_id,
        target: d.child_id,
        value: d['% Share of Ownership'] || null,
        type: 'intermediateEdge' as const,
        refUrl: d['Data Source URL'] || null,
        imputedShare: d['Share Imputed?'] === 'imputed value',
        depth: d.depth,
      })),
      ...immediateOwners.map((d: OwnershipRecord) => ({
        source: d['Owner GEM Entity ID'] || d['Immediate Owner Entity ID'] || '',
        target: gemAssetId,
        value: d['% Share of Ownership'] || null,
        type: 'leafEdge' as const,
        refUrl: null,
        imputedShare: d['Share Imputed?'] === 'imputed value',
        depth: 0,
      })),
    ];

    // Get all entity IDs
    const allEntityIds = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]))).filter(
      (id) => id !== gemAssetId
    );

    // Get entity node data (simplified - would need entity table)
    const nodes: EntityNode[] = allEntityIds.map((id) => ({
      id,
      Name: id, // Would need to look up actual names
      type: 'entity' as const,
    }));

    // Get asset name from first immediate owner record
    const assetName = immediateOwners[0]?.['Unit'] || immediateOwners[0]?.['Project'] || gemAssetId;

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

/** Stats returned by asset summarization */
interface AssetStats {
  assetCount: number;
  unitCount: number;
  types: Set<string | undefined>;
}

/**
 * Summarize assets by various dimensions
 * Ported from Observable summarizeAssets2()
 */
export function summarizeAssets(assets: SummarizableAsset[]) {
  const uniqueCount = (arr: SummarizableAsset[], field: keyof SummarizableAsset) =>
    new Set(arr.map((d) => d[field])).size;

  const getStats = (v: SummarizableAsset[]): AssetStats => ({
    assetCount: uniqueCount(v, 'locationID') || uniqueCount(v, 'id'),
    unitCount: uniqueCount(v, 'id'),
    types: new Set(v.map((d) => d.tracker)),
  });

  const rollup = (
    arr: SummarizableAsset[],
    keyFn: (_d: SummarizableAsset) => string | undefined
  ) => {
    const map = new Map<string, SummarizableAsset[]>();
    arr.forEach((d) => {
      const key = keyFn(d) || 'unknown';
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

/**
 * Get all subsidiaries and assets owned by an entity (walks DOWN the ownership tree)
 * This is for the "spotlight owner" chart view
 */
export interface SpotlightOwnerData {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, unknown[]>;
  directlyOwned: unknown[];
  assets: unknown[];
  entityMap: Map<string, { id: string; Name: string }>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;
}

export async function getSpotlightOwnerData(
  entityId: string,
  entityName?: string
): Promise<SpotlightOwnerData | null> {
  try {
    // Load ownership parquet if not already loaded
    await loadParquetFromPath(getOwnershipParquetPath(), 'ownership');

    // First, find direct subsidiaries of this entity
    const directSubsResult = await query(`
      SELECT DISTINCT
        "Subject Entity ID" as subsidiary_id,
        "Subject Entity Name" as subsidiary_name,
        "% Share of Ownership" as share
      FROM ownership
      WHERE "Interested Party ID" = '${entityId}'
        AND "Subject Entity ID" IS NOT NULL
    `);

    const directSubs = directSubsResult.success ? directSubsResult.data || [] : [];

    // Build entity map
    const entityMap = new Map<string, { id: string; Name: string }>();
    entityMap.set(entityId, { id: entityId, Name: entityName || entityId });

    for (const sub of directSubs) {
      if (sub.subsidiary_id) {
        entityMap.set(sub.subsidiary_id, {
          id: sub.subsidiary_id,
          Name: sub.subsidiary_name || sub.subsidiary_id,
        });
      }
    }

    // Build matched edges map (ownership percentages)
    const matchedEdges = new Map<string, { value: number | null }>();
    for (const sub of directSubs) {
      if (sub.subsidiary_id) {
        matchedEdges.set(sub.subsidiary_id, { value: sub.share || null });
      }
    }

    // Now find assets owned by each subsidiary
    const subsidiaryIds = directSubs
      .map((s: { subsidiary_id?: string }) => s.subsidiary_id)
      .filter(Boolean);
    const subsidiariesMatched = new Map<string, unknown[]>();
    const allAssets: unknown[] = [];

    if (subsidiaryIds.length > 0) {
      const idList = subsidiaryIds.map((id: string) => `'${id}'`).join(', ');
      const assetsResult = await query(`
        SELECT
          "GEM unit ID" as id,
          "Unit" as name,
          "Project" as project,
          "Status" as Status,
          "Tracker" as tracker,
          "Country" as country,
          "Owner GEM Entity ID" as owner_id,
          "Owner" as owner_name,
          "% Share of Ownership" as share
        FROM ownership
        WHERE "Owner GEM Entity ID" IN (${idList})
          AND "GEM unit ID" IS NOT NULL
      `);

      if (assetsResult.success && assetsResult.data) {
        // Group assets by their owner subsidiary
        for (const asset of assetsResult.data) {
          const ownerId = asset.owner_id;
          if (!subsidiariesMatched.has(ownerId)) {
            subsidiariesMatched.set(ownerId, []);
          }
          subsidiariesMatched.get(ownerId)!.push(asset);
          allAssets.push(asset);
        }
      }
    }

    // Also check for directly owned assets
    const directAssetsResult = await query(`
      SELECT
        "GEM unit ID" as id,
        "Unit" as name,
        "Project" as project,
        "Status" as Status,
        "Tracker" as tracker,
        "Country" as country,
        "Owner GEM Entity ID" as owner_id,
        "Owner" as owner_name,
        "% Share of Ownership" as share
      FROM ownership
      WHERE "Owner GEM Entity ID" = '${entityId}'
        AND "GEM unit ID" IS NOT NULL
    `);

    const directlyOwned = directAssetsResult.success ? directAssetsResult.data || [] : [];
    allAssets.push(...directlyOwned);

    // Determine asset class from tracker types
    const trackers = new Set(
      allAssets.map((a) => (a as { tracker?: string }).tracker).filter(Boolean)
    );
    const assetClassName =
      trackers.size === 1 ? Array.from(trackers)[0] : `assets (${trackers.size} types)`;

    return {
      spotlightOwner: { id: entityId, Name: entityName || entityId },
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
 */
export async function getTopOwners(limit: number = 20): Promise<unknown[]> {
  try {
    await loadParquetFromPath(getOwnershipParquetPath(), 'ownership');

    const result = await query(`
      SELECT
        "Owner GEM Entity ID" as id,
        "Owner" as name,
        COUNT(DISTINCT "GEM unit ID") as asset_count,
        COUNT(*) as ownership_count
      FROM ownership
      WHERE "Owner GEM Entity ID" IS NOT NULL
        AND "GEM unit ID" IS NOT NULL
      GROUP BY "Owner GEM Entity ID", "Owner"
      ORDER BY asset_count DESC
      LIMIT ${limit}
    `);

    return result.success ? result.data || [] : [];
  } catch (err) {
    console.error('Error fetching top owners:', err);
    return [];
  }
}

export { idFields, capacityFields };
