/** Asset data layer — fetches from REST API */
import type { AssetSummary } from './ownership-api';

export interface AssetDataResult {
  asset: AssetSummary | null;
  graph: { nodes: GraphNode[]; edges: GraphEdge[]; paths?: Record<string, unknown[]> } | null;
  source: 'api' | 'none';
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

// Shorthand for error results
const fail = (error: string): AssetDataResult => ({
  asset: null,
  graph: null,
  source: 'none',
  error,
});

/** Fetch asset data from REST API */
export async function fetchAssetData(assetId: string): Promise<AssetDataResult> {
  try {
    const { getAsset, getOwnershipGraph, resolveAssetId } = await import('./ownership-api');
    const resolvedId = await resolveAssetId(assetId);

    const [asset, graph] = await Promise.all([
      getAsset(resolvedId),
      getOwnershipGraph({ root: resolvedId, direction: 'up' }),
    ]);
    return {
      asset,
      graph: { nodes: graph.nodes || [], edges: graph.edges || [], paths: graph.paths },
      source: 'api',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown API error';
    if (import.meta.env.DEV) console.warn(`[asset-data] API failed for ${assetId}:`, msg);
    return fail(msg);
  }
}
