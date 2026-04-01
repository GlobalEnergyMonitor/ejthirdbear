<script lang="ts">
  /**
   * GemNetworkGraph — Shadow DOM widget for 3D force-directed network.
   * Mirrors embed/network-3d/+page.svelte.
   */
  import MiniNetworkGraph from '$lib/components/network/MiniNetworkGraph.svelte';

  interface Props {
    entityId: string;
    height?: number;
    maxHops?: number;
    theme?: 'light' | 'dark';
  }

  let { entityId, height = 500, maxHops = 3, theme = 'light' }: Props = $props();
</script>

<div class="network-embed" class:dark={theme === 'dark'} style="height: {height}px;">
  {#if entityId}
    <MiniNetworkGraph {entityId} {height} {maxHops} />
  {:else}
    <div class="embed-error"><p>Missing required parameter: entityId</p></div>
  {/if}
</div>

<style>
  .network-embed {
    width: 100%;
    min-width: 400px;
    font-family: var(--font-family);
  }
</style>
