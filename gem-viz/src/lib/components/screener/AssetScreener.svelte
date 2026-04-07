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
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { assetLink, entityLink } from '$lib/links';
  import { fetchOwnerPortfolio } from '$lib/component-data/schema';
  import {
    colors,
    colorByTracker,
    regroupStatus,
    statusColors,
    statusColorLegend,
  } from '$lib/design-tokens';
  import { cleanAssetName, wrapTextLines } from './screener-utils';
  import { STATUS_GROUPS } from '$lib/data-config/tracker-schema';

  // Props - can receive pre-fetched portfolio data or fetch its own
  let {
    entityId,
    portfolio: prebakedPortfolio = null,
    assetClassName = 'assets',
    sortByOwnershipPct = true,
    includeUnitNames = false,
    /** Default active status groups (operating + planned by default) */
    defaultStatuses = STATUS_GROUPS.filter((g) => g.id === 'operating' || g.id === 'planned').map(
      (g) => g.id
    ),
  } = $props();

  // Status filter state - which status groups are currently visible
  let activeStatuses = $state(new Set());

  $effect(() => {
    activeStatuses = new Set(defaultStatuses);
  });

  // ============================================================================
  // DATA FETCHING - Uses prebaked data if provided, otherwise fetches on mount
  // ============================================================================
  let fetchedPortfolio = $state(null);
  let fetchLoading = $state(false);
  let fetchError = $state(null);

  onMount(async () => {
    if (prebakedPortfolio || !entityId) return;
    fetchLoading = true;
    fetchError = null;
    try {
      fetchedPortfolio = await fetchOwnerPortfolio(entityId);
    } catch (err) {
      fetchError = err?.message || 'Failed to load portfolio';
    } finally {
      fetchLoading = false;
    }
  });

  // Use prebaked data if available, otherwise use fetched data
  const portfolio = $derived(prebakedPortfolio || fetchedPortfolio);
  const loading = $derived(!prebakedPortfolio && fetchLoading);
  const error = $derived(!prebakedPortfolio ? fetchError : null);

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
  const allAssets = $derived(portfolio?.assets || []);
  const entityMap = $derived(toMap(portfolio?.entityMap));
  const matchedEdges = $derived(toMap(portfolio?.matchedEdges));

  // Filter helper: check if an asset passes the status filter
  function passesStatusFilter(asset) {
    const group = regroupStatus(asset.status || asset.Status);
    return activeStatuses.has(group);
  }

  // Filtered assets based on active status groups
  const assets = $derived(allAssets.filter(passesStatusFilter));

  // Summary string of asset types for the Details line, e.g. "3 Steel Plant, 2 Coal Mine"
  const assetTypeSummary = $derived.by(() => {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const a of assets) {
      if (a.tracker) counts.set(a.tracker, (counts.get(a.tracker) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
  });

  // Toggle a status group on/off
  function toggleStatus(group) {
    const next = new Set(activeStatuses);
    if (next.has(group)) {
      // Don't allow deselecting all
      if (next.size > 1) next.delete(group);
    } else {
      next.add(group);
    }
    activeStatuses = next;
  }

  // Status group counts (from all assets, not filtered)
  const statusGroupCounts = $derived.by(() => {
    const counts = { operating: 0, planned: 0, retired: 0, cancelled: 0 };
    for (const a of allAssets) {
      const group = regroupStatus(a.status || a.Status);
      if (group in counts) counts[group]++;
    }
    return counts;
  });

  /**
   * @typedef {{ locationID: string, units: any[], y?: number, r?: number }} ProcessedLocation
   * @typedef {{ id: string, assets: any[], isDirect: boolean, locations: ProcessedLocation[], top?: number, height?: number, bottom?: number, summaryData?: any }} ProcessedGroup
   */

  // Layout parameters (from Observable notebook)
  const params = {
    subsidX: 20,
    subsidiaryMarkHeight: 19,
    subsidiaryMinHeight: 60,
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
      assets: assetList.filter(passesStatusFilter),
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

    const filteredDirect = directlyOwned.filter(passesStatusFilter);
    if (filteredDirect.length > 0) {
      groups.push({ id: 'Directly owned', assets: filteredDirect, isDirect: true });
    }

    // Remove empty groups (all assets filtered out)
    groups = groups.filter((g) => g.assets.length > 0);

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
    if (units.length === 0) return { tracker: [], status: [] };
    const statusOrder = STATUS_GROUPS.map((g) => g.id);
    return {
      tracker: countFrequency(units, 'tracker'),
      status: countFrequency(
        units,
        'status',
        (v) => regroupStatus(v),
        (a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status)
      ),
    };
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

  // Get status color from centralized design tokens
  function getStatusColor(status) {
    return statusColors[status] || statusColors.unknown;
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

  // wrapText alias for template compatibility
  const wrapText = wrapTextLines;

  // Hover state
  let hoverData = $state(null);

  // Bar chart scale
  const barWidth = 200;
  const barHeight = 8;

  // Frequency counting helper (shared by tracker/status breakdowns)
  function countFrequency(units, field, transform = (v) => v, sortFn) {
    const counts = new Map();
    for (const u of units) {
      const v = transform(u[field] || 'Unknown');
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    const total = units.length;
    const data = Array.from(counts, ([value, count]) => ({
      [field]: value,
      count,
      percentage: count / total,
      xPercentage: 0,
    }));
    if (sortFn) data.sort(sortFn);
    else data.sort((a, b) => b.count - a.count);
    let x = 0;
    for (const d of data) {
      d.xPercentage = x;
      x += d.percentage;
    }
    return data;
  }
</script>

{#snippet statusIconSvg(unitStatus, cx, cy, r)}
  {#if unitStatus === 'proposed'}
    <circle
      cx={cx + r * 1.1}
      cy={cy - r * 1.1}
      r={r * 0.225}
      fill={colors.yellow}
      class="status-icon"
    />
  {:else if unitStatus === 'cancelled'}
    {@const s = r * 0.225}
    <path
      transform="translate({cx + r * 1.1}, {cy - r * 1.1})"
      d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
      fill="none"
      stroke={colors.grey}
      stroke-width="1.25"
      stroke-linecap="round"
      class="status-icon"
    />
  {:else if unitStatus === 'retired'}
    {@const s = r * 0.225}
    <path
      transform="translate({cx + r * 1.1}, {cy - r * 1.1})"
      d="M {-s} {s} L {s} {-s} M {-s} {-s} L {s} {s}"
      fill="none"
      stroke={colors.midnightPurple}
      stroke-width="1.25"
      stroke-linecap="round"
      class="status-icon"
    />
  {/if}
{/snippet}

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
          {assetTypeSummary || `${assets.length} ${assetClassName}`}{assets.length !==
          allAssets.length
            ? ` of ${allAssets.length}`
            : ''}
          via {subsidiariesMatched.size} direct subsidiaries
        </p>
      </div>
    </div>

    <!-- Status filter toggles -->
    <div class="status-filter">
      <span class="filter-label">Status</span>
      {#each statusColorLegend as { color, label }}
        {@const group = label.toLowerCase()}
        {@const isActive = activeStatuses.has(group)}
        {@const count = statusGroupCounts[group] || 0}
        <button
          class="status-pill"
          class:active={isActive}
          style:--pill-color={color}
          onclick={() => toggleStatus(group)}
          aria-pressed={isActive}
        >
          <span class="pill-dot" style:background-color={isActive ? color : 'transparent'}></span>
          {label}
          <span class="pill-count">{count}</span>
        </button>
      {/each}
    </div>

    <!-- Mobile fallback: card-based list for small screens -->
    <div class="mobile-fallback">
      {#each subsidiaryGroups as group}
        {@const entity = entityMap.get(group.id)}
        {@const edge = matchedEdges.get(group.id)}
        <details class="mobile-group" open={subsidiaryGroups.length <= 5}>
          <summary class="mobile-group-header">
            <span class="mobile-group-name">{group.isDirect ? 'Directly owned' : (entity?.Name || group.id)}</span>
            {#if edge?.value}
              <span class="mobile-group-pct">{edge.value.toFixed(1)}%</span>
            {/if}
            <span class="mobile-group-count">{group.locations.length} assets</span>
          </summary>
          <div class="mobile-group-assets">
            {#each group.locations as loc}
              {@const unit = loc.units[0]}
              {@const status = regroupStatus(unit.status || unit.Status)}
              <a
                href={assetLink(unit)}
                class="mobile-asset-row"
              >
                <span
                  class="mobile-asset-dot"
                  style:background-color={colorByTracker.get(unit.tracker) || colors.grey}
                ></span>
                <span class="mobile-asset-name">{cleanAssetName(unit.name, unit.project_name)}</span>
                {#if loc.units.length > 1}
                  <span class="mobile-unit-count">{loc.units.length} units</span>
                {/if}
                <span class="mobile-asset-status" class:operating={status === 'operating'} class:planned={status === 'planned'} class:retired={status === 'retired'} class:cancelled={status === 'cancelled'}>{status}</span>
              </a>
            {/each}
          </div>
        </details>
      {/each}
    </div>

    <!-- Main SVG (desktop) -->
    <div class="chart-wrapper">
      <svg width={svgWidth} height={svgHeight + margin.top + margin.bottom}>
        <defs>
          <linearGradient id="gradient-fade" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color={colors.warmWhite} />
            <stop offset="100%" stop-color={colors.gray100} />
          </linearGradient>
        </defs>

        <g transform="translate({margin.left}, {margin.top})">
          <!-- Vertical connection line -->
          <path
            d="M 0 {-margin.top - 5} L 0 {svgHeight + margin.bottom - 5}"
            fill="none"
            stroke={colors.gray200}
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
              stroke={colors.gray200}
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
                    fill={colors.mintDataviz}
                    stroke={colors.white}
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
              <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
              <text
                x={params.subsidiaryMarkHeight / 2 + 5}
                y={(params.subsidiaryMarkHeight / 2) * 0.7}
                fill={colors.navy}
                class="subsidiary-name"
                class:clickable={!group.isDirect}
                role={group.isDirect ? 'text' : 'button'}
                tabindex={group.isDirect ? -1 : 0}
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
                    {@render statusIconSvg(unitStatus, 0, 0, loc.r)}
                  {:else}
                    <!-- Multiple units - ring layout -->
                    {@const n = loc.units.length}
                    {@const TAU = Math.PI * 2}
                    <!-- Background circle -->
                    <circle r={loc.r} fill="none" stroke={colors.gray300} stroke-width="2" />
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
                        {@render statusIconSvg(unitStatus, cx, cy, unitR)}
                      {/each}
                    </g>
                  {/if}

                  <!-- Asset label -->
                  <text x={params.assetMarkHeightCombined + 5} y="5" class="asset-name">
                    {includeUnitNames ? loc.units[0].name : cleanAssetName(loc.units[0].name, loc.units[0].project_name)}
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
  /* ==========================================================================
     GEM Asset Screener - Using GEM Typography System
     ========================================================================== */

  .loading-state,
  .error-state {
    padding: var(--space-12) var(--space-5);
    text-align: center;
    font-family: var(--font-family);
    font-size: var(--font-size-base);
  }

  .loading-state {
    color: var(--color-text-secondary);
  }

  .error-state {
    color: var(--color-error);
  }

  .asset-screener {
    position: relative;
    font-family: var(--font-family);
    width: 100%;
  }

  /* --- Header --- */
  .chart-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-8);
    padding: var(--space-3) var(--space-6);
    border-bottom: 3px solid var(--color-border);
    background: var(--gem-teal);
    color: var(--gem-white);
  }

  .name-wrapper {
    min-width: 250px;
  }

  .name-wrapper h3 {
    font-family: var(--font-family-display);
    font-weight: var(--font-weight-bold);
    font-size: var(--font-size-xl);
    line-height: var(--line-height-snug);
    margin: 0;
    color: var(--gem-white);
  }

  .subtitle {
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--gem-mint);
    margin: 0 0 var(--space-2) 0;
  }

  .details-wrapper .details {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-regular);
    margin: 0;
  }

  /* --- Status Filter --- */
  .status-filter {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-6);
    background: var(--gem-white);
    border-bottom: 1px solid var(--color-border);
  }

  .filter-label {
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--color-text-tertiary);
    margin-right: var(--space-1);
  }

  .status-pill {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1.5px solid var(--pill-color);
    border-radius: 999px;
    background: transparent;
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    opacity: 0.45;
  }

  .status-pill.active {
    opacity: 1;
    background: color-mix(in srgb, var(--pill-color) 10%, transparent);
    color: var(--color-text-primary);
  }

  .status-pill:hover {
    opacity: 0.85;
  }

  .status-pill.active:hover {
    opacity: 1;
    background: color-mix(in srgb, var(--pill-color) 18%, transparent);
  }

  .pill-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 1.5px solid var(--pill-color);
    flex-shrink: 0;
  }

  .pill-count {
    font-family: var(--font-family-data);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-left: var(--space-1);
  }

  /* --- Chart Area --- */
  .chart-wrapper {
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
    transition: fill-opacity var(--duration-fast) var(--ease-out);
  }

  .subsidiary-circle:hover {
    fill-opacity: 0.5;
  }

  .ownership-pie {
    pointer-events: none;
  }

  /* --- Subsidiary Names --- */
  .subsidiary-name {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--tracking-wide);
  }

  .subsidiary-name.clickable {
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color var(--duration-fast) var(--ease-out);
  }

  .subsidiary-name.clickable:hover {
    text-decoration-color: currentColor;
  }

  /* --- Bar Charts (Mini) --- */
  .bar-chart .bar-title {
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    fill: var(--color-text-tertiary);
  }

  .bar-segment {
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-out);
  }

  .bar-segment:hover {
    opacity: 0.7;
  }

  /* --- Asset Groups --- */
  .asset-group {
    cursor: pointer;
  }

  .asset-circle,
  .unit-circle {
    transition: r var(--duration-fast) var(--ease-out);
  }

  .asset-group:hover .asset-circle {
    r: 10;
  }

  /* Asset names use data typography (Barlow Semi-Condensed UPPERCASE) */
  .asset-name {
    font-family: var(--font-family-data);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    fill: var(--color-text-secondary);
  }

  /* --- Additional Info Footer --- */
  .additional-info {
    text-align: center;
    padding: var(--space-2) var(--space-4);
  }

  .additional-info p {
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    font-style: italic;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .additional-info span {
    display: inline-block;
    padding: var(--space-2);
    border-top: 2px solid var(--gem-orange);
  }

  /* --- Legend --- */
  .legend-container {
    padding: var(--space-3) var(--space-6);
    border-top: 3px solid var(--gem-teal);
    background: transparent;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
    justify-content: center;
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .legend-bubble {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* --- Status Icon Legend --- */
  .status-icon-legend {
    display: flex;
    gap: var(--space-4);
    justify-content: center;
    margin-top: var(--space-2);
    font-family: var(--font-family);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
  }

  .status-icon-item {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .status-icon-item svg {
    display: block;
  }

  .status-icon {
    pointer-events: none;
  }

  /* --- Tooltip --- */
  .tooltip {
    position: absolute;
    bottom: 100px;
    right: 20px;
    background: var(--gem-white);
    border: 1px solid var(--color-border);
    padding: var(--space-3) var(--space-4);
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    max-width: 250px;
    pointer-events: none;
    box-shadow: var(--shadow-md);
    z-index: var(--z-dropdown);
  }

  .tooltip strong {
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .tooltip .ownership-pct {
    font-family: var(--font-family-data);
    color: var(--gem-teal);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
  }

  .tooltip .status {
    color: var(--color-text-secondary);
    text-transform: capitalize;
  }

  .tooltip .asset-count,
  .tooltip .unit-count {
    font-family: var(--font-family-data);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
  }

  /* --- Print --- */
  @media print {
    .chart-wrapper {
      display: block;
      overflow: visible;
    }
    .chart-wrapper svg {
      width: 100%;
      height: auto;
    }
    .mobile-fallback {
      display: none;
    }
    .status-filter {
      display: none;
    }
    .tooltip {
      display: none;
    }
    .legend-container {
      break-inside: avoid;
    }
    .chart-header {
      break-after: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  /* --- Mobile Fallback --- */
  .mobile-fallback {
    display: none;
  }

  @media (max-width: 768px) {
    .mobile-fallback {
      display: block;
    }
    .chart-wrapper {
      display: none;
    }
    .legend-container {
      display: none;
    }
    .chart-header {
      flex-direction: column;
      gap: var(--space-2);
    }
    .name-wrapper {
      min-width: 0;
    }
    .status-filter {
      flex-wrap: wrap;
    }
  }

  .mobile-group {
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: var(--radius-md, 6px);
    margin-bottom: var(--space-2);
    overflow: hidden;
  }
  .mobile-group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary, #f7fafc);
    cursor: pointer;
    font-family: var(--font-family);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    list-style: none;
  }
  .mobile-group-header::-webkit-details-marker {
    display: none;
  }
  .mobile-group-header::before {
    content: '▸';
    font-size: 10px;
    transition: transform 0.15s ease;
  }
  .mobile-group[open] > .mobile-group-header::before {
    transform: rotate(90deg);
  }
  .mobile-group-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-group-pct {
    font-family: var(--font-family-data, monospace);
    font-weight: var(--font-weight-bold);
    color: var(--gem-teal, #0d7377);
    font-size: var(--font-size-xs);
    white-space: nowrap;
  }
  .mobile-group-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary, #a0aec0);
    white-space: nowrap;
  }
  .mobile-group-assets {
    padding: 0;
  }
  .mobile-asset-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border-top: 1px solid var(--color-border, #e2e8f0);
    text-decoration: none;
    color: inherit;
    font-size: var(--font-size-xs);
  }
  .mobile-asset-row:hover {
    background: var(--color-bg-secondary, #f7fafc);
  }
  .mobile-asset-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .mobile-asset-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-family-data, monospace);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .mobile-unit-count {
    font-size: 10px;
    color: var(--color-text-tertiary, #a0aec0);
    white-space: nowrap;
  }
  .mobile-asset-status {
    font-size: 10px;
    text-transform: capitalize;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 3px);
    white-space: nowrap;
  }
  .mobile-asset-status.operating { color: var(--gem-teal, #0d7377); background: rgba(13, 115, 119, 0.1); }
  .mobile-asset-status.planned { color: var(--gem-orange, #f59e0b); background: rgba(245, 158, 11, 0.1); }
  .mobile-asset-status.retired { color: var(--color-text-tertiary, #a0aec0); background: rgba(160, 174, 192, 0.1); }
  .mobile-asset-status.cancelled { color: var(--color-text-tertiary, #a0aec0); background: rgba(160, 174, 192, 0.1); }
</style>
