<script lang="ts">
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
    summary?: {
      totalAssets: number;
      totalCapacityMw: number | null;
      countries: number;
      trackerTypes: number;
    };
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

  const formatNumber = (value: number) => value.toLocaleString();

  // Summary stats from the portfolio
  const stats = $derived.by(() => {
    if (portfolio?.summary && portfolio.summary.totalAssets > 0) {
      const { totalAssets, totalCapacityMw, countries, trackerTypes } = portfolio.summary;
      const items = [
        { key: 'assets', value: formatNumber(totalAssets), label: 'assets' },
        totalCapacityMw
          ? { key: 'capacity', value: formatNumber(totalCapacityMw), label: 'MW' }
          : null,
        countries > 0
          ? {
              key: 'countries',
              value: formatNumber(countries),
              label: countries === 1 ? 'country' : 'countries',
            }
          : null,
        trackerTypes > 1
          ? { key: 'trackers', value: formatNumber(trackerTypes), label: 'tracker types' }
          : null,
      ].filter(Boolean) as Array<{ key: string; value: string; label: string }>;

      return { items };
    }

    const assets = portfolio?.assets;
    if (!assets?.length) return null;

    const countries = new Set<string>();
    const trackers = new Set<string>();
    let totalCapacity = 0;

    for (const asset of assets) {
      if (asset.country) countries.add(asset.country);
      if (asset.tracker) trackers.add(asset.tracker);
      totalCapacity += Number(asset.capacityMw) || 0;
    }

    const totalCapacityMw = totalCapacity > 0 ? totalCapacity : null;
    const countriesCount = countries.size;
    const trackerTypesCount = trackers.size;

    const items = [
      { key: 'assets', value: formatNumber(assets.length), label: 'assets' },
      totalCapacityMw
        ? { key: 'capacity', value: formatNumber(totalCapacityMw), label: 'MW' }
        : null,
      countriesCount > 0
        ? {
            key: 'countries',
            value: formatNumber(countriesCount),
            label: countriesCount === 1 ? 'country' : 'countries',
          }
        : null,
      trackerTypesCount > 1
        ? { key: 'trackers', value: formatNumber(trackerTypesCount), label: 'tracker types' }
        : null,
    ].filter(Boolean) as Array<{ key: string; value: string; label: string }>;

    return { items };
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

      {#if stats?.items?.length}
        <div class="stats-row">
          {#each stats.items as item, idx (item.key)}
            {#if idx > 0}
              <span class="stat-divider">·</span>
            {/if}
            <span class="stat">
              <strong>{item.value}</strong>
              <span class="stat-label">{item.label}</span>
            </span>
          {/each}
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
