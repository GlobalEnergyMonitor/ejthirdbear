<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';

  export let gemUnitId = null;
  export let assetName = '';

  let mapContainer;
  let map;
  let loading = true;
  let error = null;

  onMount(async () => {
    if (!gemUnitId) {
      error = 'No GEM Unit ID provided';
      loading = false;
      return;
    }

    try {
      // Load the points GeoJSON
      const response = await fetch('/points.geojson');
      const geojson = await response.json();

      // Find the matching feature by GEM unit ID
      const feature = geojson.features.find(f =>
        f.properties['GEM unit ID'] === gemUnitId ||
        f.properties.id === gemUnitId
      );

      if (!feature) {
        error = 'Location not found in GeoJSON';
        loading = false;
        return;
      }

      const [lon, lat] = feature.geometry.coordinates;

      // Initialize map
      map = new maplibregl.Map({
        container: mapContainer,
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [lon, lat],
        zoom: 10
      });

      // Add marker
      new maplibregl.Marker({ color: '#000' })
        .setLngLat([lon, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25 })
            .setHTML(`<strong>${assetName || 'Asset'}</strong><br>${lat.toFixed(4)}, ${lon.toFixed(4)}`)
        )
        .addTo(map);

      loading = false;

    } catch (err) {
      console.error('Error loading asset map:', err);
      error = err.message;
      loading = false;
    }

    return () => {
      if (map) map.remove();
    };
  });
</script>

<div class="asset-map-wrapper">
  {#if loading}
    <div class="loading">Loading map...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div bind:this={mapContainer} class="map"></div>
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

  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 12px;
    color: #666;
  }

  .error {
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
