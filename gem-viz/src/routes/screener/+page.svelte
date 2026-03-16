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
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import { ALL_ASSET_CLASSES, getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import { gemTrackerToUiTracker } from '$lib/data-config/screener-api';
  import { buildScreenerUrl } from '$lib/screener-url';
  import {
    isValidTracker,
    STATUS_GROUPS,
    discoverStatusGroups,
  } from '$lib/data-config/tracker-schema';
  import { resolveApiSlug, getAPIBase, fetchStatusFacets, fetchStatusTaxonomy } from '$lib/ownership-api';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // ─── Category display config ────────────────────────────────────────
  const CATEGORY_META = [
    { key: 'multi-tracker', label: 'Multi-Tracker Classes' },
    { key: 'coal-plant', label: 'Coal Plant' },
    { key: 'coal-mine', label: 'Coal Mine' },
    { key: 'oil-gas', label: 'Oil & Gas' },
    { key: 'steel-iron', label: 'Steel & Iron' },
    { key: 'bioenergy', label: 'Bioenergy' },
    { key: 'chemical', label: 'Chemical' },
    { key: 'cement', label: 'Cement' },
  ];

  // Group asset classes by category in display order (only enabled ones)
  // Filter by search query against label and description
  const classesByCategory = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return CATEGORY_META.map((cat) => ({
      ...cat,
      classes: ALL_ASSET_CLASSES.filter((ac) => {
        if (ac.category !== cat.key || !isEnabled(ac)) return false;
        if (!q) return true;
        return ac.label.toLowerCase().includes(q) || ac.description.toLowerCase().includes(q);
      }),
    })).filter((cat) => cat.classes.length > 0);
  });

  // ─── State ──────────────────────────────────────────────────────────
  let searchQuery = $state('');
  let selectedClassId = $state(null);
  /** Flat subClasses checkbox state */
  let subClassChecks = $state({});
  /** SubClassGroups option checkbox state */
  let groupOptionChecks = $state({});
  /** Status checkbox state: `status-{groupId}-{statusValue}` -> boolean */
  let statusChecks = $state({});
  let geoFilters = $state([]);
  let geofence = $state(null);
  /** @type {import('$lib/data-config/tracker-schema').DynamicStatusGroup[] | null} */
  let dynamicStatusGroups = $state(null);

  const selectedClass = $derived(selectedClassId ? getAssetClassById(selectedClassId) : null);

  // Is a class selectable? Must map to at least one known UI tracker.
  function isEnabled(ac) {
    if (ac.trackers.length === 0) return false;
    return ac.trackers.some((t) => isValidTracker(gemTrackerToUiTracker(t)));
  }

  // ─── Selection logic ───────────────────────────────────────────────
  function selectClass(classId) {
    const ac = getAssetClassById(classId);
    if (!ac || !isEnabled(ac)) return;

    selectedClassId = ac.id;
    searchQuery = '';
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null; // reset while loading

    // Initialize flat sub-class checkboxes (default: checked)
    const initialSubClassChecks = {};
    if (ac.subClasses) {
      for (const sc of ac.subClasses) {
        initialSubClassChecks[sc.id] = sc.defaultChecked ?? true;
      }
    }
    subClassChecks = initialSubClassChecks;

    // Initialize group option checkboxes (default: checked)
    const initialGroupChecks = {};
    if (ac.subClassGroups) {
      for (const group of ac.subClassGroups) {
        for (const opt of group.options) {
          initialGroupChecks[opt.id] = opt.defaultChecked ?? true;
        }
      }
    }
    groupOptionChecks = initialGroupChecks;

    // Initialize status checkboxes — all Operating/Planned checked by default
    const initialStatusChecks = {};
    for (const sg of STATUS_GROUPS) {
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s}`;
        initialStatusChecks[key] = sg.id === 'operating' || sg.id === 'planned';
      }
    }
    statusChecks = initialStatusChecks;

    // Fetch status facets from API (non-blocking)
    fetchStatusFacetsForClass(ac);
  }

  async function fetchStatusFacetsForClass(ac) {
    try {
      // Resolve API slugs for all trackers in this class
      const slugs = ac.trackers
        .map((t) => resolveApiSlug(gemTrackerToUiTracker(t)))
        .filter(Boolean);
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
      if (selectedClassId !== ac.id) return;

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
    statusChecks = {};
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
  }

  // ─── Derive selected statuses ─────────────────────────────────────
  const selectedStatuses = $derived.by(() => {
    const statuses = [];
    // Use dynamic groups if available, otherwise hardcoded
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

  // ─── Backward-compatible serialization ─────────────────────────────
  function buildClassData() {
    if (!selectedClass) return [];

    // Collect selected sub-class IDs from both flat and grouped
    const selectedSubClassIds = [
      ...Object.entries(subClassChecks)
        .filter(([, v]) => v)
        .map(([k]) => k),
      ...Object.entries(groupOptionChecks)
        .filter(([, v]) => v)
        .map(([k]) => k),
    ];

    return [
      {
        id: selectedClass.id,
        name: selectedClass.label,
        description: selectedClass.description,
        tracker: gemTrackerToUiTracker(selectedClass.trackers[0]),
        filters: {
          geography: geoFilters.length > 0 ? geoFilters : undefined,
          status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
          statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
          geofence: geofence || undefined,
        },
        assetClassId: selectedClass.id,
        selectedSubClasses: selectedSubClassIds,
        gemTrackers: selectedClass.trackers,
      },
    ];
  }

  function navigateTo(path) {
    const classData = buildClassData();
    if (classData.length === 0) return;
    goto(
      buildScreenerUrl(path.startsWith('/') ? path.slice(1) : path, {
        classes: JSON.stringify(classData),
      })
    );
  }

  // Build the REST API URL that will be called for this config
  const restUrl = $derived.by(() => {
    if (!selectedClass) return '';
    const uiTracker = gemTrackerToUiTracker(selectedClass.trackers[0]);
    const slug = resolveApiSlug(uiTracker);
    if (!slug) return '';
    const base = getAPIBase();
    const params = new URLSearchParams({ asset_type: slug, format: 'json', limit: '500' });
    if (geoFilters.length === 1) params.set('country', geoFilters[0]);
    return `${base}/assets?${params.toString()}`;
  });

  const selectionSummary = $derived.by(() => {
    if (!selectedClass) return '';
    const parts = [selectedClass.label].filter(Boolean).join(' ');
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
    return `mailto:data@globalenergymonitor.org?subject=${subjectEncoded}&body=${bodyEncoded}`;
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

<ScreenerLayout
  currentStep={1}
  subtitle="Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting an asset class below."
>
  {#snippet headerRight()}
    <div class="selection-badge" class:has-selection={selectedClass}>
      {#if selectedClass}
        <span class="selection-text">{selectionSummary}</span>
        <button class="clear-btn" onclick={clearSelection}>&times;</button>
      {:else}
        <span class="selection-text">None selected yet</span>
      {/if}
    </div>
  {/snippet}

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
    {#each classesByCategory as cat (cat.key)}
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
              {#if ac.trackers.length > 1}
                <span class="tile-badge">{ac.trackers.length} trackers</span>
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
  {#if selectedClass}
    <AssetClassExpansion
      assetClass={selectedClass}
      bind:subClassChecks
      bind:groupOptionChecks
      bind:statusChecks
      bind:geoFilters
      bind:geofence
      {dynamicStatusGroups}
      onShowAllOwners={() => navigateTo('/screener/results')}
      onSearchSpecificOwners={() => navigateTo('/screener/owners')}
      onClose={clearSelection}
    />
  {/if}

  <!-- Debug panel -->
  {#if selectedClass}
    <DebugPanel title="Query Config">
      <div class="debug-meta">
        <span class="debug-label">Asset Class:</span>
        <span class="debug-value">{selectedClass.label} ({selectedClass.id})</span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">GEM Tracker(s):</span>
        <span class="debug-value">{selectedClass.trackers.join(', ')}</span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">UI Tracker:</span>
        <span class="debug-value">{gemTrackerToUiTracker(selectedClass.trackers[0])}</span>
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
      {#if restUrl}
        <div class="debug-meta">
          <span class="debug-label">REST API:</span>
          <span class="debug-value">
            <a href={restUrl} target="_blank" rel="noopener" class="rest-url">{restUrl}</a>
          </span>
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
</ScreenerLayout>

<style>
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
    max-width: 340px;
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

  .tile-badge {
    display: inline-block;
    margin-top: var(--space-1);
    padding: 1px var(--space-2);
    font-size: 11px;
    font-weight: 500;
    background: rgba(42, 127, 143, 0.1);
    color: var(--gem-teal, #2a7f8f);
    border-radius: var(--radius-sm);
    width: fit-content;
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
  @media (max-width: 640px) {
    .selection-badge {
      max-width: 100%;
    }

    .picker-grid {
      grid-template-columns: 1fr;
    }

    .support-cta {
      flex-direction: column;
      align-items: stretch;
    }

    .support-actions {
      justify-content: flex-start;
    }
  }

  .rest-url {
    color: var(--color-link, #016b83);
    text-decoration: none;
    word-break: break-all;
  }

  .rest-url:hover {
    text-decoration: underline;
  }
</style>
