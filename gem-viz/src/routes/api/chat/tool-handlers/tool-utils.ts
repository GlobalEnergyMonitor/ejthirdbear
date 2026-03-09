/**
 * Shared types and helpers for tool handlers.
 */

import type { CartItem } from '../tools';

export type ToolArgs = Record<string, unknown>;
export type ToolResult = { success: boolean; data?: unknown; error?: string };
export type ToolHandler = (args: ToolArgs, cart?: CartItem[]) => Promise<ToolResult>;

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

/** Clamp a numeric limit to a safe range */
export function clampLimit(value: unknown, defaultVal: number, max: number): number {
  const n = typeof value === 'number' ? value : defaultVal;
  return Math.max(1, Math.min(n, max));
}
