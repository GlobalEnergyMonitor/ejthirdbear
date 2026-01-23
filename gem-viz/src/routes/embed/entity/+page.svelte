<script lang="ts">
  /**
   * Embeddable Entity Card
   * Simplified entity view for iframe embedding
   *
   * URL params:
   *   id - Required. Entity ID
   *   showFlower - Optional. Show ownership flower (default: true)
   *   showAssets - Optional. Show asset list (default: true)
   *   maxAssets - Optional. Max assets to show (default: 10)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { assetLink } from '$lib/links';
  import { fetchOwnerPortfolio } from '$lib/component-data/schema';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';

  // URL params
  const entityId = $derived($page.url.searchParams.get('id'));
  const showFlower = $derived($page.url.searchParams.get('showFlower') !== 'false');
  const showAssets = $derived($page.url.searchParams.get('showAssets') !== 'false');
  const maxAssetsParam = $derived($page.url.searchParams.get('maxAssets'));
  const maxAssets = $derived(maxAssetsParam ? parseInt(maxAssetsParam, 10) : 10);

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<any>(null);

  const entityName = $derived(portfolio?.spotlightOwner?.Name || entityId || '');
  const assets = $derived(portfolio?.assets || []);
  const displayAssets = $derived(assets.slice(0, maxAssets));

  const trackerCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    assets.forEach((a: any) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count }))
      .sort((a, b) => b.count - a.count);
  });

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      portfolio = await fetchOwnerPortfolio(entityId);
      if (!portfolio) {
        error = 'Entity not found';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load entity';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{entityName} | GEM Viz Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="entity-embed">
  {#if loading}
    <div class="loading">Loading entity...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      {#if !entityId}
        <p class="hint">Example: ?id=E12345</p>
      {/if}
    </div>
  {:else}
    <header class="entity-header">
      <div class="header-text">
        <h1>{entityName}</h1>
        <p class="subtitle">{assets.length.toLocaleString()} assets</p>
      </div>
      {#if showFlower && portfolio}
        <div class="header-flower">
          <OwnershipFlower {portfolio} size="small" showTitle={false} showLabels={false} />
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
        {#if assets.length > maxAssets}
          <p class="more-assets">+ {assets.length - maxAssets} more assets</p>
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

  .loading {
    padding: var(--space-5);
    text-align: center;
    color: var(--color-text-secondary);
  }

  .error {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  .error p { margin: 0 0 var(--space-2) 0; }
  .hint { font-size: var(--font-size-sm); color: var(--color-text-secondary); }

  .entity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .header-text { flex: 1; }
  .header-flower { flex-shrink: 0; }

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
</style>
