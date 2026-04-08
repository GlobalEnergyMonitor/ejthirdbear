<script lang="ts">
  /**
   * AssetRingVisualization - Ring-of-circles for multi-unit assets
   * Shows assets arranged in a circular ring with status coloring and ownership pies
   *
   * Used for visualizing multiple units at a single location
   */
  import { goto } from '$app/navigation';
  import { assetLink } from '$lib/links';
  import { getStatusColor, getTrackerColor, colors } from '$lib/design-tokens';

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

  let svgEl: SVGSVGElement | null = $state(null);
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

  // Calculate positions for each unit
  const unitPositions = $derived.by(() => {
    if (displayAssets.length === 0) return [];

    const angleStep = (2 * Math.PI) / displayAssets.length;
    const startAngle = -Math.PI / 2; // Start from top

    return displayAssets.map((asset, i) => {
      const angle = startAngle + i * angleStep;
      return {
        asset,
        x: centerX + ringRadius * Math.cos(angle),
        y: centerY + ringRadius * Math.sin(angle),
        angle,
      };
    });
  });

  // Total capacity
  const totalCapacity = $derived(
    displayAssets.reduce((sum, a) => sum + (Number(a.capacityMw) || 0), 0)
  );

  function handleUnitClick(asset: Asset) {
    if (interactive) {
      const url = assetLink(asset.id);
      onNavigate ? onNavigate(url) : goto(url);
    }
  }

  function handleUnitHover(asset: Asset | null) {
    hoveredAsset = asset;
  }

  // Draw ownership pie arc
  function ownershipArcPath(share: number, radius: number): string {
    if (!share || share <= 0) return '';
    const normalizedShare = Math.min(share, 100) / 100;
    const endAngle = normalizedShare * 2 * Math.PI - Math.PI / 2;
    const startAngle = -Math.PI / 2;
    const largeArc = normalizedShare > 0.5 ? 1 : 0;

    const x1 = radius * Math.cos(startAngle);
    const y1 = radius * Math.sin(startAngle);
    const x2 = radius * Math.cos(endAngle);
    const y2 = radius * Math.sin(endAngle);

    if (normalizedShare >= 1) {
      return `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius}`;
    }

    return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  }
</script>

<div class="asset-ring-visualization">
  <svg bind:this={svgEl} width={size} height={size} aria-label="Asset ring visualization">
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

    <!-- Connecting ring for multi-unit locations -->
    {#if displayAssets.length > 1}
      <circle
        cx={centerX}
        cy={centerY}
        r={ringRadius}
        fill="none"
        stroke={colors.gray300}
        stroke-width="1"
      />
    {/if}

    <!-- Asset units -->
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
        <!-- Base circle with status color -->
        <circle
          r={unitRadius}
          fill={getStatusColor(pos.asset.status)}
          stroke={colors.gray700}
          stroke-width="1"
          style="mix-blend-mode: multiply"
        />

        <!-- Ownership pie overlay -->
        {#if showOwnership && pos.asset.share}
          <path
            d={ownershipArcPath(pos.asset.share, unitRadius * 0.7)}
            fill={colors.navy}
            fill-opacity="0.15"
            stroke="white"
            stroke-width="1"
            stroke-opacity="0.6"
          />
        {/if}

        <!-- Tracker indicator dot -->
        {#if pos.asset.tracker}
          <circle
            r={3}
            cy={-unitRadius + 3}
            fill={getTrackerColor(pos.asset.tracker)}
            stroke={colors.white}
            stroke-width="0.5"
          />
        {/if}
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
