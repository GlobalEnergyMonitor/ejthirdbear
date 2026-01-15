<script>
  /**
   * FacetedFilter - Shopping-style faceted filter component
   *
   * A checkbox list that feels like Amazon/Home Depot filters:
   * - Selected items float to top
   * - Live-updating counts
   * - "See more/less" expansion
   * - Search within facet
   * - Zero-count items dimmed
   */

  import { formatCompact } from '$lib/format';

  /**
   * @type {{
   *   options: Array<{value: string, count?: number}>,
   *   selected?: string[],
   *   label: string,
   *   initialVisible?: number,
   *   searchThreshold?: number,
   *   showIcons?: boolean,
   *   iconComponent?: any,
   * }}
   */
  let {
    options = [],
    selected = $bindable([]),
    label = '',
    initialVisible = 5,
    searchThreshold = 10,
  } = $props();

  // Internal state
  let expanded = $state(false);
  let search = $state('');

  // Sort options: selected first, then by count
  const sortedOptions = $derived.by(() => {
    const selectedSet = new Set(selected);

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
    const selectedSet = new Set(selected);
    const selectedItems = sortedOptions.filter((o) => selectedSet.has(o.value));
    const unselectedItems = sortedOptions.filter((o) => !selectedSet.has(o.value));
    const slotsForUnselected = Math.max(0, initialVisible - selectedItems.length);
    return [...selectedItems, ...unselectedItems.slice(0, slotsForUnselected)];
  });

  const hiddenCount = $derived(sortedOptions.length - visibleOptions.length);
  const hasSelected = $derived(selected.length > 0);
  const showSearch = $derived(expanded && options.length > searchThreshold);

  function toggle(value) {
    const idx = selected.indexOf(value);
    if (idx >= 0) {
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

<div class="facet">
  <div class="facet-header">
    <span class="facet-label">
      {label}
      <span class="facet-total">({options.length})</span>
    </span>
    {#if hasSelected}
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
    {#each visibleOptions as option (option.value)}
      {@const isSelected = selected.includes(option.value)}
      {@const isZeroCount = option.count === 0}
      <label class="facet-option" class:selected={isSelected} class:zero-count={isZeroCount}>
        <input
          type="checkbox"
          checked={isSelected}
          disabled={isZeroCount && !isSelected}
          onchange={() => toggle(option.value)}
        />
        <span class="facet-option-label">{option.value}</span>
        {#if option.count !== undefined}
          <span class="facet-count">({formatCompact(option.count)})</span>
        {/if}
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
    margin-bottom: 20px;
  }

  .facet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .facet-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .facet-total {
    font-weight: 400;
    color: #999;
  }

  .facet-clear {
    font-size: 11px;
    font-weight: 400;
    color: #0066c0;
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
    border: 1px solid #ddd;
    margin-bottom: 8px;
  }

  .facet-search:focus {
    outline: none;
    border-color: #999;
  }

  .facet-options {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .facet-options.expanded {
    max-height: 240px;
    overflow-y: auto;
  }

  .facet-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 2px;
    font-size: 12px;
    cursor: pointer;
    border-radius: 2px;
    transition: background 0.1s;
  }

  .facet-option:hover {
    background: #f5f5f5;
  }

  .facet-option.selected {
    font-weight: 500;
  }

  .facet-option.zero-count {
    opacity: 0.4;
    cursor: default;
  }

  .facet-option.zero-count:hover {
    background: transparent;
  }

  .facet-option input[type='checkbox'] {
    width: 14px;
    height: 14px;
    margin: 0;
    cursor: pointer;
    accent-color: #000;
  }

  .facet-option.zero-count input[type='checkbox'] {
    cursor: default;
  }

  .facet-option-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .facet-count {
    color: #888;
    font-size: 11px;
    flex-shrink: 0;
  }

  .facet-toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 2px;
    font-size: 11px;
    color: #0066c0;
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
