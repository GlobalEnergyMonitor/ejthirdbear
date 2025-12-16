/**
 * Investigation Cart Store
 *
 * Extends the export list pattern to support both assets (G-prefix) and entities (E-prefix).
 * Used by investigative reporters to collect items and generate co-ownership reports.
 *
 * Storage: Uses 'gem-export-list' key for backward compatibility with existing data.
 * Auto-migrates old asset-only entries by detecting type from ID prefix.
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// Types
export type CartItemType = 'asset' | 'entity';

export interface CartItem {
  id: string; // G100000109409 or E100001000348
  name: string;
  type: CartItemType;
  tracker?: string; // For assets only
  addedAt: number;
  metadata?: {
    country?: string;
    status?: string;
    assetCount?: number; // For entities
    capacity?: number;
  };
}

export interface CartCounts {
  total: number;
  assets: number;
  entities: number;
}

// Constants
const STORAGE_KEY = 'gem-export-list'; // Keep same key for backward compatibility

// Validation helpers
function isValidAssetId(id: string): boolean {
  return /^G\d+$/.test(id);
}

function isValidEntityId(id: string): boolean {
  return /^E\d+$/.test(id);
}

function isValidCartId(id: string): boolean {
  return isValidAssetId(id) || isValidEntityId(id);
}

function detectType(id: string): CartItemType {
  return id.startsWith('G') ? 'asset' : 'entity';
}

function sanitizeName(name: unknown): string {
  if (typeof name !== 'string') return 'Unknown';
  // Remove potentially dangerous characters, keep alphanumeric and common punctuation
  return name.replace(/[<>]/g, '').trim().slice(0, 200) || 'Unknown';
}

// Load from localStorage with validation and migration
function loadFromStorage(): CartItem[] {
  if (!browser) return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);

    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.error('Investigation cart corrupt: not an array, clearing');
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Filter, validate, and migrate each entry
    const validated = parsed
      .filter((item): item is Record<string, unknown> => {
        if (!item || typeof item !== 'object') return false;
        if (typeof item.id !== 'string' || !item.id) return false;
        return isValidCartId(item.id as string);
      })
      .map((item) => {
        const id = item.id as string;
        // Auto-detect type if not present (migration from old format)
        const type: CartItemType =
          item.type === 'asset' || item.type === 'entity' ? item.type : detectType(id);

        return {
          id,
          name: sanitizeName(item.name),
          type,
          tracker: typeof item.tracker === 'string' ? item.tracker : undefined,
          addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
          metadata:
            item.metadata && typeof item.metadata === 'object'
              ? (item.metadata as CartItem['metadata'])
              : undefined,
        };
      });

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated = validated.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Save cleaned/migrated version if different
    if (deduplicated.length !== parsed.length || parsed.some((p) => !p.type)) {
      console.log(`Investigation cart migrated: ${parsed.length} → ${deduplicated.length} items`);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    }

    return deduplicated;
  } catch (e) {
    console.error('Failed to load investigation cart:', e);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

// Save to localStorage
function saveToStorage(list: CartItem[]) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save investigation cart:', e);
  }
}

// Create the store
function createInvestigationCartStore() {
  const { subscribe, set, update } = writable<CartItem[]>(loadFromStorage());

  // Subscribe to changes and persist
  if (browser) {
    subscribe((list) => saveToStorage(list));
  }

  return {
    subscribe,

    /**
     * Add a single item to the cart
     */
    add(item: {
      id: string;
      name: string;
      type?: CartItemType;
      tracker?: string;
      metadata?: CartItem['metadata'];
    }) {
      if (!isValidCartId(item.id)) {
        console.error('Invalid ID format, skipping:', item.id);
        return false;
      }

      const type = item.type || detectType(item.id);

      // Validate type matches ID prefix
      const expectedType = detectType(item.id);
      if (type !== expectedType) {
        console.warn(`Type mismatch for ${item.id}: got ${type}, expected ${expectedType}`);
      }

      let added = false;
      update((list) => {
        if (list.some((a) => a.id === item.id)) return list;
        added = true;
        return [
          ...list,
          {
            id: item.id,
            name: sanitizeName(item.name),
            type: expectedType, // Use detected type for consistency
            tracker: item.tracker,
            metadata: item.metadata,
            addedAt: Date.now(),
          },
        ];
      });
      return added;
    },

    /**
     * Add multiple items to the cart
     */
    addMany(
      items: {
        id: string;
        name: string;
        type?: CartItemType;
        tracker?: string;
        metadata?: CartItem['metadata'];
      }[]
    ): number {
      let addedCount = 0;
      update((list) => {
        const existingIds = new Set(list.map((a) => a.id));
        const newItems = items
          .filter((item) => isValidCartId(item.id) && !existingIds.has(item.id))
          .map((item) => {
            addedCount++;
            return {
              id: item.id,
              name: sanitizeName(item.name),
              type: detectType(item.id),
              tracker: item.tracker,
              metadata: item.metadata,
              addedAt: Date.now(),
            };
          });

        return [...list, ...newItems];
      });
      return addedCount;
    },

    /**
     * Remove a single item by ID
     */
    remove(id: string) {
      update((list) => list.filter((a) => a.id !== id));
    },

    /**
     * Remove multiple items by ID
     */
    removeMany(ids: string[]) {
      const idSet = new Set(ids);
      update((list) => list.filter((a) => !idSet.has(a.id)));
    },

    /**
     * Clear all items
     */
    clear() {
      set([]);
    },

    /**
     * Check if an item is in the cart
     */
    has(id: string): boolean {
      return get({ subscribe }).some((a) => a.id === id);
    },

    /**
     * Get all IDs
     */
    getIds(): string[] {
      return get({ subscribe }).map((a) => a.id);
    },

    /**
     * Get items filtered by type
     */
    getByType(type: CartItemType): CartItem[] {
      return get({ subscribe }).filter((a) => a.type === type);
    },

    /**
     * Get asset IDs only
     */
    getAssetIds(): string[] {
      return get({ subscribe })
        .filter((a) => a.type === 'asset')
        .map((a) => a.id);
    },

    /**
     * Get entity IDs only
     */
    getEntityIds(): string[] {
      return get({ subscribe })
        .filter((a) => a.type === 'entity')
        .map((a) => a.id);
    },

    /**
     * Get total count
     */
    count(): number {
      return get({ subscribe }).length;
    },

    /**
     * Get counts by type
     */
    countByType(): CartCounts {
      const list = get({ subscribe });
      return {
        total: list.length,
        assets: list.filter((a) => a.type === 'asset').length,
        entities: list.filter((a) => a.type === 'entity').length,
      };
    },

    /**
     * Toggle an item (add if not present, remove if present)
     */
    toggle(item: {
      id: string;
      name: string;
      type?: CartItemType;
      tracker?: string;
      metadata?: CartItem['metadata'];
    }): boolean {
      const exists = this.has(item.id);
      if (exists) {
        this.remove(item.id);
        return false; // Now not in cart
      } else {
        this.add(item);
        return true; // Now in cart
      }
    },
  };
}

export const investigationCart = createInvestigationCartStore();

/**
 * Helper to check if an item is in the cart (for reactive use)
 */
export function isInCart(id: string): boolean {
  return get(investigationCart).some((a) => a.id === id);
}

/**
 * Helper to detect item type from ID
 */
export { detectType, isValidAssetId, isValidEntityId, isValidCartId };
