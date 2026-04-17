<script lang="ts">
  /**
   * LocationOwnershipView — renders ownership tree(s) for a location-level graph response.
   *
   * Handles both the simple case (one distinct ownership structure across all units)
   * and the complex case (multiple distinct structures across different units).
   *
   * This is a low-level display component — it does not fetch data. Pass a
   * LocationOwnershipGraphResponse from getLocationOwnershipGraph() as a prop.
   */
  import OwnershipTreeGraph from './OwnershipTreeGraph.svelte';
  import type { LocationOwnershipGraphResponse, LocationUnit } from '$lib/ownership-api';
  import { fetchLocationUnits } from '$lib/ownership-api';

  interface Props {
    locationResponse: LocationOwnershipGraphResponse;
    /** 'up' = show owners (upstream); 'down' = show subsidiaries (downstream) */
    direction?: 'up' | 'down';
    fullWidth?: boolean;
    expandHeight?: boolean;
    forceLabelsBelow?: boolean;
    class?: string;
  }

  let {
    locationResponse,
    direction = 'up',
    fullWidth = true,
    expandHeight = false,
    forceLabelsBelow = false,
    class: className = '',
  }: Props = $props();

  let activeIndex = $state(0);
  let unitsByAssetId = $state<Map<string, LocationUnit>>(new Map());

  const isMultiGraph = $derived(locationResponse.distinct_graphs > 1);
  const activeGraph = $derived(locationResponse.graphs[activeIndex] ?? locationResponse.graphs[0]);

  // OwnershipTreeGraph uses 'downstream' to mean the viewer is looking upstream (who owns this)
  const treeDirection = $derived(direction === 'up' ? 'downstream' : 'upstream');

  /** Unit display name: strip project_name prefix from asset_name. */
  function deriveUnitName(assetName: string, projectName: string): string {
    if (assetName.startsWith(projectName)) {
      const trimmed = assetName.slice(projectName.length).trim();
      if (trimmed) return trimmed;
    }
    return assetName;
  }

  /** Unit chips for the currently active graph tab. */
  const activeUnitNames = $derived(
    activeGraph && unitsByAssetId.size > 0
      ? activeGraph.asset_ids
          .map((id) => unitsByAssetId.get(id))
          .filter((u): u is LocationUnit => !!u)
          .map((u) => deriveUnitName(u.asset_name, u.project_name))
      : []
  );

  // Reset active tab when location changes, re-fetch units if multi-graph
  $effect(() => {
    const resp = locationResponse; // track dependency
    activeIndex = 0;
    unitsByAssetId = new Map();
    if (resp.distinct_graphs > 1) {
      fetchLocationUnits(resp.location_id).then((units) => {
        unitsByAssetId = new Map(units.map((u) => [u.asset_id, u]));
      });
    }
  });
</script>

<div class="lov-root {className}">
  {#if isMultiGraph}
    <div class="lov-multi-header">
      <span class="lov-multi-label">
        {locationResponse.distinct_graphs} distinct ownership structures across {locationResponse.unit_count}
        unit{locationResponse.unit_count !== 1 ? 's' : ''}
      </span>
      <div class="lov-tabs" role="tablist" aria-label="Ownership structures">
        {#each locationResponse.graphs as graph, i}
          {@const count = graph.asset_ids.length}
          <button
            class="lov-tab"
            class:active={activeIndex === i}
            role="tab"
            aria-selected={activeIndex === i}
            tabindex={activeIndex === i ? 0 : -1}
            onclick={() => (activeIndex = i)}
          >
            {count}
            {count === 1 ? 'unit' : 'units'}
          </button>
        {/each}
      </div>
      {#if activeUnitNames.length > 0}
        <div class="lov-unit-chips" aria-label="Units with this ownership structure">
          {#each activeUnitNames as name}
            <span class="lov-chip">{name}</span>
          {/each}
        </div>
      {/if}
    </div>
  {:else if locationResponse.unit_count > 1}
    <div class="lov-shared-notice">
      All {locationResponse.unit_count} units share identical ownership
    </div>
  {/if}

  {#if activeGraph}
    {#key activeIndex}
      <OwnershipTreeGraph
        nodes={activeGraph.nodes}
        edges={activeGraph.edges}
        paths={activeGraph.paths}
        rootId={activeGraph.root.asset_id}
        direction={treeDirection}
        {fullWidth}
        {expandHeight}
        {forceLabelsBelow}
      />
    {/key}
  {:else}
    <div class="lov-empty">No ownership data available.</div>
  {/if}
</div>

<style>
  .lov-root {
    width: 100%;
  }

  .lov-multi-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) 0 var(--space-3) 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-3);
  }

  .lov-multi-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .lov-tabs {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .lov-tab {
    all: unset;
    cursor: pointer;
    padding: var(--space-1) var(--space-3);
    border: 1.5px solid var(--color-border);
    border-radius: 20px;
    font-size: var(--font-size-xs);
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-bg-primary);
    transition: all 0.12s;
    white-space: nowrap;
  }

  .lov-tab:hover {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
  }

  .lov-tab.active {
    background: var(--gem-navy);
    color: #fff;
    border-color: var(--gem-navy);
  }

  .lov-unit-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .lov-chip {
    display: inline-block;
    padding: 2px var(--space-2);
    border-radius: 4px;
    font-size: var(--font-size-xs);
    background: var(--color-bg-secondary, #f3f4f6);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .lov-shared-notice {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    padding: var(--space-2) 0 var(--space-3) 0;
    font-style: italic;
  }

  .lov-empty {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-8);
    text-align: center;
  }
</style>
