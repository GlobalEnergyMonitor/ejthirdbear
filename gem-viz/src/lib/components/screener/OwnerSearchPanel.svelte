<script lang="ts">
  import Spinner from '$lib/components/feedback/Spinner.svelte';

  type ExampleCompany = { name: string; id: string };

  let {
    singleSearchQuery = $bindable(''),
    bulkSearchText = $bindable(''),
    strictMatchOnly = $bindable(false),
    searchLoading = false,
    searchError = null,
    exampleCompanies = [],
    ownerCount = null,
    ownerCountLoading = false,
    onSearchSingle,
    onSearchBulk,
    onUseExample,
    onCsvUpload,
  }: {
    singleSearchQuery?: string;
    bulkSearchText?: string;
    strictMatchOnly?: boolean;
    searchLoading?: boolean;
    searchError?: string | null;
    exampleCompanies?: ExampleCompany[];
    ownerCount?: number | null;
    ownerCountLoading?: boolean;
    onSearchSingle: () => void;
    onSearchBulk: () => void;
    onUseExample: (_example: ExampleCompany) => void;
    onCsvUpload: (_event: Event) => void;
  } = $props();

  let activeTab = $state<'single' | 'bulk'>('single');
</script>

<section class="search-section">
  <!-- Tabs act as the section header -->
  <div class="tab-header">
    <div class="tabs" role="tablist">
      <button
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'single'}
        onclick={() => (activeTab = 'single')}
        aria-selected={activeTab === 'single'}
      >
        Search Single Owner
      </button>
      <button
        role="tab"
        class="tab-btn"
        class:active={activeTab === 'bulk'}
        onclick={() => (activeTab = 'bulk')}
        aria-selected={activeTab === 'bulk'}
      >
        Bulk Search
      </button>
    </div>

    {#if ownerCountLoading}
      <span class="owner-count owner-count--loading">Loading owners…</span>
    {:else if ownerCount !== null}
      <span class="owner-count"
        >{ownerCount.toLocaleString()} owners with stakes in this asset class</span
      >
    {/if}
  </div>

  {#if activeTab === 'single'}
    <div class="tab-panel" role="tabpanel">
      <p class="tab-subtitle">Find owners by company name, GEM entity ID, LEI, or Perm ID.</p>
      <div class="search-input-wrapper">
        <input
          id="single-search"
          type="text"
          class="search-input"
          placeholder="Enter owner name or ID..."
          bind:value={singleSearchQuery}
          onkeydown={(e) => e.key === 'Enter' && onSearchSingle()}
        />
        <button
          class="search-btn"
          onclick={onSearchSingle}
          disabled={searchLoading || !singleSearchQuery.trim()}
        >
          {searchLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {#if searchError}
        <div class="search-error">{searchError}</div>
      {/if}

      <div class="example-companies">
        <span class="example-label">Quick fill from top owners:</span>
        {#each exampleCompanies as example, i}
          {#if i > 0}<span class="example-sep">,</span>{/if}
          <button class="example-btn" onclick={() => onUseExample(example)}>
            {example.name}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="tab-panel" role="tabpanel">
      <div class="bulk-search-hint">
        One entity per line — name, GEM Entity ID, LEI, or PermID. Or
        <label class="upload-btn">
          upload a CSV
          <input type="file" accept=".csv,.tsv,.txt" onchange={onCsvUpload} hidden />
        </label>
        to populate.
      </div>

      <div class="bulk-search-body">
        <textarea
          id="bulk-search"
          class="bulk-input"
          placeholder="Shell&#10;BP&#10;TotalEnergies&#10;E100001000348&#10;549300MLUDYVRQOOXS22"
          bind:value={bulkSearchText}
          rows="6"
        ></textarea>

        <div class="bulk-actions">
          <button
            class="submit-btn"
            onclick={onSearchBulk}
            disabled={searchLoading || !bulkSearchText.trim()}
          >
            {#if searchLoading}
              <Spinner size={14} />
              Searching...
            {:else}
              Search
            {/if}
          </button>
        </div>
      </div>

      {#if searchError}
        <div class="search-error">{searchError}</div>
      {/if}
    </div>
  {/if}

  {#if searchLoading}
    <div class="search-loading">
      <Spinner size={16} />
      Searching...
    </div>
  {/if}
</section>

<style>
  .search-section {
    margin-bottom: var(--space-4);
  }

  /* ── Tab header (replaces SectionHeader) ───────────────────────────── */
  .tab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border-light);
    margin-bottom: var(--space-5);
  }

  .tabs {
    display: flex;
  }

  .tab-btn {
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-md);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
    margin-bottom: -1px;
    transition:
      color var(--duration-base),
      border-color var(--duration-base);
  }

  .tab-btn:hover {
    color: var(--color-text-secondary);
  }

  .tab-btn.active {
    color: var(--color-text-primary);
    border-bottom-color: var(--color-text-primary);
  }

  .owner-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    white-space: nowrap;
    padding-bottom: var(--space-2);
  }

  .owner-count--loading {
    font-style: italic;
  }

  /* ── Tab panels ────────────────────────────────────────────────────── */
  .tab-panel {
    min-height: 0;
  }

  .tab-subtitle {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }

  /* Single search */
  .search-input-wrapper {
    display: grid;
    grid-template-columns: minmax(200px, 380px) auto;
    gap: var(--space-3);
    align-items: end;
    margin-bottom: var(--space-3);
  }

  .search-input {
    width: 100%;
    padding: var(--space-2) 0;
    font-size: var(--font-size-lg);
    border: none;
    border-bottom: var(--border-width) solid var(--color-gray-300);
    background: transparent;
  }

  .search-input:focus {
    outline: none;
    border-bottom-color: var(--color-text-primary);
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .search-btn {
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-lg);
    font-weight: 500;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: border-color var(--duration-base) var(--ease-in-out-quad);
  }

  .search-btn:hover:not(:disabled) {
    border-color: var(--color-text-primary);
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .example-companies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-3);
    font-size: var(--font-size-body);
  }

  .example-label {
    color: var(--color-text-tertiary);
    margin-right: var(--space-1);
    font-size: var(--font-size-sm);
  }

  .example-sep {
    color: var(--color-text-tertiary);
  }

  .example-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-accent);
    font-size: var(--font-size-body);
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color var(--duration-base) var(--ease-in-out-quad);
  }

  .example-btn:hover {
    text-decoration-color: var(--color-accent);
  }

  /* Bulk search */
  .bulk-search-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  .bulk-search-body {
    display: flex;
    gap: var(--space-5);
    align-items: flex-start;
  }

  .bulk-input {
    flex: 1;
    min-width: 480px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-body);
    border: var(--border-width) solid var(--color-gray-300);
    background: var(--color-bg-primary);
    resize: vertical;
    font-family: inherit;
    line-height: var(--line-height-normal);
  }

  .bulk-input:focus {
    outline: none;
    border-color: var(--color-text-tertiary);
  }

  .bulk-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .bulk-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-1);
  }

  .submit-btn {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-body);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .submit-btn:hover:not(:disabled) {
    border-color: var(--color-text-secondary);
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .upload-btn {
    display: inline;
    padding: 0;
    font-size: inherit;
    background: none;
    color: var(--color-text-secondary);
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .upload-btn:hover {
    color: var(--color-text-primary);
  }

  /* Shared */
  .search-error {
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border-left: 3px solid var(--color-error);
    color: var(--color-error);
    font-size: var(--font-size-body);
    margin-top: var(--space-4);
  }

  .search-loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) 0;
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }

  @media (max-width: 768px) {
    .tab-header {
      flex-wrap: wrap;
    }

    .search-input-wrapper {
      grid-template-columns: 1fr;
    }

    .search-btn {
      justify-self: start;
    }

    .bulk-search-body {
      flex-direction: column;
    }

    .bulk-actions {
      flex-direction: row;
      flex-wrap: wrap;
    }

    .bulk-input {
      min-width: 0;
      width: 100%;
    }
  }
</style>
