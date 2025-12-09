<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import MapboxDraw from 'maplibre-gl-draw';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import 'maplibre-gl-draw/dist/mapbox-gl-draw.css';
  import { mapFilter, clearMapFilter, setMapFilter } from '$lib/mapFilter';
  import { base } from '$app/paths';

  export let tableName = 'data'; // Not used anymore - loads static GeoJSON

  let mapContainer;
  let map;
  let draw;
  let loading = true;
  let error = null;
  let latCol;
  let lonCol;
  let isDrawing = false;

  onMount(async () => {
    // Wait for mapContainer to be ready
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      if (!mapContainer) {
        console.error('Map container not ready after delay');
        loading = false;
        return;
      }

      // Fetch static GeoJSON (generated at build time)
      console.log('Loading static GeoJSON...');
      const response = await fetch(`${base}/points.geojson`);
      if (!response.ok) {
        throw new Error(`Failed to load GeoJSON: ${response.statusText}`);
      }

      const geojson = await response.json();
      console.log(`Loaded ${geojson.features.length.toLocaleString()} points from static GeoJSON`);

      // Get column names from GeoJSON metadata
      latCol = geojson.metadata?.columns?.lat || 'Latitude';
      lonCol = geojson.metadata?.columns?.lon || 'Longitude';

      // Create map
      map = new maplibregl.Map({
        container: mapContainer,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [0, 20],
        zoom: 1,
      });

      map.addControl(new maplibregl.NavigationControl());

      // Add drawing controls with both rectangle and polygon support
      draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true
        },
        modes: {
          ...MapboxDraw.modes,
        }
      });
      map.addControl(draw);

      // Handle draw.create event for when shapes are finished
      map.on('draw.create', (e) => {
        const feature = e.features[0];

        if (feature.geometry.type === 'Polygon') {
          const coordinates = feature.geometry.coordinates[0];

          setMapFilter({
            type: 'polygon',
            coordinates,
            latCol,
            lonCol
          });

          console.log('Polygon filter set:', coordinates.length, 'vertices');
        }
      });

      // Handle draw.delete event
      map.on('draw.delete', () => {
        clearMapFilter();
      });

      // Handle shift + drag for rectangle drawing
      let startPoint = null;
      let shiftPressed = false;

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Shift') shiftPressed = true;
      });

      window.addEventListener('keyup', (e) => {
        if (e.key === 'Shift') shiftPressed = false;
        if (e.key === 'Escape') handleClearFilter();
      });

      map.on('mousedown', (e) => {
        if (shiftPressed && !isDrawing) {
          isDrawing = true;
          startPoint = e.lngLat;
          map.dragPan.disable();
        }
      });

      map.on('mousemove', (e) => {
        if (isDrawing && startPoint) {
          // Remove existing rectangle
          draw.deleteAll();

          // Draw temporary rectangle
          const coords = [
            [startPoint.lng, startPoint.lat],
            [e.lngLat.lng, startPoint.lat],
            [e.lngLat.lng, e.lngLat.lat],
            [startPoint.lng, e.lngLat.lat],
            [startPoint.lng, startPoint.lat]
          ];

          draw.add({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [coords]
            }
          });
        }
      });

      map.on('mouseup', (e) => {
        if (isDrawing && startPoint) {
          const endPoint = e.lngLat;

          // Calculate bounds
          const bounds = {
            north: Math.max(startPoint.lat, endPoint.lat),
            south: Math.min(startPoint.lat, endPoint.lat),
            east: Math.max(startPoint.lng, endPoint.lng),
            west: Math.min(startPoint.lng, endPoint.lng),
            latCol,
            lonCol
          };

          setMapFilter(bounds);
          console.log('Rectangle filter set:', bounds);

          isDrawing = false;
          startPoint = null;
          map.dragPan.enable();
        }
      });

      map.on('load', () => {
        // Add GeoJSON source directly (already in correct format!)
        map.addSource('points', {
          type: 'geojson',
          data: geojson
        });

        map.addLayer({
          id: 'points',
          type: 'circle',
          source: 'points',
          paint: {
            'circle-radius': 3,
            'circle-color': '#007cbf',
            'circle-opacity': 0.7,
          },
        });

        // Fit to bounds
        const bounds = new maplibregl.LngLatBounds();
        geojson.features.forEach((feature) => {
          bounds.extend(feature.geometry.coordinates);
        });
        map.fitBounds(bounds, { padding: 50 });

        loading = false;
      });
    } catch (err) {
      console.error('Map error:', err);
      error = err.message;
      loading = false;
    }
  });

  function handleClearFilter() {
    clearMapFilter();
    if (draw) {
      draw.deleteAll();
    }
    console.log('Map filter cleared');
  }

  // Helper function to check if point is in polygon using ray casting
  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Update map visualization when filter changes
  $: if (map && map.getLayer('points') && map.getSource('points')) {
    if ($mapFilter) {
      if ($mapFilter.type === 'polygon') {
        // For polygons, we need to re-filter the source data
        const source = map.getSource('points');
        const originalData = source._data;

        // Filter features by polygon
        const filteredFeatures = originalData.features.map(feature => {
          const lon = feature.properties.lon;
          const lat = feature.properties.lat;
          const isInside = pointInPolygon(lon, lat, $mapFilter.coordinates);

          return {
            ...feature,
            properties: {
              ...feature.properties,
              selected: isInside
            }
          };
        });

        map.getSource('points').setData({
          type: 'FeatureCollection',
          features: filteredFeatures
        });

        // Style based on selected property
        map.setPaintProperty('points', 'circle-opacity', [
          'case',
          ['get', 'selected'],
          0.8, // Selected
          0.2  // Non-selected
        ]);

        map.setPaintProperty('points', 'circle-color', [
          'case',
          ['get', 'selected'],
          '#2196f3', // Selected - blue
          '#999'     // Non-selected - gray
        ]);
      } else {
        // Rectangle bounds filter
        const { north, south, east, west } = $mapFilter;

        map.setPaintProperty('points', 'circle-opacity', [
          'case',
          [
            'all',
            ['>=', ['get', 'lat'], south],
            ['<=', ['get', 'lat'], north],
            ['>=', ['get', 'lon'], west],
            ['<=', ['get', 'lon'], east],
          ],
          0.8, // Selected points
          0.2  // Non-selected points
        ]);

        map.setPaintProperty('points', 'circle-color', [
          'case',
          [
            'all',
            ['>=', ['get', 'lat'], south],
            ['<=', ['get', 'lat'], north],
            ['>=', ['get', 'lon'], west],
            ['<=', ['get', 'lon'], east],
          ],
          '#2196f3', // Selected points - blue
          '#999'     // Non-selected points - gray
        ]);
      }
    } else {
      // No filter - reset to default
      map.setPaintProperty('points', 'circle-opacity', 0.7);
      map.setPaintProperty('points', 'circle-color', '#007cbf');
    }
  }
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map"></div>
  {#if $mapFilter}
    <div class="filter-indicator">
      <span>Geographic filter active</span>
      <a href="{base}/asset/search?{$mapFilter.type === 'polygon' ? `polygon=${encodeURIComponent(JSON.stringify($mapFilter.coordinates))}` : `bounds=${encodeURIComponent(JSON.stringify($mapFilter))}`}" class="view-assets-btn">
        View Assets
      </a>
      <button class="clear-filter-btn" on:click={handleClearFilter}>
        Clear (ESC)
      </button>
    </div>
  {/if}
  {#if loading}
    <div class="overlay loading">Loading map...</div>
  {/if}
  {#if error}
    <div class="overlay error">{error}</div>
  {/if}
  <div class="map-instructions">
    SHIFT+drag for rectangle • Click polygon tool to draw custom shapes
  </div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 80vh;
    min-height: 600px;
    border: 1px solid #ddd;
    overflow: visible;
  }

  .map {
    width: 100%;
    height: 100%;
  }

  /* Ensure maplibre-gl-draw controls have space */
  .map-wrapper :global(.maplibregl-ctrl-top-right) {
    right: 10px;
    top: 10px;
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
    background: rgba(255, 255, 255, 0.95);
    font-size: 14px;
    z-index: 10;
  }

  .overlay.loading {
    color: #666;
  }

  .overlay.error {
    color: #d32f2f;
    font-weight: 500;
  }

  .filter-indicator {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: #2196f3;
    color: white;
    padding: 8px 16px;
    border-radius: 4px;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    font-weight: bold;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  }

  .view-assets-btn {
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 1);
    color: #2196f3;
    padding: 4px 12px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-block;
  }

  .view-assets-btn:hover {
    background: white;
    color: #1976d2;
  }

  .clear-filter-btn {
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.5);
    color: white;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s;
  }

  .clear-filter-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .map-instructions {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 6px 12px;
    border-radius: 3px;
    font-size: 10px;
    z-index: 20;
    pointer-events: none;
  }
</style>
