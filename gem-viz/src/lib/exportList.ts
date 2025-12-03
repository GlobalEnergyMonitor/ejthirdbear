import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export interface ExportAsset {
  id: string;
  name: string;
  tracker?: string;
  addedAt: number;
}

const STORAGE_KEY = 'gem-export-list';

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
    const validated = parsed.filter((item): item is ExportAsset => {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.id !== 'string' || !item.id) return false;
      if (item.id.length > 100) return false;
      // Allow reasonable ID characters
      if (!/^[\w\-\.]+$/.test(item.id)) return false;
      return true;
    }).map(item => ({
      id: item.id,
      name: typeof item.name === 'string' ? item.name.slice(0, 500) : '',
      tracker: typeof item.tracker === 'string' ? item.tracker : undefined,
      addedAt: typeof item.addedAt === 'number' ? item.addedAt : Date.now()
    }));

    // Deduplicate by ID
    const seen = new Set<string>();
    const deduplicated = validated.filter(item => {
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

// Validate asset ID format (alphanumeric, underscores, hyphens)
function isValidId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length > 100) return false; // Sanity check
  // Allow alphanumeric, underscores, hyphens, dots (for composite IDs)
  return /^[\w\-\.]+$/.test(id);
}

// Sanitize asset name to prevent issues
function sanitizeName(name: string | undefined): string {
  if (!name || typeof name !== 'string') return '';
  // Limit length and remove control characters
  return name.slice(0, 500).replace(/[\x00-\x1f\x7f]/g, '');
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
      if (!isValidId(asset.id)) {
        console.error('Invalid asset ID, skipping:', asset.id);
        return;
      }
      update((list) => {
        if (list.some((a) => a.id === asset.id)) return list;
        return [...list, {
          id: asset.id,
          name: sanitizeName(asset.name),
          tracker: asset.tracker,
          addedAt: Date.now()
        }];
      });
    },

    addMany(assets: { id: string; name: string; tracker?: string }[]) {
      update((list) => {
        const existingIds = new Set(list.map((a) => a.id));
        const newAssets = assets
          .filter((a) => isValidId(a.id) && !existingIds.has(a.id))
          .map((a) => ({
            id: a.id,
            name: sanitizeName(a.name),
            tracker: a.tracker,
            addedAt: Date.now()
          }));

        if (newAssets.length !== assets.filter(a => !existingIds.has(a.id)).length) {
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
    }
  };
}

export const exportList = createExportListStore();

// Helper to check if an asset is in the list (reactive)
export function isInExportList(id: string): boolean {
  return get(exportList).some((a) => a.id === id);
}
