<script>
  /**
   * TopOwners Widget
   * Rankings of entities by asset count or total capacity
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { entityLink } from '$lib/links';

  // Props
  let {
    limit = 10,
    metric = 'assets', // 'assets' or 'capacity'
    tracker = null, // null for all, or specific tracker name
    title = 'Top Owners',
  } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let results = $state([]);
  let queryTime = $state(0);

  const metricLabel = $derived(metric === 'capacity' ? 'Capacity (MW)' : 'Assets');

  async function loadData() {
    loading = true;
    error = null;

    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';
    const capacityCol = metric === 'capacity' ? 'SUM(COALESCE("Capacity (MW)", 0))' : 'COUNT(*)';

    const sql = `
      SELECT
        "Owner" as owner_name,
        "Owner GEM Entity ID" as entity_id,
        ${capacityCol} as value,
        COUNT(DISTINCT "GEM unit ID") as asset_count
      FROM ownership
      ${trackerFilter}
      WHERE "Owner" IS NOT NULL AND "Owner" != ''
      GROUP BY "Owner", "Owner GEM Entity ID"
      ORDER BY value DESC
      LIMIT ${limit}
    `;

    const result = await widgetQuery(sql);

    if (result.success) {
      results = result.data || [];
      queryTime = result.executionTime || 0;
    } else {
      error = result.error;
    }

    loading = false;
  }

  onMount(() => {
    loadData();
  });

  // Reload when props change
  $effect(() => {
    // Track dependencies
    void limit;
    void metric;
    void tracker;
    loadData();
  });
</script>

<div class="widget top-owners">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{queryTime}ms</span>
  </header>

  {#if loading}
    <div class="loading">Loading rankings...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if results.length === 0}
    <div class="empty">No data available</div>
  {:else}
    <ol class="rankings">
      {#each results as row, i}
        <li>
          <span class="rank">#{i + 1}</span>
          <a href={entityLink(row.entity_id)} class="name">{row.owner_name}</a>
          <span class="value">
            {metric === 'capacity'
              ? `${Math.round(row.value).toLocaleString()} MW`
              : `${row.asset_count} assets`}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .widget {
    background: var(--color-white);
    border: 1px solid var(--color-border);
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--color-gray-100);
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
    color: var(--color-text-tertiary);
    font-family: monospace;
  }

  .loading,
  .error,
  .empty {
    font-size: 13px;
    color: var(--color-text-secondary);
    padding: 20px 0;
    text-align: center;
  }
  .error {
    color: var(--color-error);
  }

  .rankings {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .rankings li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--color-gray-100);
    font-size: 13px;
  }
  .rankings li:last-child {
    border-bottom: none;
  }
  .rank {
    color: var(--color-text-tertiary);
    font-size: 11px;
    min-width: 24px;
  }
  .name {
    flex: 1;
    color: var(--color-gray-700);
    text-decoration: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name:hover {
    text-decoration: underline;
  }
  .value {
    font-family: monospace;
    font-size: 12px;
    color: var(--color-gray-700);
    white-space: nowrap;
  }
</style>
