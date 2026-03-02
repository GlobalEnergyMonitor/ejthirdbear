<script>
  import FacetedFilter from '$lib/components/FacetedFilter.svelte';
  import RangeSlider from '$lib/components/RangeSlider.svelte';

  let { state, presetsHref = '/presets' } = $props();
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

    <section class="filter-section">
      <h3>Text Search</h3>
      <input type="text" placeholder="Project or Owner name..." bind:value={state.filters.search} />
    </section>
  {/if}

  <div class="share-section">
    <button class="share-btn" onclick={state.copyShareUrl}>
      {state.copied ? 'Copied!' : 'Copy Share Link'}
    </button>
    <button class="preset-btn" onclick={() => (state.showPresets = !state.showPresets)}>
      {state.showPresets ? 'Hide Presets' : 'Presets'}
    </button>
    {#if state.hasFilters}
      <button
        class="save-class-btn"
        onclick={() => (state.showSaveAssetClass = !state.showSaveAssetClass)}
      >
        Save as Asset Class
      </button>
    {/if}
  </div>

  {#if state.showSaveAssetClass}
    <div class="save-class-panel">
      {#if state.assetClassSaved}
        <p class="save-success">Saved!</p>
      {:else}
        <input
          type="text"
          placeholder="Class name (e.g., South Asian Coal)"
          bind:value={state.newClassName}
        />
        <input
          type="text"
          placeholder="Description (optional)"
          bind:value={state.newClassDescription}
        />
        <button onclick={state.handleSaveAssetClass} disabled={!state.newClassName.trim()}>
          Save Asset Class
        </button>
      {/if}
    </div>
  {/if}

  {#if state.showPresets}
    <div class="presets-panel">
      <h4>Saved Presets</h4>
      {#if state.presets.length === 0}
        <p class="no-presets">No saved presets</p>
      {:else}
        <ul class="preset-list">
          {#each state.presets as preset}
            <li>
              <button class="preset-name" onclick={() => state.handleLoadPreset(preset)}>
                {preset.name}
              </button>
              <button class="preset-export" onclick={() => state.downloadPresetFile(preset)}
                >Export</button
              >
              <button class="preset-delete" onclick={() => state.handleDeletePreset(preset.id)}
                >×</button
              >
            </li>
          {/each}
        </ul>
      {/if}
      <div class="save-preset">
        <input
          type="text"
          placeholder="Preset name..."
          bind:value={state.newPresetName}
          onkeydown={(e) => e.key === 'Enter' && state.handleSavePreset()}
        />
        <button onclick={state.handleSavePreset}>Save</button>
      </div>
      <div class="preset-io">
        <label class="import-btn">
          Import JSON
          <input type="file" accept="application/json" onchange={state.handleImportPreset} />
        </label>
        <a class="preset-link" href={presetsHref}>View featured presets</a>
      </div>
      {#if state.importError}
        <p class="import-error">{state.importError}</p>
      {/if}
    </div>
  {/if}
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

  .share-section {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .share-btn,
  .preset-btn {
    flex: 1;
    padding: var(--space-1);
    font-size: var(--font-size-base);
    background: transparent;
    border: var(--border-width) solid transparent;
    cursor: pointer;
  }

  .share-btn:hover,
  .preset-btn:hover {
    text-decoration: underline;
  }

  .save-class-btn {
    flex: 1;
    padding: var(--space-1);
    font-size: var(--font-size-base);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  .save-class-btn:hover {
    opacity: 0.85;
  }

  .save-class-panel {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--color-gray-50);
    border: var(--border-width) solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .save-class-panel input {
    padding: var(--space-2);
    font-size: var(--font-size-body);
    border: var(--border-width) solid var(--color-border);
  }

  .save-class-panel button {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .save-class-panel button:disabled {
    background: var(--color-gray-300);
    cursor: not-allowed;
  }

  .save-success {
    font-size: var(--font-size-body);
    color: var(--color-success);
    margin: 0;
  }

  .presets-panel {
    margin-top: var(--space-2);
    padding: var(--space-2);
  }

  .presets-panel h4 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    text-transform: uppercase;
  }

  .no-presets {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .preset-list {
    list-style: none;
    margin: 0 0 var(--space-3) 0;
    padding: 0;
  }

  .preset-list li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) 0;
  }

  .preset-name {
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
    flex: 1;
    text-decoration: underline;
    text-decoration-color: transparent;
  }

  .preset-name:hover {
    text-decoration-color: currentColor;
  }

  .preset-export {
    font-size: var(--font-size-base);
    padding: 3px 5px;
    border: var(--border-width) solid transparent;
    background: transparent;
    cursor: pointer;
  }

  .preset-export:hover {
    text-decoration: underline;
  }

  .preset-delete {
    background: none;
    border: none;
    font-size: var(--font-size-lg);
    color: var(--color-text-tertiary);
    cursor: pointer;
  }

  .preset-delete:hover {
    color: var(--color-error);
  }

  .save-preset {
    display: flex;
    gap: var(--space-1);
  }

  .save-preset input {
    flex: 1;
    padding: 5px;
    font-size: var(--font-size-base);
    border: var(--border-width) solid var(--color-border);
  }

  .save-preset button {
    padding: 5px var(--space-2);
    font-size: var(--font-size-base);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  .preset-io {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .import-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-base);
    border: var(--border-width) solid transparent;
    padding: 5px var(--space-2);
    cursor: pointer;
    background: transparent;
  }

  .import-btn input {
    display: none;
  }

  .preset-link {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    text-decoration: underline;
  }

  .import-error {
    margin-top: var(--space-1);
    color: var(--color-error);
    font-size: var(--font-size-sm);
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
