<script>
  /**
   * GLOBAL ASSET EXPLORER
   * MapLibre visualization powered by points.geojson.
   *
   * - points.geojson provides asset locations with tracker + country facets
   * - client-side filtering for fast interactions
   */

  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { assetPath, assetLink } from '$lib/links';
  import { colors, colorByTracker } from '$lib/design-tokens';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // DOM refs
  let mapContainer;
  let map;
  let hoverPopup;

  // Loading state
  let loading = $state(true);
  let loadingPhase = $state('Initializing...');
  let error = $state(null);

  // Raw geojson asset records
  let allAssets = $state([]);

  // Data state
  let filteredAssets = $state([]);
  let _filteredCount = $state(0);

  // Filter state
  let selectedTrackers = $state([]);
  let selectedCountries = $state([]);
  let countrySearch = $state('');

  // Facet options (populated from data)
  let trackerFacets = $state([]);
  let countryFacets = $state([]);

  // Stats
  let _queryTime = $state(0);

  // Microvis data
  let trackerBreakdown = $state([]);
  let countryBreakdown = $state([]);

  import { BASEMAP_VOYAGER } from '$lib/map-config';
  const BASEMAP_STYLE_URL = BASEMAP_VOYAGER;
  const ASSET_SOURCE_ID = 'asset-points';
  const ASSET_GLOW_LAYER_ID = 'asset-points-glow';
  const ASSET_LAYER_ID = 'asset-points-core';

  const visibleCountryFacets = $derived.by(() => {
    if (!countrySearch.trim()) return countryFacets;
    const needle = countrySearch.trim().toLowerCase();
    return countryFacets.filter((facet) => facet.value.toLowerCase().includes(needle));
  });

  const _visibleCountriesCount = $derived(
    new Set(filteredAssets.map((a) => a.country).filter(Boolean)).size
  );
  const _visibleTrackerCount = $derived(
    new Set(filteredAssets.map((a) => a.tracker).filter(Boolean)).size
  );

  function buildFacets(items, key, limit = Infinity) {
    const counts = new Map();
    for (const item of items) {
      const value = item[key];
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  function trackerColorExpression() {
    const stops = [];
    for (const [tracker, color] of colorByTracker.entries()) {
      stops.push(tracker, color);
    }
    return ['match', ['coalesce', ['get', 'tracker'], ''], ...stops, colors.gray500];
  }

  function toFeatureCollection(assets) {
    return {
      type: 'FeatureCollection',
      features: assets
        .filter((a) => a.hasCoords)
        .map((asset) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [asset.lon, asset.lat],
          },
          properties: {
            id: asset.id,
            name: asset.name,
            tracker: asset.tracker,
            country: asset.country,
          },
        })),
    };
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );
  }

  // Initialize data from GeoJSON
  async function initData() {
    try {
      loading = true;
      error = null;

      loadingPhase = 'Loading asset locations...';
      const geojson = await fetch(assetPath('points.geojson')).then((r) => {
        if (!r.ok) throw new Error(`Failed to load GeoJSON: ${r.statusText}`);
        return r.json();
      });

      loadingPhase = 'Processing records...';
      allAssets = (geojson.features || []).map((f) => {
        const coords = f.geometry?.coordinates;
        const hasCoords =
          coords &&
          coords.length >= 2 &&
          isFinite(coords[0]) &&
          isFinite(coords[1]) &&
          coords[1] >= -90 &&
          coords[1] <= 90;
        return {
          id: f.properties?.id || f.properties?.['GEM location ID'] || '',
          name: f.properties?.name || f.properties?.Project || f.properties?.id || '',
          tracker: f.properties?.tracker || '',
          country: f.properties?.country || '',
          lat: hasCoords ? coords[1] : null,
          lon: hasCoords ? coords[0] : null,
          hasCoords,
        };
      });

      // Build facets from ALL assets (including pipeline assets with no map coords)
      trackerFacets = buildFacets(allAssets, 'tracker');
      countryFacets = buildFacets(allAssets, 'country', 200);

      filterAssets();
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  // Filter assets client-side
  function filterAssets() {
    const start = performance.now();
    let assets = allAssets;

    if (selectedTrackers.length > 0) {
      const set = new Set(selectedTrackers);
      assets = assets.filter((asset) => set.has(asset.tracker));
    }

    if (selectedCountries.length > 0) {
      const set = new Set(selectedCountries);
      assets = assets.filter((asset) => set.has(asset.country));
    }

    filteredAssets = assets;
    _filteredCount = assets.length;

    function breakdownBy(field, limit = 6) {
      const counts = new Map();
      for (const asset of assets) {
        if (!asset[field]) continue;
        counts.set(asset[field], (counts.get(asset[field]) || 0) + 1);
      }
      return [...counts.entries()]
        .map(([value, count]) => ({ [field]: value, count, pct: count / (assets.length || 1) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
    }

    trackerBreakdown = breakdownBy('tracker', 6);
    countryBreakdown = breakdownBy('country', 6);

    _queryTime = Math.round(performance.now() - start);
    updateMapData();
  }

  function initMap() {
    if (!mapContainer || map) return;

    map = new maplibregl.Map({
      container: mapContainer,
      style: BASEMAP_STYLE_URL,
      center: [0, 20],
      zoom: 1.25,
      minZoom: 0.9,
      maxZoom: 10,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      if (!map) return;

      map.addSource(ASSET_SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(filteredAssets),
      });

      const colorsByTracker = trackerColorExpression();

      map.addLayer({
        id: ASSET_GLOW_LAYER_ID,
        type: 'circle',
        source: ASSET_SOURCE_ID,
        paint: {
          'circle-color': colorsByTracker,
          'circle-opacity': 0.25,
          'circle-blur': 0.9,
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 3, 3, 5, 6, 8, 10, 11],
        },
      });

      map.addLayer({
        id: ASSET_LAYER_ID,
        type: 'circle',
        source: ASSET_SOURCE_ID,
        paint: {
          'circle-color': colorsByTracker,
          'circle-opacity': 0.88,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 1, 0.5, 6, 1.4],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 3, 3.2, 6, 5, 10, 7.5],
        },
      });

      hoverPopup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -10],
        className: 'asset-tooltip',
      });

      map.on('mouseenter', ASSET_LAYER_ID, () => {
        if (!map) return;
        map.getCanvas().style.cursor = 'pointer';
      });

      map.on('mousemove', ASSET_LAYER_ID, (event) => {
        if (!map || !hoverPopup) return;
        const feature = event.features?.[0];
        if (!feature) return;

        const props = feature.properties || {};
        hoverPopup
          .setLngLat(event.lngLat)
          .setHTML(
            `<div class="tooltip-title">${escapeHtml(props.name || props.id || 'Asset')}</div>
             <div class="tooltip-subtitle">${escapeHtml(props.tracker || 'Unknown type')} · ${escapeHtml(props.country || 'Unknown country')}</div>`
          )
          .addTo(map);
      });

      map.on('mouseleave', ASSET_LAYER_ID, () => {
        if (!map) return;
        map.getCanvas().style.cursor = '';
        hoverPopup?.remove();
      });

      map.on('click', ASSET_LAYER_ID, (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (!id) return;
        goto(assetLink(String(id)));
      });
    });
  }

  function updateMapData() {
    if (!map) return;
    const source = map.getSource(ASSET_SOURCE_ID);
    if (!source || typeof source.setData !== 'function') return;
    source.setData(toFeatureCollection(filteredAssets));
  }

  async function reloadData() {
    await initData();
    if (!map) {
      initMap();
      return;
    }
    updateMapData();
  }

  // Generic filter toggle
  function toggleFilter(arr, value) {
    return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  function toggleTracker(tracker) {
    selectedTrackers = toggleFilter(selectedTrackers, tracker);
    filterAssets();
  }
  function toggleCountry(country) {
    selectedCountries = toggleFilter(selectedCountries, country);
    filterAssets();
  }

  function clearFilters() {
    selectedTrackers = [];
    selectedCountries = [];
    countrySearch = '';
    filterAssets();
  }

  function formatNumber(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  onMount(() => {
    if (browser) {
      reloadData();
    }

    return () => {
      hoverPopup?.remove();
      if (map) {
        map.remove();
        map = null;
      }
    };
  });

  const hasFilters = $derived(selectedTrackers.length > 0 || selectedCountries.length > 0);
</script>

<svelte:head>
  <title>Global Asset Map — Global Energy Monitor</title>
  <meta
    name="description"
    content="Interactive map visualization of energy assets worldwide. Filter by tracker type and country to explore the global energy infrastructure."
  />
  <SeoMeta
    title="Global Asset Map — Global Energy Monitor"
    description="Interactive map visualization of energy assets worldwide. Filter by tracker type and country to explore the global energy infrastructure."
  />
</svelte:head>

<div class="explorer">
  <div class="explorer-body">
    <!-- Sidebar with filters -->
    <aside class="sidebar">
      {#if hasFilters}
        <button class="clear-filters" onclick={clearFilters}> Clear all filters </button>
      {/if}

      <!-- Tracker filter -->
      <div class="filter-section">
        <h3>Asset Type</h3>
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

      <!-- Country filter -->
      <div class="filter-section">
        <h3>Country</h3>
        <input
          class="filter-search"
          type="search"
          placeholder="Filter countries..."
          bind:value={countrySearch}
        />
        <div class="filter-options scrollable">
          {#each visibleCountryFacets as facet}
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
        <h3>Asset Type Mix</h3>
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
        <h3>Top Countries</h3>
        <div class="bar-chart">
          {#each countryBreakdown as item}
            <div class="bar-row">
              <span class="bar-label">{item.country}</span>
              <div class="bar-track">
                <div class="bar-fill" style="width: {item.pct * 100}%"></div>
              </div>
              <span class="bar-value">{Math.round(item.pct * 100)}%</span>
            </div>
          {/each}
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
          <button onclick={reloadData}>Retry</button>
        </div>
      {/if}

      <div bind:this={mapContainer} class="maplibre-container"></div>

      <!-- Map legend -->
      <div class="map-legend">
        <h4>Asset Types</h4>
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

  .filter-search {
    width: 100%;
    padding: var(--space-2);
    margin-bottom: var(--space-2);
    border: var(--border-width) solid var(--color-border);
    background: var(--color-white);
    font-size: var(--font-size-sm);
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
    width: 96px;
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

  .map-container {
    flex: 1;
    position: relative;
    background: var(--gem-midnight);
  }

  .maplibre-container {
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

  :global(.maplibregl-ctrl-group) {
    border-radius: var(--radius-md);
    border: var(--border-width) solid var(--gem-teal-25);
    box-shadow: var(--shadow-lg);
  }

  :global(.asset-tooltip .maplibregl-popup-content) {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    border: var(--border-width) solid var(--gem-teal-25);
    background: rgba(255, 255, 255, 0.95);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-lg);
  }

  :global(.asset-tooltip .maplibregl-popup-tip) {
    border-top-color: rgba(255, 255, 255, 0.95);
    border-bottom-color: rgba(255, 255, 255, 0.95);
  }

  :global(.asset-tooltip .tooltip-title) {
    font-size: var(--font-size-body);
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 2px;
  }

  :global(.asset-tooltip .tooltip-subtitle) {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.25;
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

  }
</style>
