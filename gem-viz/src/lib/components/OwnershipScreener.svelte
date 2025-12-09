<script>
  import {
    colors,
    colorByTracker,
    colorByStatus,
    colorByStatusProspective,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
  } from '$lib/ownership-theme';
  import OwnershipPie from './OwnershipPie.svelte';

  // Props
  let {
    spotlightOwner = null,
    assets = [],
    subsidiaries = new Map(),
    directlyOwned = [],
    matchedEdges = new Map(),
    entityMap = new Map(),
    sortByOwnershipPct = true,
    includeUnitNames = false,
  } = $props();

  // Layout parameters
  let params = $state({
    subsidX: 120,
    assetsX: 380,
    yPadding: 30,
    assetSpacing: 8,
    assetMarkHeight: 16,
    subsidiaryMarkHeight: 30,
    svgMarginTop: 24,
    legendIconSize: 14,
  });

  // Hover state
  let hoverData = $state(null);

  // Determine color field and scheme based on data
  let colorField = $derived(new Set(assets.map((a) => a.tracker)).size > 1 ? 'tracker' : 'status');

  let colorScale = $derived(() => {
    if (colorField === 'tracker') {
      return colorByTracker;
    } else {
      // Check if all statuses are prospective
      const statuses = new Set(assets.map((a) => a.status?.toLowerCase()));
      const allProspective = Array.from(statuses).every((s) => prospectiveStatuses.includes(s));
      return allProspective ? colorByStatusProspective : colorByStatus;
    }
  });

  let legendData = $derived(() => {
    if (colorField === 'tracker') {
      const trackers = new Set(assets.map((a) => a.tracker));
      return Array.from(colorByTracker)
        .filter(([tracker]) => trackers.has(tracker))
        .map(([tracker, color]) => ({ color, label: tracker }));
    } else {
      const statuses = new Set(assets.map((a) => a.status?.toLowerCase()));
      const allProspective = Array.from(statuses).every((s) => prospectiveStatuses.includes(s));
      const sourceMap = allProspective ? statusColorsProspective : statusColors;
      return Array.from(sourceMap)
        .filter(([, { statuses: statusList }]) => statusList.some((s) => statuses.has(s)))
        .map(([col, { descript }]) => ({ color: col, label: descript }));
    }
  });

  // Build subsidiary groups with their assets
  let subsidiaryGroups = $derived(() => {
    let groups = Array.from(subsidiaries).map(([id, assetList]) => ({
      id,
      assets: assetList,
      name: entityMap.get(id)?.Name || id,
      ownershipPct: matchedEdges.get(id)?.value || null,
    }));

    // Sort by ownership percentage or asset count
    if (sortByOwnershipPct) {
      groups.sort((a, b) => (b.ownershipPct || 0) - (a.ownershipPct || 0));
    } else {
      groups.sort((a, b) => b.assets.length - a.assets.length);
    }

    // Add directly owned assets as a pseudo-group
    if (directlyOwned.length > 0) {
      groups.push({
        id: null,
        assets: directlyOwned,
        name: 'Directly owned',
        ownershipPct: null,
      });
    }

    return groups;
  });

  // Calculate vertical positions for each group
  let groupPositions = $derived(() => {
    let y = 0;
    return subsidiaryGroups().map((group) => {
      const assetCount = group.assets.length;
      const contentHeight =
        assetCount * params.assetMarkHeight + (assetCount - 1) * params.assetSpacing;
      const height = Math.max(contentHeight, params.subsidiaryMarkHeight);
      const top = y;
      y += height + params.yPadding;
      return { ...group, top, height };
    });
  });

  // Total SVG height
  let svgHeight = $derived(() => {
    const positions = groupPositions();
    if (positions.length === 0) return 100;
    const last = positions[positions.length - 1];
    return last.top + last.height + params.svgMarginTop;
  });

  // Get color for an asset
  function getAssetColor(asset) {
    const scale = colorScale();
    const value = colorField === 'tracker' ? asset.tracker : asset.status?.toLowerCase();
    return scale.get(value) || colors.grey;
  }

  // Text wrapping helper
  function wrapText(text, maxChars = 18) {
    if (!text || text.length <= maxChars) return [text];
    const breakPos = text.lastIndexOf(' ', maxChars);
    const splitAt = breakPos > 0 ? breakPos : maxChars;
    const line1 = text.slice(0, splitAt).trim();
    let line2 = text.slice(splitAt).trim();
    if (line2.length > maxChars) {
      line2 = line2.slice(0, maxChars - 1).trim() + '...';
    }
    return [line1, line2];
  }

  // Generate subsidiary path
  function subsidiaryPath(startY, endY, endX) {
    const startX = 20;
    const height = endY - startY;
    const width = endX - startX;
    const crvPct = 1;
    const lnPtn = [startX, startY + height * crvPct * 0.4];
    const ctlPt1 = [startX, startY + height * crvPct];
    const ctlPt2 = [startX + width * crvPct, endY];
    const endPnt = [endX, endY];
    return `M ${startX} ${startY} L ${lnPtn[0]} ${lnPtn[1]} C ${ctlPt1[0]} ${ctlPt1[1]}, ${ctlPt2[0]} ${ctlPt2[1]}, ${endPnt[0]} ${endPnt[1]}`;
  }

  // Generate bracket path
  function bracketPath(x, centerY, height, width = 20) {
    const crvPct = 0.7;
    const startPnt = [x + width, centerY - height / 2];
    const endPnt = [x + width, centerY + height / 2];
    const topCtlPt = [x + width * (1 - crvPct), centerY - height / 2];
    const midCtlPt = [x + width * crvPct, centerY];
    const bottomCtlPt = [x + width * (1 - crvPct), centerY + height / 2];
    return `M ${startPnt[0]} ${startPnt[1]} C ${topCtlPt[0]} ${topCtlPt[1]}, ${midCtlPt[0]} ${midCtlPt[1]}, ${x} ${centerY} C ${midCtlPt[0]} ${midCtlPt[1]}, ${bottomCtlPt[0]} ${bottomCtlPt[1]}, ${endPnt[0]} ${endPnt[1]}`;
  }
</script>

<div class="ownership-screener">
  <!-- Header: Spotlight Owner + Legend -->
  <div class="chart-header">
    {#if spotlightOwner}
      <div class="owner-card">
        {spotlightOwner.Name || spotlightOwner}
      </div>
    {/if}

    <div class="legend">
      <div class="legend-summary">
        {assets.length} assets via {subsidiaryGroups().length}
        {subsidiaryGroups().length === 1 ? 'path' : 'paths'}
      </div>
      <div class="legend-items">
        {#each legendData() as item}
          <div class="legend-item">
            <div class="legend-bubble" style="background-color: {item.color}"></div>
            <span>{item.label}</span>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Main SVG Chart -->
  <svg width="900" height={svgHeight() + params.svgMarginTop * 2}>
    <g transform="translate(0, {params.svgMarginTop})">
      <!-- Paths from header to subsidiaries -->
      {#each groupPositions() as group}
        <path
          d={subsidiaryPath(
            -params.svgMarginTop,
            group.top + group.height / 2 + params.svgMarginTop,
            params.subsidX - 20 - params.subsidiaryMarkHeight / 2
          )}
          fill="none"
          stroke={colors.navy}
        />
      {/each}

      <!-- Subsidiary groups -->
      {#each groupPositions() as group}
        <g transform="translate({params.subsidX}, {group.top})">
          <!-- Subsidiary circle (not for directly owned) -->
          {#if group.id !== null}
            <circle
              cx="0"
              cy={group.height / 2}
              r={params.subsidiaryMarkHeight / 2}
              fill="{colors.navy}1A"
              stroke={colors.navy}
              stroke-width="2"
              class="subsidiary-circle"
              onmouseenter={() => (hoverData = { type: 'subsidiary', ...group })}
              onmouseleave={() => (hoverData = null)}
            />

            <!-- Ownership percentage pie -->
            {#if group.ownershipPct}
              <g
                transform="translate({-params.subsidiaryMarkHeight / 2}, {group.height / 2 -
                  params.subsidiaryMarkHeight / 2})"
              >
                <OwnershipPie
                  percentage={group.ownershipPct}
                  size={params.subsidiaryMarkHeight}
                  fillColor={colors.navy}
                />
              </g>
            {/if}
          {/if}

          <!-- Subsidiary name -->
          <text
            y={group.height / 2 - 5}
            x={params.subsidiaryMarkHeight / 2 + 5}
            fill={colors.navy}
            font-size="12"
          >
            {#each wrapText(group.name) as line, j}
              <tspan x={params.subsidiaryMarkHeight / 2 + 5} dy={j === 0 ? 0 : '1.2em'}
                >{line}</tspan
              >
            {/each}
          </text>

          <!-- Horizontal line to assets -->
          <line
            y1={group.height / 2}
            y2={group.height / 2}
            x1={group.id === null
              ? -params.subsidiaryMarkHeight / 2
              : params.subsidiaryMarkHeight / 2}
            x2={params.assetsX - params.subsidX - 40}
            stroke={colors.navy}
          />

          <!-- Bracket to assets -->
          <path
            d={bracketPath(params.assetsX - params.subsidX - 40, group.height / 2, group.height)}
            fill="none"
            stroke={colors.navy}
          />

          <!-- Asset dots -->
          {#each group.assets as asset, j}
            {@const assetY =
              (j + 0.5) *
                (group.assets.length === 1 ? params.subsidiaryMarkHeight : params.assetMarkHeight) +
              j * params.assetSpacing}
            <g
              transform="translate({params.assetsX - params.subsidX}, {assetY})"
              class="asset-node"
              onmouseenter={() => (hoverData = { type: 'asset', ...asset })}
              onmouseleave={() => (hoverData = null)}
            >
              <circle r={params.assetMarkHeight / 2} fill={getAssetColor(asset)} />
              <text y="5" x={params.assetMarkHeight} font-size="12" fill={colors.navy}>
                {includeUnitNames ? asset.name : asset.projectName || asset.name}
              </text>
            </g>
          {/each}
        </g>
      {/each}
    </g>
  </svg>

  <!-- Hover tooltip -->
  {#if hoverData}
    <div class="tooltip">
      {#if hoverData.type === 'subsidiary'}
        <strong>{hoverData.name}</strong>
        {#if hoverData.ownershipPct}
          <br />Ownership: {hoverData.ownershipPct.toFixed(1)}%
        {/if}
        <br />{hoverData.assets.length} assets
      {:else if hoverData.type === 'asset'}
        <strong>{hoverData.name}</strong>
        <br />Status: {hoverData.status}
        <br />Tracker: {hoverData.tracker}
        {#if hoverData.country}
          <br />Country: {hoverData.country}
        {/if}
        {#if hoverData.spotlightOwnershipSharePct}
          <br />Share: {hoverData.spotlightOwnershipSharePct.toFixed(1)}%
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .ownership-screener {
    padding: 10px;
    background-color: var(--warm-white, #f2f2eb);
    color: var(--navy, #004a63);
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    position: relative;
  }

  .chart-header {
    display: flex;
    gap: 12px;
    margin-bottom: 10px;
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .owner-card {
    background: rgba(0, 74, 99, 0.13);
    border-radius: 0 10px 10px 10px;
    border: 1px solid var(--navy, #004a63);
    color: var(--navy, #004a63);
    padding: 10px 16px;
    font-weight: 600;
    font-size: 14px;
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .legend-summary {
    font-size: 12px;
    color: var(--navy, #004a63);
    opacity: 0.8;
  }

  .legend-items {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }

  .legend-bubble {
    width: 14px;
    height: 14px;
    border-radius: 50%;
  }

  svg {
    display: block;
  }

  .subsidiary-circle {
    cursor: pointer;
    transition: fill-opacity 0.15s;
  }

  .subsidiary-circle:hover {
    fill-opacity: 0.3;
  }

  .asset-node {
    cursor: pointer;
  }

  .asset-node circle {
    transition: r 0.15s;
  }

  .asset-node:hover circle {
    r: 10;
  }

  .tooltip {
    position: absolute;
    top: 10px;
    right: 10px;
    background: white;
    border: 1px solid var(--navy, #004a63);
    padding: 10px 14px;
    font-size: 11px;
    line-height: 1.4;
    max-width: 250px;
    z-index: 10;
  }

  .tooltip strong {
    font-size: 12px;
  }
</style>
