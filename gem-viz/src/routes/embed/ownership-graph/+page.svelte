<script lang="ts">
  /**
   * Embeddable Ownership Graph (Nadieh's custom tree visualization)
   * Interactive hierarchy graph showing upstream or downstream relationships.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "up" or "down" (default: "down")
   *   compact - Optional. "true" or "false" (default: "false")
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityGraphUp, getEntityGraphDown } from '$lib/ownership-api';
  import type { EntityGraphResponse } from '$lib/ownership-api';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import { errorMessage, boolParam } from '../embed-utils';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const direction = $derived($page.url.searchParams.get('direction') || 'down');
  const compact = $derived(boolParam($page.url.searchParams.get('compact'), false));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<EntityGraphResponse | null>(null);

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      const fetchFn = direction === 'down' ? getEntityGraphDown : getEntityGraphUp;
      graphData = await fetchFn(entityId);
    } catch (err) {
      error = errorMessage(err, 'Failed to load ownership graph');
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Control Chain — {graphData?.rootEntityName || entityId || 'GEM Embed'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="graph-embed">
  {#if loading}
    <div class="embed-loading">Loading ownership graph...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !entityId}
        <p class="embed-hint">Example: ?entityId=E100000000650&direction=down</p>
      {/if}
    </div>
  {:else if graphData?.nodes?.length > 1}
    <OwnershipTreeGraph
      nodes={graphData.nodes}
      edges={graphData.edges}
      rootId={entityId}
      {compact}
    />
  {:else}
    <div class="embed-empty">
      No {direction === 'down' ? 'downstream' : 'upstream'} ownership data found
    </div>
  {/if}
</div>

<style>
  .graph-embed {
    width: 100%;
    min-height: 500px;
    max-height: 80vh;
    overflow: auto;
  }
</style>
