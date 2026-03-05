<script lang="ts">
  /**
   * OwnershipTreeGraph - Port from Observable notebook
   * Uses dagre for layout, Svelte for rendering
   * Label logic ported from Observable's nodesToShowText/placeOwnerLabels
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import { colors } from '$lib/design-tokens';
  import { track } from '$lib/analytics';
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

  // Design tokens — aligned with design-tokens.ts
  const C = {
    navy: colors.navy,            // #1D4961
    teal: colors.midnightGreen,   // #004F61 — accent for pie arcs + edge labels
    mint: colors.mint,            // #9DF7E5 — hover ring
    warmWhite: '#fafaf7',         // contrast on dark bg, keep as-is
    nodeFill: colors.gray200,     // #dce3e5
    edge: colors.gray300,         // #BECCCF
    edgeImputed: colors.gray200,  // #dce3e5
  };

  // Category color palette — 5 paired slots + grey fallback
  const CATEGORY_COLORS = [
    { bg: '#f4b7b3', fg: '#7F142A' },  // red
    { bg: '#b3d4f4', fg: '#004F61' },  // blue
    { bg: '#c5b8e8', fg: '#061F5F' },  // purple
    { bg: '#b8e6c5', fg: '#2d7a4f' },  // green
    { bg: '#ffe6b3', fg: '#b37700' },  // amber
  ];
  const CATEGORY_GREY = { bg: '#dce3e5', fg: '#9EAAAD' };

  let colorBy = $state<'entity-type' | 'country'>('entity-type');

  let dagre: typeof import('dagre') | null = null;
  let ready = $state(false);
  let hoveredId = $state<string | null>(null);
  let hoveredNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let frozenId = $state<string | null>(null);
  let frozenNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let hasEverFrozen = $state(false);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let layoutNodes = $state<LayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());

  // Large graph threshold — enables scrollable mode with explicit SVG dimensions
  const isLargeGraph = $derived(!compact && nodes.length > 30);

  // Compute max depth from edge chains (BFS from root)
  const maxDepth = $derived.by(() => {
    if (edges.length === 0) return 0;
    // Build adjacency: target → sources (since BT layout, edges go source→target toward root)
    const children = new Map<string, string[]>();
    for (const e of edges) {
      (children.get(e.target) ?? children.set(e.target, []).get(e.target)!).push(e.source);
    }
    let depth = 0;
    let frontier = [rootId];
    const visited = new Set<string>([rootId]);
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const child of children.get(id) || []) {
          if (!visited.has(child)) {
            visited.add(child);
            next.push(child);
          }
        }
      }
      if (next.length > 0) depth++;
      frontier = next;
    }
    return depth;
  });

  // Label layout mode derived from tree shape
  // 'default' = show all labels centered below
  // 'deep-narrow' = deep tree (>5 ranks) with <25 nodes → compress ranks, labels to right
  // 'large' = ≥25 nodes → hide most labels, show only high-pct or hovered
  const labelMode = $derived<'default' | 'deep-narrow' | 'large'>(
    compact ? 'default' :
    nodes.length >= 25 ? 'large' :
    maxDepth > 5 && nodes.length < 25 ? 'deep-narrow' : 'default'
  );

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

  // Color-by logic: dynamic coloring by entity-type or country
  const colorConfig = $derived.by(() => {
    const entityNodes = nodes.filter((n) => n.type !== 'asset' && n.id !== rootId);

    const entityTypes = new Set(entityNodes.map((n) => n.entity_type).filter(Boolean));
    const countries = new Set(entityNodes.map((n) => n.headquarters_country).filter(Boolean));

    // Smart default: entity-type unless all same → then country
    const autoMode: 'entity-type' | 'country' =
      entityTypes.size > 1 ? 'entity-type' : countries.size > 1 ? 'country' : 'entity-type';
    const showToggle = entityTypes.size > 1 && countries.size > 1;

    // Rank values by cumulative ownership pct
    const mode = colorBy;
    const getValue = (n: GraphNode) =>
      mode === 'country' ? n.headquarters_country : n.entity_type;

    const valuePcts = new Map<string, number>();
    for (const n of entityNodes) {
      const val = getValue(n) || 'Unknown';
      const nid = n.entity_id || n.id;
      const pct = pathsMap.get(nid) || edgePctMap.get(nid) || 0;
      valuePcts.set(val, (valuePcts.get(val) || 0) + pct);
    }

    // Top 5 by cumulative ownership pct
    const ranked = [...valuePcts.entries()].sort((a, b) => b[1] - a[1]);
    const colorMap = new Map<string, { bg: string; fg: string }>();
    ranked.forEach(([val], i) => {
      colorMap.set(val, i < 5 ? CATEGORY_COLORS[i] : CATEGORY_GREY);
    });

    // Legend items
    const legendItems = ranked.slice(0, 5).map(([label], i) => ({
      label,
      ...CATEGORY_COLORS[i],
    }));
    const hasGrey = ranked.length > 5;

    return { colorMap, autoMode, showToggle, legendItems, hasGrey };
  });

  // Set default color mode based on data
  let colorByInitialized = false;
  $effect(() => {
    const auto = colorConfig.autoMode;
    if (!colorByInitialized) {
      colorBy = auto;
      colorByInitialized = true;
    }
  });

  // Get paired colors for a node
  function getNodeColors(nodeId: string): { bg: string; fg: string } {
    const orig = nodes.find((n) => n.id === nodeId);
    if (!orig || orig.type === 'asset' || orig.id === rootId) return { bg: C.nodeFill, fg: C.teal };
    const val =
      (colorBy === 'country' ? orig.headquarters_country : orig.entity_type) || 'Unknown';
    return colorConfig.colorMap.get(val) || CATEGORY_GREY;
  }

  // Owners for side panel — includes highlight flag for color-category filtering.
  // Highlighted entities (in a top-5 color category) sort first, then faded ones.
  const ownersList = $derived.by(() => {
    const list = nodes
      .filter((n) => n.type !== 'asset' && n.id !== rootId)
      .map((n) => {
        const nid = n.entity_id || n.id;
        const val =
          (colorBy === 'country' ? n.headquarters_country : n.entity_type) || 'Unknown';
        const colors = colorConfig.colorMap.get(val) || CATEGORY_GREY;
        const highlighted = colors !== CATEGORY_GREY;
        return {
          id: n.id,
          name: n.name || n.Name || n.id,
          pct: pathsMap.get(nid) || edgePctMap.get(nid) || 0,
          country: n.headquarters_country || '',
          entityType: n.entity_type || '',
          highlighted,
        };
      });
    // Sort: highlighted first by pct desc, then faded by pct desc
    list.sort((a, b) => {
      if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
      return b.pct - a.pct;
    });
    return list;
  });

  // Lookup original GraphNode for tooltip (by hovered layout node id)
  const hoveredGraphNode = $derived(hoveredId ? nodes.find((n) => n.id === hoveredId) : null);
  const hoveredLayoutNode = $derived(hoveredId ? layoutNodes.find((n) => n.id === hoveredId) : null);
  const maxOwnerPct = $derived(ownersList.length > 0 ? ownersList[0].pct : 100);

  // Data-driven narrative text for the context panel
  const narrativeText = $derived.by(() => {
    const entityNodes = nodes.filter((n) => n.type !== 'asset' && n.id !== rootId);
    const totalAccountedPct = Math.min(100, entityNodes.reduce((s, n) => {
      const nid = n.entity_id || n.id;
      // Only count direct owners (not intermediaries) to avoid double-counting
      const directEdge = edges.find((e) => e.source === n.id && e.target === rootId);
      return s + (directEdge?.value || 0);
    }, 0));
    const unknownPct = Math.max(0, 100 - totalAccountedPct);
    const terminalCount = entityNodes.filter((n) => n.is_terminal).length;
    const assetName = nodes.find((n) => n.type === 'asset' || n.id === rootId)?.Name ||
                      nodes.find((n) => n.type === 'asset' || n.id === rootId)?.name || 'this asset';

    // Active entity (frozen takes priority over hovered)
    const focusId = frozenId || hoveredId;
    const focusNode = focusId ? nodes.find((n) => n.id === focusId) : null;

    // Entity-specific narrative
    if (focusNode && focusNode.type !== 'asset' && focusNode.id !== rootId) {
      const name = focusNode.name || focusNode.Name || focusNode.id;
      const nid = focusNode.entity_id || focusNode.id;
      const pct = pathsMap.get(nid) || edgePctMap.get(nid) || 0;
      const country = focusNode.headquarters_country;
      const eType = focusNode.entity_type;
      const isTerminal = focusNode.is_terminal;

      // Count intermediaries in the path
      const pathEntries = paths ? paths[nid] : null;
      const longestRoute = pathEntries
        ? Math.max(...pathEntries.map((p: OwnershipPathEntry) => p.route?.length || 0))
        : 0;
      const intermediaries = Math.max(0, longestRoute - 2); // minus source and target

      const parts: string[] = [];

      // Identity line
      let identity = name;
      if (eType && country) identity += ` is a ${eType} based in ${country}`;
      else if (country) identity += ` is based in ${country}`;
      else if (eType) identity += ` is a ${eType}`;
      parts.push(identity + '.');

      // Ownership line
      if (pct > 0) {
        let ownershipLine = `Holds ${pct.toFixed(1)}% cumulative ownership of ${assetName}`;
        if (intermediaries > 0) {
          ownershipLine += ` through ${intermediaries} intermediar${intermediaries === 1 ? 'y' : 'ies'}`;
        }
        parts.push(ownershipLine + '.');
      }

      // Terminal owner note
      if (isTerminal) {
        parts.push('Ultimate owner — no further parent entities identified.');
      }

      return { lines: parts, mode: 'entity' as const };
    }

    // Default: graph summary
    const lines: string[] = [];
    const directOwners = entityNodes.filter((n) => edges.some((e) => e.source === n.id && e.target === rootId));
    lines.push(
      `${assetName} has ${directOwners.length} direct owner${directOwners.length !== 1 ? 's' : ''}` +
      ` and ${entityNodes.length} entities in its ownership structure.`
    );
    if (unknownPct > 1) {
      lines.push(`${unknownPct.toFixed(0)}% of ownership is unaccounted for in available records.`);
    } else if (totalAccountedPct >= 99) {
      lines.push('Ownership is fully accounted for in available records.');
    }
    if (terminalCount > 0) {
      lines.push(`${terminalCount} ultimate owner${terminalCount !== 1 ? 's' : ''} identified at the top of the chain.`);
    }
    return { lines, mode: 'summary' as const };
  });

  // Break text into max 2 lines at word boundary, truncate with ellipsis if needed
  function wrapText(text: string, max = 12): { line1: string; line2?: string } {
    if (text.length <= max) return { line1: text };
    const brk = text.lastIndexOf(' ', max);
    const line1 = text.slice(0, brk > 0 ? brk : max).trim();
    const rest = text.slice(line1.length).trim();
    return { line1, line2: rest.length > max ? rest.slice(0, max - 1).trim() + '…' : rest };
  }

  // Position labels to avoid overlap: groups entity nodes by dagre rank,
  // then picks centered/offset/stacked placement based on horizontal spacing.
  // In 'deep-narrow' mode, labels shift to the right of nodes to save vertical space.
  function computeLabelPositions(lnodes: LayoutNode[], ranks: Map<string, number>) {
    // Deep-narrow mode: all labels to the right of the node
    if (labelMode === 'deep-narrow') {
      for (const n of lnodes) {
        if (n.isAsset) continue;
        n.labelPos = { dx: n.r + 6, dy: 0, below: false };
      }
      return;
    }

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
    // Rank separation: deep-narrow compresses vertically, large needs space for edge labels,
    // default leaves room for two-line labels + edge pct between ranks
    const ranksep = compact ? 28 :
      labelMode === 'deep-narrow' ? 45 :
      labelMode === 'large' ? 70 :
      isLarge ? 80 : 65;
    g.setGraph({
      rankdir: 'BT',
      nodesep: compact ? nodeR * 2 : labelMode === 'deep-narrow' ? nodeR * 3.5 : isLarge ? nodeR * 4 : nodeR * 3,
      ranksep,
      marginx: compact ? 15 : labelMode === 'deep-narrow' ? 80 : 50,
      marginy: compact ? 12 : 50,
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

  // Label visibility rubric based on labelMode:
  // 'default' / 'deep-narrow': show all labels
  // 'large' (≥25 nodes): only show labels for asset, hovered, spine, or high-pct (>20%) nodes
  function shouldShowLabel(n: LayoutNode): boolean {
    // Always show: asset root, currently hovered, spine nodes
    if (n.isAsset || hoveredId === n.id || nodesToShowText.has(n.id)) return true;
    if (compact && layoutNodes.length < 10) return true;
    // Large graphs: selective labels only
    if (labelMode === 'large') {
      return n.pct > 20;
    }
    // Default and deep-narrow: show all labels
    return true;
  }

  // The "active" highlight data — frozen takes priority over hover
  const activeNodeData = $derived(frozenNodeData || hoveredNodeData);
  const activeId = $derived(frozenId || hoveredId);

  // Click freezes the path highlight; clicking same node unfreezes.
  // Double-click navigates to the entity/asset page.
  function clickNode(n: LayoutNode) {
    if (frozenId === n.id) {
      // Unfreeze
      frozenId = null;
      frozenNodeData = null;
    } else {
      // Freeze on this node
      frozenId = n.id;
      hasEverFrozen = true;
      const entityId = nodes.find((node) => node.id === n.id)?.entity_id || n.id;
      frozenNodeData = pathsTouchedMap.get(entityId) || null;
    }
  }

  function dblClickNode(n: LayoutNode) {
    track('graph', 'navigate-entity', n.id);
    goto(n.isAsset ? assetLink(n.id) : entityLink(n.id));
  }

  // Hover only allowed when unfrozen OR when hovering a node in the frozen path
  function handleNodeHover(n: LayoutNode, ev?: MouseEvent) {
    if (frozenId && !isNodeInFrozenPath(n.id)) return;
    hoveredId = n.id;
    const entityId = nodes.find((node) => node.id === n.id)?.entity_id || n.id;
    hoveredNodeData = pathsTouchedMap.get(entityId) || null;
    if (ev) updateTooltipPos(ev);
  }
  function handleNodeLeave() {
    hoveredId = null;
    hoveredNodeData = null;
  }

  function isNodeInFrozenPath(id: string): boolean {
    if (!frozenNodeData) return true;
    return id === frozenId || frozenNodeData.nodesTouched.includes(id);
  }
  function updateTooltipPos(ev: MouseEvent) {
    const container = graphWrapEl?.closest('.ownership-tree');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    tooltipX = ev.clientX - rect.left + 12;
    tooltipY = ev.clientY - rect.top - 8;
  }

  // Path-aware opacity: nodes/edges not on the active (frozen or hovered) path fade
  function getNodeOpacity(n: LayoutNode): number {
    if (!activeNodeData) return 1;
    return n.isAsset || n.id === activeId || activeNodeData.nodesTouched.includes(n.id) ? 1 : 0.1;
  }
  function getEdgeOpacity(idx: number): number {
    if (!activeNodeData) return 1;
    return activeNodeData.edgeIndices.includes(idx) ? 0.7 : 0.1;
  }
  // Edge labels: always visible in compact/large mode, otherwise only on active path
  function shouldShowEdgeLabel(idx: number): boolean {
    if (compact || isLargeGraph) return true;
    return !!activeNodeData?.edgeIndices.includes(idx);
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
      {#if !compact}
        <div class="graph-controls">
          {#if colorConfig.showToggle}
            <div class="color-toggle">
              <button class:active={colorBy === 'entity-type'} onclick={() => colorBy = 'entity-type'}>
                Entity type
              </button>
              <button class:active={colorBy === 'country'} onclick={() => colorBy = 'country'}>
                Country
              </button>
            </div>
          {/if}
          {#if colorConfig.legendItems.length > 0}
            <div class="color-legend">
              {#each colorConfig.legendItems as item}
                <span class="legend-item">
                  <svg class="legend-swatch" viewBox="0 0 14 14" width="14" height="14">
                    <circle cx="7" cy="7" r="6.5" fill={item.bg} stroke="white" stroke-width="1" />
                    <path d={pieArc(75, 4.5)} transform="translate(7,7)" fill={item.fg} />
                  </svg>
                  {item.label}
                </span>
              {/each}
              {#if colorConfig.hasGrey}
                <span class="legend-item">
                  <svg class="legend-swatch" viewBox="0 0 14 14" width="14" height="14">
                    <circle cx="7" cy="7" r="6.5" fill={CATEGORY_GREY.bg} stroke="white" stroke-width="1" />
                    <path d={pieArc(75, 4.5)} transform="translate(7,7)" fill={CATEGORY_GREY.fg} />
                  </svg>
                  Other
                </span>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      <div class="graph-wrap" bind:this={graphWrapEl}>
        <svg
          viewBox="0 0 {gWidth} {gHeight}"
          preserveAspectRatio="xMidYMid meet"
          style={isLargeGraph
            ? `width: ${Math.max(gWidth, 800)}px; min-height: ${Math.max(gHeight, 600)}px;`
            : ''}
          onclick={(ev) => {
            // Click on SVG background (not a node) unfreezes
            if (ev.target === ev.currentTarget || (ev.target instanceof Element && ev.target.tagName === 'svg')) {
              frozenId = null;
              frozenNodeData = null;
            }
          }}
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
              class:hovered={hoveredId === n.id || frozenId === n.id}
              class:frozen={frozenId === n.id}
              class:in-chain={nodesToShowText.has(n.id)}
              transform="translate({n.x},{n.y})"
              style="opacity: {opacity}"
              role="button"
              tabindex="0"
              onclick={() => clickNode(n)}
              ondblclick={() => dblClickNode(n)}
              onkeydown={(ev) => ev.key === 'Enter' && dblClickNode(n)}
              onmouseenter={(ev) => handleNodeHover(n, ev)}
              onmousemove={updateTooltipPos}
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
                {@const nodeColors = getNodeColors(n.id)}
                <circle r={n.r} fill={nodeColors.bg} stroke="white" stroke-width="1.5" />
                {#if n.pct > 0}
                  <path d={pieArc(n.pct, n.r - 3)} fill={nodeColors.fg} />
                {/if}
                {#if showLabel}
                  {@const isRightLabel = pos.dx > 0 && pos.dy === 0}
                  <text
                    class="node-lbl"
                    class:small={pos.small}
                    class:right-label={isRightLabel}
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

      <!-- Side panel (hidden in compact mode) -->
      {#if !compact}
        <div class="panel">
          <h4>Owner Entities</h4>
          <div class="list">
            {#each ownersList as o}
              {@const rowColors = getNodeColors(o.id)}
              <div
                class="row"
                class:active={hoveredId === o.id || frozenId === o.id}
                class:frozen={frozenId === o.id}
                class:faded={!o.highlighted}
                role="button"
                tabindex="0"
                onmouseenter={() => {
                  if (frozenId && !isNodeInFrozenPath(o.id)) return;
                  hoveredId = o.id;
                  hoveredNodeData = pathsTouchedMap.get(o.id) || null;
                }}
                onmouseleave={handleNodeLeave}
                onclick={() => {
                  if (frozenId === o.id) { frozenId = null; frozenNodeData = null; }
                  else { frozenId = o.id; frozenNodeData = pathsTouchedMap.get(o.id) || null; hasEverFrozen = true; }
                }}
                ondblclick={() => goto(entityLink(o.id))}
                onkeydown={(ev) => ev.key === 'Enter' && goto(entityLink(o.id))}
              >
              <div class="row-main">
                  <svg class="row-color-dot" viewBox="0 0 10 10" width="10" height="10">
                    <circle cx="5" cy="5" r="4.5" fill={rowColors.bg} />
                    <path d={pieArc(75, 3)} transform="translate(5,5)" fill={rowColors.fg} />
                  </svg>
                  <span class="row-name">{o.name}</span>
                  <span class="row-pct">{o.pct.toFixed(1)}%</span>
                </div>
                {#if hoveredId === o.id || frozenId === o.id}
                  <div class="row-detail" style="border-color: {rowColors.fg}">
                    {#if o.entityType}
                      <span class="row-detail-tag" style="background: {rowColors.bg}; color: {rowColors.fg}">{o.entityType}</span>
                    {/if}
                    {#if o.country}
                      <span class="row-detail-country">{o.country}</span>
                    {/if}
                  </div>
                {:else if o.country}
                  <div class="row-country">{o.country}</div>
                {/if}
                <div class="row-bar" style="width: {maxOwnerPct > 0 ? (o.pct / maxOwnerPct) * 100 : 0}%"></div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Tooltip -->
      {#if hoveredId && hoveredGraphNode}
        {@const isAsset = hoveredGraphNode.type === 'asset' || hoveredId === rootId}
        {@const pct = hoveredLayoutNode?.pct ?? 0}
        <div class="tooltip" class:frozen={frozenId === hoveredId} style="left: {tooltipX}px; top: {tooltipY}px;">
          {#if frozenId === hoveredId}
            <div class="tooltip-pinned">Pinned</div>
          {/if}
          <div class="tooltip-name">{hoveredGraphNode.name || hoveredGraphNode.Name || hoveredId}</div>
          {#if hoveredGraphNode.headquarters_country}
            <div class="tooltip-detail">{hoveredGraphNode.headquarters_country}</div>
          {/if}
          {#if hoveredGraphNode.entity_type}
            <div class="tooltip-detail">{hoveredGraphNode.entity_type}</div>
          {/if}
          <div class="tooltip-detail">
            {isAsset ? 'Asset' : 'Entity'}{#if !isAsset && pct > 0} &middot; {pct.toFixed(1)}%{/if}
          </div>
          {#if !hasEverFrozen && !frozenId}
            <div class="tooltip-hint">Click to pin</div>
          {/if}
        </div>
      {/if}

      <!-- Context narrative -->
      {#if !compact}
        <div class="narrative" class:entity={narrativeText.mode === 'entity'}>
          {#each narrativeText.lines as line}
            <p>{line}</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ownership-tree {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    color: var(--color-text-primary, #1D4961);
    position: relative;
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
  .container {
    display: flex;
    gap: 20px;
  }
  .graph-wrap {
    flex: 1;
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
    min-height: 80px;
    max-height: 180px;
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
  .node circle,
  .node rect {
    transition: transform 0.15s ease-out;
  }
  .node.hovered circle {
    stroke: #9DF7E5;
    stroke-width: 3;
  }
  .node.frozen circle {
    stroke: #004F61;
    stroke-width: 3;
  }
  .node.hovered rect {
    stroke: #9DF7E5;
    stroke-width: 2;
  }
  .node.frozen rect {
    stroke: #004F61;
    stroke-width: 2;
  }
  .node.in-chain circle {
    stroke-width: 2;
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
    fill: var(--color-text-primary, #1D4961);
  }
  .node-lbl.right-label {
    text-anchor: start;
    dominant-baseline: middle;
  }
  .node-lbl.small {
    font-size: 9px;
  }
  .node.hovered .node-lbl {
    font-weight: 600;
  }
  .edge-lbl {
    font-size: 10px;
    fill: #004F61;
    text-anchor: middle;
  }

  /* Side panel */
  .panel {
    min-width: 200px;
    max-width: 240px;
    padding: 0 0 0 16px;
    border-left: 1px solid var(--color-border, #e0e0e0);
  }
  .panel h4 {
    margin: 0 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary, #888);
  }
  .list {
    max-height: 300px;
    overflow-y: auto;
  }
  .row {
    font-size: 12px;
    padding: 6px 8px 6px 8px;
    cursor: pointer;
    color: var(--color-text-primary, #1D4961);
    border-radius: 4px;
    position: relative;
    transition: background 0.15s ease-out;
  }
  .row.faded {
    opacity: 0.4;
  }
  .row.faded:hover {
    opacity: 1;
  }
  .row:hover,
  .row.active {
    background: rgba(157, 247, 229, 0.15);
  }
  .row.active {
    border-left: 3px solid #004F61;
    padding-left: 5px;
  }
  .row.frozen {
    background: rgba(0, 79, 97, 0.08);
    border-left: 3px solid #004F61;
    padding-left: 5px;
  }
  .row-main {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }
  .row-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .row-pct {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .row-country {
    font-size: 10px;
    color: var(--color-text-tertiary, #888);
    margin-top: 1px;
  }
  .row-detail {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 3px;
    padding-left: 18px;
    font-size: 10px;
    border-left: 2px solid transparent;
    animation: detailSlide 0.15s ease-out;
  }
  @keyframes detailSlide {
    from { opacity: 0; transform: translateY(-3px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .row-detail-tag {
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 500;
    white-space: nowrap;
  }
  .row-detail-country {
    color: var(--color-text-secondary, #555);
    white-space: nowrap;
  }
  .row-color-dot {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }
  .row-bar {
    height: 2px;
    background: #BECCCF;
    border-radius: 1px;
    margin-top: 3px;
    min-width: 2px;
    transition: width 0.2s ease-out;
  }

  /* Color toggle & legend */
  .graph-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .color-toggle {
    display: inline-flex;
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 6px;
    overflow: hidden;
  }
  .color-toggle button {
    font-size: 11px;
    padding: 3px 10px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary, #888);
    transition: background 0.15s, color 0.15s;
  }
  .color-toggle button.active {
    background: var(--color-text-primary, #1D4961);
    color: #fff;
  }
  .color-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
    color: var(--color-text-secondary, #555);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .legend-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  /* Tooltip */
  .tooltip {
    position: absolute;
    z-index: 10;
    background: rgba(29, 73, 97, 0.92);
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 1.4;
    pointer-events: none;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    max-width: 250px;
  }
  .tooltip-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tooltip-detail {
    font-size: 10px;
    opacity: 0.8;
  }
  .tooltip.frozen {
    border-color: #004F61;
    background: rgba(0, 79, 97, 0.95);
  }
  .tooltip-pinned {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    margin-bottom: 2px;
  }
  .tooltip-hint {
    font-size: 9px;
    opacity: 0.5;
    margin-top: 3px;
    font-style: italic;
  }

  .narrative {
    font-size: 12px;
    line-height: 1.5;
    color: var(--color-text-secondary, #555);
    padding: 10px 0 0;
    border-top: 1px solid var(--color-border-light, #eee);
    margin-top: 8px;
    min-height: 36px;
    transition: opacity 0.15s ease-out;
  }
  .narrative.entity {
    color: var(--color-text-primary, #1D4961);
  }
  .narrative p {
    margin: 0 0 3px;
  }
  .narrative p:last-child {
    margin-bottom: 0;
  }
</style>
