<script lang="ts">
  /**
   * CountryMultiSelect — searchable combobox for selecting multiple countries.
   * Type to filter, click to add as chips, X to remove.
   */

  interface Props {
    selected: string[];
    countries: readonly string[];
  }

  let { selected = $bindable(), countries }: Props = $props();

  // ── Country group presets ─────────────────────────────────────────
  interface CountryGroup {
    id: string;
    label: string;
    aliases: string[];
    members: string[];
  }

  const COUNTRY_GROUPS: CountryGroup[] = [
    {
      id: 'g7',
      label: 'G7',
      aliases: ['g7', 'g8', 'group of seven', 'group of eight'],
      members: ['Canada', 'France', 'Germany', 'Italy', 'Japan', 'United Kingdom', 'United States'],
    },
    {
      id: 'g20',
      label: 'G20',
      aliases: ['g20', 'group of twenty'],
      members: [
        'Argentina',
        'Australia',
        'Brazil',
        'Canada',
        'China',
        'France',
        'Germany',
        'India',
        'Indonesia',
        'Italy',
        'Japan',
        'Mexico',
        'Russia',
        'Saudi Arabia',
        'South Africa',
        'South Korea',
        'T\u00FCrkiye',
        'United Kingdom',
        'United States',
      ],
    },
    {
      id: 'eu',
      label: 'EU',
      aliases: ['eu', 'european union', 'europe'],
      members: [
        'Austria',
        'Belgium',
        'Bulgaria',
        'Croatia',
        'Cyprus',
        'Czech Republic',
        'Denmark',
        'Estonia',
        'Finland',
        'France',
        'Germany',
        'Greece',
        'Hungary',
        'Ireland',
        'Italy',
        'Latvia',
        'Lithuania',
        'Luxembourg',
        'Malta',
        'Netherlands',
        'Poland',
        'Portugal',
        'Romania',
        'Slovakia',
        'Slovenia',
        'Spain',
        'Sweden',
      ],
    },
    {
      id: 'brics',
      label: 'BRICS',
      aliases: ['brics'],
      members: ['Brazil', 'Russia', 'India', 'China', 'South Africa'],
    },
    {
      id: 'opec',
      label: 'OPEC',
      aliases: ['opec'],
      members: [
        'Algeria',
        'Angola',
        'Congo',
        'Gabon',
        'Iran',
        'Iraq',
        'Kuwait',
        'Libya',
        'Nigeria',
        'Saudi Arabia',
        'United Arab Emirates',
        'Venezuela',
      ],
    },
    {
      id: 'oecd',
      label: 'OECD',
      aliases: ['oecd'],
      members: [
        'Australia',
        'Austria',
        'Belgium',
        'Canada',
        'Chile',
        'Colombia',
        'Costa Rica',
        'Czech Republic',
        'Denmark',
        'Estonia',
        'Finland',
        'France',
        'Germany',
        'Greece',
        'Hungary',
        'Iceland',
        'Ireland',
        'Israel',
        'Italy',
        'Japan',
        'Latvia',
        'Lithuania',
        'Luxembourg',
        'Mexico',
        'Netherlands',
        'New Zealand',
        'Norway',
        'Poland',
        'Portugal',
        'Slovakia',
        'Slovenia',
        'South Korea',
        'Spain',
        'Sweden',
        'Switzerland',
        'T\u00FCrkiye',
        'United Kingdom',
        'United States',
      ],
    },
    {
      id: 'southeast-asia',
      label: 'Southeast Asia',
      aliases: ['southeast asia', 'asean', 'se asia'],
      members: [
        'Brunei',
        'Cambodia',
        'Indonesia',
        'Laos',
        'Malaysia',
        'Myanmar',
        'Philippines',
        'Singapore',
        'Thailand',
        'Vietnam',
        'Timor-Leste',
      ],
    },
    {
      id: 'middle-east',
      label: 'Middle East',
      aliases: ['middle east', 'mena'],
      members: [
        'Bahrain',
        'Iran',
        'Iraq',
        'Israel',
        'Jordan',
        'Kuwait',
        'Lebanon',
        'Oman',
        'Qatar',
        'Saudi Arabia',
        'Syria',
        'T\u00FCrkiye',
        'United Arab Emirates',
        'Yemen',
      ],
    },
  ];

  // ── Matching logic ────────────────────────────────────────────────
  let query = $state('');
  let open = $state(false);
  let highlightIndex = $state(-1);
  let inputEl: HTMLInputElement | undefined = $state();
  let listEl: HTMLUListElement | undefined = $state();
  const listboxId = 'country-multi-select-listbox';

  /** Groups whose alias matches the current query (only groups that would add new countries) */
  const matchedGroups = $derived.by(() => {
    const q = query.toLowerCase().trim();
    if (!q) return COUNTRY_GROUPS;
    return COUNTRY_GROUPS.filter((g) => g.aliases.some((a) => a.includes(q)));
  });

  /** Groups that still have unselected members, with precomputed new-count */
  const activeGroups = $derived(
    matchedGroups
      .map((g) => ({ ...g, newCount: g.members.filter((m) => !selected.includes(m)).length }))
      .filter((g) => g.newCount > 0)
  );

  const filtered = $derived.by(() => {
    const q = query.toLowerCase().trim();
    const available = countries.filter((c) => !selected.includes(c));
    if (!q) return available.slice(0, 50);
    return available.filter((c) => c.toLowerCase().includes(q));
  });

  /** Total selectable items: groups + individual countries */
  const totalItems = $derived(activeGroups.length + filtered.length);

  function addCountry(country: string) {
    if (!selected.includes(country)) {
      selected = [...selected, country];
    }
    query = '';
    highlightIndex = -1;
    inputEl?.focus();
  }

  function addGroup(group: CountryGroup) {
    const toAdd = group.members.filter((m) => !selected.includes(m));
    if (toAdd.length > 0) {
      selected = [...selected, ...toAdd];
    }
    query = '';
    highlightIndex = -1;
    inputEl?.focus();
  }

  function removeCountry(country: string) {
    selected = selected.filter((c) => c !== country);
  }

  function clearAll() {
    selected = [];
    query = '';
    inputEl?.focus();
  }

  /** Select the item at the given flat index (groups first, then countries) */
  function selectItemAtIndex(index: number) {
    if (index < activeGroups.length) {
      addGroup(activeGroups[index]);
    } else {
      const countryIndex = index - activeGroups.length;
      if (countryIndex >= 0 && countryIndex < filtered.length) {
        addCountry(filtered[countryIndex]);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    const maxIndex = totalItems - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open = true;
      highlightIndex = Math.min(highlightIndex + 1, maxIndex);
      scrollToHighlighted();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
      scrollToHighlighted();
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex <= maxIndex) {
      e.preventDefault();
      selectItemAtIndex(highlightIndex);
    } else if (e.key === 'Escape') {
      open = false;
      highlightIndex = -1;
    } else if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      selected = selected.slice(0, -1);
    }
  }

  function scrollToHighlighted() {
    if (!listEl) return;
    const item = listEl.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  function handleFocus() {
    open = true;
  }

  let blurTimeout: ReturnType<typeof setTimeout>;
  function handleBlur() {
    blurTimeout = setTimeout(() => {
      open = false;
      highlightIndex = -1;
    }, 150);
  }

  function handleOptionMousedown(country: string) {
    clearTimeout(blurTimeout);
    addCountry(country);
  }

  function handleGroupMousedown(group: CountryGroup) {
    clearTimeout(blurTimeout);
    addGroup(group);
  }
</script>

<div class="country-multi-select">
  {#if selected.length > 0}
    <div class="selected-chips">
      {#each selected as country (country)}
        <span class="chip">
          <span class="chip-label">{country}</span>
          <button
            type="button"
            class="chip-remove"
            onclick={() => removeCountry(country)}
            aria-label="Remove {country}">&times;</button
          >
        </span>
      {/each}
      <button type="button" class="clear-all" onclick={clearAll}>Clear all</button>
    </div>
  {/if}

  <div class="input-wrapper">
    <input
      bind:this={inputEl}
      type="text"
      class="search-input"
      placeholder={selected.length > 0 ? 'Add another country...' : 'Search countries...'}
      bind:value={query}
      onfocus={handleFocus}
      onblur={handleBlur}
      onkeydown={handleKeydown}
      autocomplete="off"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-haspopup="listbox"
    />
    {#if selected.length > 0}
      <span class="selected-count">{selected.length} selected</span>
    {/if}
  </div>

  {#if open && totalItems > 0}
    <ul id={listboxId} class="dropdown" role="listbox" bind:this={listEl}>
      {#each activeGroups as group, gi (group.id)}
        <li
          class="dropdown-item group-item"
          class:highlighted={gi === highlightIndex}
          role="option"
          aria-selected={gi === highlightIndex}
          onmousedown={() => handleGroupMousedown(group)}
        >
          <span class="group-name">{group.label}</span>
          <span class="group-count">+{group.newCount} countries</span>
        </li>
      {/each}
      {#if activeGroups.length > 0 && filtered.length > 0}
        <li class="dropdown-divider" role="separator"></li>
      {/if}
      {#each filtered.slice(0, 50) as country, i (country)}
        <li
          class="dropdown-item"
          class:highlighted={activeGroups.length + i === highlightIndex}
          role="option"
          aria-selected={activeGroups.length + i === highlightIndex}
          onmousedown={() => handleOptionMousedown(country)}
        >
          {country}
        </li>
      {/each}
      {#if filtered.length > 50}
        <li class="dropdown-more">Type to narrow results...</li>
      {/if}
    </ul>
  {:else if open && query && totalItems === 0}
    <div class="dropdown no-results">No countries matching "{query}"</div>
  {/if}
</div>

<style>
  .country-multi-select {
    position: relative;
  }

  .selected-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1, 4px);
    margin-bottom: var(--space-2, 8px);
    align-items: center;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px var(--space-2, 8px);
    background: rgba(42, 127, 143, 0.1);
    border: 1px solid rgba(42, 127, 143, 0.3);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-primary, #1a202c);
    line-height: 1.4;
  }

  .chip-label {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chip-remove {
    background: none;
    border: none;
    padding: 0 2px;
    font-size: 14px;
    line-height: 1;
    color: var(--color-text-tertiary, #a0aec0);
    cursor: pointer;
  }

  .chip-remove:hover {
    color: var(--color-text-primary, #1a202c);
  }

  .clear-all {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary, #a0aec0);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .clear-all:hover {
    color: var(--color-text-secondary, #718096);
  }

  .input-wrapper {
    position: relative;
  }

  .search-input {
    width: 100%;
    padding: var(--space-2, 8px);
    font-size: var(--font-size-body, 14px);
    border: none;
    border-bottom: var(--border-width, 1px) solid var(--color-gray-300, #d1d5db);
    border-radius: 0;
    background: transparent;
    color: var(--color-text-primary, #1a202c);
  }

  .search-input:focus {
    outline: none;
    border-bottom-color: var(--gem-teal, #2a7f8f);
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary, #a0aec0);
  }

  .selected-count {
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    font-size: 11px;
    color: var(--color-text-tertiary, #a0aec0);
    pointer-events: none;
  }

  .dropdown {
    position: absolute;
    z-index: 10;
    top: 100%;
    left: 0;
    right: 0;
    max-height: 240px;
    overflow-y: auto;
    margin: 0;
    padding: 0;
    list-style: none;
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-border, #e5e7eb);
    border-top: none;
    border-radius: 0 0 var(--radius-sm, 4px) var(--radius-sm, 4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  .dropdown-item {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-primary, #1a202c);
    cursor: pointer;
  }

  .dropdown-item:hover,
  .dropdown-item.highlighted {
    background: rgba(42, 127, 143, 0.08);
  }

  .group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2, 8px);
    background: rgba(42, 127, 143, 0.03);
  }

  .group-name {
    font-weight: 600;
    color: var(--gem-teal, #2a7f8f);
  }

  .group-count {
    font-size: 11px;
    color: var(--color-text-tertiary, #a0aec0);
    white-space: nowrap;
  }

  .dropdown-divider {
    height: 0;
    margin: var(--space-1, 4px) 0;
    border: none;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .dropdown-more {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    font-size: 11px;
    color: var(--color-text-tertiary, #a0aec0);
    font-style: italic;
  }

  .no-results {
    padding: var(--space-3, 12px);
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary, #a0aec0);
  }
</style>
