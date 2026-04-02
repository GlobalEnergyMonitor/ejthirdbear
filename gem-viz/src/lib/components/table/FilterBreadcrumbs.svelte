<script>
  /**
   * FilterBreadcrumbs - Horizontal display of active filters with remove buttons
   *
   * Shows all applied filters as chips that can be individually removed.
   * Reusable across the app wherever filter state is displayed.
   */

  import { formatCompact } from '$lib/utils/format';

  /**
   * @typedef {Object} FilterState
   * @property {string[]} trackers
   * @property {string[]} statuses
   * @property {string[]} countries
   * @property {string[]} ownerCountries
   * @property {string[]} owners
   * @property {number|null} capacityMin
   * @property {number|null} capacityMax
   * @property {number|null} shareMin
   * @property {number|null} shareMax
   * @property {number|null} startYearMin
   * @property {number|null} startYearMax
   * @property {string} search
   */

  /**
   * @type {{
   *   filters?: Partial<FilterState>,
   *   onRemove?: (key: string, value?: string) => void,
   *   compact?: boolean,
   * }}
   */
  let {
    filters = {
      trackers: [],
      statuses: [],
      countries: [],
      ownerCountries: [],
      owners: [],
      capacityMin: null,
      capacityMax: null,
      shareMin: null,
      shareMax: null,
      startYearMin: null,
      startYearMax: null,
      search: '',
    },
    onRemove = () => {},
    compact = false,
  } = $props();

  // Build flat list of all active filter chips
  const chips = $derived.by(() => {
    const result = [];

    // Array filters - one chip per value or grouped
    if (filters.trackers?.length) {
      if (compact && filters.trackers.length > 2) {
        result.push({
          key: 'trackers',
          label: 'Tracker',
          value: `${filters.trackers.length} selected`,
          group: true,
        });
      } else {
        for (const v of filters.trackers) {
          result.push({ key: 'trackers', label: 'Tracker', value: v });
        }
      }
    }

    if (filters.statuses?.length) {
      if (compact && filters.statuses.length > 2) {
        result.push({
          key: 'statuses',
          label: 'Status',
          value: `${filters.statuses.length} selected`,
          group: true,
        });
      } else {
        for (const v of filters.statuses) {
          result.push({ key: 'statuses', label: 'Status', value: v });
        }
      }
    }

    if (filters.countries?.length) {
      if (compact && filters.countries.length > 2) {
        result.push({
          key: 'countries',
          label: 'Country',
          value: `${filters.countries.length} selected`,
          group: true,
        });
      } else {
        for (const v of filters.countries) {
          result.push({ key: 'countries', label: 'Country', value: v });
        }
      }
    }

    if (filters.ownerCountries?.length) {
      if (compact && filters.ownerCountries.length > 2) {
        result.push({
          key: 'ownerCountries',
          label: 'Owner HQ',
          value: `${filters.ownerCountries.length} selected`,
          group: true,
        });
      } else {
        for (const v of filters.ownerCountries) {
          result.push({ key: 'ownerCountries', label: 'Owner HQ', value: v });
        }
      }
    }

    if (filters.owners?.length) {
      if (compact && filters.owners.length > 2) {
        result.push({
          key: 'owners',
          label: 'Owner',
          value: `${filters.owners.length} selected`,
          group: true,
        });
      } else {
        for (const v of filters.owners) {
          result.push({ key: 'owners', label: 'Owner', value: v });
        }
      }
    }

    // Range filters
    if (filters.capacityMin != null || filters.capacityMax != null) {
      const min = filters.capacityMin != null ? formatCompact(filters.capacityMin) : '0';
      const max = filters.capacityMax != null ? formatCompact(filters.capacityMax) : '∞';
      result.push({ key: 'capacity', label: 'Capacity', value: `${min}–${max} MW`, range: true });
    }

    if (filters.shareMin != null || filters.shareMax != null) {
      const min = filters.shareMin != null ? filters.shareMin : '0';
      const max = filters.shareMax != null ? filters.shareMax : '100';
      result.push({ key: 'share', label: 'Share', value: `${min}–${max}%`, range: true });
    }

    if (filters.startYearMin != null || filters.startYearMax != null) {
      const min = filters.startYearMin != null ? filters.startYearMin : '—';
      const max = filters.startYearMax != null ? filters.startYearMax : '—';
      result.push({ key: 'startYear', label: 'Year', value: `${min}–${max}`, range: true });
    }

    // Text search
    if (filters.search) {
      result.push({ key: 'search', label: 'Search', value: `"${filters.search}"` });
    }

    return result;
  });

  function handleRemove(chip) {
    if (chip.group || chip.range) {
      // Remove entire filter group
      onRemove(chip.key);
    } else {
      // Remove single value from array
      onRemove(chip.key, chip.value);
    }
  }
</script>

{#if chips.length > 0}
  <div class="filter-breadcrumbs" class:compact>
    {#each chips as chip, i (chip.key + ':' + chip.value)}
      {#if i > 0}
        {@const prevChip = chips[i - 1]}
        {#if prevChip.key === chip.key}
          <span class="logic-op or">or</span>
        {:else}
          <span class="logic-op and">+</span>
        {/if}
      {/if}
      <span class="chip" class:range={chip.range}>
        <span class="chip-label">{chip.label}:</span>
        <span class="chip-value">{chip.value}</span>
        <button
          class="chip-remove"
          onclick={() => handleRemove(chip)}
          aria-label="Remove {chip.label} filter"
        >
          ×
        </button>
      </span>
    {/each}
  </div>
{/if}

<style>
  .filter-breadcrumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 0;
  }

  .filter-breadcrumbs.compact {
    gap: 4px;
    padding: 4px 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 6px var(--space-2) 6px var(--space-3);
    background: var(--gem-orange);
    border: none;
    border-radius: 5px;
    font-size: var(--font-size-sm);
    line-height: 1;
    max-width: 200px;
  }

  .compact .chip {
    padding: 2px var(--space-1) 2px var(--space-2);
    font-size: var(--font-size-xs);
  }

  .chip.range {
    background: var(--gem-teal-10);
    border-color: var(--gem-teal-25);
  }

  .chip-label {
    color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
    flex-shrink: 0;
  }

  .chip-value {
    color: #fff;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    margin-left: 4px;
    background: rgba(255, 255, 255, 0.2);
    border: none;
    border-radius: 50%;
    color: #fff;
    font-size: var(--font-size-body);
    font-weight: bold;
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }

  .chip-remove:hover {
    background: rgba(255, 255, 255, 0.35);
    color: #fff;
  }

  .compact .chip-remove {
    width: 12px;
    height: 12px;
    font-size: var(--font-size-xs);
  }

  .logic-op {
    font-size: var(--font-size-xs);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    padding: 0 2px;
  }

  .logic-op.or {
    color: var(--color-text-secondary);
  }

  .logic-op.and {
    color: var(--color-text-primary);
    font-weight: 600;
  }

  .compact .logic-op {
    font-size: var(--font-size-xs);
  }
</style>
