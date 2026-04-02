/**
 * Shared types and helpers for tool handlers.
 */

import type { CartItem } from '../tools';

export type ToolArgs = Record<string, unknown>;
export type ToolResult = { success: boolean; data?: unknown; error?: string };
export type ToolHandler = (_args: ToolArgs, _cart?: CartItem[]) => Promise<ToolResult>;

export const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

/** Fetch JSON from API with error handling */
export async function fetchApiJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Build a URL with repeated query params for arrays and JSON formatting by default. */
export function buildApiUrl(
  path: string,
  params?: Record<string, unknown>,
  includeJsonFormat: boolean = true
): string {
  const url = new URL(path.startsWith('http') ? path : `${API_BASE}${path}`);

  if (includeJsonFormat && !url.searchParams.has('format')) {
    url.searchParams.set('format', 'json');
  }

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value == null || value === '') continue;

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item != null && item !== '') {
            url.searchParams.append(key, String(item));
          }
        }
        continue;
      }

      if (typeof value === 'boolean') {
        url.searchParams.set(key, value ? 'true' : 'false');
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

/** Clamp a numeric limit to a safe range */
export function clampLimit(value: unknown, defaultVal: number, max: number): number {
  const n = typeof value === 'number' ? value : defaultVal;
  return Math.max(1, Math.min(n, max));
}
