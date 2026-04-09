<script lang="ts">
  /**
   * GemOwnershipGraph — Shadow DOM widget for ownership tree visualization.
   * Mirrors embed/ownership-graph/+page.svelte.
   */
  import { onMount } from 'svelte';
  import { getOwnershipGraph } from './widget-api';
  import { navigate as navTo } from './widget-links';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import { errorMessage } from './widget-data';

  interface Props {
    entityId: string;
    direction?: 'up' | 'down';
    compact?: boolean;
    linkBase?: string;
    linkTarget?: string;
    theme?: 'light' | 'dark';
  }

  let { entityId, direction = 'down', compact = false, linkBase = '', linkTarget = '', theme = 'light' }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<{ nodes: any[]; edges: any[]; rootEntityName?: string } | null>(null);

  function handleNavigate(url: string) {
    navTo(url, linkTarget);
  }

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }
    try {
      graphData = await getOwnershipGraph({ root: entityId, direction });
    } catch (err) {
      error = errorMessage(err, 'Failed to load ownership graph');
    } finally {
      loading = false;
    }
  });
</script>

<div class="graph-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading ownership graph...</div>
  {:else if error}
    <div class="embed-error"><p>{error}</p></div>
  {:else if graphData && graphData.nodes.length > 1}
    <OwnershipTreeGraph
      nodes={graphData.nodes}
      edges={graphData.edges}
      rootId={entityId}
      {compact}
      onNavigate={handleNavigate}
    />
  {:else}
    <div class="embed-error">
      <p>No {direction === 'down' ? 'downstream' : 'upstream'} ownership data found</p>
    </div>
  {/if}
</div>

<style>
  .graph-embed {
    width: 100%;
    min-height: 500px;
    max-height: 80vh;
    overflow: auto;
    font-family: var(--font-family);
  }
</style>
