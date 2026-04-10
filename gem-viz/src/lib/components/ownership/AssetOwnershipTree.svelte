<script lang="ts">
  /**
   * AssetOwnershipTree - Shared fetched ownership tree for an asset.
   * Fetches ownership graph via REST API and renders LocationOwnershipView.
   * Used by compact card embeds and full-width ownership tabs.
   *
   * Accepts both unit-level asset IDs (single tree) and location-level IDs
   * (renders tabbed multi-structure view via LocationOwnershipView). The API
   * response shape determines which mode is used automatically.
   */
  import { assetLink } from '$lib/links';
  import LocationOwnershipView from './LocationOwnershipView.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import type { LocationOwnershipGraphResponse } from '$lib/ownership-api';
  import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';

  type OwnershipGraphLoader = (_params: {
    root: string;
    direction: 'up' | 'down';
    max_depth?: number;
  }) => Promise<{
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    paths?: Record<string, OwnershipPathEntry[]>;
  }>;

  interface Props {
    assetId: string;
    compact?: boolean;
    fullWidth?: boolean;
    expandHeight?: boolean;
    showViewFull?: boolean;
    emptyMessage?: string;
    errorMessage?: string;
    ownershipLoader?: OwnershipGraphLoader;
  }
  let {
    assetId,
    compact = true,
    fullWidth = false,
    expandHeight = false,
    showViewFull = compact,
    emptyMessage = 'No ownership data available',
    errorMessage = 'Could not load ownership tree',
    ownershipLoader,
  }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let locationResponse = $state<LocationOwnershipGraphResponse | null>(null);
  let lastLoadKey = $state('');
  let requestSeq = 0;

  async function loadGraph(
    loadAssetId: string,
    loadKey: string,
    loader: OwnershipGraphLoader | undefined
  ) {
    const currentSeq = ++requestSeq;
    loading = true;
    error = null;
    locationResponse = null;

    try {
      let result: LocationOwnershipGraphResponse;

      if (loader) {
        // Custom loader — single-graph path (backward compat); wrap into location shape
        const raw = await loader({ root: loadAssetId, direction: 'up' });
        const nodes = raw.nodes || [];
        // Cast to LocationOwnershipGraphResponse — graph-types.GraphNode is structurally
        // compatible at runtime but has looser type declarations than ownership-api.GraphNode
        result = {
          location_id: '',
          project_name: '',
          unit_count: 1,
          distinct_graphs: 1,
          graphs: nodes.length > 1
            ? [{
                root: {
                  node_type: 'asset' as const,
                  asset_id: loadAssetId,
                  location_id: '',
                  unit_id: null,
                  asset_name: '',
                  project_name: '',
                  asset_type: '',
                  country: '',
                  latitude: 0,
                  longitude: 0,
                },
                nodes: nodes as LocationOwnershipGraphResponse['graphs'][0]['nodes'],
                edges: (raw.edges || []) as LocationOwnershipGraphResponse['graphs'][0]['edges'],
                paths: raw.paths as LocationOwnershipGraphResponse['graphs'][0]['paths'],
                asset_ids: [loadAssetId],
              }]
            : [],
        };
      } else {
        const { getOwnershipGraphs } = await import('$lib/ownership-api');
        result = await getOwnershipGraphs({ root: loadAssetId, direction: 'up' });
      }

      if (currentSeq !== requestSeq) return;

      const hasOwners = result.graphs.some((g) => g.nodes.length > 1);
      if (!hasOwners) {
        error = 'no-owners';
      } else {
        locationResponse = result;
      }
    } catch (err) {
      if (currentSeq !== requestSeq) return;
      error = err instanceof Error ? err.message : 'Failed to load ownership data';
      if (import.meta.env.DEV) console.warn(`[AssetOwnershipTree] Failed for ${loadAssetId}:`, err);
    } finally {
      if (currentSeq === requestSeq) {
        loading = false;
        lastLoadKey = loadKey;
      }
    }
  }

  $effect(() => {
    const loadAssetId = assetId;
    const loadKey = `${loadAssetId}:${ownershipLoader ? 'custom' : 'default'}`;
    if (!loadAssetId || loadKey === lastLoadKey) return;
    void loadGraph(loadAssetId, loadKey, ownershipLoader);
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
  {:else if locationResponse}
    <LocationOwnershipView {locationResponse} direction="up" {fullWidth} {expandHeight} />
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
    color: var(--gem-teal);
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
    color: var(--gem-teal);
    text-decoration: none;
  }
  .view-full:hover {
    text-decoration: underline;
  }
</style>
