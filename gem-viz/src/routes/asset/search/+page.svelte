<script>
  // ============================================================================
  // SPATIAL SEARCH PAGE
  // Shows assets within a geographic bounds/polygon filter
  // Uses client-side GeoJSON filtering + DuckDB for owner enrichment
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink, assetPath, entityLink } from '$lib/links';
  import { exportList } from '$lib/exportList';
  import { formatCount, formatCapacity } from '$lib/format';
  import DataTable from '$lib/components/DataTable.svelte';
  import MiniBarChart from '$lib/components/MiniBarChart.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  // DuckDB for owner queries (dynamic import to avoid SSR issues)
  /** @type {typeof import('$lib/duckdb-utils').initDuckDB} */
  let initDuckDB;
  /** @type {typeof import('$lib/duckdb-utils').loadParquetFromPath} */
  let loadParquetFromPath;
  /** @type {typeof import('$lib/duckdb-utils').query} */
  let executeQuery;

  // --- STATE ---
  let loading = $state(true);
  /** @type {string | null} */
  let error = $state(null);
  let results = $state([]);
  let allResults = $state([]); // Keep all results for stats
  let queryTime = $state(0);
  let filterDescription = $state('');
  let loadingStatus = $state('Loading asset data...');
  let _bounds = $state(null); // Stored for potential future use

  // Owner data
  let topOwners = $state([]);
  let ownersLoading = $state(false);
  let totalCapacity = $state(0);

  // --- DERIVED STATS ---
  const stats = $derived.by(() => {
    if (!allResults.length) return null;

    // Count by tracker
    const trackerCounts = {};
    const countryCounts = {};

    allResults.forEach((r) => {
      const tracker = r.tracker || 'Unknown';
      const country = r.country || 'Unknown';
      trackerCounts[tracker] = (trackerCounts[tracker] || 0) + 1;
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    });

    return {
      total: allResults.length,
      trackers: Object.entries(trackerCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      countries: Object.entries(countryCounts)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
      countryCount: Object.keys(countryCounts).length,
    };
  });

  // --- TABLE COLUMNS ---
  /** @type {Array<{key: string, label: string, sortable?: boolean, filterable?: boolean, type?: 'string' | 'number' | 'date', width?: string}>} */
  const tableColumns = [
    { key: 'name', label: 'Name', sortable: true, filterable: true },
    { key: 'tracker', label: 'Tracker', sortable: true, filterable: true, width: '140px' },
    { key: 'country', label: 'Country', sortable: true, filterable: true, width: '140px' },
    { key: 'id', label: 'GEM ID', sortable: true, filterable: true, width: '160px' },
  ];

  // --- HANDLERS ---
  function handleRowClick(row) {
    goto(assetLink(row.id));
  }

  function addAllToExport() {
    exportList.addMany(allResults);
  }

  // --- HELPERS: FILTER PARSING ---
  function parseFilter() {
    const params = $page.url.searchParams;
    const boundsStr = params.get('bounds');
    const polygonStr = params.get('polygon');

    if (boundsStr) {
      try {
        return { type: 'bounds', ...JSON.parse(boundsStr) };
      } catch (e) {
        console.error('Failed to parse bounds:', e);
      }
    }
    if (polygonStr) {
      try {
        return { type: 'polygon', coordinates: JSON.parse(polygonStr) };
      } catch (e) {
        console.error('Failed to parse polygon:', e);
      }
    }
    return null;
  }

  function describeFilter(filter) {
    if (!filter) return 'All assets';
    if (filter.type === 'bounds') {
      const { north, south, east, west } = filter;
      const latRange = `${Math.abs(south).toFixed(1)}°${south >= 0 ? 'N' : 'S'} – ${Math.abs(north).toFixed(1)}°${north >= 0 ? 'N' : 'S'}`;
      const lonRange = `${Math.abs(west).toFixed(1)}°${west >= 0 ? 'E' : 'W'} – ${Math.abs(east).toFixed(1)}°${east >= 0 ? 'E' : 'W'}`;
      return `${latRange}, ${lonRange}`;
    }
    if (filter.type === 'polygon') {
      return `Custom polygon (${filter.coordinates.length} vertices)`;
    }
    return 'Filtered';
  }

  // --- HELPERS: SPATIAL ---
  /** Ray casting point-in-polygon check */
  function pointInPolygon(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];
      const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Check if point is within bounds */
  function pointInBounds(lon, lat, bounds) {
    return lat >= bounds.south && lat <= bounds.north && lon >= bounds.west && lon <= bounds.east;
  }

  // --- MAIN DATA LOADER (GeoJSON-based, no DuckDB) ---
  async function loadData() {
    const filter = parseFilter();
    filterDescription = describeFilter(filter);

    if (filter?.type === 'bounds') {
      _bounds = filter;
    }

    if (!filter) {
      error = 'No filter specified. Draw a region on the map first.';
      loading = false;
      return;
    }

    try {
      loading = true;
      error = null;
      loadingStatus = 'Fetching asset locations...';

      const startTime = performance.now();

      // Load the GeoJSON file (same one used by the map)
      const response = await fetch(assetPath('points.geojson'));
      if (!response.ok) {
        throw new Error(`Failed to load asset data: ${response.status}`);
      }

      loadingStatus = 'Parsing GeoJSON...';
      const geojson = await response.json();
      console.log(`Loaded ${geojson.features.length} features from points.geojson`);

      loadingStatus = 'Filtering assets...';

      // Get bounds for quick pre-filter
      let filterBounds = null;
      if (filter.type === 'bounds') {
        filterBounds = filter;
      } else if (filter.type === 'polygon') {
        const lons = filter.coordinates.map((c) => c[0]);
        const lats = filter.coordinates.map((c) => c[1]);
        filterBounds = {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lons),
          west: Math.min(...lons),
        };
      }

      // Filter features
      let filtered = geojson.features.filter((f) => {
        const [lon, lat] = f.geometry.coordinates;
        if (!lon || !lat) return false;

        // Quick bounds check first
        if (filterBounds && !pointInBounds(lon, lat, filterBounds)) return false;

        // For polygons, do precise check
        if (filter.type === 'polygon') {
          return pointInPolygon(lon, lat, filter.coordinates);
        }

        return true;
      });

      // Convert to table format
      const data = filtered.map((f) => ({
        id: f.properties.id || f.properties['GEM unit ID'],
        name: f.properties.name || f.properties.Project || f.properties.id,
        tracker: f.properties.tracker || f.properties.Tracker,
        country: f.properties.country || f.properties['Country/Area'],
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      }));

      queryTime = performance.now() - startTime;
      allResults = data;
      results = data.slice(0, 500); // Limit display to 500
      console.log(
        `Found ${data.length} assets (showing ${results.length}) in ${queryTime.toFixed(0)}ms`
      );

      // Load owner data in background
      loadOwnerData(data.map((d) => d.id));
    } catch (err) {
      console.error('Search error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // --- OWNER DATA LOADER ---
  async function loadOwnerData(assetIds) {
    if (!assetIds.length) return;

    try {
      ownersLoading = true;

      // Dynamically import DuckDB utils
      const duckdbUtils = await import('$lib/duckdb-utils');
      initDuckDB = duckdbUtils.initDuckDB;
      loadParquetFromPath = duckdbUtils.loadParquetFromPath;
      executeQuery = duckdbUtils.query;

      await initDuckDB();

      // Load ownership parquet
      const parquetPath = assetPath('all_trackers_ownership@1.parquet');
      const loadResult = await loadParquetFromPath(parquetPath, 'ownership');
      if (!loadResult.success) {
        console.warn('Failed to load ownership data:', loadResult.error);
        return;
      }

      // Build ID list for SQL IN clause (limit to first 1000 for performance)
      const idList = assetIds
        .slice(0, 1000)
        .map((id) => `'${id}'`)
        .join(',');

      // Query top owners by asset count in this region
      const ownerQuery = `
        SELECT
          "Owner" as name,
          "Owner GEM Entity ID" as entity_id,
          COUNT(DISTINCT COALESCE("GEM location ID", "GEM unit ID")) as asset_count,
          SUM(COALESCE("Capacity (MW)", 0) * COALESCE("Share", 100) / 100) as capacity_mw
        FROM ownership
        WHERE COALESCE("GEM location ID", "GEM unit ID") IN (${idList})
          AND "Owner" IS NOT NULL
          AND "Owner" != ''
        GROUP BY "Owner", "Owner GEM Entity ID"
        ORDER BY asset_count DESC
        LIMIT 10
      `;

      const result = await executeQuery(ownerQuery);
      if (result.success && result.data) {
        topOwners = result.data.map((row) => ({
          name: row.name,
          entityId: row.entity_id,
          assetCount: Number(row.asset_count),
          capacityMw: Number(row.capacity_mw) || 0,
        }));

        // Also get total capacity
        const capacityQuery = `
          SELECT SUM(COALESCE("Capacity (MW)", 0)) as total
          FROM ownership
          WHERE COALESCE("GEM location ID", "GEM unit ID") IN (${idList})
        `;
        const capResult = await executeQuery(capacityQuery);
        if (capResult.success && capResult.data?.[0]) {
          totalCapacity = Number(capResult.data[0].total) || 0;
        }

        console.log(`Loaded ${topOwners.length} top owners, total capacity: ${totalCapacity} MW`);
      }
    } catch (err) {
      console.error('Failed to load owner data:', err);
    } finally {
      ownersLoading = false;
    }
  }

  // --- LIFECYCLE ---
  onMount(() => {
    loadData();
  });

  // Derived values
  let exportCount = $derived($exportList.length);
</script>

<svelte:head>
  <title>Search Results — GEM Viz</title>
</svelte:head>

<main>
  <!-- Header -->
  <header>
    <a href={link('index')} class="back-link">← Back to Map</a>
    <h1>Spatial Search Results</h1>
  </header>

  <!-- Loading State -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p>{loadingStatus}</p>
    </div>

    <!-- Error State -->
  {:else if error}
    <div class="error-state">
      <p>Error: {error}</p>
      <button class="btn" onclick={loadData}>Retry</button>
    </div>

    <!-- Empty State -->
  {:else if allResults.length === 0}
    <div class="empty-state">
      <p>No assets found in this area.</p>
      <a href={link('index')}>Draw a different region on the map</a>
    </div>

    <!-- Results -->
  {:else}
    <!-- Summary Panel -->
    <div class="summary-panel">
      <div class="summary-header">
        <div class="summary-stat primary">
          <span class="stat-value">{formatCount(stats.total)}</span>
          <span class="stat-label">Assets Found</span>
        </div>
        {#if totalCapacity > 0}
          <div class="summary-stat">
            <span class="stat-value">{formatCapacity(totalCapacity)}</span>
            <span class="stat-label">Total Capacity</span>
          </div>
        {/if}
        <div class="summary-stat">
          <span class="stat-value">{stats.trackers.length}</span>
          <span class="stat-label">{stats.trackers.length === 1 ? 'Tracker' : 'Trackers'}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-value">{stats.countryCount}</span>
          <span class="stat-label">{stats.countryCount === 1 ? 'Country' : 'Countries'}</span>
        </div>
        <div class="summary-meta">
          <span class="filter-desc">{filterDescription}</span>
          <span class="query-time">{queryTime.toFixed(0)}ms</span>
        </div>
      </div>

      <!-- Micro Visualizations -->
      <div class="summary-charts">
        <div class="chart-section">
          <h3>By Tracker</h3>
          <div class="tracker-breakdown">
            {#each stats.trackers as { label, value }}
              <div class="tracker-row">
                <TrackerIcon tracker={label} size={12} />
                <span class="tracker-name">{label}</span>
                <div class="tracker-bar-wrapper">
                  <div class="tracker-bar" style="width: {(value / stats.total) * 100}%"></div>
                </div>
                <span class="tracker-count">{formatCount(value)}</span>
                <span class="tracker-pct">{((value / stats.total) * 100).toFixed(0)}%</span>
              </div>
            {/each}
          </div>
        </div>

        <div class="chart-section">
          <h3>Top Countries</h3>
          <MiniBarChart
            data={stats.countries}
            maxItems={6}
            width={280}
            barHeight={16}
            showValues={true}
          />
        </div>

        <!-- Top Owners -->
        <div class="chart-section owners-section">
          <h3>
            Top Owners
            {#if ownersLoading}<span class="loading-indicator">Loading...</span>{/if}
          </h3>
          {#if topOwners.length > 0}
            <div class="owners-list">
              {#each topOwners as owner, i}
                <a href={entityLink(owner.entityId)} class="owner-row">
                  <span class="owner-rank">#{i + 1}</span>
                  <span class="owner-name">{owner.name}</span>
                  <span class="owner-stats">
                    <span class="owner-assets">{formatCount(owner.assetCount)} assets</span>
                    {#if owner.capacityMw > 0}
                      <span class="owner-capacity">{formatCapacity(owner.capacityMw)}</span>
                    {/if}
                  </span>
                </a>
              {/each}
            </div>
          {:else if !ownersLoading}
            <p class="no-owners">No owner data available</p>
          {/if}
        </div>
      </div>
    </div>

    <!-- Actions Bar -->
    <div class="actions-bar">
      <button class="btn btn-primary" onclick={addAllToExport}>
        Add All {formatCount(allResults.length)} to Export
      </button>
      {#if exportCount > 0}
        <a href={link('export')} class="btn btn-outline">
          View Export List ({formatCount(exportCount)})
        </a>
      {/if}
      {#if allResults.length > 500}
        <span class="limit-notice"
          >Showing first 500 of {formatCount(allResults.length)} results</span
        >
      {/if}
    </div>

    <!-- Results Table -->
    <div class="table-container">
      <DataTable
        columns={tableColumns}
        data={results}
        pageSize={50}
        showGlobalSearch={true}
        showColumnFilters={true}
        showPagination={true}
        showExport={true}
        showColumnToggle={false}
        stickyHeader={true}
        striped={true}
        onRowClick={handleRowClick}
      />
    </div>
  {/if}
</main>

<style>
  /* Layout */
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 24px 32px;
  }

  /* Header */
  header {
    margin-bottom: 24px;
  }

  .back-link {
    display: inline-block;
    color: #666;
    text-decoration: none;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .back-link:hover {
    color: #000;
  }

  h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    letter-spacing: -0.3px;
  }

  /* Summary Panel */
  .summary-panel {
    background: #fafafa;
    border: 1px solid #e0e0e0;
    padding: 20px 24px;
    margin-bottom: 20px;
  }

  .summary-header {
    display: flex;
    align-items: flex-end;
    gap: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e0e0e0;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .summary-stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .summary-stat.primary .stat-value {
    font-size: 32px;
    font-weight: 700;
    line-height: 1;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 600;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .summary-meta {
    margin-left: auto;
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .filter-desc {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    color: #333;
  }

  .query-time {
    font-size: 10px;
    color: #999;
  }

  /* Charts */
  .summary-charts {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 32px;
  }

  .chart-section h3 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .loading-indicator {
    font-weight: normal;
    color: #999;
    font-size: 9px;
  }

  /* Owners Section */
  .owners-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .owner-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: #fff;
    border: 1px solid #eee;
    text-decoration: none;
    color: inherit;
    transition: all 0.15s ease;
  }

  .owner-row:hover {
    border-color: #333;
    background: #fafafa;
  }

  .owner-rank {
    font-size: 10px;
    color: #999;
    width: 20px;
    font-family: 'SF Mono', Monaco, monospace;
  }

  .owner-name {
    flex: 1;
    font-size: 12px;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .owner-stats {
    display: flex;
    gap: 8px;
    font-size: 10px;
    color: #666;
  }

  .owner-assets {
    font-family: 'SF Mono', Monaco, monospace;
  }

  .owner-capacity {
    color: #999;
  }

  .no-owners {
    font-size: 11px;
    color: #999;
    font-style: italic;
    margin: 0;
  }

  /* Tracker Breakdown */
  .tracker-breakdown {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tracker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .tracker-name {
    width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #333;
  }

  .tracker-bar-wrapper {
    flex: 1;
    height: 8px;
    background: #eee;
    border-radius: 4px;
    overflow: hidden;
  }

  .tracker-bar {
    height: 100%;
    background: #333;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .tracker-count {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 11px;
    width: 40px;
    text-align: right;
    color: #333;
  }

  .tracker-pct {
    font-size: 10px;
    width: 32px;
    text-align: right;
    color: #999;
  }

  /* Actions Bar */
  .actions-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fff;
    border: 1px solid #e0e0e0;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .btn {
    padding: 8px 16px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid #000;
    background: #fff;
    color: #000;
    cursor: pointer;
    text-decoration: none;
    font-weight: 500;
  }

  .btn:hover {
    background: #f5f5f5;
  }

  .btn-primary {
    background: #000;
    color: #fff;
  }

  .btn-primary:hover {
    background: #333;
  }

  .btn-outline {
    background: transparent;
  }

  .limit-notice {
    margin-left: auto;
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  /* Table Container */
  .table-container {
    border: 1px solid #e0e0e0;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: #666;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #eee;
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: #d32f2f;
  }

  .error-state button {
    margin-top: 16px;
  }

  /* Responsive */
  @media (max-width: 800px) {
    main {
      padding: 16px;
    }

    .summary-charts {
      grid-template-columns: 1fr;
      gap: 24px;
    }

    .summary-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }

    .summary-meta {
      margin-left: 0;
      text-align: left;
    }
  }
</style>
