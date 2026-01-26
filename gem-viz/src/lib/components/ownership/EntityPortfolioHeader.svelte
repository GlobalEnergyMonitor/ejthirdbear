<script lang="ts">
  /**
   * EntityPortfolioHeader - Sticky header with entity stats and flower
   * Shows summary stats and OwnershipFlower visualization
   */
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import { entityLink } from '$lib/links';

  interface OwnerPortfolio {
    spotlightOwner: {
      id: string;
      Name: string;
    };
    assets: Array<{
      id: string;
      name: string;
      tracker: string;
      status: string;
      country: string;
      capacityMw?: number;
    }>;
  }

  interface Props {
    portfolio?: OwnerPortfolio | null;
    entityId?: string;
    entityName?: string;
    sticky?: boolean;
    showFlower?: boolean;
    flowerSize?: 'small' | 'medium' | 'large';
  }

  let {
    portfolio = null,
    entityId = '',
    entityName = '',
    sticky = true,
    showFlower = true,
    flowerSize = 'medium',
  }: Props = $props();

  // Compute stats from portfolio
  const stats = $derived.by(() => {
    if (!portfolio?.assets?.length) return null;

    const assets = portfolio.assets;
    const countries = new Set(assets.map((a) => a.country).filter(Boolean));
    const totalCapacity = assets.reduce((sum, a) => sum + (Number(a.capacityMw) || 0), 0);
    const trackers = new Set(assets.map((a) => a.tracker).filter(Boolean));

    return {
      totalAssets: assets.length,
      totalCapacity: totalCapacity > 0 ? totalCapacity : null,
      countries: countries.size,
      trackerTypes: trackers.size,
    };
  });

  const displayName = $derived(
    entityName || portfolio?.spotlightOwner?.Name || entityId || 'Entity'
  );
</script>

<header class="entity-portfolio-header" class:sticky>
  <div class="header-content">
    <div class="header-text">
      <h1 class="entity-name">
        {#if entityId}
          <a href={entityLink(entityId)} class="name-link">{displayName}</a>
        {:else}
          {displayName}
        {/if}
      </h1>

      {#if stats}
        <div class="stats-row">
          <span class="stat">
            <strong>{stats.totalAssets.toLocaleString()}</strong>
            <span class="stat-label">assets</span>
          </span>

          {#if stats.totalCapacity}
            <span class="stat-divider">·</span>
            <span class="stat">
              <strong>{stats.totalCapacity.toLocaleString()}</strong>
              <span class="stat-label">MW</span>
            </span>
          {/if}

          {#if stats.countries > 0}
            <span class="stat-divider">·</span>
            <span class="stat">
              <strong>{stats.countries}</strong>
              <span class="stat-label">{stats.countries === 1 ? 'country' : 'countries'}</span>
            </span>
          {/if}

          {#if stats.trackerTypes > 1}
            <span class="stat-divider">·</span>
            <span class="stat">
              <strong>{stats.trackerTypes}</strong>
              <span class="stat-label">tracker types</span>
            </span>
          {/if}
        </div>
      {/if}

      {#if entityId}
        <p class="entity-id">
          <code>{entityId}</code>
        </p>
      {/if}
    </div>

    {#if showFlower && portfolio}
      <div class="header-flower">
        <OwnershipFlower {portfolio} size={flowerSize} showTitle={false} />
      </div>
    {/if}
  </div>
</header>

<style>
  .entity-portfolio-header {
    background: var(--color-bg-primary);
    border-bottom: var(--border-width) solid var(--color-border);
    padding: var(--space-6) var(--space-8);
    z-index: 10;
  }

  .entity-portfolio-header.sticky {
    position: sticky;
    top: 0;
  }

  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    max-width: 1200px;
    margin: 0 auto;
  }

  .header-text {
    flex: 1;
    min-width: 0;
  }

  .header-flower {
    flex-shrink: 0;
  }

  .entity-name {
    font-size: var(--font-size-2xl);
    font-weight: normal;
    margin: 0 0 var(--space-3) 0;
    line-height: var(--leading-tight);
  }

  .name-link {
    color: inherit;
    text-decoration: none;
  }

  .name-link:hover {
    text-decoration: underline;
  }

  .stats-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .stat {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;
  }

  .stat strong {
    font-size: var(--font-size-lg);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .stat-divider {
    color: var(--color-text-tertiary);
    padding: 0 var(--space-1);
  }

  .entity-id {
    margin: 0;
  }

  .entity-id code {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    background: var(--color-bg-tertiary);
    padding: 2px 6px;
  }

  @media (max-width: 768px) {
    .header-content {
      flex-direction: column;
      gap: var(--space-4);
    }

    .header-flower {
      align-self: center;
    }

    .entity-portfolio-header {
      padding: var(--space-4);
    }
  }
</style>
