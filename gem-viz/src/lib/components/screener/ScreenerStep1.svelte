<script lang="ts">
  /**
   * ASSET CLASS SCREENER — Step 1 (shared between /screener route and GemScreener widget).
   *
   * Single source of truth for:
   *   - selectClass / clearSelection / buildClassData
   *   - fetchStatusFacetsForClass (multi-tracker handling)
   *   - picker UI (search + category tiles + AssetClassExpansion)
   *
   * Widgets pass their runtime-configurable fetchAssetFacets/fetchStatusTaxonomy via props.
   */
  import { onMount } from 'svelte';
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import {
    STATUS_GROUPS,
    discoverStatusGroups,
    type DynamicStatusGroup,
  } from '$lib/data-config/tracker-schema';
  import {
    fetchAssetFacets as defaultFetchAssetFacets,
    fetchStatusTaxonomy as defaultFetchStatusTaxonomy,
    listAssets,
    type AssetFacets,
  } from '$lib/ownership-api';
  import {
    fetchAssetClasses,
    buildAssetClassUrl,
    type CatalogAssetClass,
  } from '$lib/api/catalog-api';
  import {
    getHierarchyCategories,
    getHierarchyOptionIds,
    getHierarchyDefaultUnchecked,
    getHierarchyTree,
    getUiTrackerFromCatalogEntry,
    getAssetTypesFromUrl,
    hierarchyState,
    loadHierarchy,
  } from '$lib/data-config/asset-class-hierarchy.svelte';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';

  interface Props {
    /** Callback when user clicks "Show all owners" — receives built class data. */
    onShowAllOwners: (classData: ScreenerSelectedClass[]) => void;
    /** Callback when user clicks "Search specific owners" — receives built class data. */
    onSearchSpecificOwners: (classData: ScreenerSelectedClass[]) => void;
    /** Called when selection changes (restore from hash, etc.). Passes null when cleared. */
    onSelectionChange?: (classData: ScreenerSelectedClass[] | null) => void;
    /** Optional: restore selection by id on mount. */
    initialClassId?: string | null;
    /** Optional: restore geoFilters on mount (requires initialClassId). */
    initialGeoFilters?: string[];
    /** Widget-injectable API client (default: ownership-api). */
    fetchAssetFacets?: (slug: string) => Promise<AssetFacets>;
    fetchStatusTaxonomy?: () => Promise<any>;
    /** Show debug panel when a class is selected. */
    showDebug?: boolean;
    /** Extra content rendered below the picker (e.g. "Request additional asset class"). */
    supportCta?: import('svelte').Snippet;
  }

  let {
    onShowAllOwners,
    onSearchSpecificOwners,
    onSelectionChange,
    initialClassId = null,
    initialGeoFilters = [],
    fetchAssetFacets = defaultFetchAssetFacets,
    fetchStatusTaxonomy = defaultFetchStatusTaxonomy,
    showDebug = true,
    supportCta,
  }: Props = $props();

  // ─── Catalog state ──────────────────────────────────────────────────
  let catalogClasses = $state<CatalogAssetClass[]>([]);
  let catalogFailed = $state(false);

  /** Picker is only usable once BOTH the hierarchy and the flat catalog load.
   *  Reading helpers earlier returns empty arrays (null hierarchy guard), which
   *  was the class of race bug that let stale sub-class IDs leak into the URL. */
  const picker = $derived({
    ready: hierarchyState.ready && catalogClasses.length > 0,
    failed: hierarchyState.failed || catalogFailed,
  });

  // ─── Selection state ────────────────────────────────────────────────
  let searchQuery = $state('');
  let selectedClassId = $state<string | null>(null);
  let subClassChecks = $state<Record<string, boolean>>({});
  let groupOptionChecks = $state<Record<string, boolean>>({});
  let catalogChildChecks = $state<Record<string, boolean>>({});
  let statusChecks = $state<Record<string, boolean>>({});
  let geoFilters = $state<string[]>([]);
  let geofence = $state<number[][] | null>(null);
  let dynamicStatusGroups = $state<DynamicStatusGroup[] | null>(null);
  let catalogChildCounts = $state<Record<string, number>>({});
  let countryCounts = $state<Record<string, number>>({});

  const classesByCategory = $derived(getHierarchyCategories(catalogClasses, searchQuery));
  const allClasses = $derived(
    getHierarchyCategories(catalogClasses, '').flatMap((cat) => cat.classes)
  );
  const hierarchyTree = $derived(
    selectedClassId ? getHierarchyTree(selectedClassId, catalogClasses) : []
  );

  // ─── Selection logic ───────────────────────────────────────────────
  export function selectClass(classId: string) {
    const catalogEntry = allClasses.find((c: any) => c.id === classId);
    if (!catalogEntry?.url) return;

    selectedClassId = classId;
    searchQuery = '';
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
    catalogChildCounts = {};
    countryCounts = {};

    // Subclass checks from hierarchy option IDs; defaultUnchecked options start false
    const optionIds = getHierarchyOptionIds(classId);
    const unchecked = new Set(getHierarchyDefaultUnchecked(classId));
    catalogChildChecks = Object.fromEntries(optionIds.map((id) => [id, !unchecked.has(id)]));
    fetchSubclassCounts(classId, optionIds);

    // Multi-tracker: top-level status groups only; each tracker uses different substatuses
    const slugs = getAssetTypesFromUrl(catalogEntry.url ?? '');
    const isMultiTracker = slugs.length > 1;

    if (isMultiTracker) {
      dynamicStatusGroups = STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        label: sg.label,
        statuses: [{ value: sg.id, count: -1 }],
        totalCount: -1,
      }));
      const initialStatusChecks: Record<string, boolean> = {};
      for (const sg of STATUS_GROUPS) {
        initialStatusChecks[`status-${sg.id}-${sg.id}`] =
          sg.id === 'operating' || sg.id === 'planned';
      }
      statusChecks = initialStatusChecks;
    } else {
      const initialStatusChecks: Record<string, boolean> = {};
      for (const sg of STATUS_GROUPS) {
        for (const s of sg.statuses) {
          initialStatusChecks[`status-${sg.id}-${s}`] =
            sg.id === 'operating' || sg.id === 'planned';
        }
      }
      statusChecks = initialStatusChecks;
      fetchStatusFacetsForClass(catalogEntry, classId);
    }
  }

  async function fetchSubclassCounts(classId: string, optionIds: string[]) {
    if (optionIds.length === 0) return;
    const results = await Promise.all(
      optionIds.map((id) =>
        listAssets({ asset_class: id, limit: 1 })
          .then((page) => [id, page.total ?? 0] as const)
          .catch(() => [id, 0] as const)
      )
    );
    if (selectedClassId !== classId) return;
    const next: Record<string, number> = {};
    for (const [id, total] of results) next[id] = total;
    catalogChildCounts = next;
  }

  async function fetchStatusFacetsForClass(catalogEntry: any, classId: string) {
    try {
      const slugs = getAssetTypesFromUrl(catalogEntry?.url ?? '');
      if (slugs.length === 0) return;

      const [taxonomyResult, ...facetResults] = await Promise.all([
        fetchStatusTaxonomy().catch(() => null),
        ...slugs.map((slug: string) => fetchAssetFacets(slug)),
      ]);

      const mergedStatus = new Map<string, number>();
      const mergedCountry: Record<string, number> = {};
      for (const { subStatus, country } of facetResults) {
        for (const [status, count] of subStatus) {
          mergedStatus.set(status, (mergedStatus.get(status) ?? 0) + count);
        }
        for (const [c, n] of Object.entries(country)) {
          mergedCountry[c] = (mergedCountry[c] ?? 0) + n;
        }
      }

      if (selectedClassId !== classId) return;

      countryCounts = mergedCountry;
      const groups = discoverStatusGroups(mergedStatus, taxonomyResult);
      dynamicStatusGroups = groups;

      const discoveredStatusChecks: Record<string, boolean> = {};
      for (const sg of groups) {
        for (const s of sg.statuses) {
          discoveredStatusChecks[`status-${sg.id}-${s.value}`] =
            sg.id === 'operating' || sg.id === 'planned';
        }
      }
      statusChecks = discoveredStatusChecks;
    } catch {
      // Fall back to hardcoded groups
    }
  }

  export function clearSelection() {
    selectedClassId = null;
    subClassChecks = {};
    groupOptionChecks = {};
    catalogChildChecks = {};
    statusChecks = {};
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
    catalogChildCounts = {};
    countryCounts = {};
  }

  // ─── Derive selected statuses ─────────────────────────────────────
  const selectedStatuses = $derived.by(() => {
    const statuses: string[] = [];
    const groups =
      dynamicStatusGroups ??
      STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        statuses: sg.statuses.map((s) => ({ value: s })),
      }));
    for (const sg of groups) {
      for (const s of sg.statuses) {
        if (statusChecks[`status-${sg.id}-${s.value}`]) {
          statuses.push(s.value);
        }
      }
    }
    return statuses;
  });

  const selectedStatusParams = $derived.by(() => {
    const statusValues: string[] = [];
    const substatusValues: string[] = [];
    const groups =
      dynamicStatusGroups ??
      STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        statuses: sg.statuses.map((s) => ({ value: s })),
      }));
    for (const sg of groups) {
      const allValues = sg.statuses.map((s) => s.value);
      const checkedValues = allValues.filter((v) => statusChecks[`status-${sg.id}-${v}`]);
      if (checkedValues.length === 0) continue;
      if (checkedValues.length === allValues.length) {
        statusValues.push(sg.id);
      } else {
        substatusValues.push(...checkedValues);
      }
    }
    return { statusValues, substatusValues };
  });

  // ─── Serialization ─────────────────────────────────────────────────
  export function buildClassData(): ScreenerSelectedClass[] {
    if (!selectedClassId) return [];

    const catalogEntry = allClasses.find((c: any) => c.id === selectedClassId);
    if (!catalogEntry) return [];

    const label = catalogEntry.label ?? selectedClassId;
    const tracker = getUiTrackerFromCatalogEntry(catalogEntry as any);
    const assetTypes = getAssetTypesFromUrl(catalogEntry.url ?? '');

    const selectedSubClassIds = Object.entries(catalogChildChecks)
      .filter(([, v]) => v)
      .map(([k]) => k);

    const assetClassIds = selectedSubClassIds.length > 0 ? selectedSubClassIds : [selectedClassId];
    const byId = new Map(catalogClasses.map((c) => [c.id, c]));

    const catalogUrl = buildAssetClassUrl(
      '/assets',
      assetClassIds,
      selectedStatusParams,
      geoFilters
    );
    const catalogOwnersUrl = buildAssetClassUrl(
      '/owners',
      assetClassIds,
      selectedStatusParams,
      geoFilters
    );

    const selectedSubClassLabels = selectedSubClassIds
      .map((id) => byId.get(id)?.label)
      .filter(Boolean) as string[];

    return [
      {
        id: selectedClassId,
        name: label,
        description: '',
        tracker,
        selectedSubClassLabels,
        filters: {
          geography: geoFilters.length > 0 ? geoFilters : undefined,
          status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
          statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
          geofence: geofence || undefined,
        },
        assetClassId: selectedClassId,
        selectedSubClasses: selectedSubClassIds,
        gemTrackers: assetTypes,
        catalogUrl,
        catalogOwnersUrl,
      } as ScreenerSelectedClass,
    ];
  }

  // ─── Public read-only helpers (for parent badge/summary displays) ─
  export function getSelectedClassId() {
    return selectedClassId;
  }
  export function getSelectionSummary() {
    if (!selectedClassId) return '';
    const catalogEntry = allClasses.find((c: any) => c.id === selectedClassId);
    const label = catalogEntry?.label ?? selectedClassId;
    const geo =
      geoFilters.length === 1
        ? ` in ${geoFilters[0]}`
        : geoFilters.length > 1
          ? ` in ${geoFilters.length} countries`
          : '';
    const statusCount = selectedStatuses.length;
    const totalStatuses = dynamicStatusGroups
      ? dynamicStatusGroups.reduce((n, sg) => n + sg.statuses.length, 0)
      : STATUS_GROUPS.reduce((n, sg) => n + sg.statuses.length, 0);
    const sc = statusCount > 0 && statusCount < totalStatuses ? ` (${statusCount} statuses)` : '';
    return label + geo + sc;
  }
  // ─── Sync selection changes upward ───────────────────────────────
  $effect(() => {
    if (!onSelectionChange) return;
    if (!selectedClassId) {
      onSelectionChange(null);
      return;
    }
    // Re-run on any filter change by reading state inside the effect
    void selectedStatuses;
    void geoFilters;
    void geofence;
    void catalogChildChecks;
    onSelectionChange(buildClassData());
  });

  // ─── Init ─────────────────────────────────────────────────────────
  // Both loads run in parallel; the picker UI is gated on `picker.ready` so
  // neither selectClass() nor the initialClassId restore can fire against a
  // partially-loaded state. This replaces the old static-JSON fallback, which
  // allowed clicks to land against a stale hierarchy and leak orphan sub-class
  // IDs into catalogChildChecks.
  async function onMountLoad() {
    const [, classes] = await Promise.all([
      loadHierarchy(),
      fetchAssetClasses().catch(() => [] as CatalogAssetClass[]),
    ]);
    if (classes.length > 0) {
      catalogClasses = classes;
      catalogFailed = false;
    } else {
      catalogFailed = true;
    }

    if (initialClassId && picker.ready) {
      selectClass(initialClassId);
      if (initialGeoFilters.length > 0) {
        geoFilters = [...initialGeoFilters];
      }
    }
  }

  onMount(onMountLoad);

  function handleShowAllOwners() {
    const data = buildClassData();
    if (data.length === 0) return;
    onShowAllOwners(data);
  }
  function handleSearchSpecificOwners() {
    const data = buildClassData();
    if (data.length === 0) return;
    onSearchSpecificOwners(data);
  }

  // ─── Subtle debug footer (always visible when a class is selected) ──
  const debugAssetsUrl = $derived.by(() => {
    const data = buildClassData();
    return data[0]?.catalogUrl ?? '';
  });
  const debugOwnersUrl = $derived.by(() => {
    const data = buildClassData();
    return data[0]?.catalogOwnersUrl ?? '';
  });
</script>

{#if !picker.ready && !picker.failed}
  <div class="picker-loading" role="status" aria-live="polite">
    <span class="spinner" aria-hidden="true"></span>
    <span>Loading asset classes…</span>
  </div>
{:else if picker.failed}
  <div class="picker-error" role="alert">
    <p>Failed to load asset classes.</p>
    <button class="picker-retry" onclick={onMountLoad}>Retry</button>
  </div>
{:else}
  <div class="picker-section">
    <div class="picker-search">
      <input
        type="text"
        class="picker-search-input"
        placeholder="Search asset classes..."
        bind:value={searchQuery}
      />
    </div>
    {#each classesByCategory as cat (cat.id)}
      <div class="picker-category">
        <span class="picker-category-label">{cat.label}</span>
        <div class="picker-grid">
          {#each cat.classes as ac (ac.id)}
            <button
              class="picker-tile"
              class:selected={selectedClassId === ac.id}
              aria-pressed={selectedClassId === ac.id}
              onclick={() => selectClass(ac.id)}
            >
              <span class="tile-label">{ac.label}</span>
              {#if ac.description}
                <span class="tile-desc">{ac.description}</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if supportCta}
  {@render supportCta()}
{/if}

{#if selectedClassId}
  {@const catalogEntry = allClasses.find((c: any) => c.id === selectedClassId)}
  {@const expansionClass = {
    id: selectedClassId,
    label: catalogEntry?.label ?? selectedClassId,
    description: '',
    category: (catalogEntry as any)?.category ?? '',
    trackers: [],
    availableFilters: { status: true, geography: true },
  } as any}
  <AssetClassExpansion
    assetClass={expansionClass}
    bind:subClassChecks
    bind:groupOptionChecks
    bind:statusChecks
    bind:geoFilters
    bind:geofence
    {dynamicStatusGroups}
    catalogTree={hierarchyTree}
    bind:catalogChildChecks
    {catalogChildCounts}
    {countryCounts}
    onShowAllOwners={handleShowAllOwners}
    onSearchSpecificOwners={handleSearchSpecificOwners}
    onClose={clearSelection}
  />
{/if}

{#if selectedClassId && (debugAssetsUrl || debugOwnersUrl)}
  <!-- Subtle always-visible query footer — shown on standalone AND widget -->
  <div class="query-debug" role="note" aria-label="Current API query">
    {#if debugAssetsUrl}
      <div class="query-line">
        <span class="query-label">assets</span>
        <code class="query-url">GET {debugAssetsUrl}</code>
        <button
          class="query-copy"
          title="Copy URL"
          onclick={() => navigator.clipboard.writeText(debugAssetsUrl)}>⧉</button
        >
      </div>
    {/if}
    {#if debugOwnersUrl}
      <div class="query-line">
        <span class="query-label">owners</span>
        <code class="query-url">GET {debugOwnersUrl}</code>
        <button
          class="query-copy"
          title="Copy URL"
          onclick={() => navigator.clipboard.writeText(debugOwnersUrl)}>⧉</button
        >
      </div>
    {/if}
  </div>
{/if}

{#if showDebug && selectedClassId}
  <DebugPanel title="Query Config">
    <div class="debug-meta">
      <span class="debug-label">Asset Class:</span>
      <span class="debug-value">{getSelectionSummary()} ({selectedClassId})</span>
    </div>
    <div class="debug-meta">
      <span class="debug-label">Statuses:</span>
      <span class="debug-value">{selectedStatuses.join(', ') || 'none'}</span>
    </div>
    {#if geoFilters.length > 0}
      <div class="debug-meta">
        <span class="debug-label">Geography:</span>
        <span class="debug-value">{geoFilters.join(', ')}</span>
      </div>
    {/if}
    <div class="debug-json">
      <span class="debug-label">Class Data JSON:</span>
      <button
        class="copy-btn"
        onclick={() => navigator.clipboard.writeText(JSON.stringify(buildClassData(), null, 2))}
      >
        Copy
      </button>
      <pre class="debug-code">{JSON.stringify(buildClassData(), null, 2)}</pre>
    </div>
  </DebugPanel>
{/if}

<style>
  .picker-search {
    margin-bottom: var(--space-2);
  }

  .picker-search-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-body);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-primary);
    outline: none;
  }

  .picker-search-input:focus {
    border-color: var(--gem-teal);
    box-shadow: 0 0 0 2px var(--gem-teal-25);
  }

  .picker-search-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .picker-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .picker-loading,
  .picker-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-8) var(--space-5);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-body);
  }

  .picker-error {
    flex-direction: column;
    color: var(--color-text-secondary);
  }

  .picker-error p {
    margin: 0;
  }

  .picker-retry {
    background: none;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    cursor: pointer;
  }

  .picker-retry:hover {
    background: var(--color-bg-secondary, #f3f4f6);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-gray-200, #e5e7eb);
    border-top-color: var(--gem-teal);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .picker-category {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .picker-category-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .picker-tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-primary, #fff);
    border: 2px solid var(--color-gray-200, #e5e7eb);
    border-left: 4px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease;
  }

  .picker-tile:hover {
    border-color: var(--color-gray-400, #9ca3af);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .picker-tile.selected {
    border-color: var(--gem-teal);
    background: var(--gem-teal-10);
    box-shadow: 0 2px 8px var(--gem-teal-25);
  }

  .tile-label {
    font-size: var(--font-size-body);
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.3;
  }

  .tile-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    line-height: 1.4;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .debug-json {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Subtle query debug footer — always visible when a class is selected */
  .query-debug {
    margin-top: var(--space-4);
    padding: var(--space-2) var(--space-3);
    border-top: 1px dashed var(--color-gray-200, #e5e7eb);
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 11px;
    line-height: 1.4;
    color: var(--color-text-tertiary, #94a3b8);
    opacity: 0.75;
  }
  .query-debug:hover {
    opacity: 1;
  }
  .query-line {
    display: flex;
    align-items: center;
    gap: var(--space-2, 0.5rem);
    overflow: hidden;
  }
  .query-label {
    flex: 0 0 auto;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 10px;
    color: var(--color-text-tertiary, #94a3b8);
    padding: 0 var(--space-1, 0.25rem);
    border: 1px solid currentColor;
    border-radius: 2px;
    min-width: 44px;
    text-align: center;
  }
  .query-url {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: inherit;
    color: inherit;
    background: none;
    padding: 0;
    user-select: all;
  }
  .query-copy {
    flex: 0 0 auto;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 12px;
    opacity: 0.6;
  }
  .query-copy:hover {
    opacity: 1;
  }

  @media (max-width: 768px) {
    .picker-section {
      gap: var(--space-4);
    }

    .picker-grid {
      grid-template-columns: 1fr;
    }

    .picker-tile {
      padding: var(--space-3) var(--space-4);
      min-height: 44px;
    }
  }
</style>
