<script>
  /**
   * OwnershipHierarchy - Force-directed ownership network graph
   * Props-only component - expects data from parent
   */
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { assetLink, entityLink } from '$lib/links';
  import { colors } from '$lib/ownership-theme';

  let {
    assetId = '',
    assetName = '',
    edges = [],
    nodes = [],
    width: initialWidth = 800,
    height: initialHeight = 400,
  } = $props();

  const MIN_HEIGHT = 420;

  let simulation;
  let nodePositions = $state([]);
  let linkPositions = $state([]);
  let hoveredNode = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let containerEl;
  let resizeObserver;
  let layoutWidth = $state(initialWidth);
  let layoutHeight = $state(Math.max(MIN_HEIGHT, initialHeight));

  // Derived
  let nodeMap = $derived.by(() => {
    const map = new Map();
    map.set(assetId, { id: assetId, Name: assetName, type: 'asset' });
    nodes.forEach((n) => map.set(n.id, { ...n, type: 'entity' }));
    return map;
  });

  let nodeDepths = $derived.by(() => {
    const depths = {};
    edges.forEach((e) => {
      if (!depths[e.target]) depths[e.target] = [];
      if (!depths[e.target].includes(e.depth)) depths[e.target].push(e.depth);
      if (!depths[e.source]) depths[e.source] = [];
      if (!depths[e.source].includes(e.depth + 1)) depths[e.source].push(e.depth + 1);
    });
    return depths;
  });

  let maxDepth = $derived(Math.max(1, ...edges.map((e) => e.depth)));

  async function initSimulation() {
    if (typeof window === 'undefined' || !edges.length) {
      loading = false;
      return;
    }

    loading = true;

    const d3Force = await import('d3-force');
    const simNodes = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]))).map((id) => {
      const depths = nodeDepths[id] || [0];
      const minDepth = Math.min(...depths);
      return {
        id,
        depth: minDepth,
        fy: layoutHeight - 30 - (minDepth * (layoutHeight - 60)) / (maxDepth + 1),
        x: Math.random() * layoutWidth,
        y: layoutHeight / 2,
      };
    });

    const simLinks = edges.map((e) => ({
      source: e.source,
      target: e.target,
      value: e.value || 50,
    }));

    simulation = d3Force
      .forceSimulation(simNodes)
      .force(
        'link',
        d3Force
          .forceLink(simLinks)
          .id((d) => /** @type {{ id: string }} */ (d).id)
          .distance(40)
          .strength(0.5)
      )
      .force('charge', d3Force.forceManyBody().strength(-120))
      .force('x', d3Force.forceX(layoutWidth / 2).strength(0.05))
      .force(
        'collide',
        d3Force.forceCollide((d) => {
          // Dynamic collision radius based on node degree
          const degree = nodeDegrees[d.id] || 1;
          return 10 + Math.sqrt(degree) * 5;
        })
      )
      .on('tick', () => {
        nodePositions = simNodes.map((n) => ({
          id: n.id,
          x: Math.max(20, Math.min(layoutWidth - 20, n.x)),
          y: n.y,
          depth: n.depth,
          data: nodeMap.get(n.id),
        }));
        linkPositions = simLinks.map((l) => ({
          source: { x: l.source.x, y: l.source.y },
          target: { x: l.target.x, y: l.target.y },
          value: l.value,
        }));
      });

    simulation.alpha(1).restart();
    setTimeout(() => simulation.stop(), 3000);
    loading = false;
  }

  const computeHeight = (nextWidth) =>
    Math.max(MIN_HEIGHT, Math.min(900, (nextWidth || initialWidth) * 0.55));

  function handleResize(entry) {
    const nextWidth = entry?.contentRect?.width || initialWidth;
    const nextHeight = computeHeight(nextWidth);
    const widthChanged = Math.abs(nextWidth - layoutWidth) > 1;
    const heightChanged = Math.abs(nextHeight - layoutHeight) > 1;
    if (widthChanged || heightChanged) {
      layoutWidth = nextWidth;
      layoutHeight = nextHeight;
      restartSimulation();
    }
  }

  function restartSimulation() {
    simulation?.stop();
    initSimulation();
  }

  onMount(() => {
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => handleResize(entries[0]));
      if (containerEl) resizeObserver.observe(containerEl);
      if (containerEl) handleResize({ contentRect: containerEl.getBoundingClientRect() });
    } else if (containerEl) {
      handleResize({ contentRect: containerEl.getBoundingClientRect() });
    }
    restartSimulation();
  });

  onDestroy(() => {
    simulation?.stop();
    resizeObserver?.disconnect();
  });

  $effect(() => {
    // Re-run when input data changes
    edges;
    nodes;
    restartSimulation();
  });

  const getNodeColor = (node) =>
    !node?.data
      ? colors.grey
      : node.data.type === 'asset'
        ? colors.orange
        : node.depth === 0
          ? colors.teal
          : colors.navy;

  // Count connections per node for sizing
  let nodeDegrees = $derived.by(() => {
    const degrees = {};
    edges.forEach((e) => {
      degrees[e.source] = (degrees[e.source] || 0) + 1;
      degrees[e.target] = (degrees[e.target] || 0) + 1;
    });
    return degrees;
  });

  const getNodeRadius = (node) => {
    if (!node?.data) return 5;
    if (node.data.type === 'asset') return 14; // Asset always prominent

    // Use sqrt scale for entity nodes based on connection count
    const degree = nodeDegrees[node.id] || 1;
    const baseSize = 6;
    const scaleFactor = 4;
    return baseSize + Math.sqrt(degree) * scaleFactor;
  };

  const truncate = (name, max = 20) =>
    !name ? '' : name.length <= max ? name : name.slice(0, max - 1) + '...';

  // Navigate to asset or entity page on click
  function handleNodeClick(node) {
    if (!node?.id) return;
    const isAsset = node.data?.type === 'asset' || node.id.startsWith('G');
    const link = isAsset ? assetLink(node.id) : entityLink(node.id);
    goto(link);
  }
</script>

<div class="ownership-hierarchy" bind:this={containerEl}>
  {#if loading || error}
    <div class="overlay" class:error={Boolean(error)}>
      {loading ? 'Loading ownership graph…' : error}
    </div>
  {/if}
  <svg width={layoutWidth} height={layoutHeight}>
    <g class="links">
      {#each linkPositions as link}
        <line
          x1={link.source.x}
          y1={link.source.y}
          x2={link.target.x}
          y2={link.target.y}
          stroke="#999"
          stroke-width="1"
          stroke-opacity="0.5"
        />
      {/each}
    </g>
    <g class="nodes">
      {#each nodePositions as node}
        <g
          transform="translate({node.x}, {node.y})"
          class="node"
          role="button"
          tabindex="0"
          onmouseenter={() => (hoveredNode = node)}
          onmouseleave={() => (hoveredNode = null)}
          onclick={() => handleNodeClick(node)}
          onkeydown={(e) => e.key === 'Enter' && handleNodeClick(node)}
        >
          <!-- White background to mask links -->
          <circle r={getNodeRadius(node) + 2} fill="white" />
          <circle
            r={getNodeRadius(node)}
            fill={getNodeColor(node)}
            fill-opacity="0.9"
            stroke={getNodeColor(node)}
            stroke-width="1.5"
          />
          {#if hoveredNode?.id === node.id}
            <text y="-10" text-anchor="middle" font-size="10" fill={colors.navy}>
              {truncate(node.data?.Name || node.id)}
            </text>
          {/if}
        </g>
      {/each}
    </g>
    {#each nodePositions.filter((n) => n.data?.type === 'asset') as assetNode}
      <text
        x={assetNode.x}
        y={assetNode.y + 20}
        text-anchor="middle"
        font-size="11"
        font-weight="600"
        fill={colors.orange}
      >
        {truncate(assetNode.data?.Name || assetId, 30)}
      </text>
    {/each}
    {#each Array.from({ length: maxDepth + 1 }, (_, i) => i) as depth}
      <text
        x="10"
        y={layoutHeight - 30 - (depth * (layoutHeight - 60)) / (maxDepth + 1)}
        font-size="9"
        fill={colors.grey}
        opacity="0.6"
      >
        {depth === 0 ? 'Asset' : `Depth ${depth}`}
      </text>
    {/each}
  </svg>
  {#if hoveredNode?.data}
    {@const incomingEdge = edges.find((e) => e.target === hoveredNode.id)}
    <div class="tooltip">
      <strong>{hoveredNode.data.Name || hoveredNode.id}</strong><br />
      <span class="id">{hoveredNode.id}</span>
      {#if incomingEdge?.value}
        <br /><span class="ownership">{incomingEdge.value.toFixed(1)}% ownership</span>
      {/if}
      {#if hoveredNode.data.type !== 'asset'}<br /><span class="depth"
          >Depth: {hoveredNode.depth}</span
        >{/if}
    </div>
  {/if}
</div>

<style>
  .ownership-hierarchy {
    position: relative;
    background: transparent;
    border: none;
    width: 100%;
    min-height: 420px;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(250, 250, 250, 0.9);
    z-index: 2;
    font-size: 12px;
    color: #555;
  }
  .overlay.error {
    color: #b10000;
    background: rgba(250, 235, 235, 0.92);
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
  }
  .node {
    cursor: pointer;
  }
  .node circle {
    transition:
      r 0.15s,
      fill-opacity 0.15s;
  }
  .node:hover circle {
    fill-opacity: 0.6;
  }
  .tooltip {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    border: none;
    padding: 8px 12px;
    font-size: 11px;
    line-height: 1.4;
    max-width: 200px;
    font-family: monospace;
  }
  .tooltip strong {
    font-size: 12px;
    font-family: system-ui, sans-serif;
  }
  .tooltip .id {
    color: #888;
    font-size: 9px;
  }
  .tooltip .ownership {
    color: #016b83;
    font-weight: 600;
  }
  .tooltip .depth {
    color: #666;
  }
</style>
