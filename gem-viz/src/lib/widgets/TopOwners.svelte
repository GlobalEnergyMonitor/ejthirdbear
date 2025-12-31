<script lang="ts">
  /**
   * TopOwners Widget
   * Rankings of entities by asset count or total capacity
   *
   * REFACTORED: Uses createWidgetState() composable for state management
   */

  import { onMount } from 'svelte';
  import { createWidgetState } from '$lib/composables.svelte';
  import { entityLink } from '$lib/links';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  interface OwnerRow {
    owner_name: string;
    entity_id: string;
    value: number;
    asset_count: number;
  }

  // Props
  let {
    limit = 10,
    metric = 'assets', // 'assets' or 'capacity'
    tracker = null as string | null, // null for all, or specific tracker name
    title = 'Top Owners',
  } = $props();

  // State - now a single composable instead of 4 separate $state() calls
  const state = createWidgetState<OwnerRow>();

  async function loadData() {
    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';
    const capacityCol = metric === 'capacity' ? 'SUM(COALESCE("Capacity (MW)", 0))' : 'COUNT(*)';

    await state.query(`
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
    `);
  }

  onMount(() => loadData());

  // Reload when props change
  $effect(() => {
    void limit;
    void metric;
    void tracker;
    loadData();
  });
</script>

<div class="widget top-owners">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{state.queryTime}ms</span>
  </header>

  <LoadingWrapper
    loading={state.loading}
    error={state.error}
    empty={state.data?.length === 0}
    loadingMessage="Loading rankings..."
  >
    <ol class="rankings">
      {#each state.data || [] as row, i}
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
    border-bottom: 1px solid #f0f0f0;
    font-size: 13px;
  }
  .rankings li:last-child {
    border-bottom: none;
  }
  .rank {
    color: #999;
    font-size: 11px;
    min-width: 24px;
  }
  .name {
    flex: 1;
    color: #333;
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
    color: #333;
    white-space: nowrap;
  }
</style>
