<script>
  /**
   * TrackerGlobeGrid - 8 spinning MapLibre globes
   * Hero "TOTAL" globe + 7 individual tracker globes
   */
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { assetPath } from '$lib/links';
  import { TRACKERS } from '$lib/data-config/tracker-schema';

  // State
  let geojsonData = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let maps = $state([]);
  let spinAnimation = null;

  // Tracker colors (matching design tokens)
  const trackerColors = {
    'Coal Plant': '#4a3728',
    'Coal Mine': '#6b5344',
    'Gas Plant': '#c45a3b',
    'Gas Pipeline': '#d4704a',
    'Steel Plant': '#2f4858',
    'Iron Mine': '#5a7a8a',
    'Bioenergy Power': '#4a8c5c',
  };

  // Trackers to show (excluding Gas Pipeline)
  const VISIBLE_TRACKERS = TRACKERS.filter((t) => t !== 'Gas Pipeline');

  // Globe configs: hero + 6 trackers (no Gas Pipeline)
  const globeConfigs = [
    { id: 'total', label: 'All Trackers', tracker: null, isHero: true },
    ...VISIBLE_TRACKERS.map((t) => ({
      id: t.toLowerCase().replace(/\s+/g, '-'),
      label: t,
      tracker: t,
      isHero: false,
    })),
  ];

  // Count points per tracker
  const counts = $derived.by(() => {
    if (!geojsonData) return {};
    const c = { total: geojsonData.features.length };
    TRACKERS.forEach((t) => {
      c[t] = geojsonData.features.filter((f) => f.properties?.tracker === t).length;
    });
    return c;
  });

  // Load GeoJSON once
  onMount(async () => {
    try {
      const response = await fetch(assetPath('points.geojson'));
      if (!response.ok) throw new Error('Failed to load GeoJSON');
      geojsonData = await response.json();
      loading = false;
    } catch (err) {
      error = err.message;
      loading = false;
    }
  });

  onDestroy(() => {
    if (spinAnimation) cancelAnimationFrame(spinAnimation);
    maps.forEach((m) => m?.remove());
  });

  // Initialize a single globe
  function initGlobe(container, tracker, isHero, index = 0) {
    if (!container || !geojsonData) return null;

    const color = tracker ? trackerColors[tracker] || '#666' : '#1d4961';

    // Filter data for this tracker
    const data = tracker
      ? {
          ...geojsonData,
          features: geojsonData.features.filter((f) => f.properties?.tracker === tracker),
        }
      : geojsonData;

    // Offset each globe's starting longitude by 15 degrees for visual variety
    const startLongitude = 20 + index * 15;

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          countries: {
            type: 'geojson',
            data: 'https://d2ad6b4ur7yvpq.cloudfront.net/naturalearth-3.3.0/ne_110m_admin_0_countries.geojson',
          },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#f2f2eb' } },
          {
            id: 'land',
            type: 'fill',
            source: 'countries',
            paint: { 'fill-color': '#fff', 'fill-opacity': 0.8 },
          },
          {
            id: 'borders',
            type: 'line',
            source: 'countries',
            paint: { 'line-color': '#ddd', 'line-width': 0.5 },
          },
        ],
      },
      center: [startLongitude, 10],
      zoom: isHero ? 1.2 : 0.8,
      maxZoom: isHero ? 3 : 2,
      minZoom: 0.5,
      attributionControl: false,
      interactive: false, // disable interaction for perf
    });

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
    });

    map.on('load', () => {
      map.addSource('points', { type: 'geojson', data });

      // Glow layer
      map.addLayer({
        id: 'points-glow',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': isHero ? 3 : 2,
          'circle-color': color,
          'circle-opacity': 0.3,
          'circle-blur': 1,
        },
      });

      // Core points
      map.addLayer({
        id: 'points-core',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': isHero ? 1.5 : 1,
          'circle-color': color,
          'circle-opacity': 0.8,
        },
      });
    });

    return map;
  }

  // Start spinning all globes
  function startSpinning() {
    const speed = 0.3;

    function spin() {
      maps.forEach((map) => {
        if (!map) return;
        const center = map.getCenter();
        center.lng += speed;
        map.setCenter(center);
      });
      spinAnimation = requestAnimationFrame(spin);
    }

    spinAnimation = requestAnimationFrame(spin);
  }

  // Initialize globe when container is ready
  function handleGlobeMount(node, { config, index }) {
    if (!geojsonData) return;

    const map = initGlobe(node, config.tracker, config.isHero, index);
    if (map) {
      maps = [...maps, map];

      // Start spinning once we have all maps
      if (maps.length === globeConfigs.length && !spinAnimation) {
        startSpinning();
      }
    }

    return {
      destroy() {
        map?.remove();
        maps = maps.filter((m) => m !== map);
      },
    };
  }
</script>

<div class="globe-grid">
  {#if loading}
    <div class="loading">Loading global assets...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    {#each globeConfigs as config, index}
      <div class="globe-cell" class:hero={config.isHero}>
        <div
          class="globe-container"
          class:hero={config.isHero}
          use:handleGlobeMount={{ config, index }}
        ></div>
        <div class="globe-label">
          <span class="globe-count"
            >{(counts[config.tracker || 'total'] || 0).toLocaleString()}</span
          >
          <span class="globe-name">{config.label}</span>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .globe-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-3);
    padding: var(--space-2);
    max-width: 100%;
    overflow: hidden;
  }

  .loading,
  .error {
    grid-column: 1 / -1;
    text-align: center;
    padding: var(--space-8);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .error {
    color: var(--color-error);
  }

  .globe-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .globe-cell.hero {
    grid-column: 1 / -1;
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-1);
  }

  .globe-container {
    width: 140px;
    height: 140px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .globe-container.hero {
    width: 260px;
    height: 260px;
    border-width: 2px;
  }

  /* Hide MapLibre logo/attribution */
  .globe-container :global(.maplibregl-ctrl-attrib),
  .globe-container :global(.maplibregl-ctrl-logo) {
    display: none !important;
  }

  .globe-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
  }

  .globe-count {
    font-family: var(--font-family-data);
    font-size: var(--font-size-md);
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.1;
  }

  .hero .globe-count {
    font-size: var(--font-size-xl);
  }

  .globe-name {
    font-size: 9px;
    font-weight: 500;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .hero .globe-name {
    font-size: var(--font-size-xs);
  }

  @media (max-width: 600px) {
    .globe-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
    }
    .globe-container {
      width: 120px;
      height: 120px;
    }
    .globe-container.hero {
      width: 200px;
      height: 200px;
    }
  }
</style>
