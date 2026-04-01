<script>
  /**
   * Embeddable Portfolio Explorer
   * Compact version for iframes — shows entity's downstream assets
   * with tree visualization, asset grid, and crossfilter footer.
   *
   * URL params (overridable via hash for Drupal):
   *   id       - Required. Entity ID (e.g. E100001000347)
   *   hideTree - Optional. Hide the tree chart (default: false)
   *   hidePicker - Optional. Hide the entity picker bar (default: true for embed)
   *
   * Hash params: id, hideTree, hidePicker
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { readHash } from '../embed-utils';
  import * as d3Array from 'd3-array';
  import {
    colors,
    trackerColorMap,
    statusColorsGranular,
    ownershipColors,
  } from '$lib/design-tokens';

  const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  let entityId = $state($page.url.searchParams.get('id') || '');
  let hidePicker = $state($page.url.searchParams.get('hidePicker') !== 'false');
  let loading = $state(false);
  let error = $state('');
  let ownerName = $state('');
  let assetCount = $state(0);
  let trackerCount = $state(0);
  let byCountry = $state([]);
  let byType = $state([]);
  let byStatus = $state([]);
  let intermediaryList = $state([]);

  onMount(() => {
    const h = readHash();
    if (h.id) entityId = h.id;
    if (entityId) fetchData(entityId);
  });

  function uniqueCountIfNull(arr, f1, f2) {
    return new Set(arr.map((d) => d[f1] || d[f2])).size;
  }

  async function fetchData(id) {
    loading = true;
    error = '';
    try {
      const resp = await fetch(
        `${API_BASE}/ownership/graph?root=${encodeURIComponent(id)}&direction=down&max_depth=5&format=json`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (!resp.ok) throw new Error(`API ${resp.status}`);
      const data = await resp.json();
      const root = data.root;
      ownerName = root?.name || root?.full_name || id;
      const assets = (data.nodes || []).filter((n) => n.node_type === 'asset');
      assetCount = uniqueCountIfNull(assets, 'location_id', 'asset_id');
      trackerCount = new Set(assets.map((a) => a.asset_type)).size;

      byCountry = [...d3Array.rollup(assets, (v) => uniqueCountIfNull(v, 'location_id', 'asset_id'), (d) => d.country || 'Unknown')]
        .sort((a, b) => b[1] - a[1]);
      byType = [...d3Array.rollup(assets, (v) => uniqueCountIfNull(v, 'location_id', 'asset_id'), (d) => d.asset_type || 'Unknown')]
        .sort((a, b) => b[1] - a[1]);
      byStatus = [...d3Array.rollup(assets, (v) => uniqueCountIfNull(v, 'location_id', 'asset_id'), (d) => d.operating_status || 'Unknown')]
        .sort((a, b) => b[1] - a[1]);

      const entities = (data.nodes || []).filter((n) => n.node_type === 'entity' && n.entity_id !== root.entity_id);
      intermediaryList = entities
        .map((e) => ({ name: e.name || e.full_name || e.entity_id }))
        .slice(0, 10);
    } catch (e) {
      error = e.message || 'Failed to load';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Portfolio Explorer — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !entityId}
  <p class="embed-msg">Missing required <code>id</code> parameter</p>
{:else if loading}
  <p class="embed-msg">Loading portfolio…</p>
{:else if error}
  <p class="embed-msg error">{error}</p>
{:else}
  <div class="pe-embed">
    <div class="pe-header">
      <div>
        <p class="subtitle">Owner</p>
        <h3>{ownerName}</h3>
      </div>
      <p class="fact">Stakes in {assetCount} asset{assetCount !== 1 ? 's' : ''} in {trackerCount} GEM tracker{trackerCount !== 1 ? 's' : ''}</p>
    </div>

    <div class="pe-footer">
      <div class="pe-col">
        <p class="subtitle">By Location</p>
        {#each byCountry as [name, count]}
          <div class="pe-row">{name} ({count})</div>
        {/each}
      </div>
      <div class="pe-col">
        <p class="subtitle">By Type</p>
        {#each byType as [name, count]}
          <div class="pe-row">{name} ({count})</div>
        {/each}
      </div>
      <div class="pe-col">
        <p class="subtitle">By Status</p>
        {#each byStatus as [name, count]}
          <div class="pe-row">{name} ({count})</div>
        {/each}
      </div>
      {#if intermediaryList.length > 0}
        <div class="pe-col">
          <p class="subtitle">Intermediaries</p>
          {#each intermediaryList as inter}
            <div class="pe-row">{inter.name}</div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="pe-link">
      <a href="/portfolio-explorer/" target="_blank" rel="noopener">
        Open full Portfolio Explorer →
      </a>
    </div>
  </div>
{/if}

<style>
  .pe-embed {
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    color: var(--color-text-primary, #1d4961);
  }
  .embed-msg {
    padding: var(--space-5, 20px);
    text-align: center;
    font-size: var(--font-size-sm, 14px);
    color: var(--color-text-secondary, #4c6267);
  }
  .embed-msg.error {
    color: var(--color-error, #7f142a);
  }
  .pe-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: var(--space-6, 24px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: var(--gem-navy, #1d4961);
    color: white;
  }
  .pe-header h3 {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: var(--font-weight-bold, 700);
    color: white;
  }
  .subtitle {
    font-size: var(--font-size-xs, 12px);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    color: var(--gem-mint, #9df7e5);
    margin: 0 0 var(--space-1, 4px);
  }
  .fact {
    font-size: var(--font-size-sm, 14px);
    margin: 0;
    opacity: 0.9;
  }
  .pe-footer {
    display: flex;
    gap: var(--space-8, 32px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: var(--gem-navy, #1d4961);
    color: white;
    margin-top: 1px;
  }
  .pe-col {
    min-width: 100px;
  }
  .pe-row {
    font-size: var(--font-size-sm, 14px);
    padding: 1px 0;
  }
  .pe-link {
    padding: var(--space-2, 8px) var(--space-4, 16px);
    text-align: right;
  }
  .pe-link a {
    font-size: var(--font-size-xs, 12px);
    color: var(--gem-navy, #1d4961);
    text-decoration: none;
  }
  .pe-link a:hover {
    text-decoration: underline;
  }
</style>
