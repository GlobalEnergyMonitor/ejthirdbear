<script lang="ts">
  /**
   * ProjectCardMap — lightweight MapLibre mini-map for project cards.
   * Non-interactive by default; click enables scroll/drag.
   */
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { BASEMAP_POSITRON } from '$lib/map-config';

  let { lat, lon, name: _name = '' } = $props<{ lat: number; lon: number; name?: string }>();

  let container: HTMLDivElement;
  let map: maplibregl.Map | null = null;
  let interactive = $state(false);

  onMount(() => {
    map = new maplibregl.Map({
      container,
      style: BASEMAP_POSITRON,
      center: [lon, lat],
      zoom: 8,
      scrollZoom: false,
      dragPan: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      attributionControl: false,
    });

    new maplibregl.Marker({ color: '#000' }).setLngLat([lon, lat]).addTo(map);

    return () => {
      map?.remove();
      map = null;
    };
  });

  function enableInteraction() {
    if (!map || interactive) return;
    interactive = true;
    map.scrollZoom.enable();
    map.dragPan.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
  }
</script>

<div
  class="card-map"
  class:interactive
  role="button"
  tabindex="0"
  onclick={enableInteraction}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') enableInteraction();
  }}
>
  <div bind:this={container} class="map-container"></div>
  {#if !interactive}
    <div class="click-hint">Click to interact</div>
  {/if}
</div>

<style>
  .card-map {
    position: relative;
    width: 100%;
    height: 200px;
    border-radius: 8px;
    overflow: hidden;
    margin-top: 0.5rem;
    cursor: pointer;
  }

  .card-map.interactive {
    cursor: default;
  }

  .map-container {
    width: 100%;
    height: 100%;
  }

  .click-hint {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    font-size: 0.65rem;
    padding: 2px 8px;
    border-radius: 4px;
    pointer-events: none;
  }
</style>
