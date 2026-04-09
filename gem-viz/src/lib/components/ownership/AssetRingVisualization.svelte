<script lang="ts">
  /**
   * AssetRingVisualization - Ring-of-circles for multi-unit assets
   * Shows assets arranged in a circular ring with status coloring and ownership pies.
   *
   * Thin Svelte wrapper around the shared molecule-renderer D3 function.
   * Adds interactive features (hover, click, tooltips, center summary).
   */
  import { goto } from '$app/navigation';
  import { select } from 'd3';
  import { assetLink } from '$lib/links';
  import { getStatusColor, getTrackerColor, colors } from '$lib/design-tokens';
  import { drawMolecule, computePositions, type MoleculeUnit } from './molecule-renderer';

  interface Asset {
    id: string;
    name: string;
    status?: string;
    tracker?: string;
    capacityMw?: number;
    share?: number;
  }

  interface Props {
    assets?: Asset[];
    size?: number;
    showLabels?: boolean;
    showCapacity?: boolean;
    showOwnership?: boolean;
    interactive?: boolean;
    maxUnits?: number;
    /** Optional navigation callback — used by dynamic embeds instead of goto() */
    onNavigate?: (_url: string) => void;
  }

  let {
    assets = [],
    size = 200,
    showLabels = true,
    showCapacity = true,
    showOwnership = true,
    interactive = true,
    maxUnits = 24,
    onNavigate,
  }: Props = $props();

  let moleculeG: SVGGElement | null = $state(null);
  let hoveredAsset: Asset | null = $state(null);

  // Limit displayed assets
  const displayAssets = $derived(assets.slice(0, maxUnits));
  const hasMore = $derived(assets.length > maxUnits);

  // Calculate ring geometry
  const centerX = $derived(size / 2);
  const centerY = $derived(size / 2);
  const ringRadius = $derived(size * 0.35);
  const unitRadius = $derived(
    Math.min(20, (2 * Math.PI * ringRadius) / (displayAssets.length * 2.5))
  );

  // Positions for interactive overlays (tooltips, hover, click)
  const unitPositions = $derived.by(() => {
    if (displayAssets.length === 0) return [];
    const positions = computePositions(displayAssets.length, ringRadius);
    return displayAssets.map((asset, i) => ({
      asset,
      x: centerX + positions[i].x,
      y: centerY + positions[i].y,
    }));
  });

  // Total capacity
  const totalCapacity = $derived(
    displayAssets.reduce((sum, a) => sum + (Number(a.capacityMw) || 0), 0)
  );

  // Draw molecule via shared renderer whenever inputs change
  $effect(() => {
    if (!moleculeG || displayAssets.length === 0) return;
    const g = select(moleculeG);
    g.selectAll('*').remove();

    const moleculeUnits: MoleculeUnit[] = displayAssets.map((a) => ({
      color: getStatusColor(a.status),
      ownershipPct: a.share,
    }));

    drawMolecule(g, moleculeUnits, {
      ringRadius,
      unitRadius,
      showOwnership,
    });

    // Add tracker dots on top of each molecule-unit group
    g.selectAll<SVGGElement, MoleculeUnit>('.molecule-unit').each(function (_d, i) {
      const asset = displayAssets[i];
      if (asset?.tracker) {
        select(this)
          .append('circle')
          .attr('r', 3)
          .attr('cy', -unitRadius + 3)
          .style('fill', getTrackerColor(asset.tracker))
          .style('stroke', colors.white)
          .style('stroke-width', 0.5);
      }
    });
  });

  function handleUnitClick(asset: Asset) {
    if (interactive) {
      const url = assetLink(asset.id);
      onNavigate ? onNavigate(url) : goto(url);
    }
  }

  function handleUnitHover(asset: Asset | null) {
    hoveredAsset = asset;
  }
</script>

<div class="asset-ring-visualization">
  <svg width={size} height={size} aria-label="Asset ring visualization">
    <!-- Center summary -->
    <g transform="translate({centerX}, {centerY})">
      <circle r={ringRadius * 0.4} fill={colors.gray100} stroke={colors.gray300} stroke-width="1" />

      {#if showCapacity && totalCapacity > 0}
        <text y="-8" text-anchor="middle" class="center-capacity">
          {totalCapacity.toLocaleString()}
        </text>
        <text y="6" text-anchor="middle" class="center-unit">MW</text>
      {/if}

      <text
        y={showCapacity && totalCapacity > 0 ? 22 : 0}
        text-anchor="middle"
        class="center-count"
      >
        {displayAssets.length}
        {displayAssets.length === 1 ? 'unit' : 'units'}
      </text>
    </g>

    <!-- D3-rendered molecule (ring + unit circles + ownership arcs) -->
    <g bind:this={moleculeG} transform="translate({centerX}, {centerY})"></g>

    <!-- Interactive overlay: invisible hit areas for hover/click/keyboard -->
    {#each unitPositions as pos}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <g
        transform="translate({pos.x}, {pos.y})"
        class="unit-group"
        class:interactive
        class:hovered={hoveredAsset?.id === pos.asset.id}
        role={interactive ? 'button' : 'img'}
        tabindex={interactive ? 0 : undefined}
        onclick={() => handleUnitClick(pos.asset)}
        onkeydown={(e) => e.key === 'Enter' && handleUnitClick(pos.asset)}
        onmouseenter={() => handleUnitHover(pos.asset)}
        onmouseleave={() => handleUnitHover(null)}
        onfocus={() => handleUnitHover(pos.asset)}
        onblur={() => handleUnitHover(null)}
      >
        <circle r={unitRadius} fill="transparent" />
      </g>
    {/each}

    <!-- More indicator -->
    {#if hasMore}
      <text x={centerX} y={size - 8} text-anchor="middle" class="more-text">
        +{assets.length - maxUnits} more
      </text>
    {/if}
  </svg>

  <!-- Tooltip -->
  {#if hoveredAsset && showLabels}
    <div class="tooltip">
      <div class="tooltip-name">{hoveredAsset.name || hoveredAsset.id}</div>
      {#if hoveredAsset.status}
        <div class="tooltip-meta">{hoveredAsset.status}</div>
      {/if}
      {#if hoveredAsset.capacityMw}
        <div class="tooltip-meta">{Number(hoveredAsset.capacityMw).toLocaleString()} MW</div>
      {/if}
      {#if hoveredAsset.share}
        <div class="tooltip-meta">{hoveredAsset.share.toFixed(1)}% ownership</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .asset-ring-visualization {
    position: relative;
    display: inline-block;
  }

  svg {
    display: block;
  }

  .unit-group {
    transition: transform 0.15s ease;
  }

  .unit-group.interactive {
    cursor: pointer;
  }

  .unit-group.interactive:hover,
  .unit-group.hovered {
    transform: scale(1.15);
  }

  .unit-group.interactive:focus {
    outline: none;
  }

  .unit-group.interactive:focus circle:first-child {
    stroke: var(--color-black);
    stroke-width: 2;
  }

  .center-capacity {
    font-size: 14px;
    font-weight: 600;
    fill: var(--color-black);
    font-variant-numeric: tabular-nums;
  }

  .center-unit {
    font-size: 9px;
    fill: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .center-count {
    font-size: 10px;
    fill: var(--color-text-tertiary);
  }

  .more-text {
    font-size: 10px;
    fill: var(--color-text-tertiary);
  }

  .tooltip {
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-bottom: 8px;
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-900);
    color: var(--color-white);
    font-size: var(--font-size-sm);
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
  }

  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 6px solid transparent;
    border-top-color: var(--color-gray-900);
  }

  .tooltip-name {
    font-weight: 600;
    margin-bottom: 2px;
  }

  .tooltip-meta {
    color: var(--color-gray-400);
    font-size: var(--font-size-xs);
  }
</style>
