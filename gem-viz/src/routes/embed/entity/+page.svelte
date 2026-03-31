<script lang="ts">
  /**
   * Embeddable Entity Card
   * Compact entity profile with ownership flower and asset list.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   id - Required. Entity ID
   *   showFlower - Optional. Show ownership flower (default: true)
   *   showAssets - Optional. Show asset list (default: true)
   *   showChart - Optional. Show ownership structure chart (default: false)
   *   showMap - Optional. Show asset map (default: false)
   *   maxAssets - Optional. Max assets to show (default: 10)
   *
   * Hash params: id, showFlower, showAssets, showChart, showMap, maxAssets
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { assetLink } from '$lib/links';
  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import TrackerIcon from '$lib/components/tracker/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import {
    loadEntityPortfolio,
    errorMessage,
    intParam,
    boolParam,
    readHash,
    type EmbedPortfolio,
  } from '../embed-utils';
  import EntityMap from '$lib/components/map/EntityMap.svelte';
  import type { SpotlightAsset } from '$lib/ownership-data';

  // URL params (converted to $state so hash can override on mount)
  let entityId = $state($page.url.searchParams.get('id'));
  let showFlower = $state(boolParam($page.url.searchParams.get('showFlower')));
  let showAssets = $state(boolParam($page.url.searchParams.get('showAssets')));
  let showChart = $state($page.url.searchParams.get('showChart') === 'true');
  let showMap = $state($page.url.searchParams.get('showMap') === 'true');
  let maxAssets = $state(intParam($page.url.searchParams.get('maxAssets'), 10));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<EmbedPortfolio | null>(null);
  let mapAssets = $state<SpotlightAsset[]>([]);

  const entityName = $derived(portfolio?.spotlightOwner?.Name || entityId || '');
  const assets = $derived(portfolio?.assets || []);
  const displayAssets = $derived((assets as any[]).slice(0, maxAssets));

  // Derive subsidiary list from portfolio entityMap (excluding root entity)
  const subsidiaries = $derived.by(() => {
    if (!portfolio?.entityMap || !entityId) return [];
    return Array.from(portfolio.entityMap.entries())
      .filter(([id]) => id !== entityId)
      .map(([id, ent]) => ({
        id,
        name: ent.Name,
        ownershipPct: portfolio!.matchedEdges?.get(id)?.value ?? null,
      }));
  });

  const trackerCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    (assets as any[]).forEach((a) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.id) entityId = h.id;
    if (h.showFlower !== undefined) showFlower = boolParam(h.showFlower);
    if (h.showAssets !== undefined) showAssets = boolParam(h.showAssets);
    if (h.showChart !== undefined) showChart = h.showChart === 'true';
    if (h.showMap !== undefined) showMap = h.showMap === 'true';
    if (h.maxAssets !== undefined) maxAssets = intParam(h.maxAssets, 10);

    if (!entityId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      const result = await loadEntityPortfolio(entityId);
      portfolio = result.portfolio;

      // Portfolio now includes real assets — use them for map
      if (showMap && portfolio.assets?.length) {
        mapAssets = portfolio.assets;
      }
    } catch (err) {
      error = errorMessage(err, 'Failed to load entity');
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{entityName} — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="entity-embed">
  {#if loading}
    <div class="embed-loading">Loading entity...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !entityId}
        <p class="embed-hint">Example: ?id=E12345</p>
      {/if}
    </div>
  {:else}
    <header class="entity-header">
      <div class="header-text">
        <h1>{entityName}</h1>
        <p class="subtitle">
          {#if (assets as any[]).length > 0}
            {(assets as any[]).length.toLocaleString()} assets
          {:else if subsidiaries.length > 0}
            {subsidiaries.length.toLocaleString()} subsidiaries
          {:else}
            No assets
          {/if}
        </p>
      </div>
      {#if showFlower && portfolio}
        <div class="header-flower">
          <OwnershipFlower
            ownerId={entityId}
            {portfolio}
            size="small"
            showTitle={false}
            showLabels={false}
          />
        </div>
      {/if}
    </header>

    {#if trackerCounts.length > 0}
      <div class="tracker-summary">
        {#each trackerCounts as { tracker, count }}
          <span class="tracker-chip">
            <TrackerIcon {tracker} size={12} />
            {tracker}: {count}
          </span>
        {/each}
      </div>
    {/if}

    {#if showChart && entityId}
      <AssetScreenerChart {entityId} {entityName} />
    {/if}

    {#if showMap && mapAssets.length > 0}
      <div class="map-section">
        <EntityMap assets={mapAssets} height={250} />
      </div>
    {/if}

    {#if showAssets && displayAssets.length > 0}
      <div class="asset-list">
        {#each displayAssets as asset}
          <a href={assetLink(asset.id)} class="asset-row" target="_blank" rel="noopener">
            <TrackerIcon tracker={asset.tracker} size={12} />
            <span class="asset-name">{asset.name || asset.id}</span>
            {#if asset.status}
              <StatusIcon status={asset.status} size={10} />
            {/if}
            {#if asset.capacityMw}
              <span class="capacity">{Number(asset.capacityMw).toLocaleString()} MW</span>
            {/if}
          </a>
        {/each}
        {#if (assets as any[]).length > maxAssets}
          <p class="more-assets">+ {(assets as any[]).length - maxAssets} more assets</p>
        {/if}
      </div>
    {:else if showAssets && subsidiaries.length > 0}
      <div class="asset-list">
        <h2>Subsidiaries ({subsidiaries.length})</h2>
        {#each subsidiaries.slice(0, maxAssets) as sub}
          <div class="asset-row">
            <span class="asset-name">{sub.name}</span>
            {#if sub.ownershipPct != null}
              <span class="capacity">{sub.ownershipPct.toFixed(1)}%</span>
            {/if}
          </div>
        {/each}
        {#if subsidiaries.length > maxAssets}
          <p class="more-assets">+ {subsidiaries.length - maxAssets} more subsidiaries</p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .entity-embed {
    width: 100%;
    max-width: 500px;
    font-family: var(--font-family-sans);
  }

  .entity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .header-text {
    flex: 1;
  }
  .header-flower {
    flex-shrink: 0;
  }

  h1 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0 0 var(--space-1) 0;
  }

  .subtitle {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .tracker-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .tracker-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: var(--font-size-sm);
    background: var(--color-bg-tertiary);
    border: var(--border-width) solid var(--color-border);
  }

  .asset-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .asset-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border-light);
    text-decoration: none;
    color: inherit;
    font-size: var(--font-size-body);
    transition: border-color var(--transition-fast);
  }

  .asset-row:hover {
    border-color: var(--color-border-dark);
  }

  .asset-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .capacity {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .more-assets {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-align: center;
    margin: var(--space-2) 0 0 0;
  }

  .map-section {
    margin-top: var(--space-4);
  }

  @media (max-width: 480px) {
    .entity-embed {
      max-width: 100%;
      padding: 8px;
    }

    h1 {
      font-size: var(--font-size-lg);
    }

    .entity-header {
      flex-wrap: wrap;
    }

    .tracker-summary {
      flex-wrap: wrap;
    }

    .asset-row {
      flex-wrap: wrap;
    }
  }
</style>
