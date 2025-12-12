<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { page } from '$app/stores';
  import { fetchAssetBasics, fetchOwnerPortfolio } from '$lib/component-data/schema';
  import { colors, colorByStatus } from '$lib/ownership-theme';

  // Layout/display props only
  let {
    assetClassName = 'assets',
    colField = 'Status',
    includeUnitNames = false,
  } = $props();

  // Internal state for fetched data
  let spotlightOwner = $state(null);
  let subsidiariesMatched = $state(new Map());
  let directlyOwned = $state([]);
  let assets = $state([]);
  let entityMap = $state(new Map());
  let matchedEdges = $state(new Map());
  let projectNames = $state(new Map());
  let loading = $state(true);
  let error = $state(null);

  // Fetch portfolio data
  async function hydratePortfolio() {
    try {
      loading = true;
      error = null;

      const pageData = get(page);
      const assetId = pageData.params?.id;
      const pathname = pageData.url?.pathname || '';

      let ownerId = null;
      if (pathname.includes('/asset/')) {
        const basics = await fetchAssetBasics(assetId);
        if (basics?.ownerEntityId) {
          ownerId = basics.ownerEntityId;
        } else {
          throw new Error('Owner entity not found for asset');
        }
      } else if (pathname.includes('/entity/')) {
        ownerId = assetId;
      }

      if (!ownerId) {
        throw new Error('No owner ID available');
      }

      const portfolio = await fetchOwnerPortfolio(ownerId);
      if (!portfolio) {
        throw new Error('Failed to load owner portfolio');
      }

      spotlightOwner = portfolio.spotlightOwner;
      subsidiariesMatched = portfolio.subsidiariesMatched;
      directlyOwned = portfolio.directlyOwned;
      assets = portfolio.assets;
      entityMap = portfolio.entityMap;
      matchedEdges = portfolio.matchedEdges;

      // Build project names map
      const namesMap = new Map();
      portfolio.assets.forEach((a) => {
        if (a.id && a.name) namesMap.set(a.id, { name: a.name });
      });
      projectNames = namesMap;
    } catch (err) {
      console.error('[OwnershipChart] load error', err);
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    hydratePortfolio();
  });

  // Layout params
  const params = {
    svgMarginTop: 60,
    subsidX: 180,
    assetsX: 420,
    assetMarkHeight: 28,
    assetSpacing: 4,
    subsidiaryMarkHeight: 50,
    groupSpacing: 20,
  };

  // Build subsidiary groups data
  let subsidiaryGroups = $derived.by(() => {
    const groups = Array.from(subsidiariesMatched).map(([id, assets]) => ({
      id,
      assets,
      isDirect: false,
    }));
    if (directlyOwned.length > 0) {
      groups.push({ id: null, assets: directlyOwned, isDirect: true });
    }
    return groups;
  });

  // Calculate Y positions for each group
  let groupYs = $derived.by(() => {
    const ys = [];
    let currentY = 0;
    for (const group of subsidiaryGroups) {
      const height = Math.max(
        params.subsidiaryMarkHeight,
        group.assets.length * (params.assetMarkHeight + params.assetSpacing)
      );
      ys.push({ top: currentY, height });
      currentY += height + params.groupSpacing;
    }
    return ys;
  });

  // SVG height
  let svgHeight = $derived(
    groupYs.reduce((acc, g) => acc + g.height + params.groupSpacing, 0) + params.svgMarginTop
  );

  // Color legend from status colors
  let colLegend = $derived.by(() => {
    const legendMap = new Map();
    for (const asset of assets) {
      const status = asset[colField];
      const color = colorByStatus.get(status?.toLowerCase?.()) || colors.grey;
      if (!legendMap.has(color)) {
        legendMap.set(color, { descript: status || 'Unknown' });
      }
    }
    return Array.from(legendMap.entries());
  });

  // Generate path from owner box to subsidiary
  function subsidiaryPath(start, targetY, targetX) {
    const [x1, y1] = start;
    const midX = x1 + (targetX - x1) / 2;
    return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${targetY}, ${targetX} ${targetY}`;
  }

  // Generate bracket path for asset grouping
  function bracketPath(start, height, indent) {
    const [x, y] = start;
    const halfH = height / 2;
    return `M ${x} ${y - halfH} C ${x + indent} ${y - halfH}, ${x + indent} ${y}, ${x + indent * 0.8} ${y} M ${x + indent * 0.8} ${y} C ${x + indent} ${y}, ${x + indent} ${y + halfH}, ${x} ${y + halfH}`;
  }

  // Generate arc path for ownership percentage pie
  function arcPath(value, radius) {
    const pct = (value || 100) / 100;
    const endAngle = 2 * Math.PI * pct;
    const largeArc = endAngle > Math.PI ? 1 : 0;
    const x1 = 0;
    const y1 = -radius;
    const x2 = radius * Math.sin(endAngle);
    const y2 = -radius * Math.cos(endAngle);
    if (pct >= 1) {
      return `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius}`;
    }
    return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }

  // Get asset color
  function getAssetColor(asset) {
    const status = asset[colField];
    return colorByStatus.get(status?.toLowerCase?.()) || colors.grey;
  }

  // Hover state
  let hoverData = $state(null);

  // Wrap text helper (simplified - splits on spaces)
  function wrapText(text, maxChars = 24) {
    if (!text || text.length <= maxChars) return [text || ''];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      if ((currentLine + ' ' + word).trim().length <= maxChars) {
        currentLine = (currentLine + ' ' + word).trim();
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 2);
  }
</script>

<div id="chart-container" class="ownership-chart">
  {#if loading}
    <div class="loading-state">Loading owner portfolio...</div>
  {:else if error}
    <div class="error-state">{error}</div>
  {:else}
    <!-- Header: owner card + legend -->
    <div class="chart-header">
    <div class="owner-card">{spotlightOwner?.Name || 'Unknown Owner'}</div>
    <div class="legend">
      <div class="legend-summary">
        {assets.length}
        {assetClassName} via {subsidiariesMatched.size} direct subsidiaries
      </div>
      <div class="legend-items">
        {#each colLegend as [color, info]}
          <div class="legend-item">
            <div class="legend-bubble" style:background-color={color}></div>
            <div>{info.descript}</div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- Main SVG -->
  <svg width="900" height={svgHeight + params.svgMarginTop * 2}>
    <g transform="translate(0, {params.svgMarginTop})">
      <!-- Paths from owner box to subsidiaries -->
      {#each groupYs as groupY}
        <path
          d={subsidiaryPath(
            [20, -params.svgMarginTop],
            groupY.top + groupY.height / 2 + params.svgMarginTop,
            params.subsidX - 20 - params.subsidiaryMarkHeight / 2
          )}
          fill="none"
          stroke={colors.navy}
          stroke-width="1.5"
        />
      {/each}

      <!-- Subsidiary groups -->
      {#each subsidiaryGroups as group, i}
        {@const groupY = groupYs[i]}
        {@const entityData = entityMap.get(group.id)}
        {@const edgeData = matchedEdges.get(group.id)}
        <g transform="translate({params.subsidX}, {groupY.top})">
          <!-- Subsidiary circle (not for direct ownership) -->
          {#if group.id != null}
            <circle
              cx="0"
              cy={groupY.height / 2}
              r={params.subsidiaryMarkHeight / 2}
              fill={colors.navy}
              fill-opacity="0.1"
              stroke={colors.navy}
              stroke-width="2"
              class="subsidiary-circle"
              onmouseenter={() => (hoverData = { ...group, entityData, edgeData })}
              onmouseleave={() => (hoverData = null)}
            />

            <!-- Ownership percentage pie -->
            <g transform="translate(0, {groupY.height / 2})">
              <path
                d={arcPath(edgeData?.value, params.subsidiaryMarkHeight / 2 - 1)}
                fill={edgeData?.value ? colors.navy : '#B9B9B9'}
                class="ownership-pie"
              />
            </g>
          {/if}

          <!-- Subsidiary name -->
          <text
            y={groupY.height / 2 - 5}
            x={params.subsidiaryMarkHeight / 2 + 5}
            fill={colors.navy}
            class="subsidiary-name"
          >
            {#each wrapText(entityData?.Name || (group.isDirect ? 'Directly owned' : 'Unknown')) as line, j}
              <tspan x={params.subsidiaryMarkHeight / 2 + 5} dy={j === 0 ? 0 : 14}>{line}</tspan>
            {/each}
          </text>

          <!-- Line from subsidiary to assets -->
          <line
            y1={groupY.height / 2}
            y2={groupY.height / 2}
            x1={group.id == null
              ? -params.subsidiaryMarkHeight / 2
              : params.subsidiaryMarkHeight / 2}
            x2={params.assetsX - params.subsidX - 40}
            stroke={colors.navy}
            stroke-width="1"
          />

          <!-- Bracket for multiple assets -->
          {#if group.assets.length > 1}
            <path
              d={bracketPath(
                [params.assetsX - params.subsidX - 40, groupY.height / 2],
                groupY.height,
                20
              )}
              fill="none"
              stroke={colors.navy}
              stroke-width="1"
            />
          {/if}

          <!-- Asset circles and names -->
          {#each group.assets as asset, j}
            {@const assetY =
              (j + 0.5) *
                (group.assets.length === 1 ? params.subsidiaryMarkHeight : params.assetMarkHeight) +
              j * params.assetSpacing}
            <g
              transform="translate({params.assetsX - params.subsidX}, {assetY})"
              class="asset-group"
              onmouseenter={() => (hoverData = asset)}
              onmouseleave={() => (hoverData = null)}
            >
              <circle
                r={params.assetMarkHeight / 2}
                fill={getAssetColor(asset)}
                class="asset-circle"
              />
              <text y="5" x={params.assetMarkHeight} class="asset-name">
                {includeUnitNames ? asset.name : projectNames.get(asset.id)?.name || asset.name}
              </text>
            </g>
          {/each}
        </g>
      {/each}
    </g>
  </svg>

  <!-- Additional assets info -->
  {#if spotlightOwner}
    <div class="additional-assets">
      {spotlightOwner.Name} has stakes in additional assets identified in the Global Energy Ownership
      Trackers
    </div>
  {/if}

  <!-- Hover tooltip -->
  {#if hoverData}
    <div class="tooltip">
      {#if hoverData.entityData}
        <strong>{hoverData.entityData.Name}</strong>
        {#if hoverData.edgeData?.value}
          <br /><span class="ownership-pct">{hoverData.edgeData.value}% ownership</span>
        {/if}
      {:else if hoverData.name}
        <strong>{hoverData.name}</strong>
        {#if hoverData.Status}
          <br /><span class="status">{hoverData.Status}</span>
        {/if}
      {/if}
    </div>
  {/if}
  {/if}
</div>

<style>
  .loading-state,
  .error-state {
    padding: 60px 20px;
    text-align: center;
    font-size: 13px;
  }

  .loading-state {
    color: #666;
  }

  .error-state {
    color: #b10000;
  }

  .ownership-chart {
    position: relative;
    font-family: Georgia, serif;
  }

  .chart-header {
    display: flex;
    gap: 30px;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .owner-card {
    background: var(--navy, #004a63);
    color: white;
    padding: 12px 20px;
    font-size: 16px;
    font-weight: bold;
    min-width: 200px;
  }

  .legend {
    font-size: 12px;
  }

  .legend-summary {
    margin-bottom: 8px;
    color: #666;
  }

  .legend-items {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .legend-bubble {
    width: 12px;
    height: 12px;
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
    fill-opacity: 0.2;
  }

  .ownership-pie {
    pointer-events: none;
  }

  .subsidiary-name {
    font-size: 11px;
    font-family: Georgia, serif;
  }

  .asset-group {
    cursor: pointer;
  }

  .asset-circle {
    transition: r 0.15s;
  }

  .asset-group:hover .asset-circle {
    r: 16;
  }

  .asset-name {
    font-size: 11px;
    font-family: Georgia, serif;
    fill: #333;
  }

  .additional-assets {
    margin-top: 20px;
    font-size: 12px;
    color: #666;
    font-style: italic;
  }

  .tooltip {
    position: absolute;
    bottom: 10px;
    right: 10px;
    background: white;
    border: 1px solid #004a63;
    padding: 10px 14px;
    font-size: 12px;
    max-width: 250px;
    pointer-events: none;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
  }

  .tooltip .ownership-pct {
    color: #004a63;
    font-weight: bold;
  }

  .tooltip .status {
    color: #666;
    text-transform: capitalize;
  }
</style>
