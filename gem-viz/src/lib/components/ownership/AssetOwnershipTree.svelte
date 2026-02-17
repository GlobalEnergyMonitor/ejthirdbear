<script lang="ts">
  /**
   * AssetOwnershipTree - Self-contained compact ownership tree for an asset
   * Fetches ownership graph via REST API and renders OwnershipTreeGraph in compact mode.
   * Designed for inline use inside ProjectCard's ownership slot.
   */
  import { onMount } from 'svelte';
  import { assetLink } from '$lib/links';
  import OwnershipTreeGraph from './OwnershipTreeGraph.svelte';
  import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';

  interface Props { assetId: string; }
  let { assetId }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let nodes = $state<GraphNode[]>([]);
  let edges = $state<GraphEdge[]>([]);
  let paths = $state<Record<string, OwnershipPathEntry[]>>({});

  async function loadGraph() {
    loading = true;
    error = null;

    try {
      const { getOwnershipGraph } = await import('$lib/ownership-api');
      const result = await getOwnershipGraph({
        root: assetId,
        direction: 'up',
        max_depth: 6,
      });

      nodes = result.nodes || [];
      edges = result.edges || [];
      paths = result.paths || {};

      // Don't show tree if only the root asset node exists (no owners)
      if (nodes.length <= 1) {
        error = 'no-owners';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load ownership data';
      console.warn(`[AssetOwnershipTree] Failed for ${assetId}:`, error);
    } finally {
      loading = false;
    }
  }

  onMount(loadGraph);
</script>

<div class="asset-ownership-tree">
  {#if loading}
    <div class="tree-loading">
      <span class="spinner"></span>
      Loading ownership tree...
    </div>
  {:else if error === 'no-owners'}
    <div class="tree-empty">No ownership data available</div>
  {:else if error}
    <div class="tree-error">Could not load ownership tree</div>
  {:else}
    <OwnershipTreeGraph {nodes} {edges} {paths} rootId={assetId} compact={true} />
    <a class="view-full" href={assetLink(assetId)}>View full ownership details &rarr;</a>
  {/if}
</div>

<style>
  .asset-ownership-tree {
    margin-top: 0.5rem;
    grid-column: 1 / -1;
  }
  .tree-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--gem-teal, #2a7f8f);
    padding: 0.75rem 0;
  }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(42, 127, 143, 0.2);
    border-top-color: var(--gem-teal, #2a7f8f);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .tree-empty, .tree-error {
    font-size: 0.7rem;
    color: var(--gem-teal, #6e8c91);
    padding: 0.5rem 0;
  }
  .view-full {
    display: inline-block;
    margin-top: 0.25rem;
    font-size: 0.7rem;
    color: var(--gem-teal, #2a7f8f);
    text-decoration: none;
  }
  .view-full:hover {
    text-decoration: underline;
  }
</style>
