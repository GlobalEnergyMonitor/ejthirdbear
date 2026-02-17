<script lang="ts">
  /**
   * Embeddable Full Network Explorer
   * Complete D3 force-directed network explorer with interactive controls.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   */
  import { page } from '$app/stores';
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';

  const entityId = $derived($page.url.searchParams.get('entityId'));
</script>

<svelte:head>
  <title>Network Explorer — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if entityId}
  <div class="explorer-embed">
    <OwnershipExplorerD3 ownerEntityId={entityId} />
  </div>
{:else}
  <div class="embed-error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="embed-hint">Example: ?entityId=E12345</p>
  </div>
{/if}

<style>
  .explorer-embed {
    width: 100%;
    min-height: 600px;
  }
</style>
