<script>
  /**
   * FILTER COMPOSER PAGE
   * Build custom filtered views of the GEM ownership data.
   * Filters are encoded in the URL for easy sharing.
   *
   * State and logic extracted to $lib/stores/compose-state.svelte.ts
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';

  import { decodeFilters } from '$lib/filter-state';

  import FilterBreadcrumbs from '$lib/components/table/FilterBreadcrumbs.svelte';
  import ComposeFilterPanel from '$lib/components/compose/ComposeFilterPanel.svelte';
  import ComposeResultsHeader from '$lib/components/compose/ComposeResultsHeader.svelte';
  import ComposeTableState from '$lib/components/compose/ComposeTableState.svelte';
  import ComposeVizDashboard from '$lib/components/compose/ComposeVizDashboard.svelte';
  import ComposeAssetTooltip from '$lib/components/compose/ComposeAssetTooltip.svelte';

  import { ComposeState } from '$lib/stores/compose-state.svelte';

  let state = new ComposeState();

  onMount(async () => {
    const urlFilters = decodeFilters($page.url.searchParams);
    await state.init(urlFilters);
  });
</script>

<svelte:head>
  <title>Asset Filter — Global Energy Monitor</title>
  <meta
    name="description"
    content="Build custom filtered views of energy assets by tracker type, status, country, and ownership to analyze specific segments of the global energy infrastructure."
  />
</svelte:head>

<div class="page">
  <header class:hidden={!state.hasFilters && state.initialLoadComplete}>
    <span class="page-type">Tool</span>
  </header>

  <div class="composer-layout">
    <ComposeFilterPanel bind:state presetsHref="/presets" />

    <!-- Main: Results -->
    <section class="results-panel">
      <!-- Empty state overlays the results area when no filters active -->
      <div class="empty-state" class:visible={!state.hasFilters && state.initialLoadComplete}>
        <p class="empty-hint">Select filters to explore {state.totalCount?.toLocaleString() || '45,000+'} assets</p>
      </div>

      <!-- Always rendered, fades in/out -->
      <div class="results-content" class:active={state.hasFilters || !state.initialLoadComplete}>
        <ComposeResultsHeader {state} />

        <div class="breadcrumbs-slot" class:has-crumbs={state.hasFilters}>
          <FilterBreadcrumbs filters={state.filters} onRemove={state.removeFilter} />
        </div>

        {#if state.error}
          <div class="error-message">{state.error}</div>
        {/if}

        <ComposeVizDashboard
          loading={state.loading}
          initialLoadComplete={state.initialLoadComplete}
          resultsLength={state.results.length}
          statusDistribution={state.statusDistribution}
          trackerDistribution={state.trackerDistribution}
          countryDistribution={state.countryDistribution}
          capacityData={state.capacityData}
          startYearData={state.startYearData}
          statusColors={state.statusColors}
          baseStatusDistribution={state.baseStatusDistribution}
          baseTrackerDistribution={state.baseTrackerDistribution}
          baseCountryDistribution={state.baseCountryDistribution}
          hasFilters={state.hasFilters}
        />

        <ComposeTableState {state} />
      </div>
    </section>
  </div>

  <!-- Asset Tooltip -->
  {#if state.selectedAsset}
    <ComposeAssetTooltip
      asset={state.selectedAsset}
      tooltipPos={state.tooltipPos}
      inCart={state.cartAssetIds.has(state.selectedAsset.id)}
    />
  {/if}
</div>

<style>
  .page {
    width: 100%;
    max-width: 100% !important;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-2) var(--space-4);
    position: sticky;
    top: 0;
    z-index: 100;
    transition: opacity 0.2s ease;
  }

  header.hidden {
    opacity: 0;
    visibility: hidden;
    height: 0;
    padding: 0;
    overflow: hidden;
  }

  .page-type {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  /* Layout - App-style with fixed sidebar */
  .composer-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 768px) {
    .composer-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Results Panel - flows naturally, page scrollbar handles overflow */
  .results-panel {
    min-width: 0;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2);
    min-height: calc(100vh - 45px);
  }

  .error-message {
    padding: var(--space-2);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  /* Results content - always in DOM, fades in/out */
  .results-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.25s ease, visibility 0.25s ease;
  }

  .results-content.active {
    opacity: 1;
    visibility: visible;
  }

  /* Breadcrumbs slot - reserves consistent space */
  .breadcrumbs-slot {
    min-height: 0;
    overflow: hidden;
    transition: min-height 0.2s ease, opacity 0.2s ease;
    opacity: 0;
  }

  .breadcrumbs-slot.has-crumbs {
    min-height: 28px;
    opacity: 1;
  }

  /* Empty / welcome state - overlays the results area */
  .empty-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
    pointer-events: none;
  }

  .empty-state.visible {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .empty-state::before {
    display: none;
  }

  .empty-hint {
    margin: 0;
    font-size: 18px;
    color: var(--color-text-tertiary);
    letter-spacing: 0.01em;
    line-height: 1.6;
  }
</style>
