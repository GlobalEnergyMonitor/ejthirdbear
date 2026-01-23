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

  // Example companies by tracker type - real major owners
  const exampleCompaniesByTracker = {
    'Coal Plant': [
      { name: 'China Energy Investment', id: 'E100001000348' },
      { name: 'NTPC Limited', id: 'E100001000001' },
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
      { name: 'Adani Power', id: 'E100001000003' },
    ],
    'Steel Plant': [
      { name: 'ArcelorMittal', id: 'E100001000100' },
      { name: 'Nippon Steel', id: 'E100001000101' },
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
      { name: 'POSCO', id: 'E100001000103' },
    ],
    'Oil & NGL Pipeline': [
      { name: 'ExxonMobil', id: 'E100001000200' },
      { name: 'Shell', id: 'E100001000201' },
      { name: 'TotalEnergies', id: 'E100001000202' },
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    ],
    'Gas Pipeline': [
      { name: 'Gazprom', id: 'E100001000300' },
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
      { name: 'Enterprise Products', id: 'E100001000302' },
      { name: 'Enbridge', id: 'E100001000303' },
    ],
    LNG: [
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
      { name: 'Qatar Energy', id: 'E100001000400' },
      { name: 'Cheniere Energy', id: 'E100001000401' },
      { name: 'Woodside Energy', id: 'E100001000402' },
    ],
    default: [
      { name: 'Mitsubishi Corporation', id: 'E100001000500' },
      { name: 'ExxonMobil', id: 'E100001000200' },
      { name: 'Shell', id: 'E100001000201' },
      { name: 'TotalEnergies', id: 'E100001000202' },
    ],
  };

  // Get relevant example companies based on selected asset classes
  const exampleCompanies = $derived(() => {
    const classes = selectedClasses();
    if (classes.length === 0) return exampleCompaniesByTracker.default;

    // Get unique trackers from selected classes
    const trackers = new Set();
    classes.forEach((c) => {
      if (c.tracker) trackers.add(c.tracker);
    });

    // Collect examples from relevant trackers
    const examples = [];
    const seen = new Set();
    trackers.forEach((tracker) => {
      const trackerExamples = exampleCompaniesByTracker[tracker] || [];
      trackerExamples.forEach((ex) => {
        if (!seen.has(ex.name)) {
          seen.add(ex.name);
          examples.push(ex);
        }
      });
    });

    return examples.length > 0 ? examples.slice(0, 4) : exampleCompaniesByTracker.default;
  });

  // Use an example company
  function useExample(example) {
    singleSearchQuery = example.name;
    searchSingle();
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
        <h1>Find Companies to Investigate</h1>
        <p class="subtitle">
          Search for a company to see their ownership stakes, assets, and corporate network.
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
            {#each exampleCompanies() as example, i}
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
      <h2>Don't have a company in mind?</h2>
      <p class="section-subtitle">
        {#if selectedClasses().length > 0}
          Browse all <strong
            >{selectedClasses().length > 1
              ? selectedClasses()
                  .map((c) => c.name)
                  .join(' & ')
              : selectedClasses()[0]?.name}</strong
          > owners to discover key players and find leads.
        {:else}
          Explore all companies in the database to find investigative leads.
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
        {searchLoading ? 'Loading...' : 'Browse All Owners'}
      </button>
    </section>

    <!-- Selected owners footer -->
    {#if selectedOwners.length > 0}
      <div class="selected-footer">
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
    background: var(--color-bg-secondary);
  }

  .screener-layout {
    max-width: 860px;
    margin: 0 auto;
    padding: 72px var(--space-8) 140px;
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-12);
    margin-bottom: 56px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: 400;
    margin: 0 0 var(--space-3) 0;
    color: var(--color-text-primary);
    letter-spacing: var(--tracking-tight);
  }

  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: var(--line-height-relaxed);
    max-width: 400px;
  }

  /* Asset classes panel - Tufte: light, unobtrusive */
  .classes-panel {
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    min-width: 260px;
    max-width: 300px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: none;
    border: none;
    border-bottom: var(--border-width) solid var(--color-border-light);
    color: var(--color-text-secondary);
    font-size: var(--font-size-md);
    font-weight: 500;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
  }

  .toggle-icon {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .panel-content {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .no-classes {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-body);
    margin: 0 0 var(--space-3) 0;
    font-style: italic;
  }

  .class-tag {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: var(--border-width) solid var(--color-gray-100);
    color: var(--color-text-primary);
    font-size: var(--font-size-body);
  }

  .class-tag:last-of-type {
    border-bottom: none;
  }

  .class-tag .remove-btn {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    padding: 0;
    font-size: var(--font-size-md);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .class-tag .remove-btn:hover {
    color: var(--color-error);
  }

  .change-classes-btn {
    width: 100%;
    padding: var(--space-2) 0;
    background: none;
    border: none;
    border-top: var(--border-width) solid var(--color-border-light);
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
    cursor: pointer;
    margin-top: var(--space-2);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .change-classes-btn:hover {
    color: var(--color-text-primary);
  }

  /* Search section */
  .search-section {
    margin-bottom: 56px;
  }

  h2 {
    font-size: var(--font-size-2xl);
    font-weight: 400;
    margin: 0 0 6px 0;
    color: var(--color-text-primary);
  }

  .section-subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-6) 0;
    line-height: var(--line-height-normal);
  }

  .section-subtitle strong {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  /* Primary search - bigger, more prominent */
  .primary-search {
    margin-bottom: var(--space-4);
  }

  .primary-search .search-input-wrapper {
    margin-bottom: var(--space-3);
  }

  .primary-search .search-input {
    width: 380px;
    font-size: var(--font-size-xl);
  }

  .search-help {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  /* Results preview */
  .results-preview {
    display: flex;
    align-items: center;
    gap: var(--space-2);
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
    display: flex;
    gap: var(--space-3);
    align-items: flex-end;
  }

  .search-input {
    width: 300px;
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

  /* Action row - minimal button styling */
  .action-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
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

  /* Result groups for disambiguation */
  .result-group {
    margin-bottom: var(--space-10);
  }

  .result-group:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
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
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-4);
    max-height: 480px;
    overflow-y: auto;
    padding: 2px;
  }

  /* Simplified result wrapper - Tufte: minimal borders */
  .result-wrapper {
    position: relative;
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

  .loading-indicator {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 1.5px solid var(--color-gray-300);
    border-top-color: var(--color-text-secondary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .duckdb-error {
    font-size: var(--font-size-body);
    color: var(--color-warning);
    padding: 0;
    margin-bottom: var(--space-3);
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
    padding: var(--space-3) var(--space-10);
    background: var(--color-bg-primary);
    border-top: var(--border-width) solid var(--color-gray-300);
    animation: footerSlideUp 0.4s var(--ease-in-out-quad);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  }

  @keyframes footerSlideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .selected-info {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
  }

  .selected-info strong {
    font-weight: 500;
  }

  .selected-names {
    color: var(--color-text-tertiary);
    margin-left: 6px;
    font-size: var(--font-size-body);
  }

  .continue-btn {
    padding: var(--space-5) var(--space-12);
    font-size: var(--font-size-xl);
    font-weight: 600;
    background: var(--color-text-primary);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    transition: background var(--duration-slow) var(--ease-in-out-quad);
    letter-spacing: var(--tracking-wide);
  }

  .continue-btn:hover {
    background: var(--color-black);
  }

  @media (max-width: 768px) {
    .screener-layout {
      padding: var(--space-12) var(--space-5) 120px;
    }

    .screener-header {
      flex-direction: column;
      gap: var(--space-8);
    }

    .classes-panel {
      width: 100%;
      max-width: none;
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
      flex-wrap: wrap;
    }

    .results-grid {
      grid-template-columns: 1fr;
    }

    .selected-footer {
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-5);
    }
  }
</style>
