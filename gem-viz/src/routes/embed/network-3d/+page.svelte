<script lang="ts">
  /**
   * Embeddable 3D Network Graph
   * Interactive 3D force-directed ownership network visualization.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   entityId - Required. Entity ID to display
   *   height - Optional. Height in pixels (default: 500)
   *   maxHops - Optional. Max relationship hops (default: 3)
   *
   * Hash params: entityId, height, maxHops
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import MiniNetworkGraph from '$lib/components/network/MiniNetworkGraph.svelte';
  import { intParam, readHash } from '../embed-utils';

  let entityId = $state($page.url.searchParams.get('entityId'));
  let height = $state(intParam($page.url.searchParams.get('height'), 500));
  let maxHops = $state(intParam($page.url.searchParams.get('maxHops'), 3));
  let mounted = $state(false);

  onMount(() => {
    const h = readHash();
    if (h.entityId) entityId = h.entityId;
    if (h.height !== undefined) height = intParam(h.height, 500);
    if (h.maxHops !== undefined) maxHops = intParam(h.maxHops, 3);
    mounted = true;
  });
</script>

<svelte:head>
  <title>3D Ownership Network — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !mounted}
  <div class="embed-loading">Loading…</div>
{:else if entityId}
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
