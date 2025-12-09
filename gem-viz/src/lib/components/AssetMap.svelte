<script>
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';

  export let gemUnitId = null;
  export let gemLocationId = null;
  export let assetName = '';
  export let lat = null;
  export let lon = null;

  let mapContainer;
  let map;
  let loading = true;
  let error = null;

  onMount(async () => {
    console.debug('[AssetMap] Mount', {
      gemUnitId,
      assetName,
      location: typeof window !== 'undefined' ? window.location.href : 'ssr',
    });

    const parsedLat = lat !== null ? Number(lat) : null;
    const parsedLon = lon !== null ? Number(lon) : null;
    const hasDirectCoords =
      typeof parsedLat === 'number' &&
      !Number.isNaN(parsedLat) &&
      typeof parsedLon === 'number' &&
      !Number.isNaN(parsedLon);

    if (!hasDirectCoords && !gemLocationId) {
      error = 'No coordinates or GEM location ID provided';
      loading = false;
      return;
    }

    try {
      let finalLat = parsedLat;
      let finalLon = parsedLon;

      if (!hasDirectCoords) {
        const pointsUrl = `${base}/points.geojson`;
        console.debug('[AssetMap] Fetching points', pointsUrl);

        const response = await fetch(pointsUrl);
        if (!response.ok) {
          const body = await response.text().catch(() => '<unavailable>');
          throw new Error(
            `Failed to load points (${response.status} ${response.statusText}): ${body.slice(0, 200)}`
          );
        }

        let geojson;
        try {
          geojson = await response.json();
        } catch (parseErr) {
          console.error('[AssetMap] Failed to parse GeoJSON', parseErr);
          throw new Error(`Invalid GeoJSON response: ${parseErr.message}`);
        }

        console.debug('[AssetMap] Loaded GeoJSON', {
          featureCount: geojson?.features?.length ?? 0,
          sampleProperties: geojson?.features?.[0]?.properties ?? null,
        });

        const feature = geojson.features.find((f) => {
          const props = f.properties || {};
          return gemLocationId
            ? props['GEM location ID'] === gemLocationId || props.location_id === gemLocationId || props.id === gemLocationId
            : false;
        });

        if (!feature) {
          console.warn('[AssetMap] Feature not found', { gemUnitId, gemLocationId });
          error = 'Location not found in GeoJSON';
          loading = false;
          return;
        }

        const coords = feature.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) {
          throw new Error(`Invalid coordinates for ${gemUnitId || gemLocationId}: ${JSON.stringify(coords)}`);
        }

        [finalLon, finalLat] = coords;
        console.debug('[AssetMap] Using coordinates from GeoJSON', { lat: finalLat, lon: finalLon });
      }

      if (hasDirectCoords) {
        finalLat = parsedLat;
        finalLon = parsedLon;
        console.debug('[AssetMap] Using coordinates from asset data', { lat: finalLat, lon: finalLon });
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
