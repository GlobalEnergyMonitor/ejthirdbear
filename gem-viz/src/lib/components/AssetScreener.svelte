<script>
  /**
   * GEM Asset Screener Component
   * Ported from Observable notebook: 32dcab6db3a0f0b6
   *
   * Shows assets of selected asset classes for a spotlight owner,
   * with subsidiary groups, ownership percentages, and mini bar charts.
   *
   * DATA: fetchOwnerPortfolio(entityId) → OwnerPortfolio
   */
  import { goto } from '$app/navigation';
  import { assetLink, entityLink } from '$lib/links';
  import { fetchOwnerPortfolio } from '$lib/component-data/schema';
  import { useFetch } from '$lib/component-data/use-fetch.svelte';
  import { colors, colorByTracker, regroupStatus } from '$lib/ownership-theme';

  // Props - entityId is required, component fetches its own data
  let {
    entityId,
    assetClassName = 'assets',
    sortByOwnershipPct = true,
    includeUnitNames = false,
  } = $props();

  // ============================================================================
  // DATA FETCHING - This component fetches: fetchOwnerPortfolio(entityId)
  // ============================================================================
  const {
    data: portfolio,
    loading,
    error,
  } = useFetch(() => fetchOwnerPortfolio(entityId), `portfolio:${entityId}`);

  // Helper to convert data to Map (handles Map, Array of tuples, or Object)
  function toMap(data) {
    if (!data) return new Map();
    if (data instanceof Map) return data;
    if (Array.isArray(data)) return new Map(data);
    return new Map(Object.entries(data));
  }

  // Derive all values from portfolio
  const spotlightOwner = $derived(portfolio?.spotlightOwner ?? null);
  const subsidiariesMatched = $derived(toMap(portfolio?.subsidiariesMatched));
  const directlyOwned = $derived(portfolio?.directlyOwned || []);
  const assets = $derived(portfolio?.assets || []);
  const entityMap = $derived(toMap(portfolio?.entityMap));
  const matchedEdges = $derived(toMap(portfolio?.matchedEdges));

  /**
   * @typedef {{ locationID: string, units: any[], y?: number, r?: number }} ProcessedLocation
   * @typedef {{ id: string, assets: any[], isDirect: boolean, locations: ProcessedLocation[], top?: number, height?: number, bottom?: number, summaryData?: any }} ProcessedGroup
   */

  // Layout parameters (from Observable notebook)
  const params = {
    subsidX: 20,
    subsidiaryMarkHeight: 19,
    subsidiaryMinHeight: 90,
    yPadding: 50,
    assetsX: 500,
    assetSpacing: 8,
    assetMarkHeightSingle: 16,
    assetMarkHeightCombined: 26,
  };

  // Scale for combined unit radius
  function scaleR(n) {
    if (n <= 2) return 0.5;
    if (n <= 10) return 0.5 + (n - 2) * (0.5 / 8);
    if (n <= 20) return 1 + (n - 10) * (0.5 / 10);
    return 1.5;
  }

  // Build subsidiary groups with layout
  let subsidiaryGroups = $derived.by(() => {
    let groups = Array.from(subsidiariesMatched).map(([id, assetList]) => ({
      id,
      assets: assetList,
      isDirect: false,
    }));

    // Sort by ownership percentage if enabled
    if (sortByOwnershipPct) {
      groups.sort((a, b) => {
        const pctA = matchedEdges.get(a.id)?.value || 0;
        const pctB = matchedEdges.get(b.id)?.value || 0;
        return pctB - pctA;
      });
    }

    if (directlyOwned.length > 0) {
      groups.push({ id: 'Directly owned', assets: directlyOwned, isDirect: true });
    }

    // Group assets by location within each subsidiary
    /** @type {ProcessedGroup[]} */
    const processedGroups = groups.map((g) => {
      const locationMap = new Map();
      g.assets.forEach((asset) => {
        const locId = asset.locationID || asset.id;
        if (!locationMap.has(locId)) {
          locationMap.set(locId, []);
        }
        locationMap.get(locId).push(asset);
      });

      /** @type {ProcessedLocation[]} */
      const locations = Array.from(locationMap.entries())
        .map(([locId, units]) => ({
          locationID: locId,
          units: units.sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        }))
        .sort((a, b) => (a.units[0]?.name || '').localeCompare(b.units[0]?.name || ''));

      return {
        ...g,
        locations,
      };
    });

    // Calculate heights and Y positions
    let y = 0;
    processedGroups.forEach((g) => {
      g.top = y;
      const nLocations = g.locations.length;

      g.locations.forEach((loc, j) => {
        const nUnits = loc.units.length;
        const height =
          nUnits === 1
            ? params.assetMarkHeightSingle
            : Math.max(
                params.assetMarkHeightSingle,
                params.assetMarkHeightCombined * scaleR(nUnits)
              );
        loc.y = y - g.top + height / 2;
        loc.r =
          nUnits === 1
            ? params.assetMarkHeightSingle / 2
            : (params.assetMarkHeightCombined / 2) * scaleR(nUnits);
        y += height + (j === nLocations - 1 ? 0 : params.assetSpacing);
      });

      g.height = Math.max(y - g.top, params.subsidiaryMarkHeight, params.subsidiaryMinHeight);
      g.bottom = g.top + g.height;
      y = g.top + g.height + params.yPadding;

      // Calculate summary statistics for mini bar charts
      const allUnits = g.locations.flatMap((l) => l.units);
      g.summaryData = calculateFrequencyTables(allUnits);
    });

    return processedGroups;
  });

  // Calculate frequency tables for mini bar charts
  function calculateFrequencyTables(units) {
    const total = units.length;
    if (total === 0) return { tracker: [], status: [] };

    // Tracker frequency
    const trackerMap = new Map();
    units.forEach((u) => {
      const t = u.tracker || 'Unknown';
      trackerMap.set(t, (trackerMap.get(t) || 0) + 1);
    });
    const trackerData = Array.from(trackerMap.entries())
      .map(([tracker, count]) => ({ tracker, count, percentage: count / total, xPercentage: 0 }))
      .sort((a, b) => b.count - a.count);
    let xTracker = 0;
    trackerData.forEach((d) => {
      d.xPercentage = xTracker;
      xTracker += d.percentage;
    });

    // Status frequency (grouped)
    const statusMap = new Map();
    units.forEach((u) => {
      const s = regroupStatus(u.status || u.Status);
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    });
    const statusOrder = ['proposed', 'operating', 'retired', 'cancelled'];
    const statusData = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count, percentage: count / total, xPercentage: 0 }))
      .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    let xStatus = 0;
    statusData.forEach((d) => {
      d.xPercentage = xStatus;
      xStatus += d.percentage;
    });

    return { tracker: trackerData, status: statusData };
  }

  // SVG dimensions
  let svgHeight = $derived(
    subsidiaryGroups.length > 0 ? subsidiaryGroups[subsidiaryGroups.length - 1].bottom : 200
  );
  const svgWidth = 900;
  const margin = { top: 70, right: 10, bottom: 30, left: 40 };

  // Color legend
  let colLegend = $derived.by(() => {
    const types = new Set(assets.map((a) => a.tracker).filter(Boolean));
    const statuses = new Set(assets.map((a) => regroupStatus(a.status)));

    // If multiple tracker types, color by tracker; otherwise by status
    if (types.size > 1) {
      return Array.from(types).map((t) => ({
        color: colorByTracker.get(t) || colors.grey,
        label: t,
      }));
    } else {
      return Array.from(statuses).map((s) => ({
        color: getStatusColor(s),
        label: s,
      }));
    }
  });

  // Color field (tracker vs status)
  let colField = $derived(
    new Set(assets.map((a) => a.tracker).filter(Boolean)).size > 1 ? 'tracker' : 'status'
  );

  // Get color for an asset
  function getAssetColor(asset) {
    if (colField === 'tracker') {
      return colorByTracker.get(asset.tracker) || colors.grey;
    }
    const status = regroupStatus(asset.status || asset.Status);
    return getStatusColor(status);
  }

  // Get status color
  function getStatusColor(status) {
    const statusColorMap = {
      proposed: colors.purple,
      operating: '#4A57A8',
      retired: colors.midnightPurple,
      cancelled: colors.grey,
    };
    return statusColorMap[status] || colors.grey;
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

  // Subsidiary path from header to subsidiary group
  function subsidiaryPath(group) {
    const xS = 0;
    const yS = group.top;
    const xE = params.subsidX + params.assetsX - params.assetSpacing * 2;
    const yE = group.bottom;
    const radius = params.yPadding;
    const rC = radius * 0.3;

    return `
      M ${xS} ${yS - radius}
      C ${xS} ${yS - radius * 0.2}, ${xS + radius * 0.2} ${yS}, ${xS + radius} ${yS}
      L ${xE} ${yS}
      L ${xE} ${yE - rC}
      A ${rC} ${rC} 0 0 1 ${xE - rC} ${yE}
      L ${xS + rC} ${yE}
      A ${rC} ${rC} 0 0 1 ${xS} ${yE - rC}
      Z
    `;
  }

  // Wrap text into two lines
  function wrapText(text, maxChars = 25) {
    if (!text || text.length <= maxChars) return [text || ''];
    const breakPos = text.lastIndexOf(' ', maxChars);
    const pos = breakPos === -1 ? maxChars : breakPos;
    const line1 = text.slice(0, pos).trim();
    let line2 = text.slice(pos).trim();
    if (line2.length > maxChars) {
      line2 = line2.slice(0, maxChars).trim() + '...';
    }
    return [line1, line2].filter(Boolean);
  }

  // Clean asset name (remove suffixes)
  function cleanAssetName(name) {
    if (!name) return '';
    return name.replace(
      /\b(plant|station|project|center|centre|complex|facility)\b[\s\S]*$/i,
      '$1'
    );
  }

  // Hover state
  let hoverData = $state(null);

  // Bar chart scale
  const barWidth = 200;
  const barHeight = 8;
</script>

<div class="asset-screener">
  {#if loading}
    <div class="loading-state">Loading owner portfolio...</div>
  {:else if error}
    <div class="error-state">{error}</div>
  {:else}
    <!-- Header -->
    <div class="chart-header">
      <div class="name-wrapper">
        <p class="subtitle">Company</p>
        <h3>{spotlightOwner?.Name || 'Unknown Owner'}</h3>
      </div>
      <div class="details-wrapper">
        <p class="subtitle">Details</p>
        <p class="details">
          {assets.length}
          {assetClassName} via {subsidiariesMatched.size} direct subsidiaries
        </p>
      </div>
    </div>

    <!-- Main SVG -->
    <div class="chart-wrapper">
      <svg width={svgWidth} height={svgHeight + margin.top + margin.bottom}>
        <defs>
          <linearGradient id="gradient-fade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fafaf7" />
            <stop offset="100%" stop-color="#f7f7f3" />
          </linearGradient>
        </defs>

        <g transform="translate({margin.left}, {margin.top})">
          <!-- Vertical connection line -->
          <path
            d="M 0 {-margin.top - 5} L 0 {svgHeight + margin.bottom - 5}"
            fill="none"
            stroke="#d8d8ce"
            stroke-width="3.5"
            stroke-linecap="round"
          />

          <!-- Subsidiary groups -->
          {#each subsidiaryGroups as group}
            <!-- Background shape -->
            <path d={subsidiaryPath(group)} fill="url(#gradient-fade)" class="subsidiary-bg" />

            <!-- Top stroke -->
            <path
              d="M 0 {group.top - params.yPadding} C 0 {group.top -
                params.yPadding * 0.2}, {params.yPadding *
                0.2} {group.top}, {params.yPadding} {group.top} L {params.subsidX +
                params.assetsX -
                params.assetSpacing * 2} {group.top}"
              fill="none"
              stroke="#d8d8ce"
              stroke-width="3"
              stroke-linecap="round"
            />

            <!-- Subsidiary content -->
            <g
              transform="translate({params.subsidiaryMarkHeight / 2 + params.subsidX}, {group.top +
                20})"
            >
              <!-- Subsidiary circle with ownership pie (not for direct ownership) -->
              {#if !group.isDirect}
                {@const edgeData = matchedEdges.get(group.id)}
                {@const pieRadius = (params.subsidiaryMarkHeight / 2) * 0.7}

                <!-- Background circle -->
                {#if edgeData?.value !== 100}
                  <circle
                    cx="0"
                    cy={pieRadius}
                    r={pieRadius + 1}
                    fill="#cce1e6"
                    stroke="#ffffff"
                    stroke-width="1.25"
                    class="subsidiary-circle"
                    role="button"
                    tabindex="0"
                    aria-label={`${entityMap.get(group.id)?.Name || 'Unknown'} ownership`}
                    onmouseenter={() => (hoverData = { type: 'subsidiary', ...group, edgeData })}
                    onmouseleave={() => (hoverData = null)}
                    onclick={() => goto(entityLink(group.id))}
                    onkeydown={(e) => e.key === 'Enter' && goto(entityLink(group.id))}
                  />
                {/if}

                <!-- Ownership pie -->
                <g transform="translate(0, {pieRadius})">
                  <path
                    d={arcPath(edgeData?.value, pieRadius)}
                    fill={edgeData?.value ? colors.teal : 'none'}
                    class="ownership-pie"
                  />
                </g>
              {/if}

              <!-- Subsidiary name -->
              <text
                x={params.subsidiaryMarkHeight / 2 + 5}
                y={(params.subsidiaryMarkHeight / 2) * 0.7}
                fill={colors.navy}
                class="subsidiary-name"
                class:clickable={!group.isDirect}
                role={group.isDirect ? 'text' : 'button'}
                tabindex={group.isDirect ? undefined : 0}
                onclick={() => !group.isDirect && goto(entityLink(group.id))}
                onkeydown={(e) =>
                  !group.isDirect && e.key === 'Enter' && goto(entityLink(group.id))}
              >
                {#each wrapText(entityMap.get(group.id)?.Name || (group.isDirect ? 'Directly owned' : 'Unknown')) as line, i}
                  <tspan x={params.subsidiaryMarkHeight / 2 + 5} dy={i === 0 ? '0.35em' : '1.2em'}
                    >{line}</tspan
                  >
                {/each}
              </text>

              <!-- Mini bar charts (only for groups with multiple locations) -->
              {#if group.locations.length > 1}
                <!-- Tracker bar chart -->
                <g
                  class="bar-chart"
                  transform="translate({params.subsidiaryMarkHeight / 2 + 235}, -10)"
                >
                  <text class="bar-title" dy="-0.5em">Asset types</text>
                  {#each group.summaryData.tracker as bar, i}
                    <rect
                      x={bar.xPercentage * barWidth + i * 2}
                      y="0"
                      width={bar.percentage * barWidth}
                      height={barHeight}
                      rx={barHeight * 0.25}
                      fill={colorByTracker.get(bar.tracker) || colors.grey}
                      class="bar-segment"
                      role="img"
                      aria-label={`${bar.tracker}: ${(bar.percentage * 100).toFixed(0)}%`}
                      onmouseenter={() =>
                        (hoverData = { type: 'bar', label: bar.tracker, pct: bar.percentage })}
                      onmouseleave={() => (hoverData = null)}
                    />
                  {/each}
                </g>

                <!-- Status bar chart -->
                <g
                  class="bar-chart"
                  transform="translate({params.subsidiaryMarkHeight / 2 + 235}, 20)"
                >
                  <text class="bar-title" dy="-0.5em">Asset status</text>
                  {#each group.summaryData.status as bar, i}
                    <rect
                      x={bar.xPercentage * barWidth + i * 2}
                      y="0"
                      width={bar.percentage * barWidth}
                      height={barHeight}
                      rx={barHeight * 0.25}
                      fill={getStatusColor(bar.status)}
                      class="bar-segment"
                      role="img"
                      aria-label={`${bar.status}: ${(bar.percentage * 100).toFixed(0)}%`}
                      onmouseenter={() =>
                        (hoverData = { type: 'bar', label: bar.status, pct: bar.percentage })}
                      onmouseleave={() => (hoverData = null)}
                    />
                  {/each}
                </g>
              {/if}
            </g>

            <!-- Asset locations -->
            <g
              transform="translate({params.subsidiaryMarkHeight / 2 + params.subsidX}, {group.top})"
            >
              {#each group.locations as loc}
                <g
                  transform="translate({params.assetsX}, {loc.y})"
                  class="asset-group"
                  role="button"
                  tabindex="0"
                  aria-label={loc.units[0]?.name || 'Asset'}
                  onmouseenter={() =>
                    (hoverData = { type: 'asset', ...loc.units[0], allUnits: loc.units })}
                  onmouseleave={() => (hoverData = null)}
                  onclick={() => goto(assetLink(loc.units[0]?.id))}
                  onkeydown={(e) => e.key === 'Enter' && goto(assetLink(loc.units[0]?.id))}
                >
                  {#if loc.units.length === 1}
                    <!-- Single unit -->
                    {@const unit = loc.units[0]}
                    {@const unitStatus = regroupStatus(unit.status || unit.Status)}
                    <circle r={loc.r} fill={getAssetColor(unit)} class="asset-circle" />
                    <!-- Status icon - positioned at r * 1.1 offset, size r * 0.225 -->
                    {#if unitStatus === 'proposed'}
                      <!-- Yellow circle for proposed -->
                      <circle
                        cx={loc.r * 1.1}
                        cy={-loc.r * 1.1}
                        r={loc.r * 0.225}
                        fill={colors.yellow}
                        class="status-icon"
                      />
                    {:else if unitStatus === 'cancelled'}
                      <!-- X mark for cancelled -->
                      {@const s = loc.r * 0.225}
                      <path
                        transform="translate({loc.r * 1.1}, {-loc.r * 1.1})"
                        d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
                        fill="none"
                        stroke={colors.grey}
                        stroke-width="1.25"
                        stroke-linecap="round"
                        class="status-icon"
                      />
                    {:else if unitStatus === 'retired'}
                      <!-- X mark for retired -->
                      {@const s = loc.r * 0.225}
                      <path
                        transform="translate({loc.r * 1.1}, {-loc.r * 1.1})"
                        d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
                        fill="none"
                        stroke={colors.midnightPurple}
                        stroke-width="1.25"
                        stroke-linecap="round"
                        class="status-icon"
                      />
                    {/if}
                  {:else}
                    <!-- Multiple units - ring layout -->
                    {@const n = loc.units.length}
                    {@const TAU = Math.PI * 2}
                    <!-- Background circle -->
                    <circle r={loc.r} fill="none" stroke="#aab2c0" stroke-width="2" />
                    <!-- Unit circles with mix-blend-mode multiply -->
                    <g class="unit-ring" style="isolation: isolate;">
                      {#each loc.units as unit, ui}
                        {@const angle = (TAU * ui) / n}
                        {@const cx = loc.r * Math.cos(angle)}
                        {@const cy = loc.r * Math.sin(angle)}
                        {@const unitR = (params.assetMarkHeightSingle / 2) * 0.6}
                        {@const unitStatus = regroupStatus(unit.status || unit.Status)}
                        <circle
                          {cx}
                          {cy}
                          r={unitR}
                          fill={getAssetColor(unit)}
                          class="unit-circle"
                          style="mix-blend-mode: multiply;"
                        />
                        <!-- Status icon for each unit - positioned at unitR * 1.1 offset -->
                        {#if unitStatus === 'proposed'}
                          <circle
                            cx={cx + unitR * 1.1}
                            cy={cy - unitR * 1.1}
                            r={unitR * 0.225}
                            fill={colors.yellow}
                            class="status-icon"
                          />
                        {:else if unitStatus === 'cancelled'}
                          {@const s = unitR * 0.225}
                          <path
                            transform="translate({cx + unitR * 1.1}, {cy - unitR * 1.1})"
                            d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
                            fill="none"
                            stroke={colors.grey}
                            stroke-width="1.25"
                            stroke-linecap="round"
                            class="status-icon"
                          />
                        {:else if unitStatus === 'retired'}
                          {@const s = unitR * 0.225}
                          <path
                            transform="translate({cx + unitR * 1.1}, {cy - unitR * 1.1})"
                            d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
                            fill="none"
                            stroke={colors.midnightPurple}
                            stroke-width="1.25"
                            stroke-linecap="round"
                            class="status-icon"
                          />
                        {/if}
                      {/each}
                    </g>
                  {/if}

                  <!-- Asset label -->
                  <text x={params.assetMarkHeightCombined + 5} y="5" class="asset-name">
                    {includeUnitNames ? loc.units[0].name : cleanAssetName(loc.units[0].name)}
                  </text>
                </g>
              {/each}
            </g>
          {/each}
        </g>
      </svg>
    </div>

    <!-- Additional info footer -->
    <div class="additional-info">
      <p>
        <span>
          {spotlightOwner?.Name || 'This owner'} has stakes in additional assets identified in the Global
          Energy Ownership Trackers
        </span>
      </p>
    </div>

    <!-- Legend -->
    <div class="legend-container">
      <div class="legend">
        {#each colLegend as item}
          <div class="legend-item">
            <div class="legend-bubble" style:background-color={item.color}></div>
            <div>{item.label}</div>
          </div>
        {/each}
      </div>
      <!-- Status icon legend -->
      <div class="status-icon-legend">
        <div class="status-icon-item">
          <svg width="16" height="16" viewBox="-8 -8 16 16">
            <circle r="5" fill={colors.yellow} />
          </svg>
          <span>proposed</span>
        </div>
        <div class="status-icon-item">
          <svg width="16" height="16" viewBox="-8 -8 16 16">
            <line
              x1="-4"
              y1="-4"
              x2="4"
              y2="4"
              stroke={colors.grey}
              stroke-width="2"
              stroke-linecap="round"
            />
            <line
              x1="4"
              y1="-4"
              x2="-4"
              y2="4"
              stroke={colors.grey}
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span>cancelled</span>
        </div>
        <div class="status-icon-item">
          <svg width="16" height="16" viewBox="-8 -8 16 16">
            <line
              x1="-4"
              y1="-4"
              x2="4"
              y2="4"
              stroke={colors.midnightPurple}
              stroke-width="2"
              stroke-linecap="round"
            />
            <line
              x1="4"
              y1="-4"
              x2="-4"
              y2="4"
              stroke={colors.midnightPurple}
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <span>retired</span>
        </div>
      </div>
    </div>

    <!-- Tooltip -->
    {#if hoverData}
      <div class="tooltip">
        {#if hoverData.type === 'subsidiary'}
          <strong>{entityMap.get(hoverData.id)?.Name || 'Unknown'}</strong>
          {#if hoverData.edgeData?.value}
            <br /><span class="ownership-pct">{hoverData.edgeData.value.toFixed(1)}% ownership</span
            >
          {/if}
          <br /><span class="asset-count">{hoverData.locations?.length || 0} assets</span>
        {:else if hoverData.type === 'asset'}
          <strong>{hoverData.name || hoverData.project || 'Unknown Asset'}</strong>
          {#if hoverData.Status || hoverData.status}
            <br /><span class="status">{hoverData.Status || hoverData.status}</span>
          {/if}
          {#if hoverData.allUnits?.length > 1}
            <br /><span class="unit-count">{hoverData.allUnits.length} units</span>
          {/if}
        {:else if hoverData.type === 'bar'}
          <strong>{hoverData.label}</strong>
          <br /><span>{(hoverData.pct * 100).toFixed(0)}%</span>
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

  .asset-screener {
    position: relative;
    font-family: 'Plus Jakarta Sans', Georgia, serif;
    width: 100%;
  }

  .chart-header {
    display: flex;
    align-items: flex-start;
    gap: 2em;
    padding: 0.4em 1.8em;
    border-bottom: 3px solid #d8d8ce;
    background: #016b83;
    color: #ffffff;
  }

  .name-wrapper {
    min-width: 250px;
  }

  .name-wrapper h3 {
    font-weight: 700;
    margin: 0;
    font-size: 1.2em;
  }

  .subtitle {
    font-size: 0.7em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    color: #9df7e5;
    margin: 0 0 0.5em 0;
  }

  .details {
    font-size: 0.9em;
    margin: 0;
  }

  .chart-wrapper {
    min-height: 420px;
    overflow: visible;
    background: transparent;
  }

  .chart-wrapper svg {
    display: block;
  }

  .subsidiary-bg {
    pointer-events: none;
  }

  .subsidiary-circle {
    cursor: pointer;
    transition: fill-opacity 0.15s;
  }

  .subsidiary-circle:hover {
    fill-opacity: 0.5;
  }

  .ownership-pie {
    pointer-events: none;
  }

  .subsidiary-name {
    font-size: 0.9em;
    font-weight: 500;
    letter-spacing: 0.03em;
  }

  .subsidiary-name.clickable {
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
  }

  .subsidiary-name.clickable:hover {
    text-decoration-color: currentColor;
  }

  .bar-chart .bar-title {
    font-size: 0.55em;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    fill: #797975;
  }

  .bar-segment {
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .bar-segment:hover {
    opacity: 0.7;
  }

  .asset-group {
    cursor: pointer;
  }

  .asset-circle,
  .unit-circle {
    transition: r 0.15s;
  }

  .asset-group:hover .asset-circle {
    r: 10;
  }

  .asset-name {
    font-size: 0.75em;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    fill: #333;
  }

  .additional-info {
    text-align: center;
    padding: 1em;
  }

  .additional-info p {
    margin: 0;
    font-style: italic;
    color: #333;
    font-weight: 500;
    font-size: 0.95em;
  }

  .additional-info span {
    padding: 0.8em;
    border-top: 2px solid #fe4f2d;
  }

  .legend-container {
    padding: 0.6em 1.6em;
    border-top: 3px solid #016b83;
    background: transparent;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1.5em;
    justify-content: center;
    font-size: 0.9em;
    color: #333;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.4em;
  }

  .legend-bubble {
    width: 13px;
    height: 13px;
    border-radius: 50%;
  }

  .status-icon-legend {
    display: flex;
    gap: 1.2em;
    justify-content: center;
    margin-top: 0.5em;
    font-size: 0.8em;
    color: #666;
  }

  .status-icon-item {
    display: flex;
    align-items: center;
    gap: 0.3em;
  }

  .status-icon-item svg {
    display: block;
  }

  .status-icon {
    pointer-events: none;
  }

  .tooltip {
    position: absolute;
    bottom: 100px;
    right: 20px;
    background: white;
    border: none;
    padding: 10px 14px;
    font-size: 12px;
    max-width: 250px;
    pointer-events: none;
    box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.1);
    z-index: 100;
  }

  .tooltip .ownership-pct {
    color: #016b83;
    font-weight: bold;
  }

  .tooltip .status {
    color: #666;
    text-transform: capitalize;
  }

  .tooltip .asset-count,
  .tooltip .unit-count {
    color: #888;
    font-size: 0.9em;
  }
</style>
