<script lang="ts">
  /**
   * Embeddable Ultimate Owners
   * Shows the ultimate parent owners at the top of the ownership chain.
   *
   * URL params (overridable via URL hash for Drupal deep-linking):
   *   entityId - Required. Entity ID to display
   *
   * Hash params: entityId
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import UltimateOwners from '$lib/components/tracker/UltimateOwners.svelte';
  import { readHash } from '../embed-utils';

  let entityId = $state($page.url.searchParams.get('entityId'));
  let mounted = $state(false);

  onMount(() => {
    const h = readHash();
    if (h.entityId) entityId = h.entityId;
    mounted = true;
  });
</script>

<svelte:head>
  <title>Ultimate Owners — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !mounted}
  <div class="embed-loading">Loading…</div>
{:else if entityId}
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
