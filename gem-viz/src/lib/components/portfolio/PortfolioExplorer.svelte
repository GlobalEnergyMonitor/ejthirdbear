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
  import { isViewportBelow } from '$lib/responsive';
  import * as d3 from 'd3-selection';
  import * as d3Array from 'd3-array';
  import * as d3Hierarchy from 'd3-hierarchy';
  import * as d3Shape from 'd3-shape';
  import { scaleOrdinal } from 'd3-scale';
  import { schemeTableau10, schemePaired, schemeSet3 } from 'd3-scale-chromatic';

  import {
    colors,
    trackerColorMap,
    statusColorsGranular,
    ownershipColors,
  } from '$lib/design-tokens';

  const API_BASE = import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

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
    heightOffset = 320,
    linkBase = '',
    linkTarget = '',
    /** Initial color field to restore from URL (type | status | country) */
    initialColor = '',
    /** Initial filters to restore from URL — keys are filter names, values are comma-separated strings */
    initialFilters = {},
  } = $props();

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
  let selectedEntityId = $state(entityId || SAMPLE_OWNERS[0][1]);
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
    return val ? new Set(val.split(',').map((s) => s.trim()).filter(Boolean)) : new Set();
  }

  let filters = $state({
    country: parseFilterParam(initialFilters.country),
    asset_type: parseFilterParam(initialFilters.asset_type),
    operating_status: parseFilterParam(initialFilters.operating_status),
    intermediary: parseFilterParam(initialFilters.intermediary),
    ownership: parseFilterParam(initialFilters.ownership),
  });
  /** Intermediary name → projectIds lookup (populated when intermediaries are clicked) */
  let intermediaryProjectIds = $state(new Map());

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
  let colorFieldOverride = $state(initialColor);
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
    if (colorFieldOverride && availableColorFields.includes(colorFieldOverride)) return colorFieldOverride;
    // Auto-select first available, prefer type > status > country
    if (availableColorFields.length > 0) return availableColorFields[0];
    return 'type';
  });

  /** Whether any non-intermediary filter is active (for computing intermediary counts) */
  let hasNonIntermediaryFilter = $derived(
    filters.country.size > 0 ||
    filters.asset_type.size > 0 ||
    filters.operating_status.size > 0
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
    nodeRadius: 5,
  };

  /** Available viewport height for chart area */
  let containerHeight = $state(500);

  /** How many asset rows fit in one column (notebook: nRows = svgHeight / assetMarkHeightCombined) */
  const ASSET_MARK_H = 40;
  let nRowsFit = $derived(Math.max(4, Math.floor(Math.max(300, containerHeight - 80) / ASSET_MARK_H)));

  /** Show tree only when all projects fit in a single column (notebook: projectGroups.length <= nRows) */
  let showTree = $derived(
    displayProjectGroups.length <= nRowsFit && displayProjectGroups.length > 0
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

  /** Selected project for detail modal — null when closed */
  let selectedProject = $state(null);
  /** Modal position (viewport coords for fixed positioning) */
  let modalPos = $state({ x: 0, y: 0 });

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
    fetchController = new AbortController();
    const signal = fetchController.signal;

    loading = true;
    error = '';
    apiData = null;
    summary = null;
    projectGroups = [];
    intermediaries = [];
    intermediaryProjectIds = new Map();
    filters = { country: new Set(), asset_type: new Set(), operating_status: new Set(), intermediary: new Set(), ownership: new Set() };

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
    } catch (err) {
      if (err.name === 'AbortError') return; // superseded by newer fetch
      error = err.message || 'Failed to fetch data';
    } finally {
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

    // DFS to collect all paths from root to leaf projects.
    // Dead-end entities (subsidiaries with no assets) are excluded.

    const paths = [];
    const pathStrings = [];
    const visited = new Set();
    function dfs(nodeId, path) {
      if (visited.has(nodeId)) return; // cycle detection
      visited.add(nodeId);
      const children = childrenOf.get(nodeId) || [];
      if (children.length === 0) {
        // Leaf — resolve to project ID. Skip dead-end entities.
        const projId = assetToProject.get(nodeId) || nodeId;
        if (projectIds.has(projId) || projectIds.has(nodeId)) {
          const fullPath = [...path, projId];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
        }
        // else: dead-end entity — intentionally dropped
        visited.delete(nodeId);
        return;
      }
      for (const child of children) {
        // Deduplicate: if child is an asset, resolve to project
        const resolved = assetToProject.get(child);
        if (resolved && projectIds.has(resolved)) {
          const fullPath = [...path, resolved];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
        } else {
          dfs(child, [...path, child]);
        }
      }
      visited.delete(nodeId);
    }
    dfs(rootEntityId, [rootEntityId]);

    // Deduplicate path strings
    const uniquePathStrings = [...new Set(pathStrings)];

    return { paths, pathStrings: uniquePathStrings };
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

    const margin = { left: 80, top: 20, right: 20, bottom: 20 };
    const width = 280 - margin.left - margin.right;
    const height = calcHeight;

    const tree = d3Hierarchy
      .cluster()
      .size([height, width])
      .separation(
        (a, b) =>
          a.parent === b.parent
            ? treeParams.siblingSeparation
            : treeParams.cousinSeparation
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
      d.ownershipPct = edge && typeof edge.value === 'number' ? Math.max(0, Math.min(1, edge.value / 100)) : 1;
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

    const unitR = 10;
    const labelX = 36;
    const assetMarkH = 40; // combined mark height — gives multi-unit flowers room
    const assetMarkSingle = 24;

    // --- Grid layout (port of notebook's gridInfo + nRows) ---
    // svgHeight drives how many rows fit in one column
    const svgH = Math.max(300, containerHeight - 80);
    const nRows = Math.max(4, Math.floor(svgH / assetMarkH));
    const nProjects = groups.length;
    const colsNeeded = Math.ceil(nProjects / nRows);
    const isMobile = isViewportBelow('sm');
    const minColWidth = isMobile ? 200 : 300;
    const colWidth = Math.max(minColWidth, assetMarkH * (isMobile ? 8 : 12));
    const svgWidthNeeded = colsNeeded * colWidth;

    // Single column = show tree + align to leaf positions
    const isSingleColumn = nProjects <= nRows;

    // Build a projectID → tree leaf y-position map (notebook pattern:
    // "Add the x location of the D3 Tree to the data" — d.y = asset.x)
    const leafYMap = new Map();
    if (isSingleColumn && showTree && treeRoot) {
      for (const leaf of treeRoot.leaves()) {
        leafYMap.set(leaf.data.name, leaf.x); // tree "x" is vertical position
      }
    }

    const margin = { top: 20, left: 20 };

    // Calculate total height
    let totalHeight;
    if (isSingleColumn && leafYMap.size > 0) {
      const maxY = Math.max(...leafYMap.values());
      totalHeight = maxY + margin.top + 30;
    } else {
      // Multi-column: height = nRows * assetMarkH
      const rowsInView = Math.min(nProjects, nRows);
      totalHeight = rowsInView * assetMarkH + margin.top + 10;
    }

    svg.attr('width', svgWidthNeeded + margin.left).attr('height', totalHeight);

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
        .style('fill', 'white')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .on('mouseover', function () {
          d3.select(this).style('fill', `${colors.bgSecondary}`);

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

          // Restore all assets
          g.selectAll('.asset-row')
            .transition('fade')
            .duration(200)
            .style('opacity', 1);

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
          modalPos = { x: event.clientX, y: event.clientY };
          selectedProject = proj;
        });

      // Unit circles — scale cluster radius so units don't overlap, capped to row height
      const N = proj.units.length;
      const TAU = Math.PI * 2;
      const maxClusterDiameter = assetMarkH - 4; // stay within row bounds
      const halfMax = maxClusterDiameter / 2;

      // For N circles on a ring, non-overlap requires: clusterR >= individualR / sin(π/N)
      // Combined with row cap: clusterR + individualR <= halfMax
      // So: individualR <= halfMax / (1/sin(π/N) + 1)
      let individualR = unitR;
      let clusterR = 0;
      if (N > 1) {
        const sinFactor = Math.sin(Math.PI / N);
        individualR = Math.max(2, Math.min(unitR * 0.6, halfMax / (1 / sinFactor + 1)));
        clusterR = individualR / sinFactor;
      }

      proj.units.forEach((unit, j) => {
        const cx = N === 1 ? unitR : unitR + clusterR * Math.cos((TAU * j) / N - Math.PI / 2);
        const cy = N === 1 ? 0 : clusterR * Math.sin((TAU * j) / N - Math.PI / 2);
        const circleR = individualR;

        const unitColor =
          colorField === 'type'
            ? trackerColorMap.get(unit.asset_type) || colors.grey
            : colorField === 'status'
            ? COLOR_BY_STATUS.get(unit.operating_status?.toLowerCase()) || colors.grey
            : countryColorScale(unit.country || 'Unknown');

        row
          .append('circle')
          .attr('cx', cx)
          .attr('cy', cy)
          .attr('r', circleR)
          .style('fill', unitColor)
          .style('mix-blend-mode', 'multiply')
          .style('pointer-events', 'none');

        // Ownership pie slice if partial ownership
        if (unit.ownership_share && unit.ownership_share < 100 && unit.ownership_share > 1) {
          const pieArc = d3Shape.arc().innerRadius(0).outerRadius(circleR + 0.5).startAngle(-Math.PI / 2);
          row
            .append('path')
            .attr('transform', `translate(${cx},${cy})`)
            .attr('d', pieArc({ endAngle: -Math.PI / 2 + (2 * Math.PI * unit.ownership_share) / 100 }))
            .style('fill', colors.navy)
            .style('fill-opacity', 0.15)
            .style('stroke', 'white')
            .style('stroke-width', 1)
            .style('stroke-opacity', 0.6)
            .style('pointer-events', 'none');
        }
      });

      // Ring connecting multi-unit projects
      if (N > 1) {
        row
          .append('circle')
          .attr('cx', unitR)
          .attr('cy', 0)
          .attr('r', clusterR + individualR + 1)
          .style('fill', 'none')
          .style('stroke', colors.gray300)
          .style('stroke-width', 1)
          .style('pointer-events', 'none');
      }

      // Asset name label — prefer project_name from API, fall back to asset_name
      let name = proj.units[0]?.project_name || proj.units[0]?.asset_name || proj.projectID;

      const labelG = row.append('g').attr('transform', `translate(${labelX}, 0)`).style('pointer-events', 'none');

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
      if (N > 1) {
        const badgeX = nameX + Math.min(name.length * 6.5, 250) + 8;
        labelG
          .append('text')
          .attr('dy', '0.35em')
          .attr('x', badgeX)
          .style('font-size', '8px')
          .style('font-weight', 500)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.07em')
          .style('fill', colors.gray500)
          .text(`${N} units`);
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
      containerHeight = Math.max(300, window.innerHeight - heightOffset);
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
    if (_data && _groups.length > 0) {
      // Use microtask to ensure DOM is ready
      queueMicrotask(() => {
        drawTree();
        drawAssets();
        requestAnimationFrame(() => updateScrollState());
      });
    }
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

<div class="portfolio-explorer" class:embed-mode={heightOffset < 200} style:--chart-max-height={heightOffset < 200 ? 'none' : `calc(100vh - 260px)`}>
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
    <!-- HEADER -->
    <div class="chart-header">
      <div class="name-wrapper">
        <p class="subtitle">Owner</p>
        <h3>{apiData.spotlightOwner.name || apiData.spotlightOwner.full_name}</h3>
      </div>
      <div class="header-facts">
        <p>
          Stakes in {summary.total.assetCount} asset{summary.total.assetCount !== 1 ? 's' : ''} in {summary.total.types.size}
          GEM tracker{summary.total.types.size !== 1 ? 's' : ''}
        </p>
      </div>
    </div>

    <!-- MAIN CHART AREA -->
    <div class="chart-shell">
      <div
        class="chart-row"
        class:fade-left={canScrollLeft}
        class:fade-right={canScrollRight}
        bind:this={chartContainer}
      >
        {#if isFiltered && displayProjectGroups.length === 0}
          <div class="empty-state">
            <p>No assets match current filters.</p>
            <button class="clear-btn" onclick={clearFilter}>Clear filters</button>
          </div>
        {:else}
          {#if showTree}
            <div class="tree-container">
              <svg bind:this={treeSvgEl}></svg>
            </div>
          {/if}
          <div class="assets-container" class:full-width={!showTree}>
            <svg bind:this={assetsSvgEl}></svg>
          </div>
        {/if}
      </div>
      {#if hasHorizontalOverflow}
        <div class="scroll-indicator" aria-hidden="true">
          <span class="scroll-cue" class:visible={canScrollLeft}>← Back</span>
          <div class="scroll-meter">
            <span class="scroll-copy scroll-copy-desktop">
              {canScrollRight ? 'Scroll to see more assets' : 'End of asset list'}
            </span>
            <span class="scroll-copy scroll-copy-mobile">
              {canScrollRight ? 'Swipe for more' : 'End of list'}
            </span>
            <div class="scroll-rail">
              <span
                class="scroll-thumb"
                style={`width: ${scrollThumbWidth}%; left: ${scrollThumbOffset}%;`}
              ></span>
            </div>
          </div>
          <span class="scroll-cue scroll-cue-right" class:visible={canScrollRight}>
            <span class="scroll-cue-desktop">More →</span>
            <span class="scroll-cue-mobile">Swipe →</span>
          </span>
        </div>
      {/if}
    </div>

    <!-- ASSET DETAIL MODAL -->
    {#if selectedProject}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="modal-backdrop" onclick={() => (selectedProject = null)} onkeydown={(e) => e.key === 'Escape' && (selectedProject = null)}>
        <div
          class="asset-modal"
          role="dialog"
          tabindex="-1"
          style="left: {Math.min(modalPos.x, window.innerWidth - 380)}px; top: {Math.min(modalPos.y + 8, window.innerHeight - 420)}px;"
          onclick={(e) => e.stopPropagation()}
          onkeydown={(e) => e.key === 'Escape' && (selectedProject = null)}
        >
          <button class="modal-close" onclick={() => (selectedProject = null)}>&times;</button>
          <div class="modal-header">
            <h4>{selectedProject.units[0]?.asset_name || selectedProject.projectID}</h4>
            {#if selectedProject.units.length > 1}
              <span class="unit-badge">{selectedProject.units.length} units</span>
            {/if}
          </div>
          <div class="modal-units">
            {#each selectedProject.units as unit}
              <div class="modal-unit">
                <div class="unit-row"><span class="unit-label">Type</span><span class="unit-value">{unit.asset_type || '—'}</span></div>
                <div class="unit-row"><span class="unit-label">Status</span><span class="unit-value"><span class="status-dot" style="background: {COLOR_BY_STATUS.get(unit.operating_status?.toLowerCase()) || colors.grey}"></span>{unit.operating_status || '—'}</span></div>
                {#if unit.capacity_value}<div class="unit-row"><span class="unit-label">Capacity</span><span class="unit-value">{unit.capacity_value.toLocaleString()} {unit.capacity_unit || 'MW'}</span></div>{/if}
                <div class="unit-row"><span class="unit-label">Country</span><span class="unit-value">{unit.country || '—'}</span></div>
                {#if unit.ownership_share}<div class="unit-row"><span class="unit-label">Ownership</span><span class="unit-value">{unit.ownership_share}%</span></div>{/if}
                {#if unit.latitude && unit.longitude}<div class="unit-row"><span class="unit-label">Coords</span><span class="unit-value coords">{unit.latitude.toFixed(3)}, {unit.longitude.toFixed(3)}</span></div>{/if}
                {#if selectedProject.units.length > 1}<div class="unit-row"><span class="unit-label">Unit</span><span class="unit-value">{unit.asset_name || unit.asset_id}</span></div>{/if}
                <a class="asset-link" href={buildAssetUrl(unit.asset_id)} target="_blank" rel="noopener" onclick={(e) => handleLinkClick(e, buildAssetUrl(unit.asset_id))}>View full asset page &rarr;</a>
              </div>
              {#if selectedProject.units.length > 1}<hr class="unit-divider" />{/if}
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- FILTER FOOTER — cross-column additive (AND), same-column click toggles -->
    <div class="chart-footer">
      <div class="footer-toolbar">
        {#if isFiltered}
          {@const activeLabels = Object.values(filters).flatMap((s) => [...s])}
          <button class="clear-filter-inline" class:many={activeLabels.length > 3} onclick={clearFilter}>
            Clear: {activeLabels.join(' + ')}
          </button>
        {/if}
        {#if availableColorFields.length > 1}
        <div class="color-toggle">
          <span class="color-toggle-label">Color by:</span>
          {#each availableColorFields as opt}
            <button
              class="color-toggle-btn"
              class:active={colorField === opt}
              onclick={() => { userHasInteracted = true; colorFieldOverride = opt; }}
            >{opt}</button>
          {/each}
        </div>
        {/if}
      </div>
      <div class="footer-columns">
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
              {@const filteredCount = displaySummary?.byOwnership?.get(bucket.label)?.assetCount}
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
            <div
              class="summary-row"
              class:active={isActive}
              class:dimmed={isFiltered && !isActive && hasResults}
              class:faded={isFiltered && !isActive && !hasResults}
              role="button"
              tabindex="0"
              onclick={() => applyFilter('intermediary', inter.name, inter.projectIds)}
              onkeydown={(e) => e.key === 'Enter' && applyFilter('intermediary', inter.name, inter.projectIds)}
            >
              {inter.name} ({count})
            </div>
          {/each}
        </div>
      </div>
      {/if}
      </div>
    </div>
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

  /* ---- Header ---- */
  .chart-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-8);
    padding: var(--space-3) var(--space-5);
    background: var(--gem-navy);
    color: white;
  }
  .chart-header .name-wrapper {
    min-width: 80px;
    max-width: 300px;
  }
  .chart-header h3 {
    font-weight: var(--font-weight-bold);
    color: white;
    margin: 0;
    font-size: var(--font-size-lg);
  }
  .subtitle {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-weight: var(--font-weight-medium);
    color: var(--gem-mint, #9df7e5);
    margin-bottom: var(--space-1);
    margin-top: 0;
  }
  .header-facts p {
    font-size: var(--font-size-sm);
    margin: 0;
    color: rgba(255, 255, 255, 0.9);
  }

  /* ---- Chart Row ---- */
  .chart-shell {
    background: var(--color-bg-primary, #fff);
    border-bottom: 1px solid rgba(29, 73, 97, 0.08);
  }
  /* Single scroll container for both tree + assets so SVG lines stay aligned */
  .chart-row {
    display: flex;
    overflow: auto;
    min-height: 200px;
    max-height: var(--chart-max-height, calc(100vh - 260px));
  }
  /* Horizontal scroll fade affordance */
  .chart-row.fade-right {
    mask-image: linear-gradient(to right, black calc(100% - 48px), transparent);
    -webkit-mask-image: linear-gradient(to right, black calc(100% - 48px), transparent);
  }
  .chart-row.fade-left {
    mask-image: linear-gradient(to left, black calc(100% - 48px), transparent);
    -webkit-mask-image: linear-gradient(to left, black calc(100% - 48px), transparent);
  }
  .chart-row.fade-left.fade-right {
    mask-image: linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 48px, black calc(100% - 48px), transparent);
  }
  /* In embed mode, let content flow naturally so the iframe auto-resizes */
  .embed-mode .chart-row {
    overflow: visible;
    max-height: none;
  }
  .tree-container {
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--color-bg-primary, #fff);
  }
  .tree-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
  }
  .assets-container {
    flex: 1;
    padding-left: var(--space-2);
  }
  .assets-container.full-width {
    width: 100%;
  }
  .assets-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
  }
  .scroll-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: 10px var(--space-5, 20px) 12px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, rgba(244, 249, 250, 0.92) 36%, rgba(244, 249, 250, 1) 100%);
    border-top: 1px solid rgba(29, 73, 97, 0.08);
  }
  .scroll-meter {
    min-width: 0;
    flex: 1;
  }
  .scroll-copy {
    display: block;
    margin-bottom: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(29, 73, 97, 0.68);
  }
  .scroll-copy-mobile {
    display: none;
  }
  .scroll-rail {
    position: relative;
    height: 7px;
    border-radius: 999px;
    background:
      linear-gradient(90deg, rgba(29, 73, 97, 0.12), rgba(0, 123, 127, 0.16));
    overflow: hidden;
  }
  .scroll-thumb {
    position: absolute;
    top: 0;
    bottom: 0;
    min-width: 18%;
    border-radius: inherit;
    background:
      linear-gradient(90deg, rgba(0, 123, 127, 0.92), rgba(29, 73, 97, 0.92));
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
  }
  .scroll-cue {
    flex-shrink: 0;
    min-width: 60px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(29, 73, 97, 0.32);
    opacity: 0;
    transition: opacity var(--duration-fast, 120ms) ease, color var(--duration-fast, 120ms) ease;
  }
  .scroll-cue.visible {
    opacity: 1;
    color: rgba(29, 73, 97, 0.78);
  }
  .scroll-cue-right {
    text-align: right;
  }
  .scroll-cue-mobile {
    display: none;
  }

  /* ---- Footer / Summary Tables ---- */
  .chart-footer {
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-5);
    background: var(--gem-navy);
    color: white;
  }
  .summary-section {
    min-width: 120px;
  }
  .summary-table {
    max-height: 140px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
  }
  .summary-row {
    display: flex;
    align-items: center;
    gap: var(--space-2, 6px);
    font-size: var(--font-size-sm);
    padding: 2px var(--space-1);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--duration-fast) ease;
  }
  .legend-dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: var(--radius-full, 50%);
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }
  .summary-row:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  .summary-row:focus-visible {
    outline: 2px solid var(--gem-mint, #9df7e5);
    outline-offset: 1px;
    border-radius: var(--radius-sm);
  }
  .summary-row.active {
    background: rgba(157, 247, 229, 0.25);
    font-weight: var(--font-weight-bold);
  }
  .summary-row.dimmed {
    opacity: 0.5;
  }
  .summary-row.faded {
    opacity: 0.2;
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
  .empty-state p { margin: 0; }
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
  .footer-columns {
    display: flex;
    align-items: start;
    gap: var(--space-6, 24px);
    width: 100%;
    flex-wrap: wrap;
  }
  .footer-columns > .summary-section {
    min-width: 120px;
    flex: 1;
  }
  .footer-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }
  .clear-filter-inline {
    padding: var(--space-1) var(--space-3);
    border: 1px solid rgba(157, 247, 229, 0.4);
    border-radius: var(--radius-sm);
    background: rgba(255, 255, 255, 0.08);
    color: var(--gem-mint, #9df7e5);
    font-size: var(--font-size-xs);
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--font-weight-medium);
    text-align: left;
    transition: background var(--duration-fast) ease;
  }
  .clear-filter-inline.many {
    font-size: 10px;
  }
  .clear-filter-inline:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  .color-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-left: auto;
  }
  .color-toggle-label {
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .color-toggle-btn {
    padding: 2px 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-sm);
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: var(--font-size-xs);
    font-family: inherit;
    cursor: pointer;
    text-transform: capitalize;
    transition: all var(--duration-fast) ease;
  }
  .color-toggle-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .color-toggle-btn.active {
    background: rgba(157, 247, 229, 0.2);
    border-color: var(--gem-mint, #9df7e5);
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
    .chart-row {
      max-height: none;
      overflow: visible;
    }
    .tree-container svg,
    .assets-container svg {
      overflow: visible;
    }
    .chart-header {
      break-after: avoid;
    }
    .chart-footer {
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
    .footer-toolbar .clear-filter-inline {
      display: none;
    }
    .color-toggle {
      display: none;
    }
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
    .selector-chips {
      flex-wrap: wrap;
    }
    .custom-input {
      margin-left: 0;
    }
    .custom-input input {
      width: 100%;
      min-width: 0;
    }
    .chart-header {
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
    }
    .chart-header .name-wrapper {
      max-width: none;
    }
    .chart-row {
      max-height: 60vh;
      min-height: 200px;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }
    .chart-row::-webkit-scrollbar {
      display: none;
    }
    .scroll-indicator {
      gap: var(--space-2, 8px);
      padding: 10px var(--space-3, 12px) 12px;
    }
    .scroll-cue {
      min-width: auto;
      font-size: 10px;
      letter-spacing: 0.06em;
    }
    .scroll-copy-desktop,
    .scroll-cue-desktop {
      display: none;
    }
    .scroll-copy-mobile,
    .scroll-cue-mobile {
      display: inline;
    }
    .tree-container {
      display: none;
    }
    .footer-columns {
      flex-direction: column;
      gap: var(--space-4);
    }
    .chart-footer {
      padding: var(--space-2) var(--space-3);
    }
    .summary-section {
      min-width: 0;
      width: 100%;
    }
    .summary-table {
      max-height: none;
    }
    .summary-row {
      font-size: var(--font-size-xs);
    }
    .footer-toolbar {
      flex-direction: column;
      align-items: stretch;
    }
    .color-toggle {
      margin-left: 0;
    }
    .chip {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .go-btn {
      min-height: 44px;
    }
    .custom-input input {
      min-height: 44px;
    }
    .color-toggle-btn {
      min-height: 36px;
      padding: 4px 12px;
    }
    .summary-row {
      padding: var(--space-1) var(--space-2);
      min-height: 44px;
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

  /* ---- Asset Detail Modal ---- */
  .modal-backdrop { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.15); }
  .asset-modal { position: fixed; z-index: 10001; background: var(--color-bg-primary, #fff); border: 1px solid var(--color-border, #e0e0e0); border-radius: var(--radius-lg, 8px); box-shadow: 0 8px 30px rgba(0,0,0,0.18); padding: var(--space-4, 16px); min-width: 260px; max-width: 360px; max-height: 400px; overflow-y: auto; scrollbar-width: thin; }
  .modal-close { position: absolute; top: 8px; right: 8px; background: none; border: none; font-size: 20px; cursor: pointer; color: var(--color-text-secondary, #666); line-height: 1; padding: 2px 6px; border-radius: 4px; }
  .modal-close:hover { background: var(--color-bg-secondary, #f5f5f5); color: var(--color-text-primary, #333); }
  .modal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding-right: 20px; }
  .modal-header h4 { margin: 0; font-size: 14px; font-weight: 700; color: var(--gem-navy, #1d4961); line-height: 1.3; }
  .unit-badge { flex-shrink: 0; font-size: 11px; background: var(--color-bg-tertiary, #eee); color: var(--color-text-secondary, #666); padding: 1px 6px; border-radius: 999px; font-weight: 500; }
  .modal-units { display: flex; flex-direction: column; gap: 4px; }
  .modal-unit { display: flex; flex-direction: column; gap: 3px; }
  .unit-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; }
  .unit-label { color: var(--color-text-secondary, #888); font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; flex-shrink: 0; }
  .unit-value { color: var(--color-text-primary, #333); text-align: right; display: flex; align-items: center; gap: 4px; }
  .unit-value.coords { font-family: var(--font-mono, monospace); font-size: 10px; }
  .status-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .asset-link { display: inline-block; margin-top: 4px; font-size: 11px; color: var(--gem-teal, #007b7f); text-decoration: none; font-weight: 500; }
  .asset-link:hover { text-decoration: underline; }
  .unit-divider { border: none; border-top: 1px solid var(--color-border, #e0e0e0); margin: 8px 0; }
  .unit-divider:last-child { display: none; }
</style>
