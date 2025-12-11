<script>
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';

  import {
    fetchAssetBasics,
    fetchCoordinatesByLocation,
  } from '$lib/component-data/schema';

  let mapContainer;
  let map;
  let loading = $state(true);
  let error = $state(null);
  let assetName = $state('');

  onMount(async () => {
    const params = get(page)?.params ?? {};
    const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
    const assetId = params.id || url?.searchParams.get('assetId') || null;

    if (!assetId) {
      error = 'Missing asset ID';
      loading = false;
      return;
    }

    console.debug('[AssetMap] Mount', {
      assetId,
      location: typeof window !== 'undefined' ? window.location.href : 'ssr',
    });

    const basics = await fetchAssetBasics(assetId);

    if (!basics) {
      error = `Asset ${assetId} not found`;
      loading = false;
      return;
    }

    assetName = basics.name || 'Asset';

    const parsedLat = basics.lat !== null ? Number(basics.lat) : null;
    const parsedLon = basics.lon !== null ? Number(basics.lon) : null;
    const hasDirectCoords =
      typeof parsedLat === 'number' &&
      !Number.isNaN(parsedLat) &&
      typeof parsedLon === 'number' &&
      !Number.isNaN(parsedLon);

    if (!hasDirectCoords && !basics.locationId) {
      error = 'No coordinates or GEM location ID provided';
      loading = false;
      return;
    }

    try {
      let finalLat = parsedLat;
      let finalLon = parsedLon;

      if (!hasDirectCoords) {
        const coords = basics.locationId
          ? await fetchCoordinatesByLocation(basics.locationId)
          : null;

        if (!coords || coords.lat == null || coords.lon == null) {
          console.warn('[AssetMap] Coordinates not found', {
            assetId,
            locationId: basics.locationId,
          });
          error = 'Location not found in data';
          loading = false;
          return;
        }

        finalLat = Number(coords.lat);
        finalLon = Number(coords.lon);
        console.debug('[AssetMap] Using coordinates from MotherDuck', {
          lat: finalLat,
          lon: finalLon,
        });
      }

      if (hasDirectCoords) {
        finalLat = parsedLat;
        finalLon = parsedLon;
        console.debug('[AssetMap] Using coordinates from asset data', {
          lat: finalLat,
          lon: finalLon,
        });
      }

      // Initialize map
      map = new maplibregl.Map({
        container: mapContainer,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [finalLon, finalLat],
        zoom: 10,
      });

      // Add marker
      new maplibregl.Marker({ color: '#000' })
        .setLngLat([finalLon, finalLat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 }).setHTML(
            `<strong>${assetName || 'Asset'}</strong><br>${finalLat.toFixed(4)}, ${finalLon.toFixed(4)}`
          )
        )
        .addTo(map);

      loading = false;
    } catch (err) {
      console.error('[AssetMap] Error loading asset map:', err);
      error = `${err.name || 'Error'}: ${err.message}`;
      loading = false;
    }

    return () => {
      if (map) map.remove();
    };
  });
</script>

<div class="asset-map-wrapper">
  <div bind:this={mapContainer} class="map"></div>
  {#if loading}
    <div class="overlay loading">Loading map...</div>
  {:else if error}
    <div class="overlay error">{error}</div>
  {/if}
</div>

<style>
  .asset-map-wrapper {
    position: relative;
    width: 100%;
    height: 400px;
    border: 1px solid #ddd;
    background: #fafafa;
  }

  .map {
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    background: #fafafa;
    z-index: 10;
  }

  .overlay.loading {
    color: #666;
  }

  .overlay.error {
    color: #999;
  }

  /* MapLibre popup styling to match brutalist design */
  :global(.maplibregl-popup-content) {
    font-family: Georgia, serif;
    padding: 12px;
    border: 1px solid #000;
    border-radius: 0;
    box-shadow: none;
  }

  :global(.maplibregl-popup-close-button) {
    font-size: 18px;
    padding: 0 8px;
  }
</style>
