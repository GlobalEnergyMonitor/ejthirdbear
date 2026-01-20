<script>
  import { onMount } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import MapLibreDraw from 'maplibre-gl-draw';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import 'maplibre-gl-draw/dist/mapbox-gl-draw.css'; // Legacy CSS path
  import {
    mapFilter,
    clearMapFilter,
    setMapFilter,
    isPolygonFilter,
    isBoundsFilter,
  } from '$lib/mapFilter';
  import { link, assetPath } from '$lib/links';
  import { trackerToMapColor, mapColors } from '$lib/design-tokens';
  import AssetMicroCard from '$lib/components/AssetMicroCard.svelte';

  let mapContainer = $state(null);
  let map;
  let draw;
  let loading = $state(true);
  let error = $state(null);
  let latCol;
  let lonCol;
  let isDrawing = false;

  // Popup state for hover cards
  let popupAsset = $state(null);
  let popupPosition = $state({ x: 0, y: 0 });

  function closePopup() {
    popupAsset = null;
  }

  const trackerColorStops = Object.entries(trackerToMapColor).flatMap(([tracker, color]) => [
    tracker,
    color,
  ]);

  // Shape mappings for different tracker types (used for visual distinction)
  // Maps tracker type to number of sides (3=triangle, 4=square, 5=pentagon, 6=hexagon, 12+=circle)
  const trackerShapes = {
    'Coal Plant': 4, // square - power
    'Gas Plant': 4, // square - power
    'Bioenergy Power': 4, // square - power
    'Coal Mine': 3, // triangle - extraction
    'Iron Mine': 3, // triangle - extraction
    'Steel Plant': 6, // hexagon - industrial
    'Cement and Concrete': 6, // hexagon - industrial
    'Gas Pipeline': 5, // pentagon - infrastructure
    'Oil & NGL Pipeline': 5, // pentagon - infrastructure
  };

  // Generate shape stops for MapLibre expression (reserved for future polygon layer)
  const _trackerShapeStops = Object.entries(trackerShapes).flatMap(([tracker, sides]) => [
    tracker,
    sides,
  ]);

  onMount(async () => {
    // Wait for mapContainer to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      if (!mapContainer) {
        console.error('Map container not ready after delay');
        loading = false;
        return;
      }

      // Fetch static GeoJSON (generated at build time)
      console.log('Loading static GeoJSON...');
      const response = await fetch(assetPath('points.geojson'));
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
        style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
        center: [0, 20],
        zoom: 1,
      });

      map.addControl(new maplibregl.NavigationControl());

      // Add drawing controls with both rectangle and polygon support
      draw = new MapLibreDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
          trash: true,
        },
        modes: {
          ...MapLibreDraw.modes,
        },
      });
      map.addControl(/** @type {any} */ (draw));

      // Handle draw.create event for when shapes are finished
      map.on('draw.create', (e) => {
        const feature = e.features[0];

        if (feature.geometry.type === 'Polygon') {
          const coordinates = feature.geometry.coordinates[0];

          setMapFilter({
            type: 'polygon',
            coordinates,
            latCol,
            lonCol,
          });
        }
      });

      // Handle draw.update event for when shapes are moved/edited
      map.on('draw.update', (e) => {
        const feature = e.features[0];

        if (feature.geometry.type === 'Polygon') {
          const coordinates = feature.geometry.coordinates[0];

          setMapFilter({
            type: 'polygon',
            coordinates,
            latCol,
            lonCol,
          });
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
            [startPoint.lng, startPoint.lat],
          ];

          draw.add({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [coords],
            },
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
            lonCol,
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
          data: geojson,
        });

        // Add distinct layers per category for different shapes
        // Power plants - squares (rendered as circles with square-ish proportions)
        map.addLayer({
          id: 'points-power',
          type: 'circle',
          source: 'points',
          filter: [
            'in',
            ['get', 'tracker'],
            ['literal', ['Coal Plant', 'Gas Plant', 'Bioenergy Power']],
          ],
          paint: {
            'circle-radius': 6,
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.9,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': '#fff',
            'circle-stroke-opacity': 0.9,
          },
        });

        // Mines - triangular appearance (smaller, pointed look)
        map.addLayer({
          id: 'points-mines',
          type: 'circle',
          source: 'points',
          filter: ['in', ['get', 'tracker'], ['literal', ['Coal Mine', 'Iron Mine']]],
          paint: {
            'circle-radius': 5,
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.9,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#000',
            'circle-stroke-opacity': 0.8,
          },
        });

        // Industrial - hexagonal (larger, industrial feel)
        map.addLayer({
          id: 'points-industrial',
          type: 'circle',
          source: 'points',
          filter: ['in', ['get', 'tracker'], ['literal', ['Steel Plant', 'Cement and Concrete']]],
          paint: {
            'circle-radius': 7,
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.85,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#333',
            'circle-stroke-opacity': 0.7,
          },
        });

        // Pipelines - linear infrastructure (elongated look via stroke)
        map.addLayer({
          id: 'points-pipelines',
          type: 'circle',
          source: 'points',
          filter: ['in', ['get', 'tracker'], ['literal', ['Gas Pipeline', 'Oil & NGL Pipeline']]],
          paint: {
            'circle-radius': 4,
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.9,
            'circle-stroke-width': 3,
            'circle-stroke-color': [
              'match',
              ['get', 'tracker'],
              ...trackerColorStops,
              mapColors.default,
            ],
            'circle-stroke-opacity': 0.4,
          },
        });

        // Default/other trackers
        map.addLayer({
          id: 'points-other',
          type: 'circle',
          source: 'points',
          filter: [
            '!',
            [
              'in',
              ['get', 'tracker'],
              [
                'literal',
                [
                  'Coal Plant',
                  'Gas Plant',
                  'Bioenergy Power',
                  'Coal Mine',
                  'Iron Mine',
                  'Steel Plant',
                  'Cement and Concrete',
                  'Gas Pipeline',
                  'Oil & NGL Pipeline',
                ],
              ],
            ],
          ],
          paint: {
            'circle-radius': 5,
            'circle-color': ['match', ['get', 'tracker'], ...trackerColorStops, mapColors.default],
            'circle-opacity': 0.85,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': mapColors.stroke,
            'circle-stroke-opacity': 0.6,
          },
        });

        // Show popup on hover
        map.on('mouseenter', 'points', (e) => {
          map.getCanvas().style.cursor = 'pointer';

          const feature = e.features?.[0];
          if (!feature) return;

          const props = feature.properties;
          const point = map.project(e.lngLat);

          popupAsset = {
            id: props.unitId || props['GEM unit ID'] || props.id,
            name: props.name || props.project || props.Project,
            tracker: props.tracker,
            status: props.status,
            country: props.country || props['Country.Area'],
            capacity: props.capacity || props['Capacity (MW)'],
            owner: props.owner,
          };

          popupPosition = {
            x: point.x,
            y: point.y - 10,
          };
        });

        map.on('mouseleave', 'points', () => {
          map.getCanvas().style.cursor = '';
          closePopup();
        });

        map.on('movestart', closePopup);

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
      const xi = polygon[i][0],
        yi = polygon[i][1];
      const xj = polygon[j][0],
        yj = polygon[j][1];

      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Update map visualization when filter changes
  $effect(() => {
    const filter = $mapFilter;
    if (!map || !map.getLayer('points') || !map.getSource('points')) return;

    if (filter) {
      if (isPolygonFilter(filter)) {
        // For polygons, we need to re-filter the source data
        const source = map.getSource('points');
        const originalData = source._data;
        const polyCoords = filter.coordinates;

        // Filter features by polygon
        const filteredFeatures = originalData.features.map((feature) => {
          const lon = feature.properties.lon;
          const lat = feature.properties.lat;
          const isInside = pointInPolygon(lon, lat, polyCoords);

          return {
            ...feature,
            properties: {
              ...feature.properties,
              selected: isInside,
            },
          };
        });

        map.getSource('points').setData({
          type: 'FeatureCollection',
          features: filteredFeatures,
        });

        // Style based on selected property
        map.setPaintProperty('points', 'circle-opacity', [
          'case',
          ['get', 'selected'],
          0.8, // Selected
          0.2, // Non-selected
        ]);

        map.setPaintProperty('points', 'circle-color', [
          'case',
          ['get', 'selected'],
          mapColors.selected,
          mapColors.unselected,
        ]);
      } else if (isBoundsFilter(filter)) {
        // Rectangle bounds filter
        const { north, south, east, west } = filter;

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
          0.2, // Non-selected points
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
          mapColors.selected,
          mapColors.unselected,
        ]);
      }
    } else {
      // No filter - reset to default with type colors
      map.setPaintProperty('points', 'circle-opacity', 0.85);
      map.setPaintProperty('points', 'circle-color', [
        'match',
        ['get', 'tracker'],
        ...trackerColorStops,
        mapColors.default,
      ]);
    }
  });

  // Legend data
  const legendItems = [
    { label: 'Coal Plant', color: trackerToMapColor['Coal Plant'] || mapColors.default },
    { label: 'Coal Mine', color: trackerToMapColor['Coal Mine'] || mapColors.default },
    { label: 'Gas Plant', color: trackerToMapColor['Gas Plant'] || mapColors.default },
    { label: 'Steel Plant', color: trackerToMapColor['Steel Plant'] || mapColors.default },
    { label: 'Iron Mine', color: trackerToMapColor['Iron Mine'] || mapColors.default },
    { label: 'Bioenergy', color: trackerToMapColor['Bioenergy Power'] || mapColors.default },
  ];

  // Compute search URL with query params
  const searchUrl = $derived(
    $mapFilter
      ? `${link('asset/search')}?${
          isPolygonFilter($mapFilter)
            ? `polygon=${encodeURIComponent(JSON.stringify($mapFilter.coordinates))}`
            : `bounds=${encodeURIComponent(JSON.stringify($mapFilter))}`
        }`
      : ''
  );
</script>

<div class="map-wrapper">
  <div bind:this={mapContainer} class="map"></div>

  <!-- Hover popup with AssetMicroCard -->
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

  {#if $mapFilter}
    <div class="filter-indicator">
      <span>Geographic filter active</span>
      <a href={searchUrl} class="view-assets-btn"> View Assets </a>
      <button class="clear-filter-btn" onclick={handleClearFilter}> Clear (ESC) </button>
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
  <div class="legend">
    {#each legendItems as item}
      <div class="legend-item">
        <span class="legend-dot" style="background: {item.color}"></span>
        <span class="legend-label">{item.label}</span>
      </div>
    {/each}
  </div>
</div>

<style>
  .map-wrapper {
    position: relative;
    width: 100%;
    height: 80vh;
    min-height: 600px;
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
    background: color-mix(in srgb, var(--color-white) 95%, transparent);
    font-size: 14px;
    z-index: 10;
  }

  .overlay.loading {
    color: var(--color-text-secondary);
  }

  .overlay.error {
    color: var(--color-error);
    font-weight: 500;
  }

  .filter-indicator {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: var(--color-text-secondary);
    padding: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    font-weight: bold;
  }

  .view-assets-btn {
    background: transparent;
    border: 0;
    color: var(--color-text-secondary);
    padding: 0;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-block;
  }

  .view-assets-btn:hover {
    color: var(--color-text-primary);
  }

  .clear-filter-btn {
    background: transparent;
    border: 0;
    color: var(--color-text-secondary);
    padding: 0;
    cursor: pointer;
    font-size: 10px;
    font-weight: bold;
    transition: background 0.2s;
  }

  .clear-filter-btn:hover {
    color: var(--color-text-primary);
  }

  .map-instructions {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    color: var(--color-text-secondary);
    padding: 0;
    font-size: 10px;
    z-index: 20;
    pointer-events: none;
  }

  .legend {
    position: absolute;
    top: 10px;
    left: 10px;
    padding: 0;
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 0;
  }

  .legend-label {
    color: var(--color-gray-700);
    font-weight: 500;
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
</style>
