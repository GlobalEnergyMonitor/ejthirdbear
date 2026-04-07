<script lang="ts">
  /**
   * OwnershipPanel — side panel for the ownership tree graph.
   * Shows owner entities by %, country, and type with hover/click interaction.
   */
  import { goto } from '$app/navigation';
  import { entityLink } from '$lib/links';
  import type { GraphNode } from '$lib/component-data/graph-types';
  import { getNodeColors, COUNTRY_COLORS, COUNTRY_GRAY, OWNERSHIP_ENTITY_COLORS, pieArc, type ColorMode } from './ownership-tree-utils';

  let {
    ownersList,
    sortedOwnersList,
    ownersByCountry,
    ownersByType,
    nodes,
    rootId,
    hoveredId = null,
    frozenId = null,
    frozenMeta = null,
    frozenNodeData = null,
    hoverSource = null,
    teaseNode,
    fadedNodeIds,
    pathsTouchedMap,
    colorMode = 'entity-type',
    countryRanks,
    panelOpen = true,
    entranceAnimDone = false,
    onNavigate = undefined,
    onHover,
    onLeave,
    onFreeze,
    onTogglePanel,
    isNodeInFrozenPath,
    minOwnershipPct = $bindable(0),
    showSlider = false,
  }: {
    ownersList: Array<{ id: string; nid: string; name: string; pct: number; category: string; country: string }>;
    sortedOwnersList: typeof ownersList;
    ownersByCountry: Array<[string, { combinedShare: number; count: number; ids: string[] }]>;
    ownersByType: Array<[string, { combinedShare: number; count: number; ids: string[] }]>;
    nodes: GraphNode[];
    rootId: string;
    hoveredId: string | null;
    frozenId: string | null;
    frozenMeta: { kind: 'entity' | 'asset' | 'country' | 'entity-type'; label: string; facts: string[] } | null;
    frozenNodeData: { nodesTouched: string[]; edgeIndices: number[] } | null;
    hoverSource: 'graph' | 'panel' | null;
    teaseNode: { ownerId: string | null; country: string | null; entityType: string | null };
    fadedNodeIds: Set<string>;
    pathsTouchedMap: Map<string, { nodesTouched: string[]; edgeIndices: number[] }>;
    colorMode: ColorMode;
    countryRanks: Map<string, number>;
    panelOpen: boolean;
    entranceAnimDone: boolean;
    onNavigate?: (_url: string) => void;
    onHover: (_id: string, _data: { nodesTouched: string[]; edgeIndices: number[] } | null) => void;
    onLeave: () => void;
    onFreeze: (
      _id: string | null,
      _data: { nodesTouched: string[]; edgeIndices: number[] } | null,
      _meta?: { kind: 'entity' | 'asset' | 'country' | 'entity-type'; label: string; facts: string[] } | null
    ) => void;
    onTogglePanel: () => void;
    isNodeInFrozenPath: (_id: string) => boolean;
    minOwnershipPct?: number;
    showSlider?: boolean;
  } = $props();

  function nav(entityNid: string) {
    const u = entityLink(entityNid);
    onNavigate ? onNavigate(u) : goto(u);
  }
</script>

<div class="panel" class:open={panelOpen} style="opacity: {entranceAnimDone ? 1 : 0}">
  <button class="panel-toggle" onclick={onTogglePanel}>
    {ownersList.length} owner{ownersList.length !== 1 ? 's' : ''}
    {panelOpen ? '▲' : '▼'}
  </button>

  {#if showSlider}
    <label class="panel-slider">
      <span class="slider-label-prefix">Min ownership</span>
      <input type="range" min="0" max="100" step="1" bind:value={minOwnershipPct} />
      <span class="slider-value">{minOwnershipPct > 0 ? `${minOwnershipPct}%` : 'All'}</span>
    </label>
  {/if}

  <!-- Section 1: Owner Entities -->
  <div class="tabular-section">
    <h4>Owner Entities</h4>
    <div class="tabular-rows-wrap">
    <div class="tabular-rows">
      {#each sortedOwnersList as o}
        {@const _rowColors = getNodeColors(o.id, rootId, nodes, colorMode, countryRanks)}
        {@const isOwnerFaded = fadedNodeIds.has(o.id)}
        {@const inFrozenChain =
          !frozenNodeData ||
          frozenId === o.id ||
          frozenNodeData.nodesTouched.includes(o.id)}
        <div
          class="tabular-row"
          class:is-frozen-view={frozenId === o.id}
          class:is-hovered-view={hoveredId === o.id && frozenId !== o.id}
          class:faded={(frozenNodeData && !inFrozenChain) || isOwnerFaded}
          class:tease-connection={hoverSource === 'graph' &&
            teaseNode.ownerId === o.nid &&
            frozenId !== o.id}
          role="button"
          tabindex="0"
          onmouseenter={() => {
            if (frozenId && !isNodeInFrozenPath(o.id)) return;
            onHover(o.id, pathsTouchedMap.get(o.nid) || null);
          }}
          onmouseleave={onLeave}
          onclick={() => {
            if (frozenId === o.id) {
              onFreeze(null, null);
            } else {
              onFreeze(o.id, pathsTouchedMap.get(o.nid) || null, {
                kind: 'entity',
                label: o.name,
                facts: [o.category, o.country || 'HQ unknown', `${o.pct.toFixed(1)}% ownership`],
              });
            }
          }}
          ondblclick={() => nav(o.nid)}
          onkeydown={(ev) => { if (ev.key === 'Enter') nav(o.nid); }}
        >
          <span class="table-row-text">{o.name} ({o.pct.toFixed(1)}%)</span>
        </div>
      {/each}
    </div>
    </div>
  </div>

  <!-- Section 2: By Headquarter Country -->
  {#if ownersByCountry.length > 0}
    <div class="tabular-section">
      <h4>By Headquarter Country</h4>
      <div class="tabular-rows-wrap">
      <div class="tabular-rows">
        {#each ownersByCountry as [country, data]}
          {@const cRank = countryRanks.get(country)}
          {@const cColor = cRank != null && cRank < COUNTRY_COLORS.length ? COUNTRY_COLORS[cRank] : COUNTRY_GRAY}
          <div
            class="tabular-row"
            class:is-frozen-view={frozenMeta?.kind === 'country' && frozenMeta.label === country}
            class:tease-connection={hoverSource === 'graph' &&
              teaseNode.country === country}
            role="button"
            tabindex="0"
            onmouseenter={() => {
              if (frozenId) return;
              onHover(data.ids[0] || '', data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null);
            }}
            onmouseleave={onLeave}
            onclick={() => {
              if (frozenMeta?.kind === 'country' && frozenMeta.label === country) {
                onFreeze(null, null);
              } else {
                onFreeze(
                  null,
                  data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null,
                  {
                    kind: 'country',
                    label: country,
                    facts: [`${data.count} owner${data.count !== 1 ? 's' : ''}`, `${data.combinedShare.toFixed(1)}% combined`],
                  }
                );
              }
            }}
            onkeydown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                if (frozenMeta?.kind === 'country' && frozenMeta.label === country) {
                  onFreeze(null, null);
                } else {
                  onFreeze(
                    null,
                    data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null,
                    {
                      kind: 'country',
                      label: country,
                      facts: [`${data.count} owner${data.count !== 1 ? 's' : ''}`, `${data.combinedShare.toFixed(1)}% combined`],
                    }
                  );
                }
              }
            }}
          >
            {#if colorMode === 'country'}
              <svg class="pie-swatch" viewBox="0 0 14 14" width="14" height="14">
                <circle cx="7" cy="7" r="6" fill={cColor.bg} stroke={cColor.bg} stroke-width="1" />
                <path d={pieArc(50, 5)} transform="translate(7,7)" fill={cColor.fg} />
              </svg>
            {/if}
            <span class="table-row-text">{country} ({data.count} owner{data.count !== 1 ? 's' : ''})</span>
          </div>
        {/each}
      </div>
      </div>
    </div>
  {/if}

  <!-- Section 3: By Entity Type -->
  {#if ownersByType.length > 0}
    <div class="tabular-section">
      <h4>By Entity Type</h4>
      <div class="tabular-rows-wrap">
      <div class="tabular-rows">
        {#each ownersByType as [type, data]}
          {@const eColor = OWNERSHIP_ENTITY_COLORS[type] || OWNERSHIP_ENTITY_COLORS['Other']}
          <div
            class="tabular-row"
            class:is-frozen-view={frozenMeta?.kind === 'entity-type' && frozenMeta.label === type}
            class:tease-connection={hoverSource === 'graph' &&
              teaseNode.entityType === type}
            role="button"
            tabindex="0"
            onmouseenter={() => {
              if (frozenId) return;
              onHover(data.ids[0] || '', data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null);
            }}
            onmouseleave={onLeave}
            onclick={() => {
              if (frozenMeta?.kind === 'entity-type' && frozenMeta.label === type) {
                onFreeze(null, null);
              } else {
                onFreeze(
                  null,
                  data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null,
                  {
                    kind: 'entity-type',
                    label: type,
                    facts: [`${data.count} owner${data.count !== 1 ? 's' : ''}`, `${data.combinedShare.toFixed(1)}% combined`],
                  }
                );
              }
            }}
            onkeydown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                if (frozenMeta?.kind === 'entity-type' && frozenMeta.label === type) {
                  onFreeze(null, null);
                } else {
                  onFreeze(
                    null,
                    data.ids.length > 0 ? { nodesTouched: data.ids, edgeIndices: [] } : null,
                    {
                      kind: 'entity-type',
                      label: type,
                      facts: [`${data.count} owner${data.count !== 1 ? 's' : ''}`, `${data.combinedShare.toFixed(1)}% combined`],
                    }
                  );
                }
              }
            }}
          >
            {#if colorMode === 'entity-type'}
              <svg class="pie-swatch" viewBox="0 0 14 14" width="14" height="14">
                <circle cx="7" cy="7" r="6" fill={eColor.bg} stroke={eColor.bg} stroke-width="1" />
                <path d={pieArc(50, 5)} transform="translate(7,7)" fill={eColor.fg} />
              </svg>
            {/if}
            <span class="table-row-text">{type} ({data.count} owner{data.count !== 1 ? 's' : ''})</span>
          </div>
        {/each}
      </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .panel {
    background: var(--tree-warm-white, #f2f2eb);
    border-left: 3px solid var(--tree-edge, #a5e9e4);
    padding: 12px;
    overflow-y: auto;
    max-height: 100%;
    font-size: 0.75rem;
  }
  .panel-toggle {
    display: none;
    width: 100%;
    padding: 6px 8px;
    font-size: 0.7rem;
    font-weight: 600;
    text-align: center;
    border: none;
    background: var(--tree-warm-white, #f2f2eb);
    color: var(--tree-navy, #1d4961);
    cursor: pointer;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    margin-bottom: 4px;
  }
  .panel-slider {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 4px 8px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .slider-label-prefix {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--tree-teal, #004f61);
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .slider-value {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--tree-navy, #1d4961);
    width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }
  .panel-slider input[type='range'] {
    flex: 1;
    min-width: 40px;
    height: 4px;
    accent-color: var(--tree-teal, #004f61);
    cursor: pointer;
  }
  .tabular-section {
    margin-bottom: 12px;
  }
  .tabular-section h4 {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--tree-teal, #004f61);
    margin: 0 0 4px;
    font-weight: 600;
  }
  .tabular-rows-wrap {
    position: relative;
    max-height: 350px;
  }
  .tabular-rows-wrap::after {
    content: '';
    position: sticky;
    bottom: 0;
    display: block;
    height: 32px;
    pointer-events: none;
    background: linear-gradient(to bottom, transparent, var(--tree-warm-white, #f2f2eb));
  }
  .tabular-rows {
    display: flex;
    flex-direction: column;
    max-height: 350px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 79, 97, 0.3) transparent;
  }
  .tabular-rows::-webkit-scrollbar {
    width: 3px;
  }
  .tabular-rows::-webkit-scrollbar-thumb {
    background: rgba(0, 79, 97, 0.3);
    border-radius: 3px;
  }
  .tabular-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 6px;
    cursor: pointer;
    border-radius: 3px;
    transition: background 0.1s ease, opacity 0.2s ease;
    font-size: 0.72rem;
    line-height: 1.35;
  }
  .pie-swatch {
    flex-shrink: 0;
  }
  .tabular-row:hover,
  .tabular-row.is-hovered-view {
    background: rgba(0, 79, 97, 0.08);
  }
  .tabular-row.is-frozen-view {
    background: rgba(0, 79, 97, 0.15);
    font-weight: 600;
  }
  .tabular-row.faded {
    opacity: 0.3;
  }
  .tabular-row.tease-connection {
    font-weight: 600;
    background: rgba(157, 247, 229, 0.15);
    border-left: 3px solid var(--tree-mint, #9df7e5);
    padding-left: 5px;
    border-radius: 0 4px 4px 0;
  }
  .table-row-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 768px) {
    .panel {
      border-left: none;
      border-top: 2px solid var(--tree-edge, #a5e9e4);
      max-height: none;
    }
    .panel-toggle {
      display: block;
    }
    .panel:not(.open) .tabular-section {
      display: none;
    }
  }
</style>
