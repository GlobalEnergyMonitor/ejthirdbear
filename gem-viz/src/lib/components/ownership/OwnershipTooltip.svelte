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
    hoveredPathEdgeIndices = null,
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
    /** Indices into `edges` for every edge on any path to the hovered entity.
     * Used to summarise whether the cumulative % is known/partially/fully imputed. */
    hoveredPathEdgeIndices?: number[] | null;
  } = $props();

  // Count imputed vs known edges across the whole ownership path to the
  // hovered entity (mirrors Observable's formatImputed — lines 1597-1607).
  // Returns "(imputed)" / "(3 of 5 relations est.)" / "" based on the ratio.
  function formatImputedPath(indices: number[] | null): string {
    if (!indices || indices.length === 0) return '';
    let imputed = 0;
    for (const i of indices) {
      if (edges[i]?.imputed_share) imputed++;
    }
    if (imputed === 0) return '';
    if (imputed === indices.length) return '(imputed)';
    return `(${imputed} of ${indices.length} relations est.)`;
  }

  const visible = $derived(hoverSource === 'graph' && hoveredId && hoveredGraphNode);
</script>

{#if visible && hoveredGraphNode}
  {@const hn = hoveredGraphNode}
  {@const isAsset = hn.type === 'asset' || hoveredId === rootId}
  {@const pct = hoveredLayoutNode?.pct ?? 0}
  {@const hqParts = [hn.headquarters_country, hn.headquarters_subdivision].filter(Boolean)}
  {@const regParts = [hn.registration_country, hn.registration_subdivision].filter(Boolean)}
  {@const hqString = hqParts.join(' · ')}
  {@const regString = regParts.join(' · ')}
  {@const regDiffers = regString && regString !== hqString}
  {@const ownerCategory = !isAsset ? classifyOwnerType(hn) : ''}
  {@const edgeToThis = edges.find((e) => e.target === hn.entity_id || e.target === hn.id)}
  {@const directPct = edgeToThis?.value ?? 0}
  {@const isImputed = edgeToThis?.imputed_share ?? false}
  {@const pathImputedLabel = formatImputedPath(hoveredPathEdgeIndices)}
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
      {#if hqString}
        <div class="tooltip-detail">HQ: {hqString}</div>
      {/if}
      {#if regDiffers}
        <div class="tooltip-detail tooltip-reg">Registered: {regString}</div>
      {/if}
      <div class="tooltip-detail">
        {ownerCategory}{#if hn.legal_entity_type}
          · {hn.legal_entity_type}{/if}
      </div>
      {#if pct > 0}
        <div class="tooltip-pct">
          <span class="tooltip-pct-value">{pct.toFixed(1)}%</span> ownership
          {#if pathImputedLabel}
            <span class="tooltip-imputed-note">{pathImputedLabel}</span>
          {/if}
          {#if directPct > 0 && directPct !== pct}
            <div class="tooltip-direct">
              {directPct.toFixed(1)}% direct{#if isImputed && !pathImputedLabel}
                (est.){/if}
            </div>
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
    /* Pin line-height so host-page themes (Drupal, Webflow, etc.) that set
       body { line-height: 1.6 } don't inherit through the Shadow DOM and
       stretch tooltip rows — the inter-row margins are calibrated for 1.3. */
    line-height: 1.3;
    font-family: var(--gem-sans, system-ui, -apple-system, sans-serif);
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
  /* Registration country on its own line — differs-from-HQ is the signal of
     interest (shell / tax-haven indicator), so we always call it out when set. */
  .tooltip-reg {
    color: var(--tree-mint, #9df7e5);
    opacity: 1;
  }
  .tooltip-imputed-note {
    font-size: 9px;
    opacity: 0.75;
    margin-left: 4px;
    font-style: italic;
  }
  .tooltip-direct {
    font-size: 9px;
    opacity: 0.65;
    margin-top: 1px;
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
