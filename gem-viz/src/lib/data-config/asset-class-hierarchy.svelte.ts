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
import { combineChildUrls } from '$lib/api/catalog-api';
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

// ── Module-level hierarchy cache ───────────────────────────────────────────

// Loaded from static JSON for now. TODO: switch to fetchAssetClassHierarchy() once API engineer
// deploys hierarchy_cleaned.json and filters_cleaned.json to the catalog endpoints.
let _hierarchy: { categories: HierarchyCategory[] } = $state(
  hierarchyJson as { categories: HierarchyCategory[] }
);

/** No-op until API is updated — hierarchy is loaded from static JSON. */
// eslint-disable-next-line @typescript-eslint/no-empty-function
export async function loadHierarchy(): Promise<void> {}

function getHierarchy(): { categories: HierarchyCategory[] } {
  return _hierarchy;
}

// ── Main API ───────────────────────────────────────────────────────────────

/** Collect all leaf option IDs from a hierarchy asset class (flattening classGroups). */
function getLeafOptionIds(ac: HierarchyAssetClass): string[] {
  if (ac.optionIds) return ac.optionIds;
  if (ac.classGroups) return ac.classGroups.flatMap((g: ClassGroup) => g.optionIds);
  return [];
}

/**
 * Build the category list for the screener tile picker.
 *
 * Grouping tiles (those with optionIds/classGroups in the hierarchy) always derive
 * their URL by combining all leaf option URLs — the hierarchy definition drives the
 * query, not any static URL that may exist in the filters list.
 * Labels for grouping tiles come from the hierarchy's `label` field (set in hierarchy API).
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

  return getHierarchy().categories
    .map((cat: HierarchyCategory) => ({
      id: cat.id,
      label: cat.label,
      classes: cat.assetClasses
        .map((ac: HierarchyAssetClass): CatalogAssetClass | null => {
          const leafIds = getLeafOptionIds(ac);

          if (leafIds.length > 0) {
            // Grouping tile: derive URL from combined leaf option URLs
            const childUrls = leafIds.map((id: string) => byId.get(id)?.url).filter((u): u is string => !!u);
            const childOwnerUrls = leafIds.map((id: string) => byId.get(id)?.owners_url).filter((u): u is string => !!u);
            if (childUrls.length === 0) return null;
            const label = (ac as HierarchyAssetClass & { label?: string }).label;
            if (!label) return null; // require label from hierarchy API
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
        .filter((c: CatalogAssetClass) => !q || c.label.toLowerCase().includes(q)),
    }))
    .filter((cat: { classes: CatalogAssetClass[] }) => cat.classes.length > 0);
}

/**
 * Get all selectable option IDs for a given asset class tile.
 * Returns an empty array for tiles with no subclass options.
 */
export function getHierarchyOptionIds(classId: string): string[] {
  const hClass = getHierarchy().categories
    .flatMap((cat: HierarchyCategory) => cat.assetClasses)
    .find((ac: HierarchyAssetClass) => ac.id === classId);
  if (!hClass) return [];
  if (hClass.optionIds) return hClass.optionIds;
  if (hClass.classGroups) return hClass.classGroups.flatMap((g: ClassGroup) => g.optionIds);
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
  const hClass = getHierarchy().categories
    .flatMap((cat: HierarchyCategory) => cat.assetClasses)
    .find((ac: HierarchyAssetClass) => ac.id === classId);
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
    return hClass.classGroups.flatMap((group: ClassGroup) => {
      const leaves = group.optionIds
        .map((id: string) => toLeaf(id, group.labels))
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
      .map((id: string) => toLeaf(id, hClass.labels))
      .filter(Boolean) as CatalogClassTree[];
  }

  return [];
}

/**
 * Returns true if a catalog entry is a top-level tile in the hierarchy
 * (vs a subclass option that only appears within a tile's expansion).
 */
export function isHierarchyTile(classId: string): boolean {
  return getHierarchy().categories.some((cat: HierarchyCategory) =>
    cat.assetClasses.some((ac: HierarchyAssetClass) => ac.id === classId)
  );
}
