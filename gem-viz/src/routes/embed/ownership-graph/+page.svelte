<script lang="ts">
  /**
   * Embeddable Ownership Graph (Nadieh's custom tree visualization)
   * Interactive hierarchy graph showing upstream or downstream relationships.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   entityId - Required. Entity ID to display
   *   direction - Optional. "up" or "down" (default: "down")
   *   compact - Optional. "true" or "false" (default: "false")
   *
   * Hash params: entityId, direction, compact
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getOwnershipGraph } from '$lib/ownership-api';
  import type { OwnershipGraphResponse } from '$lib/ownership-api';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import { errorMessage, boolParam, readHash } from '../embed-utils';

  // URL params (converted to $state so hash can override on mount)
  let entityId = $state($page.url.searchParams.get('entityId'));
  let direction = $state($page.url.searchParams.get('direction') || 'down');
  let compact = $state(boolParam($page.url.searchParams.get('compact'), false));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<OwnershipGraphResponse | null>(null);

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.entityId) entityId = h.entityId;
    if (h.direction) direction = h.direction;
    if (h.compact !== undefined) compact = boolParam(h.compact, false);

    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }

    try {
      graphData = await getOwnershipGraph({ root: entityId, direction: direction as 'up' | 'down' });
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
      paths={graphData.paths}
      rootId={entityId}
      {compact}
      fullWidth
      expandHeight
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
  }
</style>
