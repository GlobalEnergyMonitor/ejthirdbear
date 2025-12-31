<script>
  import { onMount, onDestroy } from 'svelte';
  import { assetPath, assetLink, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import { Deck } from '@deck.gl/core';
  import { ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
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
  let focusLevel = $state('balanced');
  let flowerIconSize = $state(64);

  // Configuration - user adjustable
  let config = $state({
    maxEdges: 50000,
    minConnections: 3,
    edgeOpacity: 0.4,
    sampleMode: 'top',
    simulationSpeed: 'fast',
    warmupTicks: 100, // Synchronous warmup ticks before animation
    use3D: true, // Use 3D layout (z-axis)
    autoRotate: true, // Auto-rotate in 3D mode
    rotationSpeed: 0.15, // Degrees per frame (~9°/sec at 60fps)
    layoutScale: 10, // Visual spacing multiplier
    highlightHops: 1, // Number of hops to highlight on hover
    useFlowerNodes: true,
  });

  // Auto-rotation state
  let rotationFrame;
  let currentViewState = null; // Track view state for camera rotation
  let orbitView;
  let orthoView;
  let autoRotateResumeTimeout;
  let autoRotatePaused = $state(false);
  let rotationVelocity = 0;

  // Graph data
  let nodes = [];
  let links = [];
  let nodeMap = new Map();
  let allEdgesCount = 0;

  // Adjacency list for hop traversal
  let adjacencyMap = new Map();

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

  const FOCUS_PRESETS = {
    major: { minConnections: 10, maxEdges: 25000, sampleMode: 'top' },
    balanced: { minConnections: 3, maxEdges: 50000, sampleMode: 'top' },
    expansive: { minConnections: 1, maxEdges: 100000, sampleMode: 'random' },
  };

  const DEFAULT_VIEW_STATE_3D = {
    target: /** @type {[number, number, number]} */ ([0, 0, 0]),
    rotationX: 30,
    rotationOrbit: -30,
    zoom: -2,
    minZoom: -4,
    maxZoom: 3,
  };

  const DEFAULT_VIEW_STATE_2D = {
    target: /** @type {[number, number, number]} */ ([0, 0, 0]),
    zoom: -2.3,
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

      const parquetPath = assetPath('all_trackers_ownership@1.parquet');
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
        const sourceId = String(edge.source_id || '').trim();
        const targetId = String(edge.target_id || '').trim();
        if (!sourceId || !targetId) continue;

        if (!nodeMap.has(sourceId)) {
          nodeMap.set(sourceId, {
            id: sourceId,
            name: edge.source_name || sourceId,
            connections: 0,
            inDegree: 0,
            outDegree: 0,
          });
        }
        const sourceNode = nodeMap.get(sourceId);
        sourceNode.connections++;
        sourceNode.outDegree++;

        if (!nodeMap.has(targetId)) {
          nodeMap.set(targetId, {
            id: targetId,
            name: edge.target_name || targetId,
            connections: 0,
            inDegree: 0,
            outDegree: 0,
          });
        }
        const targetNode = nodeMap.get(targetId);
        targetNode.connections++;
        targetNode.inDegree++;

        links.push({
          source: sourceId,
          target: targetId,
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

      // Build adjacency map for hop traversal
      adjacencyMap.clear();
      for (const link of links) {
        const srcId = link.source;
        const tgtId = link.target;
        if (!adjacencyMap.has(srcId)) adjacencyMap.set(srcId, new Set());
        if (!adjacencyMap.has(tgtId)) adjacencyMap.set(tgtId, new Set());
        adjacencyMap.get(srcId).add(tgtId);
        adjacencyMap.get(tgtId).add(srcId);
      }

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

  // Get all node IDs within N hops of a starting node
  function getNodesWithinHops(startId, maxHops = 3) {
    const visited = new Set([startId]);
    let frontier = [startId];

    for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
      const nextFrontier = [];
      for (const nodeId of frontier) {
        const neighbors = adjacencyMap.get(nodeId);
        if (neighbors) {
          for (const neighborId of neighbors) {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              nextFrontier.push(neighborId);
            }
          }
        }
      }
      frontier = nextFrontier;
    }

    return visited;
  }

  function updateLayers() {
    if (!deck) return;

    // Simple position getter - explicitly typed for deck.gl
    /** @type {(d: any) => [number, number, number]} */
    const getPos = (d) => {
      const scale = config.layoutScale || 1;
      return [(d.x || 0) * scale, (d.y || 0) * scale, (config.use3D ? d.z || 0 : 0) * scale];
    };

    // Compute visible nodes based on hover (N hops from hovered node)
    const visibleNodeIds = hoveredNode
      ? getNodesWithinHops(hoveredNode.id, config.highlightHops)
      : null; // null means show all

    // Build line data from resolved links
    const lineData = [];
    for (const link of links) {
      const source = typeof link.source === 'object' ? link.source : nodeMap.get(link.source);
      const target = typeof link.target === 'object' ? link.target : nodeMap.get(link.target);
      if (source && target && source.x != null && target.x != null) {
        // Skip edges not connected to visible nodes when filtering
        if (visibleNodeIds && !visibleNodeIds.has(source.id) && !visibleNodeIds.has(target.id)) {
          continue;
        }

        const sourcePos = getPos(source);
        const targetPos = getPos(target);
        const dx = targetPos[0] - sourcePos[0];
        const dy = targetPos[1] - sourcePos[1];
        const distance = Math.hypot(dx, dy) || 1;
        const bend = Math.min(60, distance * 0.12);
        const normX = -dy / distance;
        const normY = dx / distance;
        const midZ = (sourcePos[2] + targetPos[2]) / 2;
        const mid = [
          (sourcePos[0] + targetPos[0]) / 2 + normX * bend,
          (sourcePos[1] + targetPos[1]) / 2 + normY * bend,
          config.use3D ? midZ + bend * 0.2 : 0,
        ];

        // Check if this edge connects two visible nodes (fully visible) or just one (dimmed)
        const fullyVisible =
          !visibleNodeIds || (visibleNodeIds.has(source.id) && visibleNodeIds.has(target.id));

        lineData.push({
          path: [sourcePos, mid, targetPos],
          share: link.share || 0,
          sourceId: source.id,
          targetId: target.id,
          fullyVisible,
        });
      }
    }

    // LOD-based opacity
    const baseOpacity = config.edgeOpacity;
    const zoomFactor = Math.max(0.1, Math.min(1, (currentZoom + 2) / 4));
    const edgeOpacity = currentZoom < -1 ? baseOpacity * 0.25 : baseOpacity * zoomFactor;

    // Node size scaling
    const nodeScale = Math.pow(2, -currentZoom * 0.25);

    const useFlowers = config.useFlowerNodes;
    const flowerNodes = useFlowers ? nodes.filter((n) => n.id?.startsWith('E')) : [];
    const circleNodes = useFlowers ? nodes.filter((n) => !n.id?.startsWith('E')) : nodes;

    deck.setProps({
      layers: [
        // Edges - rendered behind nodes with depth test enabled
        currentZoom > -3.5 &&
          new PathLayer({
            id: 'edges',
            data: lineData,
            getPath: (d) => d.path,
            getColor: (d) => {
              const t = Math.min(1, Math.max(0, d.share / 100));
              // Gray edges, darker with higher ownership share
              const gray = Math.round(160 - t * 80); // 160 -> 80
              // Dim edges that aren't fully within the visible subgraph
              const visibilityMult = d.fullyVisible ? 1 : 0.15;
              const alpha = Math.round((80 + t * 100) * edgeOpacity * visibilityMult);
              return [gray, gray, gray, alpha];
            },
            // Width scaled by ownership share: 0.1 to 4px
            getWidth: (d) => {
              const share = Math.max(0, Math.min(100, d.share || 0));
              return 0.1 + (share / 100) * 3.9;
            },
            widthUnits: 'pixels',
            widthMinPixels: 0.1,
            widthMaxPixels: 4,
            opacity: edgeOpacity,
            pickable: false,
            parameters: {
              depthTest: true, // Edges respect depth
            },
            updateTriggers: {
              getColor: [edgeOpacity, hoveredNode?.id],
              getWidth: [edgeOpacity],
            },
          }),

        useFlowers &&
          new IconLayer({
            id: 'flower-nodes',
            data: flowerNodes,
            autoPacking: true,
            getPosition: (d) => getPos(d),
            getIcon: (d) => {
              const filename = d?.id ? `${d.id}.svg` : 'default.svg';
              return {
                url: assetPath(`flowers/${filename}`),
                width: flowerIconSize,
                height: flowerIconSize,
                anchorX: flowerIconSize / 2,
                anchorY: flowerIconSize / 2,
                mask: false,
              };
            },
            sizeUnits: 'pixels',
            getSize: (d) => {
              const baseSize = Math.max(6, Math.log2(d.connections + 1) * 3.5);
              return baseSize * nodeScale;
            },
            sizeMinPixels: 6,
            sizeMaxPixels: 32,
            billboard: true,
            pickable: true,
            // Disable depth test so icons always render on top of edges
            parameters: {
              depthTest: false,
            },
            onHover: ({ object }) => {
              hoveredNode = object;
              updateLayers();
            },
            onClick: ({ object }) => {
              if (object) {
                const isAsset = object.id.startsWith('G');
                goto(isAsset ? assetLink(object.id) : entityLink(object.id));
              }
            },
            autoHighlight: true,
            highlightColor: [255, 220, 0, 255],
            getColor: (d) => {
              const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
              return [255, 255, 255, isVisible ? 255 : 20];
            },
            updateTriggers: {
              getSize: [nodeScale, flowerIconSize],
              getIcon: [flowerIconSize],
              getColor: [hoveredNode?.id],
            },
          }),

        // Nodes - rendered on top with depth test disabled
        new ScatterplotLayer({
          id: 'nodes',
          data: circleNodes,
          getPosition: (d) => getPos(d),
          billboard: true,
          getRadius: (d) => {
            const baseSize = Math.max(2, Math.log2(d.connections + 1) * 2.8);
            return baseSize * nodeScale;
          },
          getFillColor: (d) => {
            const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
            if (config.useFlowerNodes) {
              const alpha = isVisible ? 160 : 16;
              return [130, 130, 130, alpha];
            }
            // Purple -> Orange -> Red gradient by connection count
            const t = Math.min(1, d.connections / 80);
            const r = Math.round(90 + t * 165);
            const g = Math.round(50 + t * 50 - t * t * 80);
            const b = Math.round(240 - t * 200);
            const alpha = isVisible ? 255 : 20;
            return [r, g, b, alpha];
          },
          // Stroke/outline to make nodes pop
          stroked: true,
          getLineColor: (d) => {
            const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
            if (config.useFlowerNodes) {
              return isVisible ? [255, 255, 255, 120] : [255, 255, 255, 10];
            }
            return isVisible ? [255, 255, 255, 200] : [255, 255, 255, 15];
          },
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 2,
          radiusMinPixels: 2,
          radiusMaxPixels: 40,
          pickable: true,
          // Disable depth test so nodes always render on top of edges
          parameters: {
            depthTest: false,
          },
          onHover: ({ object }) => {
            hoveredNode = object;
            updateLayers(); // Re-render to show/hide based on hover
          },
          onClick: ({ object }) => {
            if (object) {
              // Assets start with G, entities with E
              const isAsset = object.id.startsWith('G');
              goto(isAsset ? assetLink(object.id) : entityLink(object.id));
            }
          },
          autoHighlight: true,
          highlightColor: [255, 220, 0, 255],
          updateTriggers: {
            getRadius: [nodeScale],
            getFillColor: [hoveredNode?.id],
            getLineColor: [hoveredNode?.id],
          },
        }),
      ].filter(Boolean),
    });
  }

  function scheduleAutoRotateResume() {
    if (autoRotateResumeTimeout) clearTimeout(autoRotateResumeTimeout);
    if (!config.autoRotate) return;
    autoRotateResumeTimeout = setTimeout(() => {
      if (!hoveredNode) {
        autoRotatePaused = false;
        startAutoRotation();
      }
    }, 4500);
  }

  function handleViewStateChange({ viewState, interactionState }) {
    currentZoom = viewState.zoom;
    currentViewState = { ...viewState };
    const isInteracting =
      interactionState?.isDragging ||
      interactionState?.isPanning ||
      interactionState?.isRotating ||
      interactionState?.isZooming;

    if (config.use3D && config.autoRotate && isInteracting) {
      autoRotatePaused = true;
      rotationVelocity = 0;
      stopAutoRotation();
      scheduleAutoRotateResume();
    }
    updateLayers();
  }

  function startAutoRotation() {
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
    if (!config.use3D || !config.autoRotate || autoRotatePaused || !deck) return;

    console.log('[NetworkGraph] Starting camera auto-rotation');
    const startTime = performance.now();

    function rotate() {
      if (
        !config.autoRotate ||
        !config.use3D ||
        !deck ||
        !currentViewState ||
        autoRotatePaused ||
        hoveredNode
      ) {
        console.log('[NetworkGraph] Stopping auto-rotation');
        rotationFrame = null;
        return;
      }

      // Ease rotation velocity for smoother start/stop with gentle drift
      const t = (performance.now() - startTime) / 1000;
      const wave = 0.85 + 0.15 * Math.sin(t * 0.6);
      const targetSpeed = config.rotationSpeed * wave;
      rotationVelocity = rotationVelocity + (targetSpeed - rotationVelocity) * 0.05;

      // Increment orbit rotation
      const newOrbit = ((currentViewState.rotationOrbit || 0) + rotationVelocity) % 360;

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
      autoRotatePaused = false;
      rotationVelocity = 0;
      startAutoRotation();
    } else {
      autoRotatePaused = false;
      stopAutoRotation();
    }
  }

  $effect(() => {
    if (!config.use3D || !config.autoRotate) return;
    if (hoveredNode) {
      autoRotatePaused = true;
      rotationVelocity = 0;
      stopAutoRotation();
      scheduleAutoRotateResume();
    }
  });

  function applyFocusPreset() {
    const preset = FOCUS_PRESETS[focusLevel];
    if (!preset) return;
    config.minConnections = preset.minConnections;
    config.maxEdges = preset.maxEdges;
    config.sampleMode = preset.sampleMode;
    reloadWithConfig();
  }

  function markCustom() {
    focusLevel = 'custom';
  }

  function applyViewMode() {
    if (!deck) return;
    const nextViewState = config.use3D ? DEFAULT_VIEW_STATE_3D : DEFAULT_VIEW_STATE_2D;
    currentViewState = { ...nextViewState };
    currentZoom = nextViewState.zoom ?? currentZoom;
    deck.setProps({
      views: config.use3D ? orbitView : orthoView,
      initialViewState: currentViewState,
    });
  }

  async function reloadWithConfig() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
    if (simulation) simulation.stop();
    applyViewMode();
    await loadData();
    // Start auto-rotation after data loads (if 3D mode)
    if (config.use3D && config.autoRotate) {
      startAutoRotation();
    }
  }

  onMount(async () => {
    const { OrthographicView, OrbitView } = await import('@deck.gl/core');

    orbitView = new OrbitView({
      orbitAxis: 'Y',
      controller: {
        dragMode: 'pan', // normal drag = pan
        dragPan: true, // enable panning
        dragRotate: true, // enable rotation (shift+drag when dragMode='pan')
        scrollZoom: { speed: 0.08, smooth: true },
        touchZoom: true,
        touchRotate: true, // two-finger rotate on touch devices
        doubleClickZoom: false,
        keyboard: true,
        inertia: 120, // smooth momentum after drag
      },
    });
    orthoView = new OrthographicView({
      flipY: false,
      controller: {
        dragPan: true,
        scrollZoom: { speed: 0.1, smooth: true },
        touchZoom: true,
        doubleClickZoom: false,
        keyboard: true,
        inertia: 100,
      },
    });

    const initialViewState = config.use3D ? DEFAULT_VIEW_STATE_3D : DEFAULT_VIEW_STATE_2D;

    // Initialize current view state for auto-rotation
    currentViewState = { ...initialViewState };

    deck = new Deck({
      parent: container,
      views: config.use3D ? orbitView : orthoView,
      initialViewState,
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

    // Start auto-rotation after initial load if 3D mode is enabled
    if (config.use3D && config.autoRotate) {
      startAutoRotation();
    }
  });

  onDestroy(() => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (rotationFrame) cancelAnimationFrame(rotationFrame);
    if (autoRotateResumeTimeout) clearTimeout(autoRotateResumeTimeout);
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
    <div class="control-group primary">
      <label class="toggle emphasis" title="Enable 3D view with depth. Shift+drag to orbit.">
        <input type="checkbox" bind:checked={config.use3D} onchange={reloadWithConfig} />
        <span>3D Exploration</span>
      </label>

      {#if config.use3D}
        <label class="toggle" title="Slowly rotate the network for a cinematic view.">
          <input type="checkbox" bind:checked={config.autoRotate} onchange={toggleAutoRotate} />
          <span>Auto-Rotate</span>
        </label>
      {/if}

      <label title="Controls density and clutter.">
        <span>Focus</span>
        <select bind:value={focusLevel} onchange={applyFocusPreset}>
          <option value="major">Major Players</option>
          <option value="balanced">Balanced</option>
          <option value="expansive">Expansive</option>
          <option value="custom">Custom</option>
        </select>
      </label>
    </div>

    <details class="advanced">
      <summary>Tuning</summary>
      <div class="control-group">
        <label title="Maximum ownership relationships to load. Higher = more complete but slower.">
          <span>Max Edges</span>
          <select
            bind:value={config.maxEdges}
            onchange={() => {
              markCustom();
              reloadWithConfig();
            }}
          >
            <option value={10000}>10K</option>
            <option value={25000}>25K</option>
            <option value={50000}>50K</option>
            <option value={100000}>100K</option>
            <option value={200000}>200K</option>
          </select>
        </label>

        <label
          title="How to select edges: Top Connected prioritizes major players, Random samples uniformly, Sequential takes first N."
        >
          <span>Sample</span>
          <select
            bind:value={config.sampleMode}
            onchange={() => {
              markCustom();
              reloadWithConfig();
            }}
          >
            <option value="top">Top Connected</option>
            <option value="random">Random</option>
            <option value="all">Sequential</option>
          </select>
        </label>

        <label
          title="Only show entities with at least this many connections. Higher = less clutter, major players only."
        >
          <span>Min Connections</span>
          <select
            bind:value={config.minConnections}
            onchange={() => {
              markCustom();
              reloadWithConfig();
            }}
          >
            <option value={1}>1+</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={5}>5+</option>
            <option value={10}>10+</option>
          </select>
        </label>

        <label
          title="Force simulation speed. Fast renders quickly, Precise takes longer but produces cleaner layouts."
        >
          <span>Speed</span>
          <select
            bind:value={config.simulationSpeed}
            onchange={() => {
              markCustom();
              reloadWithConfig();
            }}
          >
            <option value="fast">Fast</option>
            <option value="medium">Medium</option>
            <option value="slow">Precise</option>
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
            oninput={() => {
              markCustom();
              updateLayers();
            }}
          />
        </label>

        <label class="toggle" title="Use data-driven flower icons for entity nodes (if prebaked).">
          <input type="checkbox" bind:checked={config.useFlowerNodes} oninput={updateLayers} />
          <span>Flowers</span>
        </label>

        <label title="Number of connection hops to highlight when hovering a node.">
          <span>Hover Hops</span>
          <select bind:value={config.highlightHops} onchange={updateLayers}>
            <option value={1}>1 hop</option>
            <option value={2}>2 hops</option>
            <option value={3}>3 hops</option>
            <option value={5}>5 hops</option>
          </select>
        </label>

        <label title="Spread nodes farther apart without re-running the simulation.">
          <span>Spacing</span>
          <input
            type="range"
            min="1"
            max="15"
            step="1"
            bind:value={config.layoutScale}
            oninput={updateLayers}
          />
        </label>

        {#if config.use3D}
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
    </details>
  </div>

  <div class="stats">
    <span class="primary">{stats.nodes.toLocaleString()} nodes</span>
    <span class="primary">{stats.edges.toLocaleString()} edges</span>
    <span class="secondary">/ {stats.totalEdges.toLocaleString()} total</span>
    <span class="mode">{config.use3D ? '3D view' : '2D view'}</span>
    {#if hoveredNode}
      <span class="hovered">{hoveredNode.name} ({hoveredNode.connections})</span>
    {/if}
  </div>

  <div class="help">
    <p>
      Click node to view • Drag to pan • Scroll to zoom{config.use3D
        ? ' • Shift+drag to rotate' + (config.autoRotate ? ' • Auto-rotation pauses on drag' : '')
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
    border: 1px solid #111;
    background: radial-gradient(circle at 20% 10%, #f7f7f7 0%, #ffffff 45%, #f3f3f3 100%);
    min-height: 600px;
    box-shadow:
      inset 0 0 0 1px #fff,
      0 10px 30px rgba(0, 0, 0, 0.04);
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
    background: #fff;
    padding: 20px 40px;
    border: 1px solid #111;
    box-shadow: 0 12px 26px rgba(0, 0, 0, 0.08);
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
    border: 1px solid #111;
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
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid #111;
    padding: 10px;
    font-size: 10px;
    min-width: 190px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
  }

  .control-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .control-group label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .control-group label span {
    min-width: 72px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .control-group select,
  .control-group input[type='range'] {
    font-family: inherit;
    font-size: 10px;
    padding: 3px 6px;
    border: 1px solid #c2c2c2;
    border-radius: 4px;
    background: #fff;
    color: #111;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  .control-group select:focus,
  .control-group input[type='range']:focus {
    outline: none;
    border-color: #111;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25);
  }

  .control-group input[type='range'] {
    width: 74px;
  }

  .control-group .toggle {
    flex-direction: row-reverse;
    justify-content: flex-end;
    gap: 6px;
  }

  .control-group.primary .toggle {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }

  .control-group .toggle input[type='checkbox'] {
    width: 14px;
    height: 14px;
    accent-color: #000;
  }

  .control-group.primary .toggle.emphasis span {
    font-weight: 700;
    color: #000;
    font-size: 11px;
  }

  .controls .advanced {
    margin-top: 8px;
    border-top: 1px solid #eee;
    padding-top: 6px;
  }

  .controls .advanced summary {
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #666;
    font-size: 9px;
    list-style: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .controls .advanced summary::before {
    content: '+';
    display: inline-flex;
    width: 12px;
    height: 12px;
    border: 1px solid #bbb;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: #666;
  }

  .controls .advanced[open] summary {
    color: #000;
  }

  .controls .advanced[open] summary::before {
    content: '-';
    border-color: #111;
    color: #111;
  }

  .controls .advanced .control-group {
    margin-top: 8px;
    gap: 5px;
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
    background: rgba(255, 255, 255, 0.95);
    padding: 8px 12px;
    border: 1px solid #111;
    max-width: 50%;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
  }

  .stats .primary {
    color: #000;
    font-weight: bold;
  }

  .stats .secondary {
    color: #999;
    font-size: 9px;
  }

  .stats .mode {
    color: #666;
    font-weight: bold;
    font-size: 9px;
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
    background: rgba(255, 255, 255, 0.92);
    padding: 6px 10px;
    border: 1px solid #ccc;
    font-size: 9px;
    color: #666;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.05);
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
