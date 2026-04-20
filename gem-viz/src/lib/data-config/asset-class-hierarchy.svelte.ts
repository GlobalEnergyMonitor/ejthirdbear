/**
 * Combines /catalog/asset-class-hierarchy (display order + subclass groupings)
 * with /catalog/asset-class-filters (labels, URLs, query params).
 *
 * The API is the sole source of truth — there is no static JSON fallback.
 * Consumers must wait on `hierarchyReady` before reading any helpers, or
 * they'll get empty arrays while the initial load is in flight.
 */

import type { CatalogAssetClass, CatalogClassTree } from '$lib/api/catalog-api';
import { combineChildUrls, fetchAssetClassHierarchy } from '$lib/api/catalog-api';

// ── Types ──────────────────────────────────────────────────────────────────

interface ClassGroup {
  id: string;
  label: string;
  description?: string;
  optionIds: string[];
  /** Per-option label overrides: id → display label */
  labels?: Record<string, string>;
}

interface HierarchyAssetClass {
  id: string;
  label?: string;
  description?: string;
  optionIds?: string[];
  labels?: Record<string, string>;
  classGroups?: ClassGroup[];
  defaultUnchecked?: string[];
}

interface HierarchyCategory {
  id: string;
  label: string;
  assetClasses: HierarchyAssetClass[];
}

// ── Reverse slug → UI tracker name ────────────────────────────────────────
// Used to populate the `tracker` field in ScreenerSelectedClass so downstream
// pages can resolve the API slug via resolveApiSlug(tracker).
// NOTE: When the catalog metadata exposes this mapping, derive it from there.
export const API_SLUG_TO_UI_TRACKER: Record<string, string> = {
  'coal-plant': 'Coal Plant',
  'oil-gas-plant': 'Gas Plant',
  'coal-mine': 'Coal Mine',
  'iron-ore-mine': 'Iron Mine',
  'iron-steel-plant': 'Iron & Steel Plant',
  'gas-pipeline': 'Gas Pipeline',
  'oil-pipeline': 'Oil Pipeline',
  'bioenergy-plant': 'Bioenergy Plant',
  'cement-plant': 'Cement Plant',
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract all asset_type slugs from a catalog URL string. */
export function getAssetTypesFromUrl(url: string): string[] {
  if (!url) return [];
  const params = new URLSearchParams(url.split('?')[1] ?? '');
  return params.getAll('asset_type');
}

/** Primary UI tracker name for a catalog entry (first asset_type in URL). */
export function getUiTrackerFromCatalogEntry(entry: CatalogAssetClass): string {
  const slugs = getAssetTypesFromUrl(entry.url ?? '');
  return slugs.length > 0 ? (API_SLUG_TO_UI_TRACKER[slugs[0]] ?? '') : '';
}

// ── Module-level hierarchy state ──────────────────────────────────────────

/** The loaded hierarchy. Null until the first loadHierarchy() call resolves. */
let _hierarchy = $state<{ categories: HierarchyCategory[] } | null>(null);

/**
 * Reactive signal: becomes true once loadHierarchy() has settled (success or
 * failure). Consumers should gate picker UI on this — rendering against a
 * null/empty hierarchy produces an empty picker.
 */
export const hierarchyState = $state({ ready: false, failed: false });

let _inFlight: Promise<void> | null = null;

/**
 * Load the asset-class hierarchy from the API. Idempotent: concurrent callers
 * share the same in-flight promise. On failure, `hierarchyState.failed = true`
 * and the hierarchy is an empty shell — consumers see the error state but
 * don't crash.
 */
export function loadHierarchy(): Promise<void> {
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    let ok = false;
    try {
      const data = await fetchAssetClassHierarchy();
      if (!data?.categories?.length) {
        _hierarchy = { categories: [] };
        hierarchyState.failed = true;
      } else {
        _hierarchy = data as { categories: HierarchyCategory[] };
        hierarchyState.failed = false;
        ok = true;
      }
    } catch {
      _hierarchy = { categories: [] };
      hierarchyState.failed = true;
    } finally {
      hierarchyState.ready = true;
      // Clear the in-flight cache on failure so the next loadHierarchy()
      // call (e.g. a retry button) actually re-fetches instead of
      // returning the settled-failed promise.
      if (!ok) _inFlight = null;
    }
  })();

  return _inFlight;
}

function getHierarchy(): { categories: HierarchyCategory[] } {
  return _hierarchy ?? { categories: [] };
}

// ── Main API ───────────────────────────────────────────────────────────────

/** Flatten a hierarchy asset class to its leaf option IDs (from classGroups or flat optionIds). */
function getLeafOptionIds(ac: HierarchyAssetClass): string[] {
  if (ac.optionIds) return ac.optionIds;
  if (ac.classGroups) return ac.classGroups.flatMap((g) => g.optionIds);
  return [];
}

/**
 * Build the category list for the screener tile picker.
 *
 * Grouping tiles (those with optionIds/classGroups in the hierarchy) always
 * derive their URL by combining all leaf option URLs — the hierarchy drives
 * the query, not any static URL from the filters list.
 *
 * Leaf tiles (no options) use the filters list URL directly.
 * Tiles with no resolvable URL are excluded.
 */
export function getHierarchyCategories(
  flatClasses: CatalogAssetClass[],
  searchQuery = ''
): Array<{ id: string; label: string; classes: CatalogAssetClass[] }> {
  const byId = new Map(flatClasses.map((c) => [c.id, c]));
  const q = searchQuery.trim().toLowerCase();

  return getHierarchy()
    .categories.map((cat) => ({
      id: cat.id,
      label: cat.label,
      classes: cat.assetClasses
        .map((ac): CatalogAssetClass | null => {
          const leafIds = getLeafOptionIds(ac);

          if (leafIds.length > 0) {
            // Grouping tile: combine child URLs, excluding defaultUnchecked
            const defaultUnchecked = new Set(ac.defaultUnchecked ?? []);
            const defaultIds = leafIds.filter((id) => !defaultUnchecked.has(id));
            const childUrls = defaultIds
              .map((id) => byId.get(id)?.url)
              .filter((u): u is string => !!u);
            const childOwnerUrls = defaultIds
              .map((id) => byId.get(id)?.owners_url)
              .filter((u): u is string => !!u);
            if (childUrls.length === 0) return null;
            // Use hierarchy label, or synthesize from id (e.g. "coal-related" → "Coal Related")
            const label =
              ac.label || ac.id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            return {
              id: ac.id,
              label,
              category: cat.id,
              description: ac.description,
              url: combineChildUrls(childUrls),
              owners_url: combineChildUrls(childOwnerUrls),
            } as CatalogAssetClass;
          }

          // Leaf tile: use filters list entry directly
          const entry = byId.get(ac.id);
          if (!entry?.url) return null;
          return ac.description && !entry.description
            ? { ...entry, description: ac.description }
            : entry;
        })
        .filter((c): c is CatalogAssetClass => !!c)
        .filter((c) => !q || c.label.toLowerCase().includes(q)),
    }))
    .filter((cat) => cat.classes.length > 0);
}

/** Option IDs unchecked by default for a given tile. */
export function getHierarchyDefaultUnchecked(classId: string): string[] {
  const hClass = getHierarchy()
    .categories.flatMap((cat) => cat.assetClasses)
    .find((ac) => ac.id === classId);
  return hClass?.defaultUnchecked ?? [];
}

/** All selectable option IDs for a given asset class tile. Empty if no subclasses. */
export function getHierarchyOptionIds(classId: string): string[] {
  const hClass = getHierarchy()
    .categories.flatMap((cat) => cat.assetClasses)
    .find((ac) => ac.id === classId);
  if (!hClass) return [];
  if (hClass.optionIds) return hClass.optionIds;
  if (hClass.classGroups) return hClass.classGroups.flatMap((g) => g.optionIds);
  return [];
}

/**
 * Build a CatalogClassTree[] for AssetClassExpansion's catalogTree prop.
 *
 * - classGroups → each group becomes a non-selectable parent node; its optionIds are leaves
 * - optionIds (flat) → each option is a leaf node directly
 * - no subclasses → returns []
 */
export function getHierarchyTree(
  classId: string,
  flatClasses: CatalogAssetClass[]
): CatalogClassTree[] {
  const byId = new Map(flatClasses.map((c) => [c.id, c]));
  const hClass = getHierarchy()
    .categories.flatMap((cat) => cat.assetClasses)
    .find((ac) => ac.id === classId);
  if (!hClass) return [];

  const toLeaf = (id: string, labels?: Record<string, string>): CatalogClassTree | null => {
    const entry = byId.get(id);
    if (!entry) return null;
    const overrideLabel = labels?.[id];
    return {
      entry: overrideLabel ? { ...entry, label: overrideLabel } : entry,
      children: [],
    };
  };

  if (hClass.classGroups) {
    return hClass.classGroups.flatMap((group) => {
      const leaves = group.optionIds
        .map((id) => toLeaf(id, group.labels))
        .filter(Boolean) as CatalogClassTree[];
      // Single-option group: promote the option directly (no parent wrapper)
      if (leaves.length === 1) return leaves;
      // Multi-option group: wrap in a non-selectable parent with children
      return [
        {
          entry: {
            id: group.id,
            label: group.label,
            category: '',
            description: group.description,
          } as CatalogAssetClass,
          children: leaves,
        },
      ];
    });
  }

  if (hClass.optionIds) {
    return hClass.optionIds
      .map((id) => toLeaf(id, hClass.labels))
      .filter(Boolean) as CatalogClassTree[];
  }

  return [];
}

/** True if a catalog entry is a top-level tile in the hierarchy. */
export function isHierarchyTile(classId: string): boolean {
  return getHierarchy().categories.some((cat) =>
    cat.assetClasses.some((ac) => ac.id === classId)
  );
}
