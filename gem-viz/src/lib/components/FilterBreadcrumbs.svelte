<script>
  /**
   * FilterBreadcrumbs - Horizontal display of active filters with remove buttons
   *
   * Shows all applied filters as chips that can be individually removed.
   * Reusable across the app wherever filter state is displayed.
   */

  import { formatCompact } from '$lib/format';

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
    gap: 4px;
    padding: 4px 6px 4px 8px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 3px;
    font-size: 11px;
    line-height: 1;
    max-width: 200px;
  }

  .compact .chip {
    padding: 2px 4px 2px 6px;
    font-size: 10px;
  }

  .chip.range {
    background: #e8f4f8;
    border-color: #b8d4e3;
  }

  .chip-label {
    color: #666;
    font-weight: 500;
    flex-shrink: 0;
  }

  .chip-value {
    color: #000;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    padding: 0;
    margin-left: 2px;
    background: transparent;
    border: none;
    border-radius: 2px;
    color: #666;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    flex-shrink: 0;
  }

  .chip-remove:hover {
    background: #ddd;
    color: #000;
  }

  .compact .chip-remove {
    width: 12px;
    height: 12px;
    font-size: 10px;
  }

  .logic-op {
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: #888;
    padding: 0 2px;
  }

  .logic-op.or {
    color: #666;
  }

  .logic-op.and {
    color: #444;
    font-weight: 600;
  }

  .compact .logic-op {
    font-size: 8px;
  }
</style>
