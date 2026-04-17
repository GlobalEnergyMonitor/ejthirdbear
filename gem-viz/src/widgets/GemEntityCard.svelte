<script lang="ts">
  /**
   * GemEntityCard — Dynamic embed widget for entity profiles.
   * Mirrors embed/entity/+page.svelte but uses widget-api (no SvelteKit deps).
   */
  import { onMount } from 'svelte';
  import { assetLink, entityLink, navigate as navTo } from './widget-links';
  import { loadEntityPortfolio, errorMessage, type EmbedPortfolio } from './widget-data';
  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';
  import TrackerIcon from '$lib/components/tracker/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';

  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import EntityMap from '$lib/components/map/EntityMap.svelte';

  interface Props {
    entityId: string;
    showFlower?: boolean;
    showAssets?: boolean;
    showChart?: boolean;
    showMap?: boolean;
    maxAssets?: number;
    linkBase?: string;
    linkTarget?: string;
    theme?: 'light' | 'dark';
  }

  let {
    entityId,
    showFlower = true,
    showAssets = true,
    showChart = false,
    showMap = false,
    maxAssets = 10,
    linkBase = '',
    linkTarget = '',
    theme = 'light',
  }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<EmbedPortfolio | null>(null);

  const entityName = $derived(portfolio?.spotlightOwner?.Name || entityId || '');
  const assets = $derived(portfolio?.assets || []);
  const displayAssets = $derived(assets.slice(0, maxAssets));

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
    assets.forEach((a) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  function handleNavigate(url: string) {
    navTo(url, linkTarget);
  }

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }
    try {
      const result = await loadEntityPortfolio(entityId);
      portfolio = result.portfolio;
    } catch (err) {
      error = errorMessage(err, 'Failed to load entity');
    } finally {
      loading = false;
    }
  });
</script>

<div class="entity-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading entity...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
    </div>
  {:else}
    <header class="entity-header">
      <div class="header-text">
        <h1>{entityName}</h1>
        <p class="subtitle">
          {#if assets.length > 0}
            {assets.length.toLocaleString()} assets
          {:else if subsidiaries.length > 0}
            {subsidiaries.length.toLocaleString()} subsidiaries
          {:else}
            No assets
          {/if}
        </p>
      </div>
      {#if showFlower && portfolio && assets.length > 0}
        <div class="header-flower">
          <OwnershipFlower
            ownerId={entityId}
            {portfolio}
            size="small"
            showTitle={false}
            showLabels={false}
            onNavigate={handleNavigate}
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

    {#if showMap && assets.length > 0}
      <div class="map-section">
        <EntityMap {assets} height={250} />
      </div>
    {/if}

    {#if showAssets && displayAssets.length > 0}
      <div class="asset-list">
        {#each displayAssets as asset}
          <a
            href={assetLink(asset.id, linkBase)}
            class="asset-row"
            target="_blank"
            rel="noopener"
            onclick={(e) => {
              if (linkTarget) {
                e.preventDefault();
                handleNavigate(assetLink(asset.id, linkBase));
              }
            }}
          >
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
        {#if assets.length > maxAssets}
          <p class="more-assets">+ {assets.length - maxAssets} more assets</p>
        {/if}
      </div>
    {:else if showAssets && subsidiaries.length > 0}
      <div class="asset-list">
        <h2>Subsidiaries ({subsidiaries.length})</h2>
        {#each subsidiaries.slice(0, maxAssets) as sub}
          <a
            href={entityLink(sub.id, linkBase)}
            class="asset-row"
            target="_blank"
            rel="noopener"
            onclick={(e) => {
              if (linkTarget) {
                e.preventDefault();
                handleNavigate(entityLink(sub.id, linkBase));
              }
            }}
          >
            <span class="asset-name">{sub.name}</span>
            {#if sub.ownershipPct != null}
              <span class="capacity">{sub.ownershipPct.toFixed(1)}%</span>
            {/if}
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .entity-embed {
    width: 100%;
    max-width: 100%;
    font-family: var(--font-family);
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
  .chart-section {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }
  h2 {
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }
  .map-section {
    margin-top: var(--space-4);
  }
  @media (max-width: 640px) {
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
    .asset-row {
      flex-wrap: wrap;
    }
  }
</style>
