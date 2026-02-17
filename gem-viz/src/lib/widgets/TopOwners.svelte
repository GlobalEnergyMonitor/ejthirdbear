<script>
  /**
   * TopOwners Widget
   * Rankings of entities by asset count or total capacity
   */

  import { onMount } from 'svelte';
  import { listAssetsByType, listAssets } from '$lib/ownership-api';
  import { entityLink } from '$lib/links';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';

  // Props
  /** @type {{ limit?: number; metric?: 'assets' | 'capacity'; tracker?: string | null; title?: string }} */
  let { limit = 10, metric = 'assets', tracker = null, title = 'Top Owners' } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let results = $state([]);
  let queryTime = $state(0);

  async function loadData() {
    loading = true;
    error = null;

    try {
      const start = performance.now();
      // Fetch assets (filtered by type if tracker specified)
      const assets = tracker
        ? await listAssetsByType(tracker, { limit: 2000 })
        : (await listAssets({ limit: 500 })).results;

      // Aggregate by owner client-side
      const ownerMap = new Map();
      for (const asset of assets) {
        const eid = asset.ownerEntityId || asset.ownerName || 'Unknown';
        const name = asset.ownerName || eid;
        if (!eid || eid === 'Unknown') continue;

        const existing = ownerMap.get(eid) || { owner_name: name, entity_id: eid, asset_count: 0, value: 0 };
        existing.asset_count += 1;
        existing.value += metric === 'capacity' ? (asset.capacity || 0) : 1;
        ownerMap.set(eid, existing);
      }

      // Sort by metric descending, take top N
      results = Array.from(ownerMap.values())
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);

      queryTime = Math.round(performance.now() - start);
    } catch (err) {
      error = err?.message || 'Failed to load top owners';
    }

    loading = false;
  }

  onMount(() => {
    loadData();
  });

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
    <DataSourceBadge source="api" {queryTime} size="sm" />
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
    font-family: var(--font-family-data);
    font-size: 12px;
    color: var(--color-gray-700);
    white-space: nowrap;
  }
</style>
