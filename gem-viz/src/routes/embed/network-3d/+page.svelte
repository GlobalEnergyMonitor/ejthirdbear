<script lang="ts">
  /**
   * Embeddable 3D Network Graph
   * Interactive 3D force-directed ownership network visualization.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   height - Optional. Height in pixels (default: 500)
   *   maxHops - Optional. Max relationship hops (default: 3)
   */
  import { page } from '$app/stores';
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';
  import { intParam } from '../embed-utils';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const height = $derived(intParam($page.url.searchParams.get('height'), 500));
  const maxHops = $derived(intParam($page.url.searchParams.get('maxHops'), 3));
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
  <div class="embed-error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="embed-hint">Example: ?entityId=E12345&height=600&maxHops=2</p>
  </div>
{/if}

<style>
  .network-embed {
    width: 100%;
    min-width: 400px;
  }
</style>
