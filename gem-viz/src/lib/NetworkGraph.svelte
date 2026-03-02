<script>
  import { onMount } from 'svelte';
  import { assetLink, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import { Deck } from '@deck.gl/core';
  import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';
  import { colors } from '$lib/design-tokens';
  import { listAssets } from '$lib/ownership-api';
  import {
    SIMULATION_PRESETS,
    LAYOUT_TUNING,
    DEFAULT_CONFIG,
    toRgbArray,
    mixHex,
  } from '$lib/network-graph-config';
  // Use d3-force-3d for better performance (even in 2D mode)
  import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceX,
    forceY,
  } from 'd3-force-3d';

  // State
  let container;
  let deck;
  let loading = $state(true);
  let error = $state(null);
  let stats = $state({ nodes: 0, edges: 0, totalNodes: 0, totalEdges: 0 });
  let hoveredNode = $state(null);
  let simulationProgress = $state(0);
  let currentZoom = $state(0);
  let loadingPhase = $state('Initializing...');
  let fps = $state(0);

  // Configuration - user adjustable (uses imported DEFAULT_CONFIG)
  let config = $state({ ...DEFAULT_CONFIG });

  // Auto-rotation state
  let rotationFrame;
  let currentViewState = null; // Track view state for camera rotation

  // Graph data
  let nodes = [];
  let links = [];
  let nodeMap = new Map();
  let allEdgesCount = 0;

  // Simulation
  let simulation;
  let animationFrame;
  let lastFrameTime = 0;

  // Get or create a node in the nodeMap
  function getOrCreateNode(id, name) {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, { id, name: name || id, connections: 0, inDegree: 0, outDegree: 0 });
    }
    return nodeMap.get(id);
  }

  // Extract ownership edges from asset data
  function extractEdgesFromAssets(assets) {
    const edges = [];
    for (const asset of assets) {
      if (!asset.id || !asset.owners?.length) continue;
      for (const owner of asset.owners) {
        if (!owner.entityId) continue;
        edges.push({
          source_id: asset.id,
          source_name: asset.name,
          target_id: owner.entityId,
          target_name: owner.name,
          share: owner.ownershipShare || 0,
        });
      }
    }
    return edges;
  }

  async function loadData() {
    try {
      loading = true;
      error = null;
      loadingPhase = 'Fetching assets from API...';

      // Paginate through API to collect ownership edges
      const BATCH = 500;
      const maxEdges = config.maxEdges || 25000;
      let allEdges = [];
      let offset = 0;

      while (allEdges.length < maxEdges && offset < 50000) {
        const page = await listAssets({ limit: BATCH, offset, facets: offset === 0 });
        const edges = extractEdgesFromAssets(page.results);
        allEdges.push(...edges);

        loadingPhase = `Loading edges: ${allEdges.length.toLocaleString()} / ~${maxEdges.toLocaleString()}...`;

        if (page.results.length < BATCH) break;
        offset += BATCH;

        // Stop if we have enough edges
        if (allEdges.length >= maxEdges) break;
      }

      allEdgesCount = allEdges.length;

      // Apply sampling mode
      if (config.sampleMode === 'random') {
        // Shuffle and take maxEdges
        for (let i = allEdges.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allEdges[i], allEdges[j]] = [allEdges[j], allEdges[i]];
        }
      }
      allEdges = allEdges.slice(0, maxEdges);

      loadingPhase = 'Building graph structure...';

      nodeMap.clear();
      links = [];

      for (const edge of allEdges) {
        const sourceNode = getOrCreateNode(edge.source_id, edge.source_name);
        sourceNode.connections++;
        sourceNode.outDegree++;

        const targetNode = getOrCreateNode(edge.target_id, edge.target_name);
        targetNode.connections++;
        targetNode.inDegree++;

        links.push({ source: edge.source_id, target: edge.target_id, share: edge.share || 0 });
      }

      const filteredNodes = Array.from(nodeMap.values()).filter(
        (n) => n.connections >= config.minConnections
      );

      const nodeIds = new Set(filteredNodes.map((n) => n.id));
      const filteredLinks = links.filter((l) => nodeIds.has(l.source) && nodeIds.has(l.target));

      nodes = filteredNodes;
      links = filteredLinks;

      stats = {
        nodes: nodes.length,
        edges: links.length,
        totalNodes: nodeMap.size,
        totalEdges: allEdgesCount,
      };

      await runSimulation();
      loading = false;
    } catch (e) {
      if (import.meta.env.DEV) console.error('[NetworkGraph] Error loading data:', e);
      error = `${e.name || 'Error'}: ${e.message}`;
      loading = false;
    }
  }

  function runSimulation() {
    return new Promise((resolve) => {
      loadingPhase = 'Running force simulation (d3-force-3d)...';

      const preset = SIMULATION_PRESETS[config.simulationSpeed];
      const tunedPreset = {
        ...preset,
        linkDistance: preset.linkDistance * LAYOUT_TUNING.linkDistance[config.linkDistance],
        chargeStrength: preset.chargeStrength * LAYOUT_TUNING.repulsion[config.repulsion],
        centerStrength: preset.centerStrength * LAYOUT_TUNING.gravity[config.gravity],
        axisStrength: preset.axisStrength * LAYOUT_TUNING.gravity[config.gravity],
      };
      const numDimensions = config.use3D ? 3 : 2;

      // Initialize positions - radial layout based on connectivity
      const scale = Math.sqrt(nodes.length) * 3.5 * LAYOUT_TUNING.linkDistance[config.linkDistance];
      const maxConn = Math.max(...nodes.map((n) => n.connections), 1);

      for (const node of nodes) {
        const normalizedConn = node.connections / maxConn;
        const radius = scale * (1 - normalizedConn * 0.6);
        const angle = Math.random() * 2 * Math.PI;
        node.x = Math.cos(angle) * radius;
        node.y = Math.sin(angle) * radius;
        if (config.use3D) {
          node.z = (Math.random() - 0.5) * radius * 0.5;
        }
      }

      // Create d3-force-3d simulation
      simulation = forceSimulation(nodes, numDimensions)
        .force(
          'link',
          forceLink(links)
            .id((d) => d.id)
            .distance(tunedPreset.linkDistance)
            .strength((d) => {
              const srcConn = nodeMap.get(d.source.id || d.source)?.connections || 1;
              const tgtConn = nodeMap.get(d.target.id || d.target)?.connections || 1;
              return Math.min(tunedPreset.linkStrength, 1 / Math.min(srcConn, tgtConn));
            })
        )
        .force(
          'charge',
          forceManyBody()
            .strength((d) => tunedPreset.chargeStrength * Math.sqrt(d.connections || 1))
            .theta(0.9)
            .distanceMax(180)
        )
        .force('center', forceCenter(0, 0).strength(tunedPreset.centerStrength))
        .force('x', forceX(0).strength(tunedPreset.axisStrength))
        .force('y', forceY(0).strength(tunedPreset.axisStrength))
        .alphaDecay(tunedPreset.alphaDecay)
        .velocityDecay(tunedPreset.velocityDecay);

      function stretchLayoutToCanvas(padding = 0.98) {
        if (!container) return;
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        const xs = [];
        const ys = [];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        let minZ = Infinity;
        let maxZ = -Infinity;

        for (const node of nodes) {
          if (node.x == null || node.y == null) continue;
          xs.push(node.x);
          ys.push(node.y);
          minX = Math.min(minX, node.x);
          maxX = Math.max(maxX, node.x);
          minY = Math.min(minY, node.y);
          maxY = Math.max(maxY, node.y);
          if (config.use3D && node.z != null) {
            minZ = Math.min(minZ, node.z);
            maxZ = Math.max(maxZ, node.z);
          }
        }

        const percentile = (arr, p) => {
          if (arr.length === 0) return 0;
          const sorted = [...arr].sort((a, b) => a - b);
          const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
          return sorted[idx];
        };

        if (xs.length > 30) {
          minX = percentile(xs, 0.02);
          maxX = percentile(xs, 0.98);
          minY = percentile(ys, 0.02);
          maxY = percentile(ys, 0.98);
        }

        const spanX = Math.max(1, maxX - minX);
        const spanY = Math.max(1, maxY - minY);
        const targetX = width * padding;
        const targetY = height * padding;
        const scaleFactor = Math.min(targetX / spanX, targetY / spanY) * 1.25;
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const centerZ = config.use3D ? (minZ + maxZ) / 2 : 0;
        const zSpan = Math.max(1, maxZ - minZ);
        const zScale = config.use3D ? scaleFactor * Math.min(1, spanY / zSpan) : 1;

        for (const node of nodes) {
          if (node.x == null || node.y == null) continue;
          node.x = (node.x - centerX) * scaleFactor;
          node.y = (node.y - centerY) * scaleFactor;
          if (config.use3D && node.z != null) {
            node.z = (node.z - centerZ) * zScale;
          }
        }
      }

      // WARMUP: Run ticks synchronously for fast initial layout
      loadingPhase = `Warmup: computing initial layout...`;

      simulation.alpha(1);

      for (let i = 0; i < preset.warmupTicks; i++) {
        simulation.tick();
        if (i % 20 === 0) {
          simulationProgress = Math.round((i / preset.warmupTicks) * 50);
        }
      }

      stretchLayoutToCanvas();

      // Show initial state
      updateLayers();
      simulationProgress = 50;

      // ANIMATE: Continue with animated ticks
      loadingPhase = 'Refining layout...';
      let tickCount = 0;
      const maxAnimTicks = preset.animTicks;

      function animate() {
        if (!simulation || tickCount >= maxAnimTicks || simulation.alpha() < 0.01) {
          simulationProgress = 100;
          loadingPhase = 'Complete';
          stretchLayoutToCanvas();
          updateLayers();
          resolve();
          return;
        }

        // Run multiple ticks per frame for speed
        const ticksPerFrame = 3;
        for (let i = 0; i < ticksPerFrame && tickCount < maxAnimTicks; i++) {
          simulation.tick();
          tickCount++;
        }

        // Calculate FPS
        const now = performance.now();
        if (lastFrameTime) {
          fps = Math.round(1000 / (now - lastFrameTime));
        }
        lastFrameTime = now;

        simulationProgress = 50 + Math.round((tickCount / maxAnimTicks) * 50);
        updateLayers();

        animationFrame = requestAnimationFrame(animate);
      }

      animationFrame = requestAnimationFrame(animate);
    });
  }

  function updateLayers() {
    if (!deck) return;

    // Simple position getter - explicitly typed for deck.gl
    /** @type {(d: any) => [number, number, number]} */
    const getPos = (d) => [d.x || 0, d.y || 0, config.use3D ? d.z || 0 : 0];

    // Build line data from resolved links
    const lineData = [];
    for (const link of links) {
      const source = typeof link.source === 'object' ? link.source : nodeMap.get(link.source);
      const target = typeof link.target === 'object' ? link.target : nodeMap.get(link.target);
      if (source && target && source.x != null && target.x != null) {
        lineData.push({ source, target, share: link.share });
      }
    }

    // LOD-based opacity
    const baseOpacity = config.edgeOpacity;
    const zoomFactor = Math.max(0.1, Math.min(1, (currentZoom + 2) / 4));
    const edgeOpacity = currentZoom < -1 ? baseOpacity * 0.25 : baseOpacity * zoomFactor;
    const edgeBase = toRgbArray(colors.gray500, 255);

    // Node size scaling
    const nodeScale = Math.pow(2, -currentZoom * 0.25);

    deck.setProps({
      layers: [
        // Edges - hidden at very low zoom for perf
        currentZoom > -3.5 &&
          new LineLayer({
            id: 'edges',
            data: lineData,
            getSourcePosition: (d) => getPos(d.source),
            getTargetPosition: (d) => getPos(d.target),
            getColor: (d) => {
              const shareAlpha = Math.min(255, Math.max(15, (d.share || 8) * 2.2));
              return [edgeBase[0], edgeBase[1], edgeBase[2], Math.round(shareAlpha * edgeOpacity)];
            },
            getWidth: 1,
            widthMinPixels: 0.5,
            widthMaxPixels: 2,
            pickable: false,
            updateTriggers: {
              getColor: [edgeOpacity],
            },
          }),

        // Nodes
        new ScatterplotLayer({
          id: 'nodes',
          data: nodes,
          getPosition: (d) => getPos(d),
          getRadius: (d) => {
            const baseSize = Math.max(2, Math.log2(d.connections + 1) * 2.8);
            return baseSize * nodeScale;
          },
          getFillColor: (d) => {
            // Warm grayscale ramp by connection count
            const t = Math.min(1, d.connections / 80);
            const [r, g, b] = mixHex(colors.gray300, colors.gray900, t);
            return [r, g, b, 215];
          },
          radiusMinPixels: 1.5,
          radiusMaxPixels: 35,
          pickable: true,
          onHover: ({ object }) => {
            hoveredNode = object;
          },
          onClick: ({ object }) => {
            if (object) {
              // Assets start with G, entities with E
              const isAsset = object.id.startsWith('G');
              goto(isAsset ? assetLink(object.id) : entityLink(object.id));
            }
          },
          autoHighlight: true,
          highlightColor: toRgbArray(colors.gray100, 255),
          updateTriggers: {
            getRadius: [nodeScale],
          },
        }),
      ].filter(Boolean),
    });
  }

  function handleViewStateChange({ viewState }) {
    currentZoom = viewState.zoom;
    currentViewState = { ...viewState };
    updateLayers();
  }

  function startAutoRotation() {
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
    if (!config.use3D || !config.autoRotate || !deck) return;

    function rotate() {
      if (!config.autoRotate || !config.use3D || !deck || !currentViewState) {
        rotationFrame = null;
        return;
      }

      // Increment orbit rotation
      const newOrbit = ((currentViewState.rotationOrbit || 0) + config.rotationSpeed) % 360;

      currentViewState = {
        ...currentViewState,
        rotationOrbit: newOrbit,
      };

      // Update deck with new view state
      deck.setProps({
        initialViewState: currentViewState,
      });

      rotationFrame = requestAnimationFrame(rotate);
    }

    rotationFrame = requestAnimationFrame(rotate);
  }

  function stopAutoRotation() {
    if (rotationFrame) {
      cancelAnimationFrame(rotationFrame);
      rotationFrame = null;
    }
  }

  function toggleAutoRotate() {
    if (config.autoRotate) {
      startAutoRotation();
    } else {
      stopAutoRotation();
    }
  }

  async function reloadWithConfig() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
    if (simulation) simulation.stop();
    await loadData();
    // Start auto-rotation after data loads (if 3D mode)
    if (config.use3D && config.autoRotate) {
      startAutoRotation();
    }
  }

  onMount(() => {
    (async () => {
      const { OrthographicView, OrbitView } = await import('@deck.gl/core');

      const view = config.use3D
        ? new OrbitView({
            orbitAxis: 'Y',
            controller: {
              dragMode: 'pan', // normal drag = pan
              dragPan: true, // enable panning
              dragRotate: true, // keep rotation enabled
              scrollZoom: true,
              touchZoom: true,
              touchRotate: true, // two-finger rotate on touch devices
              keyboard: true,
              inertia: 150, // smooth momentum after drag
            },
          })
        : new OrthographicView({ flipY: false, controller: true });

      const initialViewState = config.use3D
        ? {
            target: /** @type {[number, number, number]} */ ([0, 0, 0]),
            rotationX: 30,
            rotationOrbit: -30,
            zoom: -1,
            minZoom: -3,
            maxZoom: 3,
          }
        : { target: /** @type {[number, number, number]} */ ([0, 0, 0]), zoom: -1.5 };

      // Initialize current view state for auto-rotation
      currentViewState = { ...initialViewState };

      deck = new Deck({
        parent: container,
        views: view,
        initialViewState,
        onViewStateChange: handleViewStateChange,
        layers: [],
        getTooltip: ({ object }) => {
          if (!object) return null;
          return {
            html: `<div style="padding: 8px; font-family: var(--font-family-data); font-size: 11px; max-width: 280px;">
              <strong>${object.name}</strong><br/>
              <span style="color: ${colors.gray500};">${object.id}</span><br/>
              <span style="color: ${colors.gray600};">↑${object.inDegree}</span>
              <span style="color: ${colors.gray600};">↓${object.outDegree}</span>
              = ${object.connections} total
            </div>`,
            style: {
              backgroundColor: colors.white,
              border: `1px solid ${colors.black}`,
              borderRadius: '0',
            },
          };
        },
      });

      await loadData();

      // Start auto-rotation after initial load if 3D mode is enabled
      if (config.use3D && config.autoRotate) {
        startAutoRotation();
      }
    })();

    return () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      if (rotationFrame) cancelAnimationFrame(rotationFrame);
      if (simulation) simulation.stop();
      if (deck) deck.finalize();
    };
  });
</script>

<div class="network-container">
  {#if loading}
    <div class="loading">
      <p>{loadingPhase}</p>
      {#if simulationProgress > 0}
        <div class="progress-bar">
          <div class="progress" style="width: {simulationProgress}%"></div>
        </div>
        <p class="progress-text">
          {simulationProgress < 50 ? 'Warmup' : 'Refine'}: {simulationProgress}%
          {#if fps > 0}<span class="fps">{fps} fps</span>{/if}
        </p>
      {/if}
    </div>
  {/if}

  {#if error}
    <div class="error">
      <p>Error: {error}</p>
    </div>
  {/if}

  <div class="controls">
    <div class="control-group">
      <div class="control-section">
        <div class="section-title">Data</div>
        <label
          title="How to select edges: Top Connected prioritizes major players, Random samples uniformly."
        >
          <span>Sample</span>
          <select bind:value={config.sampleMode} onchange={reloadWithConfig}>
            <option value="top">Top Connected</option>
            <option value="random">Random</option>
          </select>
        </label>

        <label title="Maximum ownership relationships to load. Higher = more complete but slower.">
          <span>Max Edges</span>
          <select bind:value={config.maxEdges} onchange={reloadWithConfig}>
            <option value={25000}>25K</option>
            <option value={50000}>50K</option>
            <option value={100000}>100K</option>
          </select>
        </label>

        <label
          title="Only show entities with at least this many connections. Higher = less clutter."
        >
          <span>Min Links</span>
          <select bind:value={config.minConnections} onchange={reloadWithConfig}>
            <option value={2}>2+</option>
            <option value={5}>5+</option>
            <option value={10}>10+</option>
          </select>
        </label>
      </div>

      <div class="control-section">
        <div class="section-title">Layout</div>
        <label title="Force simulation speed. Fast renders quickly, Precise takes longer.">
          <span>Speed</span>
          <select bind:value={config.simulationSpeed} onchange={reloadWithConfig}>
            <option value="fast">Fast</option>
            <option value="slow">Precise</option>
          </select>
        </label>

        <label title="Average distance between connected nodes.">
          <span>Link Distance</span>
          <select bind:value={config.linkDistance} onchange={reloadWithConfig}>
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </label>

        <label title="Repulsive force between nodes. Higher spreads the network.">
          <span>Repulsion</span>
          <select bind:value={config.repulsion} onchange={reloadWithConfig}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label title="Gravity pulling nodes toward the center. Lower = more spread.">
          <span>Gravity</span>
          <select bind:value={config.gravity} onchange={reloadWithConfig}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label title="Visibility of connection lines between nodes.">
          <span>Edge Opacity</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            bind:value={config.edgeOpacity}
            oninput={updateLayers}
          />
        </label>
      </div>

      <div class="control-section">
        <div class="section-title">View</div>
        <label title="Enable 3D view with depth.">
          <span>3D Mode</span>
          <input type="checkbox" bind:checked={config.use3D} onchange={reloadWithConfig} />
        </label>

        {#if config.use3D}
          <label class="toggle" title="Slowly rotate the network for a cinematic view.">
            <input type="checkbox" bind:checked={config.autoRotate} onchange={toggleAutoRotate} />
            <span>Auto-Rotate</span>
          </label>

          <label title="Rotation speed in degrees per frame.">
            <span>Rotation</span>
            <input
              type="range"
              min="0.02"
              max="0.5"
              step="0.02"
              bind:value={config.rotationSpeed}
            />
          </label>
        {/if}
      </div>
    </div>
  </div>

  <div class="stats">
    <span class="primary">{stats.nodes.toLocaleString()} nodes</span>
    <span class="primary">{stats.edges.toLocaleString()} edges</span>
    <span class="secondary">/ {stats.totalEdges.toLocaleString()} total</span>
    <span class="zoom">z:{currentZoom.toFixed(1)}</span>
    {#if hoveredNode}
      <span class="hovered">{hoveredNode.name} ({hoveredNode.connections})</span>
    {/if}
  </div>

  <div class="help">
    <p>
      Click node to view •
      {config.use3D ? 'Drag to pan • Shift+drag to rotate' : 'Drag to pan'} • Scroll to zoom{config.use3D
        ? config.autoRotate
          ? ' • Auto-rotating'
          : ''
        : ''}
    </p>
    <p class="engine">d3-force-3d + deck.gl {config.use3D ? '(3D)' : '(2D)'}</p>
  </div>

  <div bind:this={container} class="deck-container" class:clickable={hoveredNode}></div>
</div>

<style>
  .network-container {
    flex: 1;
    position: relative;
    border: 1px solid var(--color-black);
    background: transparent;
    min-height: 80vh;
  }

  .deck-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .deck-container.clickable {
    cursor: pointer;
  }

  .loading,
  .error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
    background: var(--color-white);
    padding: 20px 40px;
    border: 1px solid var(--color-black);
  }

  .loading p,
  .error p {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px 0;
  }

  .error {
    color: var(--color-text-secondary);
  }

  .progress-bar {
    width: 200px;
    height: 4px;
    background: var(--color-gray-100);
    border: 1px solid var(--color-black);
  }

  .progress {
    height: 100%;
    background: var(--color-black);
    transition: width 0.1s;
  }

  .progress-text {
    font-size: 10px;
    color: var(--color-text-secondary);
    margin-top: 5px;
  }

  .progress-text .fps {
    margin-left: 10px;
    color: var(--color-text-tertiary);
  }

  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
    background: var(--color-white);
    border: 1px solid var(--color-black);
    padding: 14px;
    font-size: 11px;
    width: 260px;
    color-scheme: light;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .control-group label {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }

  .control-group label span {
    min-width: 96px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }

  .control-group select,
  .control-group input[type='range'] {
    font-family: inherit;
    font-size: 11px;
    padding: 3px 6px;
    border: 1px solid var(--color-text-tertiary);
    background: var(--color-white);
    width: 130px;
    color: var(--color-text-primary);
  }

  .control-group input[type='range'] {
    width: 130px;
  }

  .control-group .toggle {
    flex-direction: row;
    justify-content: space-between;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid var(--color-gray-100);
    margin-top: 4px;
  }

  .control-group .toggle input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: var(--color-black);
  }

  .control-group .control-section {
    display: grid;
    gap: 10px;
    border-top: 1px solid var(--color-gray-100);
    padding-top: 10px;
  }

  .control-group .control-section:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .control-group .section-title {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--color-text-tertiary);
  }

  .stats {
    position: absolute;
    top: 10px;
    left: 10px;
    z-index: 10;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    background: var(--color-white);
    padding: 8px 12px;
    border: 1px solid var(--color-black);
    max-width: 50%;
  }

  .stats .primary {
    color: var(--color-black);
    font-weight: bold;
  }

  .stats .secondary {
    color: var(--color-text-tertiary);
    font-size: 9px;
  }

  .stats .zoom {
    color: var(--color-text-secondary);
    font-family: var(--font-family-data);
    font-size: 10px;
  }

  .stats .hovered {
    color: var(--color-text-secondary);
    font-style: italic;
    text-transform: none;
    font-size: 10px;
  }

  .help {
    position: absolute;
    bottom: 10px;
    left: 10px;
    z-index: 10;
    background: rgba(255, 255, 255, 0.9);
    padding: 6px 10px;
    border: 1px solid var(--color-gray-300);
    font-size: 9px;
    color: var(--color-text-secondary);
  }

  .help p {
    margin: 0;
  }

  .help .engine {
    color: var(--color-gray-400);
    font-size: 8px;
    margin-top: 3px;
  }
</style>
