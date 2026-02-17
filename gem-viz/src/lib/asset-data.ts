/** Asset data layer — fetches from REST API (primary) with MotherDuck fallback */
import type { AssetSummary } from './ownership-api';

export interface AssetDataResult {
  asset: AssetSummary | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; paths?: Record<string, any[]> } | null;
  source: 'api' | 'motherduck' | 'none';
  error?: string;
}

interface GraphNode { id: string; Name?: string; name?: string; type?: string; }
interface GraphEdge { source: string; target: string; value?: number; type?: string; depth?: number; }

// ID format utilities (REST API uses compound L_G, app uses simple G/M prefixes)
export const isCompoundId = (id: string) => /^L\d+_G\d+$/.test(id);
export const isGPrefixId = (id: string) => /^G\d+$/.test(id);
export const isMPrefixId = (id: string) => /^M\d+$/.test(id);
export const extractUnitId = (id: string) => isCompoundId(id) ? id.split('_')[1] : id;

// Shorthand for error results
const fail = (error: string): AssetDataResult => ({ asset: null, graph: null, source: 'none', error });

/** Fetch asset data — tries REST API first, falls back to MotherDuck */
export async function fetchAssetData(assetId: string): Promise<AssetDataResult> {
  const apiResult = await tryAPI(assetId);
  if (apiResult.source === 'api') return apiResult;

  console.warn(`[asset-data] API failed for ${assetId}, trying MotherDuck`);
  const mdResult = await tryMotherDuck(assetId);
  if (mdResult.source === 'motherduck') return mdResult;

  return fail(`API: ${apiResult.error} | MotherDuck: ${mdResult.error}`);
}

async function tryAPI(assetId: string): Promise<AssetDataResult> {
  try {
    const { getAsset, getOwnershipGraph, resolveAssetId } = await import('./ownership-api');
    const resolvedId = await resolveAssetId(assetId);

    const [asset, graph] = await Promise.all([
      getAsset(resolvedId),
      getOwnershipGraph({ root: resolvedId, direction: 'up', max_depth: 12 }),
    ]);
    return { asset, graph: { nodes: graph.nodes || [], edges: graph.edges || [], paths: graph.paths }, source: 'api' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown API error';
    console.warn(`[asset-data] API failed for ${assetId}:`, msg);
    return fail(msg);
  }
}

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
      return fail(`Asset '${assetId}' not found in MotherDuck`);
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
    const msg = err instanceof Error ? err.message : 'Unknown MotherDuck error';
    console.warn(`[asset-data] MotherDuck failed for ${assetId}:`, msg);
    return fail(msg);
  }
}
