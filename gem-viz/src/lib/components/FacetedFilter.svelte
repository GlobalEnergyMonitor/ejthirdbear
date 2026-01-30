<script>
  /**
   * FacetedFilter - Shopping-style faceted filter component
   *
   * A checkbox list that feels like Amazon/Home Depot filters:
   * - Selected items float to top with smooth FLIP animations
   * - Live-updating counts
   * - "See more/less" expansion
   * - Search within facet
   * - Zero-count items dimmed
   * - Shift+click for AND filtering (vs default OR)
   */

  import { formatCompact } from '$lib/format';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';

  /**
   * @type {{
   *   options: Array<{value: string, count?: number}>,
   *   selected?: string[],
   *   selectedAnd?: string[],
   *   label: string,
   *   initialVisible?: number,
   *   searchThreshold?: number,
   *   loading?: boolean,
   * }}
   */
  let {
    options = [],
    selected = $bindable([]),
    selectedAnd = $bindable([]),
    label = '',
    initialVisible = 5,
    searchThreshold = 10,
    loading = false,
  } = $props();

  // Internal state
  let expanded = $state(false);
  let search = $state('');

  // Selected items as a set for quick lookups
  const selectedSet = $derived(new Set(selected));

  // Sort options: selected first, then by count
  const sortedOptions = $derived.by(() => {
    // Filter by search if expanded and searching
    let filtered = options;
    if (expanded && search.length >= 1) {
      const needle = search.toLowerCase();
      filtered = options.filter((o) => o.value.toLowerCase().includes(needle));
    }

    // Sort: selected first, then by count desc
    return [...filtered].sort((a, b) => {
      const aSelected = selectedSet.has(a.value) ? 1 : 0;
      const bSelected = selectedSet.has(b.value) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return (b.count || 0) - (a.count || 0);
    });
  });

  // Visible options based on expanded state
  const visibleOptions = $derived.by(() => {
    if (expanded || sortedOptions.length <= initialVisible) {
      return sortedOptions;
    }
    // When collapsed, show selected items + top items up to initialVisible
    const selectedItems = sortedOptions.filter((o) => selectedSet.has(o.value));
    const unselectedItems = sortedOptions.filter((o) => !selectedSet.has(o.value));
    const slotsForUnselected = Math.max(0, initialVisible - selectedItems.length);
    return [...selectedItems, ...unselectedItems.slice(0, slotsForUnselected)];
  });

  const hiddenCount = $derived(sortedOptions.length - visibleOptions.length);
  const showSearch = $derived(expanded && options.length > searchThreshold);

  // Max count for proportion bars
  const maxCount = $derived(Math.max(...options.map((o) => o.count || 0), 1));

  // Split visible options into those with results and those without
  const optionsWithResults = $derived(
    visibleOptions.filter((o) => (o.count || 0) > 0 || selectedSet.has(o.value))
  );
  const optionsWithoutResults = $derived(
    visibleOptions.filter((o) => (o.count || 0) === 0 && !selectedSet.has(o.value))
  );
  const showNoResultsDivider = $derived(
    optionsWithoutResults.length > 0 && optionsWithResults.length > 0
  );

  /**
   * Toggle selection - simple on/off
   * @param {string} value
   */
  function toggle(value) {
    const isSelected = selected.includes(value);
    if (isSelected) {
      selected = selected.filter((v) => v !== value);
    } else {
      selected = [...selected, value];
    }
  }

  function clearAll() {
    selected = [];
  }

  function toggleExpand() {
    expanded = !expanded;
    if (!expanded) {
      search = '';
    }
  }
</script>

<div class="facet" class:loading>
  <div class="facet-header">
    <span class="facet-label">
      {label}
      {#if selected.length > 0}
        <span class="facet-logic">{selected.length} selected</span>
      {:else}
        <span class="facet-total">({options.length})</span>
      {/if}
      {#if loading}
        <span class="facet-loading">...</span>
      {/if}
    </span>
    {#if selected.length > 0}
      <button class="facet-clear" onclick={clearAll}>Clear</button>
    {/if}
  </div>

  {#if showSearch}
    <input
      type="text"
      class="facet-search"
      placeholder="Filter {label.toLowerCase()}..."
      bind:value={search}
    />
  {/if}

  <div class="facet-options" class:expanded>
    <!-- Options with results -->
    {#each optionsWithResults as option (option.value)}
      {@const isSelected = selectedSet.has(option.value)}
      {@const proportion = ((option.count || 0) / maxCount) * 100}
      <label
        class="facet-option"
        class:selected={isSelected}
        style="--bar-width: {proportion}%"
        animate:flip={{ duration: 200, easing: (t) => t * (2 - t) }}
        in:fade={{ duration: 150 }}
        onclick={(e) => {
          e.preventDefault();
          toggle(option.value);
        }}
      >
        <span class="facet-bar"></span>
        <input type="checkbox" checked={isSelected} tabindex="-1" />
        <span class="facet-option-label">{option.value}</span>
        {#if option.count !== undefined}
          <span class="facet-count">({formatCompact(option.count)})</span>
        {/if}
      </label>
    {/each}

    <!-- Divider for zero-count options -->
    {#if showNoResultsDivider}
      <div class="no-results-divider">No results match:</div>
    {/if}

    <!-- Options without results -->
    {#each optionsWithoutResults as option (option.value)}
      <label
        class="facet-option zero-count"
        style="--bar-width: 0%"
        animate:flip={{ duration: 200, easing: (t) => t * (2 - t) }}
        in:fade={{ duration: 150 }}
      >
        <span class="facet-bar"></span>
        <input type="checkbox" checked={false} disabled onchange={() => toggle(option.value)} />
        <span class="facet-option-label">{option.value}</span>
        <span class="facet-count">(0)</span>
      </label>
    {/each}
  </div>

  {#if hiddenCount > 0 || expanded}
    <button class="facet-toggle" onclick={toggleExpand}>
      {#if expanded}
        <span class="toggle-icon">&#9662;</span> See less
      {:else}
        <span class="toggle-icon">&#9656;</span> See {hiddenCount} more
      {/if}
    </button>
  {/if}
</div>

<style>
  .facet {
    margin-bottom: 12px;
    transition: opacity 0.15s;
  }

  .facet.loading {
    opacity: 0.6;
  }

  .facet-loading {
    color: var(--color-text-tertiary);
    font-weight: 700;
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.4;
    }
  }

  .facet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .facet-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
  }

  .facet-total {
    font-weight: 700;
    color: var(--color-text-tertiary);
  }

  .facet-logic {
    font-weight: 700;
    color: var(--color-text-secondary);
    text-transform: none;
    letter-spacing: 0;
    font-size: 9px;
    margin-left: 4px;
  }

  .facet-clear {
    font-size: 10px;
    font-weight: 700;
    color: var(--color-text-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .facet-clear:hover {
    text-decoration: underline;
  }

  .facet-search {
    width: 100%;
    padding: 6px 8px;
    font-size: 11px;
    border: 1px solid var(--color-border);
    margin-bottom: 8px;
  }

  .facet-search:focus {
    outline: none;
    border-color: var(--color-text-secondary);
  }

  .facet-options {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .facet-options.expanded {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 4px 0;
    margin-top: 4px;
  }

  .facet-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 0;
    transition:
      background 0.1s,
      opacity 0.2s;
    position: relative;
    overflow: hidden;
    min-height: 28px;
    user-select: none;
    -webkit-user-select: none;
  }

  /* Proportion bar - subtle background fill (monochrome) */
  .facet-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: var(--bar-width, 0%);
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.06) 0%, rgba(0, 0, 0, 0.02) 100%);
    transition: width 0.3s ease-out;
    pointer-events: none;
    border-radius: 2px;
  }

  .facet-option.selected .facet-bar {
    background: linear-gradient(90deg, rgba(254, 79, 45, 0.25) 0%, rgba(254, 79, 45, 0.08) 100%);
  }

  .facet-option:hover {
    background: var(--color-gray-50);
  }

  .facet-option:hover .facet-bar {
    background: linear-gradient(90deg, rgba(0, 0, 0, 0.08) 0%, rgba(0, 0, 0, 0.03) 100%);
  }

  .facet-option.selected {
    font-weight: 700;
    border-left: 3px solid var(--gem-orange, #fe4f2d);
    padding-left: 7px;
  }

  .facet-option.zero-count {
    opacity: 0.5;
    cursor: default;
  }

  .facet-option.zero-count:hover {
    background: transparent;
  }

  .no-results-divider {
    font-size: 9px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 8px 10px 4px 10px;
    border-top: 1px solid var(--color-border);
    margin-top: 4px;
    background: var(--color-gray-50);
  }

  .facet-option input[type='checkbox'] {
    position: relative;
    width: 14px;
    height: 14px;
    min-width: 14px;
    margin: 0;
    pointer-events: none; /* Let clicks go through to label handler */
    accent-color: var(--gem-orange, #fe4f2d);
    border: 1px solid var(--color-text-tertiary);
    border-radius: 2px;
    appearance: auto;
    flex-shrink: 0;
  }

  .facet-option.zero-count input[type='checkbox'] {
    cursor: default;
    opacity: 0.5;
  }

  .facet-option-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .facet-count {
    color: var(--color-text-secondary);
    font-size: 11px;
    flex-shrink: 0;
    font-family: var(--font-family-data);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-variant-numeric: tabular-nums;
    min-width: 40px;
    text-align: right;
  }

  /* Subtle highlight when count changes (applied via loading state) */
  .facet.loading .facet-count {
    color: var(--color-gray-300);
  }

  .facet-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    font-size: 11px;
    color: var(--color-text-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  .facet-toggle:hover {
    text-decoration: underline;
  }

  .toggle-icon {
    font-size: 8px;
  }
</style>
