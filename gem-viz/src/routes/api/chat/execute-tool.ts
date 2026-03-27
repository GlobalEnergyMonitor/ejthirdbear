/**
 * Gembot Tool Executor
 * Thin dispatcher — routes tool calls to domain-specific handlers.
 */

import type { CartItem } from './tools';
import type { ToolHandler } from './tool-handlers/tool-utils';
import { entityHandlers } from './tool-handlers/entity-tools';
import { assetHandlers } from './tool-handlers/asset-tools';
import { analyticsHandlers } from './tool-handlers/analytics-tools';
import { outputHandlers } from './tool-handlers/output-tools';
import { cartHandlers } from './tool-handlers/cart-tools';
import { apiExplorerHandlers } from './tool-handlers/api-explorer-tools';

const handlers: Record<string, ToolHandler> = {
  ...entityHandlers,
  ...assetHandlers,
  ...analyticsHandlers,
  ...outputHandlers,
  ...cartHandlers,
  ...apiExplorerHandlers,
};

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cart?: CartItem[]
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const handler = handlers[name];
    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    return await handler(args, cart);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}
