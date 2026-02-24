<script>
  /**
   * GLOBAL ASSET EXPLORER
   * Real-time deck.gl visualization powered by DuckDB WASM queries.
   *
   * Demonstrates:
   * - Instant filtering of 100K+ assets via parquet queries
   * - deck.gl ScatterplotLayer for WebGL rendering
   * - Microvisualizations updating in real-time
   * - Query timing and performance stats
   */

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { link, assetPath } from '$lib/links';
  import { Deck, OrthographicView } from '@deck.gl/core';
  import { ScatterplotLayer } from '@deck.gl/layers';
  import { colors, hexToRgb, colorByTracker } from '$lib/design-tokens';
  import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';

  // DuckDB utilities - loaded dynamically
  let loadParquetFromPath, query;

  // DOM refs
  let mapContainer;
  let deck;

  // Loading state
  let loading = $state(true);
  let loadingPhase = $state('Initializing...');
  let error = $state(null);

  // Data state
  let filteredAssets = $state([]);
  let filteredCount = $state(0);

  // Filter state
  let selectedTrackers = $state([]);
  let selectedStatuses = $state([]);
  let selectedCountries = $state([]);
  let capacityRange = $state([0, 10000]);

  // Facet options (populated from data)
  let trackerFacets = $state([]);
  let statusFacets = $state([]);
  let countryFacets = $state([]);

  // Stats
  let queryTime = $state(0);
  let lastQuerySql = $state('');
  let aggregateStats = $state({
    totalCapacity: 0,
    avgCapacity: 0,
    countries: 0,
    owners: 0,
  });

  // Microvis data
  let capacityHistogram = $state([]);
  let trackerBreakdown = $state([]);
  let statusBreakdown = $state([]);

  // View state (updated by deck.gl callbacks, used for future features)
  let _viewState = $state({
    target: [0, 0],
    zoom: 0,
  });

  // Color helpers
  function trackerToColor(tracker) {
    const hex = colorByTracker.get(tracker) || colors.gray500;
    const rgb = hexToRgb(hex);
    return rgb ? [rgb.r, rgb.g, rgb.b, 200] : [128, 128, 128, 200];
  }

  const INIT_TIMEOUT_MS = 15_000;

  // Initialize DuckDB and load data
  async function initData() {
    try {
      loading = true;
      error = null;
      loadingPhase = 'Loading DuckDB WASM...';

      let timer;

      const initWork = async () => {
        // Dynamic import DuckDB
        const duckdbUtils = await import('$lib/duckdb-utils');
        loadParquetFromPath = duckdbUtils.loadParquetFromPath;
        query = duckdbUtils.query;

        // Load ownership data
        loadingPhase = 'Loading ownership parquet (7MB)...';
        const ownershipPath = assetPath('all_trackers_ownership@1.parquet');
        await loadParquetFromPath(ownershipPath, 'ownership');

        // Load locations for coordinates
        loadingPhase = 'Loading locations parquet...';
        const locationsPath = assetPath('asset_locations.parquet');
        await loadParquetFromPath(locationsPath, 'locations');

        // Skip to loading facets
        loadingPhase = 'Counting assets...';

        // Load initial facets
        loadingPhase = 'Building facets...';
        await loadFacets();

        // Load initial asset data with locations
        loadingPhase = 'Loading asset coordinates...';
        await loadAssets();

        clearTimeout(timer);
      };

      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `DuckDB initialization timed out after ${INIT_TIMEOUT_MS / 1000}s. The data engine may be unresponsive.`
              )
            ),
          INIT_TIMEOUT_MS
        );
      });

      await Promise.race([initWork(), timeout]);

      loading = false;
    } catch (err) {
      error = err?.message || String(err);
      loading = false;
    }
  }

  // Load facet options
  async function loadFacets() {
    const start = performance.now();

    // Trackers
    const trackers = await query(`
      SELECT Tracker as value, COUNT(*) as count
      FROM ownership
      WHERE Tracker IS NOT NULL
      GROUP BY Tracker
      ORDER BY count DESC
    `);
    trackerFacets = trackers.data || [];

    // Statuses
    const statuses = await query(`
      SELECT Status as value, COUNT(*) as count
      FROM ownership
      WHERE Status IS NOT NULL
      GROUP BY Status
      ORDER BY count DESC
    `);
    statusFacets = statuses.data || [];

    // Countries (top 50)
    const countries = await query(`
      SELECT "Owner Headquarters Country" as value, COUNT(*) as count
      FROM ownership
      WHERE "Owner Headquarters Country" IS NOT NULL
      GROUP BY "Owner Headquarters Country"
      ORDER BY count DESC
      LIMIT 50
    `);
    countryFacets = countries.data || [];

    queryTime = Math.round(performance.now() - start);
  }

  // Load assets with coordinates
  async function loadAssets() {
    const start = performance.now();

    // Build WHERE clause from filters
    const conditions = [];

    if (selectedTrackers.length > 0) {
      const trackerList = selectedTrackers.map((t) => `'${t.replace(/'/g, "''")}'`).join(',');
      conditions.push(`o.Tracker IN (${trackerList})`);
    }

    if (selectedStatuses.length > 0) {
      const statusList = selectedStatuses.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');
      conditions.push(`o.Status IN (${statusList})`);
    }

    if (selectedCountries.length > 0) {
      const countryList = selectedCountries.map((c) => `'${c.replace(/'/g, "''")}'`).join(',');
      conditions.push(`o."Owner Headquarters Country" IN (${countryList})`);
    }

    if (capacityRange[0] > 0) {
      conditions.push(`o."Capacity (MW)" >= ${capacityRange[0]}`);
    }
    if (capacityRange[1] < 10000) {
      conditions.push(`o."Capacity (MW)" <= ${capacityRange[1]}`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // Main query - join with locations for coordinates
    const sql = `
      WITH deduped_locations AS (
        SELECT * FROM locations
        QUALIFY ROW_NUMBER() OVER (PARTITION BY "GEM.location.ID" ORDER BY "GEM.location.ID") = 1
      )
      SELECT DISTINCT
        ${ASSET_ID_COALESCE_O} as id,
        o.Project as name,
        o.Tracker as tracker,
        o.Status as status,
        o."Capacity (MW)" as capacity,
        o.Owner as owner,
        o."Owner Headquarters Country" as ownerCountry,
        l.Latitude as lat,
        l.Longitude as lon
      FROM ownership o
      LEFT JOIN deduped_locations l ON o."GEM location ID" = l."GEM.location.ID"
      ${whereClause}
      LIMIT 100000
    `;

    lastQuerySql = sql;
    const result = await query(sql);

    if (result.success && result.data) {
      // Filter to assets with valid coordinates
      const assetsWithCoords = result.data.filter(
        (a) =>
          a.lat != null &&
          a.lon != null &&
          isFinite(a.lat) &&
          isFinite(a.lon) &&
          a.lat >= -90 &&
          a.lat <= 90 &&
          a.lon >= -180 &&
          a.lon <= 180
      );

      filteredAssets = assetsWithCoords;
      filteredCount = assetsWithCoords.length;

      // Update aggregate stats
      const capacities = assetsWithCoords.map((a) => Number(a.capacity) || 0);
      const uniqueCountries = new Set(assetsWithCoords.map((a) => a.ownerCountry).filter(Boolean));
      const uniqueOwners = new Set(assetsWithCoords.map((a) => a.owner).filter(Boolean));

      aggregateStats = {
        totalCapacity: Math.round(capacities.reduce((a, b) => a + b, 0)),
        avgCapacity: Math.round(capacities.reduce((a, b) => a + b, 0) / (capacities.length || 1)),
        countries: uniqueCountries.size,
        owners: uniqueOwners.size,
      };

      // Build microvis data
      buildMicrovisData(assetsWithCoords);

      // Update deck.gl
      updateDeck();
    }

    queryTime = Math.round(performance.now() - start);
  }

  // Build microvisualization data
  function buildMicrovisData(assets) {
    // Capacity histogram (10 buckets)
    const capacities = assets.map((a) => Number(a.capacity) || 0).filter((c) => c > 0);
    const maxCap = Math.max(...capacities, 1);
    const bucketSize = maxCap / 10;
    const histogram = Array(10).fill(0);
    for (const cap of capacities) {
      const bucket = Math.min(9, Math.floor(cap / bucketSize));
      histogram[bucket]++;
    }
    capacityHistogram = histogram.map((count, i) => ({
      range: `${Math.round(i * bucketSize)}-${Math.round((i + 1) * bucketSize)}`,
      count,
      pct: count / capacities.length,
    }));

    // Count-by-field helper
    function countBy(field) {
      const counts = {};
      for (const a of assets) {
        if (a[field]) counts[a[field]] = (counts[a[field]] || 0) + 1;
      }
      return Object.entries(counts)
        .map(([value, count]) => ({ [field]: value, count, pct: count / assets.length }))
        .sort((a, b) => b.count - a.count);
    }

    trackerBreakdown = countBy('tracker');
    statusBreakdown = countBy('status');
  }

  // Initialize deck.gl
  function initDeck() {
    if (!mapContainer || deck) return;

    deck = new Deck({
      parent: mapContainer,
      views: new OrthographicView({ flipY: true }),
      initialViewState: {
        target: [0, 20],
        zoom: 1,
      },
      controller: true,
      onViewStateChange: ({ viewState: vs }) => {
        const zoom = Array.isArray(vs.zoom) ? vs.zoom[0] : vs.zoom;
        _viewState = { target: vs.target, zoom };
      },
      getTooltip: ({ object }) => {
        if (!object) return null;
        return {
          html: `
            <div style="padding: 8px; font-size: 12px;">
              <strong>${object.name || object.id}</strong><br/>
              ${object.tracker || ''} · ${object.status || ''}<br/>
              ${object.capacity ? object.capacity + ' MW' : ''}
            </div>
          `,
        };
      },
    });

    updateDeck();
  }

  // Update deck.gl layers
  function updateDeck() {
    if (!deck) return;

    const scatterLayer = new ScatterplotLayer({
      id: 'assets',
      data: filteredAssets,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => Math.sqrt(Number(d.capacity) || 10) * 2 + 3,
      getFillColor: (d) =>
        /** @type {[number, number, number, number]} */ (trackerToColor(d.tracker)),
      radiusMinPixels: 2,
      radiusMaxPixels: 30,
      pickable: true,
      opacity: 0.8,
      updateTriggers: {
        getPosition: filteredAssets.length,
        getFillColor: filteredAssets.length,
      },
    });

    deck.setProps({ layers: [scatterLayer] });
  }

  // Generic filter toggle — returns new array with item added/removed
  function toggleFilter(arr, value) {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function toggleTracker(tracker) {
    selectedTrackers = toggleFilter(selectedTrackers, tracker);
    loadAssets();
  }
  function toggleStatus(status) {
    selectedStatuses = toggleFilter(selectedStatuses, status);
    loadAssets();
  }
  function toggleCountry(country) {
    selectedCountries = toggleFilter(selectedCountries, country);
    loadAssets();
  }

  function clearFilters() {
    selectedTrackers = [];
    selectedStatuses = [];
    selectedCountries = [];
    capacityRange = [0, 10000];
    loadAssets();
  }

  // Format large numbers
  function formatNumber(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  onMount(() => {
    if (browser) {
      initData().then(() => {
        initDeck();
      });
    }

    return () => {
      if (deck) {
        deck.finalize();
        deck = null;
      }
    };
  });

  // Derived
  const hasFilters = $derived(
    selectedTrackers.length > 0 ||
      selectedStatuses.length > 0 ||
      selectedCountries.length > 0 ||
      capacityRange[0] > 0 ||
      capacityRange[1] < 10000
  );
</script>

<svelte:head>
  <title>Global Asset Map — Global Energy Monitor</title>
  <meta
    name="description"
    content="Interactive map visualization of energy assets worldwide. Filter by tracker type, status, and country to explore the global energy infrastructure."
  />
</svelte:head>

<div class="explorer">
  <!-- Header -->
  <header class="explorer-header">
    <div class="header-left">
      <a href={link('index')} class="back-link">Home</a>
      <h1>Global Asset Explorer</h1>
    </div>
    <div class="header-stats">
      <div class="stat">
        <span class="stat-value">{formatNumber(filteredCount)}</span>
        <span class="stat-label">assets</span>
      </div>
      <div class="stat">
        <span class="stat-value">{formatNumber(aggregateStats.totalCapacity)}</span>
        <span class="stat-label">MW total</span>
      </div>
      <div class="stat">
        <span class="stat-value">{aggregateStats.countries}</span>
        <span class="stat-label">countries</span>
      </div>
      <div class="stat query-stat">
        <DataSourceBadge source="local" label="DuckDB" {queryTime} />
      </div>
    </div>
  </header>

  <div class="explorer-body">
    <!-- Sidebar with filters -->
    <aside class="sidebar">
      {#if hasFilters}
        <button class="clear-filters" onclick={clearFilters}> Clear all filters </button>
      {/if}

      <!-- Tracker filter -->
      <div class="filter-section">
        <h3>Tracker</h3>
        <div class="filter-options">
          {#each trackerFacets.slice(0, 10) as facet}
            <button
              class="filter-chip"
              class:selected={selectedTrackers.includes(facet.value)}
              onclick={() => toggleTracker(facet.value)}
            >
              <span class="chip-label">{facet.value}</span>
              <span class="chip-count">{formatNumber(facet.count)}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Status filter -->
      <div class="filter-section">
        <h3>Status</h3>
        <div class="filter-options">
          {#each statusFacets.slice(0, 10) as facet}
            <button
              class="filter-chip"
              class:selected={selectedStatuses.includes(facet.value)}
              onclick={() => toggleStatus(facet.value)}
            >
              <span class="chip-label">{facet.value}</span>
              <span class="chip-count">{formatNumber(facet.count)}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Country filter -->
      <div class="filter-section">
        <h3>Owner Country</h3>
        <div class="filter-options scrollable">
          {#each countryFacets as facet}
            <button
              class="filter-chip"
              class:selected={selectedCountries.includes(facet.value)}
              onclick={() => toggleCountry(facet.value)}
            >
              <span class="chip-label">{facet.value}</span>
              <span class="chip-count">{formatNumber(facet.count)}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- Microvisualizations -->
      <div class="microvis-section">
        <h3>Tracker Mix</h3>
        <div class="bar-chart">
          {#each trackerBreakdown.slice(0, 6) as item}
            <div class="bar-row">
              <span class="bar-label">{item.tracker}</span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  style="width: {item.pct * 100}%; background: {colorByTracker.get(item.tracker) ||
                    colors.gray500}"
                ></div>
              </div>
              <span class="bar-value">{Math.round(item.pct * 100)}%</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="microvis-section">
        <h3>Status Distribution</h3>
        <div class="bar-chart">
          {#each statusBreakdown.slice(0, 6) as item}
            <div class="bar-row">
              <span class="bar-label">{item.status}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: {item.pct * 100}%"></div>
              </div>
              <span class="bar-value">{Math.round(item.pct * 100)}%</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="microvis-section">
        <h3>Capacity Histogram</h3>
        <div class="histogram">
          {#each capacityHistogram as bucket}
            <div
              class="histogram-bar"
              style="height: {Math.max(2, bucket.pct * 100)}%"
              title="{bucket.range} MW: {bucket.count} assets"
            ></div>
          {/each}
        </div>
        <div class="histogram-labels">
          <span>0 MW</span>
          <span>Max</span>
        </div>
      </div>
    </aside>

    <!-- Map container -->
    <main class="map-container">
      {#if loading}
        <div class="loading-overlay">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p>{loadingPhase}</p>
          </div>
        </div>
      {:else if error}
        <div class="error-overlay">
          <p>Error: {error}</p>
          <button onclick={() => initData()}>Retry</button>
        </div>
      {/if}

      <div bind:this={mapContainer} class="deck-container"></div>

      <!-- Map legend -->
      <div class="map-legend">
        <h4>Trackers</h4>
        {#each trackerBreakdown.slice(0, 5) as item}
          <div class="legend-item">
            <span
              class="legend-dot"
              style="background: {colorByTracker.get(item.tracker) || colors.gray500}"
            ></span>
            <span>{item.tracker}</span>
          </div>
        {/each}
      </div>

      <!-- Query debug panel -->
      <details class="query-panel">
        <summary>SQL Query ({queryTime}ms)</summary>
        <pre>{lastQuerySql}</pre>
      </details>
    </main>
  </div>
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    font-family: var(--font-family-sans);
  }

  .explorer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-5);
    background: var(--color-black);
    color: var(--color-white);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .back-link {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: rgba(255, 255, 255, 0.6);
    text-decoration: none;
  }

  .back-link:hover {
    color: var(--color-white);
  }

  h1 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0;
  }

  .header-stats {
    display: flex;
    gap: var(--space-6);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    opacity: 0.6;
  }

  .explorer-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .sidebar {
    width: 280px;
    padding: var(--space-4);
    overflow-y: auto;
    background: var(--color-gray-50);
    border-right: var(--border-width) solid var(--color-border);
    flex-shrink: 0;
  }

  .clear-filters {
    width: 100%;
    padding: var(--space-2);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    background: transparent;
    border: var(--border-width) solid var(--color-border);
    cursor: pointer;
  }

  .clear-filters:hover {
    background: var(--color-white);
  }

  .filter-section {
    margin-bottom: var(--space-5);
  }

  .filter-section h3 {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2) 0;
  }

  .filter-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .filter-options.scrollable {
    max-height: 200px;
    overflow-y: auto;
  }

  .filter-chip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-body);
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .filter-chip:hover {
    border-color: var(--color-black);
  }

  .filter-chip.selected {
    background: var(--color-black);
    color: var(--color-white);
    border-color: var(--color-black);
  }

  .chip-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-count {
    font-size: var(--font-size-base);
    opacity: 0.6;
    margin-left: var(--space-2);
  }

  .microvis-section {
    margin-top: var(--space-6);
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }

  .microvis-section h3 {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
  }

  .bar-chart {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .bar-label {
    width: 80px;
    font-size: var(--font-size-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    flex: 1;
    height: 8px;
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    background: var(--color-black);
    transition: width var(--transition-normal);
  }

  .bar-value {
    width: 36px;
    font-size: var(--font-size-base);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .histogram {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 60px;
    padding: var(--space-1) 0;
  }

  .histogram-bar {
    flex: 1;
    background: var(--color-black);
    min-height: 2px;
    transition: height var(--transition-normal);
  }

  .histogram-labels {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .map-container {
    flex: 1;
    position: relative;
    background: var(--gem-midnight);
  }

  .deck-container {
    width: 100%;
    height: 100%;
  }

  .loading-overlay,
  .error-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(26, 26, 46, 0.9);
    color: var(--color-white);
    z-index: 100;
  }

  .loading-content {
    text-align: center;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--color-white);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-4);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .map-legend {
    position: absolute;
    bottom: var(--space-5);
    left: var(--space-5);
    padding: var(--space-3);
    background: rgba(0, 0, 0, 0.8);
    color: var(--color-white);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-md);
  }

  .map-legend h4 {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    margin: 0 0 var(--space-2) 0;
    opacity: 0.6;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .query-panel {
    position: absolute;
    bottom: var(--space-5);
    right: var(--space-5);
    max-width: 400px;
    background: rgba(0, 0, 0, 0.9);
    color: var(--color-white);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .query-panel summary {
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
  }

  .query-panel pre {
    margin: 0;
    padding: var(--space-3);
    background: rgba(0, 0, 0, 0.5);
    font-size: var(--font-size-base);
    line-height: var(--leading-normal);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  @media (max-width: 768px) {
    .explorer-body {
      flex-direction: column;
    }

    .sidebar {
      width: 100%;
      max-height: 40vh;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .header-stats {
      display: none;
    }
  }
</style>
