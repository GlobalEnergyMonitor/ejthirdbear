<script lang="ts">
  /**
   * OwnershipTreeGraph - Port from Observable notebook
   * Uses dagre for layout, Svelte for rendering
   * Label logic ported from Observable's nodesToShowText/placeOwnerLabels
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import * as d3 from 'd3';

  interface Props {
    nodes?: any[];
    edges?: any[];
    paths?: Record<string, any[]>;
    rootId?: string;
    assetName?: string;
  }

  let {
    nodes = [],
    edges = [],
    paths = {},
    rootId = '',
    assetName: _assetName = '',
  }: Props = $props();

  // Colors from Observable notebook (exact values)
  const colors = {
    navy: '#1a3a4a',      // asset node fill, text color
    teal: '#2a7f8f',      // pie fill, edge % text
    mint: '#97E6DE',      // highlight stroke
    warmWhite: '#fafaf7', // asset label, background
    nodeFill: '#cce1e6',  // entity node fill
    edge: '#9fc6d0',      // edge stroke
    edgeImputed: '#cdcdcd', // imputed edge color
  };

  // State
  let dagre: any = null;
  let ready = $state(false);
  let hoveredId = $state<string | null>(null);
  let hoveredNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);

  // Layout results
  let layoutNodes = $state<any[]>([]);
  let layoutEdges = $state<any[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());

  // Node radius
  const nodeR = $derived(nodes.length < 10 ? 17 : nodes.length > 25 ? 11 : 14);

  // Process paths for cumulative ownership AND track touched nodes/edges
  const pathsData = $derived.by(() => {
    const pctMap = new Map<string, number>();
    const touchedMap = new Map<string, { nodesTouched: string[]; edgeIndices: number[] }>();
    if (!paths) return { pctMap, touchedMap };

    Object.entries(paths).forEach(([id, arr]) => {
      if (Array.isArray(arr)) {
        pctMap.set(id, d3.sum(arr.map((p: any) => p.cumulative_pct || 0)));

        // Build nodesTouched and edgeIndices like Observable does
        const nodesTouched = new Set<string>();
        const edgeIndices = new Set<number>();

        arr.forEach((p: any) => {
          if (p.route) {
            p.route.forEach((nodeId: string) => nodesTouched.add(nodeId));
            // Find edge indices for this path
            for (let i = 0; i < p.route.length - 1; i++) {
              const source = p.route[i];
              const target = p.route[i + 1];
              const edgeIdx = edges.findIndex((e) => e.source === source && e.target === target);
              if (edgeIdx >= 0) edgeIndices.add(edgeIdx);
            }
          }
        });

        touchedMap.set(id, {
          nodesTouched: Array.from(nodesTouched),
          edgeIndices: Array.from(edgeIndices),
        });
      }
    });
    return { pctMap, touchedMap };
  });

  const pathsMap = $derived(pathsData.pctMap);
  const pathsTouchedMap = $derived(pathsData.touchedMap);

  // Port of Observable's nodesToShowText function
  // Walk up from asset until hitting a split (multiple parents)
  // This determines which nodes get permanent visible labels (the "spine" of the tree)
  const nodesToShowText = $derived.by(() => {
    // Find the actual root node (the asset)
    const rootNode = nodes.find((n) => n.type === 'asset' || n.id === rootId || n.is_root);
    const startId = rootNode?.id || rootId;

    const nodeList = new Set<string>([startId]);
    let curNodeId = startId;
    let countParents = 1;

    // Walk up the ownership chain, adding nodes while there's only 1 parent
    while (countParents === 1) {
      // Find edges where this node is the target (i.e., find parents)
      const parentEdges = edges.filter(
        (e) => e.target === curNodeId && !nodeList.has(e.source)
      );
      countParents = parentEdges.length;

      // If exactly 1 parent, add it and continue walking
      if (countParents === 1) {
        curNodeId = parentEdges[0].source;
        nodeList.add(curNodeId);
      }
      // Stop when we hit a split (0 or 2+ parents)
    }

    return nodeList;
  });

  // Owners for side panel
  const ownersList = $derived.by(() => {
    return nodes
      .filter((n) => n.type !== 'asset')
      .map((n) => ({
        id: n.id,
        name: n.name || n.Name || n.id,
        pct: pathsMap.get(n.entity_id || n.id) || 0,
        country: n.headquarters_country || 'Unknown',
      }))
      .sort((a, b) => b.pct - a.pct);
  });

  // Text wrapping helper - port of Observable's wrapTextTwoLines
  function wrapText(text: string, maxLen: number = 12): { line1: string; line2?: string } {
    if (text.length <= maxLen) {
      return { line1: text };
    }
    let breakPos = text.lastIndexOf(' ', maxLen);
    if (breakPos === -1) breakPos = maxLen;

    const line1 = text.slice(0, breakPos).trim();
    let rest = text.slice(breakPos).trim();

    if (rest.length > maxLen) {
      return { line1, line2: rest.slice(0, maxLen - 1).trim() + '…' };
    }
    return { line1, line2: rest };
  }

  // Compute label positioning for nodes at same rank
  // Port of Observable's placeOwnerLabels logic
  function computeLabelPositions(layoutNodes: any[], nodeRanks: Map<string, number>) {
    const byRank = new Map<number, any[]>();

    // Group nodes by rank
    layoutNodes.forEach((n) => {
      if (n.isAsset) return;
      const rank = nodeRanks.get(n.id) ?? 0;
      if (!byRank.has(rank)) byRank.set(rank, []);
      byRank.get(rank)!.push(n);
    });

    // Process each rank
    byRank.forEach((nodesAtRank) => {
      nodesAtRank.sort((a, b) => a.x - b.x);
      const count = nodesAtRank.length;

      if (count === 1) {
        // Single node at rank - show centered below
        nodesAtRank[0].labelPos = { dx: 0, dy: nodesAtRank[0].r + 12, below: false };
        return;
      }

      // Check gaps between adjacent nodes
      const gaps: number[] = [];
      for (let i = 0; i < count - 1; i++) {
        gaps.push(nodesAtRank[i + 1].x - nodesAtRank[i].x);
      }

      // Estimate label width (rough approximation: 6px per char)
      const avgLabelWidth = 80;
      const minGapNeeded = avgLabelWidth + nodeR * 2;

      // Check if all gaps are clear
      const allClear = gaps.every((gap) => gap >= minGapNeeded);

      if (allClear) {
        // Enough space - show all centered
        nodesAtRank.forEach((n) => {
          n.labelPos = { dx: 0, dy: n.r + 12, below: false };
        });
        return;
      }

      // Two nodes - try moving left one to the left
      if (count === 2) {
        const left = nodesAtRank[0];
        const right = nodesAtRank[1];
        if (left.x > 50) {
          // Enough room on left side
          left.labelPos = { dx: -avgLabelWidth - left.r, dy: 0, below: false };
          right.labelPos = { dx: 0, dy: right.r + 12, below: false };
          return;
        }
      }

      // Fallback: stack labels below with smaller font
      nodesAtRank.forEach((n) => {
        n.labelPos = { dx: 0, dy: n.r * 2 + 8, below: true, small: true };
      });
    });
  }

  // Pie arc generator
  function pieArc(pct: number, r: number): string {
    if (pct <= 0) return '';
    const angle = (Math.min(pct, 100) / 100) * 2 * Math.PI;
    if (pct >= 100) return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r}`;
    const x = Math.sin(angle) * r;
    const y = -Math.cos(angle) * r;
    return `M 0 0 L 0 ${-r} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${x} ${y} Z`;
  }

  // Edge path generator
  function edgePath(pts: any[]): string {
    if (!pts || pts.length < 2) return '';
    return d3.line<any>().x((d) => d.x).y((d) => d.y).curve(d3.curveBasis)(pts) || '';
  }

  // Run layout
  function runLayout() {
    if (!dagre || nodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'BT', nodesep: nodeR * 3, ranksep: 60, marginx: 50, marginy: 50 });
    g.setDefaultEdgeLabel(() => ({}));

    // Add all nodes
    nodes.forEach((n) => {
      const isAsset = n.type === 'asset' || n.id === rootId;
      g.setNode(n.id, {
        width: isAsset ? 180 : nodeR * 2,
        height: isAsset ? 36 : nodeR * 2,
      });
    });

    // Add all edges
    edges.forEach((e) => g.setEdge(e.source, e.target));

    // Compute layout
    dagre.layout(g);

    // Build rank map from y positions (dagre assigns discrete ranks via y)
    const yPositions = new Map<string, number>();
    g.nodes().forEach((id: string) => {
      const pos = g.node(id);
      yPositions.set(id, Math.round(pos.y));
    });

    // Convert y positions to discrete ranks
    const uniqueYs = [...new Set(yPositions.values())].sort((a, b) => b - a); // highest y = rank 0 (bottom)
    const yToRank = new Map(uniqueYs.map((y, i) => [y, i]));
    nodeRanks = new Map(
      [...yPositions.entries()].map(([id, y]) => [id, yToRank.get(y) ?? 0])
    );

    // Extract positioned nodes
    const rawLayoutNodes = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = nodes.find((n) => n.id === id);
      const isAsset = orig?.type === 'asset' || id === rootId;
      const pct = pathsMap.get(orig?.entity_id || id) || 0;
      return {
        id,
        x: pos.x,
        y: pos.y,
        w: pos.width,
        h: pos.height,
        isAsset,
        label: orig?.name || orig?.Name || id,
        pct,
        r: isAsset ? 0 : nodeR,
        labelPos: { dx: 0, dy: nodeR + 12, below: false, small: false },
      };
    });

    // Compute label positions based on ranks
    computeLabelPositions(rawLayoutNodes, nodeRanks);
    layoutNodes = rawLayoutNodes;

    // Extract positioned edges with imputed_share flag
    layoutEdges = g.edges().map((e: any) => {
      const ed = g.edge(e);
      const orig = edges.find((x) => x.source === e.v && x.target === e.w);
      return {
        source: e.v,
        target: e.w,
        points: ed.points,
        value: orig?.value || 0,
        imputed_share: orig?.imputed_share || false,
      };
    });

    gWidth = (g.graph() as any).width || 400;
    gHeight = (g.graph() as any).height || 300;
  }

  // Should this node show its label?
  // Matches Observable: only show labels on direct chain + hovered node
  function shouldShowLabel(n: any): boolean {
    // Always show asset label
    if (n.isAsset) return true;
    // Always show on hover
    if (hoveredId === n.id) return true;
    // Show for nodes in the direct chain (nodesToShowText) - the "spine" of the tree
    if (nodesToShowText.has(n.id)) return true;
    // For very small graphs (< 6 nodes), show all
    if (layoutNodes.length < 6) return true;
    // Otherwise, hide to prevent collisions
    return false;
  }

  // Handle clicks
  function clickNode(n: any) {
    goto(n.isAsset ? assetLink(n.id) : entityLink(n.id));
  }

  // Handle hover - like Observable's highlightNodes
  function handleNodeHover(n: any) {
    hoveredId = n.id;
    // Get the paths data for this node to know which nodes/edges to highlight
    const entityId = nodes.find((node) => node.id === n.id)?.entity_id || n.id;
    hoveredNodeData = pathsTouchedMap.get(entityId) || null;
  }

  // Handle mouse leave - like Observable's clearNodes
  function handleNodeLeave() {
    hoveredId = null;
    hoveredNodeData = null;
  }

  // Check if a node should be faded (not on the path)
  function getNodeOpacity(n: any): number {
    if (!hoveredId || !hoveredNodeData) return 1;
    if (n.isAsset) return 1; // Asset always visible
    if (n.id === hoveredId) return 1; // Hovered node always visible
    // Fade non-path nodes to 0.1 like Observable
    return hoveredNodeData.nodesTouched.includes(n.id) ? 1 : 0.1;
  }

  // Check if edge should be faded
  function getEdgeOpacity(edgeIdx: number): number {
    if (!hoveredId || !hoveredNodeData) return 1;
    return hoveredNodeData.edgeIndices.includes(edgeIdx) ? 0.7 : 0.1;
  }

  // Check if edge label should be shown (only on hover path)
  function shouldShowEdgeLabel(edgeIdx: number): boolean {
    if (!hoveredId || !hoveredNodeData) return false; // Hidden by default
    return hoveredNodeData.edgeIndices.includes(edgeIdx);
  }

  onMount(async () => {
    try {
      dagre = await import('dagre');
      runLayout();
      ready = true;
    } catch (e) {
      console.error('Failed to load dagre:', e);
    }
  });

  // Re-run layout when data changes
  $effect(() => {
    if (dagre && nodes.length > 0) runLayout();
  });
</script>

<div class="ownership-tree">
  {#if !ready}
    <div class="msg">Loading...</div>
  {:else if layoutNodes.length === 0}
    <div class="msg">No graph data</div>
  {:else}
    <div class="container">
      <div class="graph-wrap">
        <svg viewBox="0 0 {gWidth} {gHeight}" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={colors.edge} />
            </marker>
          </defs>

          <!-- Edges -->
          {#each layoutEdges as e, idx (e.source + e.target)}
            {@const mid = e.points?.[Math.floor(e.points.length / 2)]}
            {@const showLabel = shouldShowEdgeLabel(idx)}
            {@const opacity = getEdgeOpacity(idx)}
            <g class="edge" style="opacity: {opacity}">
              <path d={edgePath(e.points)} stroke={e.imputed_share ? colors.edgeImputed : colors.edge} stroke-width="1.5" fill="none" marker-end="url(#arr)" />
              {#if e.value && mid && showLabel}
                <text x={mid.x} y={mid.y - 5} class="edge-lbl">{e.value.toFixed(1)}%</text>
              {/if}
            </g>
          {/each}

          <!-- Nodes -->
          {#each layoutNodes as n (n.id)}
            {@const showLabel = shouldShowLabel(n)}
            {@const wrapped = wrapText(n.label, 14)}
            {@const pos = n.labelPos || { dx: 0, dy: n.r + 12 }}
            {@const opacity = getNodeOpacity(n)}
            <g
              class="node"
              class:hovered={hoveredId === n.id}
              class:in-chain={nodesToShowText.has(n.id)}
              transform="translate({n.x},{n.y})"
              style="opacity: {opacity}"
              role="button"
              tabindex="0"
              onclick={() => clickNode(n)}
              onkeydown={(ev) => ev.key === 'Enter' && clickNode(n)}
              onmouseenter={() => handleNodeHover(n)}
              onmouseleave={handleNodeLeave}
            >
              {#if n.isAsset}
                <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx="4" fill={colors.navy} stroke="white" stroke-width="1.5" />
                <text class="asset-lbl" fill={colors.warmWhite}>{n.label.slice(0, 28)}</text>
              {:else}
                <circle r={n.r} fill={colors.nodeFill} stroke="white" stroke-width="1.5" />
                {#if n.pct > 0}
                  <path d={pieArc(n.pct, n.r - 1)} fill={colors.teal} />
                {/if}
                {#if showLabel}
                  <text
                    class="node-lbl"
                    class:small={pos.small}
                    x={pos.dx}
                    y={pos.dy}
                  >
                    <tspan x={pos.dx} dy={wrapped.line2 ? '-0.3em' : '0'}>{wrapped.line1}</tspan>
                    {#if wrapped.line2}
                      <tspan x={pos.dx} dy="1.1em">{wrapped.line2}</tspan>
                    {/if}
                  </text>
                {/if}
              {/if}
            </g>
          {/each}
        </svg>
      </div>

      <!-- Side panel -->
      <div class="panel">
        <h4>Owner Entities</h4>
        <div class="list">
          {#each ownersList as o}
            <div
              class="row"
              class:active={hoveredId === o.id}
              role="button"
              tabindex="0"
              onmouseenter={() => {
                hoveredId = o.id;
                hoveredNodeData = pathsTouchedMap.get(o.id) || null;
              }}
              onmouseleave={handleNodeLeave}
              onclick={() => goto(entityLink(o.id))}
              onkeydown={(ev) => ev.key === 'Enter' && goto(entityLink(o.id))}
            >
              {o.name} ({o.pct.toFixed(1)}%)
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .ownership-tree {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    color: #1a3a4a;
  }
  .msg {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
  }
  .container {
    display: flex;
    gap: 20px;
  }
  .graph-wrap {
    flex: 1;
    background: #fafaf7;
    border: 1px solid #e5e5e5;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 350px;
    max-height: 550px;
  }
  .node {
    cursor: pointer;
    transition: opacity 0.2s ease-out;
  }
  .edge {
    transition: opacity 0.2s ease-out;
  }
  .node.in-chain circle {
    stroke-width: 2;
  }
  .node.hovered circle {
    stroke: #97E6DE;
    stroke-width: 3;
  }
  .asset-lbl, .node-lbl {
    font-size: 11px;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }
  .asset-lbl {
    font-weight: 600;
  }
  .node-lbl {
    dominant-baseline: hanging;
    fill: #1a3a4a;
  }
  .node-lbl.small {
    font-size: 9px;
  }
  .node.hovered .node-lbl {
    font-weight: 600;
  }
  .edge-lbl {
    font-size: 10px;
    fill: #2a7f8f;
    text-anchor: middle;
  }
  .panel {
    min-width: 220px;
    max-width: 260px;
    background: #fafaf7;
    border-left: 2px solid #2a7f8f;
    padding: 12px 16px;
  }
  .panel h4 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
  }
  .list {
    max-height: 300px;
    overflow-y: auto;
  }
  .row {
    font-size: 12px;
    padding: 3px 0;
    cursor: pointer;
  }
  .row:hover, .row.active {
    color: #2a7f8f;
    text-decoration: underline;
  }
</style>
