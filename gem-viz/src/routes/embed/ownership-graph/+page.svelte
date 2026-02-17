<script lang="ts">
  /**
   * Embeddable Ownership Graph (Dagre)
   * Interactive hierarchy graph showing upstream or downstream relationships.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "up" or "down" (default: "up")
   *   showPies - Optional. "true" or "false" (default: "true")
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityGraphUp, getEntityGraphDown } from '$lib/ownership-api';
  import { DagreOwnershipGraph } from '$lib/components/ownership';
  import { errorMessage, boolParam } from '../embed-utils';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const direction = $derived($page.url.searchParams.get('direction') || 'up');
  const showPies = $derived(boolParam($page.url.searchParams.get('showPies')));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<any>(null);
  let entityName = $state('');

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      const fetchFn = direction === 'down' ? getEntityGraphDown : getEntityGraphUp;
      graphData = await fetchFn(entityId);
      if (graphData?.rootEntityName) {
        entityName = graphData.rootEntityName;
      }
    } catch (err) {
      error = errorMessage(err, 'Failed to load ownership graph');
    } finally {
      loading = false;
    }
  });

  const graphDirection = $derived(direction === 'down' ? 'TB' : 'BT');
</script>

<svelte:head>
  <title>Ownership Graph — {entityName || entityId || 'GEM Embed'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="graph-embed">
  {#if loading}
    <div class="embed-loading">Loading ownership graph...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !entityId}
        <p class="embed-hint">Example: ?entityId=E12345&direction=up</p>
      {/if}
    </div>
  {:else if graphData?.nodes?.length > 1}
    <DagreOwnershipGraph
      nodes={graphData.nodes}
      edges={graphData.edges}
      rootId={entityId}
      direction={graphDirection}
      {showPies}
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
    min-height: 400px;
  }
</style>
