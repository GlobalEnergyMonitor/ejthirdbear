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

  import { link } from '$lib/links';
  import { formatCount } from '$lib/format';
  import { decodeFilters } from '$lib/filter-state';

  import MiniHistogram from '$lib/components/MiniHistogram.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MiniBarChart from '$lib/components/MiniBarChart.svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import FacetedFilter from '$lib/components/FacetedFilter.svelte';
  import RangeSlider from '$lib/components/RangeSlider.svelte';
  import FilterBreadcrumbs from '$lib/components/FilterBreadcrumbs.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';

  import { ComposeState } from '$lib/stores/compose-state.svelte';

  const state = new ComposeState();

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

<main>
  <header>
    <span class="page-type">Tool</span>
  </header>

  <div class="composer-layout">
    <!-- Sidebar: Filter Controls -->
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

        <!-- Trackers -->
        <FacetedFilter
          options={state.trackerOptions}
          bind:selected={state.filters.trackers}
          bind:selectedAnd={state.filters.trackersAnd}
          label="Tracker Type"
          initialVisible={10}
          loading={state.loadingCounts}
        />

        <!-- Status -->
        <FacetedFilter
          options={state.statusOptions}
          bind:selected={state.filters.statuses}
          bind:selectedAnd={state.filters.statusesAnd}
          label="Status"
          initialVisible={10}
          loading={state.loadingCounts}
        />

        <!-- Asset Country -->
        <FacetedFilter
          options={state.countries}
          bind:selected={state.filters.countries}
          bind:selectedAnd={state.filters.countriesAnd}
          label="Asset Country"
          initialVisible={5}
          searchThreshold={10}
          loading={state.loadingCounts}
        />

        <!-- Owner HQ Country -->
        <FacetedFilter
          options={state.ownerCountries}
          bind:selected={state.filters.ownerCountries}
          bind:selectedAnd={state.filters.ownerCountriesAnd}
          label="Owner Home Country"
          initialVisible={5}
          searchThreshold={10}
          loading={state.loadingCounts}
        />

        <!-- Owner -->
        <FacetedFilter
          options={state.owners}
          bind:selected={state.filters.owners}
          bind:selectedAnd={state.filters.ownersAnd}
          label="Owner"
          initialVisible={5}
          searchThreshold={10}
          loading={state.loadingCounts}
        />

        <!-- Capacity Range (only show if tracker has capacity data) -->
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

        <!-- Start Year Range (only show if tracker has start year data) -->
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

        <!-- Search -->
        <section class="filter-section">
          <h3>Text Search</h3>
          <input type="text" placeholder="Project or Owner name..." bind:value={state.filters.search} />
        </section>
      {/if}

      <!-- Share & Presets -->
      <div class="share-section">
        <button class="share-btn" onclick={state.copyShareUrl}>
          {state.copied ? 'Copied!' : 'Copy Share Link'}
        </button>
        <button class="preset-btn" onclick={() => (state.showPresets = !state.showPresets)}>
          {state.showPresets ? 'Hide Presets' : 'Presets'}
        </button>
        {#if state.hasFilters}
          <button class="save-class-btn" onclick={() => (state.showSaveAssetClass = !state.showSaveAssetClass)}>
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
                  <button class="preset-export" onclick={() => state.downloadPresetFile(preset)}>
                    Export
                  </button>
                  <button class="preset-delete" onclick={() => state.handleDeletePreset(preset.id)}>
                    ×
                  </button>
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
            <a class="preset-link" href={link('presets')}>View featured presets</a>
          </div>
          {#if state.importError}
            <p class="import-error">{state.importError}</p>
          {/if}
        </div>
      {/if}
    </aside>

    <!-- Main: Results -->
    <section class="results-panel">
      <div class="results-header">
        <div class="results-header-top">
          <div class="results-title-group">
            <h1>Filtered Assets</h1>
            <div class="results-meta">
              {#if state.loading}
                <span class="loading-text">Loading...</span>
              {:else}
                <span class="result-count">{formatCount(state.totalCount)} results</span>
                <DataSourceBadge source="motherduck" queryTime={state.queryTime} />
              {/if}
            </div>
          </div>
          <div class="results-export-group">
            <span class="export-label">Export all {formatCount(state.totalCount)}:</span>
            <button class="export-btn" onclick={state.exportCSV} disabled={state.exporting || state.totalCount === 0}>
              {state.exporting ? 'Exporting...' : 'CSV'}
            </button>
            <button
              class="export-btn"
              onclick={state.exportJSON}
              disabled={state.exporting || state.totalCount === 0}
            >
              JSON
            </button>
          </div>
        </div>
        <div class="results-actions">
          {#if state.allMatchingSelected}
            <span class="selection-count">{state.allMatchingIds.length.toLocaleString()} selected</span>
            {#if state.allMatchingNotInCart > 0}
              <button class="cart-btn add" onclick={state.addAllMatchingToCart}>
                Add all to investigation
              </button>
            {/if}
            {#if state.allMatchingInCart > 0}
              <button class="cart-btn remove" onclick={state.removeAllMatchingFromCart}>
                Remove {state.allMatchingInCart.toLocaleString()} from investigation
              </button>
            {/if}
            <button class="cart-btn text" onclick={state.clearAllMatchingSelection}>Cancel</button>
          {:else if state.selectedRows.length > 0}
            <span class="selection-count">{state.selectedRows.length} selected</span>
            {#if state.selectedNotInCart > 0}
              <button class="cart-btn add" onclick={state.addSelectedToCart}>
                Add to investigation
              </button>
            {/if}
            {#if state.selectedInCart > 0}
              <button class="cart-btn remove" onclick={state.removeSelectedFromCart}>
                Remove from investigation
              </button>
            {/if}
          {:else if state.results.length > 0 && !state.loading}
            <span class="selection-hint">Select rows or:</span>
            <button
              class="cart-btn secondary"
              onclick={state.addPageToCart}
              disabled={state.pageInCart === state.results.length}
            >
              Add this page ({state.results.length - state.pageInCart} new)
            </button>
            {#if state.pageInCart > 0}
              <button class="cart-btn text remove" onclick={state.removePageFromCart}>
                Remove {state.pageInCart} in investigation
              </button>
            {/if}
          {/if}
        </div>
      </div>

      {#if state.hasFilters}
        <FilterBreadcrumbs filters={state.filters} onRemove={state.removeFilter} />
      {/if}

      {#if state.error}
        <div class="error-message">{state.error}</div>
      {/if}

      <!-- Visualization Dashboard (compact) - always visible with skeleton states -->
      <div class="viz-dashboard" class:loading={state.loading}>
        <div class="viz-row">
          <!-- Status Distribution -->
          <div class="viz-card">
            {#if state.loading || !state.initialLoadComplete || state.results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 80%"></div>
                  <div class="skeleton-bar" style="width: 60%"></div>
                  <div class="skeleton-bar" style="width: 40%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={state.statusDistribution}
                label="Status"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                colorMap={state.statusColors}
                compact
              />
            {/if}
          </div>

          <!-- Tracker Distribution -->
          <div class="viz-card">
            {#if state.loading || !state.initialLoadComplete || state.results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 90%"></div>
                  <div class="skeleton-bar" style="width: 50%"></div>
                  <div class="skeleton-bar" style="width: 30%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={state.trackerDistribution}
                label="Tracker"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                compact
              />
            {/if}
          </div>

          <!-- Country Distribution -->
          <div class="viz-card">
            {#if state.loading || !state.initialLoadComplete || state.results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 70%"></div>
                  <div class="skeleton-bar" style="width: 55%"></div>
                  <div class="skeleton-bar" style="width: 45%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={state.countryDistribution}
                label="Countries"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                compact
              />
            {/if}
          </div>

          <!-- Capacity Histogram -->
          <div class="viz-card">
            {#if state.loading || !state.initialLoadComplete || state.results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-histogram">
                  <div class="skeleton-hist-bar" style="height: 40%"></div>
                  <div class="skeleton-hist-bar" style="height: 70%"></div>
                  <div class="skeleton-hist-bar" style="height: 100%"></div>
                  <div class="skeleton-hist-bar" style="height: 80%"></div>
                  <div class="skeleton-hist-bar" style="height: 50%"></div>
                  <div class="skeleton-hist-bar" style="height: 30%"></div>
                </div>
              </div>
            {:else if state.capacityData.length > 0}
              <MiniHistogram
                data={state.capacityData}
                label="Capacity"
                unit="MW"
                bins={8}
                width={120}
                height={36}
                showAxis={false}
                compact
              />
            {/if}
          </div>

          <!-- Start Year Sparkline -->
          <div class="viz-card">
            {#if state.loading || !state.initialLoadComplete || state.results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-sparkline"></div>
              </div>
            {:else if state.startYearData.length > 1}
              <Sparkline data={state.startYearData} label="Start Year" width={120} height={32} compact />
            {/if}
          </div>
        </div>
      </div>

      <!-- Table with skeleton loading state -->
      {#if state.loading || !state.initialLoadComplete}
        <div class="skeleton-table">
          <div class="skeleton-table-header">
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
          </div>
          {#each Array(8) as _, i}
            <div class="skeleton-table-row" style="animation-delay: {i * 0.05}s">
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
            </div>
          {/each}
        </div>
      {:else if state.results.length > 0}
        <!-- Gmail-style "select all matching" banner -->
        {#if state.allPageSelected && !state.allMatchingSelected && state.totalCount > state.results.length}
          <div class="select-all-banner">
            All {state.results.length} assets on this page selected.
            <button onclick={state.selectAllMatching}>
              Select all {state.totalCount.toLocaleString()} that match your filters?
            </button>
          </div>
        {/if}
        {#if state.allMatchingSelected}
          <div class="select-all-banner selected">
            <strong>{state.allMatchingIds.length.toLocaleString()} assets</strong> matching your filters
            are selected.
            <button onclick={state.clearAllMatchingSelection}>Clear</button>
          </div>
        {/if}

        <DataTable
          columns={state.tableColumns}
          data={state.tableRows}
          pageSize={state.pageSize}
          showGlobalSearch={true}
          showColumnFilters={true}
          showPagination={false}
          showExport={false}
          showColumnToggle={true}
          showSelection={true}
          bind:selectedRows={state.selectedRows}
          stickyHeader={true}
          striped={true}
          onRowClick={state.handleRowClick}
          onRowHover={state.handleRowHover}
          onRowLeave={state.handleRowLeave}
          highlightRow={state.isRowInCart}
        />

        <!-- Server-side pagination -->
        <div class="pagination">
          <div class="pagination-info">
            Showing {((state.currentPage - 1) * state.pageSize + 1).toLocaleString()}–{Math.min(
              state.currentPage * state.pageSize,
              state.totalCount
            ).toLocaleString()} of {state.totalCount.toLocaleString()} results
          </div>
          <div class="pagination-controls">
            <button
              class="page-btn"
              disabled={state.currentPage === 1 || state.loading}
              onclick={() => state.goToPage(1)}
              title="First page"
            >
              ««
            </button>
            <button
              class="page-btn"
              disabled={state.currentPage === 1 || state.loading}
              onclick={() => state.goToPage(state.currentPage - 1)}
              title="Previous page"
            >
              «
            </button>
            <span class="page-indicator">
              Page {state.currentPage} of {state.totalPages.toLocaleString()}
            </span>
            <button
              class="page-btn"
              disabled={state.currentPage >= state.totalPages || state.loading}
              onclick={() => state.goToPage(state.currentPage + 1)}
              title="Next page"
            >
              »
            </button>
            <button
              class="page-btn"
              disabled={state.currentPage >= state.totalPages || state.loading}
              onclick={() => state.goToPage(state.totalPages)}
              title="Last page"
            >
              »»
            </button>
          </div>
        </div>
      {:else}
        <div class="no-results">
          {#if state.hasFilters}
            <p>No assets match your filters.</p>
            <button onclick={state.clearFilters}>Clear filters</button>
          {:else}
            <p>Select filters to search assets.</p>
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <!-- Asset Tooltip -->
  {#if state.selectedAsset}
    <div
      class="asset-tooltip"
      style="left: {Math.min(state.tooltipPos.x + 12, window.innerWidth - 340)}px; top: {Math.min(
        state.tooltipPos.y - 10,
        window.innerHeight - 200
      )}px;"
    >
      {#if state.cartAssetIds.has(state.selectedAsset.id)}
        <div class="tooltip-header">
          <span class="in-cart-badge" title="In your investigation">In Cart</span>
        </div>
      {/if}
      <ProjectCard
        asset={{
          id: state.selectedAsset.id,
          name: state.selectedAsset.name,
          status: state.selectedAsset.status,
          country: state.selectedAsset.country,
          capacity: state.selectedAsset.capacity,
          owner: state.selectedAsset.owner,
          startYear: state.selectedAsset.startYear,
          tracker: state.selectedAsset.tracker,
        }}
        variant="compact"
        open={true}
        showLink={false}
      />
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
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

    .filter-panel {
      order: 1;
      max-height: none;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .results-panel {
      order: 2;
    }
  }

  /* Filter Panel - Fixed sidebar */
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

  /* Search */
  .filter-section input[type='text'] {
    width: 100%;
    padding: var(--space-1);
    font-size: var(--font-size-sm);
    border: var(--border-width) solid var(--color-border);
  }

  /* Share Section */
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

  /* Save Asset Class Panel */
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

  /* Presets Panel */
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

  /* Results Panel */
  .results-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2);
    overflow-y: auto;
    height: calc(100vh - 45px);
  }

  .results-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .results-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .results-title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .results-header h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
  }

  .results-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .result-count {
    font-family: var(--font-family-data);
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .results-export-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .export-label {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .results-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
  }

  .selection-count {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-black);
    background: var(--gem-orange-10);
    padding: var(--space-1) var(--space-2);
    border-radius: 4px;
  }

  .selection-hint {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .cart-btn {
    padding: 6px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 700;
    background: transparent;
    color: var(--color-black);
    border: 2px solid var(--color-gray-300);
    border-radius: 4px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .cart-btn:hover:not(:disabled) {
    border-color: var(--color-black);
  }

  .cart-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cart-btn.add {
    background: var(--color-black);
    color: var(--color-white);
    border-color: var(--color-black);
  }

  .cart-btn.add:hover {
    background: var(--color-gray-800);
  }

  .cart-btn.secondary {
    background: transparent;
    color: var(--color-black);
  }

  .cart-btn.secondary:hover:not(:disabled) {
    background: var(--color-gray-100);
  }

  .cart-btn.text {
    background: transparent;
    border-color: transparent;
    padding: 5px var(--space-2);
  }

  .cart-btn.text:hover {
    text-decoration: underline;
    border-color: transparent;
  }

  .cart-btn.remove {
    color: var(--color-error);
    border-color: var(--color-error);
    background: transparent;
  }

  .cart-btn.remove:hover {
    background: var(--color-error-bg);
  }

  .cart-btn.text.remove {
    border-color: transparent;
  }

  /* Gmail-style select all banner */
  .select-all-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-warning-bg);
    border: var(--border-width) solid var(--color-warning);
    font-size: var(--font-size-sm);
    color: var(--color-warning-text);
  }

  .select-all-banner.selected {
    background: var(--color-info-bg);
    border-color: var(--color-info);
    color: var(--color-info-text);
  }

  .select-all-banner button {
    background: none;
    border: none;
    color: var(--color-link);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .select-all-banner button:hover {
    color: var(--color-link-hover);
  }

  .export-btn {
    padding: 6px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 700;
    background: var(--color-black);
    color: var(--color-white);
    border: 2px solid var(--color-black);
    border-radius: 4px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .export-btn:hover:not(:disabled) {
    background: var(--color-gray-800);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-text {
    font-family: var(--font-family-data);
    font-weight: 700;
    color: var(--color-text-tertiary);
  }

  .error-message {
    padding: var(--space-2);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-2);
    font-size: var(--font-size-sm);
  }

  .pagination-info {
    color: var(--color-text-secondary);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
    background: transparent;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
  }

  .page-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator {
    padding: 0 var(--space-2);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  /* No Results */
  .no-results {
    text-align: center;
    padding: var(--space-10) var(--space-5);
    color: var(--color-text-secondary);
  }

  .no-results p {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-body);
  }

  .no-results button {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  /* Visualization Dashboard - Compact */
  .viz-dashboard {
    margin-bottom: 6px;
    padding: 4px;
    transition: opacity 0.2s ease;
  }

  .viz-dashboard.loading {
    opacity: 0.7;
  }

  .viz-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: stretch;
  }

  .viz-card {
    flex: 1 1 140px;
    min-width: 140px;
    max-width: 180px;
    padding: 6px 8px;
    transition: opacity 0.15s ease;
  }

  /* Skeleton loading styles */
  .skeleton-chart {
    min-height: 50px;
  }

  .skeleton-label {
    width: 50px;
    height: var(--space-2);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .skeleton-bar {
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: 1px;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bar:nth-child(2) {
    animation-delay: 0.1s;
  }
  .skeleton-bar:nth-child(3) {
    animation-delay: 0.2s;
  }

  .skeleton-histogram {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: var(--space-9);
  }

  .skeleton-hist-bar {
    flex: 1;
    background: var(--color-gray-100);
    border-radius: 1px 1px 0 0;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-hist-bar:nth-child(2) {
    animation-delay: 0.05s;
  }
  .skeleton-hist-bar:nth-child(3) {
    animation-delay: 0.1s;
  }
  .skeleton-hist-bar:nth-child(4) {
    animation-delay: 0.15s;
  }
  .skeleton-hist-bar:nth-child(5) {
    animation-delay: 0.2s;
  }
  .skeleton-hist-bar:nth-child(6) {
    animation-delay: 0.25s;
  }

  .skeleton-sparkline {
    height: var(--space-8);
    background: linear-gradient(
      90deg,
      var(--color-gray-100) 0%,
      var(--color-gray-50) 50%,
      var(--color-gray-100) 100%
    );
    background-size: 200% 100%;
    border-radius: var(--radius-sm);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Skeleton Table */
  .skeleton-table-header {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
  }

  .skeleton-th {
    flex: 1;
    height: var(--space-3);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-th:nth-child(1) {
    flex: 2;
  }
  .skeleton-th:nth-child(2) {
    flex: 1.5;
  }

  .skeleton-table-row {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-table-row:nth-child(even) {
    background: transparent;
  }

  .skeleton-td {
    flex: 1;
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
  }

  .skeleton-td:nth-child(1) {
    flex: 2;
  }
  .skeleton-td:nth-child(2) {
    flex: 1.5;
  }

  @media (max-width: 768px) {
    .viz-row {
      flex-direction: column;
    }

    .viz-card {
      max-width: none;
      width: 100%;
    }
  }

  /* DataTable compact overrides - even tighter */
  .results-panel :global(.data-table-container) {
    border: 0;
  }

  .results-panel :global(.data-table) {
    font-size: 11px;
    table-layout: fixed;
  }

  .results-panel :global(.data-table th),
  .results-panel :global(.data-table td) {
    padding: 4px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    line-height: 1.3;
  }

  .results-panel :global(.data-table th) {
    font-size: 9px;
  }

  .results-panel :global(.data-table td:first-child) {
    max-width: 280px;
    font-weight: 500;
  }

  .results-panel :global(.data-table tr) {
    height: 28px;
  }

  .results-panel :global(.data-table-controls) {
    padding: 4px 6px;
    gap: 4px;
  }

  .results-panel :global(.data-table-controls input) {
    padding: 4px 6px;
    font-size: 10px;
  }

  .results-panel :global(.data-table-controls button) {
    padding: 3px 8px;
    font-size: 9px;
  }

  /* Asset Tooltip */
  .asset-tooltip {
    position: fixed;
    z-index: 1000;
    max-width: 320px;
    pointer-events: none;
    animation: tooltipFadeIn 0.15s ease-out;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    padding: 4px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }

  .asset-tooltip :global(.project-card) {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .asset-tooltip :global(.project-card summary) {
    background: transparent;
  }

  .asset-tooltip :global(.details-section) {
    background: transparent;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
    gap: 8px;
  }

  .in-cart-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    padding: 3px var(--space-1);
    background: linear-gradient(90deg, var(--color-warning) 0%, var(--color-warning-light) 100%);
    color: var(--color-black);
    border-radius: var(--radius-sm);
  }
</style>
