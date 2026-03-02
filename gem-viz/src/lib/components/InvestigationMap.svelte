<script lang="ts">
  /**
   * InvestigationMap - Geographic map for investigation assets
   * Shows asset locations on a world map using MapLibre
   * Uses Svelte-based popups with AssetMicroCard
   */

  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { colorByTracker, colors } from '$lib/design-tokens';
  import { getAsset, getEntityOwned, type AssetSummary } from '$lib/ownership-api';
  import AssetMicroCard from './AssetMicroCard.svelte';

  // Props
  let { entityIds = [], assetIds = [], height = 350 } = $props();

  let mapContainer = $state(null);
  let map;
  let loading = $state(true);
  let locations = $state([]);

  // Popup state
  let popupAsset = $state(null);
  let popupPosition = $state({ x: 0, y: 0 });

  // Fetch asset locations via REST API
  async function loadLocations() {
    if (entityIds.length === 0 && assetIds.length === 0) {
      loading = false;
      return;
    }

    try {
      const allAssets: AssetSummary[] = [];

      // Fetch assets for each entity (their owned assets)
      const entityPromises = entityIds.map(async (eid) => {
        try {
          const owned = await getEntityOwned(eid);
          // Each owned item has entityId — fetch those as assets
          for (const item of owned) {
            try {
              const asset = await getAsset(item.entityId);
              allAssets.push(asset);
            } catch {
              /* skip individual failures */
            }
          }
        } catch {
          /* skip entity failures */
        }
      });

      // Fetch specific assets directly
      const assetPromises = assetIds.map(async (aid) => {
        try {
          const asset = await getAsset(aid);
          allAssets.push(asset);
        } catch {
          /* skip individual failures */
        }
      });

      await Promise.all([...entityPromises, ...assetPromises]);

      // Dedupe by ID and filter to those with coordinates
      const seen = new Set();
      locations = allAssets
        .filter((a) => {
          if (!a.latitude || !a.longitude || seen.has(a.id)) return false;
          seen.add(a.id);
          return !isNaN(Number(a.latitude)) && !isNaN(Number(a.longitude));
        })
        .map((a) => ({
          asset_id: a.id,
          name: a.name,
          tracker: a.facilityType || '',
          status: a.status || '',
          lat: Number(a.latitude),
          lng: Number(a.longitude),
          country: a.country || '',
          capacity: a.capacity,
          owner: a.ownerName || '',
        }));
    } catch (err) {
      if (import.meta.env.DEV) console.error('[InvestigationMap] Failed to load locations:', err);
    }
    loading = false;
  }

  function closePopup() {
    popupAsset = null;
  }

  function initMap() {
    if (!mapContainer || locations.length === 0) return;

    map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [0, 20],
      zoom: 1.5,
      maxZoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // Add source for points
      map.addSource('assets', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: locations.map((loc) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [Number(loc.lng), Number(loc.lat)],
            },
            properties: {
              id: loc.asset_id,
              name: loc.name,
              tracker: loc.tracker,
              status: loc.status,
              country: loc.country,
              capacity: loc.capacity,
              owner: loc.owner,
              color: colorByTracker.get(loc.tracker) || colors.grey,
            },
          })),
        },
      });

      // Add circle layer
      map.addLayer({
        id: 'assets-circles',
        type: 'circle',
        source: 'assets',
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      });

      // Show Svelte popup on hover
      map.on('mouseenter', 'assets-circles', (e) => {
        map.getCanvas().style.cursor = 'pointer';

        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;

        // Get screen position for the popup
        const point = map.project(e.lngLat);

        popupAsset = {
          id: props.id,
          name: props.name,
          tracker: props.tracker,
          status: props.status,
          country: props.country,
          capacity: props.capacity,
          owner: props.owner,
        };

        // Position popup above the point, centered
        popupPosition = {
          x: point.x,
          y: point.y - 10,
        };
      });

      // Close popup on mouse leave
      map.on('mouseleave', 'assets-circles', () => {
        map.getCanvas().style.cursor = '';
        closePopup();
      });

      // Close popup on map move
      map.on('movestart', closePopup);

      // Fit bounds to show all points
      if (locations.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const loc of locations) {
          bounds.extend([Number(loc.lng), Number(loc.lat)]);
        }
        map.fitBounds(bounds, { padding: 50, maxZoom: 6 });
      }
    });
  }

  onMount(() => {
    (async () => {
      await loadLocations();
      if (locations.length > 0) {
        initMap();
      }
    })();

    return () => {
      if (map) map.remove();
    };
  });
</script>

{#if loading}
  <div class="map-container loading-state" style="height: {height}px">
    <p>Loading map...</p>
  </div>
{:else if locations.length === 0}
  <div class="map-container empty-state" style="height: {height}px">
    <p>No location data available</p>
  </div>
{:else}
  <div class="investigation-map">
    <h3>Asset Locations ({locations.length})</h3>
    <div class="map-wrapper" style="height: {height}px">
      <div bind:this={mapContainer} class="map-container"></div>

      <!-- Hover popup -->
      {#if popupAsset}
        <div class="hover-popup" style="left: {popupPosition.x}px; top: {popupPosition.y}px;">
          <AssetMicroCard
            id={popupAsset.id}
            name={popupAsset.name}
            tracker={popupAsset.tracker}
            status={popupAsset.status}
            country={popupAsset.country}
            capacity={popupAsset.capacity}
            owner={popupAsset.owner}
            variant="compact"
          />
        </div>
      {/if}
    </div>
    <div class="map-legend">
      <span class="legend-item">
        <span class="count">{locations.length}</span> assets with coordinates
      </span>
    </div>
  </div>
{/if}

<style>
  .investigation-map {
    background: var(--color-white);
    padding: 16px;
    margin-bottom: 24px;
  }

  h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .map-wrapper {
    position: relative;
    width: 100%;
    border: 1px solid var(--color-border);
    overflow: hidden;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  .loading-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    font-size: 13px;
  }

  .map-legend {
    margin-top: 8px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .count {
    font-weight: 600;
    color: var(--color-black);
  }

  /* Hover popup */
  .hover-popup {
    position: absolute;
    transform: translate(-50%, -100%);
    z-index: 100;
    pointer-events: none;
    animation: popup-appear 0.12s ease-out;
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

  @media print {
    .investigation-map {
      page-break-inside: avoid;
    }
    .map-wrapper {
      max-height: 250px;
    }
    .hover-popup {
      display: none;
    }
  }
</style>
