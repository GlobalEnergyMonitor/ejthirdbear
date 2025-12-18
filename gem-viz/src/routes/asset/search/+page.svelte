<script>
  // ============================================================================
  // SPATIAL SEARCH PAGE
  // Shows assets within a geographic bounds/polygon filter
  // Uses client-side GeoJSON filtering (no DuckDB WASM - works on static hosting)
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink, assetPath } from '$lib/links';
  import { exportList } from '$lib/exportList';
  import DataTable from '$lib/components/DataTable.svelte';

  // --- STATE ---
  let loading = $state(true);
  /** @type {string | null} */
  let error = $state(null);
  let results = $state([]);
  let queryTime = $state(0);
  let filterDescription = $state('');
  let loadingStatus = $state('Loading asset data...');

  // --- TABLE COLUMNS ---
  /** @type {Array<{key: string, label: string, sortable?: boolean, filterable?: boolean, type?: 'string' | 'number' | 'date', width?: string}>} */
  const tableColumns = [
    { key: 'id', label: 'ID', sortable: true, filterable: true, width: '200px' },
    { key: 'name', label: 'Name', sortable: true, filterable: true },
    { key: 'tracker', label: 'Tracker', sortable: true, filterable: true, width: '120px' },
    { key: 'country', label: 'Country', sortable: true, filterable: true, width: '140px' },
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
      let bounds = null;
      if (filter.type === 'bounds') {
        bounds = filter;
      } else if (filter.type === 'polygon') {
        const lons = filter.coordinates.map((c) => c[0]);
        const lats = filter.coordinates.map((c) => c[1]);
        bounds = {
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
        if (bounds && !pointInBounds(lon, lat, bounds)) return false;

        // For polygons, do precise check
        if (filter.type === 'polygon') {
          return pointInPolygon(lon, lat, filter.coordinates);
        }

        return true;
      });

      // Convert to table format and limit to 500
      const data = filtered.slice(0, 500).map((f) => ({
        id: f.properties.id || f.properties['GEM unit ID'],
        name: f.properties.name || f.properties.Project || f.properties.id,
        tracker: f.properties.tracker || f.properties.Tracker,
        country: f.properties.country || f.properties['Country/Area'],
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
      }));

      queryTime = performance.now() - startTime;
      results = data;
      console.log(
        `Found ${filtered.length} assets (showing ${data.length}) in ${queryTime.toFixed(0)}ms`
      );
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

  // Derived values
  let exportCount = $derived($exportList.length);
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
    <a href={link('index')} class="back-link">Back to Map</a>
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
      <p>{loadingStatus}</p>
    </div>

    <!-- Error State -->
  {:else if error}
    <div class="error-state">
      <p>Error: {error}</p>
      <button class="btn" onclick={loadData}>Retry</button>
    </div>

    <!-- Empty State -->
  {:else if results.length === 0}
    <div class="empty-state">
      <p>No assets found in this area.</p>
      <a href={link('index')}>Draw a different region on the map</a>
    </div>

    <!-- Results -->
  {:else}
    <div class="bulk-actions">
      <button class="btn btn-outline" onclick={addAllToExport}
        >Add All {results.length} to Export</button
      >
      {#if exportCount > 0}<a href={link('export')} class="btn btn-primary"
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
    padding: 20px 40px;
  }

  /* Header */
  header {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--color-gray-200);
    padding-bottom: 18px;
    margin-bottom: 18px;
  }
  .back-link {
    color: var(--color-black);
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
    color: var(--color-gray-600);
    padding: 6px 10px;
    border: 1px solid var(--color-gray-200);
    border-radius: 999px;
    background: var(--color-gray-50);
  }
  .export-link {
    margin-left: auto;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 10px;
    background: var(--color-asset-text, #1565c0);
    color: var(--color-white);
    text-decoration: none;
  }
  .export-link:hover {
    background: var(--color-asset-text, #1565c0);
  }

  /* Filter Info */
  .filter-info {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: #fdfbf7;
    border: 1px solid var(--color-gray-200);
    margin-bottom: 16px;
    font-size: 12px;
    border-radius: 6px;
  }
  .filter-label {
    font-weight: bold;
    text-transform: uppercase;
    font-size: 10px;
    color: var(--color-gray-700);
    letter-spacing: 0.4px;
  }
  .filter-desc {
    font-family: monospace;
    color: var(--color-gray-700);
  }
  .query-time {
    margin-left: auto;
    color: var(--color-text-secondary);
    font-size: 10px;
  }

  /* Bulk Actions */
  .bulk-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--color-white);
    border: 1px solid var(--color-border);
    margin-bottom: 20px;
    flex-wrap: wrap;
  }
  .table-container {
    margin-bottom: 20px;
  }

  /* States */
  .loading-state,
  .error-state,
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--color-text-secondary);
  }
  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-black);
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
    color: var(--color-error);
  }
  .error-state button {
    margin-top: 10px;
    padding: 8px 16px;
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }
  .limit-notice {
    text-align: center;
    padding: 20px;
    color: var(--color-text-secondary);
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
