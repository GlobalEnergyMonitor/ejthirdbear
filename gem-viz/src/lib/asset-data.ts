/**
 * Asset Data Layer
 * =================
 *
 * Fetches asset data with automatic source selection:
 * 1. REST API (primary) - real-time ownership data
 * 2. MotherDuck (fallback) - cloud DuckDB for bulk data
 *
 * Handles ID format mismatch:
 * - REST API: Uses compound IDs (L100000104107_G100000102961)
 * - MotherDuck: Uses simple IDs (G100000109409, M7043)
 */

import type { AssetSummary } from './ownership-api';

// =============================================================================
// TYPES
// =============================================================================

export interface AssetDataResult {
  asset: AssetSummary | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  source: 'api' | 'motherduck' | 'none';
  error?: string;
}

interface GraphNode {
  id: string;
  Name?: string;
  name?: string;
  type?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  value?: number;
  type?: string;
  depth?: number;
}

// =============================================================================
// ID FORMAT UTILITIES
// =============================================================================

/** Check if an ID is in compound format (L{loc}_G{unit}) */
export function isCompoundId(id: string): boolean {
  return /^L\d+_G\d+$/.test(id);
}

/** Check if an ID is a simple G-prefix (coal plant unit) */
export function isGPrefixId(id: string): boolean {
  return /^G\d+$/.test(id);
}

/** Check if an ID is a simple M-prefix (coal mine) */
export function isMPrefixId(id: string): boolean {
  return /^M\d+$/.test(id);
}

/** Extract the G-prefix unit ID from a compound ID */
export function extractUnitId(compoundId: string): string {
  if (isCompoundId(compoundId)) {
    return compoundId.split('_')[1];
  }
  return compoundId;
}

// =============================================================================
// DATA FETCHING
// =============================================================================

/**
 * Fetch asset data from the best available source.
 *
 * Strategy:
 * 1. Try REST API first (with automatic ID resolution for G-prefix)
 * 2. If API fails, try MotherDuck
 * 3. If both fail, return error
 *
 * @param assetId - The asset ID (G-prefix, M-prefix, or compound L_G)
 */
export async function fetchAssetData(assetId: string): Promise<AssetDataResult> {
  // Try REST API first
  const apiResult = await tryAPI(assetId);
  if (apiResult.source === 'api') {
    return apiResult;
  }

  // API failed - try MotherDuck
  console.log(`[asset-data] API failed for ${assetId}, trying MotherDuck`);
  const motherDuckResult = await tryMotherDuck(assetId);
  if (motherDuckResult.source === 'motherduck') {
    return motherDuckResult;
  }

  // Both failed
  return {
    asset: null,
    graph: null,
    source: 'none',
    error: `API: ${apiResult.error} | MotherDuck: ${motherDuckResult.error}`,
  };
}

// =============================================================================
// REST API
// =============================================================================

async function tryAPI(assetId: string): Promise<AssetDataResult> {
  try {
    const { getAsset, getOwnershipGraph, resolveAssetId } = await import('./ownership-api');

    // Resolve G-prefix to compound ID if needed
    const resolvedId = await resolveAssetId(assetId);
    if (resolvedId !== assetId) {
      console.log(`[asset-data] Resolved ${assetId} → ${resolvedId}`);
    }

    // Fetch asset and graph in parallel
    const [asset, graphResponse] = await Promise.all([
      getAsset(resolvedId),
      getOwnershipGraph({ root: resolvedId, direction: 'up', max_depth: 12 }),
    ]);

    return {
      asset,
      graph: {
        nodes: graphResponse.nodes || [],
        edges: graphResponse.edges || [],
      },
      source: 'api',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown API error';
    console.warn(`[asset-data] API failed for ${assetId}:`, message);
    return {
      asset: null,
      graph: null,
      source: 'none',
      error: message,
    };
  }
}

// =============================================================================
// MOTHERDUCK
// =============================================================================

async function tryMotherDuck(assetId: string): Promise<AssetDataResult> {
  try {
    const motherduck = await import('./motherduck-wasm');

    // New MotherDuck table has different column names:
    // Asset ID, Asset Unit ID, Asset Type, Asset Name, Immediate Owner Entity Name/ID, % Share of Ownership
    const assetResult = await motherduck.query<{
      id: string;
      name: string;
      asset_type: string;
      country: string;
      owner: string;
      owner_entity_id: string;
      share: number;
    }>(`
      SELECT DISTINCT
        "Asset ID" as id,
        "Asset Name" as name,
        "Asset Type" as asset_type,
        "Country" as country,
        "Immediate Owner Entity Name" as owner,
        "Immediate Owner Entity ID" as owner_entity_id,
        "% Share of Ownership" as share
      FROM gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership
      WHERE "Asset ID" = '${assetId.replace(/'/g, "''")}'
      LIMIT 10
    `);

    if (!assetResult.success || !assetResult.data?.length) {
      return {
        asset: null,
        graph: null,
        source: 'none',
        error: `Asset '${assetId}' not found in MotherDuck`,
      };
    }

    const firstRow = assetResult.data[0];
    const owners = assetResult.data.filter((r) => r.owner);

    const asset: AssetSummary = {
      id: String(firstRow.id || assetId),
      name: String(firstRow.name || ''),
      facilityType: String(firstRow.asset_type || ''),
      status: '', // Status column may not exist in new MotherDuck schema
      capacity: null, // Capacity column may not exist in new schema
      capacityUnit: 'MW',
      country: firstRow.country ? String(firstRow.country) : null,
      latitude: null,
      longitude: null,
      ownerName: owners[0]?.owner || null,
      ownerEntityId: owners[0]?.owner_entity_id || null,
      parentName: null,
      parentEntityId: null,
      raw: { ...firstRow },
    };

    const nodes: GraphNode[] = [
      { id: assetId, Name: asset.name, type: 'asset' },
      ...owners.map((o) => ({
        id: String(o.owner_entity_id || `owner-${o.owner}`),
        Name: String(o.owner || ''),
        type: 'entity',
      })),
    ];

    const edges: GraphEdge[] = owners.map((o) => ({
      source: String(o.owner_entity_id || `owner-${o.owner}`),
      target: assetId,
      value: Number(o.share) || 0,
    }));

    console.log(`[asset-data] MotherDuck loaded asset ${assetId} with ${owners.length} owners`);

    return {
      asset,
      graph: { nodes, edges },
      source: 'motherduck',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown MotherDuck error';
    console.warn(`[asset-data] MotherDuck failed for ${assetId}:`, message);
    return {
      asset: null,
      graph: null,
      source: 'none',
      error: message,
    };
  }
}
