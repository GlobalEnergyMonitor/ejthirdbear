/**
 * @module exportList
 * @description Manages assets selected for bulk export operations.
 *
 * Persists to localStorage with automatic validation and deduplication.
 *
 * @example
 * import { exportList, isInExportList } from '$lib/exportList';
 *
 * // Add/remove assets
 * exportList.add({ id: 'G123', name: 'Plant Name', tracker: 'Coal Plant' });
 * exportList.remove('G123');
 *
 * // Reactive access
 * $exportList // ExportAsset[]
 *
 * // Check membership
 * if (isInExportList('G123')) { ... }
 */

import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { isValidSlug, sanitizeName } from './slug';
import { STORAGE_KEY_EXPORT_LIST } from './constants';

export interface ExportAsset {
  id: string;
  name: string;
  tracker?: string;
  addedAt: number;
}

const STORAGE_KEY = STORAGE_KEY_EXPORT_LIST;

// Load from localStorage with validation
function loadFromStorage(): ExportAsset[] {
  if (!browser) return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);

    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.error('Export list corrupt: not an array, clearing');
      localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // Filter and validate each entry
    const validated = parsed
      .filter((item): item is ExportAsset => {
        if (!item || typeof item !== 'object') return false;
        if (typeof item.id !== 'string' || !item.id) return false;
        return isValidSlug(item.id);
      })
      .map((item) => ({
        id: item.id,
        name: sanitizeName(item.name),
        tracker: typeof item.tracker === 'string' ? item.tracker : undefined,
        addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now(),
      }));

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated = validated.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    if (deduplicated.length !== parsed.length) {
      console.warn(`Export list cleaned: ${parsed.length} → ${deduplicated.length} items`);
      // Save the cleaned version
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deduplicated));
    }

    return deduplicated;
  } catch (e) {
    console.error('Failed to load export list:', e);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

// Save to localStorage
function saveToStorage(list: ExportAsset[]) {
  if (!browser) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save export list:', e);
  }
}

// Create the store
function createExportListStore() {
  const { subscribe, set, update } = writable<ExportAsset[]>(loadFromStorage());

  // Subscribe to changes and persist
  if (browser) {
    subscribe((list) => saveToStorage(list));
  }

  return {
    subscribe,

    add(asset: { id: string; name: string; tracker?: string }) {
      if (!isValidSlug(asset.id)) {
        console.error('Invalid asset ID, skipping:', asset.id);
        return;
      }
      update((list) => {
        if (list.some((a) => a.id === asset.id)) return list;
        return [
          ...list,
          {
            id: asset.id,
            name: sanitizeName(asset.name),
            tracker: asset.tracker,
            addedAt: Date.now(),
          },
        ];
      });
    },

    addMany(assets: { id: string; name: string; tracker?: string }[]) {
      update((list) => {
        const existingIds = new Set(list.map((a) => a.id));
        const newAssets = assets
          .filter((a) => isValidSlug(a.id) && !existingIds.has(a.id))
          .map((a) => ({
            id: a.id,
            name: sanitizeName(a.name),
            tracker: a.tracker,
            addedAt: Date.now(),
          }));

        if (newAssets.length !== assets.filter((a) => !existingIds.has(a.id)).length) {
          console.warn('Some assets had invalid IDs and were skipped');
        }

        return [...list, ...newAssets];
      });
    },

    remove(id: string) {
      update((list) => list.filter((a) => a.id !== id));
    },

    removeMany(ids: string[]) {
      const idSet = new Set(ids);
      update((list) => list.filter((a) => !idSet.has(a.id)));
    },

    clear() {
      set([]);
    },

    has(id: string): boolean {
      return get({ subscribe }).some((a) => a.id === id);
    },

    getIds(): string[] {
      return get({ subscribe }).map((a) => a.id);
    },

    count(): number {
      return get({ subscribe }).length;
    },
  };
}

export const exportList = createExportListStore();

// Helper to check if an asset is in the list (reactive)
export function isInExportList(id: string): boolean {
  return get(exportList).some((a) => a.id === id);
}
