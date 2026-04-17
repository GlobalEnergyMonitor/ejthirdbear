<script lang="ts">
  /**
   * OwnershipTooltip — hover tooltip for nodes in the ownership tree graph.
   * Shows entity details (name, HQ, type, ownership %) or asset details.
   */
  import type { GraphNode } from '$lib/component-data/graph-types';
  import type { GraphEdge } from '$lib/component-data/graph-types';
  import { classifyOwnerType } from './ownership-tree-utils';

  let {
    hoveredId,
    hoveredGraphNode,
    hoveredLayoutNode,
    frozenId,
    hoverSource,
    tooltipX,
    tooltipY,
    rootId,
    edges,
  }: {
    hoveredId: string | null;
    hoveredGraphNode: GraphNode | null;
    hoveredLayoutNode: { pct?: number } | null;
    frozenId: string | null;
    hoverSource: 'graph' | 'panel' | null;
    tooltipX: number;
    tooltipY: number;
    rootId: string;
    edges: GraphEdge[];
  } = $props();

  const visible = $derived(hoverSource === 'graph' && hoveredId && hoveredGraphNode);
</script>

{#if visible && hoveredGraphNode}
  {@const hn = hoveredGraphNode}
  {@const isAsset = hn.type === 'asset' || hoveredId === rootId}
  {@const pct = hoveredLayoutNode?.pct ?? 0}
  {@const hqParts = [hn.headquarters_country, hn.headquarters_subdivision].filter(Boolean)}
  {@const ownerCategory = !isAsset ? classifyOwnerType(hn) : ''}
  {@const edgeToThis = edges.find((e) => e.target === hn.entity_id || e.target === hn.id)}
  {@const directPct = edgeToThis?.value ?? 0}
  {@const isImputed = edgeToThis?.imputed_share ?? false}
  <div
    class="tooltip"
    class:frozen={frozenId === hoveredId}
    style="left: {tooltipX}px; top: {tooltipY}px;"
  >
    {#if frozenId === hoveredId}
      <div class="tooltip-pinned">Pinned</div>
    {/if}
    <div class="tooltip-name">
      {hn.full_name || hn.name || hn.Name || hoveredId}
    </div>

    {#if isAsset}
      <div class="tooltip-detail">
        {hn.asset_type || 'Asset'}{#if hn.operating_status}
          · {hn.operating_status}{/if}
      </div>
      {#if hn.capacity_value}
        <div class="tooltip-detail">{hn.capacity_value} {hn.capacity_unit || 'MW'}</div>
      {/if}
      {#if hn.country}
        <div class="tooltip-detail">{hn.country}</div>
      {/if}
    {:else}
      {#if hqParts.length > 0}
        <div class="tooltip-detail">{hqParts.join(' · ')}</div>
      {/if}
      <div class="tooltip-detail">
        {ownerCategory}{#if hn.legal_entity_type}
          · {hn.legal_entity_type}{/if}
      </div>
      {#if pct > 0}
        <div class="tooltip-pct">
          <span class="tooltip-pct-value">{pct.toFixed(1)}%</span> ownership
          {#if directPct > 0 && directPct !== pct}
            · {directPct.toFixed(1)}% direct{#if isImputed}
              (est.){/if}
          {/if}
        </div>
      {/if}
    {/if}

    {#if frozenId && hoveredId === frozenId}
      <div class="tooltip-hint">Click to unpin · Double-click to open</div>
    {:else}
      <div class="tooltip-hint">Click for details</div>
    {/if}
  </div>
{/if}

<style>
  .tooltip {
    position: absolute;
    pointer-events: none;
    background: var(--tree-navy, #1d4961);
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    white-space: nowrap;
    z-index: 20;
    transform: translate(-50%, -100%);
    margin-top: -10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    animation: tooltip-in 0.12s ease-out;
  }
  .tooltip.frozen {
    border: 1.5px solid var(--tree-mint, #9df7e5);
  }
  @keyframes tooltip-in {
    from {
      opacity: 0;
      transform: translate(-50%, -90%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -100%);
    }
  }
  .tooltip-pinned {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--tree-mint, #9df7e5);
    margin-bottom: 2px;
  }
  .tooltip-name {
    font-weight: 600;
    font-size: 12px;
    margin-bottom: 2px;
  }
  .tooltip-detail {
    font-size: 10px;
    opacity: 0.85;
  }
  .tooltip-pct {
    font-size: 10px;
    margin-top: 2px;
    opacity: 0.9;
  }
  .tooltip-pct-value {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .tooltip-hint {
    font-size: 9px;
    opacity: 0.5;
    margin-top: 3px;
  }
  @media (max-width: 768px) {
    .tooltip {
      display: none;
    }
  }
</style>
