<script>
  /**
   * Embeddable Ownership Flow Diagram (Mermaid)
   * Standalone route for embedding the Mermaid ownership flow diagram
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "BT" (bottom-to-top) or "TB" (top-to-bottom). Default: "BT"
   *   zoom - Optional. Zoom level. Default: 0.7
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityGraphUp } from '$lib/ownership-api';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const direction = $derived($page.url.searchParams.get('direction') || 'BT');
  const zoomParam = $derived($page.url.searchParams.get('zoom'));
  const zoom = $derived(zoomParam ? parseFloat(zoomParam) : 0.7);

  // State
  let loading = $state(true);
  let error = $state(null);
  let graphData = $state(null);

  const nodeMap = $derived.by(() => {
    if (!graphData?.nodes) return new Map();
    return new Map(graphData.nodes.map((n) => [n.id, { Name: n.Name }]));
  });

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      graphData = await getEntityGraphUp(entityId);
    } catch (err) {
      error = err?.message || 'Failed to load ownership data';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>Ownership Flow — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mermaid-embed">
  {#if loading}
    <div class="loading">Loading ownership flow...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      {#if !entityId}
        <p class="hint">Example: ?entityId=E12345&direction=BT</p>
      {/if}
    </div>
  {:else if graphData?.edges?.length > 0}
    <MermaidOwnership edges={graphData.edges} {nodeMap} {zoom} {direction} />
  {:else}
    <div class="empty">No ownership relationships found</div>
  {/if}
</div>

<style>
  .mermaid-embed {
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
