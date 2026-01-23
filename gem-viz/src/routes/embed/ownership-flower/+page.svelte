<script lang="ts">
  /**
   * Embeddable Ownership Flower
   * Standalone route for embedding the ownership flower visualization
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   size - Optional. "small", "medium", "large"
   *   showLabels - Optional. "true" or "false"
   *   showTitle - Optional. "true" or "false"
   */
  import { page } from '$app/stores';
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
</script>

<svelte:head>
  <title>Ownership Flower | GEM Viz Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if entityId}
  <OwnershipFlower
    ownerId={entityId}
    size={validSize}
    {showLabels}
    {showTitle}
  />
{:else}
  <div class="error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="hint">Example: ?entityId=YOUR_ENTITY_ID</p>
  </div>
{/if}

<style>
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
