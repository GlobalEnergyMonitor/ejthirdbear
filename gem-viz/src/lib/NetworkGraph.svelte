<script>
  import { onMount, onDestroy } from 'svelte';
  import { Deck } from '@deck.gl/core';
  import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';
  // Use d3-force-3d for better performance (even in 2D mode)
  import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceX,
    forceY,
  } from 'd3-force-3d';

  // DuckDB utilities - loaded dynamically only on client
  let loadParquetFromPath, query;

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

  // Configuration - user adjustable
  let config = $state({
    maxEdges: 50000,
    minConnections: 2,
    edgeOpacity: 0.4,
    sampleMode: 'top',
    simulationSpeed: 'fast',
    warmupTicks: 100, // Synchronous warmup ticks before animation
    use3D: false, // Use 3D layout (z-axis)
  });

  // Graph data
  let nodes = [];
  let links = [];
  let nodeMap = new Map();
  let allEdgesCount = 0;

  // Simulation
  let simulation;
  let animationFrame;
  let lastFrameTime = 0;

  // Presets optimized for d3-force-3d
  const SIMULATION_PRESETS = {
    fast: {
      alphaDecay: 0.06,
      velocityDecay: 0.5,
      chargeStrength: -12,
      linkDistance: 25,
      warmupTicks: 80,
      animTicks: 60,
    },
    medium: {
      alphaDecay: 0.04,
      velocityDecay: 0.4,
      chargeStrength: -20,
      linkDistance: 35,
      warmupTicks: 120,
      animTicks: 100,
    },
    slow: {
      alphaDecay: 0.02,
      velocityDecay: 0.3,
      chargeStrength: -35,
      linkDistance: 45,
      warmupTicks: 180,
      animTicks: 150,
    },
  };

  async function loadData() {
    try {
      loading = true;
      error = null;
      loadingPhase = 'Loading parquet files...';
      console.debug('[NetworkGraph] loadData start', {
        config: JSON.parse(JSON.stringify(config)),
      });

      // Dynamic import - only load DuckDB on client
      if (!loadParquetFromPath || !query) {
        const duckdbUtils = await import('$lib/duckdb-utils');
        loadParquetFromPath = duckdbUtils.loadParquetFromPath;
        query = duckdbUtils.query;
        console.debug('[NetworkGraph] DuckDB utils loaded');
      }

      const parquetPath = '/gem-viz/all_trackers_ownership@1.parquet';
      console.debug('[NetworkGraph] Loading ownership parquet', { parquetPath });
      const ownershipResult = await loadParquetFromPath(parquetPath, 'ownership');

      if (!ownershipResult.success) {
        console.error('[NetworkGraph] Parquet load failed', ownershipResult);
        throw new Error('Failed to load ownership data: ' + ownershipResult.error);
      }

      loadingPhase = 'Counting total edges...';
      console.debug('[NetworkGraph] Counting edges');

      // The ownership table uses "GEM unit ID" for assets and "Owner GEM Entity ID" for owners
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM ownership
        WHERE "GEM unit ID" IS NOT NULL
          AND "Owner GEM Entity ID" IS NOT NULL
      `);

      allEdgesCount =
        countResult.success && countResult.data?.[0]?.total ? Number(countResult.data[0].total) : 0;

      console.debug('[NetworkGraph] Edge count result', countResult);
      console.log(`Total edges in dataset: ${allEdgesCount}`);

      loadingPhase = `Querying edges (${config.sampleMode} mode)...`;
      console.debug('[NetworkGraph] Building edge query', {
        sampleMode: config.sampleMode,
        maxEdges: config.maxEdges,
      });

      let edgeQuery;

      if (config.sampleMode === 'top') {
        // Use GEM unit ID (asset) -> Owner GEM Entity ID (owner) relationship
        edgeQuery = `
          WITH entity_counts AS (
            SELECT entity_id, COUNT(*) as cnt FROM (
              SELECT "GEM unit ID" as entity_id FROM ownership WHERE "GEM unit ID" IS NOT NULL
              UNION ALL
              SELECT "Owner GEM Entity ID" as entity_id FROM ownership WHERE "Owner GEM Entity ID" IS NOT NULL
            ) GROUP BY entity_id
          ),
          top_entities AS (
            SELECT entity_id FROM entity_counts ORDER BY cnt DESC LIMIT ${Math.ceil(config.maxEdges / 5)}
          )
          SELECT
            "GEM unit ID" as source_id,
            "Project" as source_name,
            "Owner GEM Entity ID" as target_id,
            "Owner" as target_name,
            "Share" as share
          FROM ownership
          WHERE "GEM unit ID" IS NOT NULL
            AND "Owner GEM Entity ID" IS NOT NULL
            AND ("GEM unit ID" IN (SELECT entity_id FROM top_entities)
                 OR "Owner GEM Entity ID" IN (SELECT entity_id FROM top_entities))
          LIMIT ${config.maxEdges}
        `;
      } else if (config.sampleMode === 'random') {
        edgeQuery = `
          SELECT
            "GEM unit ID" as source_id,
            "Project" as source_name,
            "Owner GEM Entity ID" as target_id,
            "Owner" as target_name,
            "Share" as share
          FROM ownership
          WHERE "GEM unit ID" IS NOT NULL
            AND "Owner GEM Entity ID" IS NOT NULL
          ORDER BY RANDOM()
          LIMIT ${config.maxEdges}
        `;
      } else {
        edgeQuery = `
          SELECT
            "GEM unit ID" as source_id,
            "Project" as source_name,
            "Owner GEM Entity ID" as target_id,
            "Owner" as target_name,
            "Share" as share
          FROM ownership
          WHERE "GEM unit ID" IS NOT NULL
            AND "Owner GEM Entity ID" IS NOT NULL
          LIMIT ${config.maxEdges}
        `;
      }

      console.debug('[NetworkGraph] Running edge query', edgeQuery);
      const edgesResult = await query(edgeQuery);

      if (!edgesResult.success || !edgesResult.data) {
        console.error('[NetworkGraph] Edge query failed', edgesResult);
        throw new Error(`Failed to query ownership edges: ${edgesResult.error || 'unknown error'}`);
      }

      console.log(`Loaded ${edgesResult.data.length} edges`);
      loadingPhase = 'Building graph structure...';
      console.debug('[NetworkGraph] First edge sample', edgesResult.data?.[0]);

      nodeMap.clear();
      links = [];

      for (const edge of edgesResult.data) {
        if (!nodeMap.has(edge.source_id)) {
          nodeMap.set(edge.source_id, {
            id: edge.source_id,
            name: edge.source_name || edge.source_id,
            connections: 0,
            inDegree: 0,
            outDegree: 0,
          });
        }
        const sourceNode = nodeMap.get(edge.source_id);
        sourceNode.connections++;
        sourceNode.outDegree++;

        if (!nodeMap.has(edge.target_id)) {
          nodeMap.set(edge.target_id, {
            id: edge.target_id,
            name: edge.target_name || edge.target_id,
            connections: 0,
            inDegree: 0,
            outDegree: 0,
          });
        }
        const targetNode = nodeMap.get(edge.target_id);
        targetNode.connections++;
        targetNode.inDegree++;

        links.push({
          source: edge.source_id,
          target: edge.target_id,
          share: edge.share || 0,
        });
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

      console.log(`Built graph: ${nodes.length} nodes, ${links.length} edges`);

      await runSimulation();
      loading = false;
    } catch (e) {
      console.error('[NetworkGraph] Error loading data:', e);
      error = `${e.name || 'Error'}: ${e.message}`;
      loading = false;
    }
  }

  function runSimulation() {
    return new Promise((resolve) => {
      loadingPhase = 'Running force simulation (d3-force-3d)...';
      console.log('Starting d3-force-3d simulation...');

      const preset = SIMULATION_PRESETS[config.simulationSpeed];
      const numDimensions = config.use3D ? 3 : 2;

      // Initialize positions - radial layout based on connectivity
      const scale = Math.sqrt(nodes.length) * 2.5;
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
            .distance(preset.linkDistance)
            .strength((d) => {
              const srcConn = nodeMap.get(d.source.id || d.source)?.connections || 1;
              const tgtConn = nodeMap.get(d.target.id || d.target)?.connections || 1;
              return 1 / Math.min(srcConn, tgtConn);
            })
        )
        .force(
          'charge',
          forceManyBody()
            .strength((d) => preset.chargeStrength * Math.sqrt(d.connections || 1))
            .theta(0.9)
            .distanceMax(180)
        )
        .force('center', forceCenter(0, 0))
        .force('x', forceX(0).strength(0.015))
        .force('y', forceY(0).strength(0.015))
        .alphaDecay(preset.alphaDecay)
        .velocityDecay(preset.velocityDecay);

      // WARMUP: Run ticks synchronously for fast initial layout
      loadingPhase = `Warmup: computing initial layout...`;
      console.log(`Running ${preset.warmupTicks} warmup ticks synchronously...`);

      const warmupStart = performance.now();
      simulation.alpha(1);

      for (let i = 0; i < preset.warmupTicks; i++) {
        simulation.tick();
        if (i % 20 === 0) {
          simulationProgress = Math.round((i / preset.warmupTicks) * 50);
        }
      }

      const warmupTime = performance.now() - warmupStart;
      console.log(`Warmup complete in ${warmupTime.toFixed(0)}ms`);

      // Show initial state
      updateLayers();
      simulationProgress = 50;

      // ANIMATE: Continue with animated ticks
      loadingPhase = 'Refining layout...';
      let tickCount = 0;
      const maxAnimTicks = preset.animTicks;

      function animate() {
        if (!simulation || tickCount >= maxAnimTicks || simulation.alpha() < 0.01) {
          console.log(`Animation complete after ${tickCount} ticks`);
          simulationProgress = 100;
          loadingPhase = 'Complete';
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

    // Node size scaling
    const nodeScale = Math.pow(2, -currentZoom * 0.25);

    deck.setProps({
      layers: [
        // Edges - hidden at very low zoom for perf
        currentZoom > -3.5 &&
          new LineLayer({
            id: 'edges',
            data: lineData,
            getSourcePosition: (d) => [d.source.x, d.source.y, config.use3D ? (d.source.z || 0) : 0],
            getTargetPosition: (d) => [d.target.x, d.target.y, config.use3D ? (d.target.z || 0) : 0],
            getColor: (d) => {
              const shareAlpha = Math.min(255, Math.max(15, (d.share || 8) * 2.2));
              return [70, 70, 70, Math.round(shareAlpha * edgeOpacity)];
            },
            getWidth: 1,
            widthMinPixels: 0.5,
            widthMaxPixels: 2,
            pickable: false,
            updateTriggers: { getColor: [edgeOpacity] },
          }),

        // Nodes
        new ScatterplotLayer({
          id: 'nodes',
          data: nodes,
          getPosition: (d) => [d.x || 0, d.y || 0, config.use3D ? (d.z || 0) : 0],
          getRadius: (d) => {
            const baseSize = Math.max(2, Math.log2(d.connections + 1) * 2.8);
            return baseSize * nodeScale;
          },
          getFillColor: (d) => {
            // Purple -> Orange -> Red gradient by connection count
            const t = Math.min(1, d.connections / 80);
            const r = Math.round(90 + t * 165);
            const g = Math.round(50 + t * 50 - t * t * 80);
            const b = Math.round(240 - t * 200);
            return [r, g, b, 215];
          },
          radiusMinPixels: 1.5,
          radiusMaxPixels: 35,
          pickable: true,
          onHover: ({ object }) => {
            hoveredNode = object;
          },
          autoHighlight: true,
          highlightColor: [255, 220, 0, 255],
          updateTriggers: { getRadius: [nodeScale] },
        }),
      ].filter(Boolean),
    });
  }

  function handleViewStateChange({ viewState }) {
    currentZoom = viewState.zoom;
    updateLayers();
  }

  async function reloadWithConfig() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (simulation) simulation.stop();
    await loadData();
  }

  onMount(async () => {
    const { OrthographicView, OrbitView } = await import('@deck.gl/core');

    const view = config.use3D
      ? new OrbitView({ orbitAxis: 'Y' })
      : new OrthographicView({ flipY: false });

    const initialViewState = config.use3D
      ? { target: [0, 0, 0], rotationX: 30, rotationOrbit: -30, zoom: -1, minZoom: -3, maxZoom: 3 }
      : { target: [0, 0, 0], zoom: -1.5 };

    deck = new Deck({
      parent: container,
      views: view,
      initialViewState,
      // 3D: drag=rotate, shift+drag=pan, scroll=zoom (laptop-friendly)
      // 2D: drag=pan, scroll=zoom
      controller: true,
      onViewStateChange: handleViewStateChange,
      layers: [],
      getTooltip: ({ object }) => {
        if (!object) return null;
        return {
          html: `<div style="padding: 8px; font-family: monospace; font-size: 11px; max-width: 280px;">
            <strong>${object.name}</strong><br/>
            <span style="color: #888;">${object.id}</span><br/>
            <span style="color: #5a5;">↑${object.inDegree}</span>
            <span style="color: #a55;">↓${object.outDegree}</span>
            = ${object.connections} total
          </div>`,
          style: {
            backgroundColor: '#fff',
            border: '1px solid #000',
            borderRadius: '0',
          },
        };
      },
    });

    await loadData();
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (simulation) simulation.stop();
    if (deck) deck.finalize();
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
      <label>
        <span>Max Edges</span>
        <select bind:value={config.maxEdges} onchange={reloadWithConfig}>
          <option value={10000}>10K</option>
          <option value={25000}>25K</option>
          <option value={50000}>50K</option>
          <option value={100000}>100K</option>
          <option value={200000}>200K</option>
        </select>
      </label>

      <label>
        <span>Sample</span>
        <select bind:value={config.sampleMode} onchange={reloadWithConfig}>
          <option value="top">Top Connected</option>
          <option value="random">Random</option>
          <option value="all">Sequential</option>
        </select>
      </label>

      <label>
        <span>Min Connections</span>
        <select bind:value={config.minConnections} onchange={reloadWithConfig}>
          <option value={1}>1+</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={5}>5+</option>
          <option value={10}>10+</option>
        </select>
      </label>

      <label>
        <span>Speed</span>
        <select bind:value={config.simulationSpeed} onchange={reloadWithConfig}>
          <option value="fast">Fast</option>
          <option value="medium">Medium</option>
          <option value="slow">Precise</option>
        </select>
      </label>

      <label>
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

      <label class="toggle">
        <input
          type="checkbox"
          bind:checked={config.use3D}
          onchange={reloadWithConfig}
        />
        <span>3D Mode</span>
      </label>
    </div>
  </div>

  <div class="stats">
    <span class="primary">{stats.nodes.toLocaleString()} nodes</span>
    <span class="primary">{stats.edges.toLocaleString()} edges</span>
    <span class="secondary">/ {stats.totalEdges.toLocaleString()} total</span>
    <span class="zoom">z:{currentZoom.toFixed(1)}</span>
    {#if hoveredNode}
      <span class="hovered">→ {hoveredNode.name} ({hoveredNode.connections})</span>
    {/if}
  </div>

  <div class="help">
    <p>{config.use3D ? 'Drag to rotate • Shift+drag to pan' : 'Drag to pan'} • Scroll to zoom</p>
    <p class="engine">d3-force-3d + deck.gl {config.use3D ? '(3D)' : '(2D)'}</p>
  </div>

  <div bind:this={container} class="deck-container"></div>
</div>

<style>
  .network-container {
    flex: 1;
    position: relative;
    border: 1px solid #000;
    background: #fafafa;
    min-height: 600px;
  }

  .deck-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading,
  .error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
    background: white;
    padding: 20px 40px;
    border: 1px solid #000;
  }

  .loading p,
  .error p {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 10px 0;
  }

  .error {
    color: red;
  }

  .progress-bar {
    width: 200px;
    height: 4px;
    background: #eee;
    border: 1px solid #000;
  }

  .progress {
    height: 100%;
    background: #000;
    transition: width 0.1s;
  }

  .progress-text {
    font-size: 10px;
    color: #666;
    margin-top: 5px;
  }

  .progress-text .fps {
    margin-left: 10px;
    color: #999;
  }

  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 10;
    background: white;
    border: 1px solid #000;
    padding: 10px;
    font-size: 10px;
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .control-group label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-group label span {
    min-width: 80px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .control-group select,
  .control-group input[type='range'] {
    font-family: inherit;
    font-size: 10px;
    padding: 2px 4px;
    border: 1px solid #999;
    background: white;
  }

  .control-group input[type='range'] {
    width: 60px;
  }

  .control-group .toggle {
    flex-direction: row-reverse;
    justify-content: flex-end;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid #eee;
    margin-top: 4px;
  }

  .control-group .toggle input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: #000;
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
    background: white;
    padding: 8px 12px;
    border: 1px solid #000;
    max-width: 50%;
  }

  .stats .primary {
    color: #000;
    font-weight: bold;
  }

  .stats .secondary {
    color: #999;
    font-size: 9px;
  }

  .stats .zoom {
    color: #666;
    font-family: monospace;
    font-size: 10px;
  }

  .stats .hovered {
    color: #666;
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
    border: 1px solid #ccc;
    font-size: 9px;
    color: #666;
  }

  .help p {
    margin: 0;
  }

  .help .engine {
    color: #aaa;
    font-size: 8px;
    margin-top: 3px;
  }
</style>
