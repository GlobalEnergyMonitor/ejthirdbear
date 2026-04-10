<script lang="ts">
  /**
   * GemAssetRing — Shadow DOM widget for circular asset distribution.
   * Mirrors embed/asset-ring/+page.svelte.
   */
  import { onMount } from 'svelte';
  import { AssetRingVisualization } from '$lib/components/ownership';
  import { loadEntityPortfolio, errorMessage, type EmbedPortfolio } from './widget-data';

  interface Props {
    entityId: string;
    maxAssets?: number;
    theme?: 'light' | 'dark';
  }

  let { entityId, maxAssets = 150, theme = 'light' }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let assets = $state<any[]>([]);

  const displayAssets = $derived(assets.slice(0, maxAssets));

  onMount(async () => {
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

<div class="ring-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading assets...</div>
  {:else if error}
    <div class="embed-error"><p>{error}</p></div>
  {:else if displayAssets.length > 0}
    <AssetRingVisualization assets={displayAssets} size={400} />
  {:else}
    <div class="embed-error"><p>No assets found for this entity</p></div>
  {/if}
</div>

<style>
  .ring-embed {
    width: 100%;
    min-height: 400px;
    font-family: var(--font-family);
  }
</style>
