<script lang="ts">
  /**
   * IntermediaryMiniGraph - Compact dagre graph for subsidiaries
   * Shows a simplified ownership structure for intermediate entities
   */
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import { colors, ownershipColors } from '$lib/design-tokens';
  import * as d3 from 'd3';

  // Dynamic import for dagre-d3 (doesn't work well with SSR)
  let dagreD3: typeof import('dagre-d3') | null = $state(null);
  let dagreError = $state(false);

  interface GraphNode {
    id: string;
    Name?: string;
    name?: string;
    type?: 'entity' | 'asset';
  }

  interface GraphEdge {
    source: string;
    target: string;
    value?: number | null;
  }

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    rootId?: string;
    direction?: 'TB' | 'LR';
    width?: number;
    height?: number;
    compact?: boolean;
  }

  let {
    nodes = [],
    edges = [],
    rootId = '',
    direction = 'LR',
    width = 300,
    height = 150,
    compact = true,
  }: Props = $props();

  let svgEl: SVGSVGElement | null = $state(null);

  const nodeMap = $derived(new Map(nodes.map((n) => [n.id, n])));

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
    if (!svgEl || nodes.length === 0 || !dagreD3) return;

    // Check that dagre-d3 loaded properly
    if (!dagreD3.graphlib || !dagreD3.render) {
      console.error('dagre-d3 did not load properly');
      dagreError = true;
      return;
    }

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    // Create dagre graph
    const g = new dagreD3.graphlib.Graph()
      .setGraph({
        rankdir: direction,
        nodesep: compact ? 20 : 30,
        ranksep: compact ? 30 : 50,
        marginx: 10,
        marginy: 10,
      })
      .setDefaultEdgeLabel(() => ({}));

    // Add nodes
    nodes.forEach((node) => {
      const label = node.Name || node.name || node.id;
      const isRoot = node.id === rootId;
      const displayLabel = compact && label.length > 15 ? label.slice(0, 15) + '…' : label;

      g.setNode(node.id, {
        label: displayLabel,
        style: isRoot
          ? `fill: ${colors.gray800}; stroke: ${colors.black}; stroke-width: 1.5px;`
          : `fill: ${colors.white}; stroke: ${colors.gray400}; stroke-width: 1px;`,
        labelStyle: isRoot
          ? `fill: ${colors.white}; font-size: ${compact ? 9 : 10}px; font-family: system-ui, sans-serif;`
          : `fill: ${colors.black}; font-size: ${compact ? 9 : 10}px; font-family: system-ui, sans-serif;`,
        rx: 3,
        ry: 3,
        padding: compact ? 6 : 8,
      });
    });

    // Add edges
    edges.forEach((edge) => {
      const ownership = edge.value != null ? `${edge.value.toFixed(0)}%` : '';
      g.setEdge(edge.source, edge.target, {
        label: compact ? '' : ownership,
        labelStyle: 'font-size: 8px; fill: #888;',
        style: `stroke: ${ownershipColors.edge}; stroke-width: 1px; fill: none;`,
        arrowheadStyle: `fill: ${ownershipColors.edge};`,
        curve: d3.curveBasis,
      });
    });

    // Render
    const render = new dagreD3.render();
    const svgGroup = svg.append('g');
    // @ts-expect-error - dagre-d3 types are incomplete
    render(svgGroup, g);

    // Calculate scale to fit
    const graphInfo = g.graph() as { width?: number; height?: number } | undefined;
    const graphWidth = graphInfo?.width || 100;
    const graphHeight = graphInfo?.height || 100;

    const scale = Math.min(width / (graphWidth + 20), height / (graphHeight + 20), 1.2);
    const xOffset = (width - graphWidth * scale) / 2;
    const yOffset = (height - graphHeight * scale) / 2;

    svg.attr('width', width).attr('height', height);
    svgGroup.attr('transform', `translate(${xOffset}, ${yOffset}) scale(${scale})`);

    // Add click handlers
    svg.selectAll('g.node').each(function () {
      const nodeEl = d3.select(this);
      const nodeId = (this as any).__data__;

      nodeEl.style('cursor', 'pointer').on('click', () => handleNodeClick(nodeId));
    });
  }

  onMount(async () => {
    // DISABLED: dagre-d3 causes crashes in production
    dagreError = true;
  });

  $effect(() => {
    if (nodes.length > 0 && svgEl && dagreD3) {
      renderGraph();
    }
  });
</script>

<div class="intermediary-mini-graph" class:compact>
  {#if dagreError}
    <div class="empty-state">Graph unavailable</div>
  {:else if nodes.length === 0}
    <div class="empty-state">No subsidiary data</div>
  {:else}
    <svg bind:this={svgEl} class="mini-graph-svg"></svg>
  {/if}
</div>

<style>
  .intermediary-mini-graph {
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    overflow: hidden;
  }

  .intermediary-mini-graph.compact {
    background: var(--color-bg-secondary);
  }

  .mini-graph-svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 80px;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  :global(.intermediary-mini-graph .node rect) {
    transition: filter 0.15s ease;
  }

  :global(.intermediary-mini-graph .node:hover rect) {
    filter: brightness(0.92);
  }
</style>
