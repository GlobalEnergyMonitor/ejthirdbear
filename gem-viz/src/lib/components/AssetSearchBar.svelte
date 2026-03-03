<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  type SearchMode = {
    id: string;
    label: string;
    placeholder?: string;
    buttonLabel?: string;
  };
  type SearchHandler = (_query: string, _mode?: string) => void;

  let {
    value = $bindable(''),
    activeMode = $bindable(''),
    modes = [] as SearchMode[],
    label = 'Search assets',
    placeholder = 'Search by asset name, ID, owner, country, or status',
    buttonLabel = 'Search',
    helperText = '',
    showButton = true,
    showClear = true,
    compact = false,
    disabled = false,
    inputName = 'q',
    autocomplete = 'off' as HTMLInputAttributes['autocomplete'],
    onSearch = ((_query: string) => {}) as SearchHandler,
    onClear = (() => {}) as () => void,
  } = $props();

  $effect(() => {
    if (modes.length === 0) return;
    if (!modes.some((mode) => mode.id === activeMode)) {
      activeMode = modes[0].id;
    }
  });

  const selectedMode = $derived.by(() => {
    if (modes.length === 0) return null;
    return modes.find((mode) => mode.id === activeMode) || modes[0];
  });
  const resolvedPlaceholder = $derived(selectedMode?.placeholder || placeholder);
  const resolvedButtonLabel = $derived(selectedMode?.buttonLabel || buttonLabel);

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    onSearch(value.trim(), activeMode);
  }

  function clearSearch() {
    value = '';
    onClear();
    onSearch('', activeMode);
  }
</script>

<form class="asset-search" class:compact class:has-modes={modes.length > 1} onsubmit={submitSearch}>
  {#if modes.length > 1}
    <div class="scope-field">
      <label class="sr-only" for="asset-search-mode">Search scope</label>
      <select id="asset-search-mode" bind:value={activeMode} {disabled}>
        {#each modes as mode}
          <option value={mode.id}>{mode.label}</option>
        {/each}
      </select>
    </div>
  {/if}

  <label class="sr-only" for="asset-search-input">{label}</label>
  <div class="search-field">
    <span class="search-icon" aria-hidden="true">
      <svg viewBox="0 0 20 20" width="16" height="16" focusable="false">
        <path
          d="M13.5 12.3l4.1 4.1-1.2 1.2-4.1-4.1a6.5 6.5 0 1 1 1.2-1.2ZM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"
          fill="currentColor"
        />
      </svg>
    </span>
    <input
      id="asset-search-input"
      type="search"
      name={inputName}
      bind:value
      placeholder={resolvedPlaceholder}
      {disabled}
      {autocomplete}
      spellcheck="false"
    />
    {#if showClear && value}
      <button
        type="button"
        class="clear-btn"
        aria-label="Clear search"
        onclick={clearSearch}
        {disabled}
      >
        Clear
      </button>
    {/if}
  </div>
  {#if showButton}
    <button type="submit" class="search-btn" {disabled}>
      {resolvedButtonLabel}
    </button>
  {/if}
</form>

{#if helperText}
  <p class="helper-text">{helperText}</p>
{/if}

<style>
  .asset-search {
    --search-border: #cbd5e0;
    --search-border-focus: #1d4961;
    --search-bg: #ffffff;
    --search-btn-bg: #1d4961;
    --search-btn-bg-hover: #2d5a75;
    --search-btn-text: #ffffff;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .asset-search.compact {
    gap: var(--space-1);
  }

  .scope-field {
    flex: 0 0 auto;
  }

  .scope-field select {
    min-height: 42px;
    border: 1px solid var(--search-border);
    border-radius: 999px;
    background: var(--search-bg);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    padding: 0 var(--space-4);
    outline: none;
  }

  .scope-field select:focus {
    border-color: var(--search-border-focus);
    box-shadow: 0 0 0 3px rgba(29, 73, 97, 0.12);
  }

  .asset-search.compact .scope-field select {
    min-height: 36px;
  }

  .search-field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    border: 1px solid var(--search-border);
    border-radius: 999px;
    background: var(--search-bg);
    min-height: 42px;
    flex: 1 1 280px;
  }

  .asset-search.compact .search-field {
    min-height: 36px;
  }

  .search-field:focus-within {
    border-color: var(--search-border-focus);
    box-shadow: 0 0 0 3px rgba(29, 73, 97, 0.12);
  }

  .search-icon {
    color: #718096;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-left: 14px;
  }

  input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: var(--font-size-sm);
    padding: 0 var(--space-3);
    color: var(--color-text-primary);
  }

  input::placeholder {
    color: #94a3b8;
  }

  .clear-btn {
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 var(--space-3);
    cursor: pointer;
  }

  .clear-btn:hover:not(:disabled) {
    color: #1d4961;
  }

  .search-btn {
    border: none;
    border-radius: 999px;
    background: var(--search-btn-bg);
    color: var(--search-btn-text);
    padding: 0 var(--space-4);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    min-height: 42px;
    flex: 0 0 auto;
  }

  .asset-search.compact .search-btn {
    min-height: 36px;
  }

  .search-btn:hover:not(:disabled) {
    background: var(--search-btn-bg-hover);
  }

  .search-btn:disabled,
  .clear-btn:disabled,
  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .helper-text {
    margin: var(--space-2) 0 0 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 768px) {
    .asset-search {
      align-items: stretch;
    }

    .scope-field,
    .search-btn {
      width: 100%;
    }
  }
</style>
