<script lang="ts">
  /**
   * Embeddable Ultimate Owners
   * Shows the ultimate parent owners at the top of the ownership chain.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   */
  import { page } from '$app/stores';
  import UltimateOwners from '$lib/components/UltimateOwners.svelte';

  const entityId = $derived($page.url.searchParams.get('entityId'));
</script>

<svelte:head>
  <title>Ultimate Owners — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if entityId}
  <div class="ultimate-owners-embed">
    <UltimateOwners {entityId} />
  </div>
{:else}
  <div class="embed-error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="embed-hint">Example: ?entityId=E12345</p>
  </div>
{/if}

<style>
  .ultimate-owners-embed {
    width: 100%;
    max-width: 600px;
  }
</style>
