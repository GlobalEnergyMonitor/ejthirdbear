<script>
  /**
   * AssetScreenerChart — Svelte wrapper for the D3 ownership screener chart.
   *
   * Fetches the ownership graph for an entity, transforms it into chart data,
   * and renders the D3 visualization imperatively into a bound container.
   */

  import { onMount } from 'svelte';
  import {
    getTrackerColor,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
  } from '$lib/design-tokens';
  import { fetchChartData, buildSubsidiaryGroups } from './screener-chart-data';
  import { renderChart } from './screener-chart-render';

  // Props
  let {
    entityId = '',
    entityName = '',
    assetClassName = '',
    trackerSlug = '',
    filteredAssetCount = null,
  } = $props();

  // State
  let container = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let progressMsg = $state('');
  let chartCleanup = null;
  let isEmpty = $state(false);
  let totalAssets = $state(0);
  let directSubsidiaries = $state(0);
  let trackerLegend = $state([]);
  let statusLegend = $state([]);
  let prospectiveLegend = $state(false);

  const hasFilteredAssetCount = $derived(
    typeof filteredAssetCount === 'number' && !Number.isNaN(filteredAssetCount)
  );
  const matchedAssets = $derived(
    hasFilteredAssetCount ? Math.max(0, Math.min(filteredAssetCount, totalAssets)) : totalAssets
  );
  const additionalAssets = $derived(Math.max(0, totalAssets - matchedAssets));

  async function loadAndRender() {
    if (!entityId || !container) return;

    try {
      loading = true;
      error = null;
      isEmpty = false;

      // Clean up previous render
      if (chartCleanup) {
        chartCleanup();
        chartCleanup = null;
      }

      // Fetch and transform data
      const chartData = await fetchChartData(entityId, (msg) => {
        progressMsg = msg;
      });

      if (chartData.assets.length === 0) {
        isEmpty = true;
        loading = false;
        return;
      }

      // Build subsidiary group layout
      const subsidiaryGroups = buildSubsidiaryGroups(chartData);
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
      const allProspective =
        rawStatuses.length > 0 && rawStatuses.every((s) => prospectiveStatuses.includes(s));
      prospectiveLegend = allProspective;

      if (allProspective) {
        const items = [];
        for (const [color, { descript, statuses }] of statusColorsProspective) {
          if (statuses.some((s) => rawStatuses.includes(s))) {
            items.push({ label: descript, color, kind: 'prospective-detail' });
          }
        }
        statusLegend = items;
      } else {
        const order = ['operating', 'prospective', 'retired', 'cancelled', 'unknown'];
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
      });

      loading = false;
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AssetScreenerChart] Error:', err);
      error = err?.message || 'Failed to load ownership chart';
      loading = false;
    }
  }

  onMount(() => {
    loadAndRender();

    return () => {
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

<section class="sticky-section">
  <div id="chart-header">
    <div class="name-wrapper">
      <p class="subtitle">Owner</p>
      <h3>{entityName || entityId}</h3>
    </div>
    <div>
      <p class="subtitle">Details</p>
      <p class="company-details">
        {matchedAssets}
        {assetClassName || 'assets'} via {directSubsidiaries} direct {directSubsidiaries === 1
          ? 'subsidiary'
          : 'subsidiaries'}
      </p>
    </div>
  </div>

  {#if loading}
    <div class="chart-state">
      <div class="spinner"></div>
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
    <div id="legend-container-status" class="legend-container">
      <p class="title">Asset Status <span>(top-right icons)</span></p>
      <div id="legend-status" class="legend" class:single={trackerLegend.length === 0}>
        {#each statusLegend as item}
          <div class="legend-item">
            <span class="legend-dot-wrap">
              <span class="legend-bubble" style="background-color:{item.color};"></span>
              {#if !prospectiveLegend}
                {#if item.kind === 'prospective'}
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
              <span class="legend-bubble" style="background-color:{item.color};"></span>
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
    border: 1px solid #e4e7eb;
    border-radius: 8px;
    background: #fafaf7;
  }

  #chart-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    gap: 2em;
    padding: 0.5em 1.4em;
    border-bottom: 3px solid #d8d8ce;
    background: #004a63;
    color: #ffffff;
  }

  .name-wrapper {
    min-width: 250px;
  }

  .subtitle {
    font-size: 0.7em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    color: #7dc8c0;
    margin: 0 0 0.5em 0;
  }

  h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: #ffffff;
  }

  .company-details {
    font-size: 0.9em;
    margin: 0;
  }

  .chart-wrapper {
    min-height: 420px;
    overflow: visible;
    background: #fafaf7;
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

  .spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-text-tertiary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 8px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    color: #002c40;
    font-weight: 500;
    font-size: 0.95em;
    margin: 0.6em auto 0.8em auto;
  }

  #additional-info span {
    display: inline-block;
    padding: 0.8em;
    border-top: 2px solid #d45f42;
  }

  #legend-container {
    position: sticky;
    bottom: 0;
    z-index: 20;
    padding: 0.6em 1.2em 1em 1.2em;
    border-top: 3px solid #004a63;
    background: #fafaf7;
    color: #002c40;
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
    color: #004a63;
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
    border-bottom: 2px solid #e6e6e6;
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
</style>
