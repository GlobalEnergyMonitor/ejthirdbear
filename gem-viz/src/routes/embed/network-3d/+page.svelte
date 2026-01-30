<script>
  /**
   * Embeddable 3D Network Graph
   * Standalone route for embedding the interactive 3D ownership network
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   height - Optional. Height in pixels. Default: 500
   *   maxHops - Optional. Max relationship hops. Default: 3
   */
  import { page } from '$app/stores';
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const heightParam = $derived($page.url.searchParams.get('height'));
  const maxHopsParam = $derived($page.url.searchParams.get('maxHops'));

  const height = $derived(heightParam ? parseInt(heightParam, 10) : 500);
  const maxHops = $derived(maxHopsParam ? parseInt(maxHopsParam, 10) : 3);
</script>

<svelte:head>
  <title>3D Ownership Network — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if entityId}
  <div class="network-embed" style="height: {height}px;">
    <MiniNetworkGraph {entityId} {height} {maxHops} />
  </div>
{:else}
  <div class="error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="hint">Example: ?entityId=E12345&height=600&maxHops=2</p>
  </div>
{/if}

<style>
  .network-embed {
    width: 100%;
    min-width: 400px;
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
