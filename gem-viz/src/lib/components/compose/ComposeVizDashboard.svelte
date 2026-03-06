<script lang="ts">
  import MiniHistogram from '$lib/components/charts/MiniHistogram.svelte';
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import MiniBarChart from '$lib/components/charts/MiniBarChart.svelte';

  let {
    loading,
    initialLoadComplete,
    resultsLength,
    statusDistribution,
    trackerDistribution,
    countryDistribution,
    capacityData,
    startYearData,
    statusColors,
    baseStatusDistribution = [],
    baseTrackerDistribution = [],
    baseCountryDistribution = [],
    hasFilters = false,
  }: {
    loading: boolean;
    initialLoadComplete: boolean;
    resultsLength: number;
    statusDistribution: Array<Record<string, unknown>>;
    trackerDistribution: Array<Record<string, unknown>>;
    countryDistribution: Array<Record<string, unknown>>;
    capacityData: Array<number | Record<string, unknown>>;
    startYearData: Array<number | Record<string, unknown>>;
    statusColors: Record<string, string>;
    baseStatusDistribution?: Array<Record<string, unknown>>;
    baseTrackerDistribution?: Array<Record<string, unknown>>;
    baseCountryDistribution?: Array<Record<string, unknown>>;
    hasFilters?: boolean;
  } = $props();
</script>

<div class="viz-dashboard" class:loading>
  <div class="viz-row">
    <div class="viz-card">
      {#if loading || !initialLoadComplete || resultsLength === 0}
        <div class="skeleton-chart">
          <div class="skeleton-label"></div>
          <div class="skeleton-bars">
            <div class="skeleton-bar" style="width: 80%"></div>
            <div class="skeleton-bar" style="width: 60%"></div>
            <div class="skeleton-bar" style="width: 40%"></div>
          </div>
        </div>
      {:else}
        <MiniBarChart
          data={statusDistribution}
          compareData={hasFilters ? baseStatusDistribution : []}
          label="Status"
          maxItems={4}
          width={120}
          barHeight={10}
          gap={2}
          colorMap={statusColors}
          compact
        />
      {/if}
    </div>

    <div class="viz-card">
      {#if loading || !initialLoadComplete || resultsLength === 0}
        <div class="skeleton-chart">
          <div class="skeleton-label"></div>
          <div class="skeleton-bars">
            <div class="skeleton-bar" style="width: 90%"></div>
            <div class="skeleton-bar" style="width: 50%"></div>
            <div class="skeleton-bar" style="width: 30%"></div>
          </div>
        </div>
      {:else}
        <MiniBarChart
          data={trackerDistribution}
          compareData={hasFilters ? baseTrackerDistribution : []}
          label="Tracker"
          maxItems={4}
          width={120}
          barHeight={10}
          gap={2}
          compact
        />
      {/if}
    </div>

    <div class="viz-card">
      {#if loading || !initialLoadComplete || resultsLength === 0}
        <div class="skeleton-chart">
          <div class="skeleton-label"></div>
          <div class="skeleton-bars">
            <div class="skeleton-bar" style="width: 70%"></div>
            <div class="skeleton-bar" style="width: 55%"></div>
            <div class="skeleton-bar" style="width: 45%"></div>
          </div>
        </div>
      {:else}
        <MiniBarChart
          data={countryDistribution}
          compareData={hasFilters ? baseCountryDistribution : []}
          label="Countries"
          maxItems={4}
          width={120}
          barHeight={10}
          gap={2}
          compact
        />
      {/if}
    </div>

    <div class="viz-card">
      {#if loading || !initialLoadComplete || resultsLength === 0}
        <div class="skeleton-chart">
          <div class="skeleton-label"></div>
          <div class="skeleton-histogram">
            <div class="skeleton-hist-bar" style="height: 40%"></div>
            <div class="skeleton-hist-bar" style="height: 70%"></div>
            <div class="skeleton-hist-bar" style="height: 100%"></div>
            <div class="skeleton-hist-bar" style="height: 80%"></div>
            <div class="skeleton-hist-bar" style="height: 50%"></div>
            <div class="skeleton-hist-bar" style="height: 30%"></div>
          </div>
        </div>
      {:else if capacityData.length > 0}
        <MiniHistogram
          data={capacityData}
          label="Capacity"
          unit="MW"
          bins={8}
          width={120}
          height={36}
          showAxis={false}
          compact
        />
      {/if}
    </div>

    <div class="viz-card">
      {#if loading || !initialLoadComplete || resultsLength === 0}
        <div class="skeleton-chart">
          <div class="skeleton-label"></div>
          <div class="skeleton-sparkline"></div>
        </div>
      {:else if startYearData.length > 1}
        <Sparkline data={startYearData} label="Start Year" width={120} height={32} compact />
      {/if}
    </div>
  </div>
</div>

<style>
  .viz-dashboard {
    margin-bottom: 6px;
    padding: 4px;
    transition: opacity 0.2s ease;
  }

  .viz-dashboard.loading {
    opacity: 0.7;
  }

  .viz-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: stretch;
  }

  .viz-card {
    flex: 1 1 140px;
    min-width: 140px;
    max-width: 180px;
    min-height: 50px;
    padding: 6px 8px;
    transition: opacity 0.15s ease;
  }

  .skeleton-chart {
    min-height: 50px;
  }

  .skeleton-label {
    width: 50px;
    height: var(--space-2);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .skeleton-bar {
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: 1px;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bar:nth-child(2) {
    animation-delay: 0.1s;
  }
  .skeleton-bar:nth-child(3) {
    animation-delay: 0.2s;
  }

  .skeleton-histogram {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: var(--space-9);
  }

  .skeleton-hist-bar {
    flex: 1;
    background: var(--color-gray-100);
    border-radius: 1px 1px 0 0;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-hist-bar:nth-child(2) {
    animation-delay: 0.05s;
  }
  .skeleton-hist-bar:nth-child(3) {
    animation-delay: 0.1s;
  }
  .skeleton-hist-bar:nth-child(4) {
    animation-delay: 0.15s;
  }
  .skeleton-hist-bar:nth-child(5) {
    animation-delay: 0.2s;
  }
  .skeleton-hist-bar:nth-child(6) {
    animation-delay: 0.25s;
  }

  .skeleton-sparkline {
    height: var(--space-8);
    background: linear-gradient(
      90deg,
      var(--color-gray-100) 0%,
      var(--color-gray-50) 50%,
      var(--color-gray-100) 100%
    );
    background-size: 200% 100%;
    border-radius: var(--radius-sm);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 768px) {
    .viz-row {
      flex-direction: column;
    }

    .viz-card {
      max-width: none;
      width: 100%;
    }
  }
</style>
