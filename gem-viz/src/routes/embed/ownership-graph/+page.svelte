<script>
  /**
   * Embeddable Ownership Graph (Dagre)
   * Standalone route for embedding the upstream/downstream ownership graph
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "up" (upstream/who owns) or "down" (downstream/what they own). Default: "up"
   *   showPies - Optional. "true" or "false". Default: "true"
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityGraphUp, getEntityGraphDown } from '$lib/ownership-api';
  import { DagreOwnershipGraph } from '$lib/components/ownership';

  // Parse URL parameters
  const entityId = $derived($page.url.searchParams.get('entityId'));
  const direction = $derived($page.url.searchParams.get('direction') || 'up');
  const showPies = $derived($page.url.searchParams.get('showPies') !== 'false');

  // State
  let loading = $state(true);
  let error = $state(null);
  let graphData = $state(null);
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
      error = err?.message || 'Failed to load ownership graph';
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
    <div class="loading">Loading ownership graph...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      {#if !entityId}
        <p class="hint">Example: ?entityId=E12345&direction=up</p>
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
    <div class="empty">
      <p>No {direction === 'down' ? 'downstream' : 'upstream'} ownership data found</p>
    </div>
  {/if}
</div>

<style>
  .graph-embed {
    width: 100%;
    min-height: 400px;
  }

  .loading,
  .empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
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

  .hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
