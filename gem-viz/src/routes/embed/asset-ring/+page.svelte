<script lang="ts">
  /**
   * Embeddable Asset Ring Visualization
   * Circular visualization of asset distribution by type and status.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   entityId - Required. Entity ID to display
   *   maxAssets - Optional. Maximum assets to show (default: 150)
   *
   * Hash params: entityId, maxAssets
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { AssetRingVisualization } from '$lib/components/ownership';
  import { loadEntityPortfolio, errorMessage, intParam, readHash } from '../embed-utils';

  let entityId = $state($page.url.searchParams.get('entityId'));
  let maxAssets = $state(intParam($page.url.searchParams.get('maxAssets'), 150));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let assets = $state<any[]>([]);

  const displayAssets = $derived(assets.slice(0, maxAssets));

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.entityId) entityId = h.entityId;
    if (h.maxAssets !== undefined) maxAssets = intParam(h.maxAssets, 150);

    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      const result = await loadEntityPortfolio(entityId);
      assets = (result.portfolio.assets as any[]) || [];
    } catch (err) {
      error = errorMessage(err, 'Failed to load portfolio');
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
    <div class="embed-loading">Loading assets...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !entityId}
        <p class="embed-hint">Example: ?entityId=E12345&maxAssets=100</p>
      {/if}
    </div>
  {:else if displayAssets.length > 0}
    <AssetRingVisualization assets={displayAssets} />
  {:else}
    <div class="embed-empty">No assets found for this entity</div>
  {/if}
</div>

<style>
  .ring-embed {
    width: 100%;
    min-height: 400px;
  }
</style>
