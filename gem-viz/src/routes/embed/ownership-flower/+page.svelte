<script lang="ts">
  /**
   * Embeddable Ownership Flower
   * Standalone route for embedding the ownership flower visualization
   * Uses REST API only (no DuckDB dependency for cross-origin embeds)
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   size - Optional. "small", "medium", "large"
   *   showLabels - Optional. "true" or "false"
   *   showTitle - Optional. "true" or "false"
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityWithPortfolio, graphToExplorerData } from '$lib/ownership-api';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';

  type FlowerSize = 'small' | 'medium' | 'large';

  // Parse URL parameters
  const entityId = $derived($page.url.searchParams.get('entityId'));
  const sizeParam = $derived($page.url.searchParams.get('size') || 'medium');
  const showLabels = $derived($page.url.searchParams.get('showLabels') !== 'false');
  const showTitle = $derived($page.url.searchParams.get('showTitle') !== 'false');

  // Validate size
  const validSize = $derived<FlowerSize>(
    (['small', 'medium', 'large'] as const).includes(sizeParam as FlowerSize)
      ? (sizeParam as FlowerSize)
      : 'medium'
  );

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<any>(null);

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      const { entity, graphDown } = await getEntityWithPortfolio(entityId);
      const explorerData = graphToExplorerData(entityId, entity.name, graphDown);
      portfolio = {
        spotlightOwner: explorerData.spotlightOwner,
        subsidiariesMatched: new Map(explorerData.subsidiariesMatched),
        directlyOwned: explorerData.directlyOwned,
        matchedEdges: new Map(explorerData.matchedEdges),
        entityMap: new Map(explorerData.entityMap),
        assets: explorerData.assets,
      };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load entity';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Ownership Flower — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if loading}
  <div class="loading">Loading ownership flower...</div>
{:else if error}
  <div class="error">
    <p>{error}</p>
    {#if !entityId}
      <p class="hint">Example: ?entityId=YOUR_ENTITY_ID</p>
    {/if}
  </div>
{:else if entityId && portfolio}
  <OwnershipFlower ownerId={entityId} {portfolio} size={validSize} {showLabels} {showTitle} />
{:else}
  <div class="error">
    <p>No data found for this entity</p>
  </div>
{/if}

<style>
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

  .error p {
    margin: 0 0 var(--space-2) 0;
  }

  .error code {
    font-family: var(--font-family-mono);
    background: var(--color-bg-primary);
    padding: 2px 6px;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
