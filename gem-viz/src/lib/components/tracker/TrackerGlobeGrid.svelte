<script>
  /**
   * TrackerGlobeGrid
   * Global tracker overview with a center hero globe and surrounding tracker satellites.
   */
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { assetPath } from '$lib/links';
  import { trackerColors as trackerPalette } from '$lib/design-tokens';
  import { NATURAL_EARTH_COUNTRIES } from '$lib/map-config';

  // State
  let geojsonData = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let maps = $state([]);
  let spinAnimation = null;

  const trackerColors = {
    ...trackerPalette,
    total: '#1d4961',
  };

  const GLOBE_ZOOM = 0.68;

  const SLOT_ANGLES = {
    center: 0,
    east: 0,
    'north-east': 45,
    north: 90,
    'north-west': 135,
    west: 180,
    'south-west': 225,
    south: 270,
    'south-east': 315,
  };

  // UI display name → API asset_type name used in geojson
  const UI_TO_API = {
    'Coal Plant': 'Coal Plant',
    'Coal Mine': 'Coal Mine',
    'Gas Plant': 'Oil & Gas Plant',
    'Oil Pipeline': 'Oil or NGL Pipeline',
    'Steel Plant': 'Iron & Steel Plant',
    'Iron Mine': 'Iron Ore Mine',
    'Bioenergy Power': 'Bioenergy Plant',
    'Cement Plant': 'Cement or Concrete Plant',
  };

  const trackerLayout = [
    { tracker: 'Coal Plant', slot: 'north-west' },
    { tracker: 'Coal Mine', slot: 'north' },
    { tracker: 'Gas Plant', slot: 'north-east' },
    { tracker: 'Oil Pipeline', slot: 'west' },
    { tracker: 'Steel Plant', slot: 'east' },
    { tracker: 'Iron Mine', slot: 'south-west' },
    { tracker: 'Bioenergy Power', slot: 'south' },
    { tracker: 'Cement Plant', slot: 'south-east' },
  ];

  const globeConfigs = [
    {
      id: 'total',
      label: 'All Trackers',
      tracker: null,
      isHero: true,
      slot: 'center',
      sequence: '00',
    },
    ...trackerLayout.map(({ tracker, slot }, index) => ({
      id: tracker.toLowerCase().replace(/\s+/g, '-'),
      label: tracker,
      tracker,
      isHero: false,
      slot,
      sequence: String(index + 1).padStart(2, '0'),
    })),
  ];

  const counts = $derived.by(() => {
    /** @type {Record<string, number>} */
    const c = { total: 0 };

    if (!geojsonData) return c;

    c.total = geojsonData.features.length;

    trackerLayout.forEach(({ tracker }) => {
      const apiName = UI_TO_API[tracker] || tracker;
      c[tracker] = geojsonData.features.filter(
        (feature) => feature.properties?.tracker === apiName
      ).length;
    });

    return c;
  });

  const countriesCount = $derived.by(() => {
    if (!geojsonData) return 0;
    return new Set(
      geojsonData.features.map((feature) => feature.properties?.country).filter(Boolean)
    ).size;
  });

  onMount(() => {
    (async () => {
      try {
        const response = await fetch(assetPath('points.geojson'));
        if (!response.ok) throw new Error('Failed to load GeoJSON');
        geojsonData = await response.json();
        loading = false;
      } catch (err) {
        error = err.message;
        loading = false;
      }
    })();

    return () => {
      if (spinAnimation) cancelAnimationFrame(spinAnimation);
      maps.forEach((map) => map?.remove());
    };
  });

  function normalizeLongitude(longitude) {
    return ((((longitude + 180) % 360) + 360) % 360) - 180;
  }

  function normalizeBearing(bearing) {
    return ((((bearing + 180) % 360) + 360) % 360) - 180;
  }

  function getGlobeView(slot, isHero) {
    if (isHero) {
      return {
        startLongitude: 42,
        startLatitude: 28,
        bearing: 0,
        pitch: 0,
      };
    }

    const angle = SLOT_ANGLES[slot] ?? 0;
    const radians = (angle * Math.PI) / 180;
    const orbitX = Math.cos(radians);
    const orbitY = Math.sin(radians);

    return {
      startLongitude: normalizeLongitude(18 + orbitX * 26),
      startLatitude: 8 + orbitY * 3,
      bearing: normalizeBearing(orbitX * 8),
      pitch: 2 + Math.abs(orbitY) * 2,
    };
  }

  function getPointColor(tracker) {
    return tracker ? trackerColors[tracker] || '#666' : trackerColors.total;
  }

  function getAllTrackersColorExpression() {
    return [
      'match',
      ['get', 'tracker'],
      ...trackerLayout.flatMap(({ tracker }) => [tracker, getPointColor(tracker)]),
      trackerColors.total,
    ];
  }

  function initGlobe(container, config) {
    if (!container || !geojsonData) return null;

    const { tracker, isHero, slot } = config;

    const color = getPointColor(tracker);
    const pointColor = tracker ? color : getAllTrackersColorExpression();

    const apiTracker = tracker ? (UI_TO_API[tracker] || tracker) : null;
    const data = apiTracker
      ? {
          ...geojsonData,
          features: geojsonData.features.filter(
            (feature) => feature.properties?.tracker === apiTracker
          ),
        }
      : geojsonData;

    const view = getGlobeView(slot, isHero);

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sources: {
          countries: {
            type: 'geojson',
            data: NATURAL_EARTH_COUNTRIES,
          },
        },
        light: {
          anchor: 'map',
          position: [1.2, 160, 72],
          color: '#ffffff',
          intensity: 0.18,
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#f2f2eb' } },
          {
            id: 'land',
            type: 'fill',
            source: 'countries',
            paint: { 'fill-color': '#fffffe', 'fill-opacity': 0.94 },
          },
          {
            id: 'borders',
            type: 'line',
            source: 'countries',
            paint: { 'line-color': '#c7d1d8', 'line-width': 0.5, 'line-opacity': 1 },
          },
        ],
      },
      center: [view.startLongitude, view.startLatitude],
      zoom: GLOBE_ZOOM,
      pitch: view.pitch,
      bearing: view.bearing,
      maxZoom: isHero ? 3 : 2,
      minZoom: 0.5,
      attributionControl: false,
      interactive: false,
    });

    map.on('style.load', () => {
      map.setProjection({ type: 'globe' });
    });

    map.on('load', () => {
      map.addSource('points', { type: 'geojson', data });

      map.addLayer({
        id: 'points-glow',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': isHero ? 3 : 2,
          'circle-color': pointColor,
          'circle-opacity': 0.3,
          'circle-blur': 1,
        },
      });

      map.addLayer({
        id: 'points-core',
        type: 'circle',
        source: 'points',
        paint: {
          'circle-radius': isHero ? 1.5 : 1,
          'circle-color': pointColor,
          'circle-opacity': 0.85,
        },
      });
    });

    return map;
  }

  function startSpinning() {
    const speed = 0.08;

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

  function handleGlobeMount(node, { config }) {
    if (!geojsonData) return;

    const map = initGlobe(node, config);
    if (map) {
      maps = [...maps, map];

      if (maps.length === globeConfigs.length && !spinAnimation) {
        startSpinning();
      }
    }

    return {
      destroy() {
        map?.remove();
        maps = maps.filter((entry) => entry !== map);
      },
    };
  }

  function getCount(config) {
    return counts[config.tracker || 'total'] || 0;
  }

  function getAccent(config) {
    return trackerColors[config.tracker || 'total'] || trackerColors.total;
  }

  function getHelper(config) {
    if (config.isHero) return `${countriesCount} countries`;
    const count = getCount(config).toLocaleString();
    return `${count} units`;
  }
</script>

<div class="globe-console">
  {#if loading}
    <div class="loading">Loading global assets...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <header class="globe-overview">
      <div class="overview-metrics" aria-label="Coverage summary">
        <div class="overview-metric">
          <span class="metric-value">{(counts.total || 0).toLocaleString()}</span>
          <span class="metric-label">assets mapped</span>
        </div>
        <div class="overview-metric">
          <span class="metric-value">{countriesCount}</span>
          <span class="metric-label">countries</span>
        </div>
        <div class="overview-metric">
          <span class="metric-value">{trackerLayout.length}</span>
          <span class="metric-label">tracker layers</span>
        </div>
      </div>
    </header>

    <div class="globe-grid">
      {#each globeConfigs as config}
        <article class="globe-cell" class:hero={config.isHero} style:grid-area={config.slot}>
          <div class="globe-meta-row">
            <span class="globe-sequence">{config.sequence}</span>
            <span class="globe-helper">{getHelper(config)}</span>
          </div>

          <div
            class="globe-container"
            class:hero={config.isHero}
            use:handleGlobeMount={{ config }}
          ></div>

          <div class="globe-label">
            <span class="globe-count">{getCount(config).toLocaleString()}</span>
            <span class="globe-name">{config.label}</span>
            <span class="globe-accent" style:background-color={getAccent(config)}></span>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<style>
  .globe-console {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    width: 100%;
  }

  .globe-overview {
    display: flex;
    justify-content: flex-end;
    align-items: end;
    padding: 0 var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .overview-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(76px, auto));
    gap: var(--space-3);
  }

  .overview-metric {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  .metric-value {
    font-family: var(--font-family-data);
    font-size: clamp(24px, 3vw, 34px);
    font-weight: var(--font-weight-bold);
    line-height: 0.95;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-primary);
  }

  .metric-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--color-text-secondary);
  }

  .globe-grid {
    position: relative;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
      'north-west north north-east'
      'west center east'
      'south-west south south-east';
    gap: var(--space-4) var(--space-3);
    padding: var(--space-4) var(--space-2) var(--space-2);
    max-width: 100%;
    overflow: hidden;
  }

  .globe-grid::before,
  .globe-grid::after {
    content: '';
    position: absolute;
    inset: 15% 18%;
    border-radius: 50%;
    pointer-events: none;
  }

  .globe-grid::before {
    border: 1px solid var(--color-gray-200);
    opacity: 0.85;
  }

  .globe-grid::after {
    inset: 27% 30%;
    border-top: 1px dashed var(--color-gray-300);
    transform: rotate(-10deg);
    opacity: 0.8;
  }

  .loading,
  .error {
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
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .globe-cell.hero {
    justify-self: center;
  }

  .globe-container {
    position: relative;
    width: 132px;
    height: 132px;
    border-radius: 50%;
    overflow: hidden;
    border: 1px solid var(--color-gray-300);
    flex-shrink: 0;
    background: var(--color-gray-50);
  }

  .globe-cell:hover .globe-container {
    transform: translateY(-1px);
  }

  .globe-container,
  .globe-accent {
    transition:
      transform 180ms ease,
      opacity 180ms ease,
      background-color 180ms ease;
  }

  .globe-container.hero {
    width: 236px;
    height: 236px;
    border-width: 2px;
  }

  .globe-container :global(.maplibregl-ctrl-attrib),
  .globe-container :global(.maplibregl-ctrl-logo) {
    display: none !important;
  }

  .globe-meta-row {
    width: 100%;
    max-width: 180px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding-bottom: 2px;
    border-bottom: 1px solid var(--color-border);
  }

  .globe-sequence,
  .globe-helper {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--color-text-secondary);
  }

  .globe-sequence {
    font-family: var(--font-family-data);
    color: var(--color-text-primary);
  }

  .globe-helper {
    font-family: var(--font-family-data);
  }

  .hero .globe-meta-row,
  .hero .globe-label {
    max-width: 236px;
  }

  .globe-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 100%;
    max-width: 180px;
  }

  .globe-count {
    font-family: var(--font-family-data);
    font-size: clamp(22px, 2.2vw, 28px);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    line-height: 0.95;
    letter-spacing: var(--tracking-tight);
  }

  .hero .globe-count {
    font-size: clamp(40px, 5vw, 52px);
  }

  .globe-name {
    font-family: var(--font-family-data);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
  }

  .globe-accent {
    display: block;
    width: 28px;
    height: 3px;
    margin-top: 4px;
    border-radius: var(--radius-full);
  }

  @media (max-width: 900px) {
    .globe-overview {
      justify-content: stretch;
    }

    .overview-metrics {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    .globe-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-areas:
        'center center'
        'north-west north'
        'north-east west'
        'east south-west'
        'south south-east';
      gap: var(--space-3);
      padding-top: var(--space-2);
    }

    .globe-grid::before,
    .globe-grid::after {
      display: none;
    }

    .globe-container {
      width: 120px;
      height: 120px;
    }

    .globe-container.hero {
      width: 208px;
      height: 208px;
    }

    .hero .globe-meta-row,
    .hero .globe-label {
      max-width: 208px;
    }
  }
</style>
