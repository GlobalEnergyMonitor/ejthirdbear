<script lang="ts">
  import SectionHeader from '$lib/components/SectionHeader.svelte';

  type ExampleCompany = { name: string; id: string };

  let {
    singleSearchQuery = $bindable(''),
    bulkSearchText = $bindable(''),
    searchLoading = false,
    searchError = null,
    exampleCompanies = [],
    onSearchSingle,
    onSearchBulk,
    onUseExample,
    onCsvUpload,
  }: {
    singleSearchQuery?: string;
    bulkSearchText?: string;
    searchLoading?: boolean;
    searchError?: string | null;
    exampleCompanies?: ExampleCompany[];
    onSearchSingle: () => void;
    onSearchBulk: () => void;
    onUseExample: (_example: ExampleCompany) => void;
    onCsvUpload: (_event: Event) => void;
  } = $props();
</script>

<section class="search-section">
  <SectionHeader
    title="Search by Company Name"
    subtitle="Find owners by company name, entity ID, LEI, or Perm ID."
  />

  <div class="search-field primary-search">
    <div class="search-input-wrapper">
      <input
        id="single-search"
        type="text"
        class="search-input"
        placeholder="Enter company name..."
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
    <div class="search-help">
      <div class="example-companies">
        <span class="example-label">Try:</span>
        {#each exampleCompanies as example, i}
          {#if i > 0}<span class="example-sep">,</span>{/if}
          <button class="example-btn" onclick={() => onUseExample(example)}>
            {example.name}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <div class="results-preview">
    <span class="preview-label">You'll see:</span>
    <span class="preview-item">Ownership stakes</span>
    <span class="preview-sep">·</span>
    <span class="preview-item">Asset list</span>
    <span class="preview-sep">·</span>
    <span class="preview-item">Corporate relationships</span>
  </div>

  <details class="advanced-search">
    <summary>Advanced: Search by ID or bulk search</summary>
    <div class="advanced-content">
      <p class="advanced-hint">You can also search using identifiers:</p>
      <ul class="id-formats">
        <li><strong>GEM Entity ID</strong> — e.g., <code>E100001000348</code></li>
        <li>
          <strong>LEI</strong> — 20-character code, e.g., <code>549300MLUDYVRQOOXS22</code>
        </li>
        <li><strong>PermID</strong> — 10-digit number, e.g., <code>4295903609</code></li>
      </ul>

      <div class="search-field">
        <label for="bulk-search">Search multiple companies</label>
        <div class="input-row">
          <textarea
            id="bulk-search"
            class="bulk-input"
            placeholder="Shell&#10;BP&#10;TotalEnergies&#10;E100001000348"
            bind:value={bulkSearchText}
            rows="4"
          ></textarea>
        </div>
      </div>

      <div class="action-row">
        <button class="submit-btn" onclick={onSearchBulk} disabled={searchLoading}>
          {searchLoading ? 'Searching...' : 'Search All'}
        </button>
        <span class="or-text">or</span>
        <label class="upload-btn">
          Upload CSV
          <input type="file" accept=".csv" onchange={onCsvUpload} hidden />
        </label>
      </div>
    </div>
  </details>

  {#if searchError}
    <div class="search-error">{searchError}</div>
  {/if}

  {#if searchLoading}
    <div class="search-loading">
      <span class="loading-spinner"></span>
      Searching...
    </div>
  {/if}
</section>

<style>
  .search-section {
    margin-bottom: 56px;
  }

  .primary-search {
    margin-bottom: var(--space-4);
  }

  .primary-search .search-input-wrapper {
    margin-bottom: var(--space-3);
  }

  .primary-search .search-input {
    width: 100%;
    font-size: var(--font-size-xl);
  }

  .search-help {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .results-preview {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    gap: var(--space-2);
    align-items: center;
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-8);
    padding: var(--space-3) 0;
    border-bottom: var(--border-width) solid var(--color-border-light);
  }

  .preview-label {
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .preview-item {
    color: var(--color-text-secondary);
  }

  .preview-sep {
    color: var(--color-gray-300);
  }

  .advanced-search {
    margin-bottom: var(--space-8);
  }

  .advanced-search summary {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2) 0;
    list-style: none;
  }

  .advanced-search summary::-webkit-details-marker {
    display: none;
  }

  .advanced-search summary::before {
    content: '+ ';
    font-weight: 500;
  }

  .advanced-search[open] summary::before {
    content: '− ';
  }

  .advanced-search summary:hover {
    color: var(--color-text-secondary);
  }

  .advanced-content {
    padding-top: var(--space-4);
  }

  .advanced-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
  }

  .id-formats {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-6) 0;
    padding-left: var(--space-5);
    line-height: var(--line-height-relaxed);
  }

  .id-formats li {
    margin-bottom: var(--space-1);
  }

  .id-formats strong {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .id-formats code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-md);
    background: var(--color-gray-100);
    padding: 2px 6px;
    color: var(--color-text-secondary);
  }

  .search-field {
    margin-bottom: var(--space-6);
  }

  .search-field label {
    display: block;
    font-size: var(--font-size-base);
    font-weight: 500;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-2);
  }

  .input-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-5);
  }

  .search-input-wrapper {
    display: grid;
    grid-template-columns: minmax(200px, 380px) auto;
    gap: var(--space-3);
    align-items: end;
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

  .bulk-input {
    width: 340px;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-lg);
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

  .example-companies {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-2);
    font-size: var(--font-size-body);
  }

  .example-label {
    color: var(--color-text-tertiary);
    margin-right: var(--space-1);
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

  .action-row {
    display: grid;
    grid-template-columns: auto auto auto;
    gap: var(--space-4);
    align-items: center;
    justify-content: start;
    margin-top: var(--space-2);
  }

  .submit-btn {
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

  .or-text {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }

  .upload-btn {
    padding: 0;
    font-size: var(--font-size-body);
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

  .search-error {
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border-left: 3px solid var(--color-error);
    color: var(--color-error);
    font-size: var(--font-size-body);
    margin-top: var(--space-5);
  }

  .search-loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6) 0;
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }

  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-gray-200);
    border-top-color: var(--gem-teal, #1d4961);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 768px) {
    .search-input-wrapper {
      grid-template-columns: 1fr;
    }

    .search-btn {
      justify-self: start;
    }

    .input-row {
      flex-direction: column;
      gap: var(--space-3);
    }

    .search-input,
    .bulk-input {
      width: 100%;
    }

    .action-row {
      grid-template-columns: 1fr 1fr;
    }

    .or-text {
      display: none;
    }

    .results-preview {
      grid-auto-flow: row;
      grid-auto-columns: 1fr;
      justify-items: start;
    }

    .preview-sep {
      display: none;
    }
  }
</style>
