<script lang="ts">
  /**
   * OwnershipTreeGraph - Port from Observable notebook
   * Uses dagre for layout, Svelte for rendering
   * Label logic ported from Observable's nodesToShowText/placeOwnerLabels
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import { sum } from 'd3-array';
  import { line, curveBasis } from 'd3-shape';
  import type {
    GraphNode,
    GraphEdge,
    OwnershipPathEntry,
    LayoutPoint,
    LayoutNode,
    LayoutEdge,
    DagreEdge,
  } from '$lib/component-data/graph-types';

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    paths?: Record<string, OwnershipPathEntry[]>;
    rootId?: string;
    compact?: boolean;
    /** Optional label for the root asset (passed by some callers, reserved for future use) */
    assetName?: string;
  }

  let { nodes = [], edges = [], paths = {}, rootId = '', compact = false }: Props = $props();

  // Design tokens (from Observable notebook)
  const C = {
    navy: '#1a3a4a',
    teal: '#2a7f8f',
    mint: '#97E6DE',
    warmWhite: '#fafaf7',
    nodeFill: '#cce1e6',
    edge: '#9fc6d0',
    edgeImputed: '#cdcdcd',
  };

  let dagre: typeof import('dagre') | null = null;
  let ready = $state(false);
  let hoveredId = $state<string | null>(null);
  let hoveredNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let layoutNodes = $state<LayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());

  // Large graph threshold — enables scrollable mode with explicit SVG dimensions
  const isLargeGraph = $derived(!compact && nodes.length > 30);

  // Node radius — scale down for large graphs
  const nodeR = $derived(
    compact ? 10 : nodes.length < 10 ? 17 : nodes.length < 25 ? 14 : nodes.length < 80 ? 11 : 8
  );

  // Process paths: compute cumulative ownership % and track which nodes/edges
  // each terminal entity touches (for hover-based path highlighting)
  const pathsData = $derived.by(() => {
    const pctMap = new Map<string, number>();
    const touchedMap = new Map<string, { nodesTouched: string[]; edgeIndices: number[] }>();
    if (!paths) return { pctMap, touchedMap };

    // O(1) edge lookup instead of O(n) findIndex per path segment
    const edgeIndex = new Map<string, number>();
    edges.forEach((e, i) => edgeIndex.set(`${e.source}->${e.target}`, i));

    for (const [id, arr] of Object.entries(paths)) {
      if (!Array.isArray(arr)) continue;

      // Sum all path cumulative percentages for this terminal
      pctMap.set(id, sum(arr.map((p: OwnershipPathEntry) => p.cumulative_pct || 0)));

      // Collect every node and edge on any route to this terminal
      const nodesTouched = new Set<string>();
      const edgeIndices = new Set<number>();
      for (const p of arr) {
        if (!p.route) continue;
        for (let i = 0; i < p.route.length; i++) {
          nodesTouched.add(p.route[i]);
          if (i < p.route.length - 1) {
            const idx = edgeIndex.get(`${p.route[i]}->${p.route[i + 1]}`);
            if (idx != null) edgeIndices.add(idx);
          }
        }
      }
      touchedMap.set(id, { nodesTouched: [...nodesTouched], edgeIndices: [...edgeIndices] });
    }
    return { pctMap, touchedMap };
  });

  const pathsMap = $derived(pathsData.pctMap);
  const pathsTouchedMap = $derived(pathsData.touchedMap);

  // "Spine" of the tree: walk up from asset along single-parent edges until
  // reaching a fork. These nodes always show labels (no hover needed).
  const nodesToShowText = $derived.by(() => {
    const startId = nodes.find((n) => n.type === 'asset' || n.id === rootId)?.id || rootId;
    const spine = new Set<string>([startId]);
    let cur = startId;

    while (true) {
      const parents = edges.filter((e) => e.target === cur && !spine.has(e.source));
      if (parents.length !== 1) break; // stop at fork or dead end
      cur = parents[0].source;
      spine.add(cur);
    }
    return spine;
  });

  // Build direct edge percentage lookup as fallback when paths data unavailable
  // Handles both upstream (edges → rootId) and downstream (rootId → edges) directions
  const edgePctMap = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      if (e.value == null) continue;
      if (e.target === rootId) {
        // Upstream: who owns the root
        m.set(e.source, (m.get(e.source) || 0) + e.value);
      } else if (e.source === rootId) {
        // Downstream: what the root owns
        m.set(e.target, (m.get(e.target) || 0) + e.value);
      }
    }
    return m;
  });

  // Owners for side panel (sorted by cumulative ownership %)
  // Falls back to direct edge percentages when paths data is unavailable
  const ownersList = $derived(
    nodes
      .filter((n) => n.type !== 'asset' && n.id !== rootId)
      .map((n) => {
        const nid = n.entity_id || n.id;
        return {
          id: n.id,
          name: n.name || n.Name || n.id,
          pct: pathsMap.get(nid) || edgePctMap.get(nid) || 0,
        };
      })
      .sort((a, b) => b.pct - a.pct)
  );

  // Break text into max 2 lines at word boundary, truncate with ellipsis if needed
  function wrapText(text: string, max = 12): { line1: string; line2?: string } {
    if (text.length <= max) return { line1: text };
    const brk = text.lastIndexOf(' ', max);
    const line1 = text.slice(0, brk > 0 ? brk : max).trim();
    const rest = text.slice(line1.length).trim();
    return { line1, line2: rest.length > max ? rest.slice(0, max - 1).trim() + '…' : rest };
  }

  // Position labels to avoid overlap: groups entity nodes by dagre rank,
  // then picks centered/offset/stacked placement based on horizontal spacing
  function computeLabelPositions(lnodes: LayoutNode[], ranks: Map<string, number>) {
    // Group entity nodes by their rank (row in the tree)
    const byRank = new Map<number, LayoutNode[]>();
    for (const n of lnodes) {
      if (n.isAsset) continue;
      const rank = ranks.get(n.id) ?? 0;
      (byRank.get(rank) ?? byRank.set(rank, []).get(rank)!).push(n);
    }

    const labelW = 80; // estimated label width in px
    const minGap = labelW + nodeR * 2;

    for (const nodesAtRank of byRank.values()) {
      nodesAtRank.sort((a: LayoutNode, b: LayoutNode) => a.x - b.x);

      // Single node — simple centered placement
      if (nodesAtRank.length === 1) {
        nodesAtRank[0].labelPos = { dx: 0, dy: nodesAtRank[0].r + 12, below: false };
        continue;
      }

      // Check if all adjacent nodes have enough horizontal space for centered labels
      const allClear = nodesAtRank.every(
        (_: LayoutNode, i: number) => i === 0 || nodesAtRank[i].x - nodesAtRank[i - 1].x >= minGap
      );
      if (allClear) {
        nodesAtRank.forEach((n: LayoutNode) => {
          n.labelPos = { dx: 0, dy: n.r + 12, below: false };
        });
        continue;
      }

      // Two nodes — try offsetting left label to avoid collision
      if (nodesAtRank.length === 2 && nodesAtRank[0].x > 50) {
        nodesAtRank[0].labelPos = { dx: -labelW - nodesAtRank[0].r, dy: 0, below: false };
        nodesAtRank[1].labelPos = { dx: 0, dy: nodesAtRank[1].r + 12, below: false };
        continue;
      }

      // Fallback: stack all labels below nodes with smaller font
      nodesAtRank.forEach((n: LayoutNode) => {
        n.labelPos = { dx: 0, dy: n.r * 2 + 8, below: true, small: true };
      });
    }
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
  function edgePath(pts: LayoutPoint[]): string {
    if (!pts || pts.length < 2) return '';
    return (
      line<LayoutPoint>()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(curveBasis)(pts) || ''
    );
  }

  // Run layout
  function runLayout() {
    if (!dagre || nodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    const isLarge = nodes.length > 30;
    g.setGraph({
      rankdir: 'BT',
      nodesep: compact ? nodeR * 2.5 : isLarge ? nodeR * 4 : nodeR * 3,
      ranksep: compact ? 35 : isLarge ? 80 : 60,
      marginx: compact ? 25 : 50,
      marginy: compact ? 20 : 50,
    });
    g.setDefaultEdgeLabel(() => ({}));

    nodes.forEach((n) => {
      const isAsset = n.type === 'asset' || n.id === rootId;
      g.setNode(n.id, {
        width: isAsset ? (compact ? 120 : 180) : nodeR * 2,
        height: isAsset ? (compact ? 24 : 36) : nodeR * 2,
      });
    });
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);

    // Convert dagre y-positions to discrete rank indices (bottom = rank 0)
    const yPos = new Map(g.nodes().map((id: string) => [id, Math.round(g.node(id).y)] as const));
    const yToRank = new Map(
      [...new Set(yPos.values())].sort((a, b) => b - a).map((y, i) => [y, i])
    );
    nodeRanks = new Map([...yPos].map(([id, y]) => [id, yToRank.get(y) ?? 0]));

    // O(1) lookups instead of O(n) find per node/edge
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edgeByKey = new Map(edges.map((e) => [`${e.source}->${e.target}`, e]));

    const rawLayoutNodes = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = nodeById.get(id);
      const isAsset = orig?.type === 'asset' || id === rootId;
      return {
        id,
        x: pos.x,
        y: pos.y,
        w: pos.width,
        h: pos.height,
        isAsset,
        label: orig?.name || orig?.Name || id,
        pct: pathsMap.get(orig?.entity_id || id) || 0,
        r: isAsset ? 0 : nodeR,
        labelPos: { dx: 0, dy: nodeR + 12, below: false, small: false },
      };
    });

    computeLabelPositions(rawLayoutNodes, nodeRanks);
    layoutNodes = rawLayoutNodes;

    layoutEdges = g.edges().map((e: DagreEdge) => {
      const orig = edgeByKey.get(`${e.v}->${e.w}`);
      return {
        source: e.v,
        target: e.w,
        points: g.edge(e).points,
        value: orig?.value || 0,
        imputed_share: orig?.imputed_share || false,
      };
    });

    const graphMeta = g.graph();
    gWidth = graphMeta.width || 400;
    gHeight = graphMeta.height || 300;
  }

  // Label visibility: asset always, hovered always, spine always, small/medium graphs always
  function shouldShowLabel(n: LayoutNode): boolean {
    if (n.isAsset || hoveredId === n.id || nodesToShowText.has(n.id)) return true;
    if (compact && layoutNodes.length < 10) return true;
    // Show all labels for small/medium graphs
    if (layoutNodes.length < 25) return true;
    // For large graphs in scrollable mode, show all labels since user can scroll
    if (isLargeGraph) return true;
    return false;
  }

  // Navigation: assets go to asset page, entities to entity page
  function clickNode(n: LayoutNode) {
    goto(n.isAsset ? assetLink(n.id) : entityLink(n.id));
  }

  // Hover state management — highlights the path from hovered entity to the asset root
  function handleNodeHover(n: LayoutNode) {
    hoveredId = n.id;
    const entityId = nodes.find((node) => node.id === n.id)?.entity_id || n.id;
    hoveredNodeData = pathsTouchedMap.get(entityId) || null;
  }
  function handleNodeLeave() {
    hoveredId = null;
    hoveredNodeData = null;
  }

  // Hover-aware opacity: nodes/edges not on the active path fade to 0.1
  function getNodeOpacity(n: LayoutNode): number {
    if (!hoveredNodeData) return 1;
    return n.isAsset || n.id === hoveredId || hoveredNodeData.nodesTouched.includes(n.id) ? 1 : 0.1;
  }
  function getEdgeOpacity(idx: number): number {
    if (!hoveredNodeData) return 1;
    return hoveredNodeData.edgeIndices.includes(idx) ? 0.7 : 0.1;
  }
  // Edge labels: always visible in compact/large mode, otherwise only on hover path
  function shouldShowEdgeLabel(idx: number): boolean {
    if (compact || isLargeGraph) return true;
    return !!hoveredNodeData?.edgeIndices.includes(idx);
  }

  let graphWrapEl = $state<HTMLDivElement | null>(null);

  function scrollToRoot() {
    if (!graphWrapEl || !isLargeGraph) return;
    // Find the root node's x position and scroll so it's roughly centered
    const rootNode = layoutNodes.find((n) => n.isAsset || n.id === rootId);
    if (!rootNode) return;
    const scrollX = Math.max(0, rootNode.x - graphWrapEl.clientWidth / 2);
    graphWrapEl.scrollLeft = scrollX;
  }

  onMount(async () => {
    try {
      dagre = await import('dagre');
      runLayout();
      ready = true;
      // Auto-scroll to root after first render
      requestAnimationFrame(scrollToRoot);
    } catch (e) {
      if (import.meta.env.DEV) console.error('Failed to load dagre:', e);
    }
  });

  // Re-run layout when data changes
  $effect(() => {
    if (dagre && nodes.length > 0) runLayout();
  });
</script>

<div class="ownership-tree" class:compact>
  {#if !ready}
    <div class="msg">Loading...</div>
  {:else if layoutNodes.length === 0}
    <div class="msg">No graph data</div>
  {:else}
    <div class="container">
      <div class="graph-wrap" bind:this={graphWrapEl}>
        <svg
          viewBox="0 0 {gWidth} {gHeight}"
          preserveAspectRatio="xMidYMid meet"
          style={isLargeGraph
            ? `width: ${Math.max(gWidth, 800)}px; min-height: ${Math.max(gHeight, 600)}px;`
            : ''}
        >
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="6" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={C.edge} />
            </marker>
          </defs>

          <!-- Edges -->
          {#each layoutEdges as e, idx (e.source + e.target)}
            {@const mid = e.points?.[Math.floor(e.points.length / 2)]}
            {@const showLabel = shouldShowEdgeLabel(idx)}
            {@const opacity = getEdgeOpacity(idx)}
            <g class="edge" style="opacity: {opacity}">
              <path
                d={edgePath(e.points)}
                stroke={e.imputed_share ? C.edgeImputed : C.edge}
                stroke-width="1.5"
                fill="none"
                marker-end="url(#arr)"
              />
              {#if e.value && mid && showLabel}
                <text x={mid.x} y={mid.y - 5} class="edge-lbl">{e.value.toFixed(1)}%</text>
              {/if}
            </g>
          {/each}

          <!-- Nodes -->
          {#each layoutNodes as n (n.id)}
            {@const showLabel = shouldShowLabel(n)}
            {@const wrapped = wrapText(n.label, compact ? 10 : 14)}
            {@const pos = n.labelPos || { dx: 0, dy: n.r + 12, below: false, small: false }}
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
                <rect
                  x={-n.w / 2}
                  y={-n.h / 2}
                  width={n.w}
                  height={n.h}
                  rx="4"
                  fill={C.navy}
                  stroke="white"
                  stroke-width="1.5"
                />
                <text class="asset-lbl" fill={C.warmWhite}
                  >{n.label.slice(0, compact ? 18 : 28)}</text
                >
              {:else}
                <circle r={n.r} fill={C.nodeFill} stroke="white" stroke-width="1.5" />
                {#if n.pct > 0}
                  <path d={pieArc(n.pct, n.r - 1)} fill={C.teal} />
                {/if}
                {#if showLabel}
                  <text class="node-lbl" class:small={pos.small} x={pos.dx} y={pos.dy}>
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

      <!-- Side panel (hidden in compact mode) -->
      {#if !compact}
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
      {/if}
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
    overflow: auto;
    max-height: 700px;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 350px;
  }
  .compact svg {
    min-height: 120px;
    max-height: 200px;
  }
  .compact .graph-wrap {
    border: none;
    background: transparent;
  }
  .compact .container {
    gap: 0;
  }
  .compact .asset-lbl,
  .compact .node-lbl {
    font-size: 9px;
  }
  .compact .edge-lbl {
    font-size: 8px;
  }
  .node,
  .edge {
    transition: opacity 0.2s ease-out;
  }
  .node {
    cursor: pointer;
  }
  .node.in-chain circle {
    stroke-width: 2;
  }
  .node.hovered circle {
    stroke: #97e6de;
    stroke-width: 3;
  }
  .asset-lbl,
  .node-lbl {
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
  .row:hover,
  .row.active {
    color: #2a7f8f;
    text-decoration: underline;
  }
</style>
