<script>
  /**
   * EntityMicroCard - Tufte/Swiss-inspired entity summary
   *
   * Grid-based, typography-driven, high data-ink ratio.
   * Shows entity name, location, and key metrics in a clean layout.
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
   *   ]}
   * />
   */
  import { colorByTracker } from '$lib/design-tokens';
  import { formatCapacityNullable as formatCapacity } from '$lib/format';

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
        color: colorByTracker.get(t.tracker) || 'var(--color-gray-400)',
      }))
      .filter((t) => t.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  });

  const formattedCapacity = $derived(formatCapacity(totalCapacity));
</script>

{#if href}
  <a class="emc" class:compact={variant === 'compact'} {href}>
    {@render cardContent()}
  </a>
{:else if onclick}
  <button class="emc" class:compact={variant === 'compact'} {onclick} type="button">
    {@render cardContent()}
  </button>
{:else}
  <div class="emc" class:compact={variant === 'compact'}>
    {@render cardContent()}
  </div>
{/if}

{#snippet cardContent()}
  <div class="emc-grid">
    <!-- Row 1: Name -->
    <div class="emc-name" title={name}>{name}</div>

    <!-- Row 2: Location -->
    {#if location}
      <div class="emc-location">{location}</div>
    {/if}

    <!-- Row 3: Stats Grid -->
    {#if assetCount > 0 || formattedCapacity}
      <div class="emc-stats">
        {#if assetCount > 0}
          <div class="emc-stat">
            <span class="emc-stat-value">{Math.round(assetCount).toLocaleString()}</span>
            <span class="emc-stat-label">assets</span>
          </div>
        {/if}
        {#if formattedCapacity}
          <div class="emc-stat">
            <span class="emc-stat-value">{formattedCapacity}</span>
            <span class="emc-stat-label">capacity</span>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Row 4: Tracker breakdown bar (optional) -->
    {#if trackerBreakdown.length > 0}
      <div class="emc-trackers">
        <div class="emc-tracker-bar">
          {#each trackerBreakdown as segment}
            <div
              class="emc-segment"
              style="flex: {segment.pct}; background: {segment.color}"
              title="{segment.tracker}: {segment.count}"
            ></div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/snippet}

<style>
  /* ═══════════════════════════════════════════════════════════════════
     ENTITY MICRO CARD — Tufte/Swiss Design
     Grid-based · Typography-driven · High data-ink ratio
     ═══════════════════════════════════════════════════════════════════ */

  .emc {
    display: block;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
    border-left: 2px solid var(--color-gray-200);
    text-decoration: none;
    color: inherit;
    text-align: left;
    font-family: inherit;
    cursor: default;
    width: 100%;
    min-width: 0;
    transition: border-color 0.15s ease;
  }

  a.emc,
  button.emc {
    cursor: pointer;
  }

  a.emc:hover,
  button.emc:hover {
    border-left-color: var(--color-black);
  }

  .emc.compact {
    padding: var(--space-2) var(--space-3);
  }

  /* Grid Layout */
  .emc-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-1);
  }

  /* Name - Primary element */
  .emc-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-black);
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Location - Secondary */
  .emc-location {
    font-size: 12px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Stats Row - Grid of metrics */
  .emc-stats {
    display: flex;
    gap: var(--space-4);
    margin-top: var(--space-1);
  }

  .emc-stat {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .emc-stat-value {
    font-size: 16px;
    font-weight: 600;
    font-family: var(--font-family-data, inherit);
    font-variant-numeric: tabular-nums;
    color: var(--color-black);
    letter-spacing: -0.01em;
  }

  .emc-stat-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary);
  }

  /* Tracker breakdown bar */
  .emc-trackers {
    margin-top: var(--space-2);
  }

  .emc-tracker-bar {
    display: flex;
    height: 3px;
    gap: 1px;
    overflow: hidden;
  }

  .emc-segment {
    min-width: 2px;
    height: 100%;
  }

  /* Compact variant adjustments */
  .emc.compact .emc-name {
    font-size: 13px;
  }

  .emc.compact .emc-stat-value {
    font-size: 14px;
  }

  .emc.compact .emc-stats {
    gap: var(--space-3);
  }

  .emc.compact .emc-trackers {
    margin-top: var(--space-1);
  }

  .emc.compact .emc-tracker-bar {
    height: 2px;
  }
</style>
