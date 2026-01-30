<script>
  /**
   * Embeddable Asset Ring Visualization
   * Standalone route for embedding the circular asset distribution visualization
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   maxAssets - Optional. Maximum assets to show. Default: 150
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fetchOwnerPortfolio } from '$lib/component-data/schema';
  import { AssetRingVisualization } from '$lib/components/ownership';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const maxAssetsParam = $derived($page.url.searchParams.get('maxAssets'));
  const maxAssets = $derived(maxAssetsParam ? parseInt(maxAssetsParam, 10) : 150);

  // State
  let loading = $state(true);
  let error = $state(null);
  let portfolio = $state(null);

  const assets = $derived(portfolio?.assets || []);
  const displayAssets = $derived(assets.slice(0, maxAssets));

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      portfolio = await fetchOwnerPortfolio(entityId);
      if (!portfolio) {
        error = 'Entity not found';
      }
    } catch (err) {
      error = err?.message || 'Failed to load portfolio';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Asset Ring — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="ring-embed">
  {#if loading}
    <div class="loading">Loading assets...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      {#if !entityId}
        <p class="hint">Example: ?entityId=E12345&maxAssets=100</p>
      {/if}
    </div>
  {:else if displayAssets.length > 0}
    <AssetRingVisualization assets={displayAssets} />
  {:else}
    <div class="empty">No assets found for this entity</div>
  {/if}
</div>

<style>
  .ring-embed {
    width: 100%;
    min-height: 400px;
  }

  .loading,
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
  }

  .error {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  .error p {
    margin: 0 0 var(--space-2) 0;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
