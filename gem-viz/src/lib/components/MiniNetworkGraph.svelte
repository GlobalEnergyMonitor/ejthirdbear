<script>
  /**
   * MiniNetworkGraph - Focused 3D network visualization for entity pages
   * Shows the ownership network neighborhood around a specific entity
   */
  import { onMount, onDestroy } from 'svelte';
  import { assetPath, assetLink, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import { Deck } from '@deck.gl/core';
  import { ScatterplotLayer, PathLayer, IconLayer } from '@deck.gl/layers';
  import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceX,
    forceY,
  } from 'd3-force-3d';

  // Props
  let { entityId = '', entityName: _entityName = '', maxHops = 2, height = 300 } = $props();

  // DuckDB utilities
  let loadParquetFromPath, query;

  // State
  let container;
  let deck;
  let loading = $state(true);
  let error = $state(null);
  let stats = $state({ nodes: 0, edges: 0 });
  let hoveredNode = $state(null);
  let currentZoom = $state(-1.5);
  let hoverFrame;
  let hoverTimeout;

  // Graph data
  let nodes = [];
  let links = [];
  let nodeMap = new Map();
  let adjacencyMap = new Map();

  // Simulation
  let simulation;

  /** @type {import('@deck.gl/core').OrbitViewState} */
  const VIEW_STATE = {
    target: [0, 0, 0],
    rotationX: 25,
    rotationOrbit: -20,
    zoom: -1.8,
    minZoom: -4,
    maxZoom: 2,
  };

  async function loadData() {
    if (!entityId) return;

    try {
      loading = true;
      error = null;

      // Dynamic import DuckDB
      if (!loadParquetFromPath || !query) {
        const duckdbUtils = await import('$lib/duckdb-utils');
        loadParquetFromPath = duckdbUtils.loadParquetFromPath;
        query = duckdbUtils.query;
      }

      const parquetPath = assetPath('all_trackers_ownership@1.parquet');
      const ownershipResult = await loadParquetFromPath(parquetPath, 'ownership');

      if (!ownershipResult.success) {
        throw new Error('Failed to load ownership data');
      }

      // Query edges connected to this entity (and their neighbors up to maxHops)
      // First, get direct connections
      const directQuery = `
        SELECT
          "GEM unit ID" as source_id,
          "Project" as source_name,
          "Owner GEM Entity ID" as target_id,
          "Owner" as target_name,
          "Share" as share
        FROM ownership
        WHERE "GEM unit ID" IS NOT NULL
          AND "Owner GEM Entity ID" IS NOT NULL
          AND "Owner GEM Entity ID" = '${entityId}'
      `;

      const directResult = await query(directQuery);
      if (!directResult.success) throw new Error('Query failed');

      // Build initial graph from direct connections
      const seenNodes = new Set([entityId]);
      const allEdges = [];

      for (const edge of directResult.data || []) {
        seenNodes.add(edge.source_id);
        seenNodes.add(edge.target_id);
        allEdges.push(edge);
      }

      // Expand to additional hops if needed
      if (maxHops > 1 && seenNodes.size > 1) {
        const nodeList = Array.from(seenNodes).filter((id) => id !== entityId);
        if (nodeList.length > 0) {
          // Get edges where these assets connect to other owners
          const expandQuery = `
            SELECT DISTINCT
              "GEM unit ID" as source_id,
              "Project" as source_name,
              "Owner GEM Entity ID" as target_id,
              "Owner" as target_name,
              "Share" as share
            FROM ownership
            WHERE "GEM unit ID" IS NOT NULL
              AND "Owner GEM Entity ID" IS NOT NULL
              AND "GEM unit ID" IN (${nodeList.map((id) => `'${id}'`).join(',')})
            LIMIT 500
          `;
          const expandResult = await query(expandQuery);
          if (expandResult.success && expandResult.data) {
            for (const edge of expandResult.data) {
              seenNodes.add(edge.source_id);
              seenNodes.add(edge.target_id);
              allEdges.push(edge);
            }
          }
        }
      }

      // Build node map and links
      nodeMap.clear();
      links = [];

      for (const edge of allEdges) {
        if (!nodeMap.has(edge.source_id)) {
          nodeMap.set(edge.source_id, {
            id: edge.source_id,
            name: edge.source_name || edge.source_id,
            connections: 0,
            isTarget: edge.source_id === entityId,
          });
        }
        nodeMap.get(edge.source_id).connections++;

        if (!nodeMap.has(edge.target_id)) {
          nodeMap.set(edge.target_id, {
            id: edge.target_id,
            name: edge.target_name || edge.target_id,
            connections: 0,
            isTarget: edge.target_id === entityId,
          });
        }
        nodeMap.get(edge.target_id).connections++;

        links.push({
          source: edge.source_id,
          target: edge.target_id,
          share: edge.share || 0,
        });
      }

      // Dedupe links
      const linkSet = new Set();
      links = links.filter((l) => {
        const key = `${l.source}-${l.target}`;
        if (linkSet.has(key)) return false;
        linkSet.add(key);
        return true;
      });

      nodes = Array.from(nodeMap.values());

      // Build adjacency for hover
      adjacencyMap.clear();
      for (const link of links) {
        if (!adjacencyMap.has(link.source)) adjacencyMap.set(link.source, new Set());
        if (!adjacencyMap.has(link.target)) adjacencyMap.set(link.target, new Set());
        adjacencyMap.get(link.source).add(link.target);
        adjacencyMap.get(link.target).add(link.source);
      }

      stats = { nodes: nodes.length, edges: links.length };

      if (nodes.length > 0) {
        await runSimulation();
      }
      loading = false;
    } catch (e) {
      console.error('[MiniNetworkGraph] Error:', e);
      error = e.message;
      loading = false;
    }
  }

  function runSimulation() {
    return new Promise((resolve) => {
      const scale = Math.sqrt(nodes.length) * 3;

      // Position target entity at center
      for (const node of nodes) {
        if (node.isTarget) {
          node.x = 0;
          node.y = 0;
          node.z = 0;
          node.fx = 0; // Fix position
          node.fy = 0;
          node.fz = 0;
        } else {
          const angle = Math.random() * 2 * Math.PI;
          const radius = scale * (0.5 + Math.random() * 0.5);
          node.x = Math.cos(angle) * radius;
          node.y = Math.sin(angle) * radius;
          node.z = (Math.random() - 0.5) * radius * 0.3;
        }
      }

      simulation = forceSimulation(nodes, 3)
        .force(
          'link',
          forceLink(links)
            .id((d) => d.id)
            .distance(30)
            .strength(0.8)
        )
        .force('charge', forceManyBody().strength(-50).distanceMax(150))
        .force('center', forceCenter(0, 0))
        .force('x', forceX(0).strength(0.02))
        .force('y', forceY(0).strength(0.02))
        .alphaDecay(0.05)
        .velocityDecay(0.4);

      // Run warmup ticks
      for (let i = 0; i < 80; i++) {
        simulation.tick();
      }

      updateLayers();
      simulation.stop();
      resolve();
    });
  }

  function getNodesWithinHops(startId, hops = 1) {
    const visited = new Set([startId]);
    let frontier = [startId];
    for (let i = 0; i < hops && frontier.length > 0; i++) {
      const next = [];
      for (const id of frontier) {
        const neighbors = adjacencyMap.get(id);
        if (neighbors) {
          for (const nid of neighbors) {
            if (!visited.has(nid)) {
              visited.add(nid);
              next.push(nid);
            }
          }
        }
      }
      frontier = next;
    }
    return visited;
  }

  function updateLayers() {
    if (!deck) return;

    /** @type {(d: any) => [number, number, number]} */
    const getPos = (d) => [(d.x || 0) * 8, (d.y || 0) * 8, (d.z || 0) * 8];

    const visibleNodeIds = hoveredNode ? getNodesWithinHops(hoveredNode.id, 1) : null;
    const nodeScale = Math.pow(2, -currentZoom * 0.25);
    const flowerNodes = nodes.filter((n) => n.id?.startsWith('E'));
    const circleNodes = nodes.filter((n) => !n.id?.startsWith('E'));

    // Build line data
    const lineData = [];
    for (const link of links) {
      const source = typeof link.source === 'object' ? link.source : nodeMap.get(link.source);
      const target = typeof link.target === 'object' ? link.target : nodeMap.get(link.target);
      if (source && target && source.x != null && target.x != null) {
        if (visibleNodeIds && !visibleNodeIds.has(source.id) && !visibleNodeIds.has(target.id)) {
          continue;
        }
        const sourcePos = getPos(source);
        const targetPos = getPos(target);
        const dx = targetPos[0] - sourcePos[0];
        const dy = targetPos[1] - sourcePos[1];
        const distance = Math.hypot(dx, dy) || 1;
        const bend = Math.min(40, distance * 0.12);
        const normX = -dy / distance;
        const normY = dx / distance;
        const midZ = (sourcePos[2] + targetPos[2]) / 2;
        const mid = [
          (sourcePos[0] + targetPos[0]) / 2 + normX * bend,
          (sourcePos[1] + targetPos[1]) / 2 + normY * bend,
          midZ + bend * 0.2,
        ];
        const fullyVisible =
          !visibleNodeIds || (visibleNodeIds.has(source.id) && visibleNodeIds.has(target.id));
        lineData.push({
          path: [sourcePos, mid, targetPos],
          share: link.share || 0,
          fullyVisible,
        });
      }
    }

    deck.setProps({
      layers: [
        new PathLayer({
          id: 'edges',
          data: lineData,
          getPath: (d) => d.path,
          getColor: (d) => {
            const alpha = d.fullyVisible ? 100 : 20;
            return [120, 120, 120, alpha];
          },
          // Width scaled by ownership share: 0.1 to 4px
          getWidth: (d) => {
            const share = Math.max(0, Math.min(100, d.share || 0));
            return 0.1 + (share / 100) * 3.9;
          },
          widthUnits: 'pixels',
          widthMinPixels: 0.1,
          widthMaxPixels: 4,
          pickable: false,
          parameters: { depthTest: true },
          updateTriggers: { getColor: [hoveredNode?.id] },
        }),
        new ScatterplotLayer({
          id: 'target-glow',
          data: nodes.filter((n) => n.isTarget),
          getPosition: getPos,
          radiusUnits: 'pixels',
          getRadius: () => 22 * nodeScale,
          getFillColor: () => [255, 140, 90, 120],
          stroked: false,
          radiusMinPixels: 12,
          radiusMaxPixels: 36,
          pickable: false,
          parameters: { depthTest: false },
        }),
        new IconLayer({
          id: 'flower-nodes',
          data: flowerNodes,
          autoPacking: true,
          getPosition: getPos,
          getIcon: (d) => {
            const filename = d?.id ? `${d.id}.svg` : 'default.svg';
            return {
              url: assetPath(`flowers/${filename}`),
              width: 64,
              height: 64,
              anchorX: 32,
              anchorY: 32,
              mask: false,
            };
          },
          sizeUnits: 'pixels',
          getSize: (d) => {
            const baseSize = d.isTarget ? 18 : Math.max(6, Math.log2(d.connections + 1) * 3.2);
            return baseSize * nodeScale;
          },
          sizeMinPixels: 5,
          sizeMaxPixels: 32,
          billboard: true,
          pickable: true,
          parameters: { depthTest: false },
          onHover: ({ object }) => handleHover(object),
          onClick: ({ object }) => {
            if (object) {
              const isAsset = object.id.startsWith('G');
              goto(isAsset ? assetLink(object.id) : entityLink(object.id));
            }
          },
          autoHighlight: true,
          highlightColor: [255, 220, 0, 120],
          getColor: (d) => {
            const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
            if (d.isTarget) return [255, 255, 255, isVisible ? 255 : 80];
            return [255, 255, 255, isVisible ? 140 : 20];
          },
          updateTriggers: {
            getSize: [nodeScale],
            getColor: [hoveredNode?.id],
          },
        }),
        new ScatterplotLayer({
          id: 'nodes',
          data: circleNodes,
          getPosition: getPos,
          billboard: true,
          getRadius: (d) => {
            if (d.isTarget) return 12;
            return (4 + Math.sqrt(d.connections) * 2) * nodeScale;
          },
          getFillColor: (d) => {
            const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
            if (d.isTarget) return [255, 100, 50, isVisible ? 255 : 40];
            if (flowerNodes.length) {
              return [130, 130, 130, isVisible ? 160 : 16];
            }
            const t = Math.min(1, d.connections / 20);
            const r = Math.round(90 + t * 165);
            const g = Math.round(50 + t * 50 - t * t * 80);
            const b = Math.round(240 - t * 200);
            return [r, g, b, isVisible ? 255 : 25];
          },
          stroked: true,
          getLineColor: (d) => {
            const isVisible = !visibleNodeIds || visibleNodeIds.has(d.id);
            return d.isTarget
              ? [255, 255, 255, isVisible ? 255 : 40]
              : [255, 255, 255, isVisible ? 140 : 20];
          },
          lineWidthMinPixels: 1,
          radiusMinPixels: 3,
          radiusMaxPixels: 20,
          pickable: true,
          parameters: { depthTest: false },
          onHover: ({ object }) => handleHover(object),
          onClick: ({ object }) => {
            if (object) {
              const isAsset = object.id.startsWith('G');
              goto(isAsset ? assetLink(object.id) : entityLink(object.id));
            }
          },
          autoHighlight: true,
          highlightColor: [255, 220, 0, 120],
          updateTriggers: {
            getFillColor: [hoveredNode?.id],
            getLineColor: [hoveredNode?.id],
          },
        }),
      ],
    });
  }

  function handleHover(object) {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }

    if (object?.id === hoveredNode?.id) return;

    if (object) {
      hoveredNode = object;
      scheduleHoverUpdate();
    } else {
      hoverTimeout = setTimeout(() => {
        hoveredNode = null;
        scheduleHoverUpdate();
      }, 80);
    }
  }

  function scheduleHoverUpdate() {
    if (hoverFrame) return;
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = null;
      updateLayers();
    });
  }

  onMount(async () => {
    const { OrbitView } = await import('@deck.gl/core');

    const orbitView = new OrbitView({
      orbitAxis: 'Y',
      controller: {
        dragMode: 'pan',
        dragPan: true,
        dragRotate: true,
        scrollZoom: { speed: 0.08, smooth: true },
        touchZoom: true,
        touchRotate: true,
        doubleClickZoom: false,
        keyboard: true,
        inertia: 120,
      },
    });

    deck = new Deck({
      parent: container,
      views: orbitView,
      initialViewState: VIEW_STATE,
      layers: [],
      onViewStateChange: ({ viewState }) => {
        currentZoom = viewState.zoom;
        updateLayers();
      },
      onClick: ({ object }) => {
        if (object) {
          const isAsset = object.id.startsWith('G');
          goto(isAsset ? assetLink(object.id) : entityLink(object.id));
        }
      },
      getTooltip: ({ object }) => {
        if (!object) return null;
        return {
          html: `<div style="padding:6px;font-family:monospace;font-size:10px;">
            <strong>${object.name}</strong><br/>
            <span style="color:#888;">${object.id}</span><br/>
            ${object.connections} connections
          </div>`,
          style: { backgroundColor: '#fff', border: '1px solid #000' },
        };
      },
    });

    await loadData();
  });

  onDestroy(() => {
    if (simulation) simulation.stop();
    if (hoverFrame) cancelAnimationFrame(hoverFrame);
    if (hoverTimeout) clearTimeout(hoverTimeout);
    if (deck) deck.finalize();
  });

  // Reload when entityId changes
  $effect(() => {
    if (entityId && deck) {
      loadData();
    }
  });
</script>

<div class="mini-network" style="height: {height}px;">
  {#if loading}
    <div class="loading">Loading network...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if stats.nodes === 0}
    <div class="empty">No network connections found</div>
  {:else}
    <div class="stats">
      {stats.nodes} nodes · {stats.edges} edges
    </div>
  {/if}
  <div bind:this={container} class="deck-container"></div>
  {#if hoveredNode && !loading}
    <div class="hover-info">
      <strong>{hoveredNode.name}</strong>
      {#if hoveredNode.isTarget}<span class="target-badge">This Entity</span>{/if}
    </div>
  {/if}
</div>

<style>
  .mini-network {
    position: relative;
    border: 1px solid #ddd;
    background: #fafafa;
    overflow: hidden;
  }

  .deck-container {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
  }

  .loading,
  .error,
  .empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    z-index: 10;
    background: white;
    padding: 8px 16px;
    border: 1px solid #ddd;
  }

  .error {
    color: #b00;
    border-color: #b00;
  }

  .stats {
    position: absolute;
    top: 8px;
    left: 8px;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    z-index: 10;
    background: rgba(255, 255, 255, 0.9);
    padding: 4px 8px;
  }

  .hover-info {
    position: absolute;
    bottom: 8px;
    left: 8px;
    font-size: 11px;
    z-index: 10;
    background: white;
    padding: 6px 10px;
    border: 1px solid #000;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hover-info strong {
    font-weight: 600;
  }

  .target-badge {
    display: inline-block;
    margin-left: 6px;
    font-size: 9px;
    text-transform: uppercase;
    background: #ff6432;
    color: white;
    padding: 2px 5px;
    vertical-align: middle;
  }
</style>
