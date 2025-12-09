<script>
  import { onMount, onDestroy } from 'svelte';
  import { colors } from '$lib/ownership-theme';

  // Props
  let {
    assetId = '',
    assetName = '',
    edges = [],
    nodes = [],
    width = 800,
    height = 400,
  } = $props();

  // State
  let svgElement;
  let simulation;
  let nodePositions = $state([]);
  let linkPositions = $state([]);
  let hoveredNode = $state(null);

  // Build node map for quick lookup
  let nodeMap = $derived(() => {
    const map = new Map();
    // Add asset as a node
    map.set(assetId, { id: assetId, Name: assetName, type: 'asset' });
    // Add entity nodes
    nodes.forEach((n) => map.set(n.id, { ...n, type: 'entity' }));
    return map;
  });

  // Calculate node depths from edges
  let nodeDepths = $derived(() => {
    const depths = {};
    edges.forEach((e) => {
      if (!depths[e.target]) depths[e.target] = [];
      if (!depths[e.target].includes(e.depth)) depths[e.target].push(e.depth);
      if (!depths[e.source]) depths[e.source] = [];
      if (!depths[e.source].includes(e.depth + 1)) depths[e.source].push(e.depth + 1);
    });
    return depths;
  });

  // Max depth for scaling
  let maxDepth = $derived(() => {
    return Math.max(1, ...edges.map((e) => e.depth));
  });

  async function initSimulation() {
    if (typeof window === 'undefined') return;

    const d3Force = await import('d3-force');

    // Build simulation nodes with fixed Y based on depth
    const simNodes = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]))).map((id) => {
      const depths = nodeDepths()[id] || [0];
      const minDepth = Math.min(...depths);
      return {
        id,
        depth: minDepth,
        fy: height - 30 - (minDepth * (height - 60)) / (maxDepth() + 1),
        x: Math.random() * width,
        y: height / 2,
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
          .id((d) => d.id)
          .distance(40)
          .strength(0.5)
      )
      .force('charge', d3Force.forceManyBody().strength(-80))
      .force('x', d3Force.forceX(width / 2).strength(0.05))
      .force('collide', d3Force.forceCollide(20))
      .on('tick', () => {
        nodePositions = simNodes.map((n) => ({
          id: n.id,
          x: Math.max(20, Math.min(width - 20, n.x)),
          y: n.y,
          depth: n.depth,
          data: nodeMap().get(n.id),
        }));

        linkPositions = simLinks.map((l) => ({
          source: { x: l.source.x, y: l.source.y },
          target: { x: l.target.x, y: l.target.y },
          value: l.value,
        }));
      });

    // Run simulation for a bit then stop
    simulation.alpha(1).restart();
    setTimeout(() => simulation.stop(), 3000);
  }

  onMount(() => {
    if (edges.length > 0) {
      initSimulation();
    }
  });

  onDestroy(() => {
    if (simulation) simulation.stop();
  });

  // Re-run when edges change
  $effect(() => {
    if (edges.length > 0 && typeof window !== 'undefined') {
      initSimulation();
    }
  });

  function getNodeColor(node) {
    if (!node?.data) return colors.grey;
    if (node.data.type === 'asset') return colors.orange;
    if (node.depth === 0) return colors.teal;
    return colors.navy;
  }

  function getNodeRadius(node) {
    if (!node?.data) return 4;
    if (node.data.type === 'asset') return 8;
    if (node.depth <= 1) return 6;
    return 4;
  }

  function truncateName(name, maxLen = 20) {
    if (!name) return '';
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 1) + '...';
  }
</script>

<div class="ownership-hierarchy">
  <svg {width} {height} bind:this={svgElement}>
    <!-- Links -->
    <g class="links">
      {#each linkPositions as link}
        <line
          x1={link.source.x}
          y1={link.source.y}
          x2={link.target.x}
          y2={link.target.y}
          stroke={colors.navy}
          stroke-width="0.5"
          stroke-opacity="0.4"
        />
      {/each}
    </g>

    <!-- Nodes -->
    <g class="nodes">
      {#each nodePositions as node}
        <g
          transform="translate({node.x}, {node.y})"
          class="node"
          onmouseenter={() => (hoveredNode = node)}
          onmouseleave={() => (hoveredNode = null)}
        >
          <circle
            r={getNodeRadius(node)}
            fill={getNodeColor(node)}
            fill-opacity="0.3"
            stroke={getNodeColor(node)}
            stroke-width="1"
          />
          {#if hoveredNode?.id === node.id}
            <text y="-10" text-anchor="middle" font-size="10" fill={colors.navy}>
              {truncateName(node.data?.Name || node.id)}
            </text>
          {/if}
        </g>
      {/each}
    </g>

    <!-- Asset label (always visible) -->
    {#each nodePositions.filter((n) => n.data?.type === 'asset') as assetNode}
      <text
        x={assetNode.x}
        y={assetNode.y + 20}
        text-anchor="middle"
        font-size="11"
        font-weight="600"
        fill={colors.orange}
      >
        {truncateName(assetNode.data?.Name || assetId, 30)}
      </text>
    {/each}

    <!-- Depth labels -->
    {#each Array.from({ length: maxDepth() + 1 }, (_, i) => i) as depth}
      <text
        x="10"
        y={height - 30 - (depth * (height - 60)) / (maxDepth() + 1)}
        font-size="9"
        fill={colors.grey}
        opacity="0.6"
      >
        {depth === 0 ? 'Asset' : `Depth ${depth}`}
      </text>
    {/each}
  </svg>

  <!-- Tooltip -->
  {#if hoveredNode?.data}
    <div class="tooltip">
      <strong>{hoveredNode.data.Name || hoveredNode.id}</strong>
      <br />
      <span class="id">{hoveredNode.id}</span>
      {#if hoveredNode.data.type !== 'asset'}
        <br />Depth: {hoveredNode.depth}
      {/if}
    </div>
  {/if}
</div>

<style>
  .ownership-hierarchy {
    position: relative;
    background: #fafafa;
    border: 1px solid #000;
  }

  svg {
    display: block;
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
    border: 1px solid #000;
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
</style>
