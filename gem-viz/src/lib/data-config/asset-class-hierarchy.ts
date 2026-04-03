/**
 * Utility for combining asset_class_hierarchy.json with the flat /catalog/asset-classes API list.
 *
 * The hierarchy JSON defines display order and subclass groupings.
 * The flat API list provides labels, URLs, and filter parameters for each entry.
 *
 * NOTE: A small ID mapping handles differences between the old hard-coded IDs and
 * new API IDs. Once the API is updated to use this hierarchy file as its source of
 * truth, this mapping can be removed.
 */

import type { CatalogAssetClass, CatalogClassTree } from '$lib/api/catalog-api';
import hierarchyJson from './asset-class-hierarchy.json';

// ── Types ──────────────────────────────────────────────────────────────────

interface ClassGroup {
  id: string;
  label: string;
  description?: string;
  optionIds: string[];
  /** Per-option label overrides: id → display label (use when same ID needs different text in this group) */
  labels?: Record<string, string>;
}

interface HierarchyAssetClass {
  id: string;
  /** Short description shown on the tile (fallback when catalog entry has none) */
  description?: string;
  /** Flat list of selectable subclass option IDs (no grouping) */
  optionIds?: string[];
  /** Per-option label overrides for flat optionIds */
  labels?: Record<string, string>;
  /** Grouped subclass options */
  classGroups?: ClassGroup[];
}

interface HierarchyCategory {
  id: string;
  label: string;
  assetClasses: HierarchyAssetClass[];
}

// ── Reverse slug → UI tracker name ────────────────────────────────────────
// Used to populate the `tracker` field in ScreenerSelectedClass so downstream
// pages can resolve the API slug via resolveApiSlug(tracker).
// NOTE: When the hierarchy file is API-served, derive this from the catalog metadata.
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

/** Get the primary UI tracker name for a catalog entry (first asset_type in URL). */
export function getUiTrackerFromCatalogEntry(entry: CatalogAssetClass): string {
  const slugs = getAssetTypesFromUrl(entry.url ?? '');
  return slugs.length > 0 ? (API_SLUG_TO_UI_TRACKER[slugs[0]] ?? '') : '';
}

// ── Main API ───────────────────────────────────────────────────────────────

const hierarchy = hierarchyJson as { categories: HierarchyCategory[] };

/** All hierarchy asset class IDs in a flat set, for quick lookup. */
const allHierarchyIds = new Set(
  hierarchy.categories.flatMap((cat) => cat.assetClasses.map((ac) => ac.id))
);

/**
 * Build the category list for the screener tile picker.
 * Returns categories in hierarchy order, each with catalog entries for their tiles.
 * Entries with no `url` (notes: "TBD") are excluded.
 */
export function getHierarchyCategories(
  flatClasses: CatalogAssetClass[],
  searchQuery = ''
): Array<{ id: string; label: string; classes: CatalogAssetClass[] }> {
  const byId = new Map(flatClasses.map((c) => [c.id, c]));
  const q = searchQuery.trim().toLowerCase();

  return hierarchy.categories
    .map((cat) => ({
      id: cat.id,
      label: cat.label,
      classes: cat.assetClasses
        .map((ac) => {
          const entry = byId.get(ac.id);
          if (!entry?.url) return null;
          // Use hierarchy description as fallback when catalog has none
          if (ac.description && !entry.description) {
            return { ...entry, description: ac.description };
          }
          return entry;
        })
        .filter((c): c is CatalogAssetClass => !!c)
        .filter((c) => !q || c.label.toLowerCase().includes(q)),
    }))
    .filter((cat) => cat.classes.length > 0);
}

/**
 * Get all selectable option IDs for a given asset class tile.
 * Returns an empty array for tiles with no subclass options.
 */
export function getHierarchyOptionIds(classId: string): string[] {
  const hClass = hierarchy.categories
    .flatMap((cat) => cat.assetClasses)
    .find((ac) => ac.id === classId);
  if (!hClass) return [];
  if (hClass.optionIds) return hClass.optionIds;
  if (hClass.classGroups) return hClass.classGroups.flatMap((g) => g.optionIds);
  return [];
}

/**
 * Build a CatalogClassTree[] for AssetClassExpansion's `catalogTree` prop.
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
  const hClass = hierarchy.categories
    .flatMap((cat) => cat.assetClasses)
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
      // Single-option group: promote the option directly (no parent wrapper, no refine button)
      if (leaves.length === 1) return leaves;
      // Multi-option group: wrap in a non-selectable parent with children
      return [{
        entry: {
          id: group.id,
          label: group.label,
          category: '',
          description: group.description,
        } as CatalogAssetClass,
        children: leaves,
      }];
    });
  }

  if (hClass.optionIds) {
    return hClass.optionIds
      .map((id) => toLeaf(id, hClass.labels))
      .filter(Boolean) as CatalogClassTree[];
  }

  return [];
}

/**
 * Returns true if a catalog entry is a top-level tile in the hierarchy
 * (vs a subclass option that only appears within a tile's expansion).
 */
export function isHierarchyTile(classId: string): boolean {
  return allHierarchyIds.has(classId);
}
