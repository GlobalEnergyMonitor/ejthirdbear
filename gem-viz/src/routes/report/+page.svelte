<script lang="ts">
  /**
   * INVESTIGATION REPORT PAGE
   * Shows co-ownership patterns for items in the investigation cart.
   */

  import { onMount } from 'svelte';
  import { investigationCart } from '$lib/investigationCart';
  import { link, assetLink, entityLink } from '$lib/links';
  import Citation from '$lib/components/data/Citation.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import EntityMicroCard from '$lib/components/cards/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/cards/AssetMicroCard.svelte';
  import DataTable from '$lib/components/table/DataTable.svelte';
  import ReportLoadingTerminal from '$lib/components/feedback/ReportLoadingTerminal.svelte';
  import { OwnershipTreeGraph } from '$lib/components/ownership';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import {
    queryEntityPortfolios,
    fetchOwnershipGraphs,
    querySharedAssets,
    queryCommonOwners,
    queryGeoBreakdown,
    queryTrackerBreakdown,
    querySummary,
    defaultLoadingSteps,
    type ReportSummary,
    type OwnershipGraph,
  } from './report-queries';

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sharedAssets = $state<any[]>([]);
  let commonOwners = $state<any[]>([]);
  let geoBreakdown = $state<any[]>([]);
  let entityPortfolios = $state<any[]>([]);
  let trackerBreakdown = $state<any[]>([]);
  let summary = $state<ReportSummary>({
    totalAssets: 0,
    totalCapacity: 0,
    countries: 0,
    trackers: [],
    totalOwners: 0,
  });
  let queryTime = $state(0);
  let debugLogs = $state<string[]>([]);

  // Ownership graph data for entities
  let entityOwnershipGraphs = $state<Map<string, OwnershipGraph>>(new Map());
  let selectedEntityForGraph = $state<string | null>(null);

  // Loading progress state
  type QueryStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  type QueryStep = {
    id: string;
    label: string;
    status: QueryStatus;
    rows?: number;
    ms?: number;
  };

  let loadingSteps = $state<QueryStep[]>([...defaultLoadingSteps]);

  let loadingStartTime = $state(0);
  let loadingElapsed = $state(0);
  let loadingInterval: ReturnType<typeof setInterval> | null = null;

  function updateStep(id: string, update: Partial<QueryStep>) {
    loadingSteps = loadingSteps.map((s) => (s.id === id ? { ...s, ...update } : s));
  }

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const entityIds = $derived(cartItems.filter((i) => i.type === 'entity').map((i) => i.id));
  const assetIds = $derived(cartItems.filter((i) => i.type === 'asset').map((i) => i.id));
  const hasEntities = $derived(entityIds.length > 0);
  const hasAssets = $derived(assetIds.length > 0);
  const isEmpty = $derived(cartItems.length === 0);

  // Report date
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  function log(msg: string) {
    debugLogs = [...debugLogs, `${new Date().toISOString().slice(11, 19)} ${msg}`];
    if (import.meta.env.DEV) console.log('[report]', msg);
  }

  // Wrap a query with timing and step updates
  async function runStep<T>(
    stepId: string,
    queryFn: () => Promise<T>,
    skip = false
  ): Promise<T | null> {
    if (skip) {
      updateStep(stepId, { status: 'skipped' });
      return null;
    }
    updateStep(stepId, { status: 'running' });
    const start = Date.now();
    try {
      const result = await queryFn();
      const ms = Date.now() - start;
      const rows = Array.isArray(result) ? result.length : 1;
      updateStep(stepId, { status: 'done', rows, ms });
      return result;
    } catch (err) {
      updateStep(stepId, { status: 'error' });
      throw err;
    }
  }

  // Load all report data
  async function loadReport() {
    if (isEmpty) {
      log('Cart is empty');
      loading = false;
      return;
    }

    log(`Loading report for ${cartItems.length} items`);
    loading = true;
    error = null;

    // Reset steps
    loadingSteps = [...defaultLoadingSteps];

    // Start elapsed timer
    loadingStartTime = Date.now();
    loadingElapsed = 0;
    loadingInterval = setInterval(() => {
      loadingElapsed = Date.now() - loadingStartTime;
    }, 50);

    const startTime = Date.now();

    try {
      // Init step
      updateStep('init', { status: 'done', ms: 0 });

      // Run queries sequentially for better loading UX (shows progress)
      const portfolios = await runStep(
        'portfolios',
        () => queryEntityPortfolios(entityIds, log),
        entityIds.length < 1
      );
      const ownershipGraphs = await runStep(
        'ownership',
        () => fetchOwnershipGraphs(entityIds, log),
        entityIds.length < 1
      );
      const shared = await runStep(
        'shared',
        () => querySharedAssets(entityIds, log),
        entityIds.length < 2
      );
      const common = await runStep(
        'owners',
        () => queryCommonOwners(assetIds, log),
        assetIds.length < 1
      );
      const geo = await runStep('geo', () => queryGeoBreakdown(entityIds, assetIds, log));
      const trackers = await runStep('trackers', () =>
        queryTrackerBreakdown(entityIds, assetIds, log)
      );
      const stats = await runStep('summary', () => querySummary(entityIds, assetIds, log));

      entityPortfolios = portfolios || [];
      entityOwnershipGraphs = ownershipGraphs || new Map();
      // Select first entity by default for graph view
      if (entityIds.length > 0) selectedEntityForGraph = entityIds[0];
      sharedAssets = shared || [];
      commonOwners = common || [];
      geoBreakdown = geo || [];
      trackerBreakdown = trackers || [];
      summary = stats || {
        totalAssets: 0,
        totalCapacity: 0,
        countries: 0,
        totalOwners: 0,
        trackers: [],
      };

      queryTime = Date.now() - startTime;
      log(`Report loaded in ${queryTime}ms`);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Report query error:', err);
      error = err instanceof Error ? err.message : 'Failed to generate report';
      log(`Error: ${error}`);
    } finally {
      if (loadingInterval) clearInterval(loadingInterval);
      loading = false;
    }
  }

  // Clear cart
  function clearCart() {
    investigationCart.clear();
  }

  // Export to JSON
  function exportJSON() {
    const data = {
      generated: new Date().toISOString(),
      cart: cartItems,
      summary,
      entityPortfolios,
      sharedAssets,
      commonOwners,
      geoBreakdown,
      trackerBreakdown,
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gem-investigation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Load on mount
  onMount(() => {
    log('Mounted');
    loadReport();
    return () => {
      if (loadingInterval) clearInterval(loadingInterval);
    };
  });

  // Reload when cart changes
  let prevCartLength = 0;
  $effect(() => {
    if (cartItems.length !== prevCartLength) {
      prevCartLength = cartItems.length;
      loadReport();
    }
  });
</script>

<svelte:head>
  <title>Investigation Report — Global Energy Monitor</title>
</svelte:head>

<div class="page report-page">
  <PageHeader
    breadcrumbs={[
      { label: 'Home', href: link('index') },
      { label: 'Explore', href: link('explore') },
      { label: 'Report' },
    ]}
    title="Report"
  >
    <time class="report-date">{reportDate}</time>
  </PageHeader>

  {#if isEmpty}
    <section class="empty-state">
      <h2>No Items in Report</h2>
      <p>Add assets or entities from Compose or Screener to build a report.</p>
      <a href={link('explore')} class="btn">Go to Explore</a>
    </section>
  {:else if loading}
    <ReportLoadingTerminal
      elapsedMs={loadingElapsed}
      cartCount={cartItems.length}
      entityCount={entityIds.length}
      assetCount={assetIds.length}
      steps={loadingSteps}
    />
  {:else if error}
    <section class="error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button class="btn" onclick={loadReport}>Retry</button>
    </section>
  {:else}
    <!-- Toolbar -->
    <aside class="toolbar">
      <span class="meta-datum">Query: {queryTime}ms</span>
      <div class="toolbar-actions">
        <button class="btn-text" onclick={exportJSON}>Export</button>
        <button class="btn-text" onclick={() => window.print()}>Print</button>
        <button class="btn-text danger" onclick={clearCart}>Clear</button>
      </div>
    </aside>

    <!-- ═══════════════════════════════════════════════════════════════════
         SECTION 1: THE SUBJECTS (WHO)
         Who are we investigating?
         ═══════════════════════════════════════════════════════════════════ -->

    {#if hasEntities}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num">1.</span>
          <h2>Subjects</h2>
        </header>
        <p class="section-lede">
          {entityIds.length}
          {entityIds.length === 1 ? 'entity' : 'entities'} under investigation
        </p>

        <div class="entity-grid">
          {#each entityPortfolios as entity}
            <EntityMicroCard
              name={entity.entity_name}
              location={entity.hq_country}
              assetCount={Math.round(Number(entity.asset_count) || 0)}
              totalCapacity={Math.round(Number(entity.total_capacity_mw) || 0)}
              href={entityLink(entity.entity_id)}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- SECTION 2: PORTFOLIO -->
    <section class="report-section">
      <header class="section-head">
        <span class="section-num">2.</span>
        <h2>Portfolio</h2>
      </header>
      <p class="section-lede">
        Combined holdings{#if entityIds.length > 0}
          across {entityIds.length} {entityIds.length === 1 ? 'entity' : 'entities'}{/if}
      </p>

      <!-- Key Figures -->
      <div class="key-figures">
        {#each [[summary.totalAssets.toLocaleString(), 'Assets'], [summary.totalCapacity.toLocaleString(), 'MW'], [summary.trackers.length, 'Types'], [summary.countries, 'Countries']] as [value, label]}
          <div class="kf">
            <span class="kf-value">{value}</span>
            <span class="kf-label">{label}</span>
          </div>
        {/each}
      </div>

      <!-- Asset Type Breakdown -->
      {#if trackerBreakdown.length > 0}
        <h3 class="subsection-head">By Asset Type</h3>
        <DataTable
          data={trackerBreakdown}
          columns={[
            { key: 'tracker', label: 'Type', sortable: true },
            { key: 'asset_count', label: 'Assets', type: 'number', sortable: true },
            { key: 'total_capacity', label: 'Capacity (MW)', type: 'number', sortable: true },
            { key: 'operating', label: 'Operating', type: 'number', sortable: true },
            { key: 'proposed', label: 'Proposed', type: 'number', sortable: true },
          ]}
          showGlobalSearch={false}
          showColumnFilters={false}
          showPagination={false}
          showExport={false}
          showColumnToggle={false}
          stickyHeader={false}
          striped={false}
        />
      {/if}
    </section>

    <!-- SECTION 3: OWNERSHIP STRUCTURE -->
    {#if hasEntities && entityOwnershipGraphs.size > 0}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num">3.</span>
          <h2>Ownership Structure</h2>
        </header>
        <p class="section-lede">
          Who owns the {entityIds.length === 1 ? 'entity' : 'entities'} in this investigation
        </p>

        <!-- Entity selector tabs -->
        {#if entityIds.length > 1}
          <div class="entity-tabs">
            {#each entityIds as id}
              {@const portfolio = entityPortfolios.find((e) => e.entity_id === id)}
              <button
                class="entity-tab"
                class:active={selectedEntityForGraph === id}
                onclick={() => (selectedEntityForGraph = id)}
              >
                {portfolio?.entity_name || id}
              </button>
            {/each}
          </div>
        {/if}

        <!-- Ownership graph for selected entity -->
        {#if selectedEntityForGraph}
          {@const graphData = entityOwnershipGraphs.get(selectedEntityForGraph)}
          {@const portfolio = entityPortfolios.find((e) => e.entity_id === selectedEntityForGraph)}

          <h3 class="subsection-head">Upstream Control Chain</h3>
          <p class="subsection-lede">Who owns this entity</p>
          {#if graphData && graphData.nodes.length > 1}
            <div class="ownership-graph-container">
              <OwnershipTreeGraph
                nodes={graphData.nodes}
                edges={graphData.edges}
                paths={graphData.paths || {}}
                rootId={selectedEntityForGraph}
                assetName={portfolio?.entity_name || selectedEntityForGraph}
              />
            </div>
          {:else}
            <p class="null-state">
              No upstream ownership data found for {portfolio?.entity_name ||
                selectedEntityForGraph}. This may be a terminal entity with no recorded owners.
            </p>
          {/if}

          <h3 class="subsection-head">Portfolio Structure</h3>
          <p class="subsection-lede">Subsidiaries and assets owned by this entity</p>
          <AssetScreenerChart
            entityId={selectedEntityForGraph}
            entityName={portfolio?.entity_name || selectedEntityForGraph}
          />
        {/if}
      </section>
    {/if}

    <!-- SECTION 4: GEOGRAPHY -->
    {#if geoBreakdown.length > 0}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num"
            >{hasEntities && entityOwnershipGraphs.size > 0 ? '4' : '3'}.</span
          >
          <h2>Geography</h2>
        </header>
        <p class="section-lede">
          {geoBreakdown.length}
          {geoBreakdown.length === 1 ? 'country' : 'countries'}{#if geoBreakdown[0]?.country},
            largest presence in {geoBreakdown[0].country}{/if}
        </p>

        <DataTable
          data={geoBreakdown}
          columns={[
            { key: 'country', label: 'Country', sortable: true },
            { key: 'asset_count', label: 'Assets', type: 'number', sortable: true },
            { key: 'total_capacity', label: 'Capacity (MW)', type: 'number', sortable: true },
            { key: 'entity_count', label: 'Entities', type: 'number', sortable: true },
          ]}
          showGlobalSearch={false}
          showColumnFilters={false}
          showPagination={false}
          showExport={false}
          showColumnToggle={false}
          stickyHeader={false}
          striped={false}
        />
      </section>
    {/if}

    <!-- SECTION 5: CONNECTIONS -->
    {#if hasEntities && entityIds.length >= 2}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num"
            >{hasEntities && entityOwnershipGraphs.size > 0 ? '5' : '4'}.</span
          >
          <h2>Connections</h2>
        </header>
        <p class="section-lede">
          {#if sharedAssets.length > 0}
            {sharedAssets.length} co-owned assets between {entityIds.length} entities
          {:else}
            Co-ownership analysis of {entityIds.length} entities
          {/if}
        </p>

        {#if sharedAssets.length > 0}
          <DataTable
            data={sharedAssets}
            columns={[
              { key: 'asset_name', label: 'Asset', sortable: true },
              { key: 'tracker', label: 'Type', sortable: true },
              { key: 'status', label: 'Status', sortable: true },
              { key: 'capacity_mw', label: 'Capacity (MW)', type: 'number', sortable: true },
              { key: 'co_owner_count', label: 'Co-owners', type: 'number', sortable: true },
              { key: 'co_owners', label: 'Shared by' },
            ]}
            showGlobalSearch={sharedAssets.length > 10}
            showColumnFilters={false}
            showPagination={sharedAssets.length > 25}
            showExport={true}
            showColumnToggle={false}
            striped={false}
            onRowClick={(row) => (window.location.href = assetLink(row.asset_id))}
          />
        {:else}
          <p class="null-state">
            No co-owned assets found. The {entityIds.length} entities do not share direct ownership of
            any assets in the GEM database.
          </p>
        {/if}
      </section>
    {:else if hasEntities && entityIds.length === 1}
      <section class="report-section muted">
        <header class="section-head">
          <span class="section-num"
            >{hasEntities && entityOwnershipGraphs.size > 0 ? '5' : '4'}.</span
          >
          <h2>Connections</h2>
        </header>
        <p class="section-lede">Add ≥2 entities to analyze co-ownership</p>
      </section>
    {/if}

    <!-- SECTION: ASSET OWNERSHIP (when assets in cart) -->
    {#if hasAssets}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num"
            >{hasEntities ? (entityOwnershipGraphs.size > 0 ? '6' : '5') : '4'}.</span
          >
          <h2>Asset Owners</h2>
        </header>
        <p class="section-lede">
          Owners of {assetIds.length} selected {assetIds.length === 1 ? 'asset' : 'assets'}
        </p>

        {#if commonOwners.length > 0}
          <DataTable
            data={commonOwners}
            columns={[
              { key: 'entity_name', label: 'Owner', sortable: true },
              { key: 'hq_country', label: 'HQ', sortable: true },
              { key: 'asset_count', label: 'Assets', type: 'number', sortable: true },
              { key: 'total_capacity_mw', label: 'Capacity (MW)', type: 'number', sortable: true },
              { key: 'avg_share_pct', label: 'Avg Stake (%)', type: 'number', sortable: true },
            ]}
            showGlobalSearch={commonOwners.length > 10}
            showColumnFilters={false}
            showPagination={commonOwners.length > 25}
            showExport={true}
            showColumnToggle={false}
            striped={false}
            onRowClick={(row) => (window.location.href = entityLink(row.entity_id))}
          />
        {:else}
          <p class="null-state">No ownership data found.</p>
        {/if}
      </section>
    {/if}

    <!-- APPENDIX -->
    <footer class="appendix">
      <h2>Appendix</h2>
      <p class="appendix-lede">
        {cartItems.length} items · {entityIds.length} entities · {assetIds.length} assets
      </p>

      <div class="appendix-grid">
        {#each cartItems as item}
          {#if item.type === 'asset'}
            <AssetMicroCard
              id={item.id}
              name={item.name}
              tracker={item.tracker}
              variant="compact"
            />
          {:else}
            <EntityMicroCard name={item.name} href={entityLink(item.id)} variant="compact" />
          {/if}
        {/each}
      </div>
    </footer>

    <!-- Citation -->
    <Citation variant="full" trackers={summary.trackers} />

    <!-- Debug Panel -->
    <DebugPanel title="Debug" time={queryTime}>
      <pre>{debugLogs.join('\n')}</pre>
      <p>Entities in cart: {entityIds.length}, Assets in cart: {assetIds.length}</p>
    </DebugPanel>
  {/if}
</div>

<style>
  /* ═══════════════════════════════════════════════════════════════════
     TUFTE / SWISS DESIGN SYSTEM
     High data-ink ratio · Grid-based · Typography-driven
     ═══════════════════════════════════════════════════════════════════ */

  .report-page {
    max-width: var(--container-reading);
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
    font-feature-settings: 'tnum' 1; /* tabular numbers */
  }

  .report-date {
    display: block;
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  /* States */
  .empty-state,
  .error-state {
    padding: var(--space-16) 0;
  }

  .empty-state h2,
  .error-state h2 {
    font-weight: 400;
    font-size: 18px;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-10);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .toolbar-actions {
    display: flex;
    gap: var(--space-4);
  }

  .meta-datum {
    font-size: 11px;
    font-family: var(--font-family-mono);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-text {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 0;
  }

  .btn-text:hover {
    color: var(--color-black);
  }

  .btn-text.danger {
    color: var(--color-text-tertiary);
  }

  .btn-text.danger:hover {
    color: var(--color-error);
  }

  .btn {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-gray-300);
    background: transparent;
    cursor: pointer;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SECTIONS
     ═══════════════════════════════════════════════════════════════════ */

  .report-section {
    margin-bottom: var(--space-12);
  }

  .section-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-gray-200);
    padding-bottom: var(--space-2);
  }

  .section-num {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  .section-head h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    letter-spacing: -0.01em;
  }

  .section-lede {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-6) 0;
  }

  .subsection-head {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-tertiary);
    margin: var(--space-8) 0 var(--space-3) 0;
  }

  .subsection-lede {
    font-size: 13px;
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-4) 0;
  }

  .muted {
    opacity: 0.5;
  }

  .null-state {
    font-size: 14px;
    color: var(--color-text-tertiary);
    padding: var(--space-6) 0;
  }

  /* ═══════════════════════════════════════════════════════════════════
     OWNERSHIP GRAPH SECTION
     ═══════════════════════════════════════════════════════════════════ */

  .entity-tabs {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    flex-wrap: wrap;
  }

  .entity-tab {
    padding: var(--space-2) var(--space-4);
    font-size: 12px;
    font-weight: 500;
    border: 1px solid var(--color-gray-300);
    background: var(--color-white);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .entity-tab:hover {
    border-color: var(--gem-primary-blue);
    color: var(--gem-primary-blue);
  }

  .entity-tab.active {
    background: var(--gem-primary-blue);
    border-color: var(--gem-primary-blue);
    color: white;
  }

  .ownership-graph-container {
    min-height: 200px;
  }

  /* ═══════════════════════════════════════════════════════════════════
     KEY FIGURES (replaces stat cards)
     ═══════════════════════════════════════════════════════════════════ */

  .key-figures {
    display: flex;
    gap: var(--space-8);
    margin-bottom: var(--space-6);
  }

  .kf {
    text-align: left;
  }

  .kf-value {
    display: block;
    font-size: 32px;
    font-weight: 300;
    font-family: var(--font-family-data);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .kf-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-tertiary);
    margin-top: var(--space-1);
  }

  /* ═══════════════════════════════════════════════════════════════════
     ENTITY GRID (uses EntityMicroCard)
     ═══════════════════════════════════════════════════════════════════ */

  .entity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  /* ═══════════════════════════════════════════════════════════════════
     APPENDIX GRID (uses MicroCards)
     ═══════════════════════════════════════════════════════════════════ */

  .appendix-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3);
  }

  /* Tables now use the DataTable component */

  /* ═══════════════════════════════════════════════════════════════════
     APPENDIX
     ═══════════════════════════════════════════════════════════════════ */

  .appendix {
    margin-top: var(--space-12);
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-gray-200);
  }

  .appendix h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-1) 0;
  }

  .appendix-lede {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }

  /* appendix-grid defined in ENTITY GRID section above */

  /* ═══════════════════════════════════════════════════════════════════
     RESPONSIVE
     ═══════════════════════════════════════════════════════════════════ */

  @media (max-width: 640px) {
    .report-page {
      padding: var(--space-4);
    }

    .key-figures {
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .kf-value {
      font-size: 24px;
    }

    .toolbar {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

    .entity-grid,
    .appendix-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     PRINT
     ═══════════════════════════════════════════════════════════════════ */

  @media print {
    .toolbar {
      display: none;
    }

    .report-page {
      max-width: none;
      padding: 0;
    }

    .report-section {
      page-break-inside: avoid;
    }
  }
</style>
