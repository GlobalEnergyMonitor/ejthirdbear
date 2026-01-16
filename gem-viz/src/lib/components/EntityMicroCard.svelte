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

  <div class="card-stats">
    <span class="stat">
      <span class="stat-value">{formatCompact(assetCount)}</span>
      <span class="stat-label">assets</span>
    </span>
    {#if totalCapacity > 0}
      <span class="stat-divider">·</span>
      <span class="stat">
        <span class="stat-value">{formatCapacity(totalCapacity)}</span>
        <span class="stat-label">capacity</span>
      </span>
    {/if}
  </div>

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
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    min-width: 180px;
    max-width: 280px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    text-decoration: none;
    color: inherit;
    text-align: left;
    width: 100%;
    font-family: inherit;
    cursor: default;
  }

  .entity-micro-card.clickable {
    cursor: pointer;
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      transform 0.1s;
  }

  .entity-micro-card.clickable:hover {
    border-color: #999;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    transform: translateY(-1px);
  }

  .entity-micro-card.compact {
    padding: 6px 8px;
    min-width: 140px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-info {
    flex: 1;
    min-width: 0;
  }

  .entity-name {
    font-weight: 600;
    font-size: 12px;
    color: #111;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .entity-location {
    font-size: 10px;
    color: #666;
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
    gap: 4px;
    margin-bottom: 6px;
    color: #444;
  }

  .stat {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
  }

  .stat-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: #222;
  }

  .stat-label {
    font-size: 10px;
    color: #888;
  }

  .stat-divider {
    color: #ccc;
  }

  .tracker-bar {
    display: flex;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
    background: #f0f0f0;
    margin-bottom: 4px;
  }

  .tracker-segment {
    height: 100%;
    min-width: 2px;
    transition: width 0.3s ease-out;
  }

  .tracker-summary {
    font-size: 9px;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .entity-micro-card {
      background: #1a1a1a;
      border-color: #333;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    }

    .entity-micro-card.clickable:hover {
      border-color: #555;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    }

    .entity-name {
      color: #eee;
    }

    .entity-location {
      color: #999;
    }

    .stat-value {
      color: #ddd;
    }

    .tracker-bar {
      background: #333;
    }
  }
</style>
