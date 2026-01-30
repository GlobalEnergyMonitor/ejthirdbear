<script>
  /**
   * ASSET-CLASS SCREENER - Results
   *
   * Shows OWNERS who have exposure to selected asset classes.
   * Designed for investigative journalists building dossiers.
   *
   * Key features:
   * - Search/filter to find specific companies from your watchlist
   * - Add to Investigation cart for building reports
   * - Natural language descriptions of ownership exposure
   */

  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';
  import { entityLink } from '$lib/links';
  import { investigationStore } from '$lib/stores/investigation';

  // URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');

  // Parse selected classes
  const selectedClasses = $derived(() => {
    if (!classesParam) return [];
    try {
      return JSON.parse(decodeURIComponent(classesParam));
    } catch {
      return [];
    }
  });

  // Build human-readable description of selected class
  const classDescription = $derived(() => {
    const classes = selectedClasses();
    if (classes.length === 0) return 'selected assets';

    const cls = classes[0];
    const parts = [];

    if (cls.filters?.status) {
      parts.push(cls.filters.status);
    }

    parts.push(cls.tracker || cls.name || 'assets');

    if (cls.filters?.geography) {
      parts.push(`in ${cls.filters.geography}`);
    }

    return parts.join(' ');
  });

  // State
  let loading = $state(true);
  let error = $state(null);
  let owners = $state([]);
  let unmatchedCount = $state(0);
  let showUnmatched = $state(false);

  // Data source tracking
  let dataSource = $state('motherduck');
  let queryTime = $state(null);

  // Search/filter for journalists with watchlists
  let searchQuery = $state('');
  let showOnlyInvestigation = $state(false);

  // Investigation cart state (reactive)
  let investigationEntities = $state([]);
  investigationStore.subscribe((state) => {
    investigationEntities = state.entities;
  });

  // Filtered owners based on search
  const filteredOwners = $derived(() => {
    let result = owners;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((o) => o.name.toLowerCase().includes(query));
    }

    // Filter to only show entities in investigation
    if (showOnlyInvestigation) {
      const investigationIds = new Set(investigationEntities.map((e) => e.id));
      result = result.filter((o) => investigationIds.has(o.entityId));
    }

    return result;
  });

  // Check if entity is in investigation
  function isInInvestigation(entityId) {
    return investigationEntities.some((e) => e.id === entityId);
  }

  // Toggle entity in investigation
  function toggleInvestigation(owner) {
    if (isInInvestigation(owner.entityId)) {
      investigationStore.removeEntity(owner.entityId);
    } else {
      investigationStore.addEntity({
        id: owner.entityId,
        name: owner.name,
        type: 'entity',
      });
    }
  }

  // Add all visible results to investigation
  function addAllToInvestigation() {
    const toAdd = filteredOwners()
      .filter((o) => o.entityId && !isInInvestigation(o.entityId))
      .map((o) => ({ id: o.entityId, name: o.name, type: 'entity' }));
    investigationStore.addEntities(toAdd);
  }

  // Load owners data
  onMount(async () => {
    try {
      const classes = selectedClasses();
      if (classes.length === 0) {
        error = 'No asset class selected. Go back and select one.';
        loading = false;
        return;
      }

      // Try MotherDuck first, fall back to local DuckDB
      let queryFn;
      dataSource = 'motherduck';

      try {
        const motherduck = await import('$lib/motherduck-wasm');
        await motherduck.initMotherDuck();
        queryFn = motherduck.query;
      } catch (mdErr) {
        console.warn('MotherDuck unavailable, using local DuckDB:', mdErr);
        dataSource = 'local';
        const duckdb = await import('$lib/duckdb-utils');
        const { assetPath } = await import('$lib/links');
        await duckdb.loadParquetFromPath(
          assetPath('all_trackers_ownership@1.parquet'),
          'ownership'
        );
        queryFn = duckdb.query;
      }

      const cls = classes[0];
      const trackerVal = cls?.tracker;
      const statusVal = cls?.filters?.status;

      const queryStartTime = performance.now();

      // Different column names for MotherDuck vs local parquet
      let sql;
      if (dataSource === 'motherduck') {
        // MotherDuck: gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership
        // Column mapping: Tracker -> Asset Type, Status -> Status (may not exist)
        const tableName = 'gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership';
        const trackerClause = trackerVal ? `AND "Asset Type" = '${trackerVal.replace(/'/g, "''")}'` : '';
        const statusClause = ''; // Status column may not exist in new schema

        sql = `
          WITH owner_totals AS (
            SELECT
              "Immediate Owner Entity Name" as name,
              "Immediate Owner Entity ID" as entity_id,
              COUNT(DISTINCT "Asset ID") as total_assets
            FROM ${tableName}
            WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
            GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
          ),
          owner_filtered AS (
            SELECT
              "Immediate Owner Entity Name" as name,
              "Immediate Owner Entity ID" as entity_id,
              COUNT(DISTINCT "Asset ID") as filtered_assets
            FROM ${tableName}
            WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
              ${trackerClause}
              ${statusClause}
            GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
          )
          SELECT
            t.name,
            t.entity_id,
            t.total_assets,
            COALESCE(f.filtered_assets, 0) as filtered_assets
          FROM owner_totals t
          LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
          WHERE f.filtered_assets > 0
          ORDER BY f.filtered_assets DESC, t.total_assets DESC
          LIMIT 200
        `;
      } else {
        // Local DuckDB: ownership table from parquet
        const tableName = 'ownership';
        const trackerClause = trackerVal ? `AND "Tracker" = '${trackerVal.replace(/'/g, "''")}'` : '';
        const statusClause = statusVal ? `AND "Status" ILIKE '${statusVal.replace(/'/g, "''")}'` : '';

        sql = `
          WITH owner_totals AS (
            SELECT
              "Owner" as name,
              "Owner GEM Entity ID" as entity_id,
              COUNT(DISTINCT COALESCE("GEM unit ID", "GEM Mine ID", "Steel Plant ID", "GEM Asset ID", "ProjectID")) as total_assets
            FROM ${tableName}
            WHERE "Owner" IS NOT NULL AND "Owner" != ''
            GROUP BY "Owner", "Owner GEM Entity ID"
          ),
          owner_filtered AS (
            SELECT
              "Owner" as name,
              "Owner GEM Entity ID" as entity_id,
              COUNT(DISTINCT COALESCE("GEM unit ID", "GEM Mine ID", "Steel Plant ID", "GEM Asset ID", "ProjectID")) as filtered_assets
            FROM ${tableName}
            WHERE "Owner" IS NOT NULL AND "Owner" != ''
              ${trackerClause}
              ${statusClause}
            GROUP BY "Owner", "Owner GEM Entity ID"
          )
          SELECT
            t.name,
            t.entity_id,
            t.total_assets,
            COALESCE(f.filtered_assets, 0) as filtered_assets
          FROM owner_totals t
          LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
          WHERE f.filtered_assets > 0
          ORDER BY f.filtered_assets DESC, t.total_assets DESC
          LIMIT 200
        `;
      }

      const result = await queryFn(sql);
      queryTime = performance.now() - queryStartTime;

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      owners = (result.data || []).map((row) => ({
        name: row.name || 'Unknown',
        entityId: row.entity_id || null,
        totalAssets: Number(row.total_assets) || 0,
        filteredAssets: Number(row.filtered_assets) || 0,
      }));

      loading = false;
    } catch (err) {
      console.error('Failed to load owners:', err);
      error = err?.message || 'Failed to load data';
      loading = false;
    }
  });

  // Natural language helpers
  function describeTotal(count) {
    if (count === 1) return 'Ownership stakes in 1 asset in Global Energy Ownership Tracker';
    return `Ownership stakes in ${count} assets in Global Energy Ownership Tracker`;
  }

  function describeFiltered(count, description) {
    if (count === 1) return `Ownership stakes in one ${description}`;
    return `Ownership stakes in ${count} ${description}`;
  }

  function removeAssetClass(index) {
    const classes = selectedClasses();
    classes.splice(index, 1);
    if (classes.length === 0) {
      goto('/screener/');
    } else {
      goto(`/screener/results?classes=${encodeURIComponent(JSON.stringify(classes))}`);
    }
  }
</script>

<svelte:head>
  <title>Screener Results — Global Energy Monitor</title>
  <meta name="description" content="View companies with ownership exposure to selected asset classes and add them to your investigation." />
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Header -->
    <header class="screener-header">
      <div class="header-left">
        <h1>Asset-Class Screener</h1>
        <p class="subtitle">
          Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting
          asset-classes below, or building your own query.
        </p>
      </div>

      <!-- Selected asset-classes panel -->
      <aside class="selected-classes">
        <button class="panel-toggle"> ▼ View selected asset-classes </button>
        <div class="panel-content">
          {#each selectedClasses() as cls, i}
            <div class="selected-class">
              <span class="class-name">{cls.description || classDescription()}</span>
              <button class="remove-btn" onclick={() => removeAssetClass(i)}>Remove</button>
            </div>
          {:else}
            <p class="no-selection">No asset classes selected</p>
          {/each}
          <a href="/screener/" class="add-link">Add/change asset classes</a>
        </div>
      </aside>
    </header>

    <LoadingWrapper {loading} {error} loadingMessage="Finding owners...">
      <!-- Results section -->
      <section class="results-section">
        <div class="results-header">
          <div class="results-title-row">
            <h2>Owner Search Results</h2>
            <DataSourceBadge source={dataSource} queryTime={queryTime} />
          </div>
          <span class="result-count">
            {filteredOwners().length} of {owners.length} owners
          </span>
        </div>

        <!-- Search and filter toolbar -->
        <div class="search-toolbar">
          <div class="search-input-wrapper">
            <input
              type="text"
              class="search-input"
              placeholder="Search for companies on your watchlist..."
              bind:value={searchQuery}
            />
            {#if searchQuery}
              <button class="clear-search" onclick={() => (searchQuery = '')}>×</button>
            {/if}
          </div>

          <div class="toolbar-actions">
            <label class="filter-toggle">
              <input type="checkbox" bind:checked={showOnlyInvestigation} />
              <span>Only show entities in my investigation ({investigationEntities.length})</span>
            </label>

            {#if filteredOwners().length > 0}
              <button class="add-all-btn" onclick={addAllToInvestigation}>
                + Add all {filteredOwners().length} to investigation
              </button>
            {/if}
          </div>
        </div>

        <!-- Investigation cart summary -->
        {#if investigationEntities.length > 0}
          <div class="investigation-summary">
            <strong>Investigation Cart:</strong>
            {investigationEntities.length} entities selected
            <a href="/report/" class="report-link">→ Generate Report</a>
          </div>
        {/if}

        <div class="results-box">
          <!-- Unmatched notice -->
          {#if unmatchedCount > 0}
            <div class="unmatched-notice">
              <strong>Unmatched Owners:</strong>
              {unmatchedCount} from your search didn't find matches,
              <button class="link-btn" onclick={() => (showUnmatched = !showUnmatched)}>
                {showUnmatched ? 'hide list' : 'view list'}.
              </button>
            </div>
          {/if}

          <!-- Matched owners intro -->
          <div class="matched-intro">
            <strong>Matched Owners:</strong> Click any company name to explore ownership chains and intermediaries
          </div>

          <!-- Results table -->
          <table class="results-table">
            <thead>
              <tr>
                <th class="col-select"></th>
                <th class="col-company">Company name:</th>
                <th class="col-total">Total Portfolio:</th>
                <th class="col-filtered">Exposure to {classDescription()}:</th>
              </tr>
            </thead>
            <tbody>
              {#each filteredOwners() as owner (owner.entityId || owner.name)}
                {@const inInvestigation = isInInvestigation(owner.entityId)}
                <tr class:in-investigation={inInvestigation}>
                  <td class="col-select">
                    <button
                      class="select-btn"
                      class:selected={inInvestigation}
                      onclick={() => toggleInvestigation(owner)}
                      title={inInvestigation ? 'Remove from investigation' : 'Add to investigation'}
                    >
                      {inInvestigation ? '✓' : '+'}
                    </button>
                  </td>
                  <td class="col-company">
                    <a href={entityLink(owner.entityId)} class="company-link">
                      {owner.name}
                    </a>
                  </td>
                  <td class="col-total">
                    {describeTotal(owner.totalAssets)}
                  </td>
                  <td class="col-filtered">
                    {describeFiltered(owner.filteredAssets, classDescription())}
                  </td>
                </tr>
              {:else}
                <tr>
                  <td colspan="4" class="empty-row">
                    {#if searchQuery}
                      No owners matching "{searchQuery}" found.
                      <button class="link-btn" onclick={() => (searchQuery = '')}
                        >Clear search</button
                      >
                    {:else if showOnlyInvestigation}
                      No entities in your investigation match this asset class.
                      <button class="link-btn" onclick={() => (showOnlyInvestigation = false)}
                        >Show all</button
                      >
                    {:else}
                      No owners found for this asset class.
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </LoadingWrapper>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: #f5f3ef;
  }

  .screener-layout {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    margin-bottom: var(--space-8);
  }

  .header-left {
    flex: 1;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 400;
    margin: 0 0 var(--space-3);
    color: #1d4961;
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: #4a5568;
    margin: 0;
    font-size: var(--font-size-md);
    line-height: 1.6;
    max-width: 500px;
  }

  /* Selected classes panel */
  .selected-classes {
    background: #e8f4f4;
    border-radius: var(--radius-md);
    padding: var(--space-4);
    min-width: 280px;
    max-width: 320px;
  }

  .panel-toggle {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    font-weight: 600;
    font-size: var(--font-size-md);
    color: #1d4961;
    cursor: pointer;
    margin-bottom: var(--space-3);
  }

  .panel-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .selected-class {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
  }

  .class-name {
    font-size: var(--font-size-sm);
    color: #2d3748;
  }

  .remove-btn {
    padding: 2px 8px;
    font-size: 11px;
    background: white;
    border: 1px solid #cbd5e0;
    border-radius: 3px;
    cursor: pointer;
    color: #4a5568;
  }

  .remove-btn:hover {
    background: #f7fafc;
  }

  .no-selection {
    font-size: var(--font-size-sm);
    color: #718096;
    margin: 0;
  }

  .add-link {
    display: inline-block;
    padding: var(--space-2) var(--space-3);
    background: white;
    border: 1px solid #cbd5e0;
    border-radius: var(--radius-sm);
    text-decoration: none;
    font-size: var(--font-size-sm);
    color: #2d3748;
    text-align: center;
  }

  .add-link:hover {
    background: #f7fafc;
  }

  /* Results section */
  .results-section {
    margin-top: var(--space-6);
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-4);
  }

  .results-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  h2 {
    font-size: 1.5rem;
    font-weight: 400;
    color: #1d4961;
    margin: 0;
  }

  .result-count {
    font-size: var(--font-size-sm);
    color: #718096;
  }

  /* Search toolbar */
  .search-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    padding: var(--space-4);
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-md);
  }

  .search-input-wrapper {
    position: relative;
    flex: 1;
    min-width: 250px;
  }

  .search-input {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    padding-right: 36px;
    font-size: var(--font-size-sm);
    border: 1px solid #cbd5e0;
    border-radius: var(--radius-sm);
  }

  .search-input:focus {
    outline: none;
    border-color: #1d4961;
    box-shadow: 0 0 0 2px rgba(29, 73, 97, 0.1);
  }

  .clear-search {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 18px;
    color: #a0aec0;
    cursor: pointer;
    padding: 4px;
  }

  .clear-search:hover {
    color: #4a5568;
  }

  .toolbar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: #4a5568;
    cursor: pointer;
  }

  .filter-toggle input {
    accent-color: #1d4961;
  }

  .add-all-btn {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    background: #1d4961;
    color: white;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }

  .add-all-btn:hover {
    background: #2d5a75;
  }

  /* Investigation summary */
  .investigation-summary {
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    background: linear-gradient(135deg, #e6fffa 0%, #b2f5ea 100%);
    border: 1px solid #38b2ac;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    color: #234e52;
  }

  .report-link {
    margin-left: var(--space-4);
    color: #1d4961;
    font-weight: 600;
    text-decoration: none;
  }

  .report-link:hover {
    text-decoration: underline;
  }

  /* Select column */
  .col-select {
    width: 40px;
    text-align: center;
  }

  .select-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #cbd5e0;
    background: white;
    color: #a0aec0;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .select-btn:hover {
    border-color: #1d4961;
    color: #1d4961;
  }

  .select-btn.selected {
    background: #1d4961;
    border-color: #1d4961;
    color: white;
  }

  tr.in-investigation {
    background: rgba(29, 73, 97, 0.04);
  }

  .country-hint {
    display: block;
    font-size: 11px;
    color: #a0aec0;
    margin-top: 2px;
  }

  .results-box {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-md);
    padding: var(--space-5);
  }

  .unmatched-notice {
    padding: var(--space-3);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    color: #4a5568;
  }

  .unmatched-notice strong {
    color: #1d4961;
  }

  .link-btn {
    background: none;
    border: none;
    color: #1d4961;
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }

  .matched-intro {
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    color: #4a5568;
  }

  .matched-intro strong {
    color: #1d4961;
  }

  /* Results table */
  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-3);
    color: #1d4961;
    font-weight: 600;
    border-bottom: 2px solid #e2e8f0;
  }

  .results-table td {
    padding: var(--space-4) var(--space-3);
    vertical-align: top;
    border-bottom: 1px solid #edf2f7;
    color: #4a5568;
    line-height: 1.5;
  }

  .results-table tr:hover td {
    background: #f7fafc;
  }

  .col-company {
    width: 22%;
  }

  .col-total {
    width: 35%;
  }

  .col-filtered {
    width: 35%;
  }

  .company-link {
    color: #1d4961;
    text-decoration: none;
    font-weight: 500;
  }

  .company-link:hover {
    text-decoration: underline;
  }

  .empty-row {
    text-align: center;
    color: #a0aec0;
    padding: var(--space-8) !important;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
    }

    .selected-classes {
      width: 100%;
      max-width: none;
    }

    h1 {
      font-size: 1.75rem;
    }

    .results-table {
      font-size: 13px;
    }

    .col-company {
      width: 30%;
    }

    .col-total,
    .col-filtered {
      width: 35%;
    }
  }
</style>
