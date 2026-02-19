<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   *
   * Shows all 19 asset classes grouped by category. Selecting one expands
   * an inline panel with sub-class checkboxes, geo/status filters, and
   * continue buttons. Serializes to the same format Step 2/3 expect.
   */

  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import ScreenerLayout from '$lib/components/ScreenerLayout.svelte';
  import AssetClassExpansion from '$lib/components/AssetClassExpansion.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import {
    ALL_ASSET_CLASSES,
    getAssetClassById,
  } from '$lib/data-config/asset-class-definitions';
  import { gemTrackerToUiTracker } from '$lib/data-config/screener-api';
  import { isValidTracker } from '$lib/data-config/tracker-schema';

  // ─── Category display config ────────────────────────────────────────
  const CATEGORY_META = [
    { key: 'multi-tracker', label: 'Multi-Tracker Classes' },
    { key: 'coal-plant', label: 'Coal Plant' },
    { key: 'coal-mine', label: 'Coal Mine' },
    { key: 'steel-iron', label: 'Steel & Iron' },
    { key: 'bioenergy', label: 'Bioenergy' },
    { key: 'chemical', label: 'Chemical' },
    { key: 'cement', label: 'Cement' },
  ];

  // Group asset classes by category in display order
  const classesByCategory = $derived(
    CATEGORY_META
      .map((cat) => ({
        ...cat,
        classes: ALL_ASSET_CLASSES.filter((ac) => ac.category === cat.key),
      }))
      .filter((cat) => cat.classes.length > 0)
  );

  // ─── State ──────────────────────────────────────────────────────────
  let selectedClassId = $state(null);
  let checkedSubClasses = $state({});
  let geoFilter = $state('');
  let statusFilter = $state('');

  const selectedClass = $derived(
    selectedClassId ? getAssetClassById(selectedClassId) : null
  );

  // Is a class selectable? Must map to at least one known UI tracker.
  function isEnabled(ac) {
    if (ac.trackers.length === 0) return false;
    return ac.trackers.some((t) => isValidTracker(gemTrackerToUiTracker(t)));
  }

  // ─── Selection logic ───────────────────────────────────────────────
  function selectClass(ac) {
    if (!isEnabled(ac)) return;

    if (selectedClassId === ac.id) {
      // Deselect
      selectedClassId = null;
      checkedSubClasses = {};
      geoFilter = '';
      statusFilter = '';
      return;
    }

    selectedClassId = ac.id;
    geoFilter = '';
    statusFilter = '';

    // Initialize sub-class checkboxes from defaultChecked values
    const checks = {};
    if (ac.subClasses) {
      for (const sc of ac.subClasses) {
        checks[sc.id] = sc.defaultChecked ?? false;
      }
    }
    checkedSubClasses = checks;
  }

  function clearSelection() {
    selectedClassId = null;
    checkedSubClasses = {};
    geoFilter = '';
    statusFilter = '';
  }

  // ─── Backward-compatible serialization ─────────────────────────────
  function buildClassData() {
    if (!selectedClass) return [];

    const selectedSubClassIds = Object.entries(checkedSubClasses)
      .filter(([, v]) => v)
      .map(([k]) => k);

    return [
      {
        id: selectedClass.id,
        name: selectedClass.label,
        description: selectedClass.description,
        tracker: gemTrackerToUiTracker(selectedClass.trackers[0]),
        filters: {
          geography: geoFilter || undefined,
          status: statusFilter || undefined,
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
    const url = new URL(path, $page.url.origin);
    url.searchParams.set('classes', JSON.stringify(classData));
    goto(url.pathname + url.search);
  }

  const selectionSummary = $derived.by(() => {
    if (!selectedClass) return '';
    const parts = [statusFilter, selectedClass.label].filter(Boolean).join(' ');
    const geo = geoFilter ? ` in ${geoFilter}` : '';
    const total = selectedClass.subClasses?.length ?? 0;
    const checked = total > 0 ? Object.values(checkedSubClasses).filter(Boolean).length : 0;
    const sc = checked > 0 && checked < total ? ` (${checked}/${total} sub-classes)` : '';
    return parts + geo + sc;
  });
</script>

<svelte:head>
  <title>Asset Class Screener — Global Energy Monitor</title>
  <meta
    name="description"
    content="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
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
        <button class="clear-btn" onclick={clearSelection}>×</button>
      {:else}
        <span class="selection-text">None selected yet</span>
      {/if}
    </div>
  {/snippet}

  {#each classesByCategory as cat (cat.key)}
    {@const enabled = cat.classes.filter(isEnabled).length}
    {@const total = cat.classes.length}
    <section class="category-section">
      <h2 class="category-heading">
        {cat.label}
        <span class="category-count">({enabled < total ? `${enabled} of ${total}` : total})</span>
      </h2>

      <div class="class-cards">
        {#each cat.classes as ac (ac.id)}
          <button
            class="class-card"
            class:active={selectedClassId === ac.id}
            class:tbd={!isEnabled(ac)}
            disabled={!isEnabled(ac)}
            onclick={() => selectClass(ac)}
          >
            <span class="card-name">{ac.label}</span>
            <p class="card-description">{ac.description}</p>
            {#if ac.trackers.length > 1}
              <span class="tracker-badge">{ac.trackers.length} trackers</span>
            {/if}
            {#if ac.subClasses && ac.subClasses.length > 0}
              <span class="subclass-badge">{ac.subClasses.length} sub-classes</span>
            {/if}
            {#if !isEnabled(ac)}
              <span class="tbd-badge">TBD</span>
            {/if}
            {#if selectedClassId === ac.id}
              <div class="card-active-indicator">●</div>
            {/if}
          </button>
        {/each}
      </div>

      {#if !selectedClass && cat === classesByCategory[0]}
        <p class="empty-state-prompt">Select an asset class above to configure filters and continue.</p>
      {/if}

      {#if selectedClass && selectedClass.category === cat.key}
        <AssetClassExpansion
          assetClass={selectedClass}
          bind:checkedSubClasses
          bind:geoFilter
          bind:statusFilter
          onShowAllOwners={() => navigateTo('/screener/results')}
          onSearchSpecificOwners={() => navigateTo('/screener/owners')}
        />
      {/if}
    </section>
  {/each}

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
      {#if geoFilter}
        <div class="debug-meta">
          <span class="debug-label">Geography:</span>
          <span class="debug-value">{geoFilter}</span>
        </div>
      {/if}
      {#if statusFilter}
        <div class="debug-meta">
          <span class="debug-label">Status:</span>
          <span class="debug-value">{statusFilter}</span>
        </div>
      {/if}
      <div class="debug-json">
        <span class="debug-label">Class Data JSON:</span>
        <button class="copy-btn" onclick={() => navigator.clipboard.writeText(JSON.stringify(buildClassData(), null, 2))}>
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

  /* Category sections */
  .category-section {
    margin-bottom: var(--space-12);
  }

  .category-heading {
    font-size: var(--font-size-md);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin: 0 0 var(--space-5) 0;
    color: var(--color-text-secondary);
    padding-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  /* Asset class cards — 3-col grid */
  .class-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-6) var(--space-8);
  }

  .class-card {
    position: relative;
    padding: var(--space-3) var(--space-4);
    margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-4));
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      background-color var(--duration-base) var(--ease-in-out-quad),
      transform var(--duration-base) var(--ease-out-back);
  }

  .class-card:hover:not(:disabled) {
    background: var(--color-gray-50);
  }

  .class-card:hover:not(:disabled) .card-name {
    color: var(--color-text-primary);
  }

  .class-card.active {
    background: var(--color-bg-secondary);
    border-left: 2px solid var(--color-accent);
    margin-left: calc(-2px - var(--space-4));
    padding-left: calc(var(--space-4) + 2px);
  }

  .class-card.active .card-name {
    color: var(--color-text-primary);
  }

  .class-card.tbd {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .card-active-indicator {
    position: absolute;
    top: var(--space-1);
    right: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-accent);
  }

  .card-name {
    display: block;
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-1);
    transition: color var(--transition-fast);
  }

  .card-description {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin: 0;
    line-height: var(--line-height-normal);
  }

  .tracker-badge,
  .subclass-badge,
  .tbd-badge {
    display: inline-block;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 3px;
    margin-top: var(--space-2);
    margin-right: var(--space-1);
  }

  .tracker-badge {
    background: rgba(29, 73, 97, 0.1);
    color: var(--gem-primary-blue, #1d4961);
  }

  .subclass-badge {
    background: var(--color-gray-100);
    color: var(--color-text-tertiary);
  }

  .tbd-badge {
    background: rgba(107, 114, 128, 0.1);
    color: #9ca3af;
  }

  /* Category count */
  .category-count {
    font-weight: 400;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-transform: none;
    letter-spacing: 0;
  }

  /* Empty state prompt */
  .empty-state-prompt {
    margin-top: var(--space-6);
    padding: var(--space-4) var(--space-5);
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    background: var(--color-gray-50, #f9fafb);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-sm);
    text-align: center;
  }

  /* Debug panel */
  .debug-json {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Responsive */
  @media (max-width: 900px) {
    .class-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .class-cards {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .selection-badge {
      max-width: 100%;
    }
  }
</style>
