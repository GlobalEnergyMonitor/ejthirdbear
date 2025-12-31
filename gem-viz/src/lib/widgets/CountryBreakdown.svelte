<script lang="ts">
  /**
   * CountryBreakdown Widget
   * Assets grouped by country with bar visualization
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  interface CountryRow {
    country_name: string;
    asset_count: number;
    total_capacity: number;
  }

  // Props
  let { limit = 15, tracker = null as string | null, title = 'Assets by Country' } = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<CountryRow[]>([]);
  let queryTime = $state(0);

  // Derived values
  const maxValue = $derived(data.length > 0 ? Math.max(...data.map((r) => r.asset_count)) : 0);

  async function loadData() {
    loading = true;
    error = null;
    const startTime = Date.now();

    const trackerCondition = tracker ? `WHERE o."Tracker" = '${tracker}'` : '';

    try {
      const result = await widgetQuery<CountryRow>(`
        SELECT
          COALESCE(l."Country.Area", 'Unknown') as country_name,
          COUNT(DISTINCT o."GEM unit ID") as asset_count,
          SUM(COALESCE(o."Capacity (MW)", 0)) as total_capacity
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        ${trackerCondition}
        GROUP BY country_name
        ORDER BY asset_count DESC
        LIMIT ${limit}
      `);

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      data = result.data || [];
      queryTime = Date.now() - startTime;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      queryTime = Date.now() - startTime;
    } finally {
      loading = false;
    }
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

  <LoadingWrapper {loading} {error} empty={data.length === 0} loadingMessage="Loading countries...">
    <div class="bars">
      {#each data as row}
        <div class="bar-row">
          <span class="country">{row.country_name}</span>
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
