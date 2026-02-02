<script>
  /**
   * ASSET-CLASS SCREENER - Step 2: Search Owners
   * Search for companies by name, GEM Entity ID, LEI, or Perm ID.
   * Matches mockup layout with asset classes panel + owner search.
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { listEntities, getEntity } from '$lib/ownership-api';
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import ScreenerLayout from '$lib/components/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/AssetClassesPanel.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import { getExampleCompanies } from '$lib/data-config/screener-config';

  // Get selected classes from URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');

  // Parse selected classes for example companies feature
  const selectedClasses = $derived.by(() => {
    if (!classesParam) return [];
    try {
      const parsed = JSON.parse(classesParam);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          name: item.name || item.id || 'Unknown',
          tracker: item.tracker || '',
        }));
      }
      return [];
    } catch {
      return [];
    }
  });

  // Search state
  let singleSearchQuery = $state('');
  let bulkSearchText = $state('');
  let searchLoading = $state(false);
  let searchError = $state(null);

  // Search results with disambiguation tracking
  // Each entry: { term: string, results: Entity[], matchCount: number }
  let searchResultGroups = $state([]);

  // Debug: track API calls
  let debugApiCalls = $state([]);
  let debugLastSearchTime = $state(null);

  // Selected owners (use Map for O(1) lookup by ID)
  let selectedOwnerMap = $state(new Map());
  const selectedOwners = $derived([...selectedOwnerMap.values()]);

  /**
   * Parse input to detect ID type:
   * - GEM Entity ID: starts with E followed by numbers (e.g., E100001000348)
   * - LEI: exactly 20 alphanumeric characters
   * - Perm ID: numeric string, typically 10 digits
   * - Otherwise: treat as company name
   */
  function parseSearchInput(input) {
    const trimmed = input.trim();

    // GEM Entity ID pattern: E followed by digits
    if (/^E\d+$/i.test(trimmed)) {
      return { type: 'gem_entity_id', value: trimmed.toUpperCase() };
    }

    // LEI pattern: exactly 20 alphanumeric characters
    if (/^[A-Z0-9]{20}$/i.test(trimmed)) {
      return { type: 'lei', value: trimmed.toUpperCase() };
    }

    // Perm ID pattern: 10 digit number
    if (/^\d{10}$/.test(trimmed)) {
      return { type: 'perm_id', value: trimmed };
    }

    // Default: company name
    return { type: 'name', value: trimmed };
  }

  /**
   * Search for a single entity by parsed input
   */
  async function searchSingleEntity(input) {
    const parsed = parseSearchInput(input);

    if (parsed.type === 'gem_entity_id') {
      // Direct lookup by GEM Entity ID
      try {
        debugApiCalls = [
          ...debugApiCalls,
          { type: 'getEntity', params: { id: parsed.value }, time: Date.now() },
        ];
        const entity = await getEntity(parsed.value);
        return entity ? [entity] : [];
      } catch {
        // If not found, fall back to search
        const params = { q: parsed.value, limit: 10 };
        debugApiCalls = [...debugApiCalls, { type: 'listEntities', params, time: Date.now() }];
        const response = await listEntities(params);
        return response.results || [];
      }
    }

    // For other types, use text search
    // (API would need to support LEI/Perm ID fields for proper lookup)
    const params = { q: parsed.value, limit: 20 };
    debugApiCalls = [...debugApiCalls, { type: 'listEntities', params, time: Date.now() }];
    const response = await listEntities(params);
    return response.results || [];
  }

  // Search for single owner
  async function searchSingle() {
    const term = singleSearchQuery.trim();
    if (!term) return;

    searchLoading = true;
    searchError = null;
    searchResultGroups = [];
    debugApiCalls = [];
    const startTime = performance.now();

    try {
      const results = await searchSingleEntity(term);
      searchResultGroups = [{ term, results, matchCount: results.length }];
      debugLastSearchTime = performance.now() - startTime;
    } catch (err) {
      searchError = err?.message || 'Search failed';
      debugLastSearchTime = performance.now() - startTime;
    } finally {
      searchLoading = false;
    }
  }

  // Bulk search for multiple owners
  async function searchBulk() {
    if (!bulkSearchText.trim()) return;

    searchLoading = true;
    searchError = null;
    searchResultGroups = [];
    debugApiCalls = [];
    const startTime = performance.now();

    try {
      // Parse lines - handle both newlines and commas
      const inputs = bulkSearchText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Search each input (limit to 30 to avoid overloading)
      const searchPromises = inputs.slice(0, 30).map(async (term) => {
        const results = await searchSingleEntity(term);
        return { term, results, matchCount: results.length };
      });
      const groups = await Promise.all(searchPromises);

      // Filter out groups with no results, keep groups for disambiguation
      searchResultGroups = groups.filter((g) => g.results.length > 0);
      debugLastSearchTime = performance.now() - startTime;

      // Also track terms with no matches
      const noMatches = groups.filter((g) => g.results.length === 0);
      if (noMatches.length > 0) {
        const noMatchTerms = noMatches.map((g) => g.term).join(', ');
        searchError = `No matches found for: ${noMatchTerms}`;
      }
    } catch (err) {
      searchError = err?.message || 'Bulk search failed';
      debugLastSearchTime = performance.now() - startTime;
    } finally {
      searchLoading = false;
    }
  }

  // Handle CSV upload
  async function handleCsvUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Parse CSV - assume first column is company name or ID
      const lines = text.split('\n').slice(1); // Skip header
      const values = lines
        .map((line) => {
          const cols = line.split(',');
          return cols[0]?.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        })
        .filter((v) => v && v.length > 0);

      bulkSearchText = values.join('\n');
      await searchBulk();
    } catch {
      searchError = 'Failed to parse CSV file';
    }
  }

  // Show all companies with ownership in selected asset classes
  function showAllAssets() {
    goto(link(`screener/results?classes=${encodeURIComponent(classesParam)}&mode=assets`));
  }

  // Toggle or add owner selection (O(1) with Map)
  function selectOwner(owner, toggle = true) {
    const newMap = new Map(selectedOwnerMap);
    if (toggle && newMap.has(owner.id)) {
      newMap.delete(owner.id);
    } else {
      newMap.set(owner.id, owner);
    }
    selectedOwnerMap = newMap;
  }

  // Check if owner is selected (O(1))
  const isSelected = (owner) => selectedOwnerMap.has(owner.id);

  // Get relevant example companies based on selected asset classes
  const exampleCompanies = $derived.by(() => {
    const trackers = selectedClasses.map((c) => c.tracker).filter(Boolean);
    return getExampleCompanies(trackers);
  });

  // Use an example company
  function useExample(example) {
    singleSearchQuery = example.name;
    searchSingle();
  }

  // Navigation
  function continueToResults() {
    const ownerIds = selectedOwners.map((o) => o.id).join(',');
    goto(
      link(
        `screener/results?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(ownerIds)}`
      )
    );
  }
</script>

<svelte:head>
  <title>Find Owners — Global Energy Monitor</title>
  <meta
    name="description"
    content="Search for companies by name, GEM Entity ID, LEI, or Perm ID to analyze their ownership of energy assets."
  />
</svelte:head>

<ScreenerLayout
  currentStep={2}
  subtitle="Search for a company to see their ownership stakes, assets, and corporate network."
  {classesParam}
>
  {#snippet headerRight()}
    <AssetClassesPanel
      {classesParam}
      onRemove={(cls) => {
        const updated = selectedClasses.filter((c) => c.name !== cls.name);
        const newParam = encodeURIComponent(JSON.stringify(updated));
        goto(link(`screener/owners?classes=${newParam}`), { replaceState: true });
      }}
    />
  {/snippet}

  <!-- Search owners section -->
  <section class="search-section">
    <h2>Search by Company Name</h2>

    <!-- Single owner search - primary action -->
    <div class="search-field primary-search">
      <div class="search-input-wrapper">
        <input
          id="single-search"
          type="text"
          class="search-input"
          placeholder="Enter company name..."
          bind:value={singleSearchQuery}
          onkeydown={(e) => e.key === 'Enter' && searchSingle()}
        />
        <button
          class="search-btn"
          onclick={searchSingle}
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
            <button class="example-btn" onclick={() => useExample(example)}>
              {example.name}
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- What you'll see -->
    <div class="results-preview">
      <span class="preview-label">You'll see:</span>
      <span class="preview-item">Ownership stakes</span>
      <span class="preview-sep">·</span>
      <span class="preview-item">Asset list</span>
      <span class="preview-sep">·</span>
      <span class="preview-item">Corporate relationships</span>
    </div>

    <!-- Advanced options (collapsed) -->
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

        <!-- Bulk search -->
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

        <!-- Action buttons -->
        <div class="action-row">
          <button class="submit-btn" onclick={searchBulk} disabled={searchLoading}>
            {searchLoading ? 'Searching...' : 'Search All'}
          </button>
          <span class="or-text">or</span>
          <label class="upload-btn">
            Upload CSV
            <input type="file" accept=".csv" onchange={handleCsvUpload} hidden />
          </label>
        </div>
      </div>
    </details>

    <!-- Error -->
    {#if searchError}
      <div class="search-error">{searchError}</div>
    {/if}

    <!-- Results with disambiguation -->
    {#if searchResultGroups.length > 0}
      <div class="search-results">
        <div class="results-source-row">
          <DataSourceBadge source="api" label="Entity Search" />
        </div>
        {#each searchResultGroups as group}
          <div class="result-group">
            <div class="group-header">
              {#if group.matchCount === 1}
                <span class="match-count exact">Found: "{group.term}"</span>
              {:else if group.matchCount > 1}
                <span class="match-count multiple">
                  {group.matchCount} results for "{group.term}"
                </span>
                <span class="select-hint">Select the companies you want to analyze</span>
              {:else}
                <span class="match-count none">No results for "{group.term}"</span>
              {/if}
            </div>
            <div class="results-grid">
              {#each group.results as entity}
                <div class="result-wrapper" class:selected={isSelected(entity)}>
                  <EntityMicroCard
                    name={entity.name}
                    location={entity.headquartersCountry || ''}
                    assetCount={entity.assetCount || 0}
                    onclick={() => selectOwner(entity)}
                  />
                  {#if isSelected(entity)}
                    <div class="result-check">✓</div>
                  {/if}
                </div>
              {/each}
            </div>
            {#if group.matchCount > 1}
              <div class="group-actions">
                <button
                  class="select-all-btn"
                  onclick={() => group.results.forEach((e) => selectOwner(e, false))}
                >
                  Select all {group.matchCount} companies
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Browse all companies section -->
  <section class="show-all-section">
    <h2>Want every asset instead?</h2>
    <p class="section-subtitle">
      {#if selectedClasses.length > 0}
        Show every <strong
          >{selectedClasses.length > 1
            ? selectedClasses.map((c) => c.name).join(' & ')
            : selectedClasses[0]?.name}</strong
        > asset worldwide — no ownership filter.
      {:else}
        Show every asset in the database — no ownership filter.
      {/if}
    </p>
    <button class="show-all-btn" onclick={showAllAssets}> Show all assets </button>
  </section>

  <!-- Debug panel -->
  {#if debugApiCalls.length > 0}
    <DebugPanel title="API Debug" time={debugLastSearchTime}>
      <div class="debug-meta">
        <span class="debug-label">API calls:</span>
        <span class="debug-value">{debugApiCalls.length}</span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Results:</span>
        <span class="debug-value">{searchResultGroups.reduce((sum, g) => sum + g.results.length, 0)} entities</span>
      </div>
      <div class="debug-calls">
        <span class="debug-label">Requests:</span>
        {#each debugApiCalls as call}
          <div class="debug-call">
            <span class="call-type">{call.type}</span>
            <code class="call-params">{JSON.stringify(call.params)}</code>
          </div>
        {/each}
      </div>
    </DebugPanel>
  {/if}

  <!-- Selected owners footer -->
  {#snippet footer()}
    {#if selectedOwners.length > 0}
      <div class="selected-footer-content">
        <div class="selected-info">
          <strong
            >{selectedOwners.length}
            {selectedOwners.length === 1 ? 'company' : 'companies'} selected</strong
          >
          <span class="selected-names">
            {selectedOwners
              .slice(0, 3)
              .map((o) => o.name)
              .join(', ')}
            {#if selectedOwners.length > 3}
              + {selectedOwners.length - 3} more
            {/if}
          </span>
        </div>
        <button class="continue-btn" onclick={continueToResults}>Continue to Results</button>
      </div>
    {/if}
  {/snippet}
</ScreenerLayout>

<style>
  /* Search section */
  .search-section {
    margin-bottom: 56px;
  }

  /* h2 uses global styles from app.css */

  .section-subtitle {
    margin-bottom: var(--space-6);
  }

  /* Primary search - bigger, more prominent */
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

  /* Results preview - inline grid */
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

  /* Advanced search (collapsed by default) */
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

  /* Example companies */
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

  /* Action row - grid layout */
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

  /* Results - clean grid */
  .search-results {
    margin-top: var(--space-10);
    padding-top: var(--space-8);
    border-top: var(--border-width) solid var(--color-border);
  }

  .results-source-row {
    margin-bottom: var(--space-4);
    display: flex;
    justify-content: flex-end;
  }

  /* Result groups for disambiguation */
  .result-group {
    margin-bottom: var(--space-10);
  }

  .result-group:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    gap: var(--space-3);
    align-items: baseline;
    margin-bottom: var(--space-4);
  }

  .match-count {
    font-size: var(--font-size-body);
    font-weight: 400;
    color: var(--color-text-secondary);
  }

  .match-count.exact {
    color: var(--color-text-secondary);
  }

  .match-count.multiple {
    color: var(--color-text-secondary);
  }

  .match-count.none {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .select-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    font-weight: 400;
  }

  .group-actions {
    margin-top: var(--space-4);
  }

  .select-all-btn {
    padding: 0;
    font-size: var(--font-size-body);
    background: none;
    color: var(--color-text-secondary);
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .select-all-btn:hover {
    color: var(--color-text-primary);
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    max-height: 480px;
    overflow-y: auto;
    padding: 2px;
  }

  @media (max-width: 900px) {
    .results-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  /* Simplified result wrapper - grid-friendly */
  .result-wrapper {
    position: relative;
    min-width: 0; /* Allow shrinking in grid */
    transition:
      opacity var(--duration-base) var(--ease-in-out-quad),
      transform var(--duration-base) var(--ease-out-back);
    cursor: pointer;
  }

  .result-wrapper:hover {
    opacity: 0.85;
    transform: translateY(-2px);
  }

  .result-wrapper.selected {
    opacity: 1;
  }

  .result-wrapper.selected::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: var(--border-width) solid var(--color-text-tertiary);
    pointer-events: none;
  }

  .result-check {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    background: var(--color-text-primary);
    color: var(--color-white);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  /* Browse all section */
  .show-all-section {
    padding-top: var(--space-10);
    margin-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }

  .show-all-btn {
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-body);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .show-all-btn:hover:not(:disabled) {
    border-color: var(--color-text-secondary);
  }

  .show-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Selected footer content - grid for no overlap */
  .selected-footer-content {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-6);
    align-items: center;
    max-width: 960px;
    margin: 0 auto;
  }

  .selected-info {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    min-width: 0; /* Allow text truncation */
    overflow: hidden;
  }

  .selected-info strong {
    font-weight: 500;
    white-space: nowrap;
  }

  .selected-names {
    color: var(--color-text-tertiary);
    margin-left: 6px;
    font-size: var(--font-size-body);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .continue-btn {
    padding: var(--space-4) var(--space-8);
    font-size: var(--font-size-lg);
    font-weight: 600;
    background: var(--color-text-primary);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    transition: background var(--duration-slow) var(--ease-in-out-quad);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .continue-btn:hover {
    background: var(--color-black);
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

    .results-grid {
      grid-template-columns: 1fr;
    }

    .group-header {
      grid-auto-flow: row;
    }

    .selected-footer-content {
      grid-template-columns: 1fr;
      gap: var(--space-3);
      text-align: center;
    }

    .selected-info {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }

    .selected-names {
      margin-left: 0;
    }

    .continue-btn {
      width: 100%;
    }
  }

  /* Page-specific debug styles */
  .debug-calls {
    margin-top: var(--space-4);
  }

  .debug-call {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .call-type {
    color: var(--gem-teal);
    font-family: var(--font-family-mono);
    font-weight: 500;
  }

  .call-params {
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: nowrap;
  }
</style>
