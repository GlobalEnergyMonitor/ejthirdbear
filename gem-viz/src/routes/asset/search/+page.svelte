<script>
  // ============================================================================
  // SPATIAL SEARCH PAGE
  // Shows assets within a geographic bounds/polygon filter
  // Supports both tile-based loading (efficient) and legacy monolithic parquet
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink, assetPath } from '$lib/links';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { exportList } from '$lib/exportList';
  import {
    loadManifest,
    findTilesForBounds,
    estimateSize,
    loadTiles,
    buildUnionQuery,
  } from '$lib/tileLoader';
  import DataTable from '$lib/components/DataTable.svelte';

  // --- STATE ---
  let loading = true;
  /** @type {string | null} */
  let error = null;
  let results = [];
  let queryTime = 0;
  let filterDescription = '';
  let dbReady = false;

  // Tile loading progress
  let useTiles = false;
  let tilesLoaded = 0;
  let tilesToLoad = 0;
  let currentTile = '';
  let estimatedDownload = { mb: 0, rows: 0, assets: 0 };

  // --- TABLE COLUMNS ---
  const tableColumns = [
    { key: 'id', label: 'ID', sortable: true, filterable: true, width: '200px' },
    { key: 'name', label: 'Name', sortable: true, filterable: true },
    { key: 'tracker', label: 'Tracker', sortable: true, filterable: true, width: '120px' },
    { key: 'country', label: 'Country', sortable: true, filterable: true, width: '140px' },
    { key: 'state', label: 'State', sortable: true, filterable: true, width: '120px' },
    { key: 'lat', label: 'Latitude', sortable: true, type: 'number', width: '100px' },
    { key: 'lon', label: 'Longitude', sortable: true, type: 'number', width: '100px' },
  ];

  // --- HANDLERS ---
  function handleRowClick(row) {
    goto(assetLink(row.id));
  }

  function addAllToExport() {
    exportList.addMany(results);
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
      return `Rectangle: ${south.toFixed(2)}°N to ${north.toFixed(2)}°N, ${west.toFixed(2)}°E to ${east.toFixed(2)}°E`;
    }
    if (filter.type === 'polygon') {
      return `Custom polygon (${filter.coordinates.length} vertices)`;
    }
    return 'Filtered';
  }

  // --- HELPERS: SPATIAL ---
  function buildSpatialWhere(filter) {
    if (!filter) return '1=1';
    if (filter.type === 'bounds') {
      const { north, south, east, west } = filter;
      return `Latitude >= ${south} AND Latitude <= ${north} AND Longitude >= ${west} AND Longitude <= ${east}`;
    }
    if (filter.type === 'polygon') {
      const lons = filter.coordinates.map((c) => c[0]);
      const lats = filter.coordinates.map((c) => c[1]);
      return `Latitude >= ${Math.min(...lats)} AND Latitude <= ${Math.max(...lats)} AND Longitude >= ${Math.min(...lons)} AND Longitude <= ${Math.max(...lons)}`;
    }
    return '1=1';
  }

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

  // --- DATA LOADING: TILES ---
  async function loadWithTiles(bounds, filter) {
    console.log('Loading with spatial tiles...');
    useTiles = true;

    const manifest = await loadManifest();
    const tiles = findTilesForBounds(bounds, manifest);
    estimatedDownload = estimateSize(tiles);
    tilesToLoad = tiles.length;
    console.log(`Need ${tiles.length} tiles (${estimatedDownload.mb.toFixed(1)} MB)`);

    await initDuckDB();
    dbReady = true;

    await loadTiles(tiles, (loaded, total, current) => {
      tilesLoaded = loaded;
      currentTile = current;
    });

    const whereClause = buildSpatialWhere(filter);
    const tableNames = tiles.map((t) => t.name.replace(/-/g, '_'));
    const sql =
      buildUnionQuery(
        tableNames,
        `DISTINCT id, id as name, tracker, country, state, "Latitude" as lat, "Longitude" as lon`,
        `"Latitude" IS NOT NULL AND "Longitude" IS NOT NULL AND ${whereClause}`
      ) + `\nORDER BY id\nLIMIT 500`;

    const result = await query(sql);
    if (!result.success) throw new Error(result.error);

    let data = result.data || [];
    if (filter?.type === 'polygon' && data.length > 0) {
      data = data.filter((row) => pointInPolygon(row.lon, row.lat, filter.coordinates));
    }
    return data;
  }

  // --- DATA LOADING: LEGACY ---
  async function loadLegacy(filter) {
    console.log('Loading with legacy full parquet...');
    useTiles = false;

    await initDuckDB();
    dbReady = true;

    const locResult = await loadParquetFromPath(
      assetPath('all_trackers_ownership@1.parquet'),
      'ownership'
    );
    if (!locResult.success) throw new Error(locResult.error);

    const coordResult = await loadParquetFromPath(
      assetPath('asset_locations.parquet'),
      'locations'
    );
    if (!coordResult.success) throw new Error(coordResult.error);

    const whereClause = buildSpatialWhere(filter);
    const sql = `
      SELECT DISTINCT
        o."GEM unit ID" as id, o."Project" as name, o."Tracker" as tracker, o."Status" as status,
        FIRST(o."Owner") as owner, o."Capacity (MW)" as capacity_mw,
        l."Latitude" as lat, l."Longitude" as lon, l."Country.Area" as country
      FROM ownership o
      JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE l.Latitude IS NOT NULL AND l.Longitude IS NOT NULL AND o."GEM unit ID" IS NOT NULL AND ${whereClause}
      GROUP BY o."GEM unit ID", o."Project", o."Tracker", o."Status", o."Capacity (MW)", l."Latitude", l."Longitude", l."Country.Area"
      ORDER BY o."Capacity (MW)" DESC NULLS LAST
      LIMIT 500
    `;

    const result = await query(sql);
    if (!result.success) throw new Error(result.error);

    let data = result.data || [];
    if (filter?.type === 'polygon' && data.length > 0) {
      data = data.filter((row) => pointInPolygon(row.lon, row.lat, filter.coordinates));
    }
    return data;
  }

  // --- MAIN DATA LOADER ---
  async function loadData() {
    const filter = parseFilter();
    filterDescription = describeFilter(filter);

    try {
      loading = true;
      error = null;
      tilesLoaded = 0;
      tilesToLoad = 0;
      currentTile = '';

      // Get bounds from filter
      let bounds = null;
      if (filter?.type === 'bounds') {
        bounds = filter;
      } else if (filter?.type === 'polygon') {
        const lons = filter.coordinates.map((c) => c[0]);
        const lats = filter.coordinates.map((c) => c[1]);
        bounds = {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lons),
          west: Math.min(...lons),
        };
      }

      let data = [];
      const startTime = performance.now();

      try {
        if (bounds) {
          data = await loadWithTiles(bounds, filter);
        } else {
          console.warn('No bounds filter - using legacy full parquet load');
          data = await loadLegacy(filter);
        }
      } catch (tileErr) {
        console.warn('Tile loading failed, falling back to legacy:', tileErr.message);
        useTiles = false;
        data = await loadLegacy(filter);
      }

      queryTime = performance.now() - startTime;
      results = data;
      console.log(`Found ${results.length} assets in ${queryTime.toFixed(0)}ms`);
    } catch (err) {
      console.error('Search error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // --- LIFECYCLE ---
  onMount(() => {
    loadData();
  });

  // Reload when URL changes
  $: if ($page.url.searchParams) {
    if (dbReady) loadData();
  }

  $: exportCount = $exportList.length;
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>Search Results — GEM Viz</title>
</svelte:head>

<main>
  <!-- Header -->
  <header>
    <a href={link('index')} class="back-link">← Back to Map</a>
    <span class="title">Spatial Search</span>
    {#if !loading}<span class="count">{results.length.toLocaleString()} assets found</span>{/if}
    {#if exportCount > 0}<a href={link('export')} class="export-link">Export List ({exportCount})</a
      >{/if}
  </header>

  <!-- Filter Info -->
  <div class="filter-info">
    <span class="filter-label">Filter:</span>
    <span class="filter-desc">{filterDescription}</span>
    {#if queryTime > 0}<span class="query-time">Query: {queryTime.toFixed(0)}ms</span>{/if}
  </div>

  <!-- Loading State -->
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      {#if useTiles && tilesToLoad > 0}
        <p class="loading-title">Loading spatial tiles...</p>
        <div class="tile-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: {(tilesLoaded / tilesToLoad) * 100}%"></div>
          </div>
          <span class="progress-text">{tilesLoaded} / {tilesToLoad} tiles</span>
        </div>
        {#if currentTile && currentTile !== 'complete'}<p class="current-tile">
            Loading: {currentTile}
          </p>{/if}
        <p class="download-estimate">
          ~{estimatedDownload.mb.toFixed(1)} MB | {estimatedDownload.assets.toLocaleString()} assets
        </p>
      {:else}
        <p>Initializing DuckDB and querying data...</p>
      {/if}
    </div>

    <!-- Error State -->
  {:else if error}
    <div class="error-state">
      <p>Error: {error}</p>
      <button onclick={loadData}>Retry</button>
    </div>

    <!-- Empty State -->
  {:else if results.length === 0}
    <div class="empty-state">
      <p>No assets found in this area.</p>
      <a href={link('index')}>← Draw a different region on the map</a>
    </div>

    <!-- Results -->
  {:else}
    <div class="bulk-actions">
      <button class="action-btn secondary" onclick={addAllToExport}
        >Add All {results.length} to Export</button
      >
      {#if exportCount > 0}<a href={link('export')} class="action-btn primary"
          >Go to Export ({exportCount} assets)</a
        >{/if}
    </div>

    <div class="table-container">
      <DataTable
        columns={tableColumns}
        data={results}
        pageSize={50}
        showGlobalSearch={true}
        showColumnFilters={true}
        showPagination={true}
        showExport={true}
        showColumnToggle={true}
        stickyHeader={true}
        striped={true}
        onRowClick={handleRowClick}
      />
    </div>

    {#if results.length >= 500}
      <p class="limit-notice">Showing first 500 results. Zoom in for more specific results.</p>
    {/if}
  {/if}
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  main {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px 40px;
  }

  /* Header */
  header {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 18px;
    margin-bottom: 18px;
  }
  .back-link {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .back-link:hover {
    text-decoration: none;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .count {
    font-size: 10px;
    color: #555;
    padding: 6px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 999px;
    background: #f7f7f7;
  }
  .export-link {
    margin-left: auto;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    background: #1976d2;
    color: #fff;
    text-decoration: none;
  }
  .export-link:hover {
    background: #1565c0;
  }

  /* Filter Info */
  .filter-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #fdfbf7;
    border: 1px solid #e0e0e0;
    margin-bottom: 16px;
    font-size: 12px;
    border-radius: 6px;
  }
  .filter-label {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
    color: #333;
    letter-spacing: 0.4px;
  }
  .filter-desc {
    font-family: monospace;
    color: #333;
  }
  .query-time {
    margin-left: auto;
    color: #666;
    font-size: 10px;
  }

  /* Bulk Actions */
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #fff;
    border: 1px solid #ddd;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .table-container {
    margin-bottom: 20px;
  }
  .action-btn {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 6px 12px;
    background: #000;
    color: #fff;
    border: none;
    cursor: pointer;
    text-decoration: none;
  }
  .action-btn:hover {
    background: #333;
  }
  .action-btn.secondary {
    background: #666;
  }
  .action-btn.primary {
    background: #1976d2;
  }
  .action-btn.primary:hover {
    background: #1565c0;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }
  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #ddd;
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;
  }
  .loading-title {
    font-weight: bold;
    font-size: 14px;
    margin-bottom: 16px;
    color: #333;
  }
  .tile-progress {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 300px;
    margin: 0 auto 12px;
  }
  .progress-bar {
    flex: 1;
    height: 6px;
    background: #e0e0e0;
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: #000;
    transition: width 0.3s ease;
  }
  .progress-text {
    font-size: 11px;
    font-family: monospace;
    color: #666;
    white-space: nowrap;
  }
  .current-tile {
    font-size: 10px;
    font-family: monospace;
    color: #999;
    margin-bottom: 8px;
  }
  .download-estimate {
    font-size: 11px;
    color: #666;
    padding: 6px 12px;
    background: #f5f5f5;
    display: inline-block;
    border: 1px solid #ddd;
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
    margin-top: 10px;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    border: none;
    cursor: pointer;
  }
  .limit-notice {
    text-align: center;
    padding: 20px;
    color: #666;
    font-size: 12px;
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
  }
</style>
