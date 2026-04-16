<script>
  /**
   * PORTFOLIO EXPLORER — Reusable core component
   * Pick an entity → see all downstream assets grouped by project/location,
   * with summary breakdowns by country, type, status, and intermediaries.
   * When filtered to a small set, shows a d3.cluster tree linking ownership paths.
   *
   * Accepts entityId/hidePicker as props (used by both route page and widget).
   * Ported from Observable notebook: https://observablehq.com/d/5a1f34aee34fe4cf
   */
  import { assetLink } from '$lib/links';
  import { LAYOUT, clampViewportPosition, isViewportBelow } from '$lib/responsive';
  import * as d3 from 'd3-selection';
  import * as d3Array from 'd3-array';
  import * as d3Hierarchy from 'd3-hierarchy';
  import * as d3Shape from 'd3-shape';
  import { drawMolecule, computeMoleculeRadii } from '$lib/components/ownership/molecule-renderer';
  import { scaleOrdinal } from 'd3-scale';
  import { schemeTableau10, schemePaired, schemeSet3 } from 'd3-scale-chromatic';

  import {
    colors,
    trackerColorMap,
    statusColorsGranular,
    ownershipColors,
  } from '$lib/design-tokens';
  import NestedIntermediaryPanel from './NestedIntermediaryPanel.svelte';

  const API_BASE =
    import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // ============================================================================
  // PROPS
  // ============================================================================
  let {
    entityId = '',
    hidePicker = false,
    onStateChange = undefined,
    /** Pixels to subtract from viewport height for chart area.
     *  Default 320 accounts for navbar + header + footer.
     *  Embeds/widgets with no navbar can pass a smaller value (e.g. 120). */
    heightOffset = LAYOUT.portfolio.defaultHeightOffset,
    linkBase = '',
    linkTarget = '',
    /** Initial color field to restore from URL (type | status | country) */
    initialColor = '',
    /** Initial filters to restore from URL — keys are filter names, values are comma-separated strings */
    initialFilters = {},
  } = $props();

  /** Format cumulative ownership % for display */
  function fmtPct(pct) {
    return pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct);
  }

  // ============================================================================
  // SAMPLE OWNERS (from notebook)
  // ============================================================================
  const SAMPLE_OWNERS = [
    ['Bank of America Co', 'E100001000347'],
    ['LUKOIL PJSC', 'E100000000869'],
    ['National Bank of Kazakhstan', 'E100001015201'],
    ['KKR', 'E100000001247'],
    ['South Korea Gov', 'E100000000962'],
    ['Osaka Gas', 'E100000000654'],
    ['JFE Steel', 'E100001000516'],
    ['Algeria Gov', 'E100001000008'],
    ['JSW Holdings', 'E100001000519'],
    ['India Gov', 'E100001000397'],
  ];

  /** Color by status — uses granular status colors from design tokens */
  const COLOR_BY_STATUS = new Map(Object.entries(statusColorsGranular));

  // ============================================================================
  // STATE
  // ============================================================================
  function createEmptyFilters() {
    return {
      country: new Set(),
      asset_type: new Set(),
      operating_status: new Set(),
      intermediary: new Set(),
      ownership: new Set(),
    };
  }

  function serializeFilterParams(filterParams) {
    return JSON.stringify({
      country: filterParams.country || '',
      asset_type: filterParams.asset_type || '',
      operating_status: filterParams.operating_status || '',
      intermediary: filterParams.intermediary || '',
      ownership: filterParams.ownership || '',
    });
  }

  let selectedEntityId = $state(SAMPLE_OWNERS[0][1]);
  let customEntityId = $state('');
  let loading = $state(false);
  /** Guard: only fire onStateChange after the first user-driven interaction */
  let userHasInteracted = $state(false);
  let error = $state('');

  /** Raw API response */
  let apiData = $state(null);
  /** Summary stats derived from apiData */
  let summary = $state(null);
  /** Project groups (assets grouped by location) */
  let projectGroups = $state([]);
  /** Intermediary entities with their connected asset counts */
  let intermediaries = $state([]);
  /** Cumulative ownership %: projectID → effective ownership through all paths */
  let cumulativePctMap = $state(new Map());
  /** Hovered project group for tooltip */
  let hoveredProject = $state(null);
  /** Tooltip viewport position */
  let tooltipPos = $state({ x: 0, y: 0 });

  /**
   * Multi-dimensional crossfilter:
   * - OR within a column (clicking multiple values in same column = union)
   * - AND across columns (country OR-set ∩ type OR-set ∩ status OR-set ∩ intermediary)
   * - Click toggles individual values on/off
   *
   * Each column stores a Set of selected values. Empty set = no filter for that column.
   * Intermediary stores { values: Set<name>, projectIds: Map<name, Set<projectId>> }
   */
  /** Ownership share filter thresholds */
  const OWNERSHIP_BUCKETS = [
    { label: '50%+', min: 50, max: Infinity },
    { label: '20–50%', min: 20, max: 50 },
    { label: '5–20%', min: 5, max: 20 },
    { label: '<5%', min: 0, max: 5 },
    { label: 'Unknown', min: -1, max: -1 },
  ];

  /** Parse comma-separated filter string into a Set, empty string → empty Set */
  function parseFilterParam(val) {
    return val
      ? new Set(
          val
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : new Set();
  }

  let filters = $state(createEmptyFilters());
  let lastSyncedFilterSignature = $state('');
  /** Intermediary name → projectIds lookup (populated when intermediaries are clicked) */
  let intermediaryProjectIds = $state(new Map());

  /** Set of intermediary entity_ids that are expanded (fold-out) */
  let expandedIntermediaryIds = $state(new Set());

  function toggleIntermediaryFoldout(entityId) {
    const next = new Set(expandedIntermediaryIds);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    expandedIntermediaryIds = next;
  }

  /** Whether any filter is active */
  let isFiltered = $derived(
    filters.country.size > 0 ||
      filters.asset_type.size > 0 ||
      filters.operating_status.size > 0 ||
      filters.intermediary.size > 0 ||
      filters.ownership.size > 0
  );

  /** Get ownership bucket label for an asset */
  function getOwnershipBucket(asset) {
    const s = asset.ownership_share;
    if (s == null || s === 0) return 'Unknown';
    for (const b of OWNERSHIP_BUCKETS) {
      if (b.min === -1) continue;
      if (s >= b.min && s < b.max) return b.label;
    }
    return 'Unknown';
  }

  /** Apply all active filters (OR within column, AND across columns) */
  let filteredResult = $derived.by(() => {
    if (!isFiltered || !apiData) return null;
    let assets = apiData.assets;
    if (filters.country.size > 0) {
      assets = assets.filter((a) => filters.country.has(a.country || 'Unknown'));
    }
    if (filters.asset_type.size > 0) {
      assets = assets.filter((a) => filters.asset_type.has(a.asset_type || 'Unknown'));
    }
    if (filters.operating_status.size > 0) {
      assets = assets.filter((a) => filters.operating_status.has(a.operating_status || 'Unknown'));
    }
    if (filters.intermediary.size > 0) {
      // Union all projectIds from selected intermediaries
      const allPids = new Set();
      for (const name of filters.intermediary) {
        const pids = intermediaryProjectIds.get(name);
        if (pids) for (const p of pids) allPids.add(p);
      }
      assets = assets.filter((a) => allPids.has(a.location_id || a.unit_id || a.asset_id));
    }
    if (filters.ownership.size > 0) {
      assets = assets.filter((a) => filters.ownership.has(getOwnershipBucket(a)));
    }
    return {
      data: { ...apiData, assets },
      summary: summarizeAssets(assets),
      groups: makeProjectGroups(assets),
    };
  });

  /** The data currently being displayed */
  let displayData = $derived(filteredResult ? filteredResult.data : apiData);
  let displaySummary = $derived(filteredResult ? filteredResult.summary : summary);
  let displayProjectGroups = $derived(filteredResult ? filteredResult.groups : projectGroups);

  /** Color field: user-toggleable, defaults to 'type' when multi-type */
  const ALL_COLOR_FIELDS = ['type', 'status', 'country'];
  let colorFieldOverride = $state('');
  let lastSyncedColor = $state('');
  /** Only show options that have >1 distinct value (coloring by a single value is useless) */
  let availableColorFields = $derived.by(() => {
    if (!summary) return ALL_COLOR_FIELDS;
    return ALL_COLOR_FIELDS.filter((f) => {
      if (f === 'type') return summary.byType.size > 1;
      if (f === 'status') return summary.byStatus.size > 1;
      if (f === 'country') return summary.byCountry.size > 1;
      return true;
    });
  });
  let colorField = $derived.by(() => {
    // If user override is still valid, use it
    if (colorFieldOverride && availableColorFields.includes(colorFieldOverride))
      return colorFieldOverride;
    // Auto-select first available, prefer type > status > country
    if (availableColorFields.length > 0) return availableColorFields[0];
    return 'type';
  });

  /** Whether any non-intermediary filter is active (for computing intermediary counts) */
  let hasNonIntermediaryFilter = $derived(
    filters.country.size > 0 || filters.asset_type.size > 0 || filters.operating_status.size > 0
  );

  /** Intermediaries with counts updated to reflect current non-intermediary filters */
  let displayIntermediaries = $derived.by(() => {
    if (!hasNonIntermediaryFilter || !apiData) return intermediaries;
    let assets = apiData.assets;
    if (filters.country.size > 0) {
      assets = assets.filter((a) => filters.country.has(a.country));
    }
    if (filters.asset_type.size > 0) {
      assets = assets.filter((a) => filters.asset_type.has(a.asset_type));
    }
    if (filters.operating_status.size > 0) {
      assets = assets.filter((a) => filters.operating_status.has(a.operating_status));
    }
    const filteredProjectIds = new Set(assets.map((a) => a.location_id || a.unit_id || a.asset_id));
    return intermediaries
      .map((inter) => {
        const count = [...inter.projectIds].filter((pid) => filteredProjectIds.has(pid)).length;
        return { ...inter, filteredCount: count };
      })
      .sort((a, b) => b.filteredCount - a.filteredCount);
  });

  /** Extended palette for country colors — combines Tableau10 + Paired12 + Set3 for 30+ unique colors */
  const EXTENDED_PALETTE = [...new Set([...schemeTableau10, ...schemePaired, ...schemeSet3])];

  /** Country color scale — ordinal, built from data */
  let countryColorScale = $derived.by(() => {
    if (!summary) return scaleOrdinal(EXTENDED_PALETTE);
    return scaleOrdinal(EXTENDED_PALETTE).domain([...summary.byCountry.keys()]);
  });

  /** Tree SVG params */
  const treeParams = {
    rowHeight: 28,
    siblingSeparation: 1.0,
    cousinSeparation: 1.4,
    nodeRadius: 8,
  };

  /** Available viewport height for chart area */
  let containerHeight = $state(500);

  /** How many asset rows fit in one column (notebook: nRows = svgHeight / assetMarkHeightCombined) */
  const ASSET_MARK_H = 34;
  let nRowsFit = $derived(
    Math.max(
      4,
      Math.floor(Math.max(LAYOUT.portfolio.chartMinHeight, containerHeight - 80) / ASSET_MARK_H)
    )
  );

  /** Show tree when ≤30 assets AND <7 ownership depth layers */
  let showTree = $derived(
    displayProjectGroups.length > 0 &&
    displayProjectGroups.length <= 30 &&
    treeMaxDepth < 7
  );

  /** DOM refs */
  let chartContainer = $state(null);
  let treeSvgEl = $state(null);
  let assetsSvgEl = $state(null);

  /** Horizontal scroll fade state */
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasHorizontalOverflow = $state(false);
  let scrollThumbWidth = $state(100);
  let scrollThumbOffset = $state(0);

  /** Stored d3 tree root — needed for asset→tree cross-highlighting */
  let treeRoot = $state(null);
  /** Max ownership depth from root to leaf asset */
  let treeMaxDepth = $state(0);

  /** Selected project for detail modal — null when closed */
  let selectedProject = $state(null);
  /** Modal position (viewport coords for fixed positioning) */
  let modalPos = $state({ x: 0, y: 0 });
  let assetModalStyle = $derived.by(() => {
    if (typeof window === 'undefined') return '';
    const left = clampViewportPosition(
      modalPos.x,
      LAYOUT.portfolio.modal.maxWidth,
      window.innerWidth,
      LAYOUT.portfolio.modal.viewportPadding
    );
    const top = clampViewportPosition(
      modalPos.y + LAYOUT.portfolio.modal.anchorOffsetY,
      LAYOUT.portfolio.modal.maxHeight,
      window.innerHeight,
      LAYOUT.portfolio.modal.viewportPadding
    );
    return `left: ${left}px; top: ${top}px;`;
  });

  function interruptChartTransitions() {
    if (treeSvgEl) d3.select(treeSvgEl).selectAll('*').interrupt();
    if (assetsSvgEl) d3.select(assetsSvgEl).selectAll('*').interrupt();
  }

  function updateScrollState() {
    if (!chartContainer) return;
    const { scrollLeft, scrollWidth, clientWidth } = chartContainer;
    const maxScroll = Math.max(scrollWidth - clientWidth, 0);
    const overflow = maxScroll > 12;
    const thumbWidth = scrollWidth > 0 ? (clientWidth / scrollWidth) * 100 : 100;

    hasHorizontalOverflow = overflow;
    canScrollLeft = overflow && scrollLeft > 10;
    canScrollRight = overflow && scrollLeft < maxScroll - 10;
    scrollThumbWidth = overflow ? Math.min(100, Math.max(thumbWidth, 18)) : 100;
    scrollThumbOffset = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - scrollThumbWidth) : 0;
  }

  /** Track horizontal scroll position for fade affordance */
  $effect(() => {
    if (!chartContainer) return;
    const el = chartContainer;
    const assetsEl = assetsSvgEl;
    const treeEl = treeSvgEl;
    const handler = () => updateScrollState();
    el.addEventListener('scroll', handler, { passive: true });
    // Defer initial check so layout is complete
    const raf = requestAnimationFrame(() => handler());
    const ro = new ResizeObserver(() => handler());
    ro.observe(el);
    if (assetsEl) ro.observe(assetsEl);
    if (treeEl) ro.observe(treeEl);
    return () => {
      el.removeEventListener('scroll', handler);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  });

  /** AbortController for in-flight fetch — prevents stale data on rapid entity switching */
  let fetchController = null;

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  async function fetchData(entityId) {
    // Cancel any in-flight fetch
    if (fetchController) fetchController.abort();
    const controller = new AbortController();
    fetchController = controller;
    const signal = controller.signal;

    loading = true;
    error = '';
    apiData = null;
    summary = null;
    projectGroups = [];
    intermediaries = [];
    cumulativePctMap = new Map();
    intermediaryProjectIds = new Map();
    filters = {
      country: new Set(),
      asset_type: new Set(),
      operating_status: new Set(),
      intermediary: new Set(),
      ownership: new Set(),
    };
    hoveredProject = null;
    selectedProject = null;
    treeRoot = null;
    treeMaxDepth = 0;

    try {
      const resp = await fetch(
        `${API_BASE}/ownership/graph?root=${encodeURIComponent(entityId)}&direction=down&format=json`,
        { signal }
      );
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();

      const spotlightOwner = data.root;
      const assets = (data.nodes || []).filter((n) => n.node_type === 'asset');
      const entities = (data.nodes || []).filter(
        (n) => n.node_type === 'entity' && n.entity_id !== spotlightOwner.entity_id
      );
      const edges = data.edges || [];

      const sum = summarizeAssets(assets);

      // Group assets into projects by location_id
      const groups = makeProjectGroups(assets);

      // Build intermediary data
      const treePaths = makeTreePaths(
        { nodes: data.nodes, edges },
        spotlightOwner.entity_id,
        groups
      );
      const interData = computeIntermediaries(entities, treePaths, spotlightOwner.entity_id);

      apiData = {
        spotlightOwner,
        assets,
        entities,
        edges,
        nodes: data.nodes,
        summary: sum,
      };
      summary = sum;
      projectGroups = groups;
      intermediaries = interData;
      cumulativePctMap = treePaths.cumulativePctMap;
      treeMaxDepth = treePaths.maxDepth;
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by newer fetch
      error = err.message || 'Failed to fetch data';
    } finally {
      if (fetchController === controller) fetchController = null;
      if (!signal.aborted) loading = false;
    }
  }

  // ============================================================================
  // SUMMARIZE ASSETS (port of summarizeAssets3)
  // ============================================================================
  function uniqueCount(arr, field) {
    return new Set(arr.map((d) => d[field])).size;
  }
  function uniqueCountIfNull(arr, field1, field2) {
    return new Set(arr.map((d) => d[field1] || d[field2])).size;
  }
  function sortMap(field, map) {
    return new Map([...map].sort((a, b) => (b[1][field] || 0) - (a[1][field] || 0)));
  }

  function summarizeAssets(assets) {
    function getStats(v) {
      return {
        assetCount: uniqueCountIfNull(v, 'location_id', 'asset_id'),
        unitCount: uniqueCount(v, 'asset_id'),
        types: new Set(v.map((d) => d.asset_type)),
      };
    }
    const total = getStats(assets);
    const byCountry = sortMap(
      'assetCount',
      d3Array.rollup(assets, getStats, (d) => d.country || 'Unknown')
    );
    const byType = sortMap(
      'assetCount',
      d3Array.rollup(assets, getStats, (d) => d.asset_type || 'Unknown')
    );
    const byStatus = sortMap(
      'assetCount',
      d3Array.rollup(assets, getStats, (d) => d.operating_status || 'Unknown')
    );
    const byOwnership = sortMap(
      'assetCount',
      d3Array.rollup(assets, getStats, (d) => getOwnershipBucket(d))
    );
    return { total, byCountry, byType, byStatus, byOwnership };
  }

  // ============================================================================
  // PROJECT GROUPS (group assets by location)
  // ============================================================================
  function makeProjectGroups(assets) {
    const grouped = d3Array.groups(assets, (d) => d.location_id || d.unit_id || d.asset_id);
    const projects = grouped.map(([id, units]) => ({
      projectID: id,
      units: units.sort((a, b) => (a.asset_name || '').localeCompare(b.asset_name || '')),
    }));
    projects.sort((a, b) =>
      (a.units[0]?.asset_name || '').localeCompare(b.units[0]?.asset_name || '')
    );
    return projects;
  }

  // ============================================================================
  // TREE PATHS (build path strings for d3.hierarchy)
  // ============================================================================
  function makeTreePaths(graph, rootEntityId, groups) {
    const { nodes, edges } = graph;
    const projectIds = new Set(groups.map((g) => g.projectID));

    // Build adjacency: source → targets
    const childrenOf = new Map();
    for (const e of edges) {
      if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
      childrenOf.get(e.source).push(e.target);
    }

    // Build edge value lookup: source → target → ownership %
    const edgeValue = new Map();
    for (const e of edges) {
      if (!edgeValue.has(e.source)) edgeValue.set(e.source, new Map());
      edgeValue.get(e.source).set(e.target, e.value);
    }

    // Map asset_id → location_id (project) for leaf resolution
    const assetToProject = new Map();
    for (const n of nodes) {
      if (n.node_type === 'asset') {
        const projId = n.location_id || n.unit_id || n.asset_id;
        assetToProject.set(n.asset_id, projId);
        // Also map the composite id
        if (n.asset_id !== projId) assetToProject.set(n.asset_id, projId);
      }
    }

    // DFS to collect all paths from root to leaf projects,
    // computing cumulative ownership % along each path.

    const paths = [];
    const pathStrings = [];
    /** Cumulative ownership: projectID → sum of effective % across distinct ownership chains */
    const cumulativePctMap = new Map();
    const visited = new Set();
    /**
     * Dedup key: "projId:rootChild" — prevents double-counting when the
     * same ownership chain reaches the same project via units at different
     * tree depths (e.g., National Grid → PJ GT2 directly AND National Grid
     * → ... → NatGrid Gen → PJ 3.0 are the same 5.9% chain).
     */
    const countedProjChains = new Set();

    function addCumulativePct(projId, pct, rootChild) {
      const key = `${projId}:${rootChild}`;
      if (countedProjChains.has(key)) return;
      countedProjChains.add(key);
      cumulativePctMap.set(projId, (cumulativePctMap.get(projId) || 0) + pct);
    }

    function dfs(nodeId, path, cumPct) {
      if (visited.has(nodeId)) return; // cycle detection
      visited.add(nodeId);
      const children = childrenOf.get(nodeId) || [];
      // The first entity after root identifies the ownership chain
      const rootChild = path.length >= 2 ? path[1] : nodeId;
      if (children.length === 0) {
        // Leaf — resolve to project ID.
        const projId = assetToProject.get(nodeId) || nodeId;
        if (projectIds.has(projId) || projectIds.has(nodeId)) {
          const fullPath = [...path, projId];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
          addCumulativePct(projId, cumPct, rootChild);
        }
        // else: dead-end entity — intentionally dropped
        visited.delete(nodeId);
        return;
      }
      for (const child of children) {
        const ev = edgeValue.get(nodeId)?.get(child);
        const childPct = ev != null ? (cumPct * ev) / 100 : cumPct;

        // Deduplicate: if child is an asset, resolve to project
        const resolved = assetToProject.get(child);
        if (resolved && projectIds.has(resolved)) {
          const fullPath = [...path, resolved];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
          addCumulativePct(resolved, childPct, rootChild);
        } else {
          dfs(child, [...path, child], childPct);
        }
      }
      visited.delete(nodeId);
    }
    dfs(rootEntityId, [rootEntityId], 100);

    // Deduplicate path strings — keep only ONE path per project leaf.
    // Multiple ownership chains can reach the same project (e.g. via different
    // subsidiaries). Without dedup, the tree has duplicate leaves that don't
    // align with asset rows, creating dangling branches.
    const seenLeafs = new Set();
    const uniquePathStrings = [];
    for (const ps of [...new Set(pathStrings)]) {
      const leaf = ps.split('/').pop();
      if (!seenLeafs.has(leaf)) {
        seenLeafs.add(leaf);
        uniquePathStrings.push(ps);
      }
    }

    const maxDepth = paths.reduce((max, p) => Math.max(max, p.path.length - 1), 0);
    return { paths, pathStrings: uniquePathStrings, cumulativePctMap, maxDepth };
  }

  // ============================================================================
  // INTERMEDIARIES
  // ============================================================================
  function computeIntermediaries(entities, treePaths, _rootEntityId) {
    return entities
      .map((e) => {
        const connectedLeafs = new Set(
          treePaths.paths
            .filter((p) => p.path.includes(e.entity_id))
            .map((p) => p.path[p.path.length - 1])
        );
        return {
          entity_id: e.entity_id,
          name: e.name || e.full_name || e.entity_id,
          assetCount: connectedLeafs.size,
          projectIds: connectedLeafs, // keep for filtering
        };
      })
      .filter((e) => e.assetCount > 0)
      .sort((a, b) => b.assetCount - a.assetCount);
  }

  // ============================================================================
  // FILTERING — OR within column (click toggles), AND across columns
  // ============================================================================
  function applyFilter(field, value, projectIdSet) {
    if (!apiData) return;
    userHasInteracted = true;
    const next = new Set(filters[field]);
    if (next.has(value)) {
      next.delete(value); // toggle off
    } else {
      next.add(value); // toggle on
    }
    filters = { ...filters, [field]: next };
    selectedProject = null;
    // Store intermediary projectIds when needed
    if (field === 'intermediary' && projectIdSet) {
      const nextMap = new Map(intermediaryProjectIds);
      nextMap.set(value, projectIdSet);
      intermediaryProjectIds = nextMap;
    }
  }

  function clearFilter() {
    filters = {
      country: new Set(),
      asset_type: new Set(),
      operating_status: new Set(),
      intermediary: new Set(),
      ownership: new Set(),
    };
  }

  // ============================================================================
  // D3 TREE VISUALIZATION (port of drawTreeChart)
  // ============================================================================
  function buildHierarchy(pathStrings, validLeafIds) {
    const root = { name: 'root', children: [] };
    for (const ps of pathStrings) {
      const parts = ps.split('/');
      let cur = root;
      for (const part of parts) {
        let child = cur.children.find((c) => c.name === part);
        if (!child) {
          child = { name: part, children: [] };
          cur.children.push(child);
        }
        cur = child;
      }
    }
    // Prune branches that don't reach a valid project leaf
    function prune(node) {
      node.children = node.children.filter((c) => {
        prune(c);
        // Keep if it's a valid leaf OR has children that survived pruning
        return c.children.length > 0 || validLeafIds.has(c.name);
      });
    }
    prune(root);
    return root.children.length === 1 ? root.children[0] : root;
  }

  function drawTree() {
    if (!treeSvgEl || !apiData || !showTree) {
      treeRoot = null;
      return;
    }
    const svg = d3.select(treeSvgEl);
    svg.selectAll('*').interrupt().remove();

    // Build filtered graph for current project groups
    const currentGroups = displayProjectGroups;
    const treePaths = makeTreePaths(
      { nodes: apiData.nodes, edges: apiData.edges },
      apiData.spotlightOwner.entity_id,
      currentGroups
    );
    if (treePaths.pathStrings.length === 0) return;

    const validLeafIds = new Set(currentGroups.map((g) => g.projectID));
    const hierData = buildHierarchy(treePaths.pathStrings, validLeafIds);
    const root = d3Hierarchy.hierarchy(hierData);

    // Calculate height: use available container space, but at least enough for leaves
    const leaves = root.leaves();
    const nLeaves = leaves.length;
    let sibGaps = 0;
    let cousinGaps = 0;
    for (let i = 0; i < nLeaves - 1; i++) {
      if (leaves[i].parent === leaves[i + 1].parent) sibGaps++;
      else cousinGaps++;
    }
    const contentHeight =
      nLeaves * treeParams.rowHeight +
      sibGaps * treeParams.siblingSeparation +
      cousinGaps * treeParams.cousinSeparation;
    // Expand to fill available space (like the notebook does), but don't go below content needs
    const availableHeight = Math.max(200, containerHeight - 80);
    const calcHeight = Math.max(contentHeight, availableHeight);

    const margin = { left: 50, top: 20, right: 4, bottom: 20 };
    const width = 200 - margin.left - margin.right;
    const height = calcHeight;

    const tree = d3Hierarchy
      .cluster()
      .size([height, width])
      .separation((a, b) =>
        a.parent === b.parent ? treeParams.siblingSeparation : treeParams.cousinSeparation
      );

    root.sort((a, b) => d3Array.ascending(a.data.name, b.data.name));
    tree(root);

    svg
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    // Get intermediary (non-leaf) nodes
    const intermediaryNodes = root.descendants().filter((d) => d.children);
    // Map entity_id → node metadata
    const nodeMap = new Map((apiData.nodes || []).map((n) => [n.entity_id || n.asset_id, n]));
    // Build edge lookup: target → edge (for ownership %)
    const edgeLookup = new Map((apiData.edges || []).map((e) => [e.target, e]));

    intermediaryNodes.forEach((d) => {
      const entity = nodeMap.get(d.data.name);
      d.entityName = entity ? entity.name || entity.full_name : d.data.name;
      // Real ownership percentage from API edge
      const edge = edgeLookup.get(d.data.name);
      d.ownershipPct =
        edge && typeof edge.value === 'number' ? Math.max(0, Math.min(1, edge.value / 100)) : 1;
    });

    // Links
    const linkData = root.links();
    const PAD = 3;
    const nr = treeParams.nodeRadius;

    const linkGroup = g.append('g').attr('class', 'link-group');
    linkGroup
      .selectAll('path')
      .data(linkData)
      .join('path')
      .attr('d', (d) => {
        const isLeaf = !d.target.children;
        const xS = d.source.y + nr + PAD;
        const yS = d.source.x;
        // Leaf links extend to the right edge of the tree so they point at the asset icons
        const xT = isLeaf ? width + margin.right : d.target.y - nr - PAD;
        const yT = d.target.x;
        const dx = xT - xS;
        const distX = Math.max(dx / 2, width * 0.075);
        return `M${xS},${yS} C${xS + distX},${yS} ${xT - distX},${yT} ${xT},${yT}`;
      })
      .style('fill', 'none')
      .style('stroke', ownershipColors.treeEdge)
      .style('stroke-width', 1.5)
      .style('stroke-linecap', 'round')
      .style('mix-blend-mode', 'multiply');

    // Entity nodes (non-leaf)
    const nodeGroup = g.append('g').attr('class', 'node-group');
    const marks = nodeGroup
      .selectAll('g.node-mark')
      .data(intermediaryNodes)
      .join('g')
      .attr('class', 'node-mark')
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer');

    // Node circles
    marks
      .append('circle')
      .attr('cx', (d) => (d.depth === 0 ? -nr : 0))
      .attr('r', (d) => (d.depth === 0 ? nr * 2 : nr))
      .style('fill', ownershipColors.treeNodeFill);

    // Ownership pie slice — uses real % from API edges
    const arc = d3Shape.arc().innerRadius(0).startAngle(0);
    marks
      .append('path')
      .attr('transform', (d) => `translate(${d.depth === 0 ? -nr : 0},0)`)
      .attr('d', (d) => {
        const outerR = (d.depth === 0 ? 2 : 1) * nr - 1.5;
        const pct = d.ownershipPct != null ? d.ownershipPct : 1;
        return arc({ outerRadius: outerR, endAngle: 2 * Math.PI * pct });
      })
      .style('fill', ownershipColors.treeTeal)
      .style('pointer-events', 'none');

    // Labels (hidden by default, show on hover)
    const labelGroup = g.append('g').attr('class', 'label-group');
    const labels = labelGroup
      .selectAll('g.node-label')
      .data(intermediaryNodes)
      .join('g')
      .attr('class', 'node-label')
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    labels
      .append('text')
      .attr('dy', '0.31em')
      .attr('y', (d) => -nr - 11 - (d.depth === 0 ? nr / 2 + 2 : 0))
      .style('text-anchor', 'middle')
      .style('stroke', 'white')
      .style('stroke-linejoin', 'round')
      .style('stroke-width', 3)
      .attr('paint-order', 'stroke')
      .style('opacity', (d) => (d.depth === 0 ? 1 : 0))
      .style('pointer-events', 'none')
      .style('font-size', '10px')
      .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
      .style('fill', colors.navy)
      .text((d) => {
        const name = d.entityName || '';
        return name.length > 20 ? name.slice(0, 18) + '…' : name;
      });

    // Ownership percentage labels below each intermediary node (skip root)
    marks
      .filter((d) => d.depth > 0 && d.ownershipPct != null)
      .append('text')
      .attr('x', 0)
      .attr('y', nr + 10)
      .style('text-anchor', 'middle')
      .style('font-size', '8px')
      .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
      .style('fill', '#64748b')
      .style('pointer-events', 'none')
      .text((d) => {
        const pct = Math.round(d.ownershipPct * 100);
        return pct + '%';
      });

    // Hover interactions: highlight paths (matches Observable notebook exactly)
    marks
      .on('mouseover', function (event, d) {
        // Find all upstream and downstream nodes of the hovered node
        const activeNodes = new Set([...d.ancestors(), ...d.descendants()]);

        // Dim all node marks not in the path
        marks
          .transition('fade')
          .duration(100)
          .style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));

        // Dim all edges not connecting active nodes
        linkGroup
          .selectAll('path')
          .transition('fade')
          .duration(100)
          .style('opacity', (l) =>
            activeNodes.has(l.source) && activeNodes.has(l.target) ? 1 : 0.05
          );

        // Show only the label of the hovered node
        labels
          .selectAll('text')
          .filter((n) => n.depth > 0)
          .transition('fade')
          .duration(100)
          .style('opacity', (n) => (d.entityName === n.entityName ? 1 : 0));

        // Only highlight the relevant asset groups
        if (assetsSvgEl) {
          const leafNames = new Set(d.leaves().map((l) => l.data.name));
          d3.select(assetsSvgEl)
            .selectAll('.asset-row')
            .transition('fade')
            .duration(100)
            .style('opacity', function () {
              const pid = this.getAttribute('data-project-id');
              return leafNames.has(pid) ? 1 : 0.15;
            });
        }
      })
      .on('mouseout', function () {
        // Restore all node marks
        marks.transition('fade').duration(200).style('opacity', 1);

        // Restore all edges
        linkGroup.selectAll('path').transition('fade').duration(200).style('opacity', 1);

        // Hide non-root labels
        labels
          .selectAll('text')
          .filter((n) => n.depth > 0)
          .transition('fade')
          .duration(200)
          .style('opacity', 0);

        // Restore all assets
        if (assetsSvgEl) {
          d3.select(assetsSvgEl)
            .selectAll('.asset-row')
            .transition('fade')
            .duration(200)
            .style('opacity', 1);
        }
      });

    // Store root for asset→tree cross-highlighting
    treeRoot = root;
    return root;
  }

  // ============================================================================
  // ASSET SVG DRAWING (matches notebook's gridInfo + drawAssetsAndUnits)
  // ============================================================================
  function drawAssets() {
    if (!assetsSvgEl || !displayData) return;
    const svg = d3.select(assetsSvgEl);
    svg.selectAll('*').interrupt().remove();

    const groups = displayProjectGroups;
    if (groups.length === 0) return;

    const unitR = 8;
    const labelX = 28;
    // Condense row height when showing tree with many assets so they fit
    const assetMarkH = showTree && groups.length > 15
      ? Math.max(20, Math.floor((containerHeight - 100) / groups.length))
      : 28;
    const assetMarkSingle = Math.min(22, assetMarkH);

    // --- Grid layout: fit 2 columns to container width, grow tall ---
    const isMobile = isViewportBelow('sm');
    const nProjects = groups.length;
    const containerEl = assetsSvgEl?.parentElement;
    const availableWidth = containerEl ? containerEl.clientWidth - 8 : 600;
    const maxCols = isMobile || showTree ? 1 : 2;
    const nCols = Math.max(1, Math.min(maxCols, Math.floor(availableWidth / 200)));
    const colWidth = Math.floor(availableWidth / nCols);
    const nRows = Math.ceil(nProjects / nCols);

    // Single column when tree is visible — assets align to tree leaf positions
    const isSingleColumn = showTree && nCols === 1;

    const leafYMap = new Map();
    if (isSingleColumn && showTree && treeRoot) {
      for (const leaf of treeRoot.leaves()) {
        leafYMap.set(leaf.data.name, leaf.x);
      }
    }

    // Match tree's top margin so leaf Y positions align
    const treeTopMargin = 20;
    const margin = { top: isSingleColumn ? treeTopMargin : 12, left: 4 };

    let totalHeight;
    if (isSingleColumn && leafYMap.size > 0) {
      const maxY = Math.max(...leafYMap.values());
      totalHeight = maxY + margin.top + 30;
    } else {
      totalHeight = nRows * assetMarkH + margin.top + 10;
    }

    svg.attr('width', availableWidth).attr('height', totalHeight);

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    groups.forEach((proj, i) => {
      // Multi-column: wrap after nRows, each column offset by colWidth
      const col = Math.floor(i / nRows);
      const rowInCol = i % nRows;

      // x = column offset, y = tree-aligned or row-based
      const x = col * colWidth;
      let y;
      if (isSingleColumn && leafYMap.has(proj.projectID)) {
        y = leafYMap.get(proj.projectID);
      } else {
        y = rowInCol * assetMarkH + assetMarkH / 2;
      }
      const row = g
        .append('g')
        .attr('class', 'asset-row')
        .attr('data-project-id', proj.projectID)
        .attr('transform', `translate(${x}, ${y})`);

      // Hover background
      row
        .append('rect')
        .attr('x', -(assetMarkH / 2))
        .attr('y', -assetMarkSingle / 2)
        .attr('width', colWidth - 10)
        .attr('height', assetMarkSingle)
        .attr('rx', assetMarkSingle * 0.25)
        .style('fill', 'transparent')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .on('mouseover', function (event) {
          d3.select(this).style('fill', `${colors.bgSecondary}`);
          hoveredProject = proj;
          tooltipPos = { x: event.clientX, y: event.clientY };

          // Highlight only this asset, dim others
          g.selectAll('.asset-row')
            .transition('fade')
            .duration(100)
            .style('opacity', function () {
              return this.getAttribute('data-project-id') === proj.projectID ? 1 : 0.1;
            });

          // Cross-highlight tree: find the leaf for this project, trace ancestors
          if (treeSvgEl && treeRoot) {
            const treeSvg = d3.select(treeSvgEl);
            const assetLeaf = treeRoot.leaves().find((l) => l.data.name === proj.projectID);
            if (assetLeaf) {
              const activeNodes = new Set([...assetLeaf.ancestors()]);

              // Dim tree nodes not in the path
              treeSvg
                .selectAll('.node-mark')
                .transition('fade')
                .duration(100)
                .style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));

              // Dim tree edges not connecting active nodes
              treeSvg
                .selectAll('.link-group path')
                .transition('fade')
                .duration(100)
                .style('opacity', (l) =>
                  activeNodes.has(l.source) && activeNodes.has(l.target) ? 1 : 0.05
                );
            }
          }
        })
        .on('mouseout', function () {
          d3.select(this).style('fill', 'white');
          hoveredProject = null;

          // Restore all assets
          g.selectAll('.asset-row').transition('fade').duration(200).style('opacity', 1);

          // Restore all tree elements
          if (treeSvgEl) {
            const treeSvg = d3.select(treeSvgEl);
            treeSvg.selectAll('.node-mark').transition('fade').duration(200).style('opacity', 1);
            treeSvg
              .selectAll('.link-group path')
              .transition('fade')
              .duration(200)
              .style('opacity', 1);
          }
        })
        .on('click', function (event) {
          event.stopPropagation();
          hoveredProject = null;
          modalPos = { x: event.clientX, y: event.clientY };
          selectedProject = proj;
        });

      // Unit circles via shared molecule renderer
      // Dot radius scales down as unit count grows for readability
      const N = proj.units.length;
      const dotR = N <= 1 ? unitR : N <= 4 ? 6 : N <= 8 ? 5 : N <= 15 ? 4 : 3;
      const maxClusterDiameter = Math.min(assetMarkH - 4, N > 1 ? 24 : assetMarkH - 4);
      const { ringRadius: molRingR, unitRadius: molUnitR } = computeMoleculeRadii(
        maxClusterDiameter,
        N,
        { maxUnitRadius: dotR }
      );

      const moleculeUnits = proj.units.map((unit) => ({
        color:
          colorField === 'type'
            ? trackerColorMap.get(unit.asset_type) || colors.grey
            : colorField === 'status'
              ? COLOR_BY_STATUS.get(unit.operating_status?.toLowerCase()) || colors.grey
              : countryColorScale(unit.country || 'Unknown'),
        ownershipPct: unit.ownership_share,
      }));

      const moleculeG = row.append('g').attr('transform', `translate(${unitR},0)`);
      drawMolecule(moleculeG, moleculeUnits, {
        ringRadius: molRingR,
        unitRadius: molUnitR,
      });

      // Asset name label — prefer project_name from API, fall back to asset_name
      let name = proj.units[0]?.project_name || proj.units[0]?.asset_name || proj.projectID;

      const labelG = row
        .append('g')
        .attr('transform', `translate(${labelX}, 0)`)
        .style('pointer-events', 'none');

      // Type prefix for non-plants
      const assetType = (proj.units[0]?.asset_type || '').toLowerCase();
      let typePrefix = '';
      if (assetType.includes('pipeline')) typePrefix = 'Pipeline';
      else if (assetType.includes('mine')) typePrefix = 'Mine';

      if (typePrefix) {
        labelG
          .append('text')
          .attr('dy', '0.35em')
          .style('font-size', '8px')
          .style('font-weight', 800)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.12em')
          .style('fill', colors.navy)
          .text(typePrefix);

        labelG
          .append('text')
          .attr('dy', '0.35em')
          .attr('x', typePrefix.length * 6 + 4)
          .style('font-size', '9px')
          .style('fill', colors.gray400)
          .style('font-weight', 800)
          .text(' | ');
      }

      const nameX = typePrefix ? typePrefix.length * 6 + 16 : 0;
      labelG
        .append('text')
        .attr('dy', '0.35em')
        .attr('x', nameX)
        .style('font-size', '11px')
        .style('font-weight', 500)
        .style('letter-spacing', '0.03em')
        .style('fill', colors.navy)
        .text(name.length > 40 ? name.slice(0, 38) + '…' : name);

      // Unit count badge
      let afterNameX = nameX + Math.min(name.length * 6.5, 250) + 8;
      if (N > 1) {
        labelG
          .append('text')
          .attr('dy', '0.35em')
          .attr('x', afterNameX)
          .style('font-size', '8px')
          .style('font-weight', 500)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.07em')
          .style('fill', colors.gray500)
          .text(`${N} units`);
        afterNameX += `${N} units`.length * 5.5 + 8;
      }

      // Cumulative ownership badge (effective % through intermediary chains)
      const cumPct = cumulativePctMap.get(proj.projectID);
      if (cumPct != null && cumPct < 99.9) {
        labelG
          .append('text')
          .attr('dy', '0.35em')
          .attr('x', afterNameX)
          .style('font-size', '8px')
          .style('font-weight', 600)
          .style('font-variant-numeric', 'tabular-nums')
          .style('fill', colors.gray400)
          .text(`${fmtPct(cumPct)}% eff.`);
      }
    });
  }

  // ============================================================================
  // REACTIVITY
  // ============================================================================
  // Sync prop → local state when parent changes entityId
  $effect(() => {
    if (entityId) {
      selectedEntityId = entityId;
      // If a prop was provided (e.g. from URL), treat as intentional — enable URL sync
      userHasInteracted = true;
    }
  });

  $effect(() => {
    const nextSignature = serializeFilterParams(initialFilters);
    if (nextSignature === lastSyncedFilterSignature) return;

    filters = {
      country: parseFilterParam(initialFilters.country),
      asset_type: parseFilterParam(initialFilters.asset_type),
      operating_status: parseFilterParam(initialFilters.operating_status),
      intermediary: parseFilterParam(initialFilters.intermediary),
      ownership: parseFilterParam(initialFilters.ownership),
    };
    lastSyncedFilterSignature = nextSignature;
  });

  $effect(() => {
    if (initialColor === lastSyncedColor) return;
    colorFieldOverride = initialColor;
    lastSyncedColor = initialColor;
  });

  $effect(() => {
    if (selectedEntityId) {
      fetchData(selectedEntityId);
    }
  });

  // Notify parent of state changes for URL sync (skip initial mount to avoid
  // injecting the default sample entity into the URL on page load)
  $effect(() => {
    if (!onStateChange || !userHasInteracted) return;
    onStateChange({
      entity: selectedEntityId,
      color: colorFieldOverride || undefined,
      filters: Object.fromEntries(
        Object.entries(filters)
          .filter(([, v]) => v.size > 0)
          .map(([k, v]) => [k, [...v].join(',')])
      ),
    });
  });

  // Derive available chart height from viewport — observing the chart-row itself
  // creates a feedback loop (fewer items → shorter SVG → shorter container → redraw shorter).
  // Using viewport height with a fixed offset for chrome is stable and non-circular.
  $effect(() => {
    if (typeof window === 'undefined') return;
    const update = () => {
      containerHeight = Math.max(
        LAYOUT.portfolio.chartMinHeight,
        window.innerHeight - heightOffset
      );
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  });

  $effect(() => {
    // Redraw when data, filter, color, or container size changes.
    // Read all reactive dependencies explicitly so the effect re-fires correctly.
    const _data = displayData;
    const _groups = displayProjectGroups;
    const _color = colorField;
    const _height = containerHeight;
    const _showTree = showTree;
    let redrawRaf = 0;
    let cancelled = false;
    if (_data && _groups.length > 0) {
      // Use microtask to ensure DOM is ready
      queueMicrotask(() => {
        if (cancelled) return;
        drawTree();
        drawAssets();
        redrawRaf = requestAnimationFrame(() => {
          if (!cancelled) updateScrollState();
        });
      });
    }
    return () => {
      cancelled = true;
      if (redrawRaf) cancelAnimationFrame(redrawRaf);
      interruptChartTransitions();
    };
  });

  // Close modal on Escape key
  $effect(() => {
    if (!selectedProject) return;
    function onKey(e) {
      if (e.key === 'Escape') selectedProject = null;
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  $effect(() => {
    return () => {
      fetchController?.abort();
      interruptChartTransitions();
    };
  });

  /** Build asset URL respecting linkBase override */
  function buildAssetUrl(assetId) {
    if (linkBase) return `${linkBase.replace(/\/$/, '')}/asset/${assetId}`;
    return assetLink(assetId);
  }

  /** Navigate a link: postMessage for widget mode, normal for route mode */
  function handleLinkClick(e, url) {
    if (linkTarget && (linkTarget === 'parent' || linkTarget === 'message')) {
      e.preventDefault();
      window.parent?.postMessage({ type: 'gem-navigate', url }, '*');
    } else if (linkTarget === 'self') {
      e.preventDefault();
      window.location.href = url;
    }
  }

  function handleSelectEntity(id) {
    userHasInteracted = true;
    selectedEntityId = id;
    customEntityId = '';
    selectedProject = null;
  }

  function handleCustomEntity() {
    if (customEntityId.trim()) {
      userHasInteracted = true;
      selectedEntityId = customEntityId.trim();
    }
  }
</script>

<div
  class="portfolio-explorer"
  class:embed-mode={heightOffset < 200}
  style:--chart-max-height={heightOffset < 200
    ? 'none'
    : `calc(100vh - ${LAYOUT.portfolio.chartMaxHeightOffset}px)`}
  style:--portfolio-modal-max-width={`${LAYOUT.portfolio.modal.maxWidth}px`}
  style:--portfolio-modal-max-height={`${LAYOUT.portfolio.modal.maxHeight}px`}
>
  <!-- ENTITY SELECTOR -->
  {#if !hidePicker}
    <div class="selector-bar">
      <div class="selector-label">Select owner:</div>
      <div class="selector-chips">
        {#each SAMPLE_OWNERS as [name, id]}
          <button
            class="chip"
            class:active={selectedEntityId === id}
            onclick={() => handleSelectEntity(id)}
          >
            {name}
          </button>
        {/each}
      </div>
      <div class="custom-input">
        <input
          type="text"
          placeholder="Entity ID (e.g. E100001000347)"
          bind:value={customEntityId}
          onkeydown={(e) => e.key === 'Enter' && handleCustomEntity()}
        />
        <button class="go-btn" onclick={handleCustomEntity}>Go</button>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="loading">Loading portfolio…</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if apiData && summary}
    <!-- MAIN LAYOUT: asset grid (scrolls) + filter sidebar (sticky) -->
    <div class="chart-layout">
      <!-- Asset grid — scrollable -->
      <div class="chart-area" bind:this={chartContainer}>
        {#if isFiltered && displayProjectGroups.length === 0}
          <div class="empty-state">
            <p>No assets match current filters.</p>
            <button class="clear-btn" onclick={clearFilter}>Clear filters</button>
          </div>
        {:else}
          <div class="chart-row">
            {#if showTree}
              <div class="tree-container">
                <svg bind:this={treeSvgEl}></svg>
              </div>
            {/if}
            <div class="assets-container" class:full-width={!showTree}>
              <svg bind:this={assetsSvgEl}></svg>
            </div>
          </div>
        {/if}
      </div>

      <!-- Filter sidebar — sticky -->
      <div class="filter-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-owner"
            >{apiData.spotlightOwner.name || apiData.spotlightOwner.full_name}</span
          >
          <span class="sidebar-stats"
            >{summary.total.assetCount} assets · {summary.total.types.size} tracker{summary.total
              .types.size !== 1
              ? 's'
              : ''}</span
          >
        </div>

        <div class="sidebar-toolbar">
          {#if availableColorFields.length > 1}
            <div class="color-toggle">
              <span class="color-toggle-label">Color by</span>
              {#each availableColorFields as opt}
                <button
                  class="color-toggle-btn"
                  class:active={colorField === opt}
                  onclick={() => {
                    userHasInteracted = true;
                    colorFieldOverride = opt;
                  }}>{opt}</button
                >
              {/each}
            </div>
          {/if}
          {#if isFiltered}
            {@const activeLabels = Object.values(filters).flatMap((s) => [...s])}
            <button class="clear-filter-inline" onclick={clearFilter}>
              Clear {activeLabels.length} filter{activeLabels.length !== 1 ? 's' : ''}
            </button>
          {/if}
        </div>

        <div class="sidebar-filters">
          <div class="summary-section">
            <p class="subtitle">By Location</p>
            <div class="summary-table">
              {#each [...summary.byCountry] as [country, data]}
                {@const isActive = filters.country.has(country)}
                {@const filteredCount = displaySummary?.byCountry?.get(country)?.assetCount}
                {@const hasResults = !isFiltered || filteredCount != null}
                <div
                  class="summary-row"
                  class:active={isActive}
                  class:dimmed={isFiltered && !isActive && hasResults}
                  class:faded={isFiltered && !isActive && !hasResults}
                  role="button"
                  tabindex="0"
                  onclick={() => applyFilter('country', country)}
                  onkeydown={(e) => e.key === 'Enter' && applyFilter('country', country)}
                >
                  <span class="legend-dot" style="background: {countryColorScale(country)}"></span>
                  {country} ({isFiltered ? (filteredCount ?? 0) : data.assetCount})
                </div>
              {/each}
            </div>
          </div>

          <div class="summary-section">
            <p class="subtitle">By Type</p>
            <div class="summary-table">
              {#each [...summary.byType] as [type, data]}
                {@const isActive = filters.asset_type.has(type)}
                {@const filteredCount = displaySummary?.byType?.get(type)?.assetCount}
                {@const hasResults = !isFiltered || filteredCount != null}
                {@const typeColor = trackerColorMap.get(type) || colors.grey}
                <div
                  class="summary-row"
                  class:active={isActive}
                  class:dimmed={isFiltered && !isActive && hasResults}
                  class:faded={isFiltered && !isActive && !hasResults}
                  role="button"
                  tabindex="0"
                  onclick={() => applyFilter('asset_type', type)}
                  onkeydown={(e) => e.key === 'Enter' && applyFilter('asset_type', type)}
                >
                  <span class="legend-dot" style="background: {typeColor}"></span>
                  {type} ({isFiltered ? (filteredCount ?? 0) : data.assetCount})
                </div>
              {/each}
            </div>
          </div>

          <div class="summary-section">
            <p class="subtitle">By Status</p>
            <div class="summary-table">
              {#each [...summary.byStatus] as [status, data]}
                {@const isActive = filters.operating_status.has(status)}
                {@const filteredCount = displaySummary?.byStatus?.get(status)?.assetCount}
                {@const hasResults = !isFiltered || filteredCount != null}
                {@const statusColor = COLOR_BY_STATUS.get(status.toLowerCase()) || colors.grey}
                <div
                  class="summary-row"
                  class:active={isActive}
                  class:dimmed={isFiltered && !isActive && hasResults}
                  class:faded={isFiltered && !isActive && !hasResults}
                  role="button"
                  tabindex="0"
                  onclick={() => applyFilter('operating_status', status)}
                  onkeydown={(e) => e.key === 'Enter' && applyFilter('operating_status', status)}
                >
                  <span class="legend-dot" style="background: {statusColor}"></span>
                  {status} ({isFiltered ? (filteredCount ?? 0) : data.assetCount})
                </div>
              {/each}
            </div>
          </div>

          {#if summary.byOwnership && summary.byOwnership.size > 1}
            <div class="summary-section">
              <p class="subtitle">Ownership Share</p>
              <div class="summary-table">
                {#each OWNERSHIP_BUCKETS as bucket}
                  {@const data = summary.byOwnership?.get(bucket.label)}
                  {#if data}
                    {@const isActive = filters.ownership.has(bucket.label)}
                    {@const filteredCount = displaySummary?.byOwnership?.get(
                      bucket.label
                    )?.assetCount}
                    {@const hasResults = !isFiltered || filteredCount != null}
                    <div
                      class="summary-row"
                      class:active={isActive}
                      class:dimmed={isFiltered && !isActive && hasResults}
                      class:faded={isFiltered && !isActive && !hasResults}
                      role="button"
                      tabindex="0"
                      onclick={() => applyFilter('ownership', bucket.label)}
                      onkeydown={(e) => e.key === 'Enter' && applyFilter('ownership', bucket.label)}
                    >
                      {bucket.label} ({isFiltered ? (filteredCount ?? 0) : data.assetCount})
                    </div>
                  {/if}
                {/each}
              </div>
            </div>
          {/if}

          {#if intermediaries.length > 0}
            <div class="summary-section">
              <p class="subtitle">Intermediaries</p>
              <div class="summary-table">
                {#each displayIntermediaries as inter}
                  {@const isActive = filters.intermediary.has(inter.name)}
                  {@const count = hasNonIntermediaryFilter ? inter.filteredCount : inter.assetCount}
                  {@const hasResults = !hasNonIntermediaryFilter || inter.filteredCount > 0}
                  {@const isExpanded = expandedIntermediaryIds.has(inter.entity_id)}
                  <div class="summary-row-wrapper">
                    <div
                      class="summary-row"
                      class:active={isActive}
                      class:dimmed={isFiltered && !isActive && hasResults}
                      class:faded={isFiltered && !isActive && !hasResults}
                      role="button"
                      tabindex="0"
                      onclick={() => applyFilter('intermediary', inter.name, inter.projectIds)}
                      onkeydown={(e) =>
                        e.key === 'Enter' &&
                        applyFilter('intermediary', inter.name, inter.projectIds)}
                    >
                      {inter.name} ({count})
                    </div>
                    <button
                      class="foldout-btn"
                      class:expanded={isExpanded}
                      onclick={() => toggleIntermediaryFoldout(inter.entity_id)}
                      title="{isExpanded ? 'Collapse' : 'Expand'} {inter.name} sub-portfolio"
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Hover tooltip — name + ownership only -->
    {#if hoveredProject}
      {@const u0 = hoveredProject.units[0]}
      {@const cumPct = cumulativePctMap.get(hoveredProject.projectID)}
      {@const ttLeft =
        typeof window !== 'undefined'
          ? Math.min(tooltipPos.x + 12, window.innerWidth - 260)
          : tooltipPos.x + 12}
      {@const ttTop =
        typeof window !== 'undefined'
          ? Math.min(tooltipPos.y - 10, window.innerHeight - 80)
          : tooltipPos.y - 10}
      <div class="portfolio-tooltip" style="left: {ttLeft}px; top: {ttTop}px;">
        <div class="tt-name">{u0?.project_name || u0?.asset_name || hoveredProject.projectID}</div>
        {#if cumPct != null && cumPct < 99.9}
          <div class="tt-eff">{fmtPct(cumPct)}% eff. ownership</div>
        {:else if u0?.ownership_share}
          <div class="tt-eff">{u0.ownership_share}% ownership</div>
        {/if}
      </div>
    {/if}

    <!-- Click popover — unit table -->
    {#if selectedProject}
      {@const modalCumPct = cumulativePctMap.get(selectedProject.projectID)}
      {@const sp0 = selectedProject.units[0]}
      {@const hasOwnershipCol = selectedProject.units.some((u) => u.ownership_share)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="modal-backdrop"
        onclick={() => (selectedProject = null)}
        onkeydown={(e) => e.key === 'Escape' && (selectedProject = null)}
      >
        <div
          class="asset-modal"
          role="dialog"
          tabindex="-1"
          style={assetModalStyle}
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.key === 'Escape' && (selectedProject = null)}
        >
          <button class="modal-close" onclick={() => (selectedProject = null)}>&times;</button>
          <div class="modal-header">
            <h4>{sp0?.project_name || sp0?.asset_name || selectedProject.projectID}</h4>
            {#if selectedProject.units.length > 1}<span class="unit-badge"
                >{selectedProject.units.length} units</span
              >{/if}
          </div>
          <div class="tt-meta">
            {sp0?.asset_type || ''}{#if sp0?.country}
              · {sp0.country}{/if}
          </div>
          {#if modalCumPct != null && modalCumPct < 99.9}
            <div class="tt-eff" style="margin-bottom:6px">
              {fmtPct(modalCumPct)}% effective ownership
            </div>
          {/if}
          <table class="tt-table">
            <thead
              ><tr
                ><th>Unit</th><th>Status</th><th class="num">Capacity</th>{#if hasOwnershipCol}<th
                    class="num">Own%</th
                  >{/if}</tr
              ></thead
            >
            <tbody>
              {#each selectedProject.units as unit}
                <tr>
                  <td class="unit-name">{unit.asset_name || unit.asset_id}</td>
                  <td
                    ><span
                      class="status-dot"
                      style="background:{COLOR_BY_STATUS.get(
                        unit.operating_status?.toLowerCase()
                      ) || '#999'}"
                    ></span>{unit.operating_status || '—'}</td
                  >
                  <td class="num"
                    >{unit.capacity_value
                      ? `${unit.capacity_value.toLocaleString()} ${unit.capacity_unit || 'MW'}`
                      : '—'}</td
                  >
                  {#if hasOwnershipCol}<td class="num"
                      >{unit.ownership_share ? `${unit.ownership_share}%` : '—'}</td
                    >{/if}
                </tr>
              {/each}
            </tbody>
          </table>
          <a
            class="asset-link"
            href={buildAssetUrl(sp0?.asset_id)}
            target="_blank"
            rel="noopener"
            onclick={(e) => handleLinkClick(e, buildAssetUrl(sp0?.asset_id))}
            >View full asset page &rarr;</a
          >
        </div>
      </div>
    {/if}

    <!-- EXPANDED INTERMEDIARY PANELS — appear below the main chart card, indented right -->
    {#if intermediaries.length > 0}
      {#each displayIntermediaries as inter}
        {#if expandedIntermediaryIds.has(inter.entity_id)}
          <div class="foldout-panel-wrapper">
            <NestedIntermediaryPanel entityId={inter.entity_id} {API_BASE} />
          </div>
        {/if}
      {/each}
    {/if}
  {/if}
</div>

<style>
  .portfolio-explorer {
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    color: var(--color-text-primary);
    max-width: var(--container-xl);
    margin: 0 auto;
    padding: var(--space-4);
  }

  /* ---- Selector ---- */
  .selector-bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    padding: var(--space-3) 0;
    margin-bottom: 0;
  }
  .selector-label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-weight: var(--font-weight-semibold);
    color: var(--gem-navy);
    white-space: nowrap;
  }
  .selector-chips {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .chip {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    font-family: inherit;
  }
  .chip:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-secondary);
  }
  .chip.active {
    background: var(--gem-navy);
    color: white;
    border-color: var(--gem-navy);
  }
  .custom-input {
    display: flex;
    gap: var(--space-1);
    margin-left: auto;
  }
  .custom-input input {
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-xs);
    font-family: inherit;
    width: 200px;
    background: var(--color-bg-primary);
  }
  .custom-input input:focus {
    outline: none;
    border-color: var(--gem-navy);
    box-shadow: 0 0 0 2px rgba(29, 73, 97, 0.1);
  }
  .go-btn {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--gem-navy);
    border-radius: var(--radius-md);
    background: var(--gem-navy);
    color: white;
    font-size: var(--font-size-xs);
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--font-weight-medium);
    transition: opacity var(--duration-fast) ease;
  }
  .go-btn:hover {
    opacity: 0.85;
  }

  /* ---- Layout: grid + sidebar ---- */
  .chart-layout {
    display: flex;
    min-height: 300px;
  }
  .chart-area {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    max-height: var(--chart-max-height, calc(100vh - 200px));
  }
  .chart-row {
    display: flex;
  }
  .embed-mode .chart-area {
    overflow: visible;
    max-height: none;
  }
  .tree-container {
    flex-shrink: 0;
    margin-right: -8px;
  }
  .tree-container svg,
  .assets-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
  }
  .assets-container {
    flex: 1;
  }
  .assets-container.full-width {
    width: 100%;
  }

  /* ---- Filter sidebar ---- */
  .filter-sidebar {
    flex: 0 0 clamp(220px, 28%, 320px);
    background: var(--gem-navy);
    color: white;
    padding: 16px 14px;
    overflow-y: auto;
    max-height: var(--chart-max-height, calc(100vh - 200px));
    font-size: 12px;
    line-height: 1.4;
  }
  .embed-mode {
    max-width: none;
    margin: 0;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
  }
  .embed-mode .chart-layout {
    flex-direction: column;
  }
  .embed-mode .filter-sidebar {
    flex: none;
    width: 100%;
    max-height: none;
    border-radius: 0;
  }
  .sidebar-header {
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .sidebar-owner {
    display: block;
    font-size: 14px;
    font-weight: var(--font-weight-bold);
    line-height: 1.25;
  }
  .sidebar-stats {
    display: block;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 3px;
  }
  .sidebar-toolbar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 10px;
    margin-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  .sidebar-filters {
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .summary-section {
    padding: 8px 0;
  }
  .summary-section + .summary-section {
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }
  .subtitle {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: var(--font-weight-bold);
    color: rgba(255, 255, 255, 0.4);
    margin: 0 0 4px 0;
  }
  .summary-table {
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
  }
  .summary-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    padding: 3px 4px;
    cursor: pointer;
    border-radius: 3px;
    transition: background 80ms ease;
    color: rgba(255, 255, 255, 0.85);
  }
  .legend-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .summary-row:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .summary-row:focus-visible {
    outline: 1px solid var(--gem-mint, #9df7e5);
    outline-offset: 1px;
  }
  .summary-row.active {
    background: rgba(157, 247, 229, 0.15);
    color: white;
    font-weight: var(--font-weight-bold);
  }
  .summary-row.dimmed {
    opacity: 0.45;
  }
  .summary-row.faded {
    opacity: 0.15;
  }

  /* ---- Empty state ---- */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 200px;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    gap: var(--space-3);
  }
  .empty-state p {
    margin: 0;
  }
  .clear-btn {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    font-size: var(--font-size-xs);
    cursor: pointer;
    font-family: inherit;
  }
  .clear-btn:hover {
    background: var(--color-bg-tertiary);
  }

  /* ---- Utils ---- */
  .loading {
    padding: var(--space-10);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }
  .error {
    padding: var(--space-10);
    text-align: center;
    color: var(--color-error, #7f142a);
    font-size: var(--font-size-sm);
  }
  .clear-filter-inline {
    padding: 3px 8px;
    border: 1px solid rgba(157, 247, 229, 0.25);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--gem-mint, #9df7e5);
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--font-weight-medium);
    transition: background 80ms ease;
  }
  .clear-filter-inline:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .color-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-wrap: wrap;
  }
  .color-toggle-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-right: 2px;
  }
  .color-toggle-btn {
    padding: 2px 7px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    text-transform: capitalize;
    transition: all 80ms ease;
  }
  .color-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.8);
  }
  .color-toggle-btn.active {
    background: rgba(157, 247, 229, 0.12);
    border-color: rgba(157, 247, 229, 0.4);
    color: var(--gem-mint, #9df7e5);
    font-weight: var(--font-weight-bold);
  }

  /* ---- Print ---- */
  @media print {
    .portfolio-explorer {
      padding: 0;
    }
    .selector-bar {
      display: none;
    }
    .chart-layout {
      flex-direction: column;
    }
    .chart-area {
      max-height: none;
      overflow: visible;
    }
    .filter-sidebar {
      flex: none;
      width: 100%;
      max-width: none;
      max-height: none;
      break-inside: avoid;
      background: #1d4961;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .summary-table {
      max-height: none;
      overflow: visible;
    }
    .summary-row {
      cursor: default;
    }
    .summary-row:hover {
      background: none;
    }
    .clear-filter-inline,
    .color-toggle,
    .empty-state .clear-btn {
      display: none;
    }
  }

  /* ---- Mobile ---- */
  @media (max-width: 768px) {
    .portfolio-explorer {
      padding: var(--space-2);
    }
    .selector-bar {
      flex-direction: column;
      gap: var(--space-2);
      align-items: stretch;
    }
    .custom-input {
      margin-left: 0;
    }
    .custom-input input {
      width: 100%;
      min-width: 0;
      min-height: 44px;
    }
    .chip {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .go-btn {
      min-height: 44px;
    }
    .chart-layout {
      flex-direction: column;
    }
    .chart-area {
      max-height: 60vh;
    }
    .filter-sidebar {
      flex: none;
      width: 100%;
      max-height: none;
      padding: 12px;
    }
    .sidebar-header {
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .sidebar-toolbar {
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
    .sidebar-filters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
    }
    .summary-section {
      padding: 6px 0;
    }
    .tree-container {
      display: none;
    }
    .summary-row {
      padding: 4px 6px;
      min-height: 36px;
    }
    .color-toggle-btn {
      min-height: 32px;
      padding: 4px 10px;
    }
    .asset-modal {
      left: var(--space-3) !important;
      right: var(--space-3) !important;
      top: auto !important;
      bottom: var(--space-3) !important;
      max-width: none;
      max-height: 50vh;
    }
  }

  /* ---- Hover Tooltip (lightweight) ---- */
  .portfolio-tooltip {
    position: fixed;
    z-index: 1000;
    pointer-events: none;
    background: var(--gem-white, #fff);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 6px 10px;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    animation: tt-in 80ms ease-out;
  }
  .tt-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--color-text-primary, #222);
    line-height: 1.2;
  }
  .tt-meta {
    font-size: 10px;
    color: var(--color-text-tertiary, #999);
    margin-top: 1px;
  }
  .tt-eff {
    font-size: 10px;
    font-weight: 700;
    color: var(--gem-teal, #007b7f);
    margin-top: 1px;
  }
  @keyframes tt-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @media (max-width: 768px) {
    .portfolio-tooltip {
      display: none;
    }
  }

  /* ---- Click Popover (unit table) ---- */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.12);
  }
  .asset-modal {
    position: fixed;
    z-index: 10001;
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: var(--radius-lg, 8px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
    padding: 14px 16px;
    min-width: 280px;
    max-width: 420px;
    max-height: var(--portfolio-modal-max-height, 400px);
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .modal-close {
    position: absolute;
    top: 6px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--color-text-secondary, #999);
    padding: 2px 6px;
    border-radius: 4px;
  }
  .modal-close:hover {
    color: var(--color-text-primary, #333);
  }
  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
    padding-right: 20px;
  }
  .modal-header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--gem-navy);
    line-height: 1.3;
  }
  .unit-badge {
    font-size: 10px;
    background: var(--color-bg-tertiary, #eee);
    color: var(--color-text-secondary, #666);
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 500;
  }
  .tt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    border-top: 1px solid var(--color-border, #eee);
    margin-top: 6px;
  }
  .tt-table th {
    text-align: left;
    font-weight: 600;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary, #aaa);
    padding: 4px 6px 3px 0;
  }
  .tt-table th.num {
    text-align: right;
  }
  .tt-table td {
    padding: 3px 6px 3px 0;
    color: var(--color-text-primary, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }
  .tt-table td.num {
    text-align: right;
    font-family: var(--font-family-data, 'IBM Plex Mono', monospace);
    font-size: 10px;
  }
  .tt-table td.unit-name {
    max-width: 140px;
    font-weight: 500;
  }
  .tt-table .status-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    margin-right: 3px;
    vertical-align: middle;
  }
  .status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .asset-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 11px;
    color: var(--gem-teal, #007b7f);
    text-decoration: none;
    font-weight: 500;
  }
  .asset-link:hover {
    text-decoration: underline;
  }

  /* ---- Intermediary fold-out ---- */
  .summary-row-wrapper {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .summary-row-wrapper .summary-row {
    flex: 1;
    min-width: 0;
  }
  .foldout-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.35);
    cursor: pointer;
    padding: 0 3px;
    font-size: 8px;
    line-height: 1;
    flex-shrink: 0;
    transition: color 80ms ease;
    font-family: inherit;
  }
  .foldout-btn:hover,
  .foldout-btn.expanded {
    color: var(--gem-mint, #9df7e5);
  }

  /* ---- Expanded nested portfolio panels ---- */
  .foldout-panel-wrapper {
    margin-left: var(--space-6, 24px);
    margin-top: var(--space-2);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: -3px 0 0 var(--gem-teal, #007b7f);
  }
</style>
