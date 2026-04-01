<script>
  /**
   * PORTFOLIO EXPLORER
   * Pick an entity → see all downstream assets grouped by project/location,
   * with summary breakdowns by country, type, status, and intermediaries.
   * When filtered to a small set, shows a d3.cluster tree linking ownership paths.
   *
   * Ported from Observable notebook: https://observablehq.com/d/5a1f34aee34fe4cf
   */
  import { page } from '$app/stores';
  import { entityLink } from '$lib/links';
  import * as d3 from 'd3-selection';
  import * as d3Array from 'd3-array';
  import * as d3Hierarchy from 'd3-hierarchy';
  import * as d3Shape from 'd3-shape';
  import { transition } from 'd3-transition'; // side-effect import for selection.transition()
  import {
    colors,
    trackerColorMap,
    statusColorsGranular,
    ownershipColors,
  } from '$lib/design-tokens';

  const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

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
  /** URL param support: ?entity=E100001000347&hidePicker=true */
  const urlEntity = $page.url.searchParams.get('entity');
  const urlHidePicker = $page.url.searchParams.get('hidePicker') === 'true';

  let selectedEntityId = $state(urlEntity || SAMPLE_OWNERS[0][1]);
  let customEntityId = $state('');
  let hidePicker = $state(urlHidePicker);
  let loading = $state(false);
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
  let filters = $state({
    country: new Set(),
    asset_type: new Set(),
    operating_status: new Set(),
    intermediary: new Set(),
  });
  /** Intermediary name → projectIds lookup (populated when intermediaries are clicked) */
  let intermediaryProjectIds = $state(new Map());

  /** Whether any filter is active */
  let isFiltered = $derived(
    filters.country.size > 0 ||
    filters.asset_type.size > 0 ||
    filters.operating_status.size > 0 ||
    filters.intermediary.size > 0
  );

  /** Apply all active filters (OR within column, AND across columns) */
  let filteredResult = $derived.by(() => {
    if (!isFiltered || !apiData) return null;
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
    if (filters.intermediary.size > 0) {
      // Union all projectIds from selected intermediaries
      const allPids = new Set();
      for (const name of filters.intermediary) {
        const pids = intermediaryProjectIds.get(name);
        if (pids) for (const p of pids) allPids.add(p);
      }
      assets = assets.filter((a) => allPids.has(a.location_id || a.unit_id || a.asset_id));
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

  /** Color field: 'type' when multi-type, 'status' when single type */
  let colorField = $derived(
    summary && summary.byType.size > 1 ? 'type' : 'status'
  );

  /** Tree SVG params — squished tight to maximize density */
  const treeParams = {
    rowHeight: 18,
    siblingSeparation: 1.0,
    cousinSeparation: 1.4,
    nodeRadius: 5,
  };

  /** Available viewport height for chart area */
  let containerHeight = $state(500);

  /** How many asset rows fit in one column (notebook: nRows = svgHeight / assetMarkHeightCombined) */
  const ASSET_MARK_H = 26;
  let nRowsFit = $derived(Math.max(4, Math.floor(Math.max(300, containerHeight - 80) / ASSET_MARK_H)));

  /** Show tree only when all projects fit in a single column (notebook: projectGroups.length <= nRows) */
  let showTree = $derived(
    displayProjectGroups.length <= nRowsFit && displayProjectGroups.length > 0
  );

  /** DOM refs */
  let chartContainer = $state(null);
  let treeSvgEl = $state(null);
  let assetsSvgEl = $state(null);

  /** Stored d3 tree root — needed for asset→tree cross-highlighting */
  let treeRoot = $state(null);

  // ============================================================================
  // DATA FETCHING
  // ============================================================================
  async function fetchData(entityId) {
    loading = true;
    error = '';
    apiData = null;
    summary = null;
    projectGroups = [];
    intermediaries = [];
    filters = { country: new Set(), asset_type: new Set(), operating_status: new Set(), intermediary: new Set() };

    try {
      const resp = await fetch(
        `${API_BASE}/ownership/graph?root=${encodeURIComponent(entityId)}&direction=down&max_depth=5&format=json`,
        { signal: AbortSignal.timeout(30_000) }
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
      error = err.message || 'Failed to fetch data';
    } finally {
      loading = false;
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
    return { total, byCountry, byType, byStatus };
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
    const entityIds = new Set(
      graph.nodes.filter((n) => n.node_type === 'entity').map((n) => n.entity_id)
    );
    const paths = [];
    const pathStrings = [];
    function dfs(nodeId, path) {
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
    }
    dfs(rootEntityId, [rootEntityId]);

    // Deduplicate path strings
    const uniquePathStrings = [...new Set(pathStrings)];

    return { paths, pathStrings: uniquePathStrings };
  }

  // ============================================================================
  // INTERMEDIARIES
  // ============================================================================
  function computeIntermediaries(entities, treePaths, rootEntityId) {
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
    const next = new Set(filters[field]);
    if (next.has(value)) {
      next.delete(value); // toggle off
    } else {
      next.add(value); // toggle on
    }
    filters = { ...filters, [field]: next };
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
    svg.selectAll('*').remove();

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
      d.ownershipPct = edge && typeof edge.value === 'number' ? edge.value / 100 : 1;
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
    svg.selectAll('*').remove();

    const groups = displayProjectGroups;
    if (groups.length === 0) return;

    const unitR = 6;
    const labelX = 28;
    const assetMarkH = 26; // combined mark height (notebook: assetMarkHeightCombined)
    const assetMarkSingle = 16;

    // --- Grid layout (port of notebook's gridInfo + nRows) ---
    // svgHeight drives how many rows fit in one column
    const svgH = Math.max(300, containerHeight - 80);
    const nRows = Math.max(4, Math.floor(svgH / assetMarkH));
    const nProjects = groups.length;
    const colsNeeded = Math.ceil(nProjects / nRows);
    const minColWidth = 300;
    const colWidth = Math.max(minColWidth, assetMarkH * 12);
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
        });

      // Unit circles
      const N = proj.units.length;
      const TAU = Math.PI * 2;
      const clusterR = N === 1 ? 0 : Math.min(unitR * 0.8, 6);

      proj.units.forEach((unit, j) => {
        const cx = N === 1 ? unitR : unitR + clusterR * Math.cos((TAU * j) / N);
        const cy = N === 1 ? 0 : clusterR * Math.sin((TAU * j) / N);
        const circleR = N === 1 ? unitR : unitR * 0.6;

        const unitColor =
          colorField === 'type'
            ? trackerColorMap.get(unit.asset_type) || colors.grey
            : COLOR_BY_STATUS.get(unit.operating_status?.toLowerCase()) || colors.grey;

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
          const pieArc = d3Shape.arc().innerRadius(0).outerRadius(circleR + 0.5).startAngle(0);
          row
            .append('path')
            .attr('transform', `translate(${cx},${cy})`)
            .attr('d', pieArc({ endAngle: (2 * Math.PI * unit.ownership_share) / 100 }))
            .style('fill', colors.navy)
            .style('fill-opacity', 0.1)
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
          .attr('r', clusterR + unitR * 0.6 + 1)
          .style('fill', 'none')
          .style('stroke', colors.gray300)
          .style('stroke-width', 1)
          .style('pointer-events', 'none');
      }

      // Asset name label
      let name = proj.units[0]?.asset_name || proj.projectID;
      // Trim after key words like the notebook does
      name = name.replace(
        /\b(plant|station|project|center|centre|complex|facility)\b[\s\S]*$/i,
        '$1'
      );

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
  $effect(() => {
    if (selectedEntityId) {
      fetchData(selectedEntityId);
    }
  });

  // Measure available height dynamically
  $effect(() => {
    if (!chartContainer) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight = entry.contentRect.height || 500;
      }
    });
    ro.observe(chartContainer);
    return () => ro.disconnect();
  });

  $effect(() => {
    // Redraw when data or filter changes
    if (displayData && displayProjectGroups.length > 0) {
      // Use microtask to ensure DOM is ready
      queueMicrotask(() => {
        drawTree();
        drawAssets();
      });
    }
  });

  function handleSelectEntity(entityId) {
    selectedEntityId = entityId;
    customEntityId = '';
  }

  function handleCustomEntity() {
    if (customEntityId.trim()) {
      selectedEntityId = customEntityId.trim();
    }
  }
</script>

<div class="portfolio-explorer">
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
    <div class="chart-row" bind:this={chartContainer}>
      {#if showTree}
        <div class="tree-container">
          <svg bind:this={treeSvgEl}></svg>
        </div>
      {/if}
      <div class="assets-container" class:full-width={!showTree}>
        <svg bind:this={assetsSvgEl}></svg>
      </div>
    </div>

    <!-- FILTER FOOTER — cross-column additive (AND), same-column click toggles -->
    <div class="chart-footer">
      {#if isFiltered}
        {@const activeLabels = Object.values(filters).flatMap((s) => [...s])}
        <button class="clear-filter-inline" class:many={activeLabels.length > 3} onclick={clearFilter}>
          Clear: {activeLabels.join(' + ')}
        </button>
      {/if}
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

      <div class="summary-section">
        <p class="subtitle">Intermediaries</p>
        <div class="summary-table">
          {#each intermediaries as inter}
            {@const isActive = filters.intermediary.has(inter.name)}
            <div
              class="summary-row"
              class:active={isActive}
              class:dimmed={isFiltered && !isActive}
              role="button"
              tabindex="0"
              onclick={() => applyFilter('intermediary', inter.name, inter.projectIds)}
              onkeydown={(e) => e.key === 'Enter' && applyFilter('intermediary', inter.name, inter.projectIds)}
            >
              {inter.name} ({inter.assetCount})
            </div>
          {/each}
        </div>
      </div>
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
  .chart-row {
    display: flex;
    overflow-x: auto;
    min-height: 200px;
    max-height: calc(100vh - 260px);
  }
  .tree-container {
    flex-shrink: 0;
    overflow: visible;
  }
  .tree-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
  }
  .assets-container {
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
    max-height: calc(100vh - 260px);
    padding-left: var(--space-2);
  }
  .assets-container.full-width {
    width: 100%;
  }
  .assets-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
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
    width: 8px;
    height: 8px;
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
    gap: var(--space-10, 40px);
    width: 100%;
  }
  .clear-filter-inline {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-3);
    margin-bottom: var(--space-2);
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
</style>
