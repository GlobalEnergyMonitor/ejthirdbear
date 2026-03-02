<script>
  /**
   * AssetScreenerChart — Svelte wrapper for the D3 ownership screener chart.
   *
   * Fetches the ownership graph for an entity, transforms it into chart data,
   * and renders the D3 visualization imperatively into a bound container.
   */

  import { onMount } from 'svelte';
  import { fetchChartData, buildSubsidiaryGroups } from './screener-chart-data';
  import { renderChart } from './screener-chart-render';

  // Props
  let {
    entityId = '',
    entityName = '',
    assetClassName = '',
    trackerSlug = '',
  } = $props();

  // State
  let container = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let progressMsg = $state('');
  let chartCleanup = null;
  let isEmpty = $state(false);

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

      // Measure container width
      const containerWidth = container.clientWidth || 960;

      // Render D3 chart
      chartCleanup = renderChart(container, chartData, subsidiaryGroups, {
        width: containerWidth,
        colorField: 'tracker',
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

<div class="screener-chart-wrapper">
  {#if loading}
    <div class="loading-state">
      <div class="spinner"></div>
      <p class="progress-msg">{progressMsg || 'Loading ownership data...'}</p>
    </div>
  {/if}

  {#if error && !loading}
    <div class="error-state">
      <p>{error}</p>
    </div>
  {/if}

  {#if isEmpty && !loading}
    <div class="empty-state">
      <p>No assets found in ownership network for {entityName || entityId}</p>
    </div>
  {/if}

  <div
    bind:this={container}
    class="chart-container"
    class:hidden={loading || !!error || isEmpty}
  ></div>
</div>

<style>
  .screener-chart-wrapper {
    position: relative;
    width: 100%;
    min-height: 200px;
  }

  .chart-container {
    width: 100%;
    overflow-x: auto;
    overflow-y: visible;
  }

  .chart-container.hidden {
    display: none;
  }

  .loading-state,
  .error-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    color: var(--color-text-tertiary);
  }

  .error-state {
    color: var(--color-error);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-text-tertiary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 12px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-msg {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  /* Make SVG responsive */
  .chart-container :global(svg) {
    max-width: 100%;
    height: auto;
  }
</style>
