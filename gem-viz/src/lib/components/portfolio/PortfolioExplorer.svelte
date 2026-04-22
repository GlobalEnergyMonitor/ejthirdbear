<script>
  /**
   * PORTFOLIO EXPLORER — Reusable core component
   * Pick an entity → see all downstream assets grouped by project/location,
   * with summary breakdowns by country, type, and status.
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
  import { OWNERSHIP_GRAPH_MAX_DEPTH } from '$lib/ownership-api';

  import {
    colors,
    trackerColorMap,
    statusColorsGranular,
    ownershipColors,
    countryPalette,
    countryGray,
  } from '$lib/design-tokens';
  import { computeTreeLayout, computeTreeHeight, computeGridLayout } from './portfolio-layout';
  import { makeTreePaths, buildRenderHierarchy } from './portfolio-paths';

  const API_BASE =
    import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-ownership-api-staging.fly.dev';

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
    /** Called whenever summary data is available — lets parent render stats in its own header */
    onSummaryReady = undefined,
    /** When true, stretch to fill parent container height (use inside modals, not page embeds) */
    fitParent = false,
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
      ownership: new Set(),
      intermediary: new Set(),
    };
  }

  function serializeFilterParams(filterParams) {
    return JSON.stringify({
      country: filterParams.country || '',
      asset_type: filterParams.asset_type || '',
      operating_status: filterParams.operating_status || '',
      ownership: filterParams.ownership || '',
      intermediary: filterParams.intermediary || '',
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
  /** Intermediary entities — read-only list shown when tree is hidden (large portfolios).
   *  Small portfolios surface them visually inside the tree instead. */
  let intermediaries = $state([]);
  /** Cumulative ownership %: projectID → effective ownership through all paths */
  let cumulativePctMap = $state(new Map());
  /** Minimum effective ownership % filter (0 = off, 1–100 = minimum threshold) */
  let minEffOwnership = $state(0);
  /** Hovered project group for tooltip */
  let hoveredProject = $state(null);
  /** Tooltip viewport position */
  let tooltipPos = $state({ x: 0, y: 0 });

  /**
   * Multi-dimensional crossfilter:
   * - OR within a column (clicking multiple values in same column = union)
   * - AND across columns (country OR-set ∩ type OR-set ∩ status OR-set ∩ ownership OR-set)
   * - Click toggles individual values on/off
   *
   * Each column stores a Set of selected values. Empty set = no filter for that column.
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

  /** Whether any filter is active */
  let isFiltered = $derived(
    filters.country.size > 0 ||
      filters.asset_type.size > 0 ||
      filters.operating_status.size > 0 ||
      filters.ownership.size > 0 ||
      filters.intermediary.size > 0 ||
      minEffOwnership > 0
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

  /** Intermediaries with per-row filtered counts, sorted by filtered count when a filter is active */
  let sortedIntermediaries = $derived.by(() => {
    if (!isFiltered) return intermediaries;
    const visible = new Set(displayProjectGroups.map((g) => g.projectID));
    return [...intermediaries]
      .map((inter) => ({
        ...inter,
        filteredCount: [...inter.projectIds].filter((pid) => visible.has(pid)).length,
      }))
      .sort((a, b) => b.filteredCount - a.filteredCount);
  });

  /** Union of projectIds for all selected intermediaries — null when no intermediary filter active */
  let intermediaryProjectIds = $derived.by(() => {
    if (filters.intermediary.size === 0) return null;
    const ids = new Set();
    for (const inter of intermediaries) {
      if (filters.intermediary.has(inter.entity_id)) {
        for (const pid of inter.projectIds) ids.add(pid);
      }
    }
    return ids;
  });

  /** Check whether a single asset passes all active filters */
  function assetMatchesFilters(a) {
    if (filters.country.size > 0 && !filters.country.has(a.country || 'Unknown')) return false;
    if (filters.asset_type.size > 0 && !filters.asset_type.has(a.asset_type || 'Unknown'))
      return false;
    if (
      filters.operating_status.size > 0 &&
      !filters.operating_status.has(a.operating_status || 'Unknown')
    )
      return false;
    if (filters.ownership.size > 0 && !filters.ownership.has(getOwnershipBucket(a))) return false;
    if (intermediaryProjectIds && !intermediaryProjectIds.has(a.location_id || a.asset_id))
      return false;
    return true;
  }

  /** Apply all active filters (OR within column, AND across columns).
   *  Shows ALL units in a project group when ANY unit matches — unmatched
   *  units are tagged with _matched=false so the renderer can dim them. */
  let filteredResult = $derived.by(() => {
    if (!isFiltered || !apiData) return null;

    // Tag every asset as matched or not
    const allTagged = apiData.assets.map((a) => ({
      ...a,
      _matched: assetMatchesFilters(a),
    }));

    // The matched-only set drives summary counts
    const matchedAssets = allTagged.filter((a) => a._matched);

    // Group ALL assets by project — then keep only groups that have ≥1 match
    const allGroups = makeProjectGroups(allTagged);
    const groups = allGroups.filter((g) => g.units.some((u) => u._matched));

    return {
      data: { ...apiData, assets: matchedAssets },
      summary: summarizeAssets(matchedAssets),
      groups,
    };
  });

  /** The data currently being displayed */
  let displayData = $derived(filteredResult ? filteredResult.data : apiData);
  let displaySummary = $derived.by(() => {
    if (!isFiltered) return summary;
    // When the ownership slider is active, recompute summary from slider-filtered groups
    // so that facet counts reflect what's actually shown on screen
    if (minEffOwnership > 0) {
      const hasOtherFilters = filteredResult != null;
      const visibleAssets = displayProjectGroups.flatMap((g) =>
        hasOtherFilters ? g.units.filter((u) => u._matched) : g.units
      );
      return summarizeAssets(visibleAssets);
    }
    return filteredResult ? filteredResult.summary : summary;
  });
  let displayProjectGroups = $derived.by(() => {
    const base = filteredResult ? filteredResult.groups : projectGroups;
    if (minEffOwnership <= 0) return base;
    return base.filter((g) => (cumulativePctMap.get(g.projectID) ?? 0) >= minEffOwnership);
  });

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

  /** Top-5 countries by asset count → index into countryPalette; rest get countryGray */
  const countryColorMap = $derived.by(() => {
    const map = new Map();
    if (!summary) return map;
    let i = 0;
    for (const [country] of summary.byCountry) {
      map.set(country, i < countryPalette.length ? countryPalette[i].bg : countryGray.bg);
      i++;
    }
    return map;
  });

  function countryColor(country) {
    return countryColorMap.get(country) ?? countryGray.bg;
  }

  /** Tree SVG params now in portfolio-layout.ts */

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

  /** Recompute tree depth for filtered subset so tree view can appear after filtering */
  let displayTreeMaxDepth = $derived.by(() => {
    if (!apiData || displayProjectGroups.length === 0) return treeMaxDepth;
    if (!isFiltered) return treeMaxDepth;
    const treePaths = makeTreePaths(
      { nodes: apiData.nodes, edges: apiData.edges },
      apiData.spotlightOwner.entity_id,
      displayProjectGroups,
      apiData.paths
    );
    return treePaths.maxDepth;
  });

  /** Show tree when ≤30 assets AND <15 ownership depth layers */
  let showTree = $derived(
    displayProjectGroups.length > 0 && displayProjectGroups.length <= 30 && displayTreeMaxDepth < 15
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
  /** Frozen entity tooltip — set on tree node click, cleared on second click or Escape */
  let clickedTreeEntity = $state(null);
  /** All raw paths (every root→leaf sequence) — used for ghost-link relevance on hover */
  let treeAllPaths = [];
  /** D3 selections stored so sidebar hover can drive the same highlight as tree node hover */
  let treeMarks = null;
  let treeLinkGroup = null;
  let treeGhostGroup = null;
  let treeLabels = null;
  /** Additional refs for hidden-path ghost rendering */
  let treeNodeByName = null;
  let treeG = null;
  let treeNr = 0;
  let treePad = 3;
  let treeWidth = 0;
  let treeMargin = null;
  let hiddenPathOverlay = null;
  /** Max ownership depth from root to leaf asset */
  let treeMaxDepth = $state(0);
  /** Intermediary names that fell out of the rendered tree because another (longer) path
   *  already reached the same leaf. Surfaced as the "duplicative intermediaries hidden" list. */
  /** Entities dropped from the rendered tree (shorter paths) — full data for interaction */
  let hiddenIntermediaries = $state([]);
  /** entity_id of the frozen hidden-path overlay (null = nothing frozen) */
  let frozenHiddenEntityId = $state(null);
  /** Whether the hidden-intermediaries aside is expanded */
  let hiddenIntermediariesExpanded = $state(false);

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
    filters = createEmptyFilters();
    minEffOwnership = 0;
    hoveredProject = null;
    selectedProject = null;
    treeRoot = null;
    treeMaxDepth = 0;

    try {
      const resp = await fetch(
        `${API_BASE}/ownership/graph?root=${encodeURIComponent(entityId)}&direction=down&format=json&max_depth=${OWNERSHIP_GRAPH_MAX_DEPTH}`,
        { signal }
      );
      if (!resp.ok) throw new Error(`API error: ${resp.status}`);
      const data = await resp.json();

      const spotlightOwner = data.root;
      const assets = (data.nodes || []).filter((n) => n.node_type === 'asset');
      const edges = data.edges || [];

      const sum = summarizeAssets(assets);

      // Group assets into projects by location_id
      const groups = makeProjectGroups(assets);

      const treePaths = makeTreePaths(
        { nodes: data.nodes, edges },
        spotlightOwner.entity_id,
        groups,
        data.paths
      );

      // Read-only intermediary list: each non-root entity → # of leaf projects it sits on
      // a path to. Shown in sidebar only when the tree is hidden (see `showTree`).
      const entityNodes = (data.nodes || []).filter(
        (n) => n.node_type === 'entity' && n.entity_id !== spotlightOwner.entity_id
      );
      const intermediaryList = entityNodes
        .map((e) => {
          const leafs = new Set(
            treePaths.paths
              .filter((p) => p.path.includes(e.entity_id))
              .map((p) => p.path[p.path.length - 1])
          );
          return {
            entity_id: e.entity_id,
            name: e.name || e.full_name || e.entity_id,
            assetCount: leafs.size,
            projectIds: leafs,
          };
        })
        .filter((e) => e.assetCount > 0)
        .sort((a, b) => b.assetCount - a.assetCount);

      apiData = {
        spotlightOwner,
        assets,
        edges,
        nodes: data.nodes,
        summary: sum,
        paths: data.paths || null,
      };
      summary = sum;
      projectGroups = groups;
      intermediaries = intermediaryList;
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
  // TREE PATHS — extracted to ./portfolio-paths.ts
  // Each step (DFS / dedup / prune / collapse / root-promotion) is a named
  // function in that module so we can toggle them while hunting bugs.
  // ============================================================================

  // ============================================================================
  // FILTERING — OR within column (click toggles), AND across columns
  // ============================================================================
  function applyFilter(field, value) {
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
  }

  function clearFilter() {
    filters = createEmptyFilters();
    minEffOwnership = 0;
  }

  /** Highlight a tree node (and its ancestor/descendant paths) by entity_id.
   *  Called from sidebar intermediary row hover — mirrors the tree node mouseover. */
  function highlightIntermediaryInTree(entityId) {
    if (!treeRoot || !treeMarks || !treeLinkGroup || !treeLabels) return;
    const d = treeRoot.descendants().find((n) => n.data.name === entityId);
    if (!d) return;
    const activeNodes = new Set([...d.ancestors(), ...d.descendants()]);
    treeMarks
      .transition('fade')
      .duration(100)
      .style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));
    treeLinkGroup
      .selectAll('path')
      .transition('fade')
      .duration(100)
      .style('opacity', (l) => (activeNodes.has(l.source) && activeNodes.has(l.target) ? 1 : 0.05));
    treeLabels
      .selectAll('text')
      .filter((n) => n.depth > 0)
      .transition('fade')
      .duration(100)
      .style('opacity', (n) => (d.entityName === n.entityName ? 1 : 0));
    // Mint stroke on the highlighted node's circle
    treeMarks
      .filter((n) => n === d)
      .select('circle')
      .transition('fade')
      .duration(100)
      .style('stroke', colors.mint)
      .style('stroke-width', '2.5px');
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
  }

  function clearTreeHover() {
    if (!treeMarks || !treeLinkGroup || !treeLabels) return;
    treeMarks.transition('fade').duration(200).style('opacity', 1);
    treeMarks
      .select('circle')
      .transition('fade')
      .duration(200)
      .style('stroke', null)
      .style('stroke-width', null);
    treeLinkGroup.selectAll('path').transition('fade').duration(200).style('opacity', 1);
    treeGhostGroup?.selectAll('path').transition('fade').duration(200).style('opacity', 1);
    treeLabels
      .selectAll('text')
      .filter((n) => n.depth > 0)
      .transition('fade')
      .duration(200)
      .style('opacity', 0);
    if (assetsSvgEl) {
      d3.select(assetsSvgEl)
        .selectAll('.asset-row')
        .transition('fade')
        .duration(200)
        .style('opacity', 1);
    }
  }

  /** Render a ghost overlay in the tree showing where a hidden intermediary sits.
   *  Finds its nearest in-tree neighbours on each raw path, interpolates a position,
   *  draws connecting dashed curves, and fades non-path elements. */
  function highlightHiddenPath(entityId) {
    if (!treeRoot || !treeNodeByName || !treeMarks || !treeLinkGroup || !hiddenPathOverlay) return;
    hiddenPathOverlay.selectAll('*').remove();

    const hidden = hiddenIntermediaries.find((h) => h.entity_id === entityId);
    if (!hidden) return;

    // For each raw path through this entity find nearest in-tree predecessor + successor
    const connections = [];
    for (const rawPath of hidden.rawPaths) {
      const idx = rawPath.path.indexOf(entityId);
      if (idx < 0) continue;
      let prev = null;
      for (let i = idx - 1; i >= 0; i--) {
        const n = treeNodeByName.get(rawPath.path[i]);
        if (n) {
          prev = n;
          break;
        }
      }
      let next = null;
      for (let i = idx + 1; i < rawPath.path.length; i++) {
        const n = treeNodeByName.get(rawPath.path[i]);
        if (n) {
          next = n;
          break;
        }
      }
      if (prev || next) connections.push({ prev, next });
    }
    if (connections.length === 0) return;

    // Interpolate position: average of per-path midpoints between neighbours
    const stepSize = treeWidth / Math.max(treeRoot.height, 1);
    let sumX = 0,
      sumY = 0;
    for (const { prev, next } of connections) {
      if (prev && next) {
        sumX += (prev.x + next.x) / 2;
        sumY += (prev.y + next.y) / 2;
      } else if (prev) {
        sumX += prev.x;
        sumY += prev.y + stepSize;
      } else {
        sumX += next.x;
        sumY += next.y - stepSize;
      }
    }
    const hiddenX = sumX / connections.length;
    const hiddenY = sumY / connections.length;

    const nr = treeNr;
    const PAD = treePad;
    const drawCurve = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const distX = Math.max(dx / 2, treeWidth * 0.075);
      hiddenPathOverlay
        .append('path')
        .attr('d', `M${x1},${y1} C${x1 + distX},${y1} ${x2 - distX},${y2} ${x2},${y2}`)
        .style('fill', 'none')
        .style('stroke', ownershipColors.treeEdge)
        .style('stroke-width', 1.5)
        .style('stroke-dasharray', '4 3')
        .style('stroke-linecap', 'round')
        .style('mix-blend-mode', 'multiply');
    };

    for (const { prev, next } of connections) {
      if (prev) drawCurve(prev.y + nr + PAD, prev.x, hiddenY - nr - PAD, hiddenX);
      if (next) {
        const x2 = next.children ? next.y - nr - PAD : treeWidth + treeMargin.right;
        drawCurve(hiddenY + nr + PAD, hiddenX, x2, next.x);
      }
    }

    // Circle for the hidden node
    hiddenPathOverlay
      .append('circle')
      .attr('cx', hiddenY)
      .attr('cy', hiddenX)
      .attr('r', nr)
      .style('fill', ownershipColors.treeNodeFill)
      .style('stroke', colors.mint)
      .style('stroke-width', '2px');

    // Ownership pie arc
    if (hidden.ownershipPct != null) {
      const arc = d3Shape.arc().innerRadius(0).startAngle(0);
      hiddenPathOverlay
        .append('path')
        .attr('transform', `translate(${hiddenY},${hiddenX})`)
        .attr('d', arc({ outerRadius: nr - 1.5, endAngle: 2 * Math.PI * hidden.ownershipPct }))
        .style('fill', ownershipColors.treeTeal)
        .style('pointer-events', 'none');
    }

    // Name label
    const label = hidden.name.length > 24 ? hidden.name.slice(0, 22) + '…' : hidden.name;
    hiddenPathOverlay
      .append('text')
      .attr('x', hiddenY)
      .attr('y', hiddenX - nr - 11)
      .style('text-anchor', 'middle')
      .style('stroke', 'white')
      .style('stroke-width', 3)
      .style('stroke-linejoin', 'round')
      .attr('paint-order', 'stroke')
      .style('font-size', '10px')
      .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
      .style('fill', colors.navy)
      .style('pointer-events', 'none')
      .text(label);

    // Ownership pct below the interpolated node circle
    if (hidden.ownershipPct != null) {
      hiddenPathOverlay
        .append('text')
        .attr('x', hiddenY)
        .attr('y', hiddenX + nr + 14)
        .style('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
        .style('fill', '#64748b')
        .style('pointer-events', 'none')
        .text(Math.round(hidden.ownershipPct * 100) + '%');
    }

    // Fade non-path tree elements
    const pathNodeIds = new Set(hidden.rawPaths.flatMap((p) => p.path));
    const activeNodes = new Set(treeRoot.descendants().filter((d) => pathNodeIds.has(d.data.name)));
    treeMarks
      .transition('fade')
      .duration(100)
      .style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));
    treeLinkGroup
      .selectAll('path')
      .transition('fade')
      .duration(100)
      .style('opacity', (l) =>
        pathNodeIds.has(l.source.data.name) && pathNodeIds.has(l.target.data.name) ? 1 : 0.05
      );
    if (assetsSvgEl) {
      const leafIds = new Set(hidden.rawPaths.map((p) => p.path[p.path.length - 1]));
      d3.select(assetsSvgEl)
        .selectAll('.asset-row')
        .transition('fade')
        .duration(100)
        .style('opacity', function () {
          return leafIds.has(this.getAttribute('data-project-id')) ? 1 : 0.15;
        });
    }
  }

  function clearHiddenPathOverlay() {
    if (frozenHiddenEntityId) {
      // Restore the frozen path rather than clearing
      highlightHiddenPath(frozenHiddenEntityId);
      return;
    }
    hiddenPathOverlay?.selectAll('*').remove();
    clearTreeHover();
  }

  function toggleFrozenHiddenPath(entityId) {
    if (frozenHiddenEntityId === entityId) {
      frozenHiddenEntityId = null;
      hiddenPathOverlay?.selectAll('*').remove();
      clearTreeHover();
    } else {
      frozenHiddenEntityId = entityId;
      highlightHiddenPath(entityId);
    }
  }

  // ============================================================================
  // D3 TREE VISUALIZATION (port of drawTreeChart)
  // Hierarchy materialization + prune/collapse/root-promotion steps live in
  // ./portfolio-paths.ts — see buildRenderHierarchy with toggles.
  // ============================================================================

  function drawTree() {
    if (!treeSvgEl || !apiData || !showTree) {
      treeRoot = null;
      treeMarks = null;
      treeLinkGroup = null;
      treeGhostGroup = null;
      treeLabels = null;
      treeNodeByName = null;
      treeG = null;
      hiddenPathOverlay = null;
      hiddenIntermediaries = [];
      frozenHiddenEntityId = null;
      hiddenIntermediariesExpanded = false;
      return;
    }
    const svg = d3.select(treeSvgEl);
    svg.selectAll('*').interrupt().remove();

    // Build filtered graph for current project groups
    const currentGroups = displayProjectGroups;
    const treePaths = makeTreePaths(
      { nodes: apiData.nodes, edges: apiData.edges },
      apiData.spotlightOwner.entity_id,
      currentGroups,
      apiData.paths
    );
    if (treePaths.pathStrings.length === 0) {
      hiddenIntermediaries = [];
      frozenHiddenEntityId = null;
      hiddenIntermediariesExpanded = false;
      return;
    }

    const validLeafIds = new Set(currentGroups.map((g) => g.projectID));
    // Show every selected-path node: skip the ≥95% collapse (which hides chained
    // intermediaries behind a tooltip) and the root-promotion (which elides the
    // spotlight owner when it has a single subsidiary). Prune stays on but is
    // essentially a no-op since every selected path ends at a valid project.
    const hierData = buildRenderHierarchy(treePaths.pathStrings, validLeafIds, apiData.edges, {
      applyCollapse: false,
      applyRootPromotion: false,
    });

    // "Duplicative intermediaries hidden" — entities that exist in the DAG but didn't make it
    // onto any selected (longest-per-leaf) path. Skip leaf projects and asset nodes.
    // Only list entities that appear on at least one raw path in the current filter —
    // entities that connect only to filtered-out projects would otherwise show up here
    // even though they're irrelevant to the current view.
    const rawPathNodes = new Set(treePaths.paths.flatMap((p) => p.path));
    const hiddenList = [];
    for (const n of apiData.nodes || []) {
      const id = n.entity_id || n.asset_id;
      if (!id || n.node_type === 'asset') continue;
      if (validLeafIds.has(id)) continue;
      if (id === apiData.spotlightOwner?.entity_id) continue;
      if (treePaths.unused.unusedNodes.has(id) && rawPathNodes.has(id)) {
        const cumPct = treePaths.cumulativeEntityPctMap.get(id);
        hiddenList.push({
          entity_id: id,
          name: n.name || n.full_name || id,
          ownershipPct: cumPct != null ? Math.max(0, Math.min(1, cumPct / 100)) : null,
          rawPaths: treePaths.paths.filter((p) => p.path.includes(id)),
        });
      }
    }
    hiddenList.sort((a, b) => a.name.localeCompare(b.name));
    hiddenIntermediaries = hiddenList;

    const root = d3Hierarchy.hierarchy(hierData);

    // Calculate height: count gap types between consecutive leaves
    const leaves = root.leaves();
    const nLeaves = leaves.length;
    let sibGaps = 0;
    let cousinGaps = 0;
    for (let i = 0; i < nLeaves - 1; i++) {
      if (leaves[i].parent === leaves[i + 1].parent) sibGaps++;
      else cousinGaps++;
    }

    // Use extracted layout algorithm (see portfolio-layout.ts)
    const layoutInputs = {
      containerWidth: chartContainer?.clientWidth || 800,
      containerHeight,
      depth: root.height,
      leafCount: nLeaves,
      isMobile: isViewportBelow('sm'),
      showTree: true,
      projectCount: displayProjectGroups.length,
    };
    const tl = computeTreeLayout(layoutInputs);
    const height = computeTreeHeight(nLeaves, sibGaps, cousinGaps, containerHeight);
    const { margin, width, nodeRadius, siblingSeparation, cousinSeparation } = tl;

    const tree = d3Hierarchy
      .cluster()
      .size([height, width])
      .separation((a, b) => (a.parent === b.parent ? siblingSeparation : cousinSeparation));

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

    intermediaryNodes.forEach((d) => {
      const entity = nodeMap.get(d.data.name);
      d.entityName = entity ? entity.name || entity.full_name : d.data.name;
      // Cumulative ownership % of the spotlight owner in this intermediary (summed across all paths)
      const cumPct = treePaths.cumulativeEntityPctMap.get(d.data.name);
      d.ownershipPct = cumPct != null ? Math.max(0, Math.min(1, cumPct / 100)) : 1;
    });

    // Links
    const linkData = root.links();
    const PAD = 3;
    const nr = nodeRadius;
    const { edgeImputed } = treePaths;

    // Ghost links — unused edges (alternate ownership paths not on any selected chain).
    // Match source/target by name to the first tree node bearing that id; skip edges whose
    // endpoints don't live on the tree. Asset→project targets are resolved so they can render
    // as secondary arrows landing on the same project leaf.
    const nodeByName = new Map();
    root.descendants().forEach((d) => {
      if (!nodeByName.has(d.data.name)) nodeByName.set(d.data.name, d);
    });
    const assetToProject = new Map();
    for (const n of apiData.nodes || []) {
      if (n.node_type === 'asset' && n.asset_id) {
        assetToProject.set(n.asset_id, n.location_id || n.unit_id || n.asset_id);
      }
    }
    const ghostLinks = [];
    const ghostLinkSeen = new Set();
    for (const e of treePaths.unused.unusedEdges) {
      const src = nodeByName.get(e.source);
      if (!src) continue;
      const tgtId = nodeByName.has(e.target) ? e.target : assetToProject.get(e.target);
      const tgt = tgtId ? nodeByName.get(tgtId) : null;
      if (!tgt) continue;
      if (src === tgt) continue;
      const key = `${src.data.name}→${tgt.data.name}`;
      if (ghostLinkSeen.has(key)) continue;
      ghostLinkSeen.add(key);
      ghostLinks.push({ source: src, target: tgt, imputed: !!e.imputed_share });
    }

    const linkPath = (d) => {
      const isLeaf = !d.target.children;
      const xS = d.source.y + nr + PAD;
      const yS = d.source.x;
      const xT = isLeaf ? width + margin.right : d.target.y - nr - PAD;
      const yT = d.target.x;
      const dx = xT - xS;
      const distX = Math.max(dx / 2, width * 0.075);
      return `M${xS},${yS} C${xS + distX},${yS} ${xT - distX},${yT} ${xT},${yT}`;
    };

    // Draw ghosts first so primary links paint on top
    const ghostGroup = g.append('g').attr('class', 'ghost-link-group');
    ghostGroup
      .selectAll('path')
      .data(ghostLinks)
      .join('path')
      .attr('class', 'ghost-link')
      .attr('d', linkPath)
      .style('fill', 'none')
      .style('stroke', (d) =>
        d.imputed ? ownershipColors.treeEdgeImputed : ownershipColors.treeEdge
      )
      .style('stroke-width', 1)
      .style('stroke-linecap', 'round')
      .style('mix-blend-mode', 'multiply');

    const linkGroup = g.append('g').attr('class', 'link-group');
    linkGroup
      .selectAll('path')
      .data(linkData)
      .join('path')
      .attr('d', linkPath)
      .style('fill', 'none')
      .style('stroke', (d) => {
        const key = `${d.source.data.name}→${d.target.data.name}`;
        return edgeImputed.get(key) ? ownershipColors.treeEdgeImputed : ownershipColors.treeEdge;
      })
      .style('stroke-width', 1.5)
      .style('stroke-linecap', 'round')
      .style('stroke-dasharray', (d) => {
        const key = `${d.source.data.name}→${d.target.data.name}`;
        return edgeImputed.get(key) ? '4 3' : 'none';
      })
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
        const collapsed = d.data.collapsedEntities;
        const suffix = collapsed && collapsed.length > 0 ? ` (+${collapsed.length})` : '';
        const label = name + suffix;
        return label.length > 24 ? label.slice(0, 22) + '…' : label;
      });

    // Ownership percentage labels below each intermediary node (skip root)
    marks
      .filter((d) => d.depth > 0 && d.ownershipPct != null)
      .append('text')
      .attr('x', 0)
      .attr('y', nr + 14)
      .style('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
      .style('fill', '#64748b')
      .style('pointer-events', 'none')
      .text((d) => {
        const pct = Math.round(d.ownershipPct * 100);
        return pct + '%';
      });

    // Store selections for sidebar→tree cross-highlighting
    treeMarks = marks;
    treeLinkGroup = linkGroup;
    treeGhostGroup = ghostGroup;
    treeLabels = labels;
    treeNodeByName = nodeByName;
    treeG = g;
    treeNr = nr;
    treePad = PAD;
    treeWidth = width;
    treeMargin = margin;

    // Hover interactions: highlight paths (matches Observable notebook exactly)
    marks
      .on('mouseover', function (event, d) {
        if (frozenHiddenEntityId) return; // frozen hidden-path overlay takes precedence
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
        if (frozenHiddenEntityId) return; // frozen hidden-path overlay takes precedence
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
      })
      .on('click', function (event, d) {
        event.stopPropagation();
        if (clickedTreeEntity?.entityId === d.data.name) {
          clickedTreeEntity = null;
          return;
        }
        const entityMap = new Map((apiData.nodes || []).map((n) => [n.entity_id || n.asset_id, n]));
        const entity = entityMap.get(d.data.name);
        const et = (entity?.entity_type || '').toLowerCase();
        let entityType = 'Other';
        if (et === 'state' || et === 'state body') entityType = 'Government';
        else if (entity?.publiclylisted) entityType = 'Publicly Listed Corp.';
        else if (et === 'legal entity') entityType = 'Private Company';

        const leafIds = new Set(d.leaves().map((l) => l.data.name));
        const allMatching = projectGroups.filter((g) => leafIds.has(g.projectID));
        const filteredMatching = displayProjectGroups.filter((g) => leafIds.has(g.projectID));

        clickedTreeEntity = {
          entityId: d.data.name,
          name: d.entityName || entity?.name || d.data.name,
          entityType,
          hqCountry: entity?.headquarters_country || null,
          regCountry: entity?.registration_country || null,
          totalProjects: allMatching.length,
          totalUnits: allMatching.reduce((s, g) => s + g.units.length, 0),
          filteredProjects: filteredMatching.length,
          filteredUnits: filteredMatching.reduce((s, g) => s + g.units.length, 0),
          x: event.clientX,
          y: event.clientY,
        };
      });

    // Overlay group for hidden-path ghost rendering (appended last so it paints on top)
    hiddenPathOverlay = g.append('g').attr('class', 'hidden-path-overlay');

    // Store root and all raw paths for asset→tree cross-highlighting
    treeRoot = root;
    treeAllPaths = treePaths.paths;
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

    // Use extracted grid layout algorithm (see portfolio-layout.ts)
    const containerEl = assetsSvgEl?.parentElement;
    const gl = computeGridLayout({
      containerWidth: containerEl ? containerEl.clientWidth : 600,
      containerHeight,
      depth: 0,
      leafCount: 0,
      isMobile: isViewportBelow('sm'),
      showTree,
      projectCount: groups.length,
    });
    const assetMarkH = gl.assetMarkHeight;
    const assetMarkSingle = gl.assetMarkSingle;
    const nProjects = groups.length;
    const availableWidth = gl.availableWidth;
    const nCols = gl.cols;
    const colWidth = gl.colWidth;
    const nRows = gl.rows;
    const isSingleColumn = gl.isSingleColumn;

    const leafYMap = new Map();
    if (isSingleColumn && showTree && treeRoot) {
      for (const leaf of treeRoot.leaves()) {
        leafYMap.set(leaf.data.name, leaf.x);
      }
    }

    // Match tree's top margin so leaf Y positions align
    const treeTopMargin = 20;

    // Left pad: shift the whole column right so large molecule rings don't clip.
    // Compute from the maximum unit count in this dataset.
    const maxN = Math.max(1, ...groups.map((p) => p.units.length));
    const maxDotR = maxN <= 1 ? unitR : Math.max(3, unitR / Math.sqrt(maxN * 0.5));
    const maxMolDiam = Math.min(assetMarkH - 4, maxN > 1 ? 24 : assetMarkH - 4);
    const { ringRadius: maxMolR, unitRadius: maxMolU } = computeMoleculeRadii(maxMolDiam, maxN, {
      maxUnitRadius: maxDotR,
    });
    const molLeftPad = Math.max(4, Math.ceil(maxMolR + maxMolU - unitR + 4));

    const margin = { top: isSingleColumn ? treeTopMargin : 12, left: molLeftPad };

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

      // Hover background — sized to content, not full column
      const hoverRect = row
        .append('rect')
        .attr('x', -(assetMarkH / 2))
        .attr('y', -assetMarkSingle / 2)
        .attr('width', 10) // placeholder, resized after content is drawn
        .attr('height', assetMarkSingle)
        .attr('rx', assetMarkSingle * 0.25)
        .style('fill', 'transparent')
        .style('cursor', 'pointer')
        .style('pointer-events', 'all')
        .on('mouseover', function (event) {
          if (frozenHiddenEntityId) return;
          d3.select(this).style('fill', `${colors.bgSecondary}`);
          hoveredProject = proj;
          tooltipPos = { x: event.clientX, y: event.clientY };

          // Highlight only this asset, dim others
          g.selectAll('.asset-row')
            .transition('fade')
            .duration(100)
            .style('opacity', function () {
              return this.getAttribute('data-project-id') === proj.projectID ? 1 : 0.3;
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

              // Dim primary tree edges not connecting active nodes
              treeSvg
                .selectAll('.link-group path')
                .transition('fade')
                .duration(100)
                .style('opacity', (l) =>
                  activeNodes.has(l.source) && activeNodes.has(l.target) ? 1 : 0.05
                );

              // Ghost links dim on hover
              if (treeGhostGroup) {
                const activeEdges = new Set();
                for (const rp of treeAllPaths) {
                  const leafId = rp.path[rp.path.length - 1];
                  if (leafId !== proj.projectID) continue;
                  for (let k = 0; k < rp.path.length - 1; k++) {
                    activeEdges.add(`${rp.path[k]}→${rp.path[k + 1]}`);
                  }
                }
                treeGhostGroup
                  .selectAll('path')
                  .transition('fade')
                  .duration(100)
                  .style('opacity', (l) => {
                    const key = `${l?.source?.data?.name}→${l?.target?.data?.name}`;
                    return activeEdges.has(key) ? 1 : 0.05;
                  });
              }
            }
          }
        })
        .on('mouseout', function () {
          if (frozenHiddenEntityId) return;
          d3.select(this).style('fill', 'transparent');
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
          treeGhostGroup?.selectAll('path').transition('fade').duration(200).style('opacity', 1);
        })
        .on('click', function (event) {
          event.stopPropagation();
          if (frozenHiddenEntityId) {
            frozenHiddenEntityId = null;
            hiddenPathOverlay?.selectAll('*').remove();
            clearTreeHover();
            return;
          }
          hoveredProject = null;
          modalPos = { x: event.clientX, y: event.clientY };
          selectedProject = proj;
        });

      // Unit circles via shared molecule renderer
      // Dot radius smoothly scales down as unit count grows: 8px→3px over 1→20+ units
      const N = proj.units.length;
      const dotR = N <= 1 ? unitR : Math.max(3, unitR / Math.sqrt(N * 0.5));
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
              : countryColor(unit.country || 'Unknown'),
        ownershipPct: unit.ownership_share,
        opacity: isFiltered && unit._matched === false ? 0.25 : 1,
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

      // Unit count badge — show "3 of 12 units" when filtered, "12 units" otherwise
      let afterNameX = nameX + Math.min(name.length * 6.5, 250) + 8;
      const matchedCount = isFiltered ? proj.units.filter((u) => u._matched !== false).length : N;
      if (N > 1) {
        const unitLabel =
          isFiltered && matchedCount < N ? `${matchedCount} of ${N} units` : `${N} units`;
        labelG
          .append('text')
          .attr('dy', '0.35em')
          .attr('x', afterNameX)
          .style('font-size', '8px')
          .style('font-weight', 500)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.07em')
          .style('fill', colors.gray500)
          .text(unitLabel);
        afterNameX += unitLabel.length * 5.5 + 8;
      }

      // Cumulative ownership badge (effective % through intermediary chains)
      const cumPct = cumulativePctMap.get(proj.projectID);
      if (cumPct != null && cumPct > 0) {
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

      // Resize hover rect to fit actual content width
      try {
        const bbox = row.node().getBBox();
        hoverRect.attr('width', bbox.width + assetMarkH);
      } catch (e) {
        /* getBBox can fail if not rendered yet */
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
      ownership: parseFilterParam(initialFilters.ownership),
      intermediary: parseFilterParam(initialFilters.intermediary),
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

  // Notify parent when summary data is ready (e.g. to render stats in a modal header)
  $effect(() => {
    if (summary) onSummaryReady?.(summary);
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
  class:fit-parent={fitParent}
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
        <!-- Edge legend — inside chart-area so it only affects chart height, not sidebar -->
        {#if showTree}
          <div class="edge-legend-bar">
            <span class="edge-legend-item">
              <svg viewBox="0 0 24 8" width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke={ownershipColors.treeEdge} stroke-width="2" stroke-linecap="round" />
              </svg>
              Known %
            </span>
            <span class="edge-legend-item">
              <svg viewBox="0 0 24 8" width="24" height="8">
                <line x1="0" y1="4" x2="24" y2="4" stroke={ownershipColors.treeEdgeImputed} stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3" />
              </svg>
              Imputed %
            </span>
          </div>
        {/if}
        {#if isFiltered && displayProjectGroups.length === 0}
          <div class="empty-state">
            <p>No assets match current filters.</p>
            <button class="clear-btn" onclick={clearFilter}>Clear filters</button>
          </div>
        {:else}
          <div class="chart-row">
            {#if showTree}
              <div class="tree-container">
                {#if hiddenIntermediaries.length > 0}
                  <div class="hidden-intermediaries-sticky">
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <aside class="hidden-intermediaries" onclick={(e) => e.stopPropagation()}>
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex a11y_no_static_element_interactions -->
                      <div
                        class="hidden-intermediaries-title"
                        class:open={hiddenIntermediariesExpanded}
                        tabindex="0"
                        onclick={() =>
                          (hiddenIntermediariesExpanded = !hiddenIntermediariesExpanded)}
                        onkeydown={(e) =>
                          e.key === 'Enter' &&
                          (hiddenIntermediariesExpanded = !hiddenIntermediariesExpanded)}
                      >
                        <span class="hidden-intermediaries-chevron"
                          >{hiddenIntermediariesExpanded ? '−' : '+'}</span
                        >
                        {hiddenIntermediaries.length}
                        {hiddenIntermediaries.length === 1 ? 'intermediary' : 'intermediaries'} from
                        duplicate paths hidden
                      </div>
                      {#if hiddenIntermediariesExpanded}
                        <div class="hidden-intermediaries-body">
                          <ul class="hidden-intermediaries-list">
                            {#each hiddenIntermediaries as h (h.entity_id)}
                              {@const isFrozen = frozenHiddenEntityId === h.entity_id}
                              {@const pieR = 7}
                              {@const piePct = h.ownershipPct ?? 1}
                              <!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
                              <li
                                class="hidden-intermediary-item"
                                class:frozen={isFrozen}
                                tabindex="0"
                                onmouseenter={() => highlightHiddenPath(h.entity_id)}
                                onmouseleave={clearHiddenPathOverlay}
                                onclick={() => toggleFrozenHiddenPath(h.entity_id)}
                                onkeydown={(e) =>
                                  e.key === 'Enter' && toggleFrozenHiddenPath(h.entity_id)}
                              >
                                <svg
                                  class="hidden-intermediary-pie"
                                  width={pieR * 2}
                                  height={pieR * 2}
                                  viewBox="{-pieR} {-pieR} {pieR * 2} {pieR * 2}"
                                >
                                  <circle r={pieR} fill={ownershipColors.treeNodeFill} />
                                  <path
                                    d={d3Shape.arc().innerRadius(0).startAngle(0)({
                                      outerRadius: pieR - 1,
                                      endAngle: 2 * Math.PI * piePct,
                                    })}
                                    fill={ownershipColors.treeTeal}
                                  />
                                </svg>
                                <span class="hidden-intermediary-name">{h.name}</span>
                              </li>
                            {/each}
                          </ul>
                          <div class="hidden-intermediaries-note">
                            Each asset is placed under its longest ownership chain. Hover to preview
                            shorter paths; click to freeze.
                          </div>
                        </div>
                      {/if}
                    </aside>
                  </div>
                {/if}
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions a11y_no_static_element_interactions -->
                <svg
                  bind:this={treeSvgEl}
                  onclick={() => {
                    clickedTreeEntity = null;
                    if (frozenHiddenEntityId) {
                      frozenHiddenEntityId = null;
                      hiddenPathOverlay?.selectAll('*').remove();
                      clearTreeHover();
                    }
                  }}
                ></svg>
              </div>
            {/if}
            <div class="assets-container" class:full-width={!showTree}>
              <svg bind:this={assetsSvgEl}></svg>
            </div>
          </div>
        {/if}
      </div>

      <!-- Clear filters — floats above the sidebar left edge, outside overflow-clipping sidebar -->
      {#if isFiltered}
        {@const activeLabels = Object.values(filters).flatMap((s) => [...s])}
        {@const filterCount = activeLabels.length + (minEffOwnership > 0 ? 1 : 0)}
        <button class="clear-filter-float" onclick={clearFilter}>
          Clear {filterCount} filter{filterCount !== 1 ? 's' : ''}
        </button>
      {/if}

      <!-- Filter sidebar — sticky -->
      <div class="filter-sidebar">
        <div class="sidebar-filters">
          <!-- Effective ownership slider — filters projects by spotlight owner's cumulative % -->
          {#if cumulativePctMap.size > 0}
            <div class="summary-section summary-section-full">
              <p class="subtitle">Min. Effective Ownership</p>
              <div class="eff-ownership-slider">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={minEffOwnership}
                  oninput={(e) => { userHasInteracted = true; minEffOwnership = +(/** @type {HTMLInputElement} */ (e.target)).value; }}
                  class="ownership-range"
                />
                <span class="eff-ownership-val">
                  {minEffOwnership > 0 ? `≥${minEffOwnership}%` : 'All'}
                </span>
              </div>
            </div>
          {/if}

          <div class="summary-section">
            {#if availableColorFields.includes('country')}
              {@const isColorActive = colorField === 'country'}
              {@const sliceColors = [...countryColorMap.values()]}
              <button
                class="subtitle subtitle-colorbtn"
                class:color-active={isColorActive}
                type="button"
                data-tooltip="Color by location"
                onclick={() => { userHasInteracted = true; colorFieldOverride = isColorActive ? '' : 'country'; }}
              >
                By Location
                <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" class="colorbtn-icon">
                  <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1" />
                  {#if isColorActive}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill={sliceColors[0] ?? 'currentColor'} />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill={sliceColors[1] ?? 'currentColor'} />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill={sliceColors[2] ?? 'currentColor'} />
                  {:else}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill="currentColor" opacity="0.5" />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill="currentColor" opacity="0.28" />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill="currentColor" opacity="0.1" />
                  {/if}
                </svg>
              </button>
            {:else}
              <p class="subtitle">By Location</p>
            {/if}
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
                  <span
                    class="legend-dot"
                    style="background: {colorField === 'country'
                      ? countryColor(country)
                      : 'rgba(255,255,255,0.3)'}"
                  ></span>
                  {country} ({isFiltered
                    ? `${filteredCount ?? 0} of ${data.assetCount}`
                    : data.assetCount})
                </div>
              {/each}
            </div>
          </div>

          <div class="summary-section">
            {#if availableColorFields.includes('type')}
              {@const isColorActive = colorField === 'type'}
              {@const sliceColors = [...summary.byType.keys()].slice(0, 3).map((t) => trackerColorMap.get(t) || colors.grey)}
              <button
                class="subtitle subtitle-colorbtn"
                class:color-active={isColorActive}
                type="button"
                data-tooltip="Color by type"
                onclick={() => { userHasInteracted = true; colorFieldOverride = isColorActive ? '' : 'type'; }}
              >
                By Type
                <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" class="colorbtn-icon">
                  <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1" />
                  {#if isColorActive}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill={sliceColors[0] ?? 'currentColor'} />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill={sliceColors[1] ?? 'currentColor'} />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill={sliceColors[2] ?? 'currentColor'} />
                  {:else}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill="currentColor" opacity="0.5" />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill="currentColor" opacity="0.28" />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill="currentColor" opacity="0.1" />
                  {/if}
                </svg>
              </button>
            {:else}
              <p class="subtitle">By Type</p>
            {/if}
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
                  <span
                    class="legend-dot"
                    style="background: {colorField === 'type'
                      ? typeColor
                      : 'rgba(255,255,255,0.3)'}"
                  ></span>
                  {type} ({isFiltered
                    ? `${filteredCount ?? 0} of ${data.assetCount}`
                    : data.assetCount})
                </div>
              {/each}
            </div>
          </div>

          <div class="summary-section">
            {#if availableColorFields.includes('status')}
              {@const isColorActive = colorField === 'status'}
              {@const sliceColors = [...summary.byStatus.keys()].slice(0, 3).map((s) => COLOR_BY_STATUS.get(s.toLowerCase()) || colors.grey)}
              <button
                class="subtitle subtitle-colorbtn"
                class:color-active={isColorActive}
                type="button"
                data-tooltip="Color by status"
                onclick={() => { userHasInteracted = true; colorFieldOverride = isColorActive ? '' : 'status'; }}
              >
                By Status
                <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true" class="colorbtn-icon">
                  <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" stroke-width="1" />
                  {#if isColorActive}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill={sliceColors[0] ?? 'currentColor'} />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill={sliceColors[1] ?? 'currentColor'} />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill={sliceColors[2] ?? 'currentColor'} />
                  {:else}
                    <path d="M7 7 L7 1 A6 6 0 0 1 12.2 10 Z" fill="currentColor" opacity="0.5" />
                    <path d="M7 7 L12.2 10 A6 6 0 0 1 1.8 10 Z" fill="currentColor" opacity="0.28" />
                    <path d="M7 7 L1.8 10 A6 6 0 0 1 7 1 Z" fill="currentColor" opacity="0.1" />
                  {/if}
                </svg>
              </button>
            {:else}
              <p class="subtitle">By Status</p>
            {/if}
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
                  <span
                    class="legend-dot"
                    style="background: {colorField === 'status'
                      ? statusColor
                      : 'rgba(255,255,255,0.3)'}"
                  ></span>
                  {status} ({isFiltered
                    ? `${filteredCount ?? 0} of ${data.assetCount}`
                    : data.assetCount})
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

          <!-- Intermediaries: always shown so filtering is visible regardless of tree state -->
          {#if intermediaries.length > 0}
            <div class="summary-section">
              <p class="subtitle">Intermediaries</p>
              <div class="summary-table">
                {#each sortedIntermediaries as inter}
                  {@const isActive = filters.intermediary.has(inter.entity_id)}
                  {@const filteredCount = inter.filteredCount ?? null}
                  {@const hasResults = !isFiltered || (filteredCount ?? 0) > 0}
                  <div
                    class="summary-row"
                    class:active={isActive}
                    class:dimmed={isFiltered && !isActive && hasResults}
                    class:faded={isFiltered && !isActive && !hasResults}
                    role="button"
                    tabindex="0"
                    onclick={() => applyFilter('intermediary', inter.entity_id)}
                    onkeydown={(e) =>
                      e.key === 'Enter' && applyFilter('intermediary', inter.entity_id)}
                    onmouseenter={() => highlightIntermediaryInTree(inter.entity_id)}
                    onmouseleave={clearTreeHover}
                  >
                    {inter.name} ({isFiltered
                      ? `${filteredCount ?? 0} of ${inter.assetCount}`
                      : inter.assetCount})
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Tree entity click tooltip -->
    {#if clickedTreeEntity}
      {@const cte = clickedTreeEntity}
      {@const ttLeft = typeof window !== 'undefined' ? Math.min(cte.x + 14, window.innerWidth - 280) : cte.x + 14}
      {@const ttTop = typeof window !== 'undefined' ? Math.min(cte.y - 10, window.innerHeight - 200) : cte.y - 10}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="entity-tooltip-backdrop" onclick={() => (clickedTreeEntity = null)}></div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="entity-tooltip"
        style="left: {ttLeft}px; top: {ttTop}px;"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (clickedTreeEntity = null)}
      >
        <button class="entity-tooltip-close" onclick={() => (clickedTreeEntity = null)}>✕</button>
        <div class="et-name">{cte.name}</div>
        <div class="et-type">{cte.entityType}</div>
        {#if cte.hqCountry}
          <div class="et-detail">HQ: {cte.hqCountry}</div>
        {/if}
        {#if cte.regCountry && cte.regCountry !== cte.hqCountry}
          <div class="et-detail">Reg: {cte.regCountry}</div>
        {/if}
        <div class="et-assets">
          <div class="et-count-row">
            <span>{cte.totalProjects} project{cte.totalProjects !== 1 ? 's' : ''}{cte.totalUnits > cte.totalProjects ? ` • ${cte.totalUnits} units` : ''}</span>
            {#if isFiltered}<span class="et-count-note">total owned</span>{/if}
          </div>
          {#if isFiltered}
            <div class="et-count-row">
              <span>{cte.filteredProjects} project{cte.filteredProjects !== 1 ? 's' : ''}{cte.filteredUnits > cte.filteredProjects ? ` • ${cte.filteredUnits} units` : ''}</span>
              <span class="et-count-note">with filters</span>
            </div>
          {/if}
        </div>
      </div>
    {/if}

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
        {#if cumPct != null && cumPct > 0}
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
            {#if selectedProject.units.length > 1}
              {@const totalUnits = selectedProject.units.length}
              {@const matchedUnits = selectedProject.units.filter(
                (u) => u._matched !== false
              ).length}
              <span class="unit-badge"
                >{isFiltered && matchedUnits < totalUnits
                  ? `${matchedUnits} of ${totalUnits} units`
                  : `${totalUnits} units`}</span
              >
            {/if}
          </div>
          <div class="tt-meta">
            {sp0?.asset_type || ''}{#if sp0?.country}
              · {sp0.country}{/if}
          </div>
          {#if modalCumPct != null && modalCumPct > 0}
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
                <tr style={isFiltered && unit._matched === false ? 'opacity:0.35' : ''}>
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
    position: relative;
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
    overflow-y: auto;
    max-height: calc(100vh - 180px);
  }
  .tree-container {
    flex-shrink: 0;
    margin-right: -8px;
    position: relative;
  }
  .hidden-intermediaries-sticky {
    position: sticky;
    top: 8px;
    height: 0;
    overflow: visible;
    z-index: 2;
  }
  .hidden-intermediaries {
    position: relative;
    display: inline-block;
    max-width: 220px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid var(--color-border, #e0e0e0);
    border-radius: 4px;
    font-size: 10px;
    line-height: 1.35;
    color: var(--color-text-muted, #444);
    pointer-events: auto;
    overflow: hidden;
  }
  .hidden-intermediaries-title {
    font-weight: 600;
    color: var(--color-text, #222);
    margin: 0;
    padding: 5px 8px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(0, 0, 0, 0.03);
    border-bottom: 1px solid transparent;
    transition: background 0.1s;
  }
  .hidden-intermediaries-title:hover {
    background: rgba(157, 247, 229, 0.2);
  }
  .hidden-intermediaries-title.open {
    border-bottom-color: var(--color-border, #e0e0e0);
  }
  .hidden-intermediaries-body {
    padding: 5px 8px 6px;
  }
  .hidden-intermediaries-chevron {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
    color: var(--color-text-muted, #666);
  }
  .hidden-intermediaries-list {
    margin: 0 0 5px;
    padding: 0;
    max-height: 140px;
    overflow-y: auto;
    list-style: none;
  }
  .hidden-intermediary-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 2px 3px;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1.3;
  }
  .hidden-intermediary-item:hover {
    background: rgba(157, 247, 229, 0.15);
  }
  .hidden-intermediary-item.frozen {
    background: rgba(157, 247, 229, 0.25);
    outline: 1px solid var(--gem-mint, #9df7e5);
  }
  .hidden-intermediary-pie {
    flex-shrink: 0;
  }
  .hidden-intermediary-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hidden-intermediaries-note {
    font-style: italic;
    font-size: 9px;
    color: var(--color-text-muted, #666);
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
  .fit-parent {
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .fit-parent .chart-layout {
    flex: 1;
    min-height: 0;
  }
  .fit-parent .chart-area {
    max-height: none;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .fit-parent .chart-row {
    flex: 1;
    min-height: 0;
  }
  .fit-parent .tree-container,
  .fit-parent .assets-container {
    height: 100%;
  }
  .fit-parent .filter-sidebar {
    max-height: none;
  }
  .embed-mode .filter-sidebar {
    max-height: none;
    overflow-y: auto;
    border-radius: 0;
  }
  @media (max-width: 700px) {
    .embed-mode .chart-layout {
      flex-direction: column;
    }
    .embed-mode .filter-sidebar {
      flex: none;
      width: 100%;
    }
  }
  .clear-filter-float {
    position: absolute;
    top: 10px;
    right: clamp(220px, 28%, 320px);
    margin-right: 8px;
    padding: 3px 10px;
    border: 1px solid var(--gem-navy, #1d4961);
    border-radius: 3px;
    background: var(--gem-navy, #1d4961);
    color: var(--gem-mint, #9df7e5);
    font-size: 10px;
    font-family: inherit;
    font-weight: var(--font-weight-bold);
    cursor: pointer;
    white-space: nowrap;
    z-index: 2;
    transition: opacity 80ms ease;
  }
  .clear-filter-float:hover {
    opacity: 0.85;
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
  .edge-legend-bar {
    display: flex;
    gap: 14px;
    padding: 4px 8px;
    font-size: 10px;
    color: var(--color-text-tertiary);
  }
  .edge-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .subtitle {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: var(--font-weight-bold);
    color: rgba(255, 255, 255, 0.4);
    margin: 0 0 4px 0;
  }
  .subtitle-colorbtn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: color 80ms ease;
    position: relative;
  }
  .subtitle-colorbtn[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    white-space: nowrap;
    padding: 4px 8px;
    background: #fff;
    color: #1a2332;
    font-size: 11px;
    font-weight: normal;
    text-transform: none;
    letter-spacing: 0;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    pointer-events: none;
    z-index: 10;
  }
  .subtitle-colorbtn:hover {
    color: rgba(255, 255, 255, 0.65);
  }
  .subtitle-colorbtn.color-active {
    color: var(--gem-mint, #9df7e5);
  }
  .colorbtn-icon {
    flex-shrink: 0;
    opacity: 0.6;
    transition: opacity 80ms ease;
  }
  .subtitle-colorbtn:hover .colorbtn-icon,
  .subtitle-colorbtn.color-active .colorbtn-icon {
    opacity: 1;
  }
  .summary-table {
    overflow-y: auto;
    max-height: 200px;
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

  /* ---- Effective ownership slider ---- */
  .eff-ownership-slider {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }
  .ownership-range {
    flex: 1;
    -webkit-appearance: none;
    appearance: none;
    height: 3px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.15);
    outline: none;
    cursor: pointer;
  }
  .ownership-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--gem-mint, #9df7e5);
    cursor: pointer;
    border: none;
  }
  .ownership-range::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--gem-mint, #9df7e5);
    cursor: pointer;
    border: none;
  }
  .eff-ownership-val {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.7);
    min-width: 30px;
    text-align: right;
    white-space: nowrap;
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
    .sidebar-filters {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0 12px;
    }
    .summary-section-full {
      grid-column: 1 / -1;
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

  /* ---- Entity click tooltip ---- */
  .entity-tooltip-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1099;
    background: transparent;
    cursor: default;
  }
  .entity-tooltip {
    position: fixed;
    z-index: 1100;
    background: var(--gem-white, #fff);
    border: 1px solid var(--color-border, #ddd);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.14);
    padding: 10px 14px 12px;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    min-width: 200px;
    max-width: 280px;
    animation: tt-in 80ms ease-out;
  }
  .entity-tooltip-close {
    position: absolute;
    top: 6px;
    right: 8px;
    background: none;
    border: none;
    font-size: 12px;
    color: var(--color-text-tertiary, #aaa);
    cursor: pointer;
    padding: 2px 4px;
    line-height: 1;
  }
  .et-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--color-text-primary, #1a2c3a);
    padding-right: 18px;
    line-height: 1.3;
    margin-bottom: 2px;
  }
  .et-type {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-text-tertiary, #999);
    margin-bottom: 6px;
  }
  .et-detail {
    font-size: 11px;
    color: var(--color-text-secondary, #5a7080);
    margin-bottom: 2px;
  }
  .et-assets {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border-light, #eee);
    font-size: 11px;
    color: var(--color-text-primary, #1a2c3a);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .et-count-row {
    display: flex;
    gap: 5px;
    align-items: baseline;
  }
  .et-count-note {
    font-size: 10px;
    color: var(--color-text-secondary, #5a7080);
  }
  .et-count-note::before {
    content: '(';
  }
  .et-count-note::after {
    content: ')';
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
</style>
