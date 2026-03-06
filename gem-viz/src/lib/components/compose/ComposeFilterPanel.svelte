<script>
  import FacetedFilter from '$lib/components/table/FacetedFilter.svelte';
  import RangeSlider from '$lib/components/table/RangeSlider.svelte';
  import { trackerColors } from '$lib/design-tokens';

  let { state = $bindable(), presetsHref = '/presets' } = $props();
</script>

<aside class="filter-panel">
  <div class="panel-header">
    <h2>Filters</h2>
    {#if state.hasFilters}
      <button class="clear-btn" onclick={state.clearFilters}>Clear all</button>
    {/if}
  </div>

  {#if state.loadingOptions}
    <div class="loading-options">Loading filter options...</div>
  {:else}
    <div class="filter-logic-hint">
      Within each filter: <strong>any</strong> match
      <span class="hint-example">(Coal OR Gas)</span><br />
      Across filters: <strong>all</strong> must match
      <span class="hint-example">(Coal plants IN China)</span>
    </div>

    <FacetedFilter
      options={state.trackerOptions}
      bind:selected={state.filters.trackers}
      bind:selectedAnd={state.filters.trackersAnd}
      label="Tracker Type"
      initialVisible={10}
      loading={state.loadingCounts}
      colorMap={trackerColors}
    />

    <FacetedFilter
      options={state.statusOptions}
      bind:selected={state.filters.statuses}
      bind:selectedAnd={state.filters.statusesAnd}
      label="Status"
      initialVisible={10}
      loading={state.loadingCounts}
    />

    <FacetedFilter
      options={state.countries}
      bind:selected={state.filters.countries}
      bind:selectedAnd={state.filters.countriesAnd}
      label="Asset Country"
      initialVisible={5}
      searchThreshold={10}
      loading={state.loadingCounts}
    />

    <FacetedFilter
      options={state.stateProvinces}
      bind:selected={state.filters.stateProvinces}
      bind:selectedAnd={state.filters.stateProvincesAnd}
      label="State / Province"
      initialVisible={5}
      searchThreshold={10}
      loading={state.loadingCounts}
    />

    <FacetedFilter
      options={state.ownerCountries}
      bind:selected={state.filters.ownerCountries}
      bind:selectedAnd={state.filters.ownerCountriesAnd}
      label="Owner Home Country"
      initialVisible={5}
      searchThreshold={10}
      loading={state.loadingCounts}
    />

    <FacetedFilter
      options={state.owners}
      bind:selected={state.filters.owners}
      bind:selectedAnd={state.filters.ownersAnd}
      label="Owner"
      initialVisible={5}
      searchThreshold={10}
      loading={state.loadingCounts}
    />

    {#if state.availableColumns.hasCapacity}
      <RangeSlider
        label="Capacity"
        bind:min={state.filters.capacityMin}
        bind:max={state.filters.capacityMax}
        dataMin={state.capacityRange.min}
        dataMax={state.capacityRange.max}
        step={10}
        unit=" MW"
        histogram={state.capacityHistogram}
      />
    {/if}

    {#if state.availableColumns.hasStartYear}
      <RangeSlider
        label="Start Year"
        bind:min={state.filters.startYearMin}
        bind:max={state.filters.startYearMax}
        dataMin={state.startYearRange.min}
        dataMax={state.startYearRange.max}
        step={1}
      />
    {/if}

    {#if state.availableColumns.hasShare}
      <RangeSlider
        label="Ownership Share"
        bind:min={state.filters.shareMin}
        bind:max={state.filters.shareMax}
        dataMin={0}
        dataMax={100}
        step={1}
        unit="%"
      />
    {/if}

    <section class="filter-section">
      <h3>Text Search</h3>
      <input type="text" placeholder="Project or Owner name..." bind:value={state.filters.search} />
    </section>
  {/if}

  <!-- TODO: re-enable share/presets/asset-class UI once ready -->
</aside>

<style>
  .filter-panel {
    padding: var(--space-2) var(--space-2);
    height: calc(100vh - 45px);
    overflow-y: auto;
    position: sticky;
    top: 45px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .clear-btn {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }

  .filter-logic-hint {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    padding: var(--space-2) var(--space-2);
    margin-bottom: var(--space-3);
    background: var(--color-gray-50);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    line-height: var(--leading-normal);
  }

  .hint-example {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .filter-logic-hint strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }

  .filter-section {
    margin-bottom: var(--space-2);
  }

  .filter-section h3 {
    font-size: var(--font-size-base);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-1) 0;
  }

  .loading-options {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .filter-section input[type='text'] {
    width: 100%;
    padding: var(--space-1);
    font-size: var(--font-size-sm);
    border: var(--border-width) solid var(--color-border);
  }

  @media (max-width: 768px) {
    .filter-panel {
      order: 1;
      max-height: none;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
      position: static;
      top: auto;
      height: auto;
    }
  }
</style>
