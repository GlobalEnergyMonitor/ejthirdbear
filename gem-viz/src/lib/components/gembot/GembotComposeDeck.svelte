<script>
  import FilterBreadcrumbs from '$lib/components/table/FilterBreadcrumbs.svelte';
  import ComposeFilterPanel from '$lib/components/compose/ComposeFilterPanel.svelte';
  import ComposeResultsHeader from '$lib/components/compose/ComposeResultsHeader.svelte';
  import ComposeTableState from '$lib/components/compose/ComposeTableState.svelte';
  import ComposeVizDashboard from '$lib/components/compose/ComposeVizDashboard.svelte';
  import ComposeAssetTooltip from '$lib/components/compose/ComposeAssetTooltip.svelte';

  let {
    state,
    title = 'Live Filters',
    note = '',
    onClose = () => {},
  } = $props();
</script>

<aside class="compose-deck">
  <div class="compose-deck__shell">
    <header class="compose-deck__header">
      <div class="compose-deck__header-copy">
        <span class="compose-deck__eyebrow">Compose</span>
        <h2>{title}</h2>
        <p>
          {note || 'Gembot can tune these live filters and slider ranges without leaving chat.'}
        </p>
      </div>
      <div class="compose-deck__header-actions">
        <a class="compose-deck__link" href={state.shareUrl}>Open Full Compose</a>
        <button class="compose-deck__close" onclick={() => onClose()}>Close</button>
      </div>
    </header>

    <div class="compose-deck__layout">
      <div class="compose-deck__filters">
        <ComposeFilterPanel bind:state={state} />
      </div>

      <section class="compose-deck__results">
        <ComposeResultsHeader {state} />

        <div class="compose-deck__breadcrumbs" class:active={state.hasFilters}>
          <FilterBreadcrumbs filters={state.filters} onRemove={state.removeFilter} />
        </div>

        {#if state.error}
          <div class="compose-deck__error">{state.error}</div>
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
      </section>
    </div>
  </div>

  {#if state.selectedAsset}
    <ComposeAssetTooltip
      asset={state.selectedAsset}
      tooltipPos={state.tooltipPos}
      inCart={state.cartAssetIds.has(state.selectedAsset.id)}
    />
  {/if}
</aside>

<style>
  .compose-deck {
    min-height: 0;
  }

  .compose-deck__shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 24px rgba(16, 24, 40, 0.06);
    overflow: hidden;
  }

  .compose-deck__header {
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
    align-items: flex-start;
    padding: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
  }

  .compose-deck__header-copy h2 {
    margin: 0 0 var(--space-1) 0;
    font-size: var(--font-size-lg);
    color: var(--color-black);
  }

  .compose-deck__header-copy p {
    margin: 0;
    max-width: 52ch;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .compose-deck__eyebrow {
    display: inline-block;
    margin-bottom: var(--space-1);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .compose-deck__header-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .compose-deck__link,
  .compose-deck__close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .compose-deck__link {
    color: var(--color-white);
    background: var(--color-black);
    border: 1px solid var(--color-black);
  }

  .compose-deck__close {
    color: var(--color-text-secondary);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
  }

  .compose-deck__link:hover,
  .compose-deck__close:hover {
    border-color: var(--color-black);
  }

  .compose-deck__layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
  }

  .compose-deck__filters {
    min-height: 0;
    border-right: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
  }

  .compose-deck__results {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: var(--space-3);
    background: var(--color-bg-primary);
  }

  .compose-deck__breadcrumbs {
    min-height: 0;
    opacity: 0;
    overflow: hidden;
    transition:
      min-height 0.2s ease,
      opacity 0.2s ease;
  }

  .compose-deck__breadcrumbs.active {
    min-height: 32px;
    opacity: 1;
  }

  .compose-deck__error {
    margin-bottom: var(--space-3);
    padding: var(--space-3);
    color: var(--color-error);
    background: var(--color-error-bg, #fff1f2);
    border: 1px solid rgba(220, 38, 38, 0.12);
    border-radius: var(--radius-md);
  }

  .compose-deck :global(.filter-panel) {
    height: 100%;
    top: 0;
    padding: var(--space-3);
    position: static;
    background: transparent;
  }

  .compose-deck :global(.results-header) {
    margin-bottom: var(--space-3);
  }

  .compose-deck :global(.data-table-container) {
    overflow: hidden;
  }

  @media (max-width: 1200px) {
    .compose-deck__layout {
      grid-template-columns: 1fr;
    }

    .compose-deck__filters {
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
      max-height: 48dvh;
      overflow: auto;
    }
  }
</style>
