<script>
  /**
   * OwnerSearchApp — Owner search + Portfolio Explorer modal
   * Mirrors ControlChainApp: search for an entity → result list → open Portfolio Explorer in modal.
   *
   * NOTE: This component intentionally uses an inline search input instead of importing
   * the shared AssetSearchBar component. In the Shadow DOM widget build, AssetSearchBar
   * lives in a shared Vite chunk (also used by GemAssetSearch, ControlChain, etc.).
   * When multiple widgets load on the same page (e.g. Drupal embeds), the shared chunk's
   * style injection can fire before this widget's shadow root is ready, causing styles
   * to land in the wrong root. Keeping the search input inline ensures all styles travel
   * with this component's own chunk and inject into the correct shadow root.
   *
   * Props:
   *   initialQuery     - Restore search query from URL
   *   initialEntityId  - If set, auto-open this entity in the modal on mount
   *   onStateChange    - Called with { q, entity } when state changes (for URL sync)
   *   embedded         - When true (widget context), modal uses position:absolute instead of fixed
   */
  import { onMount, untrack } from 'svelte';
  import PortfolioExplorer from './PortfolioExplorer.svelte';

  const API_BASE =
    import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  /** @type {{ initialQuery?: string, initialEntityId?: string, onStateChange?: (s: {q?: string, entity?: string}) => void, embedded?: boolean }} */
  let { initialQuery = '', initialEntityId = '', onStateChange = undefined, embedded = false } = $props();

  /** @typedef {{ id: string, name: string, fullName: string|null, country: string }} OwnerResult */

  let query = $state(untrack(() => initialQuery));
  let results = $state(/** @type {OwnerResult[]} */ ([]));
  let searching = $state(false);
  let hasSearched = $state(false);
  let searchError = $state('');

  let selected = $state(/** @type {OwnerResult|null} */ (null));
  let modalOpen = $state(false);

  const examples = /** @type {OwnerResult[]} */ ([
    { id: 'E100001000347', name: 'Bank of America Co', fullName: null, country: 'United States' },
    { id: 'E100000000869', name: 'LUKOIL PJSC', fullName: null, country: 'Russia' },
    { id: 'E100001000397', name: 'India Gov', fullName: null, country: 'India' },
    { id: 'E100000001247', name: 'KKR', fullName: null, country: 'United States' },
    { id: 'E100000000962', name: 'South Korea Gov', fullName: null, country: 'South Korea' },
  ]);

  // Debounced search effect — cleanup clears pending timer on teardown
  $effect(() => {
    const q = query;
    if (!q || q.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }
    const timer = setTimeout(() => {
      doSearch(q);
      onStateChange?.({ q });
    }, 300);
    return () => clearTimeout(timer);
  });

  // Auto-open entity from URL on first mount
  onMount(() => {
    if (initialEntityId) {
      selected = { id: initialEntityId, name: initialEntityId, fullName: null, country: '' };
      modalOpen = true;
      // Fetch the entity name in the background so the modal header can update
      fetch(`${API_BASE}/entities/${encodeURIComponent(initialEntityId)}`, {
        headers: { Accept: 'application/json' },
      })
        .then((r) => r.json())
        .then((e) => {
          if (selected?.id === initialEntityId) {
            selected = {
              id: initialEntityId,
              name: String(e.name || e.entity_name || initialEntityId),
              fullName: e.full_name ? String(e.full_name) : null,
              country: String(e.headquarters_country || ''),
            };
          }
        })
        .catch(() => {});
    }
  });

  /** @param {string} q */
  async function doSearch(q) {
    searching = true;
    searchError = '';
    hasSearched = true;
    try {
      const res = await fetch(
        `${API_BASE}/entities?q=${encodeURIComponent(q)}&limit=20`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const items = /** @type {Record<string,unknown>[]} */ (
        Array.isArray(json) ? json : (json.results ?? [])
      );
      results = items
        .map((e) => ({
          id: String(e.entity_id || e.id || ''),
          name: String(e.name || e.entity_name || ''),
          fullName: e.full_name ? String(e.full_name) : null,
          country: String(e.headquarters_country || ''),
        }))
        .filter((e) => e.id);
    } catch {
      searchError = 'Search failed. Please try again.';
      results = [];
    } finally {
      searching = false;
    }
  }

  /** @param {OwnerResult} entity */
  function selectResult(entity) {
    selected = entity;
    modalOpen = true;
    onStateChange?.({ q: query, entity: entity.id });
  }

  /** @param {OwnerResult} ex */
  function openExample(ex) {
    selected = ex;
    modalOpen = true;
    onStateChange?.({ q: query, entity: ex.id });
  }

  function closeModal() {
    modalOpen = false;
    selected = null;
    onStateChange?.({ q: query, entity: '' });
  }

  // Global Escape key closes modal
  $effect(() => {
    if (!modalOpen) return;
    /** @param {KeyboardEvent} e */
    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
</script>

<div class="os-root" class:os-embedded={embedded}>
<div class="os-app">
  <!-- Inline search input (see NOTE in script block for why we don't use AssetSearchBar) -->
  <div class="os-search">
    <label class="os-sr-only" for="os-search-input">Search owners</label>
    <div class="os-search-field">
      <span class="os-search-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="16" height="16" focusable="false">
          <path d="M13.5 12.3l4.1 4.1-1.2 1.2-4.1-4.1a6.5 6.5 0 1 1 1.2-1.2ZM8.5 13a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z" fill="currentColor" />
        </svg>
      </span>
      <input
        id="os-search-input"
        type="search"
        bind:value={query}
        placeholder="Search by owner name, GEM ID, LEI, or PERM ID…"
        autocomplete="off"
        spellcheck="false"
      />
      {#if query}
        <button type="button" class="os-clear-btn" aria-label="Clear search" onclick={() => { query = ''; }}>Clear</button>
      {/if}
    </div>
  </div>

  <!-- Empty state with example chips -->
  {#if !hasSearched && !selected}
    <div class="os-empty">
      <p class="os-empty-prompt">Try searching for an owner, or explore an example:</p>
      <div class="os-examples">
        {#each examples as ex}
          <button class="os-chip" onclick={() => openExample(ex)}>{ex.name}</button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Searching spinner -->
  {#if searching}
    <div class="os-status">
      <div class="os-spinner"></div>
      <span>Searching…</span>
    </div>
  {/if}

  <!-- Error -->
  {#if searchError}
    <p class="os-error">{searchError}</p>
  {/if}

  <!-- Results -->
  {#if results.length > 0}
    <div class="os-results-panel">
      <div class="os-results-header">
        <span class="os-results-count"
          >{results.length} result{results.length !== 1 ? 's' : ''}</span
        >
      </div>
      <ul class="os-results-list">
        {#each results as item (item.id)}
          <li>
            <button class="os-result" onclick={() => selectResult(item)}>
              <div class="os-result-info">
                <span class="os-result-name">{item.name}</span>
                <span class="os-result-meta">
                  {#if item.country}
                    <span class="os-result-country">{item.country}</span>
                  {/if}
                </span>
              </div>
              <svg
                class="os-result-arrow"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {:else if !searching && hasSearched}
    <p class="os-no-results">No owners found for "{query}"</p>
  {/if}
</div>

<!-- Modal -->
{#if modalOpen && selected}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="os-modal-backdrop"
    onclick={closeModal}
    role="button"
    tabindex="-1"
    onkeydown={(e) => e.key === 'Escape' && closeModal()}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="os-modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.key === 'Escape' && closeModal()}
      role="dialog"
      aria-modal="true"
      aria-label="Portfolio Explorer"
      tabindex="-1"
    >
      <div class="os-modal-header">
        <span class="os-modal-label">Portfolio Explorer</span>
        {#if selected.name && selected.name !== selected.id}
          <span class="os-modal-entity">{selected.name}</span>
        {/if}
        <button class="os-modal-close" onclick={closeModal} aria-label="Close">✕</button>
      </div>
      <div class="os-modal-body">
        <PortfolioExplorer entityId={selected.id} hidePicker={true} heightOffset={260} />
      </div>
    </div>
  </div>
{/if}
</div>

<style>
  .os-root {
    position: relative;
  }

  /* In widget/embed context, the root needs to be a positioning context
     and stretch when the modal opens so the absolute modal has room. */
  .os-embedded {
    min-height: 200px;
  }

  .os-embedded:has(.os-modal-backdrop) {
    min-height: max(600px, 100%);
  }
  .os-app {
    width: 100%;
    font-family: var(--font-family-sans);
  }

  .os-search {
    margin-bottom: var(--space-4);
  }

  .os-search-field {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    border: 1px solid var(--color-border, #cbd5e0);
    border-radius: 999px;
    background: var(--color-bg-primary, #ffffff);
    min-height: 42px;
  }

  .os-search-field:focus-within {
    border-color: var(--gem-navy, #1d4961);
    box-shadow: 0 0 0 3px rgba(29, 73, 97, 0.12);
  }

  .os-search-icon {
    color: #718096;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding-left: 14px;
  }

  .os-search-field input {
    width: 100%;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: var(--font-size-sm);
    padding: 0 var(--space-3);
    color: var(--color-text-primary);
    font-family: inherit;
  }

  .os-search-field input::placeholder {
    color: #94a3b8;
  }

  .os-clear-btn {
    border: none;
    background: transparent;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 var(--space-3);
    cursor: pointer;
    font-family: inherit;
  }

  .os-clear-btn:hover {
    color: var(--gem-navy, #1d4961);
  }

  .os-sr-only {
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

  /* ── Empty state ── */
  .os-empty {
    padding: var(--space-6) 0;
  }

  .os-empty-prompt {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .os-examples {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .os-chip {
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    cursor: pointer;
    font-family: inherit;
    transition: all var(--duration-fast) ease;
  }

  .os-chip:hover {
    background: var(--color-bg-tertiary);
    border-color: var(--color-text-secondary);
  }

  /* ── Searching state ── */
  .os-status {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .os-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--color-border);
    border-top-color: var(--gem-navy);
    border-radius: 50%;
    animation: os-spin 0.6s linear infinite;
  }

  @keyframes os-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Errors ── */
  .os-error,
  .os-no-results {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    padding: var(--space-4) 0;
  }

  /* ── Results panel ── */
  .os-results-panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .os-results-header {
    padding: var(--space-2) var(--space-4);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .os-results-count {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .os-results-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .os-results-list li + li {
    border-top: 1px solid var(--color-border);
  }

  .os-result {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-primary);
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: background var(--duration-fast) ease;
  }

  .os-result:hover {
    background: var(--color-bg-secondary);
  }

  .os-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .os-result-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .os-result-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .os-result-country {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    padding: 1px var(--space-2);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-full);
  }

  .os-result-arrow {
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }

  /* ── Modal ── */
  .os-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-5);
    overflow-y: auto;
  }

  /* In widget/embed context, position:fixed is relative to the shadow host's
     containing block (not the viewport), so the modal renders clipped or blank.
     Switch to position:absolute anchored to .os-root instead. */
  .os-embedded .os-modal-backdrop {
    position: absolute;
    padding: var(--space-3);
  }

  .os-modal {
    background: var(--color-bg-primary, #ffffff);
    border-radius: var(--radius-xl, 12px);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
    width: 100%;
    max-width: 1100px;
    max-height: calc(100vh - 80px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    margin: auto;
  }

  .os-embedded .os-modal {
    max-height: calc(100% - 24px);
  }

  .os-modal-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-5);
    background: var(--gem-navy);
    color: white;
    flex-shrink: 0;
  }

  .os-modal-label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    opacity: 0.7;
  }

  .os-modal-entity {
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .os-modal-close {
    margin-left: auto;
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background var(--duration-fast) ease;
  }

  .os-modal-close:hover {
    background: rgba(255, 255, 255, 0.25);
  }

  .os-modal-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  @media (max-width: 600px) {
    .os-modal-backdrop {
      padding: 0;
    }

    .os-modal {
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
    }

    .os-embedded .os-modal {
      max-height: 100%;
    }
  }
</style>
