<script>
  /**
   * ASSET-CLASS SCREENER - Step 2: Search Owners
   * Search for companies by name, GEM Entity ID, LEI, or Perm ID.
   * Matches mockup layout with asset classes panel + owner search.
   */

  import { link, assetPath, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { listEntities, getEntity } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

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
  let searchResults = $state([]);
  let searchLoading = $state(false);
  let searchError = $state(null);

  // Selected owners
  let selectedOwners = $state([]);

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
    if (!singleSearchQuery.trim()) return;

    searchLoading = true;
    searchError = null;
    searchResults = [];

    try {
      searchResults = await searchSingleEntity(singleSearchQuery);
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
    searchResults = [];

    try {
      // Parse lines - handle both newlines and commas
      const inputs = bulkSearchText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Search each input (limit to 30 to avoid overloading)
      const searchPromises = inputs.slice(0, 30).map((input) => searchSingleEntity(input));
      const allResults = await Promise.all(searchPromises);

      // Dedupe results by ID
      const seen = new Set();
      const deduped = [];
      for (const results of allResults) {
        for (const entity of results) {
          if (!seen.has(entity.id)) {
            seen.add(entity.id);
            deduped.push(entity);
          }
        }
      }
      searchResults = deduped;
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
    } catch (err) {
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
      case 'in':
        const vals = String(value)
          .split(',')
          .map((v) => `'${v.trim().replace(/'/g, "''")}'`)
          .join(',');
        return `${sqlField} IN (${vals})`;
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

    const whereClause =
      classConditions.length > 0 ? `AND (${classConditions.join(' OR ')})` : '';

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
    searchResults = [];

    try {
      if (!duckdbReady) {
        // Fall back to API if DuckDB not ready
        const response = await listEntities({ limit: 100 });
        searchResults = response.results || [];
        return;
      }

      // Build and execute query based on selected asset classes
      const classes = selectedClasses();
      const sql = buildAssetClassQuery(classes);

      console.log('[Screener] Executing query:', sql);
      const result = await query(sql);

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      // Transform results to match expected format
      searchResults = (result.data || []).map((row) => ({
        id: row.id,
        name: row.name || row.id,
        headquartersCountry: row.headquartersCountry,
        assetCount: row.assetCount,
      }));

      console.log(`[Screener] Found ${searchResults.length} owners`);
    } catch (err) {
      console.error('[Screener] Query error:', err);
      searchError = err?.message || 'Failed to load companies';

      // Fall back to API
      try {
        const response = await listEntities({ limit: 100 });
        searchResults = response.results || [];
        searchError = null; // Clear error if fallback worked
      } catch {
        // Keep original error
      }
    } finally {
      searchLoading = false;
    }
  }

  // Toggle owner selection
  function toggleOwner(owner) {
    const exists = selectedOwners.find((o) => o.id === owner.id);
    if (exists) {
      selectedOwners = selectedOwners.filter((o) => o.id !== owner.id);
    } else {
      selectedOwners = [...selectedOwners, owner];
    }
  }

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

  // Check if owner is selected
  function isSelected(owner) {
    return selectedOwners.some((o) => o.id === owner.id);
  }
</script>

<svelte:head>
  <title>Search Owners — Asset-Class Screener — GEM Viz</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <nav class="step-nav">
      <a href={link('screener')} class="step completed">
        <span class="step-num">1</span>
        <span class="step-label">Asset Classes</span>
      </a>
      <div class="step-line"></div>
      <div class="step active">
        <span class="step-num">2</span>
        <span class="step-label">Find Owners</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">3</span>
        <span class="step-label">Results</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">4</span>
        <span class="step-label">Visualize</span>
      </div>
    </nav>

    <!-- Header with asset classes panel -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Asset-Class Screener</h1>
        <p class="subtitle">
          Evaluate companies' ownership stakes in classes of fossil fuel assets.<br />
          Start by selecting asset-classes below, or building your own query.
        </p>
      </div>

      <!-- Selected asset classes panel -->
      <div class="classes-panel" class:expanded={classesExpanded}>
        <button class="panel-header" onclick={() => (classesExpanded = !classesExpanded)}>
          <span class="toggle-icon">{classesExpanded ? '▼' : '▶'}</span>
          View selected asset-classes
        </button>
        {#if classesExpanded}
          <div class="panel-content">
            {#if selectedClasses().length === 0}
              <p class="no-classes">No asset classes selected</p>
            {:else}
              {#each selectedClasses() as assetClass}
                <span class="class-tag">
                  {assetClass.name}
                  <button class="remove-btn" onclick={() => removeClass(assetClass)}>Remove</button>
                </span>
              {/each}
            {/if}
            <button class="change-classes-btn" onclick={goToAssetClasses}>
              Add/change asset classes
            </button>
          </div>
        {/if}
      </div>
    </header>

    <!-- Search owners section -->
    <section class="search-section">
      <h2>Search owners</h2>
      <p class="section-subtitle">
        Check if one or more owners have ownership stakes in selected asset classes.
      </p>

      <!-- Single owner search -->
      <div class="search-field">
        <label for="single-search">Find single owner:</label>
        <div class="input-row">
          <input
            id="single-search"
            type="text"
            class="search-input"
            placeholder=""
            bind:value={singleSearchQuery}
            onkeydown={(e) => e.key === 'Enter' && searchSingle()}
          />
          <span class="input-hint">Search by company name, GEM Entity ID, LEI ID, or Perm ID.</span>
        </div>
      </div>

      <!-- Bulk search -->
      <div class="search-field">
        <label for="bulk-search">Bulk search for multiple owners:</label>
        <div class="input-row">
          <textarea
            id="bulk-search"
            class="bulk-input"
            placeholder=""
            bind:value={bulkSearchText}
            rows="5"
          ></textarea>
          <span class="input-hint">One company per line, include name, LEI ID, or Perm ID</span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="action-row">
        <button class="submit-btn" onclick={searchBulk} disabled={searchLoading}>
          {searchLoading ? 'Searching...' : 'Submit'}
        </button>
        <span class="or-text">Or:</span>
        <label class="upload-btn">
          upload a csv
          <input type="file" accept=".csv" onchange={handleCsvUpload} hidden />
        </label>
      </div>

      <!-- Error -->
      {#if searchError}
        <div class="search-error">{searchError}</div>
      {/if}

      <!-- Results -->
      {#if searchResults.length > 0}
        <div class="search-results">
          <h3>Results ({searchResults.length})</h3>
          <div class="results-grid">
            {#each searchResults as entity}
              <div class="result-wrapper" class:selected={isSelected(entity)}>
                <EntityMicroCard
                  name={entity.name}
                  location={entity.headquartersCountry || ''}
                  assetCount={entity.assetCount || 0}
                  onclick={() => toggleOwner(entity)}
                />
                {#if isSelected(entity)}
                  <div class="result-check">✓</div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <!-- Show all companies section -->
    <section class="show-all-section">
      <h2>Or show all companies</h2>
      <p class="section-subtitle">
        {#if selectedClasses().length > 0}
          Show all companies with ownership stakes in <strong>{selectedClasses().length}</strong> selected asset class{selectedClasses().length !== 1 ? 'es' : ''}.
        {:else}
          Show all companies in the database (no asset class filter applied).
        {/if}
      </p>
      {#if !duckdbReady && !duckdbError}
        <div class="loading-indicator">
          <span class="spinner"></span>
          Loading data engine...
        </div>
      {:else if duckdbError}
        <div class="duckdb-error">
          Data engine unavailable. Using API fallback.
        </div>
      {/if}
      <button class="show-all-btn" onclick={showAllCompanies} disabled={searchLoading}>
        {searchLoading ? 'Querying...' : 'Show all companies'}
      </button>
    </section>

    <!-- Selected owners footer -->
    {#if selectedOwners.length > 0}
      <div class="selected-footer">
        <div class="selected-info">
          <strong>{selectedOwners.length} owners selected:</strong>
          <span class="selected-names">
            {selectedOwners
              .slice(0, 3)
              .map((o) => o.name)
              .join(', ')}
            {#if selectedOwners.length > 3}
              and {selectedOwners.length - 3} more
            {/if}
          </span>
        </div>
        <button class="continue-btn" onclick={continueToResults}> View Results → </button>
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: #f5f3ef;
  }

  .screener-layout {
    max-width: 900px;
    margin: 0 auto;
    padding: 60px 24px 120px;
  }

  /* Step navigation */
  .step-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    opacity: 0.4;
    text-decoration: none;
    color: inherit;
  }

  .step.active,
  .step.completed {
    opacity: 1;
  }

  a.step:hover {
    opacity: 0.8;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 2px solid #1a5f7a;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .step.active .step-num {
    background: #1a5f7a;
    color: white;
  }

  .step.completed .step-num {
    background: #3a7a8a;
    color: white;
  }

  .step-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: #ddd;
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 40px;
    margin-bottom: 48px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: 36px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: #1a3a4a;
  }

  .subtitle {
    font-size: 15px;
    color: #555;
    margin: 0;
    line-height: 1.5;
  }

  /* Asset classes panel */
  .classes-panel {
    background: #3a7a8a;
    border-radius: 6px;
    min-width: 280px;
    max-width: 320px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 14px 16px;
    background: none;
    border: none;
    color: white;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
  }

  .toggle-icon {
    font-size: 10px;
  }

  .panel-content {
    padding: 0 16px 16px;
  }

  .no-classes {
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    margin: 0 0 12px 0;
  }

  .class-tag {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    margin-bottom: 8px;
    color: white;
    font-size: 13px;
  }

  .class-tag .remove-btn {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: white;
    padding: 2px 8px;
    font-size: 11px;
    border-radius: 3px;
    cursor: pointer;
  }

  .class-tag .remove-btn:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .change-classes-btn {
    width: 100%;
    padding: 10px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    font-size: 13px;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 8px;
  }

  .change-classes-btn:hover {
    background: rgba(0, 0, 0, 0.3);
  }

  /* Search section */
  .search-section {
    margin-bottom: 48px;
  }

  h2 {
    font-size: 24px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #1a3a4a;
  }

  .section-subtitle {
    font-size: 14px;
    color: #666;
    margin: 0 0 24px 0;
  }

  .search-field {
    margin-bottom: 24px;
  }

  .search-field label {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: #1a3a4a;
    margin-bottom: 8px;
  }

  .input-row {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }

  .search-input {
    width: 360px;
    padding: 12px 14px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #faf9f7;
  }

  .search-input:focus {
    outline: none;
    border-color: #3a7a8a;
  }

  .bulk-input {
    width: 360px;
    padding: 12px 14px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    resize: vertical;
    font-family: inherit;
    background: #faf9f7;
  }

  .bulk-input:focus {
    outline: none;
    border-color: #3a7a8a;
  }

  .input-hint {
    font-size: 13px;
    color: #666;
    line-height: 1.4;
    padding-top: 8px;
  }

  /* Action row */
  .action-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }

  .submit-btn {
    padding: 10px 24px;
    font-size: 14px;
    background: #f5f3ef;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .submit-btn:hover:not(:disabled) {
    background: #e8e6e2;
  }

  .submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .or-text {
    font-size: 14px;
    color: #666;
  }

  .upload-btn {
    padding: 10px 20px;
    font-size: 14px;
    background: #f5f3ef;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .upload-btn:hover {
    background: #e8e6e2;
  }

  .search-error {
    padding: 12px;
    background: #fee;
    border: 1px solid #fcc;
    color: #c00;
    border-radius: 4px;
    font-size: 13px;
    margin-top: 16px;
  }

  /* Results */
  .search-results {
    margin-top: 32px;
    padding-top: 24px;
    border-top: 1px solid #ddd;
  }

  .search-results h3 {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin: 0 0 16px 0;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    max-height: 450px;
    overflow-y: auto;
    padding: 4px;
  }

  .result-wrapper {
    position: relative;
    border: 2px solid transparent;
    border-radius: 8px;
    transition: border-color 0.15s;
  }

  .result-wrapper:hover {
    border-color: #3a7a8a;
  }

  .result-wrapper.selected {
    border-color: #3a7a8a;
    background: #f0f7f9;
  }

  .result-check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 18px;
    height: 18px;
    background: #3a7a8a;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
  }

  /* Show all section */
  .show-all-section {
    padding-top: 32px;
    border-top: 1px solid #ddd;
  }

  .show-all-btn {
    padding: 10px 24px;
    font-size: 14px;
    background: #f5f3ef;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .show-all-btn:hover:not(:disabled) {
    background: #e8e6e2;
  }

  .show-all-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #666;
    margin-bottom: 12px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #ddd;
    border-top-color: #3a7a8a;
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
    color: #996600;
    background: #fff8e6;
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 12px;
  }

  /* Selected footer */
  .selected-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 40px;
    background: white;
    border-top: 1px solid #ddd;
    box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  }

  .selected-info {
    font-size: 14px;
    color: #333;
  }

  .selected-names {
    color: #666;
    margin-left: 8px;
  }

  .continue-btn {
    padding: 12px 28px;
    font-size: 15px;
    font-weight: 600;
    background: #3a7a8a;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .continue-btn:hover {
    background: #2d6270;
  }

  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
    }

    .classes-panel {
      width: 100%;
      max-width: none;
    }

    .input-row {
      flex-direction: column;
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
      padding: 16px 20px;
    }
  }
</style>
