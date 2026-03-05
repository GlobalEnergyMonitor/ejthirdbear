<script>
  /**
   * CountryBreakdown Widget
   * Assets grouped by country with bar visualization
   */

  import { onMount } from 'svelte';
  import { listAssetsByType, listAssets, resolveApiSlug } from '$lib/ownership-api';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';

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

    try {
      const start = performance.now();
      const slug = tracker ? resolveApiSlug(tracker) : null;

      if (slug || !tracker) {
        // Use facets for exact counts in a single request
        const facetResult = await listAssets({
          limit: 1,
          facets: true,
          asset_type: slug ?? undefined,
        });

        if (facetResult.facets?.country) {
          results = Object.entries(facetResult.facets.country)
            .map(([country, asset_count]) => ({ country, asset_count }))
            .sort((a, b) => b.asset_count - a.asset_count)
            .slice(0, limit);
        } else {
          results = [];
        }
      } else {
        // Fallback: fetch assets and count client-side
        const assets = await listAssetsByType(tracker, { limit: 2000 });
        const counts = new Map();
        for (const asset of assets) {
          const country = asset.country || 'Unknown';
          counts.set(country, (counts.get(country) || 0) + 1);
        }
        results = Array.from(counts.entries())
          .map(([country, asset_count]) => ({ country, asset_count }))
          .sort((a, b) => b.asset_count - a.asset_count)
          .slice(0, limit);
      }

      maxValue = results.length > 0 ? Math.max(...results.map((r) => r.asset_count)) : 0;
      queryTime = Math.round(performance.now() - start);
    } catch (err) {
      error = err?.message || 'Failed to load country breakdown';
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
    <DataSourceBadge source="api" {queryTime} size="sm" />
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
    color: var(--color-gray-700);
  }
  .bar-container {
    flex: 1;
    height: 16px;
    background: var(--color-gray-100);
  }
  .bar {
    height: 100%;
    background: var(--gem-navy);
    transition: width 0.3s ease;
  }
  .count {
    min-width: 40px;
    text-align: right;
    font-family: var(--font-family-data);
    color: var(--color-text-secondary);
  }
</style>
