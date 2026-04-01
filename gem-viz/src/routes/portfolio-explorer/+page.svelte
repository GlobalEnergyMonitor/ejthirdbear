<script>
  /**
   * PORTFOLIO EXPLORER
   * Pick an entity → see all downstream assets grouped by project/location,
   * with summary breakdowns by country, type, status, and intermediaries.
   * When filtered to a small set, shows a d3.cluster tree linking ownership paths.
   *
   * Ported from Observable notebook: https://observablehq.com/d/5a1f34aee34fe4cf
   */
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
  let selectedEntityId = $state(SAMPLE_OWNERS[0][1]);
  let customEntityId = $state('');
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

  /** Active filter (null = none) */
  let activeFilter = $state(null);
  /** Filtered data (mirrors apiData structure but filtered) */
  let filteredApiData = $state(null);
  /** Filtered summary */
  let filteredSummary = $state(null);
  /** Filtered project groups */
  let filteredProjectGroups = $state([]);

  /** Whether we're showing filtered or full data */
  let isFiltered = $derived(activeFilter !== null);
  /** The data currently being displayed */
  let displayData = $derived(isFiltered ? filteredApiData : apiData);
  let displaySummary = $derived(isFiltered ? filteredSummary : summary);
  let displayProjectGroups = $derived(isFiltered ? filteredProjectGroups : projectGroups);

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

  /** Dynamic: how many rows fit in available height */
  let maxRowsForTree = $derived(Math.max(8, Math.floor(containerHeight / treeParams.rowHeight)));

  /** Should we show the tree? */
  let showTree = $derived(
    displayProjectGroups.length <= maxRowsForTree && displayProjectGroups.length > 0
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
    activeFilter = null;
    filteredApiData = null;
    filteredSummary = null;
    filteredProjectGroups = [];

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

    // DFS to collect all paths from root to leaf projects
    const paths = [];
    const pathStrings = [];
    function dfs(nodeId, path) {
      const children = childrenOf.get(nodeId) || [];
      if (children.length === 0) {
        // Leaf — resolve to project ID
        const projId = assetToProject.get(nodeId) || nodeId;
        if (projectIds.has(projId) || projectIds.has(nodeId)) {
          const fullPath = [...path, projId];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
        }
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
        };
      })
      .filter((e) => e.assetCount > 0)
      .sort((a, b) => b.assetCount - a.assetCount);
  }

  // ============================================================================
  // FILTERING
  // ============================================================================
  function applyFilter(field, value) {
    if (!apiData) return;
    if (activeFilter && activeFilter.field === field && activeFilter.value === value) {
      // Toggle off
      activeFilter = null;
      filteredApiData = null;
      filteredSummary = null;
      filteredProjectGroups = [];
      return;
    }
    activeFilter = { field, value };
    const filtered = apiData.assets.filter((a) => a[field] === value);
    filteredApiData = { ...apiData, assets: filtered };
    filteredSummary = summarizeAssets(filtered);
    filteredProjectGroups = makeProjectGroups(filtered);
  }

  function clearFilter() {
    activeFilter = null;
    filteredApiData = null;
    filteredSummary = null;
    filteredProjectGroups = [];
  }

  // ============================================================================
  // D3 TREE VISUALIZATION (port of drawTreeChart)
  // ============================================================================
  function buildHierarchy(pathStrings) {
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
    return root.children.length === 1 ? root.children[0] : root;
  }

  function drawTree() {
    if (!treeSvgEl || !apiData || !showTree) return;
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

    const hierData = buildHierarchy(treePaths.pathStrings);
    const root = d3Hierarchy.hierarchy(hierData);

    // Calculate height from leaf count with tight spacing
    const leaves = root.leaves();
    const nLeaves = leaves.length;
    let sibGaps = 0;
    let cousinGaps = 0;
    for (let i = 0; i < nLeaves - 1; i++) {
      if (leaves[i].parent === leaves[i + 1].parent) sibGaps++;
      else cousinGaps++;
    }
    const calcHeight = Math.max(
      100,
      nLeaves * treeParams.rowHeight +
        sibGaps * treeParams.siblingSeparation +
        cousinGaps * treeParams.cousinSeparation
    );

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
        const xT = isLeaf ? d.target.y + margin.right : d.target.y - nr - PAD;
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
  // ASSET SVG DRAWING
  // ============================================================================
  function drawAssets() {
    if (!assetsSvgEl || !displayData) return;
    const svg = d3.select(assetsSvgEl);
    svg.selectAll('*').remove();

    const groups = displayProjectGroups;
    if (groups.length === 0) return;

    const rowH = 22;
    const unitR = 6;
    const labelX = 28;
    const svgWidth = 500;
    const totalHeight = groups.length * rowH + 10;

    svg.attr('width', svgWidth).attr('height', totalHeight);

    const g = svg.append('g').attr('transform', 'translate(0, 5)');

    groups.forEach((proj, i) => {
      const y = i * rowH + rowH / 2;
      const row = g
        .append('g')
        .attr('class', 'asset-row')
        .attr('data-project-id', proj.projectID)
        .attr('transform', `translate(0, ${y})`);

      // Hover background
      row
        .append('rect')
        .attr('x', -5)
        .attr('y', -rowH / 2 + 2)
        .attr('width', svgWidth)
        .attr('height', rowH - 4)
        .attr('rx', 4)
        .style('fill', 'transparent')
        .style('cursor', 'pointer')
        .on('mouseover', function () {
          d3.select(this).style('fill', `${colors.midnightGreen}0F`);
          // Cross-highlight tree
          if (treeSvgEl) {
            const treeSvg = d3.select(treeSvgEl);
            // Find tree leaf matching this project
            treeSvg
              .selectAll('.node-mark')
              .transition()
              .duration(100)
              .style('opacity', 0.15);
            treeSvg
              .selectAll('path')
              .transition()
              .duration(100)
              .style('opacity', 0.05);
          }
        })
        .on('mouseout', function () {
          d3.select(this).style('fill', 'transparent');
          if (treeSvgEl) {
            const treeSvg = d3.select(treeSvgEl);
            treeSvg.selectAll('.node-mark').transition().duration(200).style('opacity', 1);
            treeSvg.selectAll('path').transition().duration(200).style('opacity', 1);
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
          .style('mix-blend-mode', 'multiply');

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

      const labelG = row.append('g').attr('transform', `translate(${labelX}, 0)`);

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

    <!-- FILTER FOOTER (summary tables) -->
    <div class="chart-footer">
      <div class="summary-section">
        <p class="subtitle">By Location</p>
        <div class="summary-table">
          {#each [...(displaySummary?.byCountry || summary.byCountry)] as [country, data]}
            {@const isActive = activeFilter?.field === 'country' && activeFilter?.value === country}
            {@const isFaded =
              isFiltered && activeFilter?.field === 'country' && activeFilter?.value !== country}
            <div
              class="summary-row"
              class:active={isActive}
              class:faded={isFaded}
              role="button"
              tabindex="0"
              onclick={() => applyFilter('country', country)}
              onkeydown={(e) => e.key === 'Enter' && applyFilter('country', country)}
            >
              {country} ({data.assetCount})
            </div>
          {/each}
        </div>
      </div>

      <div class="summary-section">
        <p class="subtitle">By Type</p>
        <div class="summary-table">
          {#each [...(displaySummary?.byType || summary.byType)] as [type, data]}
            {@const isActive =
              activeFilter?.field === 'asset_type' && activeFilter?.value === type}
            {@const isFaded =
              isFiltered && activeFilter?.field === 'asset_type' && activeFilter?.value !== type}
            <div
              class="summary-row"
              class:active={isActive}
              class:faded={isFaded}
              role="button"
              tabindex="0"
              onclick={() => applyFilter('asset_type', type)}
              onkeydown={(e) => e.key === 'Enter' && applyFilter('asset_type', type)}
            >
              {type} ({data.assetCount})
            </div>
          {/each}
        </div>
      </div>

      <div class="summary-section">
        <p class="subtitle">By Status</p>
        <div class="summary-table">
          {#each [...(displaySummary?.byStatus || summary.byStatus)] as [status, data]}
            {@const isActive =
              activeFilter?.field === 'operating_status' && activeFilter?.value === status}
            {@const isFaded =
              isFiltered &&
              activeFilter?.field === 'operating_status' &&
              activeFilter?.value !== status}
            <div
              class="summary-row"
              class:active={isActive}
              class:faded={isFaded}
              role="button"
              tabindex="0"
              onclick={() => applyFilter('operating_status', status)}
              onkeydown={(e) => e.key === 'Enter' && applyFilter('operating_status', status)}
            >
              {status} ({data.assetCount})
            </div>
          {/each}
        </div>
      </div>

      <div class="summary-section">
        <p class="subtitle">Intermediaries</p>
        <div class="summary-table">
          {#each intermediaries as inter}
            <div class="summary-row">
              {inter.name} ({inter.assetCount})
            </div>
          {/each}
        </div>
      </div>
    </div>

    {#if isFiltered}
      <button class="clear-filter" onclick={clearFilter}>
        Clear filter: {activeFilter?.value}
      </button>
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
    align-items: start;
    gap: var(--space-10);
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
    font-size: var(--font-size-sm);
    padding: 2px var(--space-1);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--duration-fast) ease;
  }
  .summary-row:hover {
    background: rgba(255, 255, 255, 0.15);
  }
  .summary-row.active {
    background: rgba(157, 247, 229, 0.25);
    font-weight: var(--font-weight-bold);
  }
  .summary-row.faded {
    opacity: 0.25;
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
  .clear-filter {
    display: block;
    margin: var(--space-3) auto;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--gem-navy);
    border-radius: var(--radius-full);
    background: var(--color-bg-primary);
    color: var(--gem-navy);
    font-size: var(--font-size-xs);
    cursor: pointer;
    font-family: inherit;
    font-weight: var(--font-weight-medium);
    transition: background var(--duration-fast) ease;
  }
  .clear-filter:hover {
    background: var(--color-bg-tertiary);
  }
</style>
