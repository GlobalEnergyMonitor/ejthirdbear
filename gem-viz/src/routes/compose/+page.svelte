<script>
  /**
   * FILTER COMPOSER PAGE
   *
   * Build custom filtered views of the GEM ownership data.
   * Filters are encoded in the URL for easy sharing.
   *
   * URL Format:
   *   /compose?trackers=Coal+Plant,Gas+Plant&statuses=operating&capacityMin=100
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  import { assetLink, entityLink } from '$lib/links';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';

  import {
    emptyFilterState,
    decodeFilters,
    encodeFilters,
    buildShareUrl,
    hasActiveFilters,
    countActiveFilters,
    buildSqlWhere,
    getPresets,
    savePreset,
    deletePreset,
  } from '$lib/filter-state';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const TRACKERS = [
    'Coal Plant',
    'Gas Plant',
    'Coal Mine',
    'Iron Mine',
    'Steel Plant',
    'Bioenergy Power',
    'Gas Pipeline',
  ];

  const STATUSES = [
    'operating',
    'proposed',
    'construction',
    'retired',
    'cancelled',
    'shelved',
    'mothballed',
  ];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let filters = $state(emptyFilterState());
  let results = $state([]);
  let totalCount = $state(0);
  let loading = $state(false);
  let error = $state(null);
  let countries = $state([]); // Populated from data
  let presets = $state([]);
  let showPresets = $state(false);
  let newPresetName = $state('');
  let copied = $state(false);
  let queryTime = $state(0);

  // Pagination
  let currentPage = $state(1);
  const pageSize = 50;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const shareUrl = $derived(buildShareUrl(filters));
  const activeFilterCount = $derived(countActiveFilters(filters));
  const hasFilters = $derived(hasActiveFilters(filters));
  const totalPages = $derived(Math.ceil(totalCount / pageSize));
  const paginatedResults = $derived(
    results.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  // ---------------------------------------------------------------------------
  // URL Sync
  // ---------------------------------------------------------------------------
  function syncFiltersToUrl() {
    if (!browser) return;
    const encoded = encodeFilters(filters);
    const newUrl = encoded ? `/compose?${encoded}` : '/compose';
    // Use replaceState to avoid polluting history
    goto(newUrl, { replaceState: true, keepFocus: true });
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  async function loadResults() {
    if (!browser) return;

    loading = true;
    error = null;
    const startTime = Date.now();

    try {
      const md = await import('$lib/motherduck-wasm');
      await md.default.loadParquetFromPath('/all_trackers_ownership@1.parquet', 'ownership');

      const whereClause = buildSqlWhere(filters);

      // Get total count
      const countResult = await md.default.query(`
        SELECT COUNT(*) as cnt FROM ownership WHERE ${whereClause}
      `);
      totalCount = Number(countResult.data?.[0]?.cnt || 0);

      // Get paginated results
      const dataResult = await md.default.query(`
        SELECT DISTINCT
          "GEM unit ID" as asset_id,
          "Project" as name,
          "Tracker" as tracker,
          "Status" as status,
          "Country" as country,
          CAST("Capacity (MW)" AS DOUBLE) as capacity_mw,
          "Owner" as owner,
          "Owner GEM Entity ID" as owner_id
        FROM ownership
        WHERE ${whereClause}
        ORDER BY capacity_mw DESC NULLS LAST
        LIMIT 500
      `);

      results = dataResult.data || [];
      queryTime = Date.now() - startTime;
      currentPage = 1;
    } catch (err) {
      console.error('[Compose] Query error:', err);
      error = err.message;
      results = [];
    } finally {
      loading = false;
    }
  }

  async function loadCountries() {
    if (!browser) return;

    try {
      const md = await import('$lib/motherduck-wasm');
      await md.default.loadParquetFromPath('/all_trackers_ownership@1.parquet', 'ownership');

      const result = await md.default.query(`
        SELECT DISTINCT "Country" as country
        FROM ownership
        WHERE "Country" IS NOT NULL AND "Country" != ''
        ORDER BY country
      `);

      countries = (result.data || []).map((r) => r.country).filter(Boolean);
    } catch (err) {
      console.error('[Compose] Failed to load countries:', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function toggleTracker(tracker) {
    const idx = filters.trackers.indexOf(tracker);
    if (idx >= 0) {
      filters.trackers = filters.trackers.filter((t) => t !== tracker);
    } else {
      filters.trackers = [...filters.trackers, tracker];
    }
  }

  function toggleStatus(status) {
    const idx = filters.statuses.indexOf(status);
    if (idx >= 0) {
      filters.statuses = filters.statuses.filter((s) => s !== status);
    } else {
      filters.statuses = [...filters.statuses, status];
    }
  }

  function toggleCountry(country) {
    const idx = filters.countries.indexOf(country);
    if (idx >= 0) {
      filters.countries = filters.countries.filter((c) => c !== country);
    } else {
      filters.countries = [...filters.countries, country];
    }
  }

  function clearFilters() {
    filters = emptyFilterState();
    syncFiltersToUrl();
    loadResults();
  }

  function applyFilters() {
    syncFiltersToUrl();
    loadResults();
  }

  async function copyShareUrl() {
    if (!browser) return;
    const fullUrl = window.location.origin + shareUrl;
    await navigator.clipboard.writeText(fullUrl);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  function handleSavePreset() {
    if (!newPresetName.trim()) return;
    savePreset(newPresetName.trim(), { ...filters });
    presets = getPresets();
    newPresetName = '';
    showPresets = false;
  }

  function handleLoadPreset(preset) {
    filters = { ...emptyFilterState(), ...preset.filters };
    showPresets = false;
    applyFilters();
  }

  function handleDeletePreset(id) {
    deletePreset(id);
    presets = getPresets();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  onMount(() => {
    // Parse filters from URL
    const urlFilters = decodeFilters($page.url.searchParams);
    filters = urlFilters;

    // Load presets
    presets = getPresets();

    // Load reference data and results
    loadCountries();
    loadResults();
  });
</script>

<svelte:head>
  <title>Filter Composer — GEM Viz</title>
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
        {#if hasFilters}
          <button class="clear-btn" onclick={clearFilters}>Clear all</button>
        {/if}
      </div>

      <!-- Trackers -->
      <section class="filter-section">
        <h3>Tracker Type</h3>
        <div class="chip-group">
          {#each TRACKERS as tracker}
            <button
              class="chip"
              class:active={filters.trackers.includes(tracker)}
              onclick={() => toggleTracker(tracker)}
            >
              <TrackerIcon {tracker} size={12} />
              {tracker}
            </button>
          {/each}
        </div>
      </section>

      <!-- Status -->
      <section class="filter-section">
        <h3>Status</h3>
        <div class="chip-group">
          {#each STATUSES as status}
            <button
              class="chip"
              class:active={filters.statuses.includes(status)}
              onclick={() => toggleStatus(status)}
            >
              <StatusIcon {status} size={10} />
              {status}
            </button>
          {/each}
        </div>
      </section>

      <!-- Country -->
      <section class="filter-section">
        <h3>Country</h3>
        <select
          multiple
          size="6"
          onchange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (o) => o.value);
            filters.countries = selected;
          }}
        >
          {#each countries as country}
            <option value={country} selected={filters.countries.includes(country)}>
              {country}
            </option>
          {/each}
        </select>
        {#if filters.countries.length > 0}
          <div class="selected-countries">
            {filters.countries.join(', ')}
          </div>
        {/if}
      </section>

      <!-- Capacity Range -->
      <section class="filter-section">
        <h3>Capacity (MW)</h3>
        <div class="range-inputs">
          <input
            type="number"
            placeholder="Min"
            bind:value={filters.capacityMin}
            min="0"
          />
          <span>to</span>
          <input
            type="number"
            placeholder="Max"
            bind:value={filters.capacityMax}
            min="0"
          />
        </div>
      </section>

      <!-- Search -->
      <section class="filter-section">
        <h3>Search</h3>
        <input
          type="text"
          placeholder="Project or Owner name..."
          bind:value={filters.search}
        />
      </section>

      <!-- Logic -->
      <section class="filter-section">
        <h3>Filter Logic</h3>
        <div class="logic-toggle">
          <button
            class:active={filters.logic === 'AND'}
            onclick={() => (filters.logic = 'AND')}
          >
            AND (all match)
          </button>
          <button
            class:active={filters.logic === 'OR'}
            onclick={() => (filters.logic = 'OR')}
          >
            OR (any match)
          </button>
        </div>
      </section>

      <!-- Apply Button -->
      <div class="apply-section">
        <button class="apply-btn" onclick={applyFilters}>
          Apply Filters
          {#if activeFilterCount > 0}
            <span class="filter-count">{activeFilterCount}</span>
          {/if}
        </button>
      </div>

      <!-- Share & Presets -->
      <div class="share-section">
        <button class="share-btn" onclick={copyShareUrl}>
          {copied ? 'Copied!' : 'Copy Share Link'}
        </button>
        <button class="preset-btn" onclick={() => (showPresets = !showPresets)}>
          {showPresets ? 'Hide Presets' : 'Presets'}
        </button>
      </div>

      {#if showPresets}
        <div class="presets-panel">
          <h4>Saved Presets</h4>
          {#if presets.length === 0}
            <p class="no-presets">No saved presets</p>
          {:else}
            <ul class="preset-list">
              {#each presets as preset}
                <li>
                  <button class="preset-name" onclick={() => handleLoadPreset(preset)}>
                    {preset.name}
                  </button>
                  <button class="preset-delete" onclick={() => handleDeletePreset(preset.id)}>
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
              bind:value={newPresetName}
              onkeydown={(e) => e.key === 'Enter' && handleSavePreset()}
            />
            <button onclick={handleSavePreset}>Save</button>
          </div>
        </div>
      {/if}
    </aside>

    <!-- Main: Results -->
    <section class="results-panel">
      <div class="results-header">
        <h1>Filtered Assets</h1>
        <div class="results-meta">
          {#if loading}
            <span class="loading-text">Loading...</span>
          {:else}
            <span class="result-count">{totalCount.toLocaleString()} results</span>
            <span class="query-time">{queryTime}ms</span>
          {/if}
        </div>
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if !loading && results.length > 0}
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Tracker</th>
                <th>Status</th>
                <th>Country</th>
                <th>Capacity</th>
                <th>Owner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each paginatedResults as row}
                <tr>
                  <td class="name-col">
                    <a href={assetLink(row.asset_id)} class="asset-link">
                      {row.name || row.asset_id}
                    </a>
                    <span class="asset-id">{row.asset_id}</span>
                  </td>
                  <td>
                    <TrackerIcon tracker={row.tracker} size={12} showLabel variant="pill" />
                  </td>
                  <td>
                    <StatusIcon status={row.status} size={10} />
                    {row.status || '—'}
                  </td>
                  <td>{row.country || '—'}</td>
                  <td class="capacity-col">
                    {row.capacity_mw ? `${Number(row.capacity_mw).toLocaleString()} MW` : '—'}
                  </td>
                  <td class="owner-col">
                    {#if row.owner_id}
                      <a href={entityLink(row.owner_id)}>{row.owner || row.owner_id}</a>
                    {:else}
                      {row.owner || '—'}
                    {/if}
                  </td>
                  <td class="action-col">
                    <AddToCartButton
                      id={row.asset_id}
                      name={row.name || row.asset_id}
                      type="asset"
                      tracker={row.tracker}
                    />
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        {#if totalPages > 1}
          <div class="pagination">
            <button disabled={currentPage <= 1} onclick={() => (currentPage = 1)}>
              First
            </button>
            <button disabled={currentPage <= 1} onclick={() => currentPage--}>
              Prev
            </button>
            <span class="page-info">
              Page {currentPage} of {totalPages}
            </span>
            <button disabled={currentPage >= totalPages} onclick={() => currentPage++}>
              Next
            </button>
            <button disabled={currentPage >= totalPages} onclick={() => (currentPage = totalPages)}>
              Last
            </button>
          </div>
        {/if}

        {#if results.length >= 500}
          <p class="limit-notice">
            Showing first 500 results. Refine your filters to see more specific data.
          </p>
        {/if}
      {:else if !loading}
        <div class="no-results">
          {#if hasFilters}
            <p>No assets match your filters.</p>
            <button onclick={clearFilters}>Clear filters</button>
          {:else}
            <p>Select filters to search assets.</p>
          {/if}
        </div>
      {/if}
    </section>
  </div>
</main>

<style>
  main {
    width: 100%;
    padding: 40px;
    min-height: 100vh;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }

  .page-type {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Layout */
  .composer-layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 40px;
  }

  @media (max-width: 900px) {
    .composer-layout {
      grid-template-columns: 1fr;
    }
  }

  /* Filter Panel */
  .filter-panel {
    background: #fafafa;
    padding: 20px;
    height: fit-content;
    position: sticky;
    top: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #ddd;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .clear-btn {
    font-size: 11px;
    color: #666;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .filter-section {
    margin-bottom: 20px;
  }

  .filter-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0 0 8px 0;
  }

  /* Chip Group */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: #000;
  }

  .chip.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Country Select */
  .filter-section select {
    width: 100%;
    padding: 6px;
    font-size: 12px;
    border: 1px solid #ddd;
  }

  .selected-countries {
    margin-top: 6px;
    font-size: 11px;
    color: #666;
  }

  /* Range Inputs */
  .range-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-inputs input {
    flex: 1;
    padding: 6px 8px;
    font-size: 12px;
    border: 1px solid #ddd;
    width: 80px;
  }

  .range-inputs span {
    color: #666;
    font-size: 12px;
  }

  /* Search */
  .filter-section input[type='text'] {
    width: 100%;
    padding: 8px;
    font-size: 12px;
    border: 1px solid #ddd;
  }

  /* Logic Toggle */
  .logic-toggle {
    display: flex;
    gap: 0;
  }

  .logic-toggle button {
    flex: 1;
    padding: 6px 10px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .logic-toggle button:first-child {
    border-right: none;
  }

  .logic-toggle button.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Apply Section */
  .apply-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .apply-btn {
    width: 100%;
    padding: 12px;
    font-size: 13px;
    font-weight: 600;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .apply-btn:hover {
    background: #333;
  }

  .filter-count {
    background: white;
    color: #000;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
  }

  /* Share Section */
  .share-section {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .share-btn,
  .preset-btn {
    flex: 1;
    padding: 8px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .share-btn:hover,
  .preset-btn:hover {
    border-color: #000;
  }

  /* Presets Panel */
  .presets-panel {
    margin-top: 12px;
    padding: 12px;
    background: white;
    border: 1px solid #ddd;
  }

  .presets-panel h4 {
    margin: 0 0 10px 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .no-presets {
    font-size: 11px;
    color: #666;
    margin: 0;
  }

  .preset-list {
    list-style: none;
    margin: 0 0 12px 0;
    padding: 0;
  }

  .preset-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #eee;
  }

  .preset-name {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: transparent;
  }

  .preset-name:hover {
    text-decoration-color: currentColor;
  }

  .preset-delete {
    background: none;
    border: none;
    font-size: 14px;
    color: #999;
    cursor: pointer;
  }

  .preset-delete:hover {
    color: #b10000;
  }

  .save-preset {
    display: flex;
    gap: 6px;
  }

  .save-preset input {
    flex: 1;
    padding: 6px;
    font-size: 11px;
    border: 1px solid #ddd;
  }

  .save-preset button {
    padding: 6px 12px;
    font-size: 11px;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
  }

  /* Results Panel */
  .results-panel {
    min-width: 0;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 20px;
  }

  .results-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: normal;
    font-family: Georgia, serif;
  }

  .results-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #666;
  }

  .loading-text {
    color: #999;
  }

  .query-time {
    color: #999;
  }

  .error-message {
    padding: 20px;
    background: #fee;
    color: #b10000;
    margin-bottom: 20px;
  }

  /* Table */
  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-family: system-ui, sans-serif;
    font-size: 12px;
  }

  thead {
    border-bottom: 2px solid #000;
  }

  th {
    text-align: left;
    padding: 10px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: 600;
  }

  td {
    padding: 10px 8px;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
  }

  tbody tr:hover {
    background: #fafafa;
  }

  .name-col {
    min-width: 180px;
  }

  .asset-link {
    color: #000;
    text-decoration: underline;
    text-decoration-color: transparent;
    font-weight: 500;
  }

  .asset-link:hover {
    text-decoration-color: currentColor;
  }

  .asset-id {
    display: block;
    font-size: 9px;
    color: #999;
    font-family: monospace;
  }

  .capacity-col {
    font-family: monospace;
    font-size: 11px;
  }

  .owner-col a {
    color: #000;
    text-decoration: underline;
    text-decoration-color: transparent;
  }

  .owner-col a:hover {
    text-decoration-color: currentColor;
  }

  .action-col {
    width: 80px;
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }

  .pagination button {
    padding: 6px 12px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .pagination button:hover:not(:disabled) {
    border-color: #000;
  }

  .pagination button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-info {
    font-size: 12px;
    color: #666;
    padding: 0 12px;
  }

  .limit-notice {
    text-align: center;
    font-size: 11px;
    color: #666;
    margin-top: 12px;
  }

  /* No Results */
  .no-results {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .no-results p {
    margin: 0 0 16px 0;
  }

  .no-results button {
    padding: 8px 16px;
    font-size: 12px;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
  }
</style>
