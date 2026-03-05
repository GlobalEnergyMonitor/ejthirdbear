<script lang="ts">
  /**
   * EntityPortfolioFilters - Multi-select filter chips
   * Allows filtering by Location, Tracker Type, and Status
   */
  import TrackerIcon from '$lib/components/tracker/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';

  interface Props {
    assets?: Array<{
      country?: string;
      tracker?: string;
      status?: string;
    }>;
    selectedCountries?: Set<string>;
    selectedTrackers?: Set<string>;
    selectedStatuses?: Set<string>;
    onCountryChange?: (_countries: Set<string>) => void;
    onTrackerChange?: (_trackers: Set<string>) => void;
    onStatusChange?: (_statuses: Set<string>) => void;
    showCountry?: boolean;
    showTracker?: boolean;
    showStatus?: boolean;
    compact?: boolean;
  }

  let {
    assets = [],
    selectedCountries = new Set<string>(),
    selectedTrackers = new Set<string>(),
    selectedStatuses = new Set<string>(),
    onCountryChange = () => {},
    onTrackerChange = () => {},
    onStatusChange = () => {},
    showCountry = true,
    showTracker = true,
    showStatus = true,
    compact = false,
  }: Props = $props();

  // Build filter options from assets
  const countryOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    assets.forEach((a) => {
      const country = a.country || 'Unknown';
      counts.set(country, (counts.get(country) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({
      value,
      label: value,
      count,
    })).sort((a, b) => b.count - a.count);
  });

  const trackerOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    assets.forEach((a) => {
      const tracker = a.tracker || 'Unknown';
      counts.set(tracker, (counts.get(tracker) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({
      value,
      label: value,
      count,
    })).sort((a, b) => b.count - a.count);
  });

  const statusOptions = $derived.by(() => {
    const counts = new Map<string, number>();
    assets.forEach((a) => {
      const status = a.status || 'Unknown';
      counts.set(status, (counts.get(status) || 0) + 1);
    });
    return Array.from(counts, ([value, count]) => ({
      value,
      label: value,
      count,
    })).sort((a, b) => b.count - a.count);
  });

  function toggleCountry(value: string) {
    const newSet = new Set(selectedCountries);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    onCountryChange(newSet);
  }

  function toggleTracker(value: string) {
    const newSet = new Set(selectedTrackers);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    onTrackerChange(newSet);
  }

  function toggleStatus(value: string) {
    const newSet = new Set(selectedStatuses);
    if (newSet.has(value)) {
      newSet.delete(value);
    } else {
      newSet.add(value);
    }
    onStatusChange(newSet);
  }

  function clearAll() {
    onCountryChange(new Set());
    onTrackerChange(new Set());
    onStatusChange(new Set());
  }

  const hasActiveFilters = $derived(
    selectedCountries.size > 0 || selectedTrackers.size > 0 || selectedStatuses.size > 0
  );
</script>

<div class="entity-portfolio-filters" class:compact>
  {#if showTracker && trackerOptions.length > 0}
    <div class="filter-group">
      <span class="filter-label">Tracker</span>
      <div class="chip-list">
        {#each trackerOptions as option}
          <button
            class="filter-chip"
            class:selected={selectedTrackers.has(option.value)}
            onclick={() => toggleTracker(option.value)}
            title="{option.label}: {option.count} assets"
          >
            <TrackerIcon tracker={option.value} size={12} />
            <span class="chip-label">{option.label}</span>
            <span class="chip-count">{option.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if showStatus && statusOptions.length > 0}
    <div class="filter-group">
      <span class="filter-label">Status</span>
      <div class="chip-list">
        {#each statusOptions as option}
          <button
            class="filter-chip"
            class:selected={selectedStatuses.has(option.value)}
            onclick={() => toggleStatus(option.value)}
            title="{option.label}: {option.count} assets"
          >
            <StatusIcon status={option.value} size={10} />
            <span class="chip-label">{option.label}</span>
            <span class="chip-count">{option.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if showCountry && countryOptions.length > 0}
    <div class="filter-group">
      <span class="filter-label">Country</span>
      <div class="chip-list">
        {#each countryOptions.slice(0, compact ? 8 : 20) as option}
          <button
            class="filter-chip"
            class:selected={selectedCountries.has(option.value)}
            onclick={() => toggleCountry(option.value)}
            title="{option.label}: {option.count} assets"
          >
            <span class="chip-label">{option.label}</span>
            <span class="chip-count">{option.count}</span>
          </button>
        {/each}
        {#if countryOptions.length > (compact ? 8 : 20)}
          <span class="more-indicator">+{countryOptions.length - (compact ? 8 : 20)} more</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if hasActiveFilters}
    <div class="filter-actions">
      <button class="clear-btn" onclick={clearAll}> Clear all filters </button>
    </div>
  {/if}
</div>

<style>
  .entity-portfolio-filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
  }

  .entity-portfolio-filters.compact {
    padding: var(--space-3);
    gap: var(--space-3);
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .filter-label {
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .filter-chip:hover {
    border-color: var(--color-gray-500);
  }

  .filter-chip.selected {
    background: var(--color-gray-900);
    border-color: var(--color-gray-900);
    color: var(--color-white);
  }

  .filter-chip.selected .chip-count {
    color: var(--color-gray-400);
  }

  .chip-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
    margin-left: 2px;
  }

  .more-indicator {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding: 4px 8px;
  }

  .filter-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: var(--space-2);
    border-top: var(--border-width) solid var(--color-border);
  }

  .clear-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: transparent;
    border: var(--border-width) solid var(--color-border);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .clear-btn:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  @media (max-width: 768px) {
    .chip-list {
      gap: var(--space-1);
    }

    .filter-chip {
      padding: 3px 8px;
      font-size: var(--font-size-xs);
    }
  }
</style>
