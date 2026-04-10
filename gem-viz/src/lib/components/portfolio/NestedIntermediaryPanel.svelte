<script>
  /**
   * Compact recursive drill-down panel for PortfolioExplorer intermediaries.
   * Fetches the ownership graph for a given entity and renders a mini
   * tree + assets chart along with its own sub-intermediaries (each expandable).
   * Uses <svelte:self> to nest arbitrarily deep.
   */
  import * as d3 from 'd3-selection';
  import * as d3Array from 'd3-array';
  import * as d3Hierarchy from 'd3-hierarchy';
  import * as d3Shape from 'd3-shape';
  import { drawMolecule, computeMoleculeRadii } from '$lib/components/ownership/molecule-renderer';
  import { colors, trackerColorMap, ownershipColors } from '$lib/design-tokens';
  import NestedIntermediaryPanel from './NestedIntermediaryPanel.svelte';

  let { entityId, API_BASE, matchedAssetIds = undefined } = $props();

  // ============================================================================
  // CONSTANTS
  // ============================================================================
  const COMPACT_HEIGHT = 200;
  const ASSET_MARK_H = 40;
  const treeParams = { rowHeight: 28, siblingSeparation: 1.0, cousinSeparation: 1.4, nodeRadius: 5 };

  // ============================================================================
  // STATE
  // ============================================================================
  let loading = $state(false);
  let error = $state('');
  let apiData = $state(null);
  let summary = $state(null);
  let projectGroups = $state([]);
  let intermediaries = $state([]);
  let expandedSubIds = $state(new Set());

  let treeSvgEl = $state(null);
  let assetsSvgEl = $state(null);
  let treeRoot = $state(null);

  /** When matchedAssetIds is provided, filter project groups to only matched units */
  let displayProjectGroups = $derived.by(() => {
    if (!matchedAssetIds || matchedAssetIds.size === 0) return projectGroups;
    return projectGroups
      .map((pg) => ({ ...pg, units: pg.units.filter((u) => matchedAssetIds.has(u.asset_id)) }))
      .filter((pg) => pg.units.length > 0);
  });

  let nRowsFit = $derived(Math.max(4, Math.floor(COMPACT_HEIGHT / ASSET_MARK_H)));
  let showTree = $derived(displayProjectGroups.length > 0 && displayProjectGroups.length <= nRowsFit);

  // ============================================================================
  // DATA PROCESSING (pure functions mirroring PortfolioExplorer)
  // ============================================================================
  function summarizeAssets(assets) {
    function getStats(v) {
      return {
        assetCount: new Set(v.map((d) => d.location_id || d.asset_id)).size,
        unitCount: new Set(v.map((d) => d.asset_id)).size,
        types: new Set(v.map((d) => d.asset_type)),
      };
    }
    const total = getStats(assets);
    const byCountry = new Map(
      [...d3Array.rollup(assets, getStats, (d) => d.country || 'Unknown')].sort(
        (a, b) => b[1].assetCount - a[1].assetCount
      )
    );
    const byType = new Map(
      [...d3Array.rollup(assets, getStats, (d) => d.asset_type || 'Unknown')].sort(
        (a, b) => b[1].assetCount - a[1].assetCount
      )
    );
    const byStatus = new Map(
      [...d3Array.rollup(assets, getStats, (d) => d.operating_status || 'Unknown')].sort(
        (a, b) => b[1].assetCount - a[1].assetCount
      )
    );
    return { total, byCountry, byType, byStatus };
  }

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

  function makeTreePaths(graph, rootEntityId, groups) {
    const { nodes, edges } = graph;
    const projectIds = new Set(groups.map((g) => g.projectID));
    const childrenOf = new Map();
    for (const e of edges) {
      if (!childrenOf.has(e.source)) childrenOf.set(e.source, []);
      childrenOf.get(e.source).push(e.target);
    }
    const assetToProject = new Map();
    for (const n of nodes) {
      if (n.node_type === 'asset') {
        const projId = n.location_id || n.unit_id || n.asset_id;
        assetToProject.set(n.asset_id, projId);
      }
    }
    const paths = [];
    const pathStrings = [];
    const visited = new Set();
    function dfs(nodeId, path) {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const children = childrenOf.get(nodeId) || [];
      if (children.length === 0) {
        const projId = assetToProject.get(nodeId) || nodeId;
        if (projectIds.has(projId) || projectIds.has(nodeId)) {
          const fullPath = [...path, projId];
          paths.push({ path: fullPath });
          pathStrings.push(fullPath.join('/'));
        }
        visited.delete(nodeId);
        return;
      }
      for (const child of children) {
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
    return { paths, pathStrings: [...new Set(pathStrings)] };
  }

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
        };
      })
      .filter((e) => e.assetCount > 0)
      .sort((a, b) => b.assetCount - a.assetCount);
  }

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
    function prune(node) {
      node.children = node.children.filter((c) => {
        prune(c);
        return c.children.length > 0 || validLeafIds.has(c.name);
      });
    }
    prune(root);
    return root.children.length === 1 ? root.children[0] : root;
  }

  // ============================================================================
  // DATA FETCH
  // ============================================================================
  async function fetchData() {
    loading = true;
    error = '';
    apiData = null;
    summary = null;
    projectGroups = [];
    intermediaries = [];
    try {
      const resp = await fetch(
        `${API_BASE}/ownership/graph?root=${encodeURIComponent(entityId)}&direction=down&format=json`
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
      const groups = makeProjectGroups(assets);
      const treePaths = makeTreePaths({ nodes: data.nodes, edges }, spotlightOwner.entity_id, groups);
      const interData = computeIntermediaries(entities, treePaths, spotlightOwner.entity_id);
      apiData = { spotlightOwner, assets, entities, edges, nodes: data.nodes };
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
  // D3 TREE
  // ============================================================================
  function drawTree() {
    if (!treeSvgEl || !apiData || !showTree) {
      treeRoot = null;
      return;
    }
    const svg = d3.select(treeSvgEl);
    svg.selectAll('*').interrupt().remove();

    const treePaths = makeTreePaths(
      { nodes: apiData.nodes, edges: apiData.edges },
      apiData.spotlightOwner.entity_id,
      displayProjectGroups
    );
    if (treePaths.pathStrings.length === 0) return;

    const validLeafIds = new Set(displayProjectGroups.map((g) => g.projectID));
    const hierData = buildHierarchy(treePaths.pathStrings, validLeafIds);
    const root = d3Hierarchy.hierarchy(hierData);

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
    const calcHeight = Math.max(contentHeight, COMPACT_HEIGHT);

    const margin = { left: 80, top: 20, right: 20, bottom: 20 };
    const width = 240 - margin.left - margin.right;
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

    const intermediaryNodes = root.descendants().filter((d) => d.children);
    const nodeMap = new Map((apiData.nodes || []).map((n) => [n.entity_id || n.asset_id, n]));
    const edgeLookup = new Map((apiData.edges || []).map((e) => [e.target, e]));

    intermediaryNodes.forEach((d) => {
      const entity = nodeMap.get(d.data.name);
      d.entityName = entity ? entity.name || entity.full_name : d.data.name;
      const edge = edgeLookup.get(d.data.name);
      d.ownershipPct =
        edge && typeof edge.value === 'number' ? Math.max(0, Math.min(1, edge.value / 100)) : 1;
    });

    const PAD = 3;
    const nr = treeParams.nodeRadius;

    const linkGroup = g.append('g').attr('class', 'link-group');
    linkGroup
      .selectAll('path')
      .data(root.links())
      .join('path')
      .attr('d', (d) => {
        const isLeaf = !d.target.children;
        const xS = d.source.y + nr + PAD;
        const yS = d.source.x;
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

    const nodeGroup = g.append('g').attr('class', 'node-group');
    const marks = nodeGroup
      .selectAll('g.node-mark')
      .data(intermediaryNodes)
      .join('g')
      .attr('class', 'node-mark')
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    marks
      .append('circle')
      .attr('cx', (d) => (d.depth === 0 ? -nr : 0))
      .attr('r', (d) => (d.depth === 0 ? nr * 2 : nr))
      .style('fill', ownershipColors.treeNodeFill);

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
        return name.length > 18 ? name.slice(0, 16) + '…' : name;
      });

    marks
      .on('mouseover', function (_, d) {
        const activeNodes = new Set([...d.ancestors(), ...d.descendants()]);
        marks.transition('fade').duration(100).style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));
        linkGroup
          .selectAll('path')
          .transition('fade')
          .duration(100)
          .style('opacity', (l) =>
            activeNodes.has(l.source) && activeNodes.has(l.target) ? 1 : 0.05
          );
        labels
          .selectAll('text')
          .filter((n) => n.depth > 0)
          .transition('fade')
          .duration(100)
          .style('opacity', (n) => (d.entityName === n.entityName ? 1 : 0));
        if (assetsSvgEl) {
          const leafNames = new Set(d.leaves().map((l) => l.data.name));
          d3.select(assetsSvgEl)
            .selectAll('.asset-row')
            .transition('fade')
            .duration(100)
            .style('opacity', function () {
              return leafNames.has(this.getAttribute('data-project-id')) ? 1 : 0.15;
            });
        }
      })
      .on('mouseout', function () {
        marks.transition('fade').duration(200).style('opacity', 1);
        linkGroup.selectAll('path').transition('fade').duration(200).style('opacity', 1);
        labels
          .selectAll('text')
          .filter((n) => n.depth > 0)
          .transition('fade')
          .duration(200)
          .style('opacity', 0);
        if (assetsSvgEl)
          d3.select(assetsSvgEl)
            .selectAll('.asset-row')
            .transition('fade')
            .duration(200)
            .style('opacity', 1);
      });

    treeRoot = root;
  }

  // ============================================================================
  // D3 ASSETS
  // ============================================================================
  function drawAssets() {
    if (!assetsSvgEl || !apiData) return;
    const svg = d3.select(assetsSvgEl);
    svg.selectAll('*').interrupt().remove();

    const groups = displayProjectGroups;
    if (groups.length === 0) return;

    const unitR = 10;
    const labelX = 34;
    const nRows = Math.max(4, Math.floor(COMPACT_HEIGHT / ASSET_MARK_H));
    const nProjects = groups.length;
    const colsNeeded = Math.ceil(nProjects / nRows);
    const colWidth = 240;
    const svgWidthNeeded = colsNeeded * colWidth;
    const isSingleColumn = nProjects <= nRows;

    const leafYMap = new Map();
    if (isSingleColumn && showTree && treeRoot) {
      for (const leaf of treeRoot.leaves()) leafYMap.set(leaf.data.name, leaf.x);
    }

    const margin = { top: 20, left: 20 };
    let totalHeight;
    if (isSingleColumn && leafYMap.size > 0) {
      totalHeight = Math.max(...leafYMap.values()) + margin.top + 30;
    } else {
      totalHeight = Math.min(nProjects, nRows) * ASSET_MARK_H + margin.top + 10;
    }

    svg.attr('width', svgWidthNeeded + margin.left).attr('height', totalHeight);
    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);

    groups.forEach((proj, i) => {
      const col = Math.floor(i / nRows);
      const rowInCol = i % nRows;
      const x = col * colWidth;
      const y =
        isSingleColumn && leafYMap.has(proj.projectID)
          ? leafYMap.get(proj.projectID)
          : rowInCol * ASSET_MARK_H + ASSET_MARK_H / 2;

      const row = g
        .append('g')
        .attr('class', 'asset-row')
        .attr('data-project-id', proj.projectID)
        .attr('transform', `translate(${x}, ${y})`);

      row
        .append('rect')
        .attr('x', -(ASSET_MARK_H / 2))
        .attr('y', -18)
        .attr('width', colWidth - 10)
        .attr('height', 36)
        .attr('rx', 5)
        .style('fill', 'white')
        .style('cursor', 'default')
        .style('pointer-events', 'all')
        .on('mouseover', function () {
          d3.select(this).style('fill', '#f4f9fa');
          g.selectAll('.asset-row')
            .transition('fade')
            .duration(100)
            .style('opacity', function () {
              return this.getAttribute('data-project-id') === proj.projectID ? 1 : 0.12;
            });
          if (treeSvgEl && treeRoot) {
            const treeSvg = d3.select(treeSvgEl);
            const assetLeaf = treeRoot.leaves().find((l) => l.data.name === proj.projectID);
            if (assetLeaf) {
              const activeNodes = new Set([...assetLeaf.ancestors()]);
              treeSvg
                .selectAll('.node-mark')
                .transition('fade')
                .duration(100)
                .style('opacity', (n) => (activeNodes.has(n) ? 1 : 0.15));
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
          g.selectAll('.asset-row').transition('fade').duration(200).style('opacity', 1);
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

      const N = proj.units.length;
      const { ringRadius: molRingR, unitRadius: molUnitR } = computeMoleculeRadii(
        ASSET_MARK_H - 4,
        N,
        { maxUnitRadius: unitR }
      );
      const moleculeUnits = proj.units.map((unit) => ({
        color: trackerColorMap.get(unit.asset_type) || colors.grey,
        ownershipPct: unit.ownership_share,
      }));
      const moleculeG = row.append('g').attr('transform', `translate(${unitR},0)`);
      drawMolecule(moleculeG, moleculeUnits, { ringRadius: molRingR, unitRadius: molUnitR });

      const name =
        proj.units[0]?.project_name || proj.units[0]?.asset_name || proj.projectID;
      row
        .append('g')
        .attr('transform', `translate(${labelX}, 0)`)
        .style('pointer-events', 'none')
        .append('text')
        .attr('dy', '0.35em')
        .style('font-size', '11px')
        .style('fill', colors.navy)
        .style('font-family', "var(--font-family, 'Plus Jakarta Sans', sans-serif)")
        .text(name.length > 28 ? name.slice(0, 26) + '…' : name);
    });
  }

  // ============================================================================
  // REACTIVITY
  // ============================================================================
  $effect(() => {
    if (entityId) fetchData();
  });

  $effect(() => {
    const _data = apiData;
    const _groups = displayProjectGroups;
    const _showTree = showTree;
    if (_data && _groups.length > 0) {
      queueMicrotask(() => {
        drawTree();
        drawAssets();
      });
    }
  });

  function toggleSub(subEntityId) {
    const next = new Set(expandedSubIds);
    if (next.has(subEntityId)) next.delete(subEntityId);
    else next.add(subEntityId);
    expandedSubIds = next;
  }
</script>

<div class="nested-panel">
  {#if loading}
    <div class="nested-loading">Loading…</div>
  {:else if error}
    <div class="nested-error">{error}</div>
  {:else if apiData && summary}
    <!-- Compact header -->
    <div class="nested-header">
      <span class="nested-name">
        {apiData.spotlightOwner.name || apiData.spotlightOwner.full_name}
      </span>
      <span class="nested-count">
        {displayProjectGroups.length} asset{displayProjectGroups.length !== 1 ? 's' : ''}
        {#if matchedAssetIds && displayProjectGroups.length < summary.total.assetCount}
          <span class="nested-count-filtered">(filtered from {summary.total.assetCount})</span>
        {/if}
      </span>
    </div>

    <!-- Compact chart: tree + assets -->
    <div class="nested-chart-row">
      {#if showTree}
        <div class="nested-tree-container">
          <svg bind:this={treeSvgEl}></svg>
        </div>
      {/if}
      <div class="nested-assets-container" class:full-width={!showTree}>
        <svg bind:this={assetsSvgEl}></svg>
      </div>
    </div>

    <!-- Sub-intermediaries -->
    {#if intermediaries.length > 0}
      <div class="nested-subs">
        <p class="nested-subtitle">Intermediaries</p>
        {#each intermediaries as inter}
          <div class="nested-sub-row">
            <button
              class="nested-foldout-btn"
              class:expanded={expandedSubIds.has(inter.entity_id)}
              onclick={() => toggleSub(inter.entity_id)}
              title="Expand {inter.name}"
            >
              {expandedSubIds.has(inter.entity_id) ? '▼' : '▶'}
            </button>
            <span class="nested-sub-name">{inter.name}</span>
            <span class="nested-sub-count">({inter.assetCount})</span>
          </div>
          {#if expandedSubIds.has(inter.entity_id)}
            <div class="nested-sub-panel">
              <NestedIntermediaryPanel entityId={inter.entity_id} {API_BASE} />
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .nested-panel {
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    background: var(--color-bg-primary, #fff);
    border-left: 3px solid var(--gem-teal, #007b7f);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
    overflow: hidden;
  }

  .nested-loading,
  .nested-error {
    padding: var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  .nested-error {
    color: var(--color-error, #7f142a);
  }

  .nested-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--gem-navy, #1d4961);
    color: white;
  }

  .nested-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
  }

  .nested-count {
    font-size: var(--font-size-xs);
    color: rgba(255, 255, 255, 0.7);
  }

  .nested-count-filtered {
    opacity: 0.55;
    font-style: italic;
  }

  .nested-chart-row {
    display: flex;
    overflow-x: auto;
    min-height: 60px;
    max-height: 280px;
    background: var(--color-bg-primary, #fff);
  }

  .nested-tree-container {
    flex-shrink: 0;
    position: sticky;
    left: 0;
    z-index: 1;
    background: var(--color-bg-primary, #fff);
  }

  .nested-tree-container svg,
  .nested-assets-container svg {
    overflow: visible;
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
  }

  .nested-assets-container {
    flex: 1;
    padding-left: var(--space-2);
  }

  .nested-assets-container.full-width {
    width: 100%;
  }

  .nested-subs {
    padding: var(--space-2) var(--space-4);
    background: var(--gem-navy, #1d4961);
    color: white;
  }

  .nested-subtitle {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-weight: var(--font-weight-medium);
    color: var(--gem-mint, #9df7e5);
    margin: 0 0 var(--space-1);
  }

  .nested-sub-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 2px 0;
    font-size: var(--font-size-sm);
  }

  .nested-foldout-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    padding: 0 var(--space-1);
    font-size: 9px;
    line-height: 1;
    transition: color var(--duration-fast) ease;
    font-family: inherit;
  }

  .nested-foldout-btn:hover,
  .nested-foldout-btn.expanded {
    color: var(--gem-mint, #9df7e5);
  }

  .nested-sub-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nested-sub-count {
    color: rgba(255, 255, 255, 0.55);
    font-size: var(--font-size-xs);
    flex-shrink: 0;
  }

  .nested-sub-panel {
    margin-left: var(--space-4);
    margin-bottom: var(--space-2);
  }
</style>
