<script>
  /**
   * CountryBreakdown Widget
   * Assets grouped by country with bar visualization
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';

  // Props
  let { limit = 15, tracker = null, title = 'Assets by Country' } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let results = $state([]);
  let queryTime = $state(0);
  let maxValue = $state(0);

  async function loadData() {
    loading = true;
    error = null;

    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';

    const sql = `
      SELECT
        COALESCE("Country", 'Unknown') as country,
        COUNT(DISTINCT "GEM unit ID") as asset_count,
        SUM(COALESCE("Capacity (MW)", 0)) as total_capacity
      FROM ownership
      ${trackerFilter}
      GROUP BY 1
      ORDER BY asset_count DESC
      LIMIT ${limit}
    `;

    const result = await widgetQuery(sql);

    if (result.success) {
      results = result.data || [];
      maxValue = results.length > 0 ? Math.max(...results.map((r) => r.asset_count)) : 0;
      queryTime = result.executionTime || 0;
    } else {
      error = result.error;
    }

    loading = false;
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
    <span class="query-time">{queryTime}ms</span>
  </header>

  {#if loading}
    <div class="loading">Loading countries...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if results.length === 0}
    <div class="empty">No data available</div>
  {:else}
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
  {/if}
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

  .loading,
  .error,
  .empty {
    font-size: 13px;
    color: #666;
    padding: 20px 0;
    text-align: center;
  }
  .error {
    color: #c00;
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
