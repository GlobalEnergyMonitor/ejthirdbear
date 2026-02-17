<script lang="ts">
  /**
   * Embeddable Ownership Flow Diagram (Mermaid)
   * Mermaid-based flowchart visualization of ownership relationships.
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "BT" or "TB" (default: "BT")
   *   zoom - Optional. Zoom level (default: 0.7)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getEntityGraphUp } from '$lib/ownership-api';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';
  import { errorMessage, floatParam } from '../embed-utils';

  const entityId = $derived($page.url.searchParams.get('entityId'));
  const direction = $derived($page.url.searchParams.get('direction') || 'BT');
  const zoom = $derived(floatParam($page.url.searchParams.get('zoom'), 0.7));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<any>(null);

  const nodeMap = $derived.by(() => {
    if (!graphData?.nodes) return new Map();
    return new Map(graphData.nodes.map((n: any) => [n.id, { Name: n.Name }]));
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
      error = errorMessage(err, 'Failed to load ownership data');
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
    <div class="embed-loading">Loading ownership flow...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !entityId}
        <p class="embed-hint">Example: ?entityId=E12345&direction=BT</p>
      {/if}
    </div>
  {:else if graphData?.edges?.length > 0}
    <MermaidOwnership edges={graphData.edges} {nodeMap} {zoom} {direction} />
  {:else}
    <div class="embed-empty">No ownership relationships found</div>
  {/if}
</div>

<style>
  .mermaid-embed {
    width: 100%;
    min-height: 400px;
  }
</style>
