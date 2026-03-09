/**
 * Recent search persistence for the Command Palette.
 * Manages localStorage read/write with validation.
 */

const STORAGE_KEY = 'gem-recent-searches';
const MAX_RECENT = 10;

export interface RecentItem {
  type: string;
  id: string;
  label: string;
  url?: string;
  sublabel?: string;
}

/** Load recent searches from localStorage, filtering out invalid entries. */
export function loadRecentSearches(): RecentItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    const valid = parsed.filter(
      (r: Record<string, unknown>) => r && r.label && (r.label as string).trim() && r.id
    );
    // Save cleaned list if we filtered out invalid entries
    if (valid.length !== parsed.length) {
      saveRecentSearches(valid);
    }
    return valid;
  } catch {
    return [];
  }
}

/** Save recent searches to localStorage. */
export function saveRecentSearches(items: RecentItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* localStorage may be unavailable */
  }
}

/** Add an item to recent searches (deduplicates by id, caps at MAX_RECENT). */
export function addRecentSearch(item: RecentItem, current: RecentItem[]): RecentItem[] {
  if (!item || !item.label || !item.label.trim() || !item.id) return current;
  const filtered = current.filter((r) => r.id !== item.id);
  const updated = [item, ...filtered].slice(0, MAX_RECENT);
  saveRecentSearches(updated);
  return updated;
}
