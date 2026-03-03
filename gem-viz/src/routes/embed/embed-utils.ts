/**
 * Shared utilities for embed pages.
 * Keeps embed routes DRY — common data loading and error handling.
 */

import { streamOwnerPortfolio, type SpotlightOwnerData } from '$lib/ownership-data';

/** Portfolio shape expected by OwnershipFlower and other components */
export type EmbedPortfolio = SpotlightOwnerData;

/**
 * Load entity portfolio via REST API.
 * Consumes the streamOwnerPortfolio async generator to completion,
 * returning the final portfolio with actual asset data.
 * Used by ownership-flower and asset-ring embeds.
 */
export async function loadEntityPortfolio(entityId: string): Promise<{
  portfolio: EmbedPortfolio;
}> {
  let portfolio: SpotlightOwnerData | null = null;

  for await (const update of streamOwnerPortfolio(entityId)) {
    if (update.portfolio) {
      portfolio = update.portfolio;
    }
    if (update.phase === 'error') {
      throw new Error(update.error || update.message);
    }
  }

  if (!portfolio) {
    throw new Error(`No portfolio data returned for entity ${entityId}`);
  }

  return { portfolio };
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
