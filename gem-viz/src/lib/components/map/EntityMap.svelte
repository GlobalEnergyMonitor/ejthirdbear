<script lang="ts">
  /**
   * EntityMap - Geographic map of an entity's portfolio assets
   * Renders pre-loaded SpotlightAssets on a MapLibre map with tracker-colored circles.
   * Zero additional API calls — uses assets already loaded by the entity page.
   */

  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { trackerToMapColor, colors } from '$lib/design-tokens';
  import type { SpotlightAsset } from '$lib/ownership-data';

  // Props
  let {
    assets = [],
    height = 350,
    hasLocations = $bindable(false),
  }: {
    assets: SpotlightAsset[];
    height?: number;
    hasLocations?: boolean;
  } = $props();

  let mapContainer: HTMLDivElement | null = $state(null);
  let map: maplibregl.Map | undefined;

  // Popup state
  let popupAsset: SpotlightAsset | null = $state(null);
  let popupPosition = $state({ x: 0, y: 0 });

  // Filter to assets with valid coordinates
  const geoAssets = $derived(
    assets.filter(
      (a) =>
        a.latitude != null &&
        a.longitude != null &&
        !isNaN(Number(a.latitude)) &&
        !isNaN(Number(a.longitude))
    )
  );

  // Update bindable prop
  $effect(() => {
    hasLocations = geoAssets.length > 0;
  });

  // Map color lookup — handles both tracker names and API facility type names
  function getMarkerColor(tracker: string): string {
    if (trackerToMapColor[tracker]) return trackerToMapColor[tracker];
    // Fallback for API facility type names that differ from UI tracker names
    const apiNameMap: Record<string, string> = {
      'Oil & Gas Plant': trackerToMapColor['Gas Plant'] || colors.gray500,
      'Bioenergy Plant': trackerToMapColor['Bioenergy Power'] || colors.gray500,
      'Natural Gas Transmission Pipeline': trackerToMapColor['Gas Pipeline'] || colors.gray500,
      'Cement or Concrete Plant': trackerToMapColor['Cement and Concrete'] || colors.gray500,
      'Iron & Steel Plant': trackerToMapColor['Steel Plant'] || colors.gray500,
      'Oil or NGL Pipeline': trackerToMapColor['Oil & NGL Pipeline'] || colors.gray500,
    };
    return apiNameMap[tracker] || colors.gray500;
  }

  function initMap() {
    if (!mapContainer || geoAssets.length === 0) return;

    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [0, 20],
      zoom: 1.5,
      maxZoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      if (!map) return;

      map.addSource('entity-assets', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: geoAssets.map((a) => ({
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [Number(a.longitude), Number(a.latitude)],
            },
            properties: {
              id: a.id,
              name: a.name,
              tracker: a.tracker,
              status: a.status,
              country: a.country,
              capacityMw: a.capacityMw ?? null,
              color: getMarkerColor(a.tracker),
            },
          })),
        },
      });

      map.addLayer({
        id: 'entity-assets-circles',
        type: 'circle',
        source: 'entity-assets',
        paint: {
          'circle-radius': 6,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 1.5,
          'circle-opacity': 0.85,
        },
      });

      // Hover interactions
      map.on('mouseenter', 'entity-assets-circles', (e) => {
        if (!map) return;
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;
        const point = map.project(e.lngLat);

        popupAsset = {
          id: props.id,
          name: props.name,
          tracker: props.tracker,
          status: props.status,
          country: props.country,
          capacityMw: props.capacityMw,
        };
        popupPosition = { x: point.x, y: point.y - 10 };
      });

      map.on('mouseleave', 'entity-assets-circles', () => {
        if (!map) return;
        map.getCanvas().style.cursor = '';
        popupAsset = null;
      });

      map.on('movestart', () => {
        popupAsset = null;
      });

      // Fit bounds to show all points
      const bounds = new maplibregl.LngLatBounds();
      for (const a of geoAssets) {
        bounds.extend([Number(a.longitude), Number(a.latitude)]);
      }
      map.fitBounds(bounds, { padding: 50, maxZoom: 8 });
    });
  }

  onMount(() => {
    if (geoAssets.length > 0) {
      initMap();
    }
    return () => {
      if (map) map.remove();
    };
  });
</script>

{#if geoAssets.length > 0}
  <div class="entity-map">
    <div class="map-wrapper" style="height: {height}px">
      <div bind:this={mapContainer} class="map-container"></div>

      {#if popupAsset}
        <div class="hover-popup" style="left: {popupPosition.x}px; top: {popupPosition.y}px;">
          <div class="popup-card">
            <span class="popup-name">{popupAsset.name}</span>
            <span class="popup-meta">
              {popupAsset.tracker} · {popupAsset.status}
              {#if popupAsset.capacityMw}
                · {Number(popupAsset.capacityMw).toLocaleString()} MW
              {/if}
            </span>
            {#if popupAsset.country}
              <span class="popup-country">{popupAsset.country}</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
    <div class="map-caption">
      <span class="count">{geoAssets.length}</span> of {assets.length} assets with coordinates
    </div>
  </div>
{/if}

<style>
  .entity-map {
    width: 100%;
  }

  .map-wrapper {
    position: relative;
    width: 100%;
    border: 1px solid var(--color-gray-200);
    overflow: hidden;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  .map-caption {
    margin-top: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .count {
    font-weight: 700;
    color: var(--color-text-primary);
  }

  /* Hover popup */
  .hover-popup {
    position: absolute;
    transform: translate(-50%, -100%);
    z-index: 100;
    pointer-events: none;
    animation: popup-appear 0.12s ease-out;
  }

  .popup-card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) var(--space-3);
    background: white;
    border: 1px solid var(--color-gray-200);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    max-width: 260px;
    white-space: nowrap;
  }

  .popup-name {
    font-size: var(--font-size-sm);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .popup-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .popup-country {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .hover-popup::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 50%;
    transform: translateX(-50%);
    border: 8px solid transparent;
    border-top-color: white;
    border-bottom: none;
  }

  @keyframes popup-appear {
    from {
      opacity: 0;
      transform: translate(-50%, -95%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%);
    }
  }
</style>
