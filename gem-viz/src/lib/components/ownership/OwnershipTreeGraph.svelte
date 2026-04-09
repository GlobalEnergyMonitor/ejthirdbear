<script lang="ts">
  /**
   * OwnershipTreeGraph - Port from Observable notebook
   * Uses dagre for layout, Svelte for rendering
   * Label logic ported from Observable's nodesToShowText/placeOwnerLabels
   */
  import { onMount, tick } from 'svelte';
  import { spring } from 'svelte/motion';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { entityLink, assetLink } from '$lib/links';
  import { track } from '$lib/analytics';
  import { sum } from 'd3-array';
  // d3-shape line/curveBasis now imported via ownership-tree-utils
  import type {
    GraphNode,
    GraphEdge,
    OwnershipPathEntry,
    LayoutNode,
    LayoutEdge,
    DagreEdge,
  } from '$lib/component-data/graph-types';
  import OwnershipPanel from './OwnershipPanel.svelte';
  import OwnershipTooltip from './OwnershipTooltip.svelte';
  import {
    TREE_COLORS as C,
    OWNERSHIP_ENTITY_COLORS,
    classifyOwnerType,
    wrapText,
    pieArc,
    edgePath,
    getNodeColors,
    COUNTRY_COLORS,
    COUNTRY_GRAY,
    SMALL_OWNERSHIP_PCT,
    MAX_COUNTRY_COLORS,
    NODE_RADIUS,
    LARGE_GRAPH_THRESHOLD,
    ZOOM,
    GRAPH_MARGIN,
    OPACITY,
    DAGRE,
    PAN_CLICK_THRESHOLD,
    type ColorMode,
  } from './ownership-tree-utils';
  import { buildNarrativeText } from './ownership-tree-narrative';

  // --- URL hash state helpers (merge-friendly, namespaced with tree_ prefix) ---
  const HASH_KEYS = { color: 'tree_color', min: 'tree_min', focus: 'tree_focus' } as const;

  function readTreeHash(): { color?: ColorMode; min?: number; focus?: string } {
    if (!browser) return {};
    const raw = window.location.hash.slice(1);
    if (!raw) return {};
    const p = new URLSearchParams(raw);
    const result: { color?: ColorMode; min?: number; focus?: string } = {};
    const c = p.get(HASH_KEYS.color);
    if (c === 'entity-type' || c === 'country') result.color = c;
    const m = p.get(HASH_KEYS.min);
    if (m != null) { const n = parseInt(m, 10); if (!Number.isNaN(n)) result.min = n; }
    const f = p.get(HASH_KEYS.focus);
    if (f) result.focus = f;
    return result;
  }

  function writeTreeHash(color: ColorMode, min: number, focus: string | null): void {
    if (!browser) return;
    const existing = new URLSearchParams(window.location.hash.slice(1));
    if (color !== 'entity-type') existing.set(HASH_KEYS.color, color);
    else existing.delete(HASH_KEYS.color);
    if (min > 0) existing.set(HASH_KEYS.min, String(min));
    else existing.delete(HASH_KEYS.min);
    if (focus) existing.set(HASH_KEYS.focus, focus);
    else existing.delete(HASH_KEYS.focus);
    const s = existing.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  }

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    paths?: Record<string, OwnershipPathEntry[]>;
    rootId?: string;
    compact?: boolean;
    /** downstream places root at top; upstream places root at bottom */
    direction?: 'auto' | 'upstream' | 'downstream';
    /** expands graph area and moves owner list under the chart */
    fullWidth?: boolean;
    /** removes max-height cap on .graph-wrap — used by embed context */
    expandHeight?: boolean;
    /** Optional label for the root asset (passed by some callers, reserved for future use) */
    assetName?: string;
    /** Optional navigation callback — used by dynamic embeds instead of goto() */
    onNavigate?: (_url: string) => void;
  }

  type FrozenMeta = {
    kind: 'entity' | 'asset' | 'country' | 'entity-type';
    label: string;
    facts: string[];
    /** Structured entity data for sentence rendering */
    entityType?: string;
    country?: string;
    entityId?: string;
    cumulativePct?: number;
    smallShPct?: number;
    natPersonPct?: number;
    unknownPct?: number;
  };

  let {
    nodes = [],
    edges = [],
    paths = {},
    rootId = '',
    compact = false,
    direction = 'auto',
    fullWidth = false,
    expandHeight = false,
    onNavigate,
  }: Props = $props();

  let dagre: typeof import('dagre') | null = null;
  let ready = $state(false);
  let entranceAnimDone = $state(false);
  let hoveredId = $state<string | null>(null);
  let hoveredNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let hoverSource = $state<'graph' | 'panel' | null>(null);
  let frozenId = $state<string | null>(null);
  let frozenMeta = $state<FrozenMeta | null>(null);
  let frozenNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let hasAutoFit = false;
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let viewportWidth = $state(1280);
  // Spring-animated zoom/pan for smooth transitions
  const zoomSpring = spring(1, { stiffness: 0.2, damping: 0.85 });
  const panXSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  const panYSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  let isPanning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let layoutNodes = $state<LayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());

  // Placeholder entity IDs to exclude from the graph entirely.
  // These are aggregate/synthetic entries ("small shareholder(s)", "natural person(s)")
  // that add noise without meaningful ownership signal.
  // Proxy entities hidden from the tree but tracked for ownership breakdown
  const PROXY_SMALL_SH = 'E100001015587';
  const PROXY_NAT_PERSON = 'E100000123261';
  const PROXY_UNKNOWN = 'E100000132388';
  const PLACEHOLDER_ENTITY_IDS = new Set([PROXY_SMALL_SH, PROXY_NAT_PERSON, PROXY_UNKNOWN]);

  const filteredNodes = $derived(
    nodes.filter((n) => !PLACEHOLDER_ENTITY_IDS.has(n.entity_id || n.id))
  );
  const filteredNodeIds = $derived(new Set(filteredNodes.map((n) => n.id)));
  const filteredEdges = $derived(
    edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target))
  );

  const graphDirection = $derived<'upstream' | 'downstream'>(
    direction !== 'auto'
      ? direction
      : filteredEdges.filter((e) => e.source === rootId).length >
          filteredEdges.filter((e) => e.target === rootId).length
        ? 'downstream'
        : 'upstream'
  );
  const fullWidthMode = $derived(fullWidth && !compact);

  // Adaptive render cap for extremely large graphs to preserve responsiveness.
  // We still keep full data in memory, but only render a bounded BFS subset.
  const renderSubset = $derived.by(() => {
    const totalNodes = filteredNodes.length;
    const totalEdges = filteredEdges.length;
    const MAX_RENDER_NODES = fullWidthMode ? (viewportWidth < 900 ? 120 : 220) : 320;
    const MAX_CHILDREN_PER_PARENT = fullWidthMode ? 18 : 24;

    if (compact || totalNodes <= MAX_RENDER_NODES) {
      return {
        nodes: filteredNodes,
        edges: filteredEdges,
        trimmed: false,
        hiddenNodes: 0,
        hiddenEdges: 0,
      };
    }

    const nodeById = new Map(filteredNodes.map((n) => [n.id, n]));
    const rootNodeId =
      (nodeById.has(rootId) ? rootId : filteredNodes.find((n) => n.is_root)?.id) || filteredNodes[0]?.id || rootId;

    if (!rootNodeId) {
      return {
        nodes: filteredNodes,
        edges: filteredEdges,
        trimmed: false,
        hiddenNodes: 0,
        hiddenEdges: 0,
      };
    }

    const out = new Map<string, GraphEdge[]>();
    if (graphDirection === 'downstream') {
      for (const e of filteredEdges) {
        (out.get(e.source) ?? out.set(e.source, []).get(e.source)!).push(e);
      }
    } else {
      for (const e of filteredEdges) {
        (out.get(e.target) ?? out.set(e.target, []).get(e.target)!).push({
          source: e.target,
          target: e.source,
          value: e.value,
        });
      }
    }

    const keep = new Set<string>([rootNodeId]);
    const q: string[] = [rootNodeId];

    while (q.length > 0 && keep.size < MAX_RENDER_NODES) {
      const cur = q.shift()!;
      const next = (out.get(cur) || [])
        .slice()
        .sort((a, b) => (b.value || 0) - (a.value || 0))
        .slice(0, MAX_CHILDREN_PER_PARENT);

      for (const edge of next) {
        const child = edge.target;
        if (!keep.has(child)) {
          keep.add(child);
          q.push(child);
          if (keep.size >= MAX_RENDER_NODES) break;
        }
      }
    }

    const keptNodes = filteredNodes.filter((n) => keep.has(n.id));
    const keptEdges = filteredEdges.filter((e) => keep.has(e.source) && keep.has(e.target));

    return {
      nodes: keptNodes,
      edges: keptEdges,
      trimmed: keptNodes.length < totalNodes,
      hiddenNodes: Math.max(0, totalNodes - keptNodes.length),
      hiddenEdges: Math.max(0, totalEdges - keptEdges.length),
    };
  });

  // Ownership % filter slider — 0 means show all
  let minOwnershipPct = $state(0);

  // Color-by mode — entity-type or country
  let colorMode = $state<ColorMode>('entity-type');

  // Whether the URL hash provided an explicit colorMode (prevents auto-detect from overriding)
  let hashInitializedColor = $state(false);

  // Layout always uses ALL nodes — filter only dims, doesn't rebuild dagre
  const renderNodes = $derived(renderSubset.nodes);
  const renderEdges = $derived(renderSubset.edges);

  // Nodes below min ownership % are faded (not removed)
  const fadedNodeIds = $derived.by(() => {
    if (minOwnershipPct <= 0) return new Set<string>();
    const faded = new Set<string>();
    for (const n of renderSubset.nodes) {
      if (n.type === 'asset' || n.id === rootId) continue;
      const pct = pathsMap.get(n.entity_id || n.id) || edgePctMap.get(n.entity_id || n.id) || 0;
      if (pct < minOwnershipPct) faded.add(n.id);
    }
    return faded;
  });
  const fadedEdgeIds = $derived.by(() => {
    if (fadedNodeIds.size === 0) return new Set<string>();
    const faded = new Set<string>();
    for (const e of renderSubset.edges) {
      if (fadedNodeIds.has(e.source) || fadedNodeIds.has(e.target)) {
        faded.add(`${e.source}->${e.target}`);
      }
    }
    return faded;
  });
  const isTrimmedGraph = $derived(renderSubset.trimmed);
  const hiddenNodeCount = $derived(renderSubset.hiddenNodes);
  const hiddenEdgeCount = $derived(renderSubset.hiddenEdges);
  const largeGraphMinWidth = $derived(
    fullWidthMode ? Math.max(720, Math.min(1400, viewportWidth - 64)) : 800
  );
  const largeGraphMinHeight = $derived(fullWidthMode ? (viewportWidth < 900 ? 460 : 620) : 600);
  const graphBaseWidth = $derived(Math.max(gWidth, largeGraphMinWidth));
  const graphBaseHeight = $derived(Math.max(gHeight, largeGraphMinHeight));

  // Large graph threshold — enables scrollable mode with explicit SVG dimensions
  const isLargeGraph = $derived(!compact && renderNodes.length > LARGE_GRAPH_THRESHOLD);

  // Compute max depth from edge chains (BFS from root)
  const maxDepth = $derived.by(() => {
    if (renderEdges.length === 0) return 0;
    // Build adjacency relative to the chosen direction.
    // Upstream follows target -> source (toward owners); downstream follows source -> target.
    const children = new Map<string, string[]>();
    if (graphDirection === 'downstream') {
      for (const e of renderEdges) {
        (children.get(e.source) ?? children.set(e.source, []).get(e.source)!).push(e.target);
      }
    } else {
      for (const e of renderEdges) {
        (children.get(e.target) ?? children.set(e.target, []).get(e.target)!).push(e.source);
      }
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
    compact
      ? 'default'
      : renderNodes.length >= 25
        ? 'large'
        : maxDepth > 5 && renderNodes.length < 25
          ? 'deep-narrow'
          : 'default'
  );

  // Node radius — matched to Observable's nodeRadius function
  const nodeR = $derived(
    compact
      ? NODE_RADIUS.compact
      : renderNodes.length < 10
        ? NODE_RADIUS.small
        : renderNodes.length <= 25
          ? NODE_RADIUS.medium
          : NODE_RADIUS.large
  );

  // Process paths: compute cumulative ownership % and track which nodes/edges
  // each terminal entity touches (for hover-based path highlighting)
  const pathsData = $derived.by(() => {
    const pctMap = new Map<string, number>();
    const touchedMap = new Map<string, { nodesTouched: string[]; edgeIndices: number[] }>();
    if (!paths) return { pctMap, touchedMap };

    // O(1) edge lookup instead of O(n) findIndex per path segment
    const edgeIndex = new Map<string, number>();
    renderEdges.forEach((e, i) => edgeIndex.set(`${e.source}->${e.target}`, i));
    const cycleClosingEdges = new Set(
      edges.filter((e) => e.closes_cycle).map((e) => `${e.source}->${e.target}`)
    );

    for (const [id, arr] of Object.entries(paths)) {
      if (!Array.isArray(arr)) continue;
      const nonCyclePaths = arr.filter((p: OwnershipPathEntry) => {
        if (!p.route || p.route.length < 2) return true;
        for (let i = 0; i < p.route.length - 1; i++) {
          if (cycleClosingEdges.has(`${p.route[i]}->${p.route[i + 1]}`)) {
            return false;
          }
        }
        return true;
      });
      const usablePaths = nonCyclePaths.length > 0 ? nonCyclePaths : arr;

      // Sum all path cumulative percentages for this terminal
      pctMap.set(id, sum(usablePaths.map((p: OwnershipPathEntry) => p.cumulative_pct || 0)));

      // Collect every node and edge on any route to this terminal
      const nodesTouched = new Set<string>();
      const edgeIndices = new Set<number>();
      for (const p of usablePaths) {
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

  // "Spine" of the tree: walk along the single-parent/single-child chain from root
  // until reaching a fork. These nodes always show labels (no hover needed).
  const nodesToShowText = $derived.by(() => {
    const startId = filteredNodes.find((n) => n.type === 'asset' || n.id === rootId)?.id || rootId;
    const spine = new Set<string>([startId]);
    let cur = startId;

    while (true) {
      const next =
        graphDirection === 'downstream'
          ? renderEdges.filter((e) => e.source === cur && !spine.has(e.target))
          : renderEdges.filter((e) => e.target === cur && !spine.has(e.source));
      if (next.length !== 1) break; // stop at fork or dead end
      cur = graphDirection === 'downstream' ? next[0].target : next[0].source;
      spine.add(cur);
    }
    return spine;
  });

  // Build direct edge percentage lookup as fallback when paths data unavailable
  // Handles both upstream (edges → rootId) and downstream (rootId → edges) directions
  const edgePctMap = $derived.by(() => {
    const m = new Map<string, number>();
    for (const e of renderEdges) {
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

  // Color-by logic: entity-type or country mode
  const colorConfig = $derived.by(() => {
    if (colorMode === 'country') {
      const items: Array<{ label: string; bg: string; fg: string; light: string }> = [];
      let i = 0;
      for (const [country] of ownersByCountry) {
        if (country === 'Unknown') continue;
        const colors = i < COUNTRY_COLORS.length ? COUNTRY_COLORS[i] : COUNTRY_GRAY;
        items.push({ label: country, ...colors });
        i++;
        if (i > MAX_COUNTRY_COLORS) break;
      }
      return { legendItems: items };
    }

    // Entity-type mode (default)
    const entityNodes = renderNodes.filter((n) => n.type !== 'asset' && n.id !== rootId);
    const categoriesPresent = new Set<string>();
    for (const n of entityNodes) {
      categoriesPresent.add(classifyOwnerType(n));
    }
    const legendItems = Object.entries(OWNERSHIP_ENTITY_COLORS)
      .filter(([cat]) => categoriesPresent.has(cat))
      .map(([label, colors]) => ({ label, ...colors }));

    return { legendItems };
  });

  // Owners for side panel — sorted by ownership pct desc (matching Observable)
  const ownersList = $derived.by(() => {
    const list = filteredNodes
      .filter((n) => n.type !== 'asset' && n.id !== rootId)
      .map((n) => {
        const nid = n.entity_id || n.id;
        const category = classifyOwnerType(n);
        const isOther = category === 'Other';
        return {
          id: n.id,
          nid,
          name: n.name || n.Name || n.id,
          pct: pathsMap.get(nid) || edgePctMap.get(nid) || 0,
          country: n.headquarters_country || '',
          entityType: n.entity_type || '',
          category,
          highlighted: !isOther,
        };
      });
    // Sort by pct desc (matching Observable's ownersSummary sort)
    list.sort((a, b) => b.pct - a.pct);
    return list;
  });

  // Reorder owners: highlighted first (by pct desc), then faded/out-of-chain
  const sortedOwnersList = $derived.by(() => {
    const highlighted: typeof ownersList = [];
    const dimmed: typeof ownersList = [];
    for (const o of ownersList) {
      const isFaded = fadedNodeIds.has(o.id);
      const outOfChain =
        frozenNodeData && frozenId !== o.id && !frozenNodeData.nodesTouched.includes(o.id);
      if (isFaded || outOfChain) {
        dimmed.push(o);
      } else {
        highlighted.push(o);
      }
    }
    return [...highlighted, ...dimmed];
  });

  // Aggregated summaries matching Observable's ownersSummary.byCountry and byType
  const ownersByCountry = $derived.by(() => {
    const map = new Map<string, { combinedShare: number; count: number; ids: string[] }>();
    for (const o of ownersList) {
      const key = o.country || 'Unknown';
      const existing = map.get(key);
      if (existing) {
        existing.combinedShare += o.pct;
        existing.count++;
        existing.ids.push(o.nid);
      } else {
        map.set(key, { combinedShare: o.pct, count: 1, ids: [o.nid] });
      }
    }
    return [...map.entries()].sort((a, b) => b[1].combinedShare - a[1].combinedShare);
  });

  const ownersByType = $derived.by(() => {
    const map = new Map<string, { combinedShare: number; count: number; ids: string[] }>();
    for (const o of ownersList) {
      const key = o.category;
      const existing = map.get(key);
      if (existing) {
        existing.combinedShare += o.pct;
        existing.count++;
        existing.ids.push(o.nid);
      } else {
        map.set(key, { combinedShare: o.pct, count: 1, ids: [o.nid] });
      }
    }
    return [...map.entries()].sort((a, b) => b[1].combinedShare - a[1].combinedShare);
  });

  // Country ranks for color-by-country mode (top 5 by cumulative ownership %)
  const countryRanks = $derived.by(() => {
    const ranks = new Map<string, number>();
    let i = 0;
    for (const [country] of ownersByCountry) {
      if (country === 'Unknown') continue;
      ranks.set(country, i++);
    }
    return ranks;
  });

  // Smart default: if all entities are the same type, color by country instead
  const uniqueEntityTypes = $derived(new Set(ownersList.map((o) => o.category)).size);
  const uniqueCountries = $derived(new Set(ownersList.map((o) => o.country).filter(Boolean)).size);

  $effect(() => {
    // Skip auto-detect if URL hash provided an explicit colorMode
    if (hashInitializedColor) return;
    if (uniqueEntityTypes <= 1 && uniqueCountries > 1) {
      colorMode = 'country';
    } else {
      colorMode = 'entity-type';
    }
  });

  // Lookup original GraphNode for tooltip (by hovered layout node id)
  const hoveredGraphNode = $derived(hoveredId ? filteredNodes.find((n) => n.id === hoveredId) : null);
  const hoveredLayoutNode = $derived(
    hoveredId ? layoutNodes.find((n) => n.id === hoveredId) : null
  );
  const _maxOwnerPct = $derived(ownersList.length > 0 ? ownersList[0].pct : 100);

  // Data-driven narrative text for the context panel
  const narrativeText = $derived.by(() =>
    buildNarrativeText({
      renderNodes,
      renderEdges,
      nodes: filteredNodes,
      rootId,
      graphDirection,
      focusId: frozenId || hoveredId,
      pathsMap,
      edgePctMap,
      paths,
    })
  );

  // Max chars per label line — scales with node radius so labels fit
  // nodeR 28 → 16 chars, nodeR 22 → 13, nodeR 18 → 11, compact → 10
  const labelMaxChars = $derived(compact ? 10 : Math.max(8, Math.round(nodeR * 0.57)));

  // Position labels to avoid overlap: groups entity nodes by dagre rank,
  // then picks centered/offset/stacked placement based on horizontal spacing.
  // In 'deep-narrow' mode, labels shift to the right of nodes to save vertical space.
  function computeLabelPositions(lnodes: LayoutNode[], ranks: Map<string, number>) {
    // Label gap and estimated width scale with node radius (tight: just outside visual circle)
    const labelGap = Math.round(nodeR * 0.12);
    const labelW = Math.round(labelMaxChars * 6); // ~6px per char at current font size

    // Deep-narrow mode: all labels to the right of the node
    if (labelMode === 'deep-narrow') {
      for (const n of lnodes) {
        if (n.isAsset) continue;
        n.labelPos = { dx: n.r + labelGap * 0.5, dy: 0, below: false };
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

    const minGap = labelW + nodeR * 2;

    for (const nodesAtRank of byRank.values()) {
      nodesAtRank.sort((a: LayoutNode, b: LayoutNode) => a.x - b.x);

      // Single node — simple centered placement below node
      if (nodesAtRank.length === 1) {
        nodesAtRank[0].labelPos = { dx: 0, dy: nodeR + labelGap, below: false };
        continue;
      }

      // Check if all adjacent nodes have enough horizontal space for centered labels
      const allClear = nodesAtRank.every(
        (_: LayoutNode, i: number) => i === 0 || nodesAtRank[i].x - nodesAtRank[i - 1].x >= minGap
      );
      if (allClear) {
        nodesAtRank.forEach((n: LayoutNode) => {
          n.labelPos = { dx: 0, dy: nodeR + labelGap, below: false };
        });
        continue;
      }

      // Two nodes — try offsetting left label to avoid collision
      if (nodesAtRank.length === 2 && nodesAtRank[0].x > labelW) {
        nodesAtRank[0].labelPos = { dx: -labelW - nodesAtRank[0].r, dy: 0, below: false };
        nodesAtRank[1].labelPos = { dx: 0, dy: nodeR + labelGap, below: false };
        continue;
      }

      // Fallback: stack all labels below nodes with smaller font
      nodesAtRank.forEach((n: LayoutNode) => {
        n.labelPos = { dx: 0, dy: nodeR + labelGap, below: true, small: true };
      });
    }
  }

  // Run layout
  function runLayout() {
    if (!dagre || renderNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    // Observable's sizeDependantNodeSeparation:
    // d3.scaleLinear().domain([5, 40]).range([30, 2]).clamp(true)
    const nodeCount = renderNodes.length;
    const dynamicNodeSep = compact
      ? nodeR * 2
      : Math.max(2, Math.min(30, 30 - (nodeCount - 5) * (28 / 35)));
    g.setGraph({
      rankdir: graphDirection === 'downstream' ? 'TB' : 'BT',
      nodesep: dynamicNodeSep, // Observable: sizeDependantNodeSeparation
      ranksep: compact ? 28 : DAGRE.ranksep,
      edgesep: DAGRE.edgesep,
      // Reduced from nodeR — GRAPH_MARGIN already adds outer SVG whitespace
      marginx: compact ? 15 : Math.ceil(nodeR * 0.5),
      marginy: compact ? 12 : Math.ceil(nodeR * 0.55),
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Pre-compute small ownership for edge weight calculation
    const smallOwnershipSet = new Set<string>();
    const pctLookup = new Map<string, number>();
    renderNodes.forEach((n) => {
      const pct = pathsMap.get(n.entity_id || n.id) || 0;
      pctLookup.set(n.id, pct);
      if (n.type !== 'asset' && n.id !== rootId && pct < 2) {
        smallOwnershipSet.add(n.id);
      }
    });

    renderNodes.forEach((n) => {
      const isAsset = n.type === 'asset' || n.id === rootId;
      // Estimate asset node width from name length (~7.5px per char + padding)
      // Observable dynamically measures via getBBox; we approximate
      const assetLabel = n.name || n.Name || n.id || '';
      const estimatedTextW = Math.min(assetLabel.length * 7.5, 300);
      const assetW = compact ? 120 : Math.max(180, estimatedTextW + 48);
      const assetH = compact ? 24 : n.asset_type ? 48 : 36;
      // Observable: include label text width in entity node width for dagre layout
      // This prevents labels from overlapping adjacent nodes
      const entityLabel = n.name || n.Name || n.id || '';
      const labelTextW = Math.min(entityLabel.length * 6, labelMaxChars * 6) + 5;
      const entityW = compact ? nodeR * 2 : Math.max(nodeR * 2, labelTextW);
      g.setNode(n.id, {
        width: isAsset ? assetW : entityW,
        height: isAsset ? assetH : nodeR * 2,
      });
    });
    // Observable: edge weights influence dagre layout priority
    // asset edges = 3, both small = 1, one small = 2, normal = 3
    renderEdges.forEach((e) => {
      // Cycle-closing edges are skipped in dagre to prevent rank inversions —
      // they still render as SVG paths but don't influence the layout.
      if (e.closes_cycle) return;
      const srcIsAsset =
        e.source === rootId || renderNodes.find((n) => n.id === e.source)?.type === 'asset';
      const tgtIsAsset =
        e.target === rootId || renderNodes.find((n) => n.id === e.target)?.type === 'asset';
      let weight = 3;
      if (!srcIsAsset && !tgtIsAsset) {
        const srcSmall = smallOwnershipSet.has(e.source);
        const tgtSmall = smallOwnershipSet.has(e.target);
        if (srcSmall && tgtSmall) weight = 1;
        else if (srcSmall || tgtSmall) weight = 2;
      }
      g.setEdge(e.source, e.target, { weight });
    });
    dagre.layout(g);

    // Convert dagre y-positions to discrete rank indices.
    // Rank 0 = root node (appears first in entrance animation).
    // For BT (upstream): root is at bottom (high y) → sort ascending so high y = rank 0.
    // For TB (downstream): root is at top (low y) → sort descending so low y = rank 0.
    const yPos = new Map(g.nodes().map((id: string) => [id, Math.round(g.node(id).y)] as const));
    const isBT = graphDirection === 'upstream';
    const yToRank = new Map(
      [...new Set(yPos.values())].sort((a, b) => (isBT ? b - a : a - b)).map((y, i) => [y, i])
    );
    nodeRanks = new Map([...yPos].map(([id, y]) => [id, yToRank.get(y) ?? 0]));

    // O(1) lookups instead of O(n) find per node/edge
    const nodeById = new Map(renderNodes.map((n) => [n.id, n]));
    const edgeByKey = new Map(renderEdges.map((e) => [`${e.source}->${e.target}`, e]));

    const rawLayoutNodes = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = nodeById.get(id);
      const isAsset = orig?.type === 'asset' || id === rootId;
      const pct = pathsMap.get(orig?.entity_id || id) || 0;
      // Observable: make_tiny = dynamicSizing && curPct < 2
      const isSmallOwnership = !isAsset && pct < 2;
      const r = isAsset ? 0 : isSmallOwnership ? nodeR * 0.5 : nodeR;
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
        isSmallOwnership,
        labelPos: { dx: 0, dy: nodeR + Math.round(nodeR * 0.12), below: false, small: false },
        rank: 0, // will be filled after nodeRanks is computed
      };
    });

    // Fill in rank from nodeRanks map
    for (const n of rawLayoutNodes) {
      n.rank = nodeRanks.get(n.id) ?? 0;
    }

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

  // Label visibility — matches Observable's LABEL_OPTION="Show labels on large circles"
  // Small ownership nodes (< 2%) don't show labels unless hovered
  function shouldShowLabel(n: LayoutNode): boolean {
    // Always show: asset root, currently hovered/frozen, spine nodes
    if (n.isAsset || hoveredId === n.id || frozenId === n.id || nodesToShowText.has(n.id))
      return true;
    // Observable: unhide labels for ALL nodes on the active path (not just the hovered one)
    if (activeNodeData?.nodesTouched.includes(n.id)) return true;
    if (compact && layoutNodes.length < 10) return true;
    // Observable: hide labels on small ownership nodes
    if (n.isSmallOwnership) return false;
    // Large graphs: selective labels only
    if (labelMode === 'large') {
      const rank = nodeRanks.get(n.id) ?? 99;
      return rank <= 2 || n.pct > 10;
    }
    // Default and deep-narrow: show all non-tiny labels
    return true;
  }

  // The "active" highlight data — frozen takes priority over hover
  const activeNodeData = $derived(frozenNodeData || hoveredNodeData);
  const activeId = $derived(frozenId || hoveredId);

  // Observable's teaseTabularValues: when a graph node is hovered,
  // highlight the matching owner row, country row, and entity type row
  const teaseNode = $derived.by(() => {
    const id = activeId;
    if (!id) return { ownerId: null, country: null, entityType: null };
    const orig = filteredNodes.find((n) => n.id === id);
    if (!orig || orig.type === 'asset' || orig.id === rootId)
      return { ownerId: null, country: null, entityType: null };
    return {
      ownerId: orig.entity_id || orig.id,
      country: orig.headquarters_country || null,
      entityType: classifyOwnerType(orig),
    };
  });

  // Click freezes the path highlight; clicking same node unfreezes.
  // Double-click navigates to the entity/asset page.
  function buildFocusMeta(id: string): FrozenMeta | null {
    const node = filteredNodes.find((n) => n.id === id);
    if (!node) return null;

    const label = node.name || node.Name || id;
    if (node.type === 'asset' || id === rootId) {
      const facts = [node.asset_type || 'Asset', node.country, node.operating_status]
        .filter(Boolean)
        .slice(0, 3) as string[];
      return { kind: 'asset', label, facts };
    }

    const entityId = node.entity_id || id;
    const pct = pathsMap.get(entityId) || edgePctMap.get(entityId) || 0;

    // Proxy ownership breakdown by known entity IDs
    let smallShPct = 0;
    let natPersonPct = 0;
    let unknownPct = 0;
    // Use unfiltered `nodes` — proxy entities are excluded from filteredNodes
    for (const n of nodes) {
      if (n.type === 'asset' || n.id === rootId) continue;
      const eid = n.entity_id || n.id;
      const oPct = pathsMap.get(eid) || edgePctMap.get(eid) || 0;
      if (oPct <= 0) continue;
      if (eid === PROXY_SMALL_SH) smallShPct += oPct;
      else if (eid === PROXY_NAT_PERSON) natPersonPct += oPct;
      else if (eid === PROXY_UNKNOWN) unknownPct += oPct;
    }

    const ownerType = classifyOwnerType(node);
    const country = node.headquarters_country || '';
    const facts = [ownerType, country || 'HQ unknown', entityId].filter(Boolean) as string[];
    return {
      kind: 'entity',
      label,
      facts,
      entityType: ownerType,
      country,
      entityId,
      cumulativePct: pct,
      smallShPct: smallShPct > 0 ? smallShPct : undefined,
      natPersonPct: natPersonPct > 0 ? natPersonPct : undefined,
      unknownPct: unknownPct > 0.5 ? unknownPct : undefined,
    };
  }

  function focusKindLabel(meta: FrozenMeta): string {
    if (meta.kind === 'entity-type') return 'Entity Type';
    return meta.kind.charAt(0).toUpperCase() + meta.kind.slice(1);
  }

  function clickNode(n: LayoutNode) {
    if (frozenId === n.id) {
      // Unfreeze
      frozenId = null;
      frozenMeta = null;
      frozenNodeData = null;
    } else {
      // Freeze on this node
      frozenId = n.id;
      frozenMeta = buildFocusMeta(n.id);
      const entityId = filteredNodes.find((node) => node.id === n.id)?.entity_id || n.id;
      frozenNodeData = pathsTouchedMap.get(entityId) || null;
    }
  }

  function dblClickNode(n: LayoutNode) {
    track('graph', 'navigate-entity', n.id);
    const url = n.isAsset ? assetLink(n.id) : entityLink(n.id);
    onNavigate ? onNavigate(url) : goto(url);
  }

  // Hover only allowed when unfrozen OR when hovering a node in the frozen path
  function handleNodeHover(n: LayoutNode, ev?: MouseEvent) {
    if (frozenId && !isNodeInFrozenPath(n.id)) return;
    hoverSource = 'graph';
    hoveredId = n.id;
    const entityId = renderNodes.find((node) => node.id === n.id)?.entity_id || n.id;
    hoveredNodeData = pathsTouchedMap.get(entityId) || null;
    if (ev) updateTooltipPos(ev);
  }
  // Bridge functions for OwnershipPanel callbacks
  function handlePanelHover(id: string, data: { nodesTouched: string[]; edgeIndices: number[] } | null) {
    hoverSource = 'panel';
    hoveredId = id;
    hoveredNodeData = data;
  }
  function handlePanelFreeze(
    id: string | null,
    data: { nodesTouched: string[]; edgeIndices: number[] } | null,
    meta: FrozenMeta | null = null
  ) {
    frozenId = id;
    frozenMeta = meta || (id ? buildFocusMeta(id) : null);
    frozenNodeData = data;
    hoveredId = null;
    hoveredNodeData = null;
    hoverSource = null;
  }

  function handleNodeLeave() {
    hoverSource = null;
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
    // Keep tooltip inside component bounds to prevent jumpy clipping.
    tooltipX = Math.max(8, Math.min(ev.clientX - rect.left + 12, rect.width - 260));
    tooltipY = Math.max(8, Math.min(ev.clientY - rect.top - 8, rect.height - 80));
  }

  // Path-aware opacity: nodes/edges not on the active (frozen or hovered) path fade
  function getNodeOpacity(n: LayoutNode): number {
    if (fadedNodeIds.has(n.id)) return OPACITY.fadedNode;
    if (!activeNodeData) return isLargeGraph ? OPACITY.largeGraphBase : 1;
    return n.isAsset || n.id === activeId || activeNodeData.nodesTouched.includes(n.id)
      ? 1
      : OPACITY.inactiveNode;
  }
  function getEdgeOpacity(idx: number): number {
    const e = layoutEdges[idx];
    if (e && fadedEdgeIds.has(`${e.source}->${e.target}`)) return OPACITY.fadedEdge;
    if (!activeNodeData) {
      if (!e) return 1;
      return 1;
    }
    return activeNodeData.edgeIndices.includes(idx)
      ? 1
      : frozenNodeData
        ? OPACITY.frozenPathEdge
        : OPACITY.hoverPathEdge;
  }
  // Frozen-chain edges rendered thicker than hover-chain
  function getEdgeWidthMultiplier(idx: number): number {
    if (!activeNodeData) return 1;
    if (!activeNodeData.edgeIndices.includes(idx)) return 1;
    return frozenNodeData ? 1.4 : 1;
  }
  // Edge labels:
  // - compact: always visible
  // - normal/large: only visible for active (hovered/pinned) path
  function shouldShowEdgeLabel(idx: number): boolean {
    if (compact) return true;
    return !!activeNodeData?.edgeIndices.includes(idx);
  }

  let panelOpen = $state(false);
  let graphWrapEl = $state<HTMLDivElement | null>(null);

  // SVG margins (matching Observable)
  const svgMargins = GRAPH_MARGIN;
  const fullW = $derived(gWidth + svgMargins.left + svgMargins.right);
  const fullH = $derived(gHeight + svgMargins.top + svgMargins.bottom);

  // viewBox-based zoom/pan: the viewBox origin and size define which region
  // of SVG coordinate space is visible.
  // Zooming in = smaller viewBox = shows less area at bigger scale.
  // Spring stores animate smoothly between values.
  const vbW = $derived(fullW / $zoomSpring);
  const vbH = $derived(fullH / $zoomSpring);
  const vbX = $derived(-svgMargins.left + (fullW - vbW) / 2 + $panXSpring);
  const vbY = $derived(-svgMargins.top + (fullH - vbH) / 2 + $panYSpring);

  function startPan(ev: PointerEvent) {
    if (compact) return;
    const target = ev.target as Element | null;
    if (target?.closest('.node') || target?.closest('.zoom-stack')) return;
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
    // Drag panning: instant response (hard: true), no spring animation
    panXSpring.set(panStartPanX - (ev.clientX - panStartX) * pxToSvg, { hard: true });
    panYSpring.set(panStartPanY - (ev.clientY - panStartY) * pxToSvg, { hard: true });
  }

  function endPan(ev?: PointerEvent) {
    if (ev) {
      (ev.currentTarget as Element)?.releasePointerCapture?.(ev.pointerId);
      // If pointer barely moved, treat as a background click → clear selection
      const dx = Math.abs(ev.clientX - panStartX);
      const dy = Math.abs(ev.clientY - panStartY);
      if (isPanning && dx < PAN_CLICK_THRESHOLD && dy < PAN_CLICK_THRESHOLD && frozenNodeData) {
        frozenId = null;
        frozenMeta = null;
        frozenNodeData = null;
      }
    }
    isPanning = false;
  }

  function onGraphWheel(ev: WheelEvent) {
    if (compact) return;
    ev.preventDefault();

    const curZoom = $zoomSpring;
    const delta = ev.deltaY > 0 ? -0.1 : 0.1;
    const next = Math.max(ZOOM.min, Math.min(ZOOM.max, +(curZoom + delta).toFixed(2)));
    if (next === curZoom) return;

    // Zoom toward cursor position
    const svgEl = graphWrapEl?.querySelector('svg');
    if (svgEl) {
      const rect = svgEl.getBoundingClientRect();
      const fracX = (ev.clientX - rect.left) / rect.width;
      const fracY = (ev.clientY - rect.top) / rect.height;
      const svgPtX = vbX + fracX * vbW;
      const svgPtY = vbY + fracY * vbH;
      const newW = fullW / next;
      const newH = fullH / next;
      panXSpring.set(svgPtX - fracX * newW - (-svgMargins.left + (fullW - newW) / 2), {
        hard: true,
      });
      panYSpring.set(svgPtY - fracY * newH - (-svgMargins.top + (fullH - newH) / 2), {
        hard: true,
      });
    }

    zoomSpring.set(next, { hard: true });
  }

  function zoomBy(step: number) {
    const cur = $zoomSpring;
    const next = Math.max(ZOOM.min, Math.min(ZOOM.max, +(cur + step).toFixed(2)));
    // Animated zoom toward center (spring handles the transition)
    zoomSpring.set(next);
  }

  /** Calculate the zoom level that fits the full graph inside the container */
  function calcFitZoom(): number {
    if (!graphWrapEl) return 1;
    const rect = graphWrapEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 1;
    // Don't zoom in past 1x, but zoom out so the whole tree is visible
    return Math.max(ZOOM.min, Math.min(1, rect.width / fullW, rect.height / fullH));
  }

  /** Apply auto-fit zoom once after initial layout + entrance animation */
  function applyAutoFit() {
    if (hasAutoFit || compact) return;
    hasAutoFit = true;
    const fitZoom = calcFitZoom();
    const z = fitZoom < 1 ? fitZoom : 1;
    if (fitZoom < 1) {
      zoomSpring.set(fitZoom, { hard: true });
    }

    // For upstream ownership view (graphDirection='downstream' = TB layout, asset at high y),
    // anchor the root (coal plant / asset) at the bottom of the visible area.
    // Without this, the centered viewBox shows the top of the tree (distant owners) and
    // the user has to scroll down to find the asset.
    if (graphDirection === 'downstream' && graphWrapEl) {
      const rect = graphWrapEl.getBoundingClientRect();
      const vbW_at_z = fullW / z;
      // Height of SVG content visible in the container (in SVG units)
      const visH = rect.height * vbW_at_z / rect.width;
      // Default vbY when pan=0 (centered on the full dagre layout)
      const vbY_base = -svgMargins.top + (fullH - fullH / z) / 2;
      // Bottom of the full graph content in SVG coords (dagre gHeight + bottom margin)
      const graphBottom = gHeight + svgMargins.bottom;
      // The visible bottom without any pan
      const visibleBottomNoPan = vbY_base + visH;
      // How much we need to pan down to bring graphBottom into view
      const neededPan = graphBottom - visibleBottomNoPan;
      if (neededPan > 0) {
        panYSpring.set(neededPan, { hard: true });
      }
    }
  }

  function resetView() {
    const fitZoom = calcFitZoom();
    const z = fitZoom < 1 ? fitZoom : 1;
    zoomSpring.set(fitZoom);
    panXSpring.set(0);
    // For BT graphs taller than the container, pan to show the root at the bottom
    if (graphDirection === 'upstream' && graphWrapEl) {
      const rect = graphWrapEl.getBoundingClientRect();
      const vbY_base = -svgMargins.top + (fullH - fullH / z) / 2;
      const visH = rect.height * (fullW / z) / rect.width;
      const neededPan = (gHeight + svgMargins.bottom) - (vbY_base + visH);
      panYSpring.set(neededPan > 0 ? neededPan : 0);
    } else {
      panYSpring.set(0);
    }
  }

  async function runEntranceAnimation() {
    if (compact) {
      entranceAnimDone = true;
      return;
    }
    const container = graphWrapEl?.closest('.ownership-tree');
    if (!container) {
      entranceAnimDone = true;
      applyAutoFit();
      return;
    }

    try {
      const { createTimeline } = await import('animejs');
      const maxRank = Math.max(0, ...Array.from(nodeRanks.values()));

      // Build a timeline: nodes appear rank by rank, edges fade in
      const tl = createTimeline({ defaults: { ease: 'easeOutElastic(1, 0.6)' } });

      for (let rank = 0; rank <= maxRank; rank++) {
        const nodeEls = container.querySelectorAll(`.node[data-rank="${rank}"]`);
        const edgeEls = container.querySelectorAll(`.edge[data-rank="${rank}"]`);
        if (nodeEls.length > 0) {
          tl.add(
            nodeEls,
            {
              opacity: [0, 1],
              duration: 500,
            },
            rank === 0 ? 0 : '-=300'
          );

          const shapes = container.querySelectorAll(
            `.node[data-rank="${rank}"] circle, .node[data-rank="${rank}"] rect`
          );
          if (shapes.length > 0) {
            tl.add(
              shapes,
              {
                scale: [0, 1],
                duration: 450,
                ease: 'easeOutBack',
              },
              rank === 0 ? 50 : '-=350'
            );
          }
        }

        // Edges fade in after their rank's nodes
        if (edgeEls.length > 0) {
          tl.add(
            edgeEls,
            {
              opacity: [0, 1],
              duration: 400,
              ease: 'easeOutQuad',
            },
            '-=250'
          );
        }
      }

      // Panel slides in toward the end
      const panel = container.querySelector('.panel');
      if (panel) {
        tl.add(
          panel,
          {
            opacity: [0, 1],
            translateX: [16, 0],
            duration: 400,
            ease: 'easeOutQuad',
          },
          '-=200'
        );
      }

      // When timeline completes, hand control back to Svelte reactivity
      tl.then(() => {
        entranceAnimDone = true;
        // Clean up inline styles so Svelte reactivity takes over
        container.querySelectorAll('.node, .edge').forEach((el) => {
          (el as HTMLElement).style.removeProperty('opacity');
        });
        container.querySelectorAll('.node circle, .node rect').forEach((el) => {
          (el as HTMLElement).style.removeProperty('transform');
        });
        if (panel) (panel as HTMLElement).style.removeProperty('opacity');
        applyAutoFit();
      });
    } catch {
      // anime.js failed to load — skip animation
      entranceAnimDone = true;
      applyAutoFit();
    }
  }

  onMount(() => {
    const onResize = () => {
      viewportWidth = window.innerWidth || 1280;
    };
    onResize();
    window.addEventListener('resize', onResize, { passive: true });

    // Restore state from URL hash (only when not in compact mode)
    if (!compact) {
      const h = readTreeHash();
      if (h.color) { colorMode = h.color; hashInitializedColor = true; }
      if (h.min != null) minOwnershipPct = h.min;
      if (h.focus) frozenId = h.focus;
    }

    void (async () => {
      try {
        dagre = await import('dagre');
        runLayout();
        ready = true;
        // Run entrance animation after DOM updates
        await tick();
        runEntranceAnimation();
      } catch (e) {
        if (import.meta.env.DEV) console.error('Failed to load dagre:', e);
      }
    })();

    return () => {
      window.removeEventListener('resize', onResize);
    };
  });

  // Sync tree state to URL hash (only when not in compact mode)
  $effect(() => {
    if (compact || !browser) return;
    const _color = colorMode;
    const _min = minOwnershipPct;
    const _focus = frozenId;
    if (!ready) return;
    writeTreeHash(_color, _min, _focus);
  });

  // Re-run layout when data changes
  $effect(() => {
    if (dagre && renderNodes.length > 0) runLayout();
  });

  // Clear frozen state if the pinned node gets faded out by ownership filter
  $effect(() => {
    if (frozenId && fadedNodeIds.has(frozenId)) {
      frozenId = null;
      frozenMeta = null;
      frozenNodeData = null;
    }
  });
</script>

<div class="ownership-tree" class:compact class:full-width={fullWidthMode}>
  {#if !ready}
    <div class="msg">Loading...</div>
  {:else if layoutNodes.length === 0}
    <div class="msg">No graph data</div>
  {:else}
    <div class="container">
      <div class="graph-area">
        {#if !compact}
          <div class="graph-controls">
            {#if isTrimmedGraph}
              <div class="density-note">
                Showing {renderNodes.length.toLocaleString()} of {filteredNodes.length.toLocaleString()} entities
                ({hiddenNodeCount.toLocaleString()} hidden, {hiddenEdgeCount.toLocaleString()} edges
                hidden) for responsive rendering.
              </div>
            {/if}
            {#if uniqueEntityTypes > 1 && uniqueCountries > 1}
              <select class="color-mode-select" bind:value={colorMode}>
                <option value="entity-type">Entity Type</option>
                <option value="country">Country</option>
              </select>
            {/if}
            {#if colorConfig.legendItems.length > 0}
              <div class="color-legend">
                {#each colorConfig.legendItems as item}
                  <span class="legend-item">
                    <svg class="legend-swatch" viewBox="0 0 14 14" width="14" height="14">
                      <circle
                        cx="7"
                        cy="7"
                        r="6"
                        fill={item.bg}
                        stroke={item.bg}
                        stroke-width="1"
                      />
                      <path d={pieArc(50, 5)} transform="translate(7,7)" fill={item.fg} />
                    </svg>
                    {item.label}
                  </span>
                {/each}
              </div>
            {/if}
            <div class="color-legend edge-legend">
              <span class="legend-item">
                <svg class="legend-swatch" viewBox="0 0 24 8" width="24" height="8">
                  <line
                    x1="0"
                    y1="4"
                    x2="24"
                    y2="4"
                    stroke={C.edge}
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                Known %
              </span>
              <span class="legend-item">
                <svg class="legend-swatch" viewBox="0 0 24 8" width="24" height="8">
                  <line
                    x1="0"
                    y1="4"
                    x2="24"
                    y2="4"
                    stroke={C.edgeImputed}
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
                Imputed %
              </span>
            </div>
            <!-- Ownership slider moved to OwnershipPanel -->
          </div>
        {/if}
        <div
          class="graph-wrap"
          class:panning={isPanning}
          class:expand-height={expandHeight}
          bind:this={graphWrapEl}
          role="application"
          onpointerdown={startPan}
          onpointermove={movePan}
          onpointerup={endPan}
          onpointercancel={endPan}
          onpointerleave={endPan}
          onwheel={onGraphWheel}
        >
          {#if frozenMeta}
            {@const rootNode = filteredNodes.find((n) => n.id === rootId)}
            {@const rootName = rootNode?.name || rootNode?.Name || rootId}
            {@const frozenNode = nodes.find((n) => n.id === frozenId)}
            {@const isAssetNode = frozenNode?.type === 'asset' || frozenId === rootId}
            {@const frozenName = frozenNode?.full_name || frozenNode?.name || frozenNode?.Name || frozenId}
            {@const frozenPct = pathsMap.get(frozenNode?.entity_id || frozenId) || edgePctMap.get(frozenNode?.entity_id || frozenId) || 0}
            {@const frozenEdge = renderEdges.find((e) => e.target === (frozenNode?.entity_id || frozenId) || e.target === frozenId)}
            {@const frozenDirectPct = frozenEdge?.value ?? 0}
            {@const frozenPathEntries = paths[frozenNode?.entity_id || frozenId] || []}
            {@const frozenPathCount = frozenPathEntries.length}
            {@const frozenHqParts = [frozenNode?.headquarters_country, frozenNode?.headquarters_subdivision].filter(Boolean)}
            {@const frozenOwnerCategory = !isAssetNode && frozenNode ? classifyOwnerType(frozenNode) : ''}
            <div class="focus-indicator">
              <div class="focus-copy">
                {#if frozenMeta.kind === 'entity' && frozenMeta.entityId}
                  <p class="focus-sentence">
                    <strong>{frozenMeta.label}</strong>
                    is a <span class="focus-fact">{frozenMeta.entityType || 'entity'}</span>
                    {#if frozenMeta.country}based in <span class="focus-fact">{frozenMeta.country}</span>{/if}
                    <span class="focus-fact id">{frozenMeta.entityId}</span>
                    {#if frozenMeta.cumulativePct}
                      with <span class="focus-fact pct">{frozenMeta.cumulativePct.toFixed(1)}%</span> cumulative ownership of {rootName}.
                    {/if}
                  </p>
                  {#if frozenMeta.smallShPct || frozenMeta.natPersonPct || frozenMeta.unknownPct}
                    <p class="focus-sentence upstream">
                      Owned by:
                      {#if frozenMeta.smallShPct}<span class="focus-fact warn">{frozenMeta.smallShPct.toFixed(1)}% small shareholders</span>{/if}
                      {#if frozenMeta.natPersonPct}<span class="focus-fact warn">{frozenMeta.natPersonPct.toFixed(1)}% natural persons</span>{/if}
                      {#if frozenMeta.unknownPct}<span class="focus-fact warn">{frozenMeta.unknownPct.toFixed(1)}% unknown</span>{/if}
                    </p>
                  {/if}
                  {#if frozenMeta.entityId}
                    <a
                      class="focus-profile-link"
                      href={entityLink(frozenMeta.entityId)}
                      onclick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(entityLink(frozenMeta.entityId!)); } }}
                    >View full profile &rarr;</a>
                  {/if}
                {:else}
                  <span class="focus-label">
                    {focusKindLabel(frozenMeta)}: <strong>{frozenMeta.label}</strong>
                    {#if (frozenMeta.kind === 'country' || frozenMeta.kind === 'entity-type') && frozenMeta.facts.length > 0}
                      <span class="focus-count">({frozenMeta.facts[0]})</span>
                    {/if}
                  </span>
                  {#if frozenMeta.facts.length > 0 && frozenMeta.kind !== 'country' && frozenMeta.kind !== 'entity-type'}
                    <div class="focus-facts">
                      {#each frozenMeta.facts as fact}
                        <span class="focus-fact">{fact}</span>
                      {/each}
                    </div>
                  {/if}
                  {#if frozenMeta.kind === 'asset' && frozenId}
                    <a
                      class="focus-profile-link"
                      href={assetLink(frozenId)}
                      onclick={(e) => { if (onNavigate) { e.preventDefault(); onNavigate(assetLink(frozenId!)); } }}
                    >View asset profile &rarr;</a>
                  {/if}
                {/if}
              </div>
              <button
                type="button"
                class="focus-clear"
                onclick={() => {
                  frozenId = null;
                  frozenMeta = null;
                  frozenNodeData = null;
                }}
                aria-label="Clear focus">&#10005;</button
              >
            </div>
          {/if}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <svg
            viewBox="{vbX} {vbY} {vbW} {vbH}"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Ownership tree graph"
            style={isLargeGraph
              ? `width: ${Math.round(graphBaseWidth)}px; min-height: ${Math.round(graphBaseHeight)}px;`
              : !compact
                ? `max-width: ${fullW + 40}px; max-height: ${fullH + 40}px;`
                : ''}
            onclick={(ev) => {
              // Click on SVG background (not a node) unfreezes
              if (
                ev.target === ev.currentTarget ||
                (ev.target instanceof Element && ev.target.tagName === 'svg')
              ) {
                frozenId = null;
                frozenMeta = null;
                frozenNodeData = null;
              }
            }}
            onkeydown={(ev) => {
              if (ev.key === 'Escape') {
                frozenId = null;
                frozenMeta = null;
                frozenNodeData = null;
              }
            }}
            onmouseleave={handleNodeLeave}
          >
            <defs>
              <marker
                id="arr"
                markerWidth="10"
                markerHeight="10"
                refX="4"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
                viewBox="0 0 10 10"
              >
                <path d="M -5 0 L 5 5 L -5 10 Z" fill={C.edge} />
              </marker>
              <marker
                id="arr-imputed"
                markerWidth="10"
                markerHeight="10"
                refX="4"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
                viewBox="0 0 10 10"
              >
                <path d="M -5 0 L 5 5 L -5 10 Z" fill={C.edgeImputed} />
              </marker>
            </defs>
            <!-- Content group with isolation for mix-blend-mode -->
            <g style="isolation: isolate">
              <!-- Edges -->
              {#each layoutEdges as e, idx (e.source + e.target)}
                {@const mid = e.points?.[Math.floor(e.points.length / 2)]}
                {@const showLabel = shouldShowEdgeLabel(idx)}
                {@const opacity = getEdgeOpacity(idx)}
                {@const sourceNode = layoutNodes.find((nd) => nd.id === e.source)}
                {@const targetNode = layoutNodes.find((nd) => nd.id === e.target)}
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
                {@const strokeW = baseWidth * scaleFactor * getEdgeWidthMultiplier(idx)}
                {@const edgeOpacity = isSmall ? 0.88 : 1}
                {@const edgeRank = Math.max(sourceNode?.rank ?? 0, targetNode?.rank ?? 0)}
                <g
                  class="edge"
                  data-rank={edgeRank}
                  style="opacity: {entranceAnimDone ? opacity : 0}"
                >
                  <path
                    d={edgePath(e.points)}
                    stroke={e.imputed_share ? C.edgeImputed : C.edge}
                    stroke-width={strokeW}
                    stroke-linecap="round"
                    style="mix-blend-mode: multiply; opacity: {edgeOpacity}"
                    fill="none"
                    marker-end="url(#{e.imputed_share ? 'arr-imputed' : 'arr'})"
                  />
                  {#if e.value && mid && showLabel}
                    <text
                      x={mid.x}
                      y={mid.y - 5}
                      class="edge-lbl"
                      style="fill: {e.imputed_share ? C.edgeImputed : C.teal}"
                      >{Number.isInteger(e.value) ? e.value : e.value.toFixed(1)}%</text
                    >
                  {/if}
                </g>
              {/each}

              <!-- Nodes -->
              {#each layoutNodes as n (n.id)}
                {@const showLabel = shouldShowLabel(n)}
                {@const pos = n.labelPos || { dx: 0, dy: nodeR + 8, below: false, small: false }}
                {@const wrapped = wrapText(n.label, pos.small ? Math.min(labelMaxChars, 10) : labelMaxChars)}
                {@const isFaded = fadedNodeIds.has(n.id)}
                {@const opacity = getNodeOpacity(n)}
                <g
                  class="node"
                  class:hovered={hoveredId === n.id || frozenId === n.id}
                  class:frozen={frozenId === n.id}
                  class:in-chain={nodesToShowText.has(n.id)}
                  class:ownership-faded={isFaded}
                  data-rank={n.rank}
                  transform="translate({n.x},{n.y})"
                  style="opacity: {entranceAnimDone ? opacity : 0}; pointer-events: {isFaded
                    ? 'none'
                    : 'auto'}"
                  role="button"
                  tabindex={isFaded ? -1 : 0}
                  onclick={() => clickNode(n)}
                  ondblclick={() => dblClickNode(n)}
                  onkeydown={(ev) => ev.key === 'Enter' && dblClickNode(n)}
                  onmouseenter={(ev) => handleNodeHover(n, ev)}
                  onmousemove={updateTooltipPos}
                  onmouseleave={handleNodeLeave}
                >
                  {#if n.isAsset}
                    {@const assetNode = filteredNodes.find((nd) => nd.id === n.id)}
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
                    {@const maxChars = Math.max(18, Math.floor(n.w / 7.5))}
                    {@const displayLabel =
                      n.label.length > maxChars
                        ? n.label.slice(0, maxChars - 1).trim() + '…'
                        : n.label}
                    {#if assetType && !compact}
                      <text class="asset-sub-lbl" fill={C.mint} dy="-0.6em">{assetType}</text>
                      <text class="asset-main-lbl" fill="white" dy="0.7em">{displayLabel}</text>
                    {:else}
                      <text class="asset-main-lbl" fill="white" dy="0"
                        >{compact
                          ? n.label.length > Math.floor(n.w / 6)
                            ? n.label.slice(0, Math.floor(n.w / 6) - 1).trim() + '…'
                            : n.label
                          : displayLabel}</text
                      >
                    {/if}
                  {:else}
                    {@const nodeColors = getNodeColors(
                      n.id,
                      rootId,
                      filteredNodes,
                      colorMode,
                      countryRanks
                    )}
                    {@const circlePad = Math.round(nodeR * 0.18)}
                    {@const visualR =
                      n.r -
                      (n.isSmallOwnership ? 0.75 : 2) -
                      circlePad * (n.isSmallOwnership ? 0.5 : 1)}
                    {@const pieR = visualR - (n.isSmallOwnership ? 0 : 2)}
                    <circle
                      r={visualR}
                      fill={n.isSmallOwnership ? nodeColors.light : nodeColors.bg}
                      stroke={n.isSmallOwnership ? nodeColors.bg : nodeColors.bg}
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
                    {#if showLabel}
                      {@const isRightLabel = pos.dx > 0 && pos.dy === 0}
                      <text
                        class="node-lbl"
                        class:small={pos.small}
                        class:right-label={isRightLabel}
                        x={pos.dx}
                        y={pos.dy}
                      >
                        <tspan x={pos.dx} dy={wrapped.line2 ? '-0.3em' : '0'}>{wrapped.line1}</tspan
                        >
                        {#if wrapped.line2}
                          <tspan x={pos.dx} dy="1.1em">{wrapped.line2}</tspan>
                        {/if}
                      </text>
                    {/if}
                  {/if}
                </g>
              {/each}
            </g>
          </svg>
        </div>
        {#if !compact}
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
        {/if}
      </div>

      {#if !compact}
        <OwnershipPanel
          {ownersList}
          {sortedOwnersList}
          {ownersByCountry}
          {ownersByType}
          nodes={filteredNodes}
          {rootId}
          {hoveredId}
          {frozenId}
          {frozenMeta}
          {frozenNodeData}
          {hoverSource}
          {teaseNode}
          {fadedNodeIds}
          {pathsTouchedMap}
          {colorMode}
          {countryRanks}
          {panelOpen}
          {entranceAnimDone}
          {onNavigate}
          onHover={handlePanelHover}
          onLeave={handleNodeLeave}
          onFreeze={handlePanelFreeze}
          onTogglePanel={() => (panelOpen = !panelOpen)}
          onChangeColorMode={(mode) => { colorMode = mode; hashInitializedColor = true; }}
          {isNodeInFrozenPath}
          bind:minOwnershipPct
          showSlider={renderSubset.nodes.length > 5}
        />
      {/if}

      <OwnershipTooltip
        {hoveredId}
        {hoveredGraphNode}
        {hoveredLayoutNode}
        {frozenId}
        {hoverSource}
        {tooltipX}
        {tooltipY}
        {rootId}
        {edges}
      />
    </div>

    <!-- Context narrative -->
    {#if !compact && !frozenMeta}
      <div class="narrative" class:entity={narrativeText.mode === 'entity'}>
        {#each narrativeText.lines as line}
          <p>{line}</p>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .ownership-tree {
    container-type: inline-size;
    /* Tree graph color tokens — sourced from design-tokens.ts ownershipColors */
    --tree-navy: #1d4961;
    --tree-teal: #004f61;
    --tree-mint: #9df7e5;
    --tree-warm-white: #f2f2eb;
    --tree-node-fill: #becccf;
    --tree-edge: #a5e9e4;
    --tree-edge-imputed: #dce3e5;
    --tree-midnight: #1c1f23;

    font-family: var(--font-family-sans, 'Plus Jakarta Sans', system-ui, sans-serif);
    color: var(--color-text-primary, var(--tree-navy));
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
  .full-width .container {
    display: flex;
    gap: 12px;
  }
  @container (max-width: 700px) {
    .full-width .container {
      flex-direction: column;
    }
  }
  .graph-area {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
  }
  .graph-wrap {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    position: relative;
  }
  .graph-wrap.panning {
    cursor: grabbing;
  }
  .graph-wrap.panning,
  .graph-wrap.panning * {
    user-select: none;
  }
  .full-width .graph-wrap {
    min-width: 0;
    max-height: min(74vh, 760px);
  }
  .graph-wrap.expand-height {
    max-height: 4000px;
    overflow: visible;
  }
  .graph-wrap > svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 200px;
  }
  .compact .graph-wrap > svg {
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
  .compact .asset-main-lbl,
  .compact .node-lbl {
    font-size: 10px;
  }
  .compact .edge-lbl {
    font-size: 9px;
  }
  .node,
  .edge {
    transition: opacity 0.25s ease-out;
  }

  /* Staggered entrance animation — nodes pop in, edges fade in */
  @keyframes node-enter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes shape-enter {
    from {
      transform: scale(0);
    }
    to {
      transform: scale(1);
    }
  }
  @keyframes edge-enter {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .node {
    cursor: pointer;
  }
  .node circle {
    transition:
      stroke 0.2s ease-out,
      stroke-width 0.2s ease-out,
      fill 0.2s ease-out,
      r 0.2s ease-out;
  }
  .node rect {
    transition:
      stroke 0.2s ease-out,
      stroke-width 0.2s ease-out;
  }
  .edge path {
    transition:
      stroke-width 0.2s ease-out,
      opacity 0.25s ease-out;
  }
  .node.hovered circle {
    stroke: var(--tree-mint);
    stroke-width: 2.5;
  }
  .node.frozen circle {
    stroke: var(--tree-teal);
    stroke-width: 4;
    filter: drop-shadow(0 0 4px rgba(0, 79, 97, 0.4));
  }
  .node.hovered rect {
    stroke: var(--tree-mint);
    stroke-width: 2;
  }
  .node.frozen rect {
    stroke: var(--tree-teal);
    stroke-width: 3;
    filter: drop-shadow(0 0 4px rgba(0, 79, 97, 0.4));
  }
  .node.in-chain circle {
    stroke-width: 2;
  }
  .asset-sub-lbl,
  .asset-main-lbl,
  .node-lbl {
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }
  .asset-sub-lbl {
    font-size: 0.6em;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.075em;
  }
  .asset-main-lbl {
    font-size: 1em;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .node-lbl {
    font-size: 0.82rem;
    letter-spacing: 0.02em;
    font-weight: normal;
    dominant-baseline: hanging;
    fill: var(--tree-navy);
    stroke: #fff;
    stroke-width: 3px;
    stroke-linejoin: round;
    paint-order: stroke fill;
    transition:
      font-weight 0.15s ease-out,
      opacity 0.2s ease-out;
  }
  .node-lbl.right-label {
    text-anchor: start;
    dominant-baseline: middle;
  }
  .node-lbl.small {
    /* opacity: 0.85;*/
  }
  .node.hovered .node-lbl {
    font-weight: 600;
  }
  .node.frozen .node-lbl {
    font-weight: 700;
    fill: var(--tree-teal);
  }
  .edge-lbl {
    font-size: 0.7rem;
    text-anchor: middle;
    dominant-baseline: hanging;
  }

  /* Focus indicator — floats above the graph, does not affect layout */
  .focus-indicator {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(4px);
    border: 1px solid rgba(0, 79, 97, 0.15);
    border-radius: 4px;
    font-size: var(--font-size-sm, 0.8125rem);
    color: var(--tree-navy, #1d4961);
    position: absolute;
    top: 8px;
    left: 8px;
    right: 8px;
    z-index: 5;
    animation: tooltip-in 0.15s ease-out;
  }
  .focus-copy {
    flex: 1;
    min-width: 0;
  }
  .focus-label {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .focus-count {
    font-size: 0.78em;
    opacity: 0.75;
    font-weight: normal;
  }
  .focus-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .focus-fact {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(0, 79, 97, 0.1);
    border: 1px solid rgba(0, 79, 97, 0.12);
    font-size: 0.68rem;
    line-height: 1.2;
    white-space: nowrap;
  }
  .focus-fact.id {
    font-family: var(--font-mono, monospace);
    font-size: 0.62rem;
    opacity: 0.7;
  }
  .focus-fact.pct {
    font-weight: 600;
  }
  .focus-fact.warn {
    background: rgba(180, 100, 30, 0.1);
    border-color: rgba(180, 100, 30, 0.2);
    color: #8b5a1d;
  }
  .focus-sentence {
    margin: 0;
    line-height: 1.7;
  }
  .focus-sentence.upstream {
    margin-top: 2px;
    font-size: 0.7rem;
    color: var(--color-text-secondary, #6b7280);
  }
  .focus-clear {
    background: none;
    border: none;
    color: var(--tree-teal, #004f61);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 3px;
    opacity: 0.6;
  }
  .focus-clear:hover {
    opacity: 1;
    background: rgba(0, 79, 97, 0.1);
  }

  .focus-profile-link {
    display: inline-block;
    font-size: 0.68rem;
    margin-top: 4px;
    color: var(--tree-teal, #004f61);
    text-decoration: none;
    font-weight: 600;
    opacity: 0.8;
    transition: opacity 0.1s;
  }
  .focus-profile-link:hover {
    opacity: 1;
    text-decoration: underline;
  }

  /* Color toggle & legend */
  .graph-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .color-mode-select {
    font-size: 0.75rem;
    padding: 2px 6px;
    border: 1px solid var(--tree-edge-imputed, #dce3e5);
    border-radius: 4px;
    background: var(--tree-warm-white, #f2f2eb);
    color: var(--tree-navy, #1d4961);
    cursor: pointer;
  }
  /* Floating zoom controls — bottom-right, mapbox/google maps style */
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
    color: var(--tree-navy);
    cursor: pointer;
    padding: 0;
    transition: background 0.1s;
    pointer-events: auto;
    position: relative;
    z-index: 51;
  }
  .zoom-stack button:last-child {
    border-bottom: none;
  }
  .zoom-stack button:hover {
    background: #f0f4f5;
  }
  .zoom-stack button:active {
    background: #e0e8ea;
  }
  .zoom-stack .home-btn {
    border-top: 1px solid rgba(0, 0, 0, 0.12);
  }
  .density-note {
    font-size: 11px;
    color: var(--color-text-secondary, #555);
    background: rgba(190, 204, 207, 0.2);
    padding: 4px 8px;
    border-radius: 4px;
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
    flex-shrink: 0;
  }
  .edge-legend .legend-swatch {
    width: 24px;
    height: 8px;
  }

  .narrative {
    font-size: var(--font-size-sm, 0.75rem);
    line-height: 1.5;
    color: var(--color-text-secondary, #555);
    padding: 10px 0 0;
    border-top: 1px solid var(--color-border-light, #eee);
    margin-top: 8px;
    min-height: 36px;
    transition: opacity 0.15s ease-out;
  }
  .narrative.entity {
    color: var(--color-text-primary, #1d4961);
  }
  .narrative p {
    margin: 0 0 3px;
  }
  .narrative p:last-child {
    margin-bottom: 0;
  }

  /* Panel toggle — moved to OwnershipPanel.svelte */

  /* Mobile responsive */
  @media (max-width: 768px) {
    .container {
      flex-direction: column;
    }
    .graph-wrap {
      max-height: none;
    }
    .full-width .graph-wrap {
      max-height: 62vh;
    }
    .graph-wrap.expand-height {
      max-height: 4000px;
      overflow: visible;
    }
    .graph-wrap > svg {
      min-height: 250px;
    }
    .graph-controls {
      gap: 8px;
    }
    .node circle {
      transform: scale(1.15);
    }
  }
</style>
