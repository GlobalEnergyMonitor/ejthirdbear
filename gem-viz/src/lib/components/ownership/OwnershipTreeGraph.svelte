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
  import { BREAKPOINTS, LAYOUT, getViewportWidth } from '$lib/responsive';
  import { sum } from 'd3-array';
  import { select } from 'd3-selection';
  // d3-shape line/curveBasis now imported via ownership-tree-utils
  import type {
    GraphNode,
    GraphEdge,
    OwnershipPathEntry,
    LayoutNode,
    LayoutEdge,
    LayoutPoint,
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
    trimEdgeToNode,
    getNodeColors,
    COUNTRY_COLORS,
    COUNTRY_GRAY,
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
  import { type LocationData, fetchLocationData } from '$lib/ownership-api';
  import OwnershipPathModal from './OwnershipPathModal.svelte';
  import {
    backgroundClickSuppressionDeadline,
    shouldIgnoreBackgroundClick,
    shouldTreatPointerReleaseAsNodeClick,
    shouldUseFallbackNodeClick,
  } from './node-pointer-fallback';

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
    if (m != null) {
      const n = parseInt(m, 10);
      if (!Number.isNaN(n)) result.min = n;
    }
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
    /** Force all entity labels to stay centered below nodes instead of lateral auto-placement. */
    forceLabelsBelow?: boolean;
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
  };

  type PendingNodePress = {
    nodeId: string;
    pointerId: number;
    startX: number;
    startY: number;
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
    forceLabelsBelow = false,
    onNavigate,
  }: Props = $props();

  let dagre: typeof import('dagre') | null = null;
  let dagreD3: typeof import('dagre-d3') | null = null;
  let ready = $state(false);
  let entranceAnimDone = $state(false);
  let hoveredId = $state<string | null>(null);
  let hoveredNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let hoverSource = $state<'graph' | 'panel' | null>(null);
  let frozenId = $state<string | null>(null);
  let frozenMeta = $state<FrozenMeta | null>(null);
  let frozenNodeData = $state<{ nodesTouched: string[]; edgeIndices: number[] } | null>(null);
  let assetLocationData = $state<LocationData | null>(null);
  let pathModalOpen = $state(false);
  let pathModalNodes = $state<GraphNode[]>([]);
  let pathModalEdges = $state<GraphEdge[]>([]);
  let hasAutoFit = false;
  let tooltipX = $state(0);
  let tooltipY = $state(0);
  let viewportWidth = $state(BREAKPOINTS.lg as number);
  // Spring-animated zoom/pan for smooth transitions
  const zoomSpring = spring(1, { stiffness: 0.2, damping: 0.85 });
  const panXSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  const panYSpring = spring(0, { stiffness: 0.2, damping: 0.85 });
  let isPanning = $state(false);
  let panStartX = 0;
  let panStartY = 0;
  let panStartPanX = 0;
  let panStartPanY = 0;
  let pendingNodePress = $state<PendingNodePress | null>(null);
  let nodeClickFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  let lastNativeNodeClick: { id: string; at: number } | null = null;
  let suppressBackgroundClickUntil = 0;
  let layoutNodes = $state<LayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(400);
  let gHeight = $state(300);
  let nodeRanks = $state<Map<string, number>>(new Map());

  // Hidden SVG used to measure real label text widths (Observable notebook's
  // `measureSvg` pattern). Feeds accurate node widths into the dagre layout
  // so edges don't cram together when labels are long.
  let measurerSvg: SVGSVGElement | null = null;
  let measurerText: SVGTextElement | null = null;
  const labelWidthCache = new Map<string, number>();

  // Placeholder entity IDs to exclude from the graph entirely.
  // These are aggregate/synthetic entries ("small shareholder(s)", "natural person(s)")
  // that add noise without meaningful ownership signal.
  // Proxy entities hidden from the tree but tracked for ownership breakdown
  const PROXY_SMALL_SH = 'E100001015587';
  const PROXY_NAT_PERSON = 'E100000123261';
  const PROXY_UNKNOWN = 'E100000132388';
  const PROXY_MEMBER_OWNED = 'E100002001974';
  const PLACEHOLDER_ENTITY_IDS = new Set([
    PROXY_SMALL_SH,
    PROXY_NAT_PERSON,
    PROXY_UNKNOWN,
    PROXY_MEMBER_OWNED,
  ]);

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
    const MAX_RENDER_NODES = fullWidthMode ? (viewportWidth < BREAKPOINTS.md ? 120 : 220) : 320;
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
      (nodeById.has(rootId) ? rootId : filteredNodes.find((n) => n.is_root)?.id) ||
      filteredNodes[0]?.id ||
      rootId;

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
    const queued = new Set<string>(q);
    const hasPaths = paths && Object.keys(paths).length > 0;

    if (hasPaths) {
      const rankedRoutes = Object.values(paths)
        .flat()
        .filter((p) => Array.isArray(p?.route) && p.route.length > 1)
        .sort(
          (a, b) =>
            (b.cumulative_pct ?? 0) - (a.cumulative_pct ?? 0) || b.route.length - a.route.length
        );

      // Prefer keeping complete API-provided routes before breadth-first trimming.
      // This is less lossy than slicing a wide parent down to its top-N children,
      // because a lower-share branch may still be the only route to a distinct owner.
      for (const entry of rankedRoutes) {
        const routeNodeIds = entry.route.filter((id) => keep.has(id) || nodeById.has(id));
        if (!routeNodeIds.includes(rootNodeId)) continue;

        const novelIds = routeNodeIds.filter((id) => !keep.has(id));
        if (novelIds.length === 0) continue;
        if (keep.size + novelIds.length > MAX_RENDER_NODES) continue;

        for (const id of routeNodeIds) {
          keep.add(id);
          if (!queued.has(id)) {
            q.push(id);
            queued.add(id);
          }
        }
      }
    }

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
          if (!queued.has(child)) {
            q.push(child);
            queued.add(child);
          }
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
    if (fadedNodeIds.size === 0) return new Map<string, Set<string>>();
    const faded = new Map<string, Set<string>>();
    for (const e of renderSubset.edges) {
      if (fadedNodeIds.has(e.source) || fadedNodeIds.has(e.target)) {
        let s = faded.get(e.source);
        if (!s) {
          s = new Set();
          faded.set(e.source, s);
        }
        s.add(e.target);
      }
    }
    return faded;
  });
  const isTrimmedGraph = $derived(renderSubset.trimmed);
  const hiddenNodeCount = $derived(renderSubset.hiddenNodes);
  const hiddenEdgeCount = $derived(renderSubset.hiddenEdges);
  const largeGraphMinWidth = $derived(
    fullWidthMode
      ? Math.max(
          LAYOUT.ownershipGraph.minWidth,
          Math.min(
            LAYOUT.ownershipGraph.maxWidth,
            viewportWidth - LAYOUT.ownershipGraph.viewportGutter
          )
        )
      : LAYOUT.ownershipGraph.inlineWidth
  );
  const largeGraphMinHeight = $derived(
    fullWidthMode ? (viewportWidth < BREAKPOINTS.md ? 460 : 620) : 600
  );
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
  // each terminal entity touches (for hover-based path highlighting).
  // Matches Observable notebook: trust all API-provided paths (cycles already
  // handled server-side via the recursive CTE's visited list).
  const pathsData = $derived.by(() => {
    const pctMap = new Map<string, number>();
    const touchedMap = new Map<string, { nodesTouched: string[]; edgeIndices: number[] }>();
    if (!paths) return { pctMap, touchedMap };

    // O(1) edge lookup via nested Map (no string alloc per lookup)
    const edgeIndex = new Map<string, Map<string, number>>();
    renderEdges.forEach((e, i) => {
      let m = edgeIndex.get(e.source);
      if (!m) {
        m = new Map();
        edgeIndex.set(e.source, m);
      }
      m.set(e.target, i);
    });

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
            const idx = edgeIndex.get(p.route[i])?.get(p.route[i + 1]);
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
  const hoveredGraphNode = $derived(
    hoveredId ? filteredNodes.find((n) => n.id === hoveredId) : null
  );
  const hoveredLayoutNode = $derived(
    hoveredId ? layoutNodes.find((n) => n.id === hoveredId) : null
  );
  const _maxOwnerPct = $derived(ownersList.length > 0 ? ownersList[0].pct : 100);

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

    if (forceLabelsBelow) {
      for (const n of lnodes) {
        if (n.isAsset) continue;
        n.labelPos = { dx: 0, dy: nodeR + labelGap, below: true, small: false };
      }
      return;
    }

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

      // Two nodes — offset labels so they don't overlap each other.
      // Clamp left node's dx so the label can't go off-screen left.
      if (nodesAtRank.length === 2) {
        const leftNode = nodesAtRank[0];
        const rightNode = nodesAtRank[1];
        const idealDx = -labelW - leftNode.r;
        const clampedDx = Math.max(idealDx, -(leftNode.x - leftNode.r - 4));
        leftNode.labelPos = { dx: clampedDx, dy: nodeR + labelGap, below: false };
        rightNode.labelPos = { dx: 0, dy: nodeR + labelGap, below: false };
        continue;
      }

      // Fallback: stack all labels below nodes with smaller font
      nodesAtRank.forEach((n: LayoutNode) => {
        n.labelPos = { dx: 0, dy: nodeR + labelGap, below: true, small: true };
      });
    }
  }

  // Measure label text width by writing wrapped tspans into the hidden
  // measurer <text> and reading the real SVG bbox. Returns the max tspan
  // width (since labels may wrap across two lines). Mirrors the Observable
  // notebook's `dummyText.call(wrapTextTwoLines, ...).node().getBBox().width`.
  function measureLabelWidth(text: string, max: number): number {
    if (!text) return 0;
    const key = `${max}|${text}`;
    const cached = labelWidthCache.get(key);
    if (cached !== undefined) return cached;
    if (!measurerText) {
      // Fallback heuristic if measurer not mounted yet (SSR or pre-mount).
      const w = Math.min(text.length * 6, max * 6);
      return w;
    }
    const wrapped = wrapText(text, max);
    // Rebuild tspans
    while (measurerText.firstChild) measurerText.removeChild(measurerText.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const t1 = document.createElementNS(ns, 'tspan');
    t1.setAttribute('x', '0');
    t1.textContent = wrapped.line1;
    measurerText.appendChild(t1);
    if (wrapped.line2) {
      const t2 = document.createElementNS(ns, 'tspan');
      t2.setAttribute('x', '0');
      t2.setAttribute('dy', '1.1em');
      t2.textContent = wrapped.line2;
      measurerText.appendChild(t2);
    }
    let w = 0;
    try {
      // getBBox on the <text> returns the bounding box covering both tspans
      w = measurerText.getBBox().width;
    } catch {
      w = text.length * 6;
    }
    labelWidthCache.set(key, w);
    return w;
  }

  // Run layout
  function runLayout() {
    if (!dagre || !dagreD3 || renderNodes.length === 0) return;

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
      // Observable notebook sets marginx/y = nodeRadius. GRAPH_MARGIN adds
      // additional outer whitespace around the SVG, but dagre's internal
      // margins are what let edges route around boundary nodes without
      // clipping arrowheads.
      marginx: compact ? 15 : nodeR,
      marginy: compact ? 12 : nodeR,
      // No acyclicer setting — dagre-d3 uses the default DFS-based cycle
      // detection, which correctly handles closes_cycle edges (they form
      // diamond shapes, not true directed cycles, so nothing gets reversed).
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

    // Asset rect is a dagre layout hint; overflow handled by CSS ellipsis.
    const ASSET_W_MIN = 180;
    const ASSET_W_MAX = 360;
    const ASSET_CHAR_W = 9;
    const ASSET_PAD = 28;

    // Observable notebook's labelPadding (px added between node edge and text)
    const LABEL_PADDING = 3;
    renderNodes.forEach((n) => {
      const isAsset = n.type === 'asset' || n.id === rootId;
      const assetLabel = n.name || n.Name || n.id || '';
      const desiredW = assetLabel.length * ASSET_CHAR_W + ASSET_PAD;
      const assetW = compact ? 120 : Math.max(ASSET_W_MIN, Math.min(ASSET_W_MAX, desiredW));
      const assetH = compact ? 24 : n.asset_type ? 48 : 36;
      // Observable: use real SVG text measurement so dagre reserves enough
      // horizontal space for the label — prevents edges from crowding and
      // labels from overlapping adjacent nodes.
      const entityLabel = n.name || n.Name || n.id || '';
      const labelTextW = compact
        ? Math.min(entityLabel.length * 6, labelMaxChars * 6)
        : measureLabelWidth(entityLabel, labelMaxChars);
      // Observable: `Math.max(2 * r, labelPadding + textWidth + 5)`
      const entityW = compact ? nodeR * 2 : Math.max(nodeR * 2, LABEL_PADDING + labelTextW + 5);
      // Entity nodes use a custom 'circleCustom' shape (mirrors Observable notebook)
      // so dagre-d3 uses node.width/height directly without padding inflation.
      g.setNode(n.id, {
        width: isAsset ? assetW : entityW,
        height: isAsset ? assetH : nodeR * 2,
        shape: isAsset ? 'rect' : 'circleCustom',
        r: isAsset ? undefined : nodeR,
      });
    });
    // Observable: edge weights influence dagre layout priority
    // asset edges = 3, both small = 1, one small = 2, normal = 3.
    // All edges including closes_cycle ones use normal weights — the
    // Observable notebook included them all without special treatment.
    renderEdges.forEach((e) => {
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

    // Use dagre-d3 for layout: it handles closes_cycle edges correctly.
    // A hidden SVG must be attached to DOM so getBBox() works for node measurement.
    const _dagreD3 = dagreD3;
    const renderer = new _dagreD3.render();

    // Mirror Observable notebook's circleCustom shape: uses node.width/height
    // directly so dagre-d3's default padding doesn't inflate node sizes.

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
      const inner = select(hiddenSvg).append('g');

      renderer(inner as any, g);
    } catch {
      layoutOk = false;
    } finally {
      document.body.removeChild(hiddenSvg);
    }

    // Fallback: if dagre threw OR produced NaN positions (known dagre BK
    // x-assignment bug on certain graph topologies), assign ranks via BFS
    // from root and distribute nodes horizontally within each rank.
    const anyNaN = !layoutOk || g.nodes().some((id: string) => !Number.isFinite(g.node(id).x));
    if (anyNaN) {
      const rankById = new Map<string, number>();
      rankById.set(rootId, 0);
      const queue: string[] = [rootId];
      while (queue.length) {
        const cur = queue.shift()!;
        const depth = rankById.get(cur)!;
        for (const e of renderEdges) {
          const next = e.target === cur ? e.source : e.source === cur ? e.target : null;
          if (next && !rankById.has(next)) {
            rankById.set(next, depth + 1);
            queue.push(next);
          }
        }
      }
      // Any node not reached gets placed on the furthest rank.
      const maxRank = Math.max(0, ...rankById.values());
      g.nodes().forEach((id: string) => {
        if (!rankById.has(id)) rankById.set(id, maxRank + 1);
      });
      const ranksep = compact ? 28 : 116;
      const byRank = new Map<number, string[]>();
      for (const [id, r] of rankById) {
        const ids = byRank.get(r) ?? [];
        ids.push(id);
        byRank.set(r, ids);
      }
      const isBT = graphDirection === 'upstream';
      for (const [r, ids] of byRank) {
        const widths = ids.map((id: string) => g.node(id).width || nodeR * 2);
        const gap = dynamicNodeSep;
        const total = widths.reduce((a, b) => a + b, 0) + gap * (ids.length - 1);
        let x = -total / 2;
        // For BT (upstream), root at bottom: higher y = lower rank.
        const y = isBT ? -r * ranksep : r * ranksep;
        ids.forEach((id: string, i: number) => {
          const node = g.node(id);
          node.x = x + widths[i] / 2;
          node.y = y;
          x += widths[i] + gap;
        });
      }
    }

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
    const edgeByKey = new Map<string, Map<string, (typeof renderEdges)[0]>>();
    for (const e of renderEdges) {
      let m = edgeByKey.get(e.source);
      if (!m) {
        m = new Map();
        edgeByKey.set(e.source, m);
      }
      m.set(e.target, e);
    }

    const rawLayoutNodes = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = nodeById.get(id);
      const isAsset = orig?.type === 'asset' || id === rootId;
      const pct = pathsMap.get(orig?.entity_id || id) || 0;
      // Observable: make_tiny = dynamicSizing && curPct < 2
      const isSmallOwnership = !isAsset && pct < 2;
      const r = isAsset ? 0 : isSmallOwnership ? nodeR * 0.5 : nodeR;
      // Compute the actual visual circle radius (matches rendering logic)
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
        rank: 0, // will be filled after nodeRanks is computed
      };
    });

    // Fill in rank from nodeRanks map
    for (const n of rawLayoutNodes) {
      n.rank = nodeRanks.get(n.id) ?? 0;
    }

    computeLabelPositions(rawLayoutNodes, nodeRanks);
    layoutNodes = rawLayoutNodes;

    // Build a lookup from layout nodes for edge trimming
    const layoutNodeById = new Map(rawLayoutNodes.map((n) => [n.id, n]));

    // Node stroke is 1.5 for small-ownership, 4 for normal; half = arrow-tip inset.
    const strokeHalfFor = (n: LayoutNode) => (n.isSmallOwnership ? 0.75 : 2);
    const trimRadiusFor = (n: LayoutNode) => (n.isAsset ? 0 : n.visualR + strokeHalfFor(n));

    const trimFromStart = (pts: LayoutPoint[], n: LayoutNode) =>
      trimEdgeToNode(pts, n.x, n.y, trimRadiusFor(n), n.isAsset, n.w, n.h);

    const trimFromEnd = (pts: LayoutPoint[], n: LayoutNode) =>
      trimFromStart([...pts].reverse(), n).reverse();

    layoutEdges = g.edges().map((e: DagreEdge) => {
      const orig = edgeByKey.get(e.v)?.get(e.w);
      let pts: LayoutPoint[] = g.edge(e).points;
      // dagre points go source→target; trim each end to its own node boundary.
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

  /** Build a GEM wiki URL from an asset name when wiki_link is absent. */
  function buildWikiLink(name: string): string {
    const slug = name
      .replace(/[#<>[\]|{}%+?]/g, '')
      .replace(/ /g, '_');
    return `https://www.gem.wiki/${slug}`;
  }

  /** Compose a single narrative sentence describing the asset's status and capacity. */
  function buildAssetNarrative(data: LocationData): string {
    const operating = data.units.filter((u) => u.operating_status === 'operating');
    const planned = data.units.filter((u) => u.operating_status === 'planned');
    const canceled = data.units.filter((u) => u.operating_status === 'canceled');
    const retired = data.units.filter((u) => u.operating_status === 'retired');

    const assetType = data.asset_type || 'asset';

    // Geography: pipelines have null top-level country; countries live in each unit
    const unitCountries = [
      ...new Set(data.units.flatMap((u) => u.countries ?? []).filter(Boolean)),
    ];
    let geo = '';
    if (data.country) {
      geo = ` in ${data.country}`;
    } else if (unitCountries.length === 1) {
      geo = ` in ${unitCountries[0]}`;
    } else if (unitCountries.length > 1) {
      const last = unitCountries[unitCountries.length - 1];
      const rest = unitCountries.slice(0, -1);
      geo = ` passing through ${rest.join(', ')}${rest.length > 1 ? ',' : ''} and ${last}`;
    }

    // Sum capacity for a group; returns "" if none have a value
    function capStr(units: LocationData['units']): string {
      const withCap = units.filter((u) => u.capacity_value != null);
      if (!withCap.length) return '';
      const total = withCap.reduce((s, u) => s + (u.capacity_value ?? 0), 0);
      const capUnit = withCap[0].capacity_unit || 'MW';
      return `${total.toLocaleString()} ${capUnit}`;
    }

    const parts: string[] = [];

    if (operating.length > 0) {
      const opCap = capStr(operating);
      let s = `An operating ${assetType}${geo}`;
      if (operating.length > 1) {
        s += ` with ${operating.length} units`;
        if (opCap) s += ` and a capacity of ${opCap}`;
      } else if (opCap) {
        s += ` with a capacity of ${opCap}`;
      }
      parts.push(s);
      if (planned.length > 0) {
        const plCap = capStr(planned);
        let ps = `${planned.length} additional unit${planned.length !== 1 ? 's' : ''} ${planned.length === 1 ? 'is' : 'are'} planned`;
        if (plCap) ps += `, with a capacity of ${plCap}`;
        parts.push(ps);
      }
      const retCan = retired.length + canceled.length;
      if (retCan > 0) {
        parts.push(`It has ${retCan} retired or canceled unit${retCan !== 1 ? 's' : ''}`);
      }
    } else if (planned.length > 0) {
      const plCap = capStr(planned);
      let s = `A planned ${assetType}${geo}`;
      if (planned.length > 1) {
        s += ` with ${planned.length} units`;
        if (plCap) s += ` and a total capacity of ${plCap}`;
      } else if (plCap) {
        s += ` with a capacity of ${plCap}`;
      }
      parts.push(s);
      if (canceled.length > 0) {
        parts.push(`${canceled.length} unit${canceled.length !== 1 ? 's' : ''} ${canceled.length === 1 ? 'has' : 'have'} been canceled`);
      }
    } else if (canceled.length > 0) {
      parts.push(`A canceled ${assetType}${geo}`);
      if (retired.length > 0) {
        parts.push(`${retired.length} previously operating unit${retired.length !== 1 ? 's' : ''} ${retired.length === 1 ? 'has' : 'have'} been retired`);
      }
    } else {
      parts.push(`A retired ${assetType}${geo}`);
    }

    return parts.join('. ') + '.';
  }

  // Fetch location data whenever an asset node is frozen
  $effect(() => {
    if (frozenMeta?.kind !== 'asset' || !frozenId) {
      assetLocationData = null;
      return;
    }
    const id = frozenId;
    fetchLocationData(id).then((data) => {
      if (frozenId === id) assetLocationData = data;
    }).catch(() => {
      if (frozenId === id) assetLocationData = null;
    });
  });

  function clearNodeClickFallback(): void {
    if (nodeClickFallbackTimer !== null) {
      clearTimeout(nodeClickFallbackTimer);
      nodeClickFallbackTimer = null;
    }
  }

  function queueNodeClickFallback(n: LayoutNode): void {
    clearNodeClickFallback();
    nodeClickFallbackTimer = window.setTimeout(() => {
      nodeClickFallbackTimer = null;
      if (!shouldUseFallbackNodeClick(n.id, performance.now(), lastNativeNodeClick)) return;
      clickNode(n);
    }, 0);
  }

  function handleNativeNodeClick(n: LayoutNode): void {
    lastNativeNodeClick = { id: n.id, at: performance.now() };
    clickNode(n);
  }

  function startNodePress(n: LayoutNode, ev: PointerEvent): void {
    pendingNodePress = {
      nodeId: n.id,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
    };
    (ev.currentTarget as Element)?.setPointerCapture?.(ev.pointerId);
  }

  function endNodePress(n: LayoutNode, ev: PointerEvent): void {
    const press = pendingNodePress;
    if (!press || press.nodeId !== n.id || press.pointerId !== ev.pointerId) return;
    try {
      (ev.currentTarget as Element)?.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* no active capture */
    }
    pendingNodePress = null;

    if (
      !shouldTreatPointerReleaseAsNodeClick(
        press.startX,
        press.startY,
        ev.clientX,
        ev.clientY,
        PAN_CLICK_THRESHOLD
      )
    ) {
      return;
    }

    // Some embedded Drupal/Webflow layouts retarget mouseup/click from the SVG
    // node to the background. Keep the intended node activation and ignore the
    // immediate synthetic background click that follows.
    suppressBackgroundClickUntil = backgroundClickSuppressionDeadline(performance.now());
    queueNodeClickFallback(n);
  }

  function cancelNodePress(ev?: PointerEvent): void {
    const press = pendingNodePress;
    pendingNodePress = null;
    if (!press || !ev || press.pointerId !== ev.pointerId) return;
    try {
      (ev.currentTarget as Element)?.releasePointerCapture?.(ev.pointerId);
    } catch {
      /* no active capture */
    }
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
  function handlePanelHover(
    id: string,
    data: { nodesTouched: string[]; edgeIndices: number[] } | null
  ) {
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
    if (hoverSource === 'panel' && n.id === hoveredId) return 0.7;
    if (!activeNodeData) return isLargeGraph ? OPACITY.largeGraphBase : 1;
    return n.isAsset || n.id === activeId || activeNodeData.nodesTouched.includes(n.id)
      ? 1
      : OPACITY.inactiveNode;
  }
  function getEdgeOpacity(idx: number): number {
    const e = layoutEdges[idx];
    if (e && fadedEdgeIds.get(e.source)?.has(e.target)) return OPACITY.fadedEdge;
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
    // composedPath() walks the real DOM path, including inside shadow DOM.
    // ev.target alone is unreliable here because Svelte 5 delegates events to
    // document level and the browser retargets .target to the shadow host
    // when the dispatch crosses the boundary — so target.closest('.node')
    // silently fails in widget embeds and startPan steals the pointer capture
    // from startNodePress, breaking node clicks.
    const path = ev.composedPath();
    for (const n of path) {
      const el = n as Element | null;
      const classes = el?.classList;
      if (!classes) continue;
      if (classes.contains('node') || classes.contains('zoom-stack')) return;
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
    // Drag panning: instant response (hard: true), no spring animation
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

  /**
   * Measure the actual rendered SVG content bounds and compute zoom + pan
   * that centers all content with padding inside the viewBox.
   * This is the source of truth for initial fit and reset — no guessing.
   */
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

    // Zoom out just enough so the viewBox can contain the padded content bbox.
    // zoom = min(fullW/needW, fullH/needH) but never zoom IN past 1.
    const z = Math.max(ZOOM.min, Math.min(1, fullW / needW, fullH / needH));

    // Pan so the viewBox center aligns with the content center.
    // At panX=panY=0 the viewBox center is at:
    //   cx0 = -margins.left + fullW/2
    //   cy0 = -margins.top  + fullH/2
    // We want it at (bbox center):
    const contentCX = bbox.x + bbox.width / 2;
    const contentCY = bbox.y + bbox.height / 2;
    const defaultCX = -svgMargins.left + fullW / 2;
    const defaultCY = -svgMargins.top + fullH / 2;

    const opts = hard ? { hard: true } : undefined;
    zoomSpring.set(z, opts);
    panXSpring.set(contentCX - defaultCX, opts);
    panYSpring.set(contentCY - defaultCY, opts);
  }

  /** Apply auto-fit once after initial layout + entrance animation */
  function applyAutoFit() {
    if (hasAutoFit || compact) return;
    hasAutoFit = true;
    fitToContent(true);
  }

  function resetView() {
    fitToContent(false);
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
        // Wait for CSS layout to settle (e.g. height: 70vh from modal) before measuring
        requestAnimationFrame(() => applyAutoFit());
      });
    } catch {
      // anime.js failed to load — skip animation
      entranceAnimDone = true;
      requestAnimationFrame(() => applyAutoFit());
    }
  }

  onMount(() => {
    const onResize = () => {
      viewportWidth = getViewportWidth();
    };
    onResize();
    window.addEventListener('resize', onResize, { passive: true });

    // Restore state from URL hash (only when not in compact mode)
    if (!compact) {
      const h = readTreeHash();
      if (h.color) {
        colorMode = h.color;
        hashInitializedColor = true;
      }
      if (h.min != null) minOwnershipPct = h.min;
      if (h.focus) frozenId = h.focus;
    }

    void (async () => {
      try {
        [dagre, dagreD3] = await Promise.all([import('dagre'), import('dagre-d3')]);
        try {
          runLayout();
        } catch (e) {
          if (import.meta.env.DEV) console.error('runLayout threw:', e);
        }
        // Show the tree even if layout threw — runLayout's internal fallback
        // will have produced a usable (if imperfect) set of positions.
        ready = true;
        await tick();
        runEntranceAnimation();
      } catch (e) {
        if (import.meta.env.DEV) console.error('Failed to load dagre:', e);
        // Even if dagre import failed, don't leave the modal stuck on "Loading..."
        ready = true;
      }
    })();

    return () => {
      clearNodeClickFallback();
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

  // Re-run layout when data changes; reset zoom/fit so the new graph is fully visible
  $effect(() => {
    if (dagre && renderNodes.length > 0) {
      runLayout();
      // After re-layout with new data, reset fit state and re-apply auto-fit
      // so the full graph is visible (skip on first mount — entrance animation handles it)
      if (hasAutoFit) {
        hasAutoFit = false;
        entranceAnimDone = true;
        tick().then(() => requestAnimationFrame(() => applyAutoFit()));
      }
    }
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

<!-- Hidden SVG used to measure real label text widths for dagre layout.
     Rendered outside the main chart so getBBox() returns the true pixel
     width of the label under the active font/letter-spacing. -->
<svg bind:this={measurerSvg} class="label-measurer" aria-hidden="true" width="0" height="0">
  <text bind:this={measurerText} class="node-lbl" x="0" y="0"></text>
</svg>

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
                Showing {renderNodes.length.toLocaleString()} of {filteredNodes.length.toLocaleString()}
                entities ({hiddenNodeCount.toLocaleString()} hidden, {hiddenEdgeCount.toLocaleString()}
                edges hidden) for responsive rendering.
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
            {@const immediateOwners = (() => {
              // Edges are always source=owner → target=owned.
              // So X's owners are e.source where e.target===X.
              const real = filteredEdges
                .filter((e) => e.target === frozenId)
                .map((e) => {
                  const ownerNode = nodes.find((n) => n.id === e.source);
                  return {
                    id: ownerNode?.id ?? null,
                    name: ownerNode?.name || ownerNode?.Name || e.source,
                    pct: e.value != null ? Number(e.value) : null,
                    isProxy: false as const,
                  };
                });
              // Proxy entities are filtered out of filteredEdges, so check raw edges.
              const proxy = edges
                .filter((e) => e.target === frozenId)
                .flatMap((e) => {
                  const ownerNode = nodes.find((n) => n.id === e.source);
                  const eid = ownerNode?.entity_id || e.source;
                  const proxyName =
                    eid === PROXY_SMALL_SH
                      ? 'small shareholders'
                      : eid === PROXY_NAT_PERSON
                        ? 'natural persons'
                        : eid === PROXY_UNKNOWN
                          ? 'unknown'
                          : eid === PROXY_MEMBER_OWNED
                            ? 'member/employee owned'
                            : null;
                  if (!proxyName) return [];
                  return [
                    {
                      id: null,
                      name: proxyName,
                      pct: e.value != null ? Number(e.value) : null,
                      isProxy: true as const,
                    },
                  ];
                });
              return [...real, ...proxy]
                .filter((o) => o.pct == null || o.pct > 0)
                .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
            })()}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="focus-indicator"
              onpointerdown={(e) => e.stopPropagation()}
              onpointerup={(e) => e.stopPropagation()}
            >
              <div class="focus-copy">
                {#if frozenMeta.kind === 'entity' && frozenMeta.entityId}
                  <p class="focus-sentence">
                    <strong>{frozenMeta.label}</strong>
                    is a <span class="focus-fact">{frozenMeta.entityType || 'entity'}</span>
                    {#if frozenMeta.country}based in <span class="focus-fact"
                        >{frozenMeta.country}</span
                      >{/if}
                    {#if frozenMeta.cumulativePct}
                      with <span class="focus-fact pct">{frozenMeta.cumulativePct.toFixed(1)}%</span
                      >
                      cumulative ownership of {rootName}.
                    {/if}
                  </p>
                  {#if immediateOwners.length > 0}
                    <p class="focus-sentence upstream">
                      Owned by:
                      {#each immediateOwners as owner}
                        <span
                          class="focus-fact"
                          class:warn={owner.isProxy}
                          class:hoverable={!owner.isProxy && owner.id != null}
                          onmouseenter={() => {
                            if (!owner.isProxy && owner.id != null) {
                              hoveredId = owner.id;
                              hoverSource = 'panel';
                            }
                          }}
                          onmouseleave={() => {
                            if (!owner.isProxy && owner.id != null) {
                              hoveredId = null;
                              hoverSource = null;
                            }
                          }}
                          >{owner.pct != null ? owner.pct.toFixed(1) + '% ' : ''}{owner.name}</span
                        >
                      {/each}
                    </p>
                  {/if}
                  {#if frozenMeta.entityId}
                    <div class="focus-footer">
                      <span class="focus-fact id">{frozenMeta.entityId}</span>
                      <a
                        class="focus-profile-link"
                        href={entityLink(frozenMeta.entityId)}
                        onclick={(e) => {
                          if (onNavigate) {
                            e.preventDefault();
                            onNavigate(entityLink(frozenMeta.entityId!));
                          }
                        }}>View full profile &rarr;</a
                      >
                      {#if frozenNodeData && frozenNodeData.nodesTouched.length > 1}
                        <button
                          type="button"
                          class="focus-path-btn"
                          onclick={() => {
                            const touchedSet = new Set(frozenNodeData!.nodesTouched);
                            pathModalNodes = filteredNodes.filter((n) => touchedSet.has(n.id));
                            pathModalEdges = frozenNodeData!.edgeIndices
                              .map((i) => filteredEdges[i])
                              .filter(Boolean);
                            pathModalOpen = true;
                          }}
                        >
                          View path &nearr;
                        </button>
                      {/if}
                    </div>
                  {/if}
                {:else if frozenMeta.kind === 'asset'}
                  <strong class="focus-asset-name">{frozenMeta.label}</strong>
                  {#if assetLocationData}
                    <p class="focus-asset-narrative">{buildAssetNarrative(assetLocationData)}</p>
                  {/if}
                  {#if frozenId}
                    {@const wikiUrl = assetLocationData?.wiki_link || buildWikiLink(frozenMeta.label)}
                    <a
                      class="focus-profile-link"
                      href={wikiUrl}
                      target="_blank"
                      rel="noopener noreferrer">GEM Wiki &rarr;</a
                    >
                  {/if}
                {:else}
                  <span class="focus-label">
                    {focusKindLabel(frozenMeta)}: <strong>{frozenMeta.label}</strong>
                    {#if (frozenMeta.kind === 'country' || frozenMeta.kind === 'entity-type') && frozenMeta.facts.length > 0}
                      <span class="focus-count">({frozenMeta.facts[0]})</span>
                    {/if}
                  </span>
                  {#if frozenMeta.facts.length > 0}
                    <div class="focus-facts">
                      {#each frozenMeta.facts as fact}
                        <span class="focus-fact">{fact}</span>
                      {/each}
                    </div>
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
              : ''}
            onclick={(ev) => {
              if (shouldIgnoreBackgroundClick(performance.now(), suppressBackgroundClickUntil))
                return;
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
                refX="5"
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
                refX="5"
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
                      style="fill: {e.imputed_share ? '#8fa3aa' : C.teal}"
                      >{Number.isInteger(e.value) ? e.value : e.value.toFixed(1)}%</text
                    >
                  {/if}
                </g>
              {/each}

              <!-- Nodes -->
              {#each layoutNodes as n (n.id)}
                {@const showLabel = shouldShowLabel(n)}
                {@const pos = n.labelPos || { dx: 0, dy: nodeR + 8, below: false, small: false }}
                {@const wrapped = wrapText(
                  n.label,
                  pos.small ? Math.min(labelMaxChars, 10) : labelMaxChars
                )}
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
                  onclick={() => handleNativeNodeClick(n)}
                  ondblclick={() => dblClickNode(n)}
                  onkeydown={(ev) => ev.key === 'Enter' && dblClickNode(n)}
                  onpointerdown={(ev) => startNodePress(n, ev)}
                  onpointerup={(ev) => endNodePress(n, ev)}
                  onpointercancel={cancelNodePress}
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
                    <foreignObject
                      x={-n.w / 2}
                      y={-n.h / 2}
                      width={n.w}
                      height={n.h}
                      style="pointer-events: none;"
                    >
                      <div class="asset-card" class:compact class:has-sub={assetType && !compact}>
                        {#if assetType && !compact}
                          <div class="asset-sub" style="color: {C.mint}">{assetType}</div>
                        {/if}
                        <div class="asset-main">{n.label}</div>
                      </div>
                    </foreignObject>
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
                        <tspan x={pos.dx} dy={wrapped.line2 ? '-0.7em' : '0'}>{wrapped.line1}</tspan
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
          onChangeColorMode={(mode) => {
            colorMode = mode;
            hashInitializedColor = true;
          }}
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
        hoveredPathEdgeIndices={activeNodeData?.edgeIndices ?? null}
      />
    </div>

  {/if}
</div>

{#if pathModalOpen && frozenMeta?.kind === 'entity'}
  {@const rootNode = filteredNodes.find((n) => n.id === rootId)}
  <OwnershipPathModal
    open={pathModalOpen}
    onClose={() => (pathModalOpen = false)}
    entityName={frozenMeta.label}
    rootName={rootNode?.name || rootNode?.Name || rootId}
    nodes={pathModalNodes}
    edges={pathModalEdges}
    {rootId}
    {pathsMap}
    {edgePctMap}
    {onNavigate}
  />
{/if}

<style>
  /* Off-screen SVG that hosts the hidden measurement <text>. It must still
     lay out (for getBBox()) — width/height 0 + overflow visible is enough,
     but we position it absolute so it never participates in flow. */
  .label-measurer {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    overflow: visible;
    pointer-events: none;
    visibility: hidden;
  }

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
  @container (max-width: 768px) {
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
    max-height: none;
    height: 70vh;
    min-height: 400px;
    overflow: hidden;
  }
  .graph-wrap.expand-height > svg {
    height: 100%;
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
  .node-lbl {
    text-anchor: middle;
    dominant-baseline: middle;
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
  .asset-card.compact {
    padding: 2px 8px;
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
  .asset-card.compact .asset-main {
    font-size: 11px;
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
  .focus-fact.hoverable {
    cursor: pointer;
    transition:
      background 120ms ease,
      border-color 120ms ease;
  }
  .focus-fact.hoverable:hover {
    background: rgba(0, 79, 97, 0.2);
    border-color: rgba(0, 79, 97, 0.35);
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

  .focus-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }
  .focus-footer .focus-fact.id {
    margin: 0;
  }
  .focus-profile-link {
    display: inline-block;
    font-size: 0.68rem;
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

  .focus-path-btn {
    display: inline-block;
    font-size: 0.68rem;
    color: var(--tree-teal, #004f61);
    background: none;
    border: 1px solid rgba(0, 79, 97, 0.25);
    border-radius: 999px;
    padding: 1px 8px;
    cursor: pointer;
    font-weight: 600;
    opacity: 0.85;
    transition: opacity 0.1s, background 0.1s;
    line-height: 1.5;
  }
  .focus-path-btn:hover {
    opacity: 1;
    background: rgba(0, 79, 97, 0.08);
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

  .focus-asset-name {
    font-size: var(--font-size-base, 14px);
    font-weight: 600;
    color: var(--color-text-primary, #111827);
    display: block;
    margin-bottom: 4px;
  }
  .focus-asset-narrative {
    font-size: var(--font-size-sm, 12px);
    line-height: 1.55;
    color: var(--color-text-secondary, #6b7280);
    margin: 4px 0 0;
  }

  /* Panel toggle — moved to OwnershipPanel.svelte */

  /* Mobile responsive */
  @media (max-width: 768px) {
    .container {
      flex-direction: column;
      gap: 12px;
    }
    .graph-wrap {
      max-height: none;
    }
    .full-width .graph-wrap {
      max-height: 62vh;
    }
    .graph-area {
      min-width: 0;
    }
    .graph-wrap.expand-height {
      max-height: 100vh;
      overflow: auto;
    }
    .graph-wrap > svg {
      min-height: 250px;
    }
    .graph-controls {
      gap: 8px;
      flex-wrap: wrap;
    }
    .node circle {
      transform: scale(1.15);
    }
  }
</style>
