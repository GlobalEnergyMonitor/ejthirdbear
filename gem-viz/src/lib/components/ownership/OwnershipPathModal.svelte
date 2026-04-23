<script lang="ts">
  /**
   * OwnershipPathModal — vertical DAG showing paths from a single entity
   * to the root asset. Self-contained: caller passes pre-filtered nodes
   * and edges (just the path subgraph). Works in ControlChain and any
   * other context that can supply an appropriate subgraph.
   *
   * Double-clicking a node navigates to its profile page.
   */
  import { onMount, tick } from 'svelte';
  import { spring } from 'svelte/motion';
  import { select } from 'd3-selection';
  import type {
    GraphNode,
    GraphEdge,
    LayoutNode,
    LayoutEdge,
    LayoutPoint,
    DagreEdge,
  } from '$lib/component-data/graph-types';
  import {
    TREE_COLORS as C,
    wrapText,
    pieArc,
    edgePath,
    trimEdgeToNode,
    getNodeColors,
    NODE_RADIUS,
    DAGRE,
    GRAPH_MARGIN,
    ZOOM,
  } from './ownership-tree-utils';
  import WidgetModal from '$lib/components/overlay/WidgetModal.svelte';
  import { entityLink, assetLink } from '$lib/links';

  interface Props {
    open: boolean;
    onClose: () => void;
    /** Name of the focal entity (shown in modal title) */
    entityName: string;
    /** Name of the root asset (shown as context in header) */
    rootName?: string;
    /** Pre-filtered graph nodes — just nodes on the path subgraph */
    nodes: GraphNode[];
    /** Pre-filtered graph edges — just edges on the path subgraph */
    edges: GraphEdge[];
    /** The root asset node ID */
    rootId: string;
    /** Cumulative ownership % per entity_id (for pie arcs) */
    pathsMap?: Map<string, number>;
    /** Fallback edge % per entity_id */
    edgePctMap?: Map<string, number>;
    /** Optional navigation callback (used by embed context instead of goto) */
    onNavigate?: (_url: string) => void;
  }

  let {
    open,
    onClose,
    entityName,
    rootName,
    nodes,
    edges,
    rootId,
    pathsMap = new Map(),
    edgePctMap = new Map(),
    onNavigate,
  }: Props = $props();

  let dagre: typeof import('dagre') | null = null;
  let dagreD3: typeof import('dagre-d3') | null = null;
  let ready = $state(false);
  let layoutNodes = $state<LayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());
  let graphWrapEl = $state<HTMLDivElement | null>(null);
  let hasAutoFit = $state(false);

  const zoomSpring = spring(1, { stiffness: 0.2, damping: 0.85 });
  const panXSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  const panYSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  let isPanning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;

  const nodeR = $derived(
    nodes.length < 10
      ? NODE_RADIUS.small
      : nodes.length <= 25
        ? NODE_RADIUS.medium
        : NODE_RADIUS.large
  );

  const svgMargins = GRAPH_MARGIN;
  const fullW = $derived(gWidth + svgMargins.left + svgMargins.right);
  const fullH = $derived(gHeight + svgMargins.top + svgMargins.bottom);
  const vbW = $derived(fullW / $zoomSpring);
  const vbH = $derived(fullH / $zoomSpring);
  const vbX = $derived(-svgMargins.left + (fullW - vbW) / 2 + $panXSpring);
  const vbY = $derived(-svgMargins.top + (fullH - vbH) / 2 + $panYSpring);

  // Count nodes per rank — used to decide whether to show full or truncated labels
  const nodesPerRank = $derived.by(() => {
    const m = new Map<number, number>();
    for (const [, rank] of nodeRanks) {
      m.set(rank, (m.get(rank) ?? 0) + 1);
    }
    return m;
  });

  function labelMaxCharsForNode(n: LayoutNode): number {
    const rank = nodeRanks.get(n.id) ?? 0;
    const count = nodesPerRank.get(rank) ?? 1;
    // Single node in rank → show full name (wrapText at ~40 still wraps at word boundary)
    return count === 1 ? 40 : 14;
  }

  function runLayout() {
    if (!dagre || !dagreD3 || nodes.length === 0) return;

    const nodeCount = nodes.length;
    const dynamicNodeSep = Math.max(2, Math.min(30, 30 - (nodeCount - 5) * (28 / 35)));

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'BT', // bottom-to-top: asset at bottom, owners above
      nodesep: dynamicNodeSep,
      ranksep: DAGRE.ranksep,
      edgesep: DAGRE.edgesep,
      marginx: nodeR,
      marginy: nodeR,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Identify small-ownership nodes for edge weighting
    const smallOwnershipSet = new Set<string>();
    nodes.forEach((n) => {
      const pct =
        pathsMap.get(n.entity_id || n.id) || edgePctMap.get(n.entity_id || n.id) || 0;
      if (n.type !== 'asset' && n.id !== rootId && pct < 2) {
        smallOwnershipSet.add(n.id);
      }
    });

    const ASSET_W_MIN = 180;
    const ASSET_W_MAX = 360;
    const ASSET_CHAR_W = 9;
    const ASSET_PAD = 28;

    nodes.forEach((n) => {
      const isAsset = n.type === 'asset' || n.id === rootId;
      const assetLabel = n.name || n.Name || n.id || '';
      const desiredW = assetLabel.length * ASSET_CHAR_W + ASSET_PAD;
      const assetW = Math.max(ASSET_W_MIN, Math.min(ASSET_W_MAX, desiredW));
      const assetH = n.asset_type ? 48 : 36;
      const entityW = Math.max(nodeR * 2, nodeR * 2 + 10);

      g.setNode(n.id, {
        width: isAsset ? assetW : entityW,
        height: isAsset ? assetH : nodeR * 2,
        shape: isAsset ? 'rect' : 'circleCustom',
        r: isAsset ? undefined : nodeR,
      });
    });

    edges.forEach((e) => {
      const srcIsAsset =
        e.source === rootId || nodes.find((n) => n.id === e.source)?.type === 'asset';
      const tgtIsAsset =
        e.target === rootId || nodes.find((n) => n.id === e.target)?.type === 'asset';
      let weight = 3;
      if (!srcIsAsset && !tgtIsAsset) {
        const srcSmall = smallOwnershipSet.has(e.source);
        const tgtSmall = smallOwnershipSet.has(e.target);
        if (srcSmall && tgtSmall) weight = 1;
        else if (srcSmall || tgtSmall) weight = 2;
      }
      g.setEdge(e.source, e.target, { weight });
    });

    const _dagreD3 = dagreD3;
    const renderer = new _dagreD3.render();

    (renderer.shapes() as any).circleCustom = function (parent: any, _bbox: any, node: any) {
      const w = node.width;
      const h = node.height;
      const r = node.r;
      parent
        .insert('rect', ':first-child')
        .attr('x', -w / 2)
        .attr('y', -h / 2)
        .attr('width', w)
        .attr('height', h)
        .attr('fill', 'transparent')
        .attr('stroke', 'transparent');
      parent.insert('circle', ':first-child').attr('cx', 0).attr('cy', 0).attr('r', r);
      node.intersect = (p: any) => (_dagreD3.intersect as any).circle(node, r, p);
      return parent;
    };

    const hiddenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hiddenSvg.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;opacity:0;pointer-events:none;width:1px;height:1px';
    document.body.appendChild(hiddenSvg);
    let layoutOk = true;
    try {
      renderer(select(hiddenSvg).append('g') as any, g);
    } catch {
      layoutOk = false;
    } finally {
      document.body.removeChild(hiddenSvg);
    }

    // BFS fallback if dagre produced NaN positions
    const anyNaN = !layoutOk || g.nodes().some((id: string) => !Number.isFinite(g.node(id).x));
    if (anyNaN) {
      const rankById = new Map<string, number>();
      rankById.set(rootId, 0);
      const queue: string[] = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        const depth = rankById.get(cur)!;
        for (const e of edges) {
          const next = e.target === cur ? e.source : e.source === cur ? e.target : null;
          if (next && !rankById.has(next)) {
            rankById.set(next, depth + 1);
            queue.push(next);
          }
        }
      }
      const maxRank = Math.max(0, ...rankById.values());
      g.nodes().forEach((id: string) => {
        if (!rankById.has(id)) rankById.set(id, maxRank + 1);
      });
      const ranksep = 116;
      const byRank = new Map<number, string[]>();
      for (const [id, r] of rankById) {
        const ids = byRank.get(r) ?? [];
        ids.push(id);
        byRank.set(r, ids);
      }
      for (const [r, ids] of byRank) {
        const widths = ids.map((id: string) => g.node(id).width || nodeR * 2);
        const gap = dynamicNodeSep;
        const total = widths.reduce((a, b) => a + b, 0) + gap * (ids.length - 1);
        let x = -total / 2;
        const y = -r * ranksep; // BT: root at y=0 (bottom), owners at negative y (top)
        ids.forEach((id: string, i: number) => {
          const node = g.node(id);
          node.x = x + widths[i] / 2;
          node.y = y;
          x += widths[i] + gap;
        });
      }
    }

    // Compute rank indices: BT = root at bottom (highest dagre y) = rank 0
    const yPos = new Map(g.nodes().map((id: string) => [id, Math.round(g.node(id).y)] as const));
    const yToRank = new Map(
      [...new Set(yPos.values())]
        .sort((a, b) => b - a) // descending: highest y → rank 0 (root)
        .map((y, i) => [y, i])
    );
    nodeRanks = new Map([...yPos].map(([id, y]) => [id, yToRank.get(y) ?? 0]));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edgeByKey = new Map<string, Map<string, (typeof edges)[0]>>();
    for (const e of edges) {
      let m = edgeByKey.get(e.source);
      if (!m) {
        m = new Map();
        edgeByKey.set(e.source, m);
      }
      m.set(e.target, e);
    }

    const rawLayoutNodes: LayoutNode[] = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = nodeById.get(id);
      const isAsset = orig?.type === 'asset' || id === rootId;
      const pct =
        pathsMap.get(orig?.entity_id || id) || edgePctMap.get(orig?.entity_id || id) || 0;
      const isSmallOwnership = !isAsset && pct < 2;
      const r = isAsset ? 0 : isSmallOwnership ? nodeR * 0.5 : nodeR;
      const circlePad = Math.round(nodeR * 0.18);
      const visualR = isAsset
        ? 0
        : r - (isSmallOwnership ? 0.75 : 2) - circlePad * (isSmallOwnership ? 0.5 : 1);
      return {
        id,
        x: pos.x,
        y: pos.y,
        w: pos.width,
        h: pos.height,
        isAsset,
        label: orig?.name || orig?.Name || id,
        pct,
        r,
        visualR,
        isSmallOwnership,
        labelPos: { dx: 0, dy: nodeR + Math.round(nodeR * 0.12), below: false, small: false },
        rank: 0,
      };
    });

    for (const n of rawLayoutNodes) {
      n.rank = nodeRanks.get(n.id) ?? 0;
    }

    layoutNodes = rawLayoutNodes;

    const layoutNodeById = new Map(rawLayoutNodes.map((n) => [n.id, n]));
    const strokeHalfFor = (n: LayoutNode) => (n.isSmallOwnership ? 0.75 : 2);
    const trimRadiusFor = (n: LayoutNode) => (n.isAsset ? 0 : n.visualR + strokeHalfFor(n));
    const trimFromStart = (pts: LayoutPoint[], n: LayoutNode) =>
      trimEdgeToNode(pts, n.x, n.y, trimRadiusFor(n), n.isAsset, n.w, n.h);
    const trimFromEnd = (pts: LayoutPoint[], n: LayoutNode) =>
      trimFromStart([...pts].reverse(), n).reverse();

    layoutEdges = g.edges().map((e: DagreEdge) => {
      const orig = edgeByKey.get(e.v)?.get(e.w);
      let pts: LayoutPoint[] = g.edge(e).points;
      const srcNode = layoutNodeById.get(e.v);
      const tgtNode = layoutNodeById.get(e.w);
      if (srcNode) pts = trimFromStart(pts, srcNode);
      if (tgtNode) pts = trimFromEnd(pts, tgtNode);
      return {
        source: e.v,
        target: e.w,
        points: pts,
        value: orig?.value || 0,
        imputed_share: orig?.imputed_share || false,
        closes_cycle: orig?.closes_cycle || false,
      };
    });

    const graphMeta = g.graph();
    gWidth = graphMeta.width || 400;
    gHeight = graphMeta.height || 300;
  }

  function fitToContent(hard = true) {
    if (!graphWrapEl) return;
    const svgEl = graphWrapEl.querySelector('svg');
    if (!svgEl) return;
    const contentGroup = svgEl.querySelector('g');
    if (!contentGroup) return;
    const bbox = contentGroup.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return;
    const pad = 50;
    const needW = bbox.width + pad * 2;
    const needH = bbox.height + pad * 2;
    const z = Math.max(ZOOM.min, Math.min(1, fullW / needW, fullH / needH));
    const contentCX = bbox.x + bbox.width / 2;
    const contentCY = bbox.y + bbox.height / 2;
    const defaultCX = -svgMargins.left + fullW / 2;
    const defaultCY = -svgMargins.top + fullH / 2;
    const opts = hard ? { hard: true } : undefined;
    zoomSpring.set(z, opts);
    panXSpring.set(contentCX - defaultCX, opts);
    panYSpring.set(contentCY - defaultCY, opts);
  }

  function zoomBy(step: number) {
    const cur = $zoomSpring;
    const next = Math.max(ZOOM.min, Math.min(ZOOM.max, +(cur + step).toFixed(2)));
    zoomSpring.set(next);
  }

  function resetView() {
    fitToContent(false);
  }

  function startPan(ev: PointerEvent) {
    const path = ev.composedPath();
    for (const node of path) {
      const el = node as Element | null;
      if (el?.classList?.contains('node') || el?.classList?.contains('zoom-stack')) return;
    }
    isPanning = true;
    panStartX = ev.clientX;
    panStartY = ev.clientY;
    panStartPanX = $panXSpring;
    panStartPanY = $panYSpring;
    (ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId);
  }

  function movePan(ev: PointerEvent) {
    if (!isPanning) return;
    const svgEl = graphWrapEl?.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const pxToSvg = vbW / rect.width;
    panXSpring.set(panStartPanX - (ev.clientX - panStartX) * pxToSvg, { hard: true });
    panYSpring.set(panStartPanY - (ev.clientY - panStartY) * pxToSvg, { hard: true });
  }

  function endPan(ev?: PointerEvent) {
    if (ev) {
      try {
        (ev.currentTarget as Element)?.releasePointerCapture?.(ev.pointerId);
      } catch {
        /* no active capture */
      }
    }
    isPanning = false;
  }

  function onGraphWheel(ev: WheelEvent) {
    ev.preventDefault();
    const delta = ev.deltaY > 0 ? -ZOOM.wheelStep : ZOOM.wheelStep;
    const cur = $zoomSpring;
    const next = Math.max(ZOOM.min, Math.min(ZOOM.max, +(cur + delta).toFixed(2)));
    zoomSpring.set(next, { hard: true });
  }

  function navigate(url: string) {
    if (onNavigate) {
      onNavigate(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  onMount(() => {
    void (async () => {
      try {
        [dagre, dagreD3] = await Promise.all([import('dagre'), import('dagre-d3')]);
        try {
          runLayout();
        } catch {
          /* layout error — BFS fallback already fires inside runLayout */
        }
        ready = true;
        await tick();
        requestAnimationFrame(() => {
          fitToContent(true);
          hasAutoFit = true;
        });
      } catch {
        ready = true;
      }
    })();
  });

  // Re-run layout when nodes/edges change (e.g. caller switches focused entity)
  $effect(() => {
    if (dagre && nodes.length > 0) {
      runLayout();
      if (hasAutoFit) {
        tick().then(() => requestAnimationFrame(() => fitToContent(true)));
      }
    }
  });

  // Re-fit when modal opens after initial mount
  $effect(() => {
    if (open && ready && layoutNodes.length > 0) {
      tick().then(() => requestAnimationFrame(() => fitToContent(true)));
    }
  });
</script>

<WidgetModal
  {open}
  {onClose}
  label="Ownership Path"
  title={entityName}
  ariaLabel="Ownership path for {entityName}"
>
  {#snippet headerSub()}
    {#if rootName}
      <span class="header-arrow">→ {rootName}</span>
    {/if}
  {/snippet}
  {#snippet body()}
    <div class="path-modal-body">
      {#if !ready}
        <div class="msg">Loading...</div>
      {:else if layoutNodes.length === 0}
        <div class="msg">No path data available</div>
      {:else}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="graph-wrap"
          class:panning={isPanning}
          bind:this={graphWrapEl}
          role="application"
          onpointerdown={startPan}
          onpointermove={movePan}
          onpointerup={endPan}
          onpointercancel={endPan}
          onpointerleave={endPan}
          onwheel={onGraphWheel}
        >
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <svg
            viewBox="{vbX} {vbY} {vbW} {vbH}"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Ownership path from {entityName} to {rootName ?? 'asset'}"
          >
            <defs>
              <marker
                id="opm-arr"
                markerWidth="10"
                markerHeight="10"
                refX="5"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
                viewBox="0 0 10 10"
              >
                <path d="M -5 0 L 5 5 L -5 10 Z" fill={C.edge} />
              </marker>
              <marker
                id="opm-arr-imputed"
                markerWidth="10"
                markerHeight="10"
                refX="5"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
                viewBox="0 0 10 10"
              >
                <path d="M -5 0 L 5 5 L -5 10 Z" fill={C.edgeImputed} />
              </marker>
            </defs>
            <g style="isolation: isolate">
              <!-- Edges -->
              {#each layoutEdges as e (e.source + e.target)}
                {@const mid = e.points?.[Math.floor(e.points.length / 2)]}
                {@const sourceNode = layoutNodes.find((nd) => nd.id === e.source)}
                {@const sourcePct = sourceNode?.pct ?? 0}
                {@const isSmall = sourcePct < 2}
                {@const baseWidth = isSmall
                  ? e.imputed_share
                    ? 0.9
                    : 0.95
                  : e.imputed_share
                    ? 1.25
                    : 1.5}
                {@const scaleFactor = Math.min(
                  1.75,
                  Math.max(0.9, 0.9 + Math.pow(Math.min(sourcePct, 50) / 50, 2) * 0.85)
                )}
                {@const strokeW = baseWidth * scaleFactor}
                <g class="edge">
                  <path
                    d={edgePath(e.points)}
                    stroke={e.imputed_share ? C.edgeImputed : C.edge}
                    stroke-width={strokeW}
                    stroke-linecap="round"
                    fill="none"
                    marker-end="url(#{e.imputed_share ? 'opm-arr-imputed' : 'opm-arr'})"
                  />
                  {#if e.value && mid}
                    <text
                      x={mid.x}
                      y={mid.y - 5}
                      class="edge-lbl"
                      style="fill: {e.imputed_share ? '#8fa3aa' : C.teal}"
                    >
                      {Number.isInteger(e.value) ? e.value : e.value.toFixed(1)}%
                    </text>
                  {/if}
                </g>
              {/each}

              <!-- Nodes -->
              {#each layoutNodes as n (n.id)}
                {@const maxChars = labelMaxCharsForNode(n)}
                {@const wrapped = wrapText(n.label, maxChars)}
                {@const labelGap = Math.round(nodeR * 0.12)}
                <g
                  class="node"
                  transform="translate({n.x},{n.y})"
                  role="button"
                  tabindex="0"
                  ondblclick={() => navigate(n.isAsset ? assetLink(n.id) : entityLink(n.id))}
                  onkeydown={(ev) => {
                    if (ev.key === 'Enter')
                      navigate(n.isAsset ? assetLink(n.id) : entityLink(n.id));
                  }}
                >
                  {#if n.isAsset}
                    {@const assetNode = nodes.find((nd) => nd.id === n.id)}
                    {@const assetType = assetNode?.asset_type || ''}
                    <rect
                      x={-n.w / 2}
                      y={-n.h / 2}
                      width={n.w}
                      height={n.h}
                      rx="8"
                      fill={C.teal}
                      stroke="none"
                    />
                    <foreignObject
                      x={-n.w / 2}
                      y={-n.h / 2}
                      width={n.w}
                      height={n.h}
                      style="pointer-events: none;"
                    >
                      <div class="asset-card" class:has-sub={assetType}>
                        {#if assetType}
                          <div class="asset-sub" style="color: {C.mint}">{assetType}</div>
                        {/if}
                        <div class="asset-main">{n.label}</div>
                      </div>
                    </foreignObject>
                  {:else}
                    {@const nodeColors = getNodeColors(n.id, rootId, nodes)}
                    {@const circlePad = Math.round(nodeR * 0.18)}
                    {@const visualR =
                      n.r -
                      (n.isSmallOwnership ? 0.75 : 2) -
                      circlePad * (n.isSmallOwnership ? 0.5 : 1)}
                    {@const pieR = visualR - (n.isSmallOwnership ? 0 : 2)}
                    <circle
                      r={visualR}
                      fill={n.isSmallOwnership ? nodeColors.light : nodeColors.bg}
                      stroke={nodeColors.bg}
                      stroke-width={n.isSmallOwnership ? 1.5 : 4}
                      stroke-opacity={n.isSmallOwnership ? 0.7 : 1}
                    />
                    {#if n.pct > 0 && !n.isSmallOwnership}
                      <path
                        d={pieArc(n.pct, pieR)}
                        fill={nodeColors.fg}
                        style="pointer-events: none"
                      />
                    {/if}
                    <text class="node-lbl" x="0" y={nodeR + labelGap}>
                      <tspan x="0" dy={wrapped.line2 ? '-0.7em' : '0'}>{wrapped.line1}</tspan>
                      {#if wrapped.line2}
                        <tspan x="0" dy="1.1em">{wrapped.line2}</tspan>
                      {/if}
                    </text>
                  {/if}
                </g>
              {/each}
            </g>
          </svg>

          <div class="zoom-stack">
            <button type="button" onclick={() => zoomBy(0.2)} title="Zoom in">
              <svg viewBox="0 0 16 16" width="16" height="16"
                ><path
                  d="M8 3v10M3 8h10"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  fill="none"
                /></svg
              >
            </button>
            <button type="button" onclick={() => zoomBy(-0.2)} title="Zoom out">
              <svg viewBox="0 0 16 16" width="16" height="16"
                ><path
                  d="M3 8h10"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  fill="none"
                /></svg
              >
            </button>
            <button type="button" onclick={resetView} title="Reset view" class="home-btn">
              <svg viewBox="0 0 16 16" width="16" height="16"
                ><path
                  d="M3 8.5V13h4v-3h2v3h4V8.5M1 9l7-6 7 6"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                /></svg
              >
            </button>
          </div>

          <div class="dblclick-hint">Double-click a node to view its profile</div>
        </div>
      {/if}
    </div>
  {/snippet}
</WidgetModal>

<style>
  .header-arrow {
    color: var(--color-text-tertiary, #9ca3af);
  }

  .path-modal-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    /* Design tokens matching OwnershipTreeGraph */
    --tree-navy: #1d4961;
    --tree-teal: #004f61;
    --tree-mint: #9df7e5;
    --tree-warm-white: #f2f2eb;
    --tree-node-fill: #becccf;
    --tree-edge: #a5e9e4;
    --tree-edge-imputed: #dce3e5;
    font-family: var(--font-family-sans, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

  .msg {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    color: var(--color-text-tertiary, #888);
    font-size: 12px;
    text-transform: uppercase;
  }

  .graph-wrap {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    position: relative;
    min-height: 400px;
  }

  .graph-wrap.panning {
    cursor: grabbing;
  }

  .graph-wrap.panning,
  .graph-wrap.panning * {
    user-select: none;
  }

  .graph-wrap > svg {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 400px;
  }

  .node {
    cursor: pointer;
  }

  .node circle {
    transition:
      stroke 0.2s ease-out,
      fill 0.2s ease-out;
  }

  .node:hover circle {
    stroke: var(--tree-mint);
    stroke-width: 2.5;
  }

  .node:hover rect {
    stroke: var(--tree-mint);
    stroke-width: 2;
  }

  .node-lbl {
    font-size: 0.82rem;
    letter-spacing: 0.02em;
    font-weight: normal;
    text-anchor: middle;
    dominant-baseline: hanging;
    fill: var(--tree-navy, #1d4961);
    stroke: #fff;
    stroke-width: 3px;
    stroke-linejoin: round;
    paint-order: stroke fill;
    pointer-events: none;
  }

  .edge-lbl {
    font-size: 0.7rem;
    text-anchor: middle;
    dominant-baseline: hanging;
    pointer-events: none;
  }

  .asset-card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4px 14px;
    gap: 2px;
    box-sizing: border-box;
    color: #fff;
    font-family: inherit;
    text-align: center;
    pointer-events: none;
  }

  .asset-sub {
    font-size: 10px;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.075em;
    line-height: 1;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .asset-main {
    font-size: 16px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1.2;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Floating zoom controls */
  .zoom-stack {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
    z-index: 50;
    pointer-events: auto;
    isolation: isolate;
  }

  .zoom-stack button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    background: #fff;
    color: var(--tree-navy, #1d4961);
    cursor: pointer;
    padding: 0;
    transition: background 0.1s;
    pointer-events: auto;
  }

  .zoom-stack button:last-child {
    border-bottom: none;
  }

  .zoom-stack button:hover {
    background: #f0f4f5;
  }

  .zoom-stack .home-btn {
    border-top: 1px solid rgba(0, 0, 0, 0.12);
  }

  .dblclick-hint {
    position: absolute;
    bottom: 12px;
    left: 12px;
    font-size: 11px;
    color: var(--color-text-tertiary, #9ca3af);
    pointer-events: none;
  }
</style>
