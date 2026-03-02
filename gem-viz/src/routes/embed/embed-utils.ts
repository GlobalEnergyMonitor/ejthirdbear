/**
 * Shared utilities for embed pages.
 * Keeps embed routes DRY — common data loading and error handling.
 */

import { getEntityWithPortfolio, graphToExplorerData } from '$lib/ownership-api';

/** Portfolio shape expected by OwnershipFlower and other components */
export interface EmbedPortfolio {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, unknown[]>;
  directlyOwned: unknown[];
  matchedEdges: Map<string, { value: number | null }>;
  entityMap: Map<string, { id: string; Name: string; type: string }>;
  assets: unknown[];
}

/** Subsidiary info extracted from entity owned data */
export interface EmbedSubsidiary {
  id: string;
  name: string;
  ownershipPct: number | null;
}

/**
 * Load entity portfolio via REST API.
 * Used by entity, ownership-flower, and asset-ring embeds.
 */
export async function loadEntityPortfolio(entityId: string): Promise<{
  portfolio: EmbedPortfolio;
  subsidiaries: EmbedSubsidiary[];
}> {
  const { entity, owned, graphDown } = await getEntityWithPortfolio(entityId);
  const explorerData = graphToExplorerData(entityId, entity.name, graphDown);

  return {
    portfolio: {
      spotlightOwner: explorerData.spotlightOwner,
      subsidiariesMatched: new Map(explorerData.subsidiariesMatched),
      directlyOwned: explorerData.directlyOwned,
      matchedEdges: new Map(explorerData.matchedEdges),
      entityMap: new Map(explorerData.entityMap),
      assets: explorerData.assets,
    },
    subsidiaries: (owned || []).map((o) => ({
      id: o.entityId,
      name: o.entityName,
      ownershipPct: o.ownershipPct,
    })),
  };
}

/** Extract a clean error message from any thrown value, stripping raw API JSON */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Extract "detail" from raw API error JSON
    const detailMatch = msg.match(/"detail"\s*:\s*"([^"]+)"/);
    if (detailMatch) return detailMatch[1];
    // Strip "API error (NNN): " prefix and any remaining JSON
    const stripped = msg.replace(/^API error \(\d+\):\s*/, '');
    // If what remains looks like raw JSON, use the fallback
    if (stripped.startsWith('{') || stripped.startsWith('[')) return fallback;
    return stripped || fallback;
  }
  if (typeof err === 'string') return err;
  return fallback;
}

/** Parse an integer URL param with a default */
export function intParam(value: string | null, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/** Parse a boolean URL param (default true, only false if explicitly "false") */
export function boolParam(value: string | null, defaultValue = true): boolean {
  if (value === null) return defaultValue;
  return value !== 'false';
}
