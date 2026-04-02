/**
 * Investigation cart tool handlers.
 */

import type { CartItem } from '../tools';
import type { ToolArgs, ToolResult, ToolHandler } from './tool-utils';

async function getInvestigationCart(args: ToolArgs, cart?: CartItem[]): Promise<ToolResult> {
  void args;
  const items = cart || [];
  const assetItems = items.filter((i) => i.type === 'asset');
  const entityItems = items.filter((i) => i.type === 'entity');
  return {
    success: true,
    data: {
      type: 'cart_read',
      action: 'get',
      total: items.length,
      assets: assetItems.map((i) => ({ id: i.id, name: i.name, tracker: i.tracker })),
      entities: entityItems.map((i) => ({ id: i.id, name: i.name })),
      summary:
        items.length === 0
          ? 'Cart is empty'
          : `${items.length} items: ${assetItems.length} assets, ${entityItems.length} entities`,
    },
  };
}

async function addToCart(args: ToolArgs): Promise<ToolResult> {
  const items = args.items as Array<{
    id: string;
    name: string;
    type: 'asset' | 'entity';
    tracker?: string;
    metadata?: { country?: string; status?: string; capacity?: number };
  }>;

  if (!items || items.length === 0) {
    return { success: false, error: 'No items provided to add' };
  }

  return {
    success: true,
    data: {
      type: 'cart_write',
      action: 'add',
      items,
      message: `Adding ${items.length} item(s) to investigation cart...`,
    },
  };
}

async function removeFromCart(args: ToolArgs): Promise<ToolResult> {
  const ids = args.ids as string[];

  if (!ids || ids.length === 0) {
    return { success: false, error: 'No IDs provided to remove' };
  }

  return {
    success: true,
    data: {
      type: 'cart_write',
      action: 'remove',
      ids,
      message: `Removing ${ids.length} item(s) from investigation cart...`,
    },
  };
}

async function clearCart(): Promise<ToolResult> {
  return {
    success: true,
    data: {
      type: 'cart_write',
      action: 'clear',
      message: 'Clearing investigation cart...',
    },
  };
}

export const cartHandlers: Record<string, ToolHandler> = {
  get_investigation_cart: getInvestigationCart,
  add_to_cart: addToCart,
  remove_from_cart: removeFromCart,
  clear_cart: clearCart,
};
