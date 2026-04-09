/**
 * Widget data loading utilities.
 * Standalone version of embed-utils.ts + ownership-data.ts patterns
 * that uses widget-api.ts instead of ownership-api.ts.
 */

import { getEntity, getOwnershipGraph, type GraphNode } from './widget-api';

// ============================================================================
// TYPES
// ============================================================================

export interface SpotlightAsset {
  id: string;
  name: string;
  tracker: string;
  status: string;
  capacityMw: number;
  country: string;
  share: number | null;
  lat?: number | null;
  lon?: number | null;
}

export interface EmbedPortfolio {
  spotlightOwner: { id: string; Name: string } | null;
  assets: SpotlightAsset[];
  entityMap: Map<string, { id: string; Name: string; type: string }>;
  matchedEdges: Map<string, { value: number | null }>;
}

// ============================================================================
// LOAD ENTITY PORTFOLIO (simplified from ownership-data.ts streamOwnerPortfolio)
// ============================================================================

/**
 * Load entity portfolio via graph endpoint.
 * Uses the same /ownership/graph?direction=down approach as the main app.
 */
export async function loadEntityPortfolio(
  entityId: string
): Promise<{ portfolio: EmbedPortfolio }> {
  // Fetch entity details + downstream graph in parallel
  const [entity, graphDown] = await Promise.all([
    getEntity(entityId),
    getOwnershipGraph({ root: entityId, direction: 'down' }),
  ]);

  const entityName = entity?.name || entityId;

  // Extract assets from graph nodes
  const assets: SpotlightAsset[] = [];
  const entityMap = new Map<string, { id: string; Name: string; type: string }>();
  const matchedEdges = new Map<string, { value: number | null }>();

  for (const node of graphDown.nodes) {
    if (node.type === 'asset') {
      const raw = node as GraphNode & Record<string, unknown>;
      assets.push({
        id: node.id,
        name: node.Name,
        tracker: (raw.asset_type as string) || 'Unknown',
        status: (raw.operating_status as string) || (raw.status as string) || 'Unknown',
        capacityMw: Number(raw.capacity_value || raw.capacity || 0),
        country: (raw.country as string) || '',
        share: null,
        lat: raw.latitude != null ? Number(raw.latitude) : null,
        lon: raw.longitude != null ? Number(raw.longitude) : null,
      });
    } else {
      entityMap.set(node.id, { id: node.id, Name: node.Name, type: 'entity' });
    }
  }

  // Build edge lookup for ownership percentages
  for (const edge of graphDown.edges) {
    matchedEdges.set(edge.target, { value: edge.value ?? null });
  }

  return {
    portfolio: {
      spotlightOwner: { id: entityId, Name: entityName },
      assets,
      entityMap,
      matchedEdges,
    },
  };
}

// ============================================================================
// HELPERS (from embed-utils.ts)
// ============================================================================

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message;
    const detailMatch = msg.match(/"detail"\s*:\s*"([^"]+)"/);
    if (detailMatch) return detailMatch[1];
    const stripped = msg.replace(/^API error \(\d+\):\s*/, '');
    if (stripped.startsWith('{') || stripped.startsWith('[')) return fallback;
    return stripped || fallback;
  }
  if (typeof err === 'string') return err;
  return fallback;
}
