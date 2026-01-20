<script>
  /**
   * ASSET-CLASS SCREENER - Step 2: Search Owners
   * Search for companies by name, GEM Entity ID, LEI, or Perm ID.
   * Matches mockup layout with asset classes panel + owner search.
   */

  import { link, assetPath } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { listEntities, getEntity } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';

  // DuckDB utilities (loaded dynamically)
  let loadParquetFromPath;
  let query;
  let duckdbReady = $state(false);
  let duckdbError = $state(null);

  // Initialize DuckDB on mount
  onMount(async () => {
    try {
      const duckdbUtils = await import('$lib/duckdb-utils');
      loadParquetFromPath = duckdbUtils.loadParquetFromPath;
      query = duckdbUtils.query;

      // Load the ownership parquet
      const ownershipPath = assetPath('all_trackers_ownership@1.parquet');
      await loadParquetFromPath(ownershipPath, 'ownership');
      duckdbReady = true;
    } catch (err) {
      console.error('Failed to initialize DuckDB:', err);
      duckdbError = err?.message || 'Failed to load data engine';
    }
  });

  // Get selected classes from URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');

  // Parse selected classes for display
  const selectedClasses = $derived(() => {
    if (!classesParam) return [];
    try {
      return JSON.parse(decodeURIComponent(classesParam));
    } catch {
      // Handle legacy comma-separated format
      return classesParam.split(',').map((c) => ({ name: c.trim() }));
    }
  });

  // Selected asset classes panel state
  let classesExpanded = $state(true);

  // Search state
  let singleSearchQuery = $state('');
  let bulkSearchText = $state('');
  let searchLoading = $state(false);
  let searchError = $state(null);

  // Search results with disambiguation tracking
  // Each entry: { term: string, results: Entity[], matchCount: number }
  let searchResultGroups = $state([]);

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
        const entity = await getEntity(parsed.value);
        return entity ? [entity] : [];
      } catch {
        // If not found, fall back to search
        const response = await listEntities({ q: parsed.value, limit: 10 });
        return response.results || [];
      }
    }

    // For other types, use text search
    // (API would need to support LEI/Perm ID fields for proper lookup)
    const response = await listEntities({ q: parsed.value, limit: 20 });
    return response.results || [];
  }

  // Search for single owner
  async function searchSingle() {
    const term = singleSearchQuery.trim();
    if (!term) return;

    searchLoading = true;
    searchError = null;
    searchResultGroups = [];

    try {
      const results = await searchSingleEntity(term);
      searchResultGroups = [{ term, results, matchCount: results.length }];
    } catch (err) {
      searchError = err?.message || 'Search failed';
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

      // Also track terms with no matches
      const noMatches = groups.filter((g) => g.results.length === 0);
      if (noMatches.length > 0) {
        const noMatchTerms = noMatches.map((g) => g.term).join(', ');
        searchError = `No matches found for: ${noMatchTerms}`;
      }
    } catch (err) {
      searchError = err?.message || 'Bulk search failed';
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

  /**
   * Build SQL WHERE clause from asset class filter
   */
  function buildFilterCondition(filter) {
    if (!filter || !filter.field || !filter.operator) return null;

    const field = filter.field;
    const op = filter.operator;
    const value = filter.value;

    // Map common field names to parquet columns
    const fieldMap = {
      'Capacity (MW)': '"Capacity (MW)"',
      Status: 'Status',
      Captive: 'Captive',
      'Start Year': '"Start Year"',
      Country: 'Country',
      'Main production equipment': '"Main production equipment"',
      'Water Depth (m)': '"Water Depth (m)"',
      'Capacity (Mtpa)': '"Capacity (Mtpa)"',
      'Mine Type': '"Mine Type"',
      'Capacity (ttpa)': '"Capacity (ttpa)"',
      'Capacity (Bcm/y)': '"Capacity (Bcm/y)"',
      Feedstock: 'Feedstock',
    };

    const sqlField = fieldMap[field] || `"${field}"`;

    switch (op) {
      case '>':
      case '<':
      case '>=':
      case '<=':
        return `${sqlField} ${op} ${Number(value) || 0}`;
      case '=':
        return `${sqlField} = '${String(value).replace(/'/g, "''")}'`;
      case 'contains':
        return `${sqlField} ILIKE '%${String(value).replace(/'/g, "''")}%'`;
      case 'not_empty':
        return `${sqlField} IS NOT NULL AND ${sqlField} != ''`;
      case 'in': {
        const vals = String(value)
          .split(',')
          .map((v) => `'${v.trim().replace(/'/g, "''")}'`)
          .join(',');
        return `${sqlField} IN (${vals})`;
      }
      default:
        return null;
    }
  }

  /**
   * Build SQL query from selected asset classes
   */
  function buildAssetClassQuery(classes) {
    if (!classes || classes.length === 0) {
      // No filters - return all owners
      return `
        SELECT DISTINCT
          "Owner GEM Entity ID" as id,
          "Owner" as name,
          "Owner Headquarters Country" as headquartersCountry,
          COUNT(*) as assetCount
        FROM ownership
        WHERE "Owner GEM Entity ID" IS NOT NULL
          AND "Owner GEM Entity ID" != ''
        GROUP BY "Owner GEM Entity ID", "Owner", "Owner Headquarters Country"
        ORDER BY assetCount DESC
        LIMIT 100
      `;
    }

    // Build conditions for each asset class
    const classConditions = classes
      .map((cls) => {
        const conditions = [];

        // Filter by tracker
        if (cls.tracker) {
          conditions.push(`Tracker = '${cls.tracker.replace(/'/g, "''")}'`);
        }

        // Filter by field conditions
        if (cls.filters) {
          const filterCond = buildFilterCondition(cls.filters);
          if (filterCond) conditions.push(filterCond);

          // Additional geo filter
          if (cls.filters.geography) {
            conditions.push(`Country = '${cls.filters.geography.replace(/'/g, "''")}'`);
          }

          // Additional status filter
          if (cls.filters.status) {
            conditions.push(`Status = '${cls.filters.status.replace(/'/g, "''")}'`);
          }
        }

        return conditions.length > 0 ? `(${conditions.join(' AND ')})` : null;
      })
      .filter(Boolean);

    const whereClause = classConditions.length > 0 ? `AND (${classConditions.join(' OR ')})` : '';

    return `
      SELECT DISTINCT
        "Owner GEM Entity ID" as id,
        "Owner" as name,
        "Owner Headquarters Country" as headquartersCountry,
        COUNT(*) as assetCount
      FROM ownership
      WHERE "Owner GEM Entity ID" IS NOT NULL
        AND "Owner GEM Entity ID" != ''
        ${whereClause}
      GROUP BY "Owner GEM Entity ID", "Owner", "Owner Headquarters Country"
      ORDER BY assetCount DESC
      LIMIT 100
    `;
  }

  // Show all companies with ownership in selected asset classes
  async function showAllCompanies() {
    searchLoading = true;
    searchError = null;
    searchResultGroups = [];

    try {
      let results = [];

      if (!duckdbReady) {
        // Fall back to API if DuckDB not ready
        const response = await listEntities({ limit: 100 });
        results = response.results || [];
      } else {
        // Build and execute query based on selected asset classes
        const classes = selectedClasses();
        const sql = buildAssetClassQuery(classes);

        console.log('[Screener] Executing query:', sql);
        const result = await query(sql);

        if (!result.success) {
          throw new Error(result.error || 'Query failed');
        }

        // Transform results to match expected format
        results = (result.data || []).map((row) => ({
          id: row.id,
          name: row.name || row.id,
          headquartersCountry: row.headquartersCountry,
          assetCount: row.assetCount,
        }));
      }

      // Create a single group for "all companies"
      searchResultGroups = [
        {
          term: 'All companies',
          results,
          matchCount: results.length,
        },
      ];

      console.log(`[Screener] Found ${results.length} owners`);
    } catch (err) {
      console.error('[Screener] Query error:', err);
      searchError = err?.message || 'Failed to load companies';

      // Fall back to API
      try {
        const response = await listEntities({ limit: 100 });
        searchResultGroups = [
          {
            term: 'All companies',
            results: response.results || [],
            matchCount: response.results?.length || 0,
          },
        ];
        searchError = null; // Clear error if fallback worked
      } catch {
        // Keep original error
      }
    } finally {
      searchLoading = false;
    }
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

  // Remove a selected class
  function removeClass(classToRemove) {
    const updated = selectedClasses().filter((c) => c.name !== classToRemove.name);
    const newParam = encodeURIComponent(JSON.stringify(updated));
    goto(link(`screener/owners?classes=${newParam}`), { replaceState: true });
  }

  // Navigation
  function goToAssetClasses() {
    goto(link('screener'));
  }

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
  <title>Find Owners — Asset-Class Screener — GEM Viz</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <ScreenerStepNav currentStep={2} {classesParam} />

    <!-- Header with asset classes panel -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Asset-Class Screener</h1>
        <p class="subtitle">
          Evaluate companies' ownership stakes in fossil fuel assets.<br />
          Step 2: Search for companies to analyze.
        </p>
      </div>

      <!-- Selected asset classes panel -->
      <div class="classes-panel" class:expanded={classesExpanded}>
        <button class="panel-header" onclick={() => (classesExpanded = !classesExpanded)}>
          <span class="toggle-icon">{classesExpanded ? '▼' : '▶'}</span>
          Selected Asset Classes
        </button>
        {#if classesExpanded}
          <div class="panel-content">
            {#if selectedClasses().length === 0}
              <p class="no-classes">No asset classes selected. Add classes to filter results.</p>
            {:else}
              {#each selectedClasses() as assetClass}
                <span class="class-tag">
                  {assetClass.name}
                  <button class="remove-btn" onclick={() => removeClass(assetClass)}>Remove</button>
                </span>
              {/each}
            {/if}
            <button class="change-classes-btn" onclick={goToAssetClasses}>
              Edit asset class selection
            </button>
          </div>
        {/if}
      </div>
    </header>

    <!-- Search owners section -->
    <section class="search-section">
      <h2>Find Owners by Name or ID</h2>
      <p class="section-subtitle">
        Search for companies to check their ownership stakes in the selected asset classes.
      </p>

      <!-- Single owner search -->
      <div class="search-field">
        <label for="single-search">Search for a company</label>
        <div class="input-row">
          <div class="search-input-wrapper">
            <input
              id="single-search"
              type="text"
              class="search-input"
              placeholder="e.g., ExxonMobil or E100001000348"
              bind:value={singleSearchQuery}
              onkeydown={(e) => e.key === 'Enter' && searchSingle()}
            />
            <button class="search-btn" onclick={searchSingle} disabled={searchLoading || !singleSearchQuery.trim()}>
              {searchLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <span class="input-hint">Enter a company name, GEM Entity ID, LEI, or Perm ID.</span>
        </div>
      </div>

      <!-- Bulk search -->
      <div class="search-field">
        <label for="bulk-search">Search multiple companies at once</label>
        <div class="input-row">
          <textarea
            id="bulk-search"
            class="bulk-input"
            placeholder="Shell&#10;BP&#10;TotalEnergies&#10;E100001000348"
            bind:value={bulkSearchText}
            rows="5"
          ></textarea>
          <span class="input-hint">Enter one company per line. Accepts names, LEI codes, or Perm IDs.</span>
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

      <!-- Error -->
      {#if searchError}
        <div class="search-error">{searchError}</div>
      {/if}

      <!-- Results with disambiguation -->
      {#if searchResultGroups.length > 0}
        <div class="search-results">
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
      <h2>Browse All Companies</h2>
      <p class="section-subtitle">
        {#if selectedClasses().length > 0}
          View all companies with ownership stakes in your <strong>{selectedClasses().length}</strong>
          selected asset class{selectedClasses().length !== 1 ? 'es' : ''}.
        {:else}
          Browse all companies in the GEM database. Select asset classes first to filter by ownership.
        {/if}
      </p>
      {#if !duckdbReady && !duckdbError}
        <div class="loading-indicator">
          <span class="spinner"></span>
          Initializing data engine...
        </div>
      {:else if duckdbError}
        <div class="duckdb-error">Data engine unavailable. Results will load from the API.</div>
      {/if}
      <button class="show-all-btn" onclick={showAllCompanies} disabled={searchLoading}>
        {searchLoading ? 'Loading companies...' : 'Browse All Companies'}
      </button>
    </section>

    <!-- Selected owners footer -->
    {#if selectedOwners.length > 0}
      <div class="selected-footer">
        <div class="selected-info">
          <strong>{selectedOwners.length} {selectedOwners.length === 1 ? 'company' : 'companies'} selected</strong>
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
  </div>
</main>

<style>
  /* ============================================
   * TUFTE-STYLE INFORMATION DESIGN
   * - High data-ink ratio
   * - Typography-driven hierarchy
   * - Generous whitespace
   * - Minimal chrome
   * ============================================ */

  main {
    min-height: 100vh;
    background: #faf9f7;
  }

  .screener-layout {
    max-width: 860px;
    margin: 0 auto;
    padding: 72px 32px 140px;
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 48px;
    margin-bottom: 56px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: 32px;
    font-weight: 400;
    margin: 0 0 12px 0;
    color: #222;
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 15px;
    color: #666;
    margin: 0;
    line-height: 1.6;
    max-width: 400px;
  }

  /* Asset classes panel - Tufte: light, unobtrusive */
  .classes-panel {
    background: #fff;
    border: 1px solid #e0e0e0;
    min-width: 260px;
    max-width: 300px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 12px 16px;
    background: none;
    border: none;
    border-bottom: 1px solid #eee;
    color: #555;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
  }

  .toggle-icon {
    font-size: 8px;
    color: #999;
  }

  .panel-content {
    padding: 12px 16px 16px;
  }

  .no-classes {
    color: #888;
    font-size: 13px;
    margin: 0 0 12px 0;
    font-style: italic;
  }

  .class-tag {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #f0f0f0;
    color: #333;
    font-size: 13px;
  }

  .class-tag:last-of-type {
    border-bottom: none;
  }

  .class-tag .remove-btn {
    background: none;
    border: none;
    color: #999;
    padding: 0;
    font-size: 11px;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .class-tag .remove-btn:hover {
    color: #c44;
  }

  .change-classes-btn {
    width: 100%;
    padding: 8px 0;
    background: none;
    border: none;
    border-top: 1px solid #eee;
    color: #666;
    font-size: 12px;
    cursor: pointer;
    margin-top: 8px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .change-classes-btn:hover {
    color: #333;
  }

  /* Search section */
  .search-section {
    margin-bottom: 56px;
  }

  h2 {
    font-size: 20px;
    font-weight: 400;
    margin: 0 0 6px 0;
    color: #222;
  }

  .section-subtitle {
    font-size: 14px;
    color: #666;
    margin: 0 0 32px 0;
    line-height: 1.5;
  }

  .search-field {
    margin-bottom: 32px;
  }

  .search-field label {
    display: block;
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #888;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    align-items: flex-start;
    gap: 20px;
  }

  .search-input-wrapper {
    display: flex;
    gap: 12px;
    align-items: flex-end;
  }

  .search-input {
    width: 300px;
    padding: 10px 0;
    font-size: 15px;
    border: none;
    border-bottom: 1px solid #ccc;
    background: transparent;
  }

  .search-input:focus {
    outline: none;
    border-bottom-color: #333;
  }

  .search-input::placeholder {
    color: #aaa;
  }

  .search-btn {
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    background: #333;
    color: white;
    border: none;
    cursor: pointer;
    transition: background 0.15s;
  }

  .search-btn:hover:not(:disabled) {
    background: #111;
  }

  .search-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .bulk-input {
    width: 340px;
    padding: 10px 12px;
    font-size: 14px;
    border: 1px solid #ddd;
    background: #fff;
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
  }

  .bulk-input:focus {
    outline: none;
    border-color: #999;
  }

  .bulk-input::placeholder {
    color: #aaa;
  }

  .input-hint {
    font-size: 12px;
    color: #888;
    line-height: 1.5;
    padding-top: 8px;
    max-width: 260px;
  }

  /* Action row - minimal button styling */
  .action-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 8px;
  }

  .submit-btn {
    padding: 8px 20px;
    font-size: 13px;
    background: #fff;
    color: #333;
    border: 1px solid #ccc;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .submit-btn:hover:not(:disabled) {
    border-color: #666;
  }

  .submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .or-text {
    font-size: 12px;
    color: #999;
  }

  .upload-btn {
    padding: 0;
    font-size: 13px;
    background: none;
    color: #666;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .upload-btn:hover {
    color: #333;
  }

  .search-error {
    padding: 10px 12px;
    background: #fff;
    border-left: 3px solid #c66;
    color: #833;
    font-size: 13px;
    margin-top: 20px;
  }

  /* Results - clean grid */
  .search-results {
    margin-top: 40px;
    padding-top: 32px;
    border-top: 1px solid #e0e0e0;
  }

  /* Result groups for disambiguation */
  .result-group {
    margin-bottom: 40px;
  }

  .result-group:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }

  .match-count {
    font-size: 13px;
    font-weight: 400;
    color: #555;
  }

  .match-count.exact {
    color: #555;
  }

  .match-count.multiple {
    color: #555;
  }

  .match-count.none {
    color: #999;
    font-style: italic;
  }

  .select-hint {
    font-size: 12px;
    color: #888;
    font-weight: 400;
  }

  .group-actions {
    margin-top: 16px;
  }

  .select-all-btn {
    padding: 0;
    font-size: 12px;
    background: none;
    color: #666;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .select-all-btn:hover {
    color: #333;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 16px;
    max-height: 480px;
    overflow-y: auto;
    padding: 2px;
  }

  /* Simplified result wrapper - Tufte: minimal borders */
  .result-wrapper {
    position: relative;
    transition: opacity 0.15s;
  }

  .result-wrapper:hover {
    opacity: 0.85;
  }

  .result-wrapper.selected {
    opacity: 1;
  }

  .result-wrapper.selected::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: 1px solid #888;
    pointer-events: none;
  }

  .result-check {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    background: #333;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 500;
  }

  /* Browse all section */
  .show-all-section {
    padding-top: 40px;
    margin-top: 16px;
    border-top: 1px solid #e0e0e0;
  }

  .show-all-btn {
    padding: 8px 20px;
    font-size: 13px;
    background: #fff;
    color: #333;
    border: 1px solid #ccc;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .show-all-btn:hover:not(:disabled) {
    border-color: #666;
  }

  .show-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #888;
    margin-bottom: 12px;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 1.5px solid #ddd;
    border-top-color: #666;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .duckdb-error {
    font-size: 12px;
    color: #886600;
    padding: 0;
    margin-bottom: 12px;
    font-style: italic;
  }

  /* Selected footer - simplified */
  .selected-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 40px;
    background: #fff;
    border-top: 1px solid #ddd;
  }

  .selected-info {
    font-size: 13px;
    color: #333;
  }

  .selected-info strong {
    font-weight: 500;
  }

  .selected-names {
    color: #888;
    margin-left: 6px;
    font-size: 12px;
  }

  .continue-btn {
    padding: 20px 48px;
    font-size: 18px;
    font-weight: 600;
    background: #222;
    color: white;
    border: none;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    letter-spacing: 0.02em;
  }

  .continue-btn:hover {
    background: #000;
    transform: translateY(-1px);
  }

  @media (max-width: 768px) {
    .screener-layout {
      padding: 48px 20px 120px;
    }

    .screener-header {
      flex-direction: column;
      gap: 32px;
    }

    .classes-panel {
      width: 100%;
      max-width: none;
    }

    .input-row {
      flex-direction: column;
      gap: 12px;
    }

    .search-input,
    .bulk-input {
      width: 100%;
    }

    .action-row {
      flex-wrap: wrap;
    }

    .results-grid {
      grid-template-columns: 1fr;
    }

    .selected-footer {
      flex-direction: column;
      gap: 12px;
      padding: 14px 20px;
    }
  }
</style>
