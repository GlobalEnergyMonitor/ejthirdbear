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
  import ScreenerLayout from '$lib/components/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/AssetClassesPanel.svelte';
  import { entityLink } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';

  // URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse selected owner IDs (comma-separated entity IDs)
  const selectedOwnerIds = $derived(() => {
    if (!ownersParam) return [];
    return ownersParam.split(',').filter(id => id.trim());
  });

  // Mode: 'all' = show all owners, 'filtered' = show only selected owners
  const viewMode = $derived(selectedOwnerIds().length > 0 ? 'filtered' : 'all');

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
  /** @type {'motherduck' | 'local'} */
  let dataSource = $state('motherduck');
  let queryTime = $state(null);
  let executedQuery = $state('');
  let availableAssetTypes = $state([]);

  // Search/filter for journalists with watchlists
  let searchQuery = $state('');
  let showOnlyInvestigation = $state(false);

  // Investigation cart state (reactive)
  let cartItems = $state([]);
  investigationCart.subscribe((items) => {
    cartItems = items;
  });

  // Get just entities from cart
  const investigationEntities = $derived(cartItems.filter((item) => item.type === 'entity'));

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
      result = result.filter((o) => isInInvestigation(o.entityId));
    }

    return result;
  });

  // Check if entity is in investigation
  function isInInvestigation(entityId) {
    // Entity IDs need E prefix for the cart
    const cartId = entityId?.startsWith('E') ? entityId : `E${entityId}`;
    return cartItems.some((item) => item.id === cartId);
  }

  // Toggle entity in investigation
  function toggleInvestigation(owner) {
    // Entity IDs need E prefix for the cart
    const cartId = owner.entityId?.startsWith('E') ? owner.entityId : `E${owner.entityId}`;
    investigationCart.toggle({
      id: cartId,
      name: owner.name,
      type: 'entity',
    });
  }

  // Add all visible results to investigation
  function addAllToInvestigation() {
    const toAdd = filteredOwners()
      .filter((o) => o.entityId && !isInInvestigation(o.entityId))
      .map((o) => ({
        id: o.entityId?.startsWith('E') ? o.entityId : `E${o.entityId}`,
        name: o.name,
        type: /** @type {const} */ ('entity'),
      }));
    investigationCart.addMany(toAdd);
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

      // Use unified query layer (MotherDuck with automatic table mapping)
      const { unifiedQuery } = await import('$lib/data/unified-query');

      const cls = classes[0];
      const trackerVal = cls?.tracker;
      const statusVal = cls?.filters?.status;
      const ownerIds = selectedOwnerIds();
      const hasOwnerFilter = ownerIds.length > 0;

      const queryStartTime = performance.now();

      // Map UI tracker names to MotherDuck "Asset Type" values
      const trackerToAssetType = {
        'Steel Plant': 'Iron & Steel Plant',
        'Coal Plant': 'Coal Plant',
        'Gas Pipeline': 'Natural Gas Transmission Pipeline',
        'Oil & NGL Pipeline': 'Oil or NGL Pipeline',
        'Coal Mine': 'Coal Mine',
        'Iron Mine': 'Iron Ore Mine',
        'Cement Plant': 'Cement or Concrete Plant',
      };
      const assetTypeVal = trackerVal ? (trackerToAssetType[trackerVal] || trackerVal) : null;

      // Build filter clauses
      // MotherDuck columns: "Immediate Owner Entity Name", "Immediate Owner Entity ID", "Asset Type", "Asset ID"
      const trackerClause = assetTypeVal
        ? `AND "Asset Type" = '${assetTypeVal.replace(/'/g, "''")}'`
        : '';
      const ownerClause = hasOwnerFilter
        ? `AND "Immediate Owner Entity ID" IN (${ownerIds.map(id => `'${id.replace(/'/g, "''")}'`).join(', ')})`
        : '';

      // Debug: Check what Asset Types exist
      try {
        const debugResult = await unifiedQuery(`
          SELECT DISTINCT "Asset Type" as asset_type, COUNT(*) as cnt
          FROM ownership
          GROUP BY "Asset Type"
          ORDER BY cnt DESC
          LIMIT 20
        `);
        console.log('Available Asset Types:', debugResult.data);
        availableAssetTypes = debugResult.data || [];
      } catch (debugErr) {
        console.warn('Debug query failed:', debugErr);
      }

      const sql = `
        WITH owner_totals AS (
          SELECT
            "Immediate Owner Entity Name" as name,
            "Immediate Owner Entity ID" as entity_id,
            COUNT(DISTINCT "Asset ID") as total_assets
          FROM ownership
          WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
            ${ownerClause}
          GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
        ),
        owner_filtered AS (
          SELECT
            "Immediate Owner Entity Name" as name,
            "Immediate Owner Entity ID" as entity_id,
            COUNT(DISTINCT "Asset ID") as filtered_assets
          FROM ownership
          WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
            ${ownerClause}
            ${trackerClause}
          GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
        )
        SELECT
          t.name,
          t.entity_id,
          t.total_assets,
          COALESCE(f.filtered_assets, 0) as filtered_assets
        FROM owner_totals t
        LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
        WHERE f.filtered_assets > 0 OR ${hasOwnerFilter ? 'TRUE' : 'FALSE'}
        ORDER BY f.filtered_assets DESC, t.total_assets DESC
        LIMIT 200
      `;

      executedQuery = sql.trim();
      const result = await unifiedQuery(sql);
      queryTime = performance.now() - queryStartTime;
      dataSource = /** @type {'motherduck' | 'local'} */ (result.source || 'motherduck');

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
  <meta
    name="description"
    content="View companies with ownership exposure to selected asset classes and add them to your investigation."
  />
</svelte:head>

<ScreenerLayout
  currentStep={3}
  showStepNav={false}
  subtitle={viewMode === 'filtered'
    ? `Showing ${selectedOwnerIds().length} selected companies and their exposure to ${classDescription()}.`
    : `Showing all companies with ownership stakes in ${classDescription()}.`}
  {classesParam}
  maxWidth="wide"
>
  {#snippet headerRight()}
    <AssetClassesPanel
      {classesParam}
      onRemove={(cls) => removeAssetClass(selectedClasses().findIndex((c) => c.name === cls.name))}
    />
  {/snippet}

  <!-- Active filters summary -->
  <section class="filters-summary">
    <h3>Active Filters</h3>
    <div class="filter-tags">
      {#each selectedClasses() as cls}
        <div class="filter-tag asset-class">
          <span class="tag-label">Asset:</span>
          <span class="tag-value">{cls.tracker || cls.name}</span>
        </div>
        {#if cls.filters?.status}
          <div class="filter-tag status">
            <span class="tag-label">Status:</span>
            <span class="tag-value">{cls.filters.status}</span>
          </div>
        {/if}
        {#if cls.filters?.geography}
          <div class="filter-tag geography">
            <span class="tag-label">Country:</span>
            <span class="tag-value">{cls.filters.geography}</span>
          </div>
        {/if}
      {/each}
      {#if viewMode === 'filtered'}
        <div class="filter-tag owners">
          <span class="tag-label">Owners:</span>
          <span class="tag-value">{selectedOwnerIds().length} selected</span>
        </div>
      {/if}
    </div>
    <a href="/screener/" class="edit-filters-link">← Edit filters</a>
  </section>

  <LoadingWrapper {loading} {error} loadingMessage="Finding owners...">
    <!-- Results section -->
    <section class="results-section">
      <div class="results-header">
        <div class="results-title-row">
          <h2>{viewMode === 'filtered' ? 'Selected Companies' : 'All Owners'}</h2>
          <DataSourceBadge source={dataSource} {queryTime} />
        </div>
        <span class="result-count">
          {#if viewMode === 'filtered'}
            {owners.length} of {selectedOwnerIds().length} selected found
          {:else}
            {filteredOwners().length} of {owners.length} owners
          {/if}
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

          {#if cartItems.length > 0}
            <button class="clear-cart-btn" onclick={() => investigationCart.clear()}>
              Clear cart ({cartItems.length})
            </button>
          {/if}

          {#if filteredOwners().length > 0}
            <button class="add-all-btn" onclick={addAllToInvestigation}>
              + Add all {filteredOwners().length} to investigation
            </button>
          {/if}
        </div>
      </div>

      <!-- Investigation cart summary -->
      {#if cartItems.length > 0}
        <div class="investigation-summary">
          <strong>Investigation Cart:</strong>
          {cartItems.length} items selected ({investigationEntities.length} entities)
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
                    <button class="link-btn" onclick={() => (searchQuery = '')}>Clear search</button
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

  <!-- Debug panel -->
  {#if executedQuery}
    <details class="debug-panel">
      <summary class="debug-summary">
        <span class="debug-icon">⚙</span>
        Query Debug
        {#if queryTime}
          <span class="debug-time">({queryTime.toFixed(0)}ms)</span>
        {/if}
      </summary>
      <div class="debug-content">
        <div class="debug-meta">
          <span class="debug-label">View mode:</span>
          <span class="debug-value">{viewMode} ({viewMode === 'filtered' ? selectedOwnerIds().length + ' owners selected' : 'showing all'})</span>
        </div>
        <div class="debug-meta">
          <span class="debug-label">Asset Type filter:</span>
          <span class="debug-value">{selectedClasses()[0]?.tracker || 'none'} → {(() => {
            const t = selectedClasses()[0]?.tracker;
            const map = {'Steel Plant': 'Iron & Steel Plant', 'Gas Pipeline': 'Natural Gas Transmission Pipeline', 'Oil & NGL Pipeline': 'Oil or NGL Pipeline', 'Iron Mine': 'Iron Ore Mine', 'Cement Plant': 'Cement or Concrete Plant'};
            return t ? (map[t] || t) : 'none';
          })()}</span>
        </div>
        <div class="debug-meta">
          <span class="debug-label">Data source:</span>
          <span class="debug-value">{dataSource}</span>
        </div>
        <div class="debug-meta">
          <span class="debug-label">Results:</span>
          <span class="debug-value">{owners.length} owners returned</span>
        </div>
        {#if availableAssetTypes.length > 0}
          <div class="debug-asset-types">
            <span class="debug-label">Available Trackers in DB:</span>
            <div class="asset-type-list">
              {#each availableAssetTypes as at}
                <span class="asset-type-item" class:match={at.asset_type === selectedClasses()[0]?.tracker}>
                  {at.asset_type || '(empty)'} ({at.cnt})
                </span>
              {/each}
            </div>
          </div>
        {/if}
        <div class="debug-sql">
          <div class="debug-sql-header">
            <span class="debug-label">SQL Query:</span>
            <button class="copy-btn" onclick={() => navigator.clipboard.writeText(executedQuery)}>
              Copy
            </button>
          </div>
          <pre class="debug-code">{executedQuery}</pre>
        </div>
      </div>
    </details>
  {/if}
</ScreenerLayout>

<style>
  /* Filters summary */
  .filters-summary {
    padding: var(--space-4) var(--space-5);
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-6);
  }

  .filters-summary h3 {
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-3) 0;
  }

  .filter-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }

  .filter-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
  }

  .filter-tag.asset-class {
    border-color: var(--gem-teal);
    background: var(--gem-teal-light, #e8f4f4);
  }

  .filter-tag.status {
    border-color: var(--color-accent);
  }

  .filter-tag.geography {
    border-color: #6b7280;
  }

  .filter-tag.owners {
    border-color: var(--gem-primary-blue);
    background: #e8f0f4;
  }

  .tag-label {
    color: var(--color-text-tertiary);
    font-weight: 500;
  }

  .tag-value {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .edit-filters-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .edit-filters-link:hover {
    color: var(--color-text-primary);
  }

  /* Results section */
  .results-section {
    margin-top: var(--space-6);
  }

  .results-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-4);
    align-items: baseline;
    margin-bottom: var(--space-4);
  }

  .results-title-row {
    display: grid;
    grid-template-columns: auto auto;
    gap: var(--space-3);
    align-items: center;
    min-width: 0;
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

  /* Search toolbar - grid layout */
  .search-toolbar {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
    padding: var(--space-4);
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-md);
  }

  .search-input-wrapper {
    position: relative;
    min-width: 0;
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
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-4);
    align-items: center;
  }

  .filter-toggle {
    display: grid;
    grid-template-columns: auto auto;
    gap: var(--space-2);
    align-items: center;
    font-size: var(--font-size-sm);
    color: #4a5568;
    cursor: pointer;
    white-space: nowrap;
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

  .clear-cart-btn {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    background: white;
    color: #c53030;
    border: 1px solid #c53030;
    border-radius: var(--radius-sm);
    cursor: pointer;
    white-space: nowrap;
  }

  .clear-cart-btn:hover {
    background: #fff5f5;
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
    .results-header {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .search-toolbar {
      grid-template-columns: 1fr;
    }

    .toolbar-actions {
      grid-auto-flow: row;
      grid-template-columns: repeat(2, 1fr);
      justify-items: start;
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

  /* Debug panel */
  .debug-panel {
    margin-top: var(--space-12);
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-4);
  }

  .debug-summary {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: var(--space-2);
    align-items: center;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding: var(--space-2) 0;
    list-style: none;
  }

  .debug-summary::-webkit-details-marker {
    display: none;
  }

  .debug-summary::before {
    content: '▶';
    font-size: 10px;
    transition: transform 0.2s ease;
  }

  .debug-panel[open] .debug-summary::before {
    transform: rotate(90deg);
  }

  .debug-icon {
    font-size: var(--font-size-body);
  }

  .debug-time {
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
  }

  .debug-content {
    margin-top: var(--space-4);
    padding: var(--space-4);
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .debug-meta {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .debug-label {
    color: var(--color-text-tertiary);
    font-weight: 500;
  }

  .debug-value {
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
  }

  .debug-sql {
    margin-top: var(--space-4);
  }

  .debug-sql-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-2);
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .copy-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    background: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .copy-btn:hover {
    background: var(--color-gray-100);
  }

  .debug-code {
    margin: 0;
    padding: var(--space-4);
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    line-height: 1.5;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .debug-asset-types {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .asset-type-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .asset-type-item {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-text-secondary);
  }

  .asset-type-item.match {
    background: var(--gem-teal);
    color: white;
    font-weight: 600;
  }
</style>
