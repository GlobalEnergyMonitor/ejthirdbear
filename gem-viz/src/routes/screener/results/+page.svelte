<script lang="ts">
  /**
   * ASSET-CLASS SCREENER - Results
   *
   * Shows OWNERS who have ownership stakes in selected asset classes.
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
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import ScreenerOwnersResultsTable from '$lib/components/screener/ScreenerOwnersResultsTable.svelte';
  import { investigationCart } from '$lib/investigationCart';
  import { getAssetTypeForTracker } from '$lib/data-config/tracker-schema';
  import {
    getOwnersByAssetType,
    getAssetTypeCounts,
    getQueryLogs,
    type ScreenerFilters,
  } from '$lib/data-config/screener-api';
  import { buildScreenerUrl, parseJsonSearchParam } from '$lib/screener-url';

  type ScreenerSelectedClass = {
    id?: string;
    assetClassId?: string;
    name?: string;
    description?: string;
    tracker?: string;
    filters?: {
      status?: string;
      statuses?: string[];
      geography?: string;
    };
    selectedSubClasses?: string[];
    [key: string]: unknown;
  };

  // URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse selected owner IDs (comma-separated entity IDs)
  const selectedOwnerIds = $derived.by(() => {
    if (!ownersParam) return [];
    return ownersParam.split(',').filter((id) => id.trim());
  });

  // Mode: 'all' = show all owners, 'filtered' = show only selected owners
  const viewMode = $derived(selectedOwnerIds.length > 0 ? 'filtered' : 'all');

  // Parse selected classes
  const selectedClasses = $derived.by((): ScreenerSelectedClass[] => {
    if (!classesParam) return [];
    try {
      const parsed = parseJsonSearchParam<ScreenerSelectedClass[]>(classesParam);
      return parsed || [];
    } catch {
      return [];
    }
  });

  // Derive chart props from selected class
  const chartAssetClassName = $derived(
    selectedClasses.length > 0 ? selectedClasses[0]?.tracker || selectedClasses[0]?.name || '' : ''
  );
  const chartTrackerSlug = $derived(selectedClasses.length > 0 ? selectedClasses[0]?.id || '' : '');

  // Derive parse error separately (no state mutation inside $derived)
  const parseError = $derived.by(() => {
    if (!classesParam) return null;
    try {
      const parsed = parseJsonSearchParam<ScreenerSelectedClass[]>(classesParam);
      if (parsed) return null;
      return 'Invalid asset class data in URL. Please go back and re-select.';
    } catch {
      return 'Could not read asset class from URL. Please go back and re-select.';
    }
  });

  // Build human-readable description of selected class
  const classDescription = $derived.by(() => {
    if (selectedClasses.length === 0) return 'selected assets';

    const cls = selectedClasses[0];
    const trackerName = cls.tracker || cls.name || 'assets';
    const parts: string[] = [];

    // Only show status prefix when a small number are selected (1-3)
    const statuses: string[] =
      cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);
    if (statuses.length === 1) {
      parts.push(statuses[0]);
    } else if (statuses.length > 1 && statuses.length <= 3) {
      parts.push(statuses.join('/'));
    }
    // 4+ statuses: skip status prefix (too noisy in "Ownership in N ..." text)

    parts.push(trackerName);

    if (cls.filters?.geography) {
      parts.push(`in ${cls.filters.geography}`);
    }

    return parts.join(' ');
  });

  // State
  let loading = $state(true);
  let error = $state(null);
  let owners = $state([]);

  // Data source tracking
  let dataSource = $state<'none' | 'local' | 'api' | 'server'>('api');
  let queryTime = $state(null);
  let executedQuery = $state('');
  let availableAssetTypes = $state([]);

  // Search/filter for journalists with watchlists
  let searchQuery = $state('');
  // Expanded row state - tracks which owner's ownership tree is visible
  let expandedOwnerId = $state<string | null>(null);

  function toggleExpanded(ownerId: string) {
    expandedOwnerId = expandedOwnerId === ownerId ? null : ownerId;
  }

  // Investigation cart state (reactive via auto-subscribe)
  let cartItems = $derived($investigationCart);

  // Get just entities from cart
  const investigationEntities = $derived(cartItems.filter((item) => item.type === 'entity'));

  // Owners to pass into Step 4 (prefer explicit Step 2 selection, then cart entities)
  const visualizeOwnerIds = $derived.by(() => {
    if (selectedOwnerIds.length > 0) return selectedOwnerIds;
    return investigationEntities
      .map((item) => String(item.id || '').trim())
      .filter((id) => id.length > 0);
  });

  const visualizeUrl = $derived.by(() =>
    buildScreenerUrl('screener/visualize', {
      classes: classesParam || undefined,
      owners: visualizeOwnerIds.length > 0 ? visualizeOwnerIds.join(',') : undefined,
    })
  );

  // Filtered owners based on search
  const filteredOwners = $derived.by(() => {
    let result = owners;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((o) => o.name.toLowerCase().includes(query));
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
    const toAdd = filteredOwners
      .filter((o) => o.entityId && !isInInvestigation(o.entityId))
      .map((o) => ({
        id: o.entityId?.startsWith('E') ? o.entityId : `E${o.entityId}`,
        name: o.name,
        type: 'entity' as const,
      }));
    investigationCart.addMany(toAdd);
  }

  // Load owners data using centralized screener API
  onMount(async () => {
    try {
      const classes = selectedClasses;
      if (classes.length === 0) {
        error = 'No asset class selected. Go back and select one.';
        loading = false;
        return;
      }

      const cls = classes[0];

      // Build filters for the screener API
      // Prefer statuses[] array for multi-status filtering; fall back to singular status
      const statusesArray: string[] | undefined = cls?.filters?.statuses;
      const filters: ScreenerFilters = {
        tracker: cls?.tracker || '',
        status: cls?.filters?.status,
        statuses: statusesArray && statusesArray.length > 0 ? statusesArray : undefined,
        country: cls?.filters?.geography,
        ownerIds: selectedOwnerIds.length > 0 ? selectedOwnerIds : undefined,
        assetClassId: cls?.assetClassId || cls?.id,
        selectedSubClasses: Array.isArray(cls?.selectedSubClasses)
          ? cls.selectedSubClasses
          : undefined,
      };

      // Fetch asset type counts via REST API (cached, for debug panel)
      getAssetTypeCounts().then((counts) => {
        availableAssetTypes = Object.entries(counts).map(([asset_type, cnt]) => ({
          asset_type,
          cnt,
        }));
      });

      // Main query: get owners by asset type
      const result = await getOwnersByAssetType(filters, { limit: 200 });

      queryTime = result.queryTimeMs;
      dataSource =
        result.source === 'rest-api' ? 'api' : result.source === 'cache' ? 'local' : 'api';
      executedQuery = `[Centralized API] source=${result.source}, filters=${JSON.stringify(filters)}`;

      owners = result.owners.map((o) => ({
        name: o.name,
        entityId: o.entityId,
        totalAssets: o.totalAssets,
        filteredAssets: o.filteredAssets,
      }));

      loading = false;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load owners:', err);
      error = err?.message || 'Failed to load data';
      loading = false;

      if (import.meta.env.DEV) console.log('Query logs:', getQueryLogs());
    }
  });

  function removeAssetClass(index) {
    if (index < 0) return;
    const classes = selectedClasses.filter((_, i) => i !== index);
    if (classes.length === 0) {
      goto(buildScreenerUrl('screener'));
    } else {
      goto(buildScreenerUrl('screener/results', { classes: JSON.stringify(classes) }));
    }
  }
</script>

<svelte:head>
  <title>Screener Results — Global Energy Monitor</title>
  <meta
    name="description"
    content="View companies with ownership stakes in selected asset classes and add them to your investigation."
  />
</svelte:head>

<ScreenerLayout
  currentStep={3}
  subtitle={viewMode === 'filtered'
    ? `Showing ${selectedOwnerIds.length} selected companies and their ownership in ${classDescription}.`
    : `Showing all companies with ownership stakes in ${classDescription}.`}
  {classesParam}
  {ownersParam}
  maxWidth="wide"
>
  {#snippet headerRight()}
    <AssetClassesPanel
      {classesParam}
      onRemove={(cls) =>
        removeAssetClass(
          selectedClasses.findIndex(
            (c) => (c.id || c.assetClassId || c.name) === (cls.id || cls.assetClassId || cls.name)
          )
        )}
    />
  {/snippet}

  <!-- Active filters summary -->
  <section class="filters-summary">
    <h3>Active Filters</h3>
    <div class="filter-tags">
      {#each selectedClasses as cls}
        <div class="filter-tag asset-class">
          <span class="tag-label">Asset:</span>
          <span class="tag-value">{cls.tracker || cls.name}</span>
        </div>
        {#if cls.filters?.statuses?.length > 0}
          <div class="filter-tag status">
            <span class="tag-label">Status:</span>
            <span class="tag-value">
              {cls.filters.statuses.length <= 3
                ? cls.filters.statuses.join(', ')
                : `${cls.filters.statuses.length} statuses selected`}
            </span>
          </div>
        {:else if cls.filters?.status}
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
          <span class="tag-value">{selectedOwnerIds.length} selected</span>
        </div>
      {/if}
    </div>
    <a href="/screener/" class="edit-filters-link">← Edit filters</a>
  </section>

  {#if parseError}
    <div class="parse-error">
      <p>{parseError}</p>
      <a href="/screener/">← Start over</a>
    </div>
  {/if}

  <LoadingWrapper {loading} {error} loadingMessage="Finding owners...">
    <!-- Results section -->
    <section class="results-section">
      <div class="results-header">
        <div class="results-title-row">
          <h2>{viewMode === 'filtered' ? 'Selected Companies' : 'All Owners'}</h2>
          <DataSourceBadge source={dataSource} {queryTime} />
        </div>
        <div class="results-meta">
          <span class="result-count">
            {#if viewMode === 'filtered'}
              {owners.length} of {selectedOwnerIds.length} selected found
            {:else}
              {filteredOwners.length} of {owners.length} owners
            {/if}
          </span>
          <button
            class="visualize-btn"
            onclick={() => goto(visualizeUrl)}
            disabled={visualizeOwnerIds.length === 0}
            title={visualizeOwnerIds.length === 0
              ? 'Select owners in Step 2 or add entities to investigation first'
              : 'Continue to Step 4 visualization'}
          >
            Visualize →
          </button>
        </div>
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
          {#if cartItems.length > 0}
            <button class="clear-cart-btn" onclick={() => investigationCart.clear()}>
              Clear cart ({cartItems.length})
            </button>
          {/if}

          {#if filteredOwners.length > 0}
            <button class="add-all-btn" onclick={addAllToInvestigation}>
              + Add all {filteredOwners.length} to investigation
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

      <ScreenerOwnersResultsTable
        {filteredOwners}
        {classDescription}
        {searchQuery}
        {expandedOwnerId}
        assetClassName={chartAssetClassName}
        trackerSlug={chartTrackerSlug}
        {isInInvestigation}
        onToggleExpanded={toggleExpanded}
        onToggleInvestigation={toggleInvestigation}
        onClearSearch={() => (searchQuery = '')}
      />
    </section>
  </LoadingWrapper>

  <!-- Debug panel -->
  {#if executedQuery}
    <DebugPanel title="Query Debug" time={queryTime}>
      <div class="debug-meta">
        <span class="debug-label">View mode:</span>
        <span class="debug-value">
          {viewMode} ({viewMode === 'filtered'
            ? selectedOwnerIds.length + ' owners selected'
            : 'showing all'})
        </span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Asset Type:</span>
        <span class="debug-value">
          {selectedClasses[0]?.tracker || 'none'} → {getAssetTypeForTracker(
            selectedClasses[0]?.tracker
          ) || 'none'}
        </span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Statuses:</span>
        <span class="debug-value">
          {selectedClasses[0]?.filters?.statuses?.join(', ') ||
            selectedClasses[0]?.filters?.status ||
            'all'}
        </span>
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
          <span class="debug-label">Available in DB:</span>
          <div class="asset-type-list">
            {#each availableAssetTypes as at}
              <span
                class="asset-type-item"
                class:match={at.asset_type === getAssetTypeForTracker(selectedClasses[0]?.tracker)}
              >
                {at.asset_type || '(empty)'} ({at.cnt})
              </span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="debug-sql">
        <div class="debug-sql-header">
          <span class="debug-label">API Query:</span>
          <button class="copy-btn" onclick={() => navigator.clipboard.writeText(executedQuery)}
            >Copy</button
          >
        </div>
        <pre class="debug-code">{executedQuery}</pre>
      </div>
    </DebugPanel>
  {/if}
</ScreenerLayout>

<style>
  /* Parse error */
  .parse-error {
    padding: var(--space-4) var(--space-5);
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: var(--radius-sm);
    color: #9a3412;
    margin-bottom: var(--space-6);
  }

  .parse-error p {
    margin: 0 0 var(--space-2) 0;
    font-weight: 500;
  }

  .parse-error a {
    color: #1d4961;
    font-size: var(--font-size-sm);
  }

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

  .results-meta {
    display: grid;
    justify-items: end;
    gap: var(--space-2);
  }

  .visualize-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    border: none;
    border-radius: var(--radius-sm);
    background: #1d4961;
    color: white;
    cursor: pointer;
    white-space: nowrap;
  }

  .visualize-btn:hover:not(:disabled) {
    background: #2d5a75;
  }

  .visualize-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
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

  /* Responsive */
  @media (max-width: 768px) {
    .results-header {
      grid-template-columns: 1fr;
      gap: var(--space-2);
    }

    .results-meta {
      justify-items: start;
    }

    .search-toolbar {
      grid-template-columns: 1fr;
    }

    .toolbar-actions {
      grid-auto-flow: row;
      grid-template-columns: repeat(2, 1fr);
      justify-items: start;
    }
  }

  /* Page-specific debug styles */
  .debug-sql {
    margin-top: var(--space-4);
  }

  .debug-sql-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
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
