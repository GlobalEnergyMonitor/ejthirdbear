<script lang="ts">
  /**
   * AssetOwnershipTree - Shared fetched ownership tree for an asset.
   * Fetches ownership graph via REST API and renders OwnershipTreeGraph.
   * Used by compact card embeds and full-width ownership tabs.
   */
  import { assetLink } from '$lib/links';
  import OwnershipTreeGraph from './OwnershipTreeGraph.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';

  interface Props {
    assetId: string;
    compact?: boolean;
    fullWidth?: boolean;
    maxDepth?: number;
    showViewFull?: boolean;
    emptyMessage?: string;
    errorMessage?: string;
  }
  let {
    assetId,
    compact = true,
    fullWidth = false,
    maxDepth = 3,
    showViewFull = compact,
    emptyMessage = 'No ownership data available',
    errorMessage = 'Could not load ownership tree',
  }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let nodes = $state<GraphNode[]>([]);
  let edges = $state<GraphEdge[]>([]);
  let paths = $state<Record<string, OwnershipPathEntry[]>>({});
  let lastLoadKey = $state('');
  let requestSeq = 0;

  async function loadGraph(loadAssetId: string, depth: number, loadKey: string) {
    const currentSeq = ++requestSeq;
    loading = true;
    error = null;
    nodes = [];
    edges = [];
    paths = {};

    try {
      const { getOwnershipGraph } = await import('$lib/ownership-api');
      const result = await getOwnershipGraph({
        root: loadAssetId,
        direction: 'up',
        max_depth: depth,
      });

      if (currentSeq !== requestSeq) return;
      nodes = result.nodes || [];
      edges = result.edges || [];
      paths = result.paths || {};

      // Don't show tree if only the root asset node exists (no owners)
      if (nodes.length <= 1) {
        error = 'no-owners';
      }
    } catch (err) {
      if (currentSeq !== requestSeq) return;
      error = err instanceof Error ? err.message : 'Failed to load ownership data';
      if (import.meta.env.DEV) console.warn(`[AssetOwnershipTree] Failed for ${loadAssetId}:`, error);
    } finally {
      if (currentSeq === requestSeq) {
        loading = false;
        lastLoadKey = loadKey;
      }
    }
  }

  $effect(() => {
    const loadAssetId = assetId;
    const depth = maxDepth;
    const loadKey = `${loadAssetId}:${depth}`;
    if (!loadAssetId || loadKey === lastLoadKey) return;
    void loadGraph(loadAssetId, depth, loadKey);
  });
</script>

<div class="asset-ownership-tree" class:compact class:full={fullWidth && !compact}>
  {#if loading}
    <div class="tree-loading">
      <Spinner size={14} />
      Loading ownership tree...
    </div>
  {:else if error === 'no-owners'}
    <div class="tree-empty">{emptyMessage}</div>
  {:else if error}
    <div class="tree-error">{errorMessage}</div>
  {:else}
    <OwnershipTreeGraph
      {nodes}
      {edges}
      {paths}
      rootId={assetId}
      {compact}
      {fullWidth}
      direction="upstream"
    />
    {#if showViewFull}
      <a class="view-full" href={assetLink(assetId)}>View full ownership details &rarr;</a>
    {/if}
  {/if}
</div>

<style>
  .asset-ownership-tree {
    margin-top: 0.25rem;
    grid-column: 1 / -1;
    max-height: 240px;
    overflow: auto;
  }
  .asset-ownership-tree.full {
    max-height: none;
    overflow: visible;
  }
  .tree-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.75rem;
    color: var(--gem-teal, #2a7f8f);
    padding: 0.75rem 0;
  }
  .tree-empty,
  .tree-error {
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
