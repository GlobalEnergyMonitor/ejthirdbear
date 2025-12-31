<script lang="ts">
  /**
   * CountryBreakdown Widget
   * Assets grouped by country with bar visualization
   *
   * REFACTORED: Uses createWidgetState() composable for state management
   */

  import { onMount } from 'svelte';
  import { createWidgetState } from '$lib/composables.svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  interface CountryRow {
    country: string;
    asset_count: number;
    total_capacity: number;
  }

  // Props
  let { limit = 15, tracker = null as string | null, title = 'Assets by Country' } = $props();

  // State - using composable instead of 5 separate $state() calls
  const state = createWidgetState<CountryRow>();

  // Derived values from state.data
  const results = $derived(state.data || []);
  const maxValue = $derived(
    results.length > 0 ? Math.max(...results.map((r) => r.asset_count)) : 0
  );

  async function loadData() {
    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';

    await state.query(`
      SELECT
        COALESCE("Country", 'Unknown') as country,
        COUNT(DISTINCT "GEM unit ID") as asset_count,
        SUM(COALESCE("Capacity (MW)", 0)) as total_capacity
      FROM ownership
      ${trackerFilter}
      GROUP BY 1
      ORDER BY asset_count DESC
      LIMIT ${limit}
    `);
  }

  onMount(() => {
    loadData();
  });

  $effect(() => {
    void limit;
    void tracker;
    loadData();
  });
</script>

<div class="widget country-breakdown">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{state.queryTime}ms</span>
  </header>

  <LoadingWrapper
    loading={state.loading}
    error={state.error}
    empty={results.length === 0}
    loadingMessage="Loading countries..."
  >
    <div class="bars">
      {#each results as row}
        <div class="bar-row">
          <span class="country">{row.country}</span>
          <div class="bar-container">
            <div class="bar" style="width: {(row.asset_count / maxValue) * 100}%"></div>
          </div>
          <span class="count">{row.asset_count}</span>
        </div>
      {/each}
    </div>
  </LoadingWrapper>
</div>

<style>
  .widget {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .query-time {
    font-size: 10px;
    color: #999;
    font-family: monospace;
  }

  .bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .country {
    min-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #333;
  }
  .bar-container {
    flex: 1;
    height: 16px;
    background: #f0f0f0;
  }
  .bar {
    height: 100%;
    background: #333;
    transition: width 0.3s ease;
  }
  .count {
    min-width: 40px;
    text-align: right;
    font-family: monospace;
    color: #666;
  }
</style>
