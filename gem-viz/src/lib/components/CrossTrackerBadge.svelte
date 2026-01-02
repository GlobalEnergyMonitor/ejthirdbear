<script>
  /**
   * CrossTrackerBadge - Shows when an entity owns assets across multiple trackers
   *
   * Highlights entities that span multiple sectors (coal + gas, etc.) which is
   * valuable for researchers studying diversified fossil fuel portfolios.
   *
   * @example
   * <CrossTrackerBadge trackers={['Coal Plant', 'Gas Plant', 'Coal Mine']} />
   *
   * Renders:
   * [Multi-sector: Coal Plant, Gas Plant, Coal Mine]
   */
  import TrackerIcon from './TrackerIcon.svelte';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  let {
    /** Array of tracker names this entity owns assets in */
    trackers = [],
    /** Show expanded view with icons */
    expanded = false,
    /** Compact inline display */
    compact = false,
  } = $props();

  // ---------------------------------------------------------------------------
  // Computed
  // ---------------------------------------------------------------------------
  const trackerCount = $derived(trackers?.length || 0);
  const isMultiTracker = $derived(trackerCount >= 2);
  const isConglomerate = $derived(trackerCount >= 3);

  // Short tracker names for compact display
  const shortName = (tracker) => {
    const map = {
      'Coal Plant': 'Coal',
      'Gas Plant': 'Gas',
      'Coal Mine': 'Coal Mining',
      'Iron Mine': 'Iron',
      'Steel Plant': 'Steel',
      'Bioenergy Power': 'Bioenergy',
      'Gas Pipeline': 'Pipeline',
    };
    return map[tracker] || tracker;
  };
</script>

<!-- ---------------------------------------------------------------------------
     Template
     --------------------------------------------------------------------------- -->
{#if isMultiTracker}
  <div
    class="cross-tracker-badge"
    class:expanded
    class:compact
    class:conglomerate={isConglomerate}
    title="This entity owns assets across {trackerCount} different tracker types"
  >
    <span class="badge-label">
      {#if isConglomerate}
        Conglomerate
      {:else}
        Multi-sector
      {/if}
    </span>

    {#if expanded}
      <ul class="tracker-list">
        {#each trackers as tracker}
          <li>
            <TrackerIcon {tracker} size={12} />
            <span>{tracker}</span>
          </li>
        {/each}
      </ul>
    {:else}
      <span class="tracker-summary">
        {trackers.map(shortName).join(' + ')}
      </span>
    {/if}
  </div>
{/if}

<!-- ---------------------------------------------------------------------------
     Styles
     --------------------------------------------------------------------------- -->
<style>
  .cross-tracker-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: system-ui, sans-serif;
    font-size: 11px;
    padding: 4px 10px;
    background: #f0f0f0;
    border-left: 3px solid #666;
    transition:
      box-shadow 100ms ease,
      transform 100ms ease,
      background 100ms ease;
  }

  .cross-tracker-badge:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transform: translateY(-1px);
    background: #e8e8e8;
  }

  .cross-tracker-badge.conglomerate {
    border-left-color: #000;
    background: #e8e8e8;
  }

  .cross-tracker-badge.compact {
    padding: 2px 6px;
    font-size: 10px;
    gap: 4px;
  }

  .cross-tracker-badge.expanded {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding: 10px 14px;
  }

  .badge-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #333;
  }

  .conglomerate .badge-label {
    color: #000;
  }

  .tracker-summary {
    color: #666;
  }

  .tracker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tracker-list li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: white;
    font-size: 11px;
  }
</style>
