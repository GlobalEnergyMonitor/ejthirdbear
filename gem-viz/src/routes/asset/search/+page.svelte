<script>
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { base, assets as assetsPath } from '$app/paths';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { exportList } from '$lib/exportList';
  import {
    loadManifest,
    findTilesForBounds,
    estimateSize,
    loadTiles,
    buildUnionQuery,
    queryLoadedTiles
  } from '$lib/tileLoader';

  let loading = true;
  let error = null;
  let results = [];
  let queryTime = 0;
  let filterDescription = '';
  let dbReady = false;

  // Tile loading state
  let useTiles = false;
  let tilesLoaded = 0;
  let tilesToLoad = 0;
  let currentTile = '';
  let estimatedDownload = { mb: 0, rows: 0, assets: 0 };

  // Selection state
  let selectedIds = new Set();
  let selectAll = false;

  // Virtual scrolling state
  let visibleStart = 0;
  let visibleCount = 50;
  let containerEl;

  // Derived visible results for performance
  $: visibleResults = results.slice(visibleStart, visibleStart + visibleCount);
  $: hasMoreAbove = visibleStart > 0;
  $: hasMoreBelow = visibleStart + visibleCount < results.length;

  // Parse filter from URL params
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

  // Build SQL WHERE clause for spatial filter
  function buildSpatialWhere(filter) {
    if (!filter) return '1=1';

    if (filter.type === 'bounds') {
      const { north, south, east, west } = filter;
      return `Latitude >= ${south} AND Latitude <= ${north} AND Longitude >= ${west} AND Longitude <= ${east}`;
    }

    if (filter.type === 'polygon') {
      const lons = filter.coordinates.map(c => c[0]);
      const lats = filter.coordinates.map(c => c[1]);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      return `Latitude >= ${minLat} AND Latitude <= ${maxLat} AND Longitude >= ${minLon} AND Longitude <= ${maxLon}`;
    }

    return '1=1';
  }

  // Ray casting point-in-polygon check
  function pointInPolygon(lon, lat, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      const intersect = ((yi > lat) !== (yj > lat))
        && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Generate human-readable filter description
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

  // Try to load using tiles, fall back to monolithic parquet
  async function loadData() {
    const filter = parseFilter();
    filterDescription = describeFilter(filter);

    try {
      loading = true;
      error = null;
      selectedIds = new Set();
      selectAll = false;
      tilesLoaded = 0;
      tilesToLoad = 0;
      currentTile = '';

      // Get bounds from filter
      let bounds = null;
      if (filter?.type === 'bounds') {
        bounds = filter;
      } else if (filter?.type === 'polygon') {
        const lons = filter.coordinates.map(c => c[0]);
        const lats = filter.coordinates.map(c => c[1]);
        bounds = {
          north: Math.max(...lats),
          south: Math.min(...lats),
          east: Math.max(...lons),
          west: Math.min(...lons)
        };
      }

      // Try tile-based loading first
      let data = [];
      const startTime = performance.now();

      try {
        if (bounds) {
          data = await loadWithTiles(bounds, filter);
        } else {
          // No bounds - use legacy approach but warn
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

  // Tile-based loading (efficient for large datasets)
  async function loadWithTiles(bounds, filter) {
    console.log('Loading with spatial tiles...');
    useTiles = true;

    // Load manifest
    const manifest = await loadManifest();

    // Find needed tiles
    const tiles = findTilesForBounds(bounds, manifest);
    estimatedDownload = estimateSize(tiles);
    tilesToLoad = tiles.length;

    console.log(`Need ${tiles.length} tiles (${estimatedDownload.mb.toFixed(1)} MB)`);

    // Load tiles with progress
    await initDuckDB();
    dbReady = true;

    await loadTiles(tiles, (loaded, total, current) => {
      tilesLoaded = loaded;
      currentTile = current;
    });

    // Build and execute query across loaded tiles
    const whereClause = buildSpatialWhere(filter);
    const tableNames = tiles.map(t => t.name.replace(/-/g, '_'));

    const sql = buildUnionQuery(
      tableNames,
      `DISTINCT
        id,
        id as name,
        tracker,
        country,
        state,
        "Latitude" as lat,
        "Longitude" as lon`,
      `"Latitude" IS NOT NULL AND "Longitude" IS NOT NULL AND ${whereClause}`
    ) + `\nORDER BY id\nLIMIT 500`;

    const result = await query(sql);
    if (!result.success) throw new Error(result.error);

    let data = result.data || [];

    // For polygon filters, do precise point-in-polygon check
    if (filter?.type === 'polygon' && data.length > 0) {
      data = data.filter(row =>
        pointInPolygon(row.lon, row.lat, filter.coordinates)
      );
    }

    return data;
  }

  // Legacy full parquet loading (fallback)
  async function loadLegacy(filter) {
    console.log('Loading with legacy full parquet...');
    useTiles = false;

    await initDuckDB();
    dbReady = true;

    const parquetBase = assetsPath || '';

    const locResult = await loadParquetFromPath(`${parquetBase}/all_trackers_ownership@1.parquet`, 'ownership');
    if (!locResult.success) throw new Error(locResult.error);

    const coordResult = await loadParquetFromPath(`${parquetBase}/asset_locations.parquet`, 'locations');
    if (!coordResult.success) throw new Error(coordResult.error);

    const whereClause = buildSpatialWhere(filter);

    const sql = `
      SELECT DISTINCT
        o."GEM location ID" as id,
        o."Project" as name,
        o."Tracker" as tracker,
        o."Status" as status,
        o."Owner" as owner,
        o."Capacity (MW)" as capacity_mw,
        l."Latitude" as lat,
        l."Longitude" as lon,
        l."Country.Area" as country
      FROM ownership o
      JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE l.Latitude IS NOT NULL
        AND l.Longitude IS NOT NULL
        AND ${whereClause}
      ORDER BY o."Capacity (MW)" DESC NULLS LAST
      LIMIT 500
    `;

    const result = await query(sql);
    if (!result.success) throw new Error(result.error);

    let data = result.data || [];

    if (filter?.type === 'polygon' && data.length > 0) {
      data = data.filter(row =>
        pointInPolygon(row.lon, row.lat, filter.coordinates)
      );
    }

    return data;
  }

  // Selection handlers
  function toggleSelect(id) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = selectedIds; // Trigger reactivity
    selectAll = selectedIds.size === results.length;
  }

  function toggleSelectAll() {
    if (selectAll) {
      selectedIds = new Set();
    } else {
      selectedIds = new Set(results.map(r => r.id));
    }
    selectAll = !selectAll;
  }

  function addSelectedToExport() {
    const toAdd = results.filter(r => selectedIds.has(r.id));
    exportList.addMany(toAdd);
    selectedIds = new Set();
    selectAll = false;
  }

  function addAllToExport() {
    exportList.addMany(results);
  }

  // Load more results for virtual scrolling
  function loadMore() {
    visibleCount = Math.min(visibleCount + 50, results.length);
  }

  // Scroll to load more (Intersection Observer approach)
  function handleScroll(e) {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    // Load more when 80% scrolled
    if (scrollTop + clientHeight > scrollHeight * 0.8) {
      loadMore();
    }
  }

  onMount(() => {
    loadData();
  });

  // Reload when URL changes
  $: if ($page.url.searchParams) {
    if (dbReady) loadData();
  }

  $: exportCount = $exportList.length;
</script>

<svelte:head>
  <title>Search Results — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Back to Map</a>
    <span class="title">Spatial Search</span>
    {#if !loading}
      <span class="count">{results.length.toLocaleString()} assets found</span>
    {/if}
    {#if exportCount > 0}
      <a href="{base}/export" class="export-link">Export List ({exportCount})</a>
    {/if}
  </header>

  <div class="filter-info">
    <span class="filter-label">Filter:</span>
    <span class="filter-desc">{filterDescription}</span>
    {#if queryTime > 0}
      <span class="query-time">Query: {queryTime.toFixed(0)}ms</span>
    {/if}
  </div>

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
        {#if currentTile && currentTile !== 'complete'}
          <p class="current-tile">Loading: {currentTile}</p>
        {/if}
        <p class="download-estimate">
          ~{estimatedDownload.mb.toFixed(1)} MB | {estimatedDownload.assets.toLocaleString()} assets
        </p>
      {:else}
        <p>Initializing DuckDB and querying data...</p>
      {/if}
    </div>
  {:else if error}
    <div class="error-state">
      <p>Error: {error}</p>
      <button onclick={loadData}>Retry</button>
    </div>
  {:else if results.length === 0}
    <div class="empty-state">
      <p>No assets found in this area.</p>
      <a href="{base}/index.html">← Draw a different region on the map</a>
    </div>
  {:else}
    <div class="bulk-actions">
      <label class="select-all">
        <input type="checkbox" checked={selectAll} onchange={toggleSelectAll} />
        Select all
      </label>
      {#if selectedIds.size > 0}
        <button class="action-btn" onclick={addSelectedToExport}>
          Add {selectedIds.size} to Export List
        </button>
      {/if}
      <button class="action-btn secondary" onclick={addAllToExport}>
        Add All {results.length} to Export
      </button>
      {#if exportCount > 0}
        <a href="{base}/export" class="action-btn primary">
          Go to Export ({exportCount} assets)
        </a>
      {/if}
    </div>

    <div class="assets-grid" bind:this={containerEl} onscroll={handleScroll}>
      {#each visibleResults as asset (asset.id)}
        <div class="asset-card" class:selected={selectedIds.has(asset.id)}>
          <label class="checkbox-wrapper">
            <input
              type="checkbox"
              checked={selectedIds.has(asset.id)}
              onchange={() => toggleSelect(asset.id)}
            />
          </label>
          <a href="{base}/asset/{asset.id}/index.html" class="asset-content">
            <div class="asset-header">
              <span class="tracker-badge">{asset.tracker || 'Unknown'}</span>
              {#if $exportList.some(e => e.id === asset.id)}
                <span class="in-export-badge">In Export</span>
              {/if}
            </div>
            <h3>{asset.name || asset.id}</h3>
            <div class="asset-meta">
              {#if asset.country}
                <span class="meta-item">{asset.country}</span>
              {/if}
              {#if asset.state}
                <span class="meta-item">{asset.state}</span>
              {/if}
            </div>
            <div class="coords">
              {asset.lat?.toFixed(4)}°, {asset.lon?.toFixed(4)}°
            </div>
          </a>
        </div>
      {/each}
    </div>

    {#if hasMoreBelow}
      <div class="load-more">
        <button class="load-more-btn" onclick={loadMore}>
          Load More ({results.length - visibleCount} remaining)
        </button>
      </div>
    {/if}

    {#if results.length >= 500}
      <p class="limit-notice">Showing first 500 results. Zoom in for more specific results.</p>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 20px;
    display: flex;
    gap: 20px;
    align-items: baseline;
    flex-wrap: wrap;
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
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .count {
    font-size: 10px;
    color: #666;
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

  .filter-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    margin-bottom: 20px;
    font-size: 12px;
  }

  .filter-label {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
    color: #666;
  }

  .filter-desc {
    font-family: monospace;
    color: #333;
  }

  .query-time {
    margin-left: auto;
    color: #999;
    font-size: 10px;
  }

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

  .select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    cursor: pointer;
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

  .loading-state, .error-state, .empty-state {
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
    to { transform: rotate(360deg); }
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

  .assets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }

  .asset-card {
    display: flex;
    background: #fff;
    border: 1px solid #ddd;
    transition: all 0.1s ease;
  }

  .asset-card:hover {
    border-color: #000;
    background: #fafafa;
  }

  .asset-card.selected {
    border-color: #1976d2;
    background: #e3f2fd;
  }

  .checkbox-wrapper {
    display: flex;
    align-items: flex-start;
    padding: 16px 8px 16px 16px;
    cursor: pointer;
  }

  .checkbox-wrapper input {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .asset-content {
    flex: 1;
    padding: 16px 16px 16px 8px;
    text-decoration: none;
    color: #000;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .asset-header {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tracker-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    background: #333;
    color: #fff;
  }

  .status-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    background: #f0f0f0;
    color: #666;
  }

  .status-badge.operating {
    background: #4caf50;
    color: #fff;
  }

  .in-export-badge {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 2px 6px;
    background: #1976d2;
    color: #fff;
  }

  h3 {
    font-size: 14px;
    font-weight: normal;
    margin: 0;
    font-family: Georgia, serif;
    line-height: 1.3;
  }

  .asset-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: #666;
  }

  .meta-item {
    padding: 2px 6px;
    background: #f5f5f5;
    border: 1px solid #eee;
  }

  .meta-item.capacity {
    font-weight: bold;
    background: #e3f2fd;
    border-color: #bbdefb;
    color: #1976d2;
  }

  .coords {
    font-size: 10px;
    font-family: monospace;
    color: #999;
    margin-top: auto;
  }

  .load-more {
    display: flex;
    justify-content: center;
    padding: 20px;
  }

  .load-more-btn {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 10px 24px;
    background: #f5f5f5;
    color: #333;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .load-more-btn:hover {
    background: #e0e0e0;
    border-color: #bbb;
  }

  .limit-notice {
    text-align: center;
    padding: 20px;
    color: #666;
    font-size: 12px;
    font-style: italic;
  }

  @media (max-width: 768px) {
    main {
      padding: 15px;
    }

    .assets-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
