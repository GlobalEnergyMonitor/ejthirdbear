<script>
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import chroma from 'chroma-js';
  import { assetPath, assetLink } from '$lib/links';
  import { trackerToMapColor, mapColors, colors } from '$lib/design-tokens';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { fetchAssetBasics } from '$lib/component-data/schema';

  let mapContainer = $state(null);
  let map;
  let loading = $state(true);
  let error = $state(null);
  let isSpinning = $state(true);
  let spinAnimation;
  let geojsonData = $state(null);
  let totalAssetCount = $state(null);

  // HARDCODED light mode as requested
  let isDarkMode = $state(false);

  // Spin control
  const spinSpeed = 0.12;
  let userInteracting = false;

  // Dynamic callouts
  let visibleCallouts = $state([]);

  // Layer visibility toggles - group similar trackers together
  const trackerGroups = {
    coal: ['Coal Plant', 'Coal Mine'],
    gas: ['Gas Plant', 'Gas Pipeline', 'Oil & NGL Pipeline'],
    steel: ['Steel Plant', 'Iron Mine', 'Iron Ore Mine'],
    bioenergy: ['Bioenergy Power', 'Cement and Concrete'],
  };

  let visibleGroups = $state({
    coal: true,
    gas: true,
    steel: true,
    bioenergy: true,
  });

  function toggleTrackerGroup(group) {
    visibleGroups[group] = !visibleGroups[group];
    updateLayerFilters();
  }

  function updateLayerFilters() {
    if (!map) return;

    // Build list of visible trackers
    const visibleTrackers = Object.entries(visibleGroups)
      .filter(([_, visible]) => visible)
      .flatMap(([group]) => trackerGroups[group]);

    // Create filter expression
    const filter =
      visibleTrackers.length > 0
        ? ['in', ['get', 'tracker'], ['literal', visibleTrackers]]
        : ['==', ['get', 'tracker'], '__none__']; // Hide all if nothing selected

    // Apply to all point layers
    ['points', 'points-glow-outer', 'points-glow-mid', 'points-heat'].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setFilter(layerId, filter);
      }
    });
  }

  // Hover tooltip state - only show when zoomed in
  const TOOLTIP_MIN_ZOOM = 3;
  let hoveredAsset = $state(null);
  let tooltipPosition = $state({ x: 0, y: 0 });
  let currentZoom = $state(0);
  let tooltipLoading = $state(false);

  // Cache for fetched asset data to avoid repeated API calls
  const assetDataCache = new Map();

  function setupHoverInteraction() {
    if (!map) return;

    // Track zoom level
    map.on('zoom', () => {
      currentZoom = map.getZoom();
      // Hide tooltip when zooming out
      if (currentZoom < TOOLTIP_MIN_ZOOM) {
        hoveredAsset = null;
      }
    });

    // Hover on points layer
    map.on('mouseenter', 'points', async (e) => {
      if (currentZoom < TOOLTIP_MIN_ZOOM) return;
      if (!e.features?.length) return;

      map.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const props = feature.properties || {};

      // Get asset ID from geojson
      const assetId = String(props.id ?? props['GEM location ID'] ?? feature.id ?? 'unknown');

      // Use clientX/clientY for fixed positioning
      tooltipPosition = {
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
      };

      // Check cache first
      if (assetDataCache.has(assetId)) {
        hoveredAsset = assetDataCache.get(assetId);
        return;
      }

      // Show loading state with minimal data from geojson
      tooltipLoading = true;
      hoveredAsset = {
        id: assetId,
        name: assetId, // Will be replaced by API data
        tracker: props.tracker || 'Unknown',
        status: null,
        country: props.country || null,
        state: props.state || null,
        capacity: null,
        owner: null,
      };

      // Fetch full data from API
      try {
        const fullData = await fetchAssetBasics(assetId);
        if (fullData) {
          const enrichedAsset = {
            id: fullData.id,
            name: fullData.name || assetId,
            tracker: fullData.tracker || props.tracker || 'Unknown',
            status: fullData.status || null,
            country: fullData.country || props.country || null,
            state: props.state || null,
            capacity: fullData.capacityMw || null,
            owner: fullData.ownerName || null,
          };
          // Cache the result
          assetDataCache.set(assetId, enrichedAsset);
          // Only update if still hovering the same asset
          if (hoveredAsset?.id === assetId) {
            hoveredAsset = enrichedAsset;
          }
        }
      } catch (err) {
        console.warn(`Failed to fetch asset data for ${assetId}:`, err);
      } finally {
        tooltipLoading = false;
      }
    });

    map.on('mousemove', 'points', (e) => {
      if (currentZoom < TOOLTIP_MIN_ZOOM) return;
      if (!hoveredAsset) return;

      // Use clientX/clientY for fixed positioning
      tooltipPosition = {
        x: e.originalEvent.clientX,
        y: e.originalEvent.clientY,
      };
    });

    map.on('mouseleave', 'points', () => {
      map.getCanvas().style.cursor = '';
      hoveredAsset = null;
    });

    // Click to navigate to asset page
    map.on('click', 'points', (e) => {
      if (!e.features?.length) return;
      const props = e.features[0].properties;
      const locationId = props.id || props.gem_id;

      // Use cached asset ID if available (from API fetch), otherwise use location ID
      const cachedData = assetDataCache.get(locationId);
      const navigateId = cachedData?.id || locationId;

      if (navigateId) {
        window.location.href = assetLink(navigateId);
      }
    });
  }

  // Core point colors
  const trackerColorStops = Object.entries(trackerToMapColor).flatMap(([tracker, color]) => [
    tracker,
    color,
  ]);

  // Softer glow colors: increase lightness, decrease saturation for readability
  const trackerGlowColorStops = Object.entries(trackerToMapColor).flatMap(([tracker, color]) => [
    tracker,
    chroma(color).desaturate(2).brighten(0.8).hex(),
  ]);

  // GEM Core Palette
  const palette = {
    navy: '#004A63',
    mintDataviz: '#A5E9E4',
    orange: '#FE4F2D',
    teal: '#016B83',
    midnight: '#002430',
    warmWhite: '#F2F2EB',
    white: '#FFFFFF',
  };

  // Theme colors using core palette
  const themes = {
    dark: {
      background: palette.midnight,
      land: '#0a1a20',
      landStroke: palette.navy,
      ocean: palette.midnight,
      text: palette.mintDataviz,
      textMuted: '#7FA4B1', // navy-50
      accent: palette.orange,
      panel: 'rgba(0, 36, 48, 0.9)',
      panelBorder: palette.teal,
      glow: palette.mintDataviz,
      statColor: palette.mintDataviz,
      capacityColor: palette.orange,
    },
    light: {
      background: palette.warmWhite,
      land: palette.white,
      landStroke: '#BFDAE0', // navy-25
      ocean: palette.warmWhite,
      text: palette.midnight,
      textMuted: palette.navy,
      accent: palette.orange,
      panel: 'rgba(255, 255, 255, 0.94)',
      panelBorder: palette.navy,
      glow: palette.teal,
      statColor: palette.navy,
      capacityColor: palette.orange,
    },
  };

  // Light mode is hardcoded - no system preference detection

  function updateMapTheme() {
    if (!map) return;
    const theme = isDarkMode ? themes.dark : themes.light;

    map.setPaintProperty('background', 'background-color', theme.background);
    map.setPaintProperty('land', 'fill-color', theme.land);
    map.setPaintProperty('borders', 'line-color', theme.landStroke);
  }

  function startSpinning() {
    if (spinAnimation) return;

    function spin() {
      if (!map || userInteracting || !isSpinning) {
        spinAnimation = null;
        return;
      }

      const center = map.getCenter();
      center.lng += spinSpeed;
      map.setCenter(center);

      spinAnimation = requestAnimationFrame(spin);
    }

    spinAnimation = requestAnimationFrame(spin);
  }

  function stopSpinning() {
    if (spinAnimation) {
      cancelAnimationFrame(spinAnimation);
      spinAnimation = null;
    }
  }

  function updateDynamicCallouts() {
    if (!map || !geojsonData) return;

    const bounds = map.getBounds();
    const center = map.getCenter();

    const inView = geojsonData.features
      .filter((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const lonDiff = Math.abs(((lon - center.lng + 180) % 360) - 180);
        return lonDiff < 70 && lat > bounds.getSouth() && lat < bounds.getNorth();
      })
      .filter((f) => f.properties.capacity && f.properties.capacity > 0)
      .sort((a, b) => (b.properties.capacity || 0) - (a.properties.capacity || 0))
      .slice(0, 3);

    visibleCallouts = inView.map((f, i) => {
      const point = map.project(f.geometry.coordinates);
      const [lon] = f.geometry.coordinates;
      const lonDiff = lon - center.lng;

      let angle = lonDiff > 0 ? 35 : -35;
      if (i === 1) angle = lonDiff > 0 ? -25 : 25;
      if (i === 2) angle = 0;

      const distFromCenter = Math.abs(lonDiff);
      const opacity = Math.max(0.4, 1 - (distFromCenter / 70) * 0.6);

      return {
        name: f.properties.name || f.properties.project || 'Unknown',
        tracker: f.properties.tracker || 'Asset',
        capacity: f.properties.capacity,
        x: point.x,
        y: point.y,
        angle,
        opacity,
      };
    });
  }

  onMount(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Light mode hardcoded - no system detection

    try {
      if (!mapContainer) {
        loading = false;
        return;
      }

      // Fetch total asset count from DuckDB (async, non-blocking)
      // Wrapped in try-catch to ensure map loads even if DuckDB fails
      try {
        import('$lib/duckdb-utils')
          .then(async ({ loadParquetFromPath, query }) => {
            try {
              const ownershipPath = assetPath('all_trackers_ownership@1.parquet');
              await loadParquetFromPath(ownershipPath, 'ownership');
              const result = await query(`
                SELECT COUNT(DISTINCT COALESCE("GEM unit ID", "GEM Mine ID", "Steel Plant ID", "GEM Asset ID", "ProjectID")) as cnt
                FROM ownership
              `);
              if (result.success && result.data?.[0]?.cnt) {
                totalAssetCount = Number(result.data[0].cnt);
              }
            } catch (e) {
              console.warn('Could not fetch asset count:', e);
            }
          })
          .catch((e) => console.warn('DuckDB import failed:', e));
      } catch (e) {
        console.warn('DuckDB initialization skipped:', e);
      }

      const response = await fetch(assetPath('points.geojson'));
      if (!response.ok) throw new Error(`Failed to load GeoJSON: ${response.statusText}`);

      geojsonData = await response.json();
      console.log(`Loaded ${geojsonData.features.length.toLocaleString()} points`);

      const theme = isDarkMode ? themes.dark : themes.light;

      map = new maplibregl.Map({
        container: mapContainer,
        style: {
          version: 8,
          name: 'GEM Globe',
          sources: {
            countries: {
              type: 'geojson',
              data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson',
            },
          },
          layers: [
            {
              id: 'background',
              type: 'background',
              paint: { 'background-color': theme.background },
            },
            {
              id: 'land',
              type: 'fill',
              source: 'countries',
              paint: { 'fill-color': theme.land, 'fill-opacity': 1 },
            },
            {
              id: 'borders',
              type: 'line',
              source: 'countries',
              paint: { 'line-color': theme.landStroke, 'line-width': 0.5, 'line-opacity': 0.5 },
            },
          ],
          glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        },
        center: [20, 15],
        zoom: 2.35,
        maxZoom: 6,
        minZoom: 1.6,
      });

      map.on('mousedown', () => {
        userInteracting = true;
        stopSpinning();
      });

      map.on('mouseup', () => {
        userInteracting = false;
      });

      // Auto-pause spinning when user drags the globe
      map.on('dragend', () => {
        userInteracting = false;
        isSpinning = false; // Stay paused after user interaction
      });

      map.on('style.load', () => {
        map.setProjection({ type: 'globe' });
      });

      map.on('load', () => {
        map.addSource('points', {
          type: 'geojson',
          data: geojsonData,
        });

        // Layer 1: Outer glow (large, very transparent, blurred)
        // Uses desaturated/brightened colors for readability
        map.addLayer({
          id: 'points-glow-outer',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 2, 6, 4, 10, 6, 14],
            'circle-color': [
              'match',
              ['get', 'tracker'],
              ...trackerGlowColorStops,
              mapColors.default,
            ],
            'circle-opacity': 0.12,
            'circle-blur': 1,
            'circle-stroke-width': 0,
          },
        });

        // Layer 2: Middle glow
        // Uses desaturated/brightened colors for readability
        map.addLayer({
          id: 'points-glow-mid',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 2, 3, 4, 5, 6, 8],
            'circle-color': [
              'match',
              ['get', 'tracker'],
              ...trackerGlowColorStops,
              mapColors.default,
            ],
            'circle-opacity': 0.2,
            'circle-blur': 0.5,
            'circle-stroke-width': 0,
          },
        });

        // Layer 3: Core points (small, crisp, higher opacity)
        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 2, 1.2, 4, 2, 6, 3.5],
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.9,
            'circle-blur': 0,
            'circle-stroke-width': 0,
          },
        });

        // Heatmap layer for density visualization
        map.addLayer(
          {
            id: 'points-heat',
            type: 'heatmap',
            source: 'points',
            maxzoom: 4,
            paint: {
              'heatmap-weight': 0.3,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 4, 0.8],
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 3, 4, 8],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 3, 0.2, 4, 0],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'transparent',
                0.1,
                isDarkMode ? 'rgba(127, 20, 42, 0.1)' : 'rgba(127, 20, 42, 0.05)',
                0.3,
                isDarkMode ? 'rgba(202, 74, 80, 0.2)' : 'rgba(202, 74, 80, 0.1)',
                0.5,
                isDarkMode ? 'rgba(254, 79, 45, 0.3)' : 'rgba(254, 79, 45, 0.15)',
                0.7,
                isDarkMode ? 'rgba(254, 79, 45, 0.5)' : 'rgba(254, 79, 45, 0.25)',
                1,
                isDarkMode ? 'rgba(157, 247, 229, 0.6)' : 'rgba(254, 79, 45, 0.4)',
              ],
            },
          },
          'points-glow-outer'
        );

        loading = false;
        currentZoom = map.getZoom();
        startSpinning();
        updateDynamicCallouts();
        setupHoverInteraction();
      });

      map.on('moveend', updateDynamicCallouts);
      map.on('move', () => {
        if (visibleCallouts.length > 0) {
          visibleCallouts = visibleCallouts.map((c) => {
            const feature = geojsonData.features.find(
              (f) => (f.properties.name || f.properties.project) === c.name
            );
            if (!feature) return c;
            const point = map.project(feature.geometry.coordinates);
            return { ...c, x: point.x, y: point.y };
          });
        }
      });
    } catch (err) {
      console.error('Map error:', err);
      error = err.message;
      loading = false;
    }
  });

  onDestroy(() => {
    stopSpinning();
  });

  function toggleSpin() {
    isSpinning = !isSpinning;
    if (isSpinning && !userInteracting) {
      startSpinning();
    } else {
      stopSpinning();
    }
  }

  function formatCapacity(mw) {
    if (!mw) return '';
    if (mw >= 1000) return `${(mw / 1000).toFixed(1)} GW`;
    return `${Math.round(mw)} MW`;
  }
</script>

<div class="globe-wrapper" class:dark={isDarkMode} class:light={!isDarkMode}>
  <!-- SVG filter for glow effect -->
  <svg class="filters" aria-hidden="true">
    <defs>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="glow-strong" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4" result="coloredBlur" />
        <feMerge>
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="coloredBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  </svg>

  <div bind:this={mapContainer} class="globe"></div>

  <!-- Dynamic callouts -->
  {#each visibleCallouts as callout}
    <div
      class="callout"
      class:callout-left={callout.angle < 0}
      style="
        left: {callout.x}px;
        top: {callout.y}px;
        opacity: {callout.opacity};
      "
    >
      <div class="callout-line" style="transform: rotate({callout.angle}deg)"></div>
      <div
        class="callout-label"
        style="transform: translate({callout.angle >= 0
          ? '50px'
          : '-100%'}, -50%) translateX({callout.angle >= 0 ? '0' : '-50px'})"
      >
        <span class="callout-name">{callout.name}</span>
        <span class="callout-meta">
          <span class="callout-type">{callout.tracker}</span>
          {#if callout.capacity}
            <span class="callout-capacity">{formatCapacity(callout.capacity)}</span>
          {/if}
        </span>
      </div>
    </div>
  {/each}

  <!-- Spin control -->
  <button
    class="spin-toggle"
    onclick={toggleSpin}
    aria-label={isSpinning ? 'Pause rotation' : 'Resume rotation'}
  >
    <span class="spin-icon">{isSpinning ? '⏸' : '▶'}</span>
  </button>

  <!-- Stats -->
  <div class="stats-overlay">
    <div class="stat-item">
      <span class="stat-value"
        >{totalAssetCount?.toLocaleString() ||
          geojsonData?.features?.length?.toLocaleString() ||
          '—'}</span
      >
      <span class="stat-label">Assets Tracked</span>
    </div>
  </div>

  <!-- Asset tooltip (only when zoomed in) - matches /compose exactly -->
  {#if hoveredAsset && currentZoom >= TOOLTIP_MIN_ZOOM}
    <div
      class="asset-tooltip"
      class:loading={tooltipLoading}
      style="left: {tooltipPosition.x + 12}px; top: {tooltipPosition.y - 10}px;"
    >
      <ProjectCard
        asset={{
          id: hoveredAsset.id,
          name: hoveredAsset.name,
          status: hoveredAsset.status,
          country: hoveredAsset.country,
          capacity: hoveredAsset.capacity,
          owner: hoveredAsset.owner,
          tracker: hoveredAsset.tracker,
        }}
        variant="compact"
        open={true}
        showLink={false}
      />
      {#if tooltipLoading}
        <div class="tooltip-loading">
          <div class="tooltip-spinner"></div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Legend (clickable to toggle layers) -->
  <div class="legend">
    <div class="legend-title">Asset Types</div>
    <div class="legend-items">
      <button
        class="legend-item"
        class:disabled={!visibleGroups.coal}
        onclick={() => toggleTrackerGroup('coal')}
      >
        <span class="legend-dot" style="--dot-color: {mapColors.coal}"></span>
        <span>Coal</span>
      </button>
      <button
        class="legend-item"
        class:disabled={!visibleGroups.gas}
        onclick={() => toggleTrackerGroup('gas')}
      >
        <span class="legend-dot" style="--dot-color: {mapColors.gas}"></span>
        <span>Gas/Oil</span>
      </button>
      <button
        class="legend-item"
        class:disabled={!visibleGroups.steel}
        onclick={() => toggleTrackerGroup('steel')}
      >
        <span class="legend-dot" style="--dot-color: {mapColors.steel}"></span>
        <span>Steel/Iron</span>
      </button>
      <button
        class="legend-item"
        class:disabled={!visibleGroups.bioenergy}
        onclick={() => toggleTrackerGroup('bioenergy')}
      >
        <span class="legend-dot" style="--dot-color: {mapColors.bioenergy}"></span>
        <span>Bioenergy</span>
      </button>
    </div>
  </div>

  {#if loading}
    <div class="overlay loading">
      <div class="loading-spinner"></div>
      <span class="loading-text">Loading assets...</span>
    </div>
  {/if}

  {#if error}
    <div class="overlay error">{error}</div>
  {/if}
</div>

<style>
  .filters {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }

  .globe-wrapper {
    position: relative;
    width: 100%;
    height: var(--globe-height, 92vh);
    min-height: var(--globe-min-height, 700px);
    overflow: hidden;
    transition: background-color 0.3s ease;
  }

  /* Dark mode - GEM Core Palette */
  .globe-wrapper.dark {
    --bg-color: #002430; /* midnight */
    --bg-ocean: #001820;
    --text-color: #a5e9e4; /* mintDataviz */
    --text-muted: #7fa4b1; /* navy-50 */
    --panel-bg: rgba(0, 36, 48, 0.92);
    --panel-border: #016b83; /* teal */
    --glow-color: rgba(165, 233, 228, 0.4); /* mintDataviz */
    --accent: #fe4f2d; /* orange */
    --stat-color: #a5e9e4; /* mintDataviz */
    --navy: #004a63;
    --teal: #016b83;
    background: var(--bg-color);
  }

  /* Light mode - GEM Core Palette */
  .globe-wrapper.light {
    --bg-color: #f2f2eb; /* warmWhite */
    --bg-ocean: #f2f2eb;
    --text-color: #1d4961; /* primary blue */
    --text-muted: #1d4961; /* primary blue */
    --panel-bg: rgba(255, 255, 255, 0.96);
    --panel-border: #1d4961; /* primary blue */
    --glow-color: rgba(29, 73, 97, 0.25); /* primary blue */
    --accent: #fe4f2d; /* orange */
    --stat-color: #1d4961; /* primary blue */
    --navy: #1d4961;
    --teal: #1d4961;
    background: var(--bg-color);
  }

  .globe {
    width: 100%;
    height: 100%;
  }

  /* Apply blend mode to map canvas for better point overlap */
  .globe-wrapper.dark :global(.maplibregl-canvas) {
    mix-blend-mode: screen;
  }

  .globe-wrapper.light :global(.maplibregl-canvas) {
    mix-blend-mode: multiply;
  }

  .globe-wrapper :global(.maplibregl-ctrl-attrib) {
    display: none;
  }

  /* Callouts */
  .callout {
    position: absolute;
    pointer-events: none;
    z-index: 10;
    transition: opacity 0.4s ease;
  }

  .callout-line {
    position: absolute;
    width: 45px;
    height: 1px;
    background: linear-gradient(to right, var(--teal) 0%, transparent 100%);
    transform-origin: left center;
    opacity: 0.8;
  }

  .callout-left .callout-line {
    transform-origin: right center;
    background: linear-gradient(to left, var(--teal) 0%, transparent 100%);
  }

  .callout-label {
    position: absolute;
    white-space: nowrap;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 12px;
    background: var(--panel-bg);
    border-left: 3px solid var(--teal);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }

  .callout-left .callout-label {
    border-left: none;
    border-right: 3px solid var(--teal);
  }

  .callout-name {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 11px;
    font-weight: 600;
    color: var(--text-color);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .callout-meta {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .callout-type {
    font-size: 9px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .callout-capacity {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    letter-spacing: 0.02em;
  }

  /* Spin toggle */
  .spin-toggle {
    position: absolute;
    bottom: 24px;
    right: 24px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--panel-bg);
    border: 2px solid var(--teal);
    color: var(--teal);
    font-size: 14px;
    cursor: pointer;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  }

  .spin-toggle:hover {
    background: var(--teal);
    color: var(--bg-color);
    transform: scale(1.08);
    box-shadow: 0 4px 20px var(--glow-color);
  }

  .spin-icon {
    font-size: 12px;
  }

  /* Stats */
  .stats-overlay {
    position: absolute;
    top: 24px;
    right: 24px;
    z-index: 20;
    text-align: right;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 12px 16px;
    background: var(--panel-bg);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-right: 3px solid var(--teal);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .stat-value {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 32px;
    font-weight: 700;
    color: var(--stat-color);
    line-height: 1;
    letter-spacing: -0.01em;
  }

  .globe-wrapper.dark .stat-value {
    text-shadow: 0 0 30px var(--glow-color);
  }

  .globe-wrapper.light .stat-value {
    text-shadow: 0 2px 8px rgba(0, 74, 99, 0.15);
  }

  .stat-label {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-top: 4px;
  }

  /* Legend */
  .legend {
    position: absolute;
    bottom: 24px;
    left: 24px;
    z-index: 20;
    padding: 14px 18px;
    background: var(--panel-bg);
    border-left: 3px solid var(--teal);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .legend-title {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 9px;
    font-weight: 600;
    color: var(--teal);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--teal);
    opacity: 0.8;
  }

  .legend-items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--text-color);
    letter-spacing: 0.02em;
    background: none;
    border: none;
    padding: 4px 6px;
    margin: -4px -6px;
    cursor: pointer;
    transition: opacity 0.15s ease;
    text-align: left;
    width: calc(100% + 12px);
  }

  .legend-item:hover {
    opacity: 0.8;
  }

  .legend-item.disabled {
    opacity: 0.35;
  }

  .legend-item.disabled .legend-dot {
    box-shadow: none;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--dot-color);
    box-shadow:
      0 0 8px var(--dot-color),
      0 0 2px var(--dot-color);
    transition: box-shadow 0.15s ease;
  }

  /* Asset tooltip on hover - matches /compose exactly */
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

  .asset-tooltip :global(.project-card) {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .asset-tooltip :global(.project-card summary) {
    background: transparent;
    cursor: default;
  }

  .asset-tooltip :global(.details-section) {
    background: transparent;
  }

  .asset-tooltip.loading :global(.project-card) {
    opacity: 0.7;
  }

  .tooltip-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .tooltip-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top-color: var(--teal);
    border-right-color: var(--teal);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  /* Loading */
  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: var(--bg-color);
    z-index: 100;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 2px solid transparent;
    border-top-color: var(--teal);
    border-right-color: var(--teal);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .loading-text {
    font-family: var(--font-family-data, 'Roboto Condensed', sans-serif);
    font-size: 11px;
    color: var(--teal);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .overlay.error {
    color: var(--accent);
    font-weight: 500;
  }

  /* Vignette - subtle in both modes */
  .globe-wrapper::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    border-radius: inherit;
  }

  .globe-wrapper.dark::after {
    background: radial-gradient(ellipse at center, transparent 35%, rgba(0, 8, 16, 0.6) 100%);
  }

  .globe-wrapper.light::after {
    background: radial-gradient(ellipse at center, transparent 50%, rgba(242, 242, 235, 0.4) 100%);
  }

  /* Refined academic border */
  .globe-wrapper::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
    border: 1px solid var(--navy);
    opacity: 0.15;
    z-index: 5;
  }
</style>
