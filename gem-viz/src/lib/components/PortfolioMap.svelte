<script>
  /**
   * PortfolioMap - Geographic footprint visualization for entity portfolios
   *
   * Shows all asset locations for an entity on a mini-map.
   * Loads points.geojson and filters to matching location IDs.
   *
   * @example
   * <PortfolioMap assets={portfolio.assets} entityName="RWE AG" />
   */
  import { onMount, onDestroy, tick } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { assetPath, assetLink } from '$lib/links';
  import { goto } from '$app/navigation';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  let {
    /** Array of assets with locationId property */
    assets = [],
    /** Entity name for display (reserved for future use) */
    entityName: _entityName = 'Portfolio',
    /** Map height */
    height = 300,
  } = $props();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let mapContainer = $state(null);
  let map = $state(null);
  let loading = $state(true);
  let _error = $state(null); // Track errors internally
  let matchedCount = $state(0);
  let hasValidCoordinates = $state(false);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  onMount(async () => {
    if (!assets.length) {
      loading = false;
      return;
    }

    try {
      // Build set of location IDs to match
      const locationIds = new Set(assets.map((a) => a.locationId || a.location_id).filter(Boolean));

      if (locationIds.size === 0) {
        _error = 'No location data available';
        loading = false;
        return;
      }

      // Fetch static GeoJSON
      const response = await fetch(assetPath('points.geojson'));
      if (!response.ok) throw new Error('Failed to load map data');

      const geojson = await response.json();

      // Filter to matching locations
      const matchedFeatures = geojson.features.filter((f) =>
        locationIds.has(
          f.properties?.id || f.properties?.['GEM location ID'] || f.properties?.locationId
        )
      );

      matchedCount = matchedFeatures.length;

      if (matchedFeatures.length === 0) {
        // No coordinates - component will render nothing
        loading = false;
        return;
      }

      hasValidCoordinates = true;

      // Wait for DOM to update so mapContainer is bound
      await tick();

      // Safety check - container must exist
      if (!mapContainer) {
        console.error('[PortfolioMap] Container not ready after tick');
        loading = false;
        return;
      }

      // Create filtered GeoJSON
      const filteredGeojson = {
        type: 'FeatureCollection',
        features: matchedFeatures,
      };

      // Initialize map
      map = new maplibregl.Map({
        container: mapContainer,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [0, 20],
        zoom: 1,
        attributionControl: false,
      });

      map.on('load', () => {
        // Add source
        map.addSource('portfolio', {
          type: 'geojson',
          data: filteredGeojson,
        });

        // Add circle layer
        map.addLayer({
          id: 'portfolio-points',
          type: 'circle',
          source: 'portfolio',
          paint: {
            'circle-radius': 5,
            'circle-color': '#333',
            'circle-opacity': 0.7,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
          },
        });

        // Fit bounds to all points
        const bounds = new maplibregl.LngLatBounds();
        matchedFeatures.forEach((f) => {
          bounds.extend(f.geometry.coordinates);
        });
        map.fitBounds(bounds, { padding: 40, maxZoom: 8 });

        // Add click handler
        map.on('click', 'portfolio-points', (e) => {
          if (e.features?.[0]) {
            const props = e.features[0].properties;
            const assetId = props.unitId || props['GEM unit ID'];
            if (assetId) goto(assetLink(assetId));
          }
        });

        // Cursor style on hover
        map.on('mouseenter', 'portfolio-points', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'portfolio-points', () => {
          map.getCanvas().style.cursor = '';
        });

        loading = false;
      });
    } catch (err) {
      console.error('[PortfolioMap] Error:', err);
      _error = err.message;
      loading = false;
    }
  });

  onDestroy(() => {
    if (map) map.remove();
  });
</script>

<!-- ---------------------------------------------------------------------------
     Template: Container always exists for binding, visibility controlled by CSS
     --------------------------------------------------------------------------- -->
{#if loading || hasValidCoordinates}
  <div class="portfolio-map" style="height: {height}px">
    <div bind:this={mapContainer} class="map"></div>
    {#if loading}
      <div class="overlay">Loading map...</div>
    {:else}
      <div class="map-label">{matchedCount} locations</div>
    {/if}
  </div>
{/if}

<!-- ---------------------------------------------------------------------------
     Styles
     --------------------------------------------------------------------------- -->
<style>
  .portfolio-map {
    position: relative;
    width: 100%;
    background: #f5f5f5;
  }

  .map {
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.9);
    font-size: 12px;
    color: #666;
  }

  .overlay.error {
    color: #b10000;
  }

  .map-label {
    position: absolute;
    bottom: 8px;
    left: 8px;
    background: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  /* Minimal popup styling */
  :global(.portfolio-map .maplibregl-popup-content) {
    padding: 8px 12px;
    font-size: 12px;
  }
</style>
