<script>
  /**
   * AssetScreenerChart — Svelte wrapper for the D3 ownership screener chart.
   *
   * Fetches the ownership graph for an entity, transforms it into chart data,
   * and renders the D3 visualization imperatively into a bound container.
   */

  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    getTrackerColor,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
  } from '$lib/design-tokens';
  import {
    fetchChartData,
    expandSubsidiary,
    buildSubsidiaryGroups,
  } from './screener-chart-data';
  import { renderChart } from './screener-chart-render';
  import { matchesStatusFilter } from '$lib/data-config/tracker-schema';
  import Spinner from '$lib/components/feedback/Spinner.svelte';

  const API_BASE = import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // Props
  let {
    entityId = '',
    entityName = '',
    assetClassName = '',
    trackerSlug = '',
    filteredAssetCount = null,
    /** Optional: only show assets whose raw status is in this list */
    statusFilter = undefined,
    /** Optional: only show assets whose tracker matches one of these names */
    trackerFilter = undefined,
    /**
     * Optional fully-qualified assets URL (the screener's catalogUrl).
     * When provided, assets are fetched from this URL and used to restrict
     * the ownership graph to only assets in the selected asset class.
     */
    catalogUrl = undefined,
    onDataLoaded = undefined,
    onContainerReady = undefined,
    fillHeight = false,
  } = $props();

  // State
  let container = $state(null);
  let scrollEl = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let progressMsg = $state('');
  let chartCleanup = null;
  let isEmpty = $state(false);
  let totalAssets = $state(0);
  let totalAssetsPreFilter = $state(0);
  let directSubsidiaries = $state(0);
  let trackerLegend = $state([]);
  let statusLegend = $state([]);
  let prospectiveLegend = $state(false);
  // Mirrors the colorField logic in screener-chart-render.ts:
  // use tracker coloring unless there's ≤1 tracker type AND >1 status to differentiate
  const colorByTracker = $derived(!(trackerLegend.length <= 1 && statusLegend.length > 1));

  // Subsidiary expansion state
  let expansions = $state(new Map()); // Map<subId, SubsidiaryExpansion>

  // Stable reference to the filtered chart data for use in toggleExpansion
  let currentChartData = null;

  let destroyed = false;

  const hasFilteredAssetCount = $derived(
    typeof filteredAssetCount === 'number' && !Number.isNaN(filteredAssetCount)
  );
  const matchedAssets = $derived(
    hasFilteredAssetCount
      ? totalAssets > 0
        ? Math.max(0, Math.min(filteredAssetCount, totalAssets))
        : filteredAssetCount
      : totalAssets
  );
  const additionalAssets = $derived(
    Math.max(0, (totalAssetsPreFilter || totalAssets) - matchedAssets)
  );

  function formatOwnershipPct(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
  }

  function rerenderWithExpansions(exp) {
    if (!container || !currentChartData) return;
    const savedScroll = scrollEl?.scrollTop ?? 0;
    if (chartCleanup) {
      chartCleanup();
      chartCleanup = null;
    }
    const subsidiaryGroups = buildSubsidiaryGroups(currentChartData, exp);
    const containerWidth = container.clientWidth || 960;
    chartCleanup = renderChart(container, currentChartData, subsidiaryGroups, {
      width: containerWidth,
      colorField: 'tracker',
      showLegend: false,
      assetHref: (assetId) => `${base}/asset/${encodeURIComponent(assetId)}`,
      expandedSubIds: new Set(exp.keys()),
      onExpandSubsidiary: toggleExpansion,
    });
    if (scrollEl) scrollEl.scrollTop = savedScroll;
  }

  // Recursively remove subId and all its descendants from the expansions map
  function collapseDescendants(subId, map) {
    const exp = map.get(subId);
    if (!exp) return;
    map.delete(subId);
    for (const sg of exp.subGroups) {
      collapseDescendants(sg.id, map);
    }
  }

  // Recursively search a subGroups tree for a matching subId, returning its units
  function findSubGroupUnits(subId, subGroups) {
    for (const sg of subGroups) {
      if (sg.id === subId) return sg.locations.flatMap((loc) => loc.units);
      if (sg.expansion?.subGroups?.length) {
        const found = findSubGroupUnits(subId, sg.expansion.subGroups);
        if (found) return found;
      }
    }
    return null;
  }

  function toggleExpansion(subId) {
    if (expansions.has(subId)) {
      // Collapse — recursively remove this and all descendant expansions
      const next = new Map(expansions);
      collapseDescendants(subId, next);
      expansions = next;
      rerenderWithExpansions(next);
      return;
    }

    if (!currentChartData) return;

    // Find parent units: check top-level subsidiaries first, then recursively search expansions
    let parentUnits = currentChartData.subsidiariesMatched.get(subId) ?? null;
    if (!parentUnits?.length) {
      for (const [, exp] of expansions) {
        const found = findSubGroupUnits(subId, exp.subGroups);
        if (found) { parentUnits = found; break; }
      }
    }
    if (!parentUnits?.length) return;

    const expansion = expandSubsidiary(
      subId, parentUnits,
      currentChartData.graphNodeMap,
      currentChartData.graphPaths,
    );
    const next = new Map(expansions);
    next.set(subId, expansion);
    expansions = next;
    rerenderWithExpansions(next);
  }

  async function loadAndRender() {
    if (!entityId || !container) return;

    try {
      loading = true;
      error = null;
      isEmpty = false;

      // Reset expansion state when entity changes
      expansions = new Map();
      currentChartData = null;

      // Clean up previous render
      if (chartCleanup) {
        chartCleanup();
        chartCleanup = null;
      }

      // Fetch and transform data
      const chartData = await fetchChartData(entityId, catalogUrl || undefined, (msg) => {
        progressMsg = msg;
      });

      if (destroyed || !container) return;

      // Record pre-filter total for "additional assets" calculation
      totalAssetsPreFilter = chartData.assets.length;

      // Apply status filter if provided (checks both status and sub-status)
      if (statusFilter && statusFilter.length > 0) {
        const allowed = statusFilter.map((s) => s.toLowerCase());
        const matchStatus = (u) => matchesStatusFilter(u.status, u.subStatus, allowed);
        chartData.assets = chartData.assets.filter(matchStatus);
        chartData.directlyOwned = chartData.directlyOwned.filter(matchStatus);
        for (const [subId, units] of chartData.subsidiariesMatched) {
          const filtered = units.filter(matchStatus);
          if (filtered.length === 0) {
            chartData.subsidiariesMatched.delete(subId);
          } else {
            chartData.subsidiariesMatched.set(subId, filtered);
          }
        }
      }

      // Apply tracker filter if provided.
      // Normalize both sides: strip all non-alphanumeric chars so slugs ('oil-gas-plant'),
      // display names ('Oil & Gas Plant'), and abbreviated names ('Gas Plant') all reduce
      // to the same canonical form for comparison.
      if (trackerFilter && trackerFilter.length > 0) {
        const normTracker = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const allowed = new Set(trackerFilter.map(normTracker));
        const matchTracker = (u) => allowed.has(normTracker(u.tracker));
        chartData.assets = chartData.assets.filter(matchTracker);
        chartData.directlyOwned = chartData.directlyOwned.filter(matchTracker);
        for (const [subId, units] of chartData.subsidiariesMatched) {
          const filtered = units.filter(matchTracker);
          if (filtered.length === 0) {
            chartData.subsidiariesMatched.delete(subId);
          } else {
            chartData.subsidiariesMatched.set(subId, filtered);
          }
        }
      }

      if (chartData.assets.length === 0) {
        isEmpty = true;
        loading = false;
        return;
      }

      // Store filtered chart data for expansion fetches
      currentChartData = chartData;

      // Build subsidiary group layout (no expansions yet on initial load)
      const subsidiaryGroups = buildSubsidiaryGroups(chartData, new Map());
      totalAssets = chartData.assets.length;
      directSubsidiaries = chartData.subsidiariesMatched.size;

      const trackers = Array.from(
        new Set(chartData.assets.map((a) => a.tracker).filter((t) => t && t !== 'Unknown'))
      );
      trackerLegend = trackers.map((label) => ({
        label,
        color: getTrackerColor(label),
      }));

      const rawStatuses = chartData.assets
        .map((a) => String(a.status || '').toLowerCase())
        .filter(Boolean);
      const allPlanned =
        rawStatuses.length > 0 && rawStatuses.every((s) => prospectiveStatuses.includes(s));
      prospectiveLegend = allPlanned;

      if (allPlanned) {
        const items = [];
        for (const [color, { descript, statuses }] of statusColorsProspective) {
          if (statuses.some((s) => rawStatuses.includes(s))) {
            items.push({ label: descript, color, kind: 'planned-detail' });
          }
        }
        // If no granular match (e.g. API returned aggregate 'planned'), fall through to normal legend
        if (items.length > 0) {
          statusLegend = items;
        } else {
          prospectiveLegend = false;
        }
      }
      if (!prospectiveLegend) {
        const order = ['operating', 'planned', 'retired', 'cancelled', 'unknown'];
        const aggregated = Array.from(
          new Set(chartData.assets.map((a) => a.status_agg).filter(Boolean))
        ).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        statusLegend = aggregated.map((kind) => ({
          label: kind,
          color: statusColors[kind] || statusColors.unknown,
          kind,
        }));
      }

      // Measure container width
      const containerWidth = container.clientWidth || 960;
      container.dataset.trackerSlug = trackerSlug || '';

      // Render D3 chart
      chartCleanup = renderChart(container, chartData, subsidiaryGroups, {
        width: containerWidth,
        colorField: 'tracker',
        showLegend: false,
        assetHref: (assetId) => `${base}/asset/${encodeURIComponent(assetId)}`,
        expandedSubIds: new Set(expansions.keys()),
        onExpandSubsidiary: toggleExpansion,
      });

      loading = false;

      // Notify parent with loaded data (status-filtered asset IDs)
      const filteredAssetIds = new Set(chartData.assets.map((a) => a.id));
      onDataLoaded?.({
        entityId,
        assets: Array.from(chartData.assetDetails.values()).filter((a) =>
          filteredAssetIds.has(a.id)
        ),
        chartData,
      });
      onContainerReady?.(container);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AssetScreenerChart] Error:', err);
      error = err?.message || 'Failed to load ownership chart';
      loading = false;
    }
  }

  onMount(() => {
    loadAndRender();

    return () => {
      destroyed = true;
      if (chartCleanup) {
        chartCleanup();
        chartCleanup = null;
      }
    };
  });

  // Reload when entityId changes
  $effect(() => {
    if (entityId && container) {
      loadAndRender();
    }
  });
</script>

<section class="sticky-section" class:fill-height={fillHeight} bind:this={scrollEl}>
  <div id="chart-header">
    <div class="name-wrapper">
      <p class="subtitle">Owner</p>
      <h3>{entityName || entityId}</h3>
    </div>
    <div>
      <p class="subtitle">Details</p>
      <p class="company-details">
        {matchedAssets}
        {assetClassName || 'assets'}
        {#if loading}
          <span class="loading-hint">loading…</span>
        {:else}
          via {directSubsidiaries} direct {directSubsidiaries === 1 ? 'subsidiary' : 'subsidiaries'}
        {/if}
      </p>
    </div>
  </div>

  {#if loading}
    <div class="chart-state">
      <Spinner size={20} />
      <p class="progress-msg">{progressMsg || 'Loading ownership data...'}</p>
    </div>
  {:else if error}
    <div class="chart-state chart-state--error">
      <p>{error}</p>
    </div>
  {:else if isEmpty}
    <div class="chart-state">
      <p>No assets found in ownership network for {entityName || entityId}</p>
    </div>
  {/if}

  <div class="chart-wrapper" class:hidden={loading || !!error || isEmpty}>
    <div bind:this={container} class="chart-render"></div>
  </div>

  <div id="additional-info" class:hidden={loading || !!error || isEmpty}>
    <p>
      <span>
        {entityName || entityId} has stakes in
        <strong>{additionalAssets.toLocaleString()}</strong> additional assets identified in the Global
        Energy Ownership Trackers
      </span>
    </p>
  </div>

  <div id="legend-container" class:hidden={loading || !!error || isEmpty}>
    <div
      id="legend-container-status"
      class="legend-container"
      class:tracker-colored={colorByTracker}
    >
      <p class="title">Asset Status <span>(top-right icons)</span></p>
      <div id="legend-status" class="legend" class:single={trackerLegend.length === 0}>
        {#each statusLegend as item}
          <div class="legend-item">
            <span class="legend-dot-wrap">
              <span
                class="legend-bubble"
                style={colorByTracker ? '' : `background-color:${item.color};`}
              ></span>
              {#if !prospectiveLegend}
                {#if item.kind === 'planned'}
                  <span class="legend-mark proposed"></span>
                {:else if item.kind === 'retired'}
                  <span class="legend-mark cross retired">✕</span>
                {:else if item.kind === 'cancelled'}
                  <span class="legend-mark cross cancelled">✕</span>
                {/if}
              {/if}
            </span>
            <span class="legend-label">{item.label}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if trackerLegend.length > 0}
      <div id="legend-container-type" class="legend-container">
        <p class="title">Asset Types</p>
        <div id="legend-type" class="legend">
          {#each trackerLegend as item}
            <div class="legend-item">
              {#if colorByTracker}
                <span class="legend-bubble" style="background-color:{item.color};"></span>
              {/if}
              <span class="legend-label">{item.label}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .sticky-section {
    position: relative;
    width: 100%;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    max-height: 760px;
    overflow: auto;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-gray-50, #fafaf7);
  }

  .sticky-section.fill-height {
    max-height: none;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  #chart-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    gap: 2em;
    padding: 0.5em 1.4em;
    border-bottom: 3px solid var(--color-border);
    background: var(--gem-primary-blue);
    color: var(--gem-white);
  }

  .name-wrapper {
    min-width: 250px;
  }

  .subtitle {
    font-size: 0.7em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    color: var(--gem-mint);
    margin: 0 0 0.5em 0;
  }

  h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--gem-white);
  }

  .company-details {
    font-size: 0.9em;
    margin: 0;
  }

  .loading-hint {
    opacity: 0.6;
    font-style: italic;
    font-size: 0.85em;
  }

  .chart-wrapper {
    overflow: visible;
    background: var(--color-gray-50, #fafaf7);
  }

  .chart-render {
    width: 100%;
    overflow-x: auto;
    overflow-y: visible;
  }

  .chart-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: 13px;
  }

  .chart-state p {
    margin: 0;
  }

  .chart-state--error {
    color: var(--color-error);
  }

  .progress-msg {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  #additional-info p {
    max-width: 100%;
    text-align: center;
    font-style: italic;
    color: var(--gem-primary-blue);
    font-weight: 500;
    font-size: 0.95em;
    margin: 0.6em auto 0.8em auto;
  }

  #additional-info span {
    display: inline-block;
    padding: 0.8em;
    border-top: 2px solid var(--gem-orange, #d45f42);
  }

  #legend-container {
    position: sticky;
    bottom: 0;
    z-index: 20;
    padding: 0.6em 1.2em 1em 1.2em;
    border-top: 3px solid var(--gem-primary-blue);
    background: var(--color-gray-50, #fafaf7);
    color: var(--color-text-primary, #002c40);
    backdrop-filter: blur(4px);
  }

  .legend-container .title {
    width: 100%;
    text-align: center;
    font-size: 0.7em;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.07em;
    margin: 0.2em 0 0.5em 0;
    color: var(--gem-primary-blue);
  }

  .legend-container .title span {
    text-transform: lowercase;
    font-weight: 500;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1.2em;
    align-items: flex-start;
    justify-content: center;
    font-size: 0.9em;
  }

  #legend-status {
    border-bottom: 2px solid var(--color-border);
    width: fit-content;
    margin: 0 auto 1em auto;
    padding: 0.5em 3em;
  }

  #legend-status.single {
    border-bottom: none;
    margin: 0 auto;
    padding: 0;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.45em;
  }

  .legend-dot-wrap {
    position: relative;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .chart-render :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .legend-bubble {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    display: inline-block;
  }

  .legend-mark.proposed {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    top: -1px;
    right: -1px;
    background: #f9d14f;
  }

  .legend-mark.cross {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 8px;
    line-height: 1;
    font-weight: 700;
  }

  .legend-mark.cross.retired {
    color: #6e8c91;
  }

  .legend-mark.cross.cancelled {
    color: #dce3e5;
  }

  .legend-label {
    text-transform: capitalize;
  }

  /* When assets are colored by tracker type, show status legend circles as grey outlines.
     Shrink by 1.5px (stroke is centered on the path, so 0.75px bleeds inward on each side). */
  .tracker-colored .legend-bubble {
    background-color: transparent;
    border: 1.5px solid #9ca3af;
    width: 11.5px;
    height: 11.5px;
  }

  .tracker-colored .legend-mark.proposed {
    background: #9ca3af;
  }

  .tracker-colored .legend-mark.cross.retired,
  .tracker-colored .legend-mark.cross.cancelled {
    color: #9ca3af;
  }
</style>
