<script>
  /**
   * EntityMicroCard - Compact entity summary for tooltips & small multiples
   *
   * A tiny, information-dense card showing:
   * - Entity name & location
   * - Mini flower visualization
   * - Asset count & total capacity
   * - Tracker breakdown bar
   *
   * Perfect for: tooltips, hover states, grid layouts, search results
   *
   * @example
   * <EntityMicroCard
   *   name="China Energy Corp"
   *   location="Beijing, China"
   *   assetCount={234}
   *   totalCapacity={45000}
   *   trackers={[
   *     { tracker: 'Coal Plant', count: 140, capacity: 27000 },
   *     { tracker: 'Gas Plant', count: 70, capacity: 13500 },
   *     { tracker: 'Solar', count: 24, capacity: 4500 }
   *   ]}
   * />
   */
  import MiniFlower from './MiniFlower.svelte';
  import { formatCompact } from '$lib/format';
  import { colorByTracker } from '$lib/design-tokens';

  let {
    name = '',
    location = '',
    assetCount = 0,
    totalCapacity = 0,
    trackers = [],
    href = '',
    variant = 'default',
    onclick = undefined,
  } = $props();

  // Calculate tracker percentages for the breakdown bar
  const trackerBreakdown = $derived.by(() => {
    if (!trackers.length) return [];
    const total = trackers.reduce((sum, t) => sum + (t.count || 0), 0) || 1;
    return trackers
      .map((t) => ({
        tracker: t.tracker,
        count: t.count || 0,
        pct: ((t.count || 0) / total) * 100,
        color: colorByTracker.get(t.tracker) || '#888',
      }))
      .filter((t) => t.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  });

  // Format capacity with smart units
  function formatCapacity(mw) {
    if (mw >= 1000) {
      return `${(mw / 1000).toFixed(1)} GW`;
    }
    return `${formatCompact(mw)} MW`;
  }

  // Top 3 trackers for the text summary
  const topTrackers = $derived(
    trackerBreakdown
      .slice(0, 3)
      .map((t) => `${t.tracker.replace(' Plant', '').replace(' Mine', '')} ${Math.round(t.pct)}%`)
      .join(' · ')
  );
</script>

{#if href}
  <a class="entity-micro-card" class:clickable={true} {href}>
    {@render cardContent()}
  </a>
{:else if onclick}
  <button class="entity-micro-card" class:clickable={true} {onclick}>
    {@render cardContent()}
  </button>
{:else}
  <div class="entity-micro-card" class:compact={variant === 'compact'}>
    {@render cardContent()}
  </div>
{/if}

{#snippet cardContent()}
  <div class="card-header">
    <div class="card-info">
      <div class="entity-name" title={name}>{name}</div>
      {#if location}
        <div class="entity-location">{location}</div>
      {/if}
    </div>
    {#if trackers.length > 0}
      <div class="flower-container">
        <MiniFlower {trackers} size={32} />
      </div>
    {/if}
  </div>

  {#if assetCount > 0 || totalCapacity > 0}
    <div class="card-stats">
      {#if assetCount > 0}
        <span class="stat">
          <span class="stat-value">{formatCompact(assetCount)}</span>
          <span class="stat-label">assets</span>
        </span>
      {/if}
      {#if totalCapacity > 0}
        {#if assetCount > 0}<span class="stat-divider">·</span>{/if}
        <span class="stat">
          <span class="stat-value">{formatCapacity(totalCapacity)}</span>
          <span class="stat-label">capacity</span>
        </span>
      {/if}
    </div>
  {/if}

  {#if trackerBreakdown.length > 0}
    <div class="tracker-bar" title={topTrackers}>
      {#each trackerBreakdown as segment}
        <div
          class="tracker-segment"
          style="width: {segment.pct}%; background: {segment.color}"
          title="{segment.tracker}: {segment.count} ({Math.round(segment.pct)}%)"
        ></div>
      {/each}
    </div>
    <div class="tracker-summary">{topTrackers}</div>
  {/if}
{/snippet}

<style>
  .entity-micro-card {
    display: block;
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-3) var(--space-4);
    font-size: var(--font-size-md);
    min-width: 0; /* Allow shrinking in grid */
    width: 100%;
    text-decoration: none;
    color: inherit;
    text-align: left;
    font-family: inherit;
    cursor: default;
  }

  .entity-micro-card.clickable {
    cursor: pointer;
    transition: border-color var(--duration-base) var(--ease-in-out-quad);
  }

  .entity-micro-card.clickable:hover {
    border-color: var(--color-gray-400);
  }

  .entity-micro-card.compact {
    padding: var(--space-2) var(--space-3);
  }

  .card-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: start;
    margin-bottom: var(--space-2);
  }

  .card-info {
    min-width: 0; /* Essential for text-overflow in grid children */
  }

  .entity-name {
    font-weight: 600;
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: var(--line-height-tight);
  }

  .entity-location {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }

  .flower-container {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-stats {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    color: var(--color-text-secondary);
  }

  .stat {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
  }

  .stat-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--color-text-primary);
  }

  .stat-label {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
  }

  .stat-divider {
    color: var(--color-gray-300);
  }

  .tracker-bar {
    display: flex;
    height: 4px;
    overflow: hidden;
    background: var(--color-gray-100);
    margin-bottom: var(--space-1);
  }

  .tracker-segment {
    height: 100%;
    min-width: 2px;
    transition: width var(--duration-slow) var(--ease-in-out-quad);
  }

  .tracker-summary {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
