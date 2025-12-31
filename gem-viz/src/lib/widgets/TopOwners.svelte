<script lang="ts">
  /**
   * TopOwners Widget
   * Rankings of entities by asset count or total capacity
   */

  import { onMount, tick } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { entityLink } from '$lib/links';
  import { formatCount, formatCapacity } from '$lib/format';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';
  import { staggerIn } from '$lib/animations';

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

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<OwnerRow[]>([]);
  let queryTime = $state(0);
  let listEl: HTMLElement | null = null;

  async function animateList() {
    await tick();
    if (listEl) {
      const items = listEl.querySelectorAll('li');
      if (items.length > 0) {
        staggerIn(Array.from(items), { staggerDelay: 40, duration: 350, distance: 12 });
      }
    }
  }

  async function loadData() {
    loading = true;
    error = null;
    const startTime = Date.now();

    const capacityCol = metric === 'capacity' ? 'SUM(COALESCE("Capacity (MW)", 0))' : 'COUNT(*)';
    const trackerCondition = tracker ? `AND "Tracker" = '${tracker}'` : '';

    try {
      const result = await widgetQuery<OwnerRow>(`
        SELECT
          "Owner" as owner_name,
          "Owner GEM Entity ID" as entity_id,
          ${capacityCol} as value,
          COUNT(DISTINCT "GEM unit ID") as asset_count
        FROM ownership
        WHERE "Owner" IS NOT NULL AND "Owner" != ''
        ${trackerCondition}
        GROUP BY "Owner", "Owner GEM Entity ID"
        ORDER BY value DESC
        LIMIT ${limit}
      `);

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      data = result.data || [];
      queryTime = Date.now() - startTime;
      animateList();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      queryTime = Date.now() - startTime;
    } finally {
      loading = false;
    }
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
    <span class="query-time">{queryTime}ms</span>
  </header>

  <LoadingWrapper {loading} {error} empty={data.length === 0} loadingMessage="Loading rankings...">
    <ol class="rankings" bind:this={listEl}>
      {#each data as row, i}
        <li>
          <span class="rank">#{i + 1}</span>
          <a href={entityLink(row.entity_id)} class="name">{row.owner_name}</a>
          <span class="value">
            {metric === 'capacity'
              ? formatCapacity(row.value)
              : `${formatCount(row.asset_count)} assets`}
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
