<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   *
   * Card-based picker for asset classes grouped by category.
   * Once selected, shows the full filter panel (AssetClassExpansion)
   * with sub-class groups, status buckets, and geography filter.
   */

  import { goto } from '$app/navigation';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import ScreenerStepNav from '$lib/components/nav/ScreenerStepNav.svelte';
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import { buildScreenerUrl, readScreenerHash, writeScreenerHash } from '$lib/screener-url';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import {
    STATUS_GROUPS,
    discoverStatusGroups,
  } from '$lib/data-config/tracker-schema';
  import {
    fetchStatusFacets,
    fetchStatusTaxonomy,
  } from '$lib/ownership-api';
  import {
    fetchAssetClasses,
    buildCatalogUrl,
  } from '$lib/api/catalog-api';
  import {
    getHierarchyCategories,
    getHierarchyOptionIds,
    getHierarchyDefaultUnchecked,
    getHierarchyTree,
    getUiTrackerFromCatalogEntry,
    getAssetTypesFromUrl,
    loadHierarchy,
  } from '$lib/data-config/asset-class-hierarchy.svelte';
  import { GEM_DATA_EMAIL } from '$lib/external-links';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // ─── Catalog state ──────────────────────────────────────────────────
  /** @type {import('$lib/api/catalog-api').CatalogAssetClass[]} */
  let catalogClasses = $state([]);

  // ─── State ──────────────────────────────────────────────────────────
  let searchQuery = $state('');
  let selectedClassId = $state(null);

  // Categories and tiles driven entirely by hierarchy JSON + flat API list
  const classesByCategory = $derived(getHierarchyCategories(catalogClasses, searchQuery));

  // Unfiltered flat list of all tiles (including synthesized grouping tiles) for lookups.
  // Use this instead of catalogClasses.find() so grouping tiles resolve correctly.
  const allClasses = $derived(getHierarchyCategories(catalogClasses, '').flatMap((cat) => cat.classes));

  /** Hierarchy-driven subclass tree for the selected tile (passed to AssetClassExpansion). */
  const hierarchyTree = $derived(
    selectedClassId ? getHierarchyTree(selectedClassId, catalogClasses) : []
  );

  /** Dummy state for AssetClassExpansion's bindable props (unused in tree mode) */
  let subClassChecks = $state({});
  let groupOptionChecks = $state({});
  /** Catalog child IDs that the user has checked (keyed by child.id) */
  let catalogChildChecks = $state({});
  /** Status checkbox state: `status-{groupId}-{statusValue}` -> boolean */
  let statusChecks = $state({});
  let geoFilters = $state([]);
  let geofence = $state(null);
  /** @type {import('$lib/data-config/tracker-schema').DynamicStatusGroup[] | null} */
  let dynamicStatusGroups = $state(null);

  // ─── Selection logic ───────────────────────────────────────────────
  function selectClass(classId) {
    const catalogEntry = allClasses.find((c) => c.id === classId);
    if (!catalogEntry?.url) return;

    selectedClassId = classId;
    searchQuery = '';
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;

    // Initialize subclass checks from hierarchy option IDs; defaultUnchecked options start false
    const optionIds = getHierarchyOptionIds(classId);
    const unchecked = new Set(getHierarchyDefaultUnchecked(classId));
    catalogChildChecks = Object.fromEntries(optionIds.map((id) => [id, !unchecked.has(id)]));

    // Multi-tracker classes: use top-level status groups only (no substatuses).
    // Each tracker uses different sub-status values so merging them is misleading.
    const slugs = getAssetTypesFromUrl(catalogEntry.url ?? '');
    const isMultiTracker = slugs.length > 1;

    if (isMultiTracker) {
      // One entry per group (value = group ID) — prevents refine dropdown from rendering
      dynamicStatusGroups = STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        label: sg.label,
        statuses: [{ value: sg.id, count: -1 }],
        totalCount: -1,
      }));
      const initialStatusChecks = {};
      for (const sg of STATUS_GROUPS) {
        initialStatusChecks[`status-${sg.id}-${sg.id}`] = sg.id === 'operating' || sg.id === 'planned';
      }
      statusChecks = initialStatusChecks;
    } else {
      // Initialize status checkboxes — Operating/Planned checked by default
      const initialStatusChecks = {};
      for (const sg of STATUS_GROUPS) {
        for (const s of sg.statuses) {
          initialStatusChecks[`status-${sg.id}-${s}`] = sg.id === 'operating' || sg.id === 'planned';
        }
      }
      statusChecks = initialStatusChecks;

      // Fetch dynamic status facets (non-blocking)
      fetchStatusFacetsForClass(catalogEntry, classId);
    }
  }

  async function fetchStatusFacetsForClass(catalogEntry, classId) {
    try {
      // Parse asset_type slugs directly from the catalog URL
      const slugs = getAssetTypesFromUrl(catalogEntry?.url ?? '');
      if (slugs.length === 0) return;

      // Fetch facets and taxonomy in parallel
      const [taxonomyResult, ...facetResults] = await Promise.all([
        fetchStatusTaxonomy().catch(() => null),
        ...slugs.map((slug) => fetchStatusFacets(slug)),
      ]);

      // Merge facet counts across trackers
      const mergedFacets = new Map();
      for (const facetMap of facetResults) {
        for (const [status, count] of facetMap) {
          mergedFacets.set(status, (mergedFacets.get(status) ?? 0) + count);
        }
      }

      // Only update if this class is still selected
      if (selectedClassId !== classId) return;

      const groups = discoverStatusGroups(mergedFacets, taxonomyResult);
      dynamicStatusGroups = groups;

      // Re-initialize status checkboxes with discovered statuses
      const discoveredStatusChecks = {};
      for (const sg of groups) {
        for (const s of sg.statuses) {
          const key = `status-${sg.id}-${s.value}`;
          discoveredStatusChecks[key] = sg.id === 'operating' || sg.id === 'planned';
        }
      }
      statusChecks = discoveredStatusChecks;
    } catch {
      // Silently fall back to hardcoded groups
    }
  }

  function clearSelection() {
    selectedClassId = null;
    subClassChecks = {};
    groupOptionChecks = {};
    catalogChildChecks = {};
    statusChecks = {};
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
  }

  // ─── Derive selected statuses ─────────────────────────────────────

  /** Flat list of selected substatus values — used for chart-side client filtering. */
  const selectedStatuses = $derived.by(() => {
    const statuses = [];
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

  /**
   * Structured status params for the API URL.
   * - Full group selected → status=groupId (e.g. status=planned)
   * - Partial group selected → substatus=val1&substatus=val2
   */
  const selectedStatusParams = $derived.by(() => {
    const statusValues = [];
    const substatusValues = [];
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
  function buildClassData() {
    if (!selectedClassId) return [];

    const catalogEntry = allClasses.find((c) => c.id === selectedClassId);
    if (!catalogEntry) return [];

    const label = catalogEntry.label ?? selectedClassId;
    const tracker = getUiTrackerFromCatalogEntry(catalogEntry);
    const assetTypes = getAssetTypesFromUrl(catalogEntry.url ?? '');

    // Collect selected sub-class IDs from catalogChildChecks
    const selectedSubClassIds = Object.entries(catalogChildChecks)
      .filter(([, v]) => v)
      .map(([k]) => k);

    // Build URLs from checked option IDs
    const byId = new Map(catalogClasses.map((c) => [c.id, c]));
    const selectedChildUrls = selectedSubClassIds
      .map((id) => byId.get(id)?.url)
      .filter(Boolean);
    const selectedOwnerChildUrls = selectedSubClassIds
      .map((id) => byId.get(id)?.owners_url)
      .filter(Boolean);

    const catalogUrl = buildCatalogUrl(
      catalogEntry.url,
      selectedChildUrls,
      selectedStatusParams,
      geoFilters
    );
    const catalogOwnersUrl = catalogEntry.owners_url
      ? buildCatalogUrl(catalogEntry.owners_url, selectedOwnerChildUrls, selectedStatusParams, geoFilters)
      : undefined;

    // Labels for selected sub-classes (for panel summary display)
    const selectedSubClassLabels = selectedSubClassIds
      .map((id) => byId.get(id)?.label)
      .filter(Boolean);

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
      },
    ];
  }

  const isEmbed = $derived($page.url.searchParams.get('embed') === 'true');

  // Serialized classes param for the step nav (needs selected class to navigate forward)
  const classesParamForNav = $derived(selectedClassId ? JSON.stringify(buildClassData()) : '');

  function navigateTo(path) {
    const classData = buildClassData();
    if (classData.length === 0) return;
    const classesJson = JSON.stringify(classData);
    // In embed mode, stay on screener routes but pass embed=true through
    const targetPath = path.startsWith('/') ? path.slice(1) : path;
    const url = buildScreenerUrl(targetPath, { classes: classesJson });
    goto(isEmbed ? url + (url.includes('?') ? '&' : '?') + 'embed=true' : url);
  }

  // Sync state → hash when embedded (for shareable links)
  $effect(() => {
    if (!isEmbed) return;
    if (!selectedClassId) {
      writeScreenerHash({});
      return;
    }
    const classData = buildClassData();
    writeScreenerHash({ classes: JSON.stringify(classData) });
  });

  onMount(async () => {
    // Fetch hierarchy and asset class filters in parallel (non-blocking)
    loadHierarchy();
    fetchAssetClasses().then((classes) => {
      if (classes.length > 0) catalogClasses = classes;
    });

    if (!isEmbed) return;
    // Restore from hash when embedded
    const h = readScreenerHash();
    if (h.classes) {
      try {
        const parsed = JSON.parse(h.classes);
        const first = parsed?.[0];
        if (first?.id || first?.assetClassId) {
          const classId = first.id || first.assetClassId;
          // selectClass will init defaults; then we patch from parsed state
          selectClass(classId);
          // Status restore happens via fetchStatusFacetsForClass, but we patch
          // geoFilters immediately
          if (first.filters?.geography) {
            geoFilters = Array.isArray(first.filters.geography)
              ? first.filters.geography
              : [first.filters.geography];
          }
        }
      } catch {
        /* ignore */
      }
    }
  });

  const selectionSummary = $derived.by(() => {
    if (!selectedClassId) return '';
    const catalogEntry = allClasses.find((c) => c.id === selectedClassId);
    const label = catalogEntry?.label ?? selectedClassId;
    const parts = [label].filter(Boolean).join(' ');
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
    return parts + geo + sc;
  });

  function buildMailto(subject, bodyLines) {
    const subjectEncoded = encodeURIComponent(subject);
    const bodyEncoded = encodeURIComponent(bodyLines.join('\n'));
    return `mailto:${GEM_DATA_EMAIL}?subject=${subjectEncoded}&body=${bodyEncoded}`;
  }

  const requestAssetClassHref = $derived.by(() =>
    buildMailto('Asset Class Screener request', [
      'Hi GEM team,',
      '',
      'I would like to request an additional asset class in the screener.',
      '',
      `Current selection: ${selectionSummary || 'None'}`,
      '',
      'Requested asset class:',
      'Use case:',
      'Desired filters/statuses:',
      '',
      'Thanks,',
    ])
  );

  const contactUsHref = $derived.by(() =>
    buildMailto('Asset Class Screener feedback', [
      'Hi GEM team,',
      '',
      'I have feedback about the Asset Class Screener.',
      '',
      `Current selection: ${selectionSummary || 'None'}`,
      '',
      'Message:',
      '',
      'Thanks,',
    ])
  );
</script>

<svelte:head>
  <title>Asset Class Screener — Global Energy Monitor</title>
  <meta
    name="description"
    content="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
  />
  <SeoMeta
    title="Asset Class Screener — Global Energy Monitor"
    description="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
    image="/og/screener.png"
  />
</svelte:head>

{#snippet pickerBody()}
  <!-- Asset class tile picker -->
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

  <section class="support-cta" aria-label="Screener feedback and requests">
    <div class="support-text">
      <h2>Not seeing what you need?</h2>
      <p>
        If a class is missing, send a request and include your use case. You can also share general
        screener feedback.
      </p>
    </div>
    <div class="support-actions">
      <a class="support-btn primary" href={requestAssetClassHref}>Request additional asset class</a>
      <a class="support-btn" href={contactUsHref}>Contact us</a>
    </div>
  </section>

  <!-- Filter panel when class is selected -->
  {#if selectedClassId}
    {@const catalogEntry = allClasses.find((c) => c.id === selectedClassId)}
    {@const expansionClass = /** @type {any} */ ({
      id: selectedClassId,
      label: catalogEntry?.label ?? selectedClassId,
      description: '',
      category: catalogEntry?.category ?? '',
      trackers: [],
      availableFilters: { status: true, geography: true },
    })}
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
      onShowAllOwners={() => navigateTo('/screener/results')}
      onSearchSpecificOwners={() => navigateTo('/screener/owners')}
      onClose={clearSelection}
    />
  {/if}

  <!-- Debug panel -->
  {#if selectedClassId}
    <DebugPanel title="Query Config">
      <div class="debug-meta">
        <span class="debug-label">Asset Class:</span>
        <span class="debug-value">{selectionSummary} ({selectedClassId})</span>
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
{/snippet}

{#if isEmbed}
  <!-- Embed mode: no chrome, hash-synced state -->
  <div class="screener-embed-shell">
    <ScreenerStepNav currentStep={1} classesParam={classesParamForNav} isEmbed={true} />
    {@render pickerBody()}
  </div>
{:else}
  <ScreenerLayout
    currentStep={1}
    subtitle="Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting an asset class below."
  >
    {#snippet headerRight()}
      <div class="selection-badge" class:has-selection={selectedClassId}>
        {#if selectedClassId}
          <span class="selection-text">{selectionSummary}</span>
          <button class="clear-btn" onclick={clearSelection}>&times;</button>
        {:else}
          <span class="selection-text">None selected yet</span>
        {/if}
      </div>
    {/snippet}
    {@render pickerBody()}
  </ScreenerLayout>
{/if}

<style>
  /* Embed shell */
  .screener-embed-shell {
    width: 100%;
    font-family: var(--font-family);
  }
  .screener-embed-shell .picker-section {
    padding: var(--space-4) var(--space-5) 0;
  }

  /* Selection badge */
  .selection-badge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--gem-teal);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-lg);
    min-width: 180px;
    max-width: 420px;
  }

  .selection-badge.has-selection {
    background: var(--gem-primary-blue);
  }

  .selection-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .clear-btn {
    font-size: var(--font-size-xl);
    color: rgba(255, 255, 255, 0.7);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    min-width: 32px;
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .clear-btn:hover {
    color: white;
  }

  /* Search input */
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
    border-color: var(--gem-teal, #2a7f8f);
    box-shadow: 0 0 0 2px rgba(42, 127, 143, 0.15);
  }

  .picker-search-input::placeholder {
    color: var(--color-text-tertiary);
  }

  /* Tile picker */
  .picker-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-bottom: var(--space-6);
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
    border-color: var(--gem-teal, #2a7f8f);
    background: rgba(42, 127, 143, 0.04);
    box-shadow: 0 2px 8px rgba(42, 127, 143, 0.12);
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

  .support-cta {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    padding: var(--space-5);
    margin: 0 0 var(--space-6) 0;
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary, #f8fafc);
  }

  .support-text h2 {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .support-text p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.5;
    max-width: 56ch;
  }

  .support-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .support-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border, #cbd5e1);
    color: var(--color-text-primary);
    background: var(--color-bg-primary, #fff);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
  }

  .support-btn.primary {
    background: var(--gem-primary-blue);
    color: white;
    border-color: var(--gem-primary-blue);
  }

  .support-btn:hover {
    border-color: var(--color-gray-400, #9ca3af);
  }

  .support-btn.primary:hover {
    filter: brightness(0.95);
  }

  /* Debug panel */
  .debug-json {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .selection-badge {
      max-width: 100%;
    }

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

    .support-btn {
      min-height: 44px;
    }

    .support-cta {
      flex-direction: column;
      align-items: stretch;
    }

    .support-actions {
      justify-content: flex-start;
    }
  }

</style>
