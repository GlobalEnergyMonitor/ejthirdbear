<script lang="ts">
  /**
   * DagreOwnershipGraph - Dagre-d3 hierarchical graph visualization
   * Shows who owns an asset (walks UP the ownership chain)
   *
   * Features:
   * - Hierarchical layout using dagre
   * - Interactive node highlighting on hover
   * - Ownership pie charts on nodes
   * - Click-to-navigate to entity/asset pages
   */
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import { colors, ownershipColors } from '$lib/design-tokens';
  import * as d3 from 'd3';
  import dagreD3 from 'dagre-d3';

  interface GraphNode {
    id: string;
    Name?: string;
    name?: string;
    type?: string;
    is_root?: boolean;
    is_terminal?: boolean;
    tracker?: string;
    [key: string]: unknown;
  }

  interface GraphEdge {
    source: string;
    target: string;
    value?: number | null;
    depth?: number;
    type?: string;
    [key: string]: unknown;
  }

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    rootId?: string;
    direction?: 'TB' | 'LR' | 'BT' | 'RL';
    showPies?: boolean;
    maxDepth?: number;
    width?: number;
    height?: number;
  }

  let {
    nodes = [],
    edges = [],
    rootId = '',
    direction = 'TB',
    showPies = true,
    maxDepth = 10,
    width = 800,
    height = 600,
  }: Props = $props();

  let svgEl: SVGSVGElement | null = $state(null);
  let _containerEl: HTMLDivElement | null = $state(null);

  // Filter edges by max depth
  const filteredEdges = $derived(
    maxDepth > 0 ? edges.filter((e) => (e.depth ?? 0) <= maxDepth) : edges
  );

  // Get connected node IDs from filtered edges
  const connectedNodeIds = $derived.by(() => {
    const ids = new Set<string>();
    filteredEdges.forEach((e) => {
      ids.add(e.source);
      ids.add(e.target);
    });
    return ids;
  });

  // Filter nodes to only those in connected edges
  const filteredNodes = $derived(
    nodes.filter((n) => connectedNodeIds.has(n.id) || n.id === rootId)
  );

  // Build node map for quick lookup
  const nodeMap = $derived(new Map(filteredNodes.map((n) => [n.id, n])));

  // Get upstream node IDs from a given node
  function getUpstreamIds(nodeId: string): Set<string> {
    const upstream = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      filteredEdges
        .filter((e) => e.target === current)
        .forEach((e) => {
          if (!upstream.has(e.source)) {
            upstream.add(e.source);
            queue.push(e.source);
          }
        });
    }
    return upstream;
  }

  // Get downstream node IDs from a given node
  function getDownstreamIds(nodeId: string): Set<string> {
    const downstream = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      filteredEdges
        .filter((e) => e.source === current)
        .forEach((e) => {
          if (!downstream.has(e.target)) {
            downstream.add(e.target);
            queue.push(e.target);
          }
        });
    }
    return downstream;
  }

  function handleNodeClick(nodeId: string) {
    const node = nodeMap.get(nodeId);
    if (!node) return;

    if (node.type === 'asset' || nodeId.startsWith('G')) {
      goto(assetLink(nodeId));
    } else {
      goto(entityLink(nodeId));
    }
  }

  function renderGraph() {
    if (!svgEl || filteredNodes.length === 0) return;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Create new dagre graph
    const g = new dagreD3.graphlib.Graph()
      .setGraph({
        rankdir: direction,
        nodesep: 50,
        ranksep: 80,
        marginx: 20,
        marginy: 20,
      })
      .setDefaultEdgeLabel(() => ({}));

    // Add nodes
    filteredNodes.forEach((node) => {
      const label = node.Name || node.name || node.id;
      const isRoot = node.id === rootId || node.is_root;
      const isTerminal = node.is_terminal;
      const isAsset = node.type === 'asset' || node.id.startsWith('G');

      g.setNode(node.id, {
        label,
        style: isRoot
          ? `fill: ${colors.gray900}; stroke: ${colors.black}; stroke-width: 2px;`
          : isTerminal
            ? `fill: ${colors.gray200}; stroke: ${colors.gray600}; stroke-width: 1px;`
            : isAsset
              ? `fill: ${colors.mint}; stroke: ${colors.gray600}; stroke-width: 1px;`
              : `fill: ${colors.white}; stroke: ${colors.gray400}; stroke-width: 1px;`,
        labelStyle: isRoot
          ? `fill: ${colors.white}; font-size: 11px; font-weight: 600; font-family: system-ui, sans-serif;`
          : `fill: ${colors.black}; font-size: 11px; font-family: system-ui, sans-serif;`,
        rx: 4,
        ry: 4,
        padding: 10,
        class: `node-${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`,
      });
    });

    // Add edges
    filteredEdges.forEach((edge) => {
      const ownership = edge.value != null ? `${edge.value.toFixed(1)}%` : '';
      g.setEdge(edge.source, edge.target, {
        label: ownership,
        labelStyle: 'font-size: 9px; fill: #666;',
        style: `stroke: ${ownershipColors.edge}; stroke-width: 1.5px; fill: none;`,
        arrowheadStyle: `fill: ${ownershipColors.edge};`,
        curve: d3.curveBasis,
      });
    });

    // Render using dagre-d3
    const render = new dagreD3.render();
    const svgGroup = svg.append('g');
    // @ts-expect-error - dagre-d3 types are incomplete
    render(svgGroup, g);

    // Get rendered dimensions
    const graphInfo = g.graph() as { width?: number; height?: number } | undefined;
    const graphWidth = graphInfo?.width || 100;
    const graphHeight = graphInfo?.height || 100;

    // Set SVG size and viewBox
    svg.attr('width', width).attr('height', height);

    // Calculate zoom to fit
    const scale = Math.min(width / (graphWidth + 40), height / (graphHeight + 40), 1.5);
    const xOffset = (width - graphWidth * scale) / 2;
    const yOffset = (height - graphHeight * scale) / 2;

    svgGroup.attr('transform', `translate(${xOffset}, ${yOffset}) scale(${scale})`);

    // Add interactivity
    svg.selectAll('g.node').each(function () {
      const nodeEl = d3.select(this);
      const nodeId = (this as any).__data__;

      nodeEl
        .style('cursor', 'pointer')
        .on('click', () => handleNodeClick(nodeId))
        .on('mouseenter', () => {
          updateHighlighting(svg, nodeId);
        })
        .on('mouseleave', () => {
          clearHighlighting(svg);
        });
    });

    // Add ownership pies if enabled
    if (showPies) {
      addOwnershipPies(svg, g);
    }
  }

  function updateHighlighting(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    nodeId: string
  ) {
    const upstreamIds = getUpstreamIds(nodeId);
    const downstreamIds = getDownstreamIds(nodeId);
    const connectedIds = new Set([nodeId, ...upstreamIds, ...downstreamIds]);

    // Dim non-connected nodes
    svg.selectAll('g.node').style('opacity', function () {
      const id = (this as any).__data__;
      return connectedIds.has(id) ? 1 : 0.3;
    });

    // Highlight connected edges
    svg.selectAll('g.edgePath').style('opacity', function () {
      const edge = (this as any).__data__;
      const sourceConnected = connectedIds.has(edge.v);
      const targetConnected = connectedIds.has(edge.w);
      return sourceConnected && targetConnected ? 1 : 0.2;
    });

    svg.selectAll('g.edgeLabel').style('opacity', function () {
      const edge = (this as any).__data__;
      const sourceConnected = connectedIds.has(edge.v);
      const targetConnected = connectedIds.has(edge.w);
      return sourceConnected && targetConnected ? 1 : 0.2;
    });
  }

  function clearHighlighting(svg: d3.Selection<SVGSVGElement, unknown, null, undefined>) {
    svg.selectAll('g.node').style('opacity', 1);
    svg.selectAll('g.edgePath').style('opacity', 1);
    svg.selectAll('g.edgeLabel').style('opacity', 1);
  }

  function addOwnershipPies(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    g: dagreD3.graphlib.Graph
  ) {
    // Add small pie charts to nodes showing their total outgoing ownership
    svg.selectAll('g.node').each(function () {
      const nodeEl = d3.select(this);
      const nodeId = (this as any).__data__;

      // Find edges where this node is the source (owns something)
      const outgoingEdges = filteredEdges.filter((e) => e.source === nodeId);
      if (outgoingEdges.length === 0) return;

      const totalOwnership = outgoingEdges.reduce((sum, e) => sum + (e.value || 0), 0);
      if (totalOwnership <= 0) return;

      // Get node position
      const nodeData = g.node(nodeId);
      if (!nodeData) return;

      const pieSize = 16;
      const pieGroup = nodeEl
        .append('g')
        .attr('class', 'ownership-pie')
        .attr(
          'transform',
          `translate(${(nodeData.width || 60) / 2 - pieSize / 2 - 4}, ${-((nodeData.height || 30) / 2) - pieSize / 2 - 4})`
        );

      // Draw pie background
      pieGroup
        .append('circle')
        .attr('cx', pieSize / 2)
        .attr('cy', pieSize / 2)
        .attr('r', pieSize / 2)
        .attr('fill', colors.gray200)
        .attr('stroke', colors.gray400)
        .attr('stroke-width', 0.5);

      // Draw pie arc
      const arc = d3
        .arc<any>()
        .innerRadius(0)
        .outerRadius(pieSize / 2);

      const pie = d3.pie<number>().sort(null);
      const filledPercent = Math.min(totalOwnership, 100);
      const data = pie([filledPercent, 100 - filledPercent]);

      pieGroup
        .selectAll('path')
        .data(data)
        .join('path')
        .attr('transform', `translate(${pieSize / 2}, ${pieSize / 2})`)
        .attr('d', arc)
        .attr('fill', (d, i) => (i === 0 ? ownershipColors.direct : 'transparent'));
    });
  }

  onMount(() => {
    if (filteredNodes.length > 0) {
      tick().then(renderGraph);
    }
  });

  // Re-render when data changes
  $effect(() => {
    if (filteredNodes.length > 0 && svgEl) {
      renderGraph();
    }
  });
</script>

<div class="dagre-ownership-graph" bind:this={_containerEl}>
  {#if filteredNodes.length === 0}
    <div class="empty-state">
      <p>No ownership data available</p>
    </div>
  {:else}
    <svg bind:this={svgEl} class="graph-svg" aria-label="Ownership structure graph"></svg>
  {/if}
</div>

<style>
  .dagre-ownership-graph {
    width: 100%;
    overflow: hidden;
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
  }

  .graph-svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 400px;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--color-text-tertiary);
  }

  /* Dagre-d3 node styles */
  :global(.dagre-ownership-graph .node rect) {
    transition: all 0.15s ease;
  }

  :global(.dagre-ownership-graph .node:hover rect) {
    filter: brightness(0.95);
  }

  :global(.dagre-ownership-graph .edgePath path) {
    transition: opacity 0.15s ease;
  }

  :global(.dagre-ownership-graph .ownership-pie) {
    pointer-events: none;
  }
</style>
