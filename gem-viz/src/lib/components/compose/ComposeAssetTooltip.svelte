<script lang="ts">
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';

  type TooltipAsset = {
    id: string;
    name: string;
    status?: string | null;
    country?: string | null;
    capacity?: number | null;
    owner?: string | null;
    startYear?: number | null;
    tracker?: string | null;
  };

  let {
    asset,
    tooltipPos,
    inCart = false,
  }: {
    asset: TooltipAsset;
    tooltipPos: { x: number; y: number };
    inCart?: boolean;
  } = $props();

  const left = $derived(
    typeof window === 'undefined'
      ? tooltipPos.x + 12
      : Math.min(tooltipPos.x + 12, window.innerWidth - 340)
  );
  const top = $derived(
    typeof window === 'undefined'
      ? tooltipPos.y - 10
      : Math.min(tooltipPos.y - 10, window.innerHeight - 200)
  );
</script>

<div class="asset-tooltip" style="left: {left}px; top: {top}px;">
  {#if inCart}
    <div class="tooltip-header">
      <span class="in-cart-badge" title="In your investigation">In Cart</span>
    </div>
  {/if}
  <ProjectCard
    asset={{
      id: asset.id,
      name: asset.name,
      status: asset.status,
      country: asset.country,
      capacity: asset.capacity,
      owner: asset.owner,
      startYear: asset.startYear,
      tracker: asset.tracker,
    }}
    variant="compact"
    open={true}
    showLink={false}
  />
</div>

<style>
  .asset-tooltip {
    position: fixed;
    z-index: 1000;
    max-width: 320px;
    pointer-events: none;
    animation: tooltip-fade-in 0.15s ease-out;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    padding: 4px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }

  .asset-tooltip :global(.project-card) {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .asset-tooltip :global(.project-card summary) {
    background: transparent;
  }

  .asset-tooltip :global(.details-section) {
    background: transparent;
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
    gap: 8px;
  }

  .in-cart-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    padding: 3px var(--space-1);
    background: linear-gradient(90deg, var(--color-warning) 0%, var(--color-warning-light) 100%);
    color: var(--color-black);
    border-radius: var(--radius-sm);
  }

  @keyframes tooltip-fade-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
