<script lang="ts">
  /**
   * INVESTIGATION REPORT PAGE
   * Shows co-ownership patterns for items in the investigation cart.
   */

  import { onMount } from 'svelte';
  import { investigationCart } from '$lib/investigationCart';
  import { widgetQuery } from '$lib/widgets/widget-utils';
  import { link, assetLink, entityLink } from '$lib/links';
  import { buildIdList } from '$lib/utils/sql';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/AssetMicroCard.svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sharedAssets = $state<any[]>([]);
  let commonOwners = $state<any[]>([]);
  let geoBreakdown = $state<any[]>([]);
  let entityPortfolios = $state<any[]>([]);
  let trackerBreakdown = $state<any[]>([]);
  let summary = $state({
    totalAssets: 0,
    totalCapacity: 0,
    countries: 0,
    trackers: [] as string[],
    totalOwners: 0,
  });
  let queryTime = $state(0);
  let debugLogs = $state<string[]>([]);

  // Loading progress state
  type QueryStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';
  type QueryStep = {
    id: string;
    label: string;
    status: QueryStatus;
    rows?: number;
    ms?: number;
  };

  let loadingSteps = $state<QueryStep[]>([
    { id: 'init', label: 'Initializing DuckDB connection', status: 'pending' },
    { id: 'portfolios', label: 'Querying entity portfolios', status: 'pending' },
    { id: 'shared', label: 'Finding co-owned assets', status: 'pending' },
    { id: 'owners', label: 'Identifying common owners', status: 'pending' },
    { id: 'geo', label: 'Analyzing geographic distribution', status: 'pending' },
    { id: 'trackers', label: 'Breaking down by asset type', status: 'pending' },
    { id: 'summary', label: 'Computing summary statistics', status: 'pending' },
  ]);

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
    console.log('[report]', msg);
  }

  // Query for entity portfolios (when entities in cart)
  async function queryEntityPortfolios() {
    if (entityIds.length < 1) return [];
    log(`Querying portfolios for ${entityIds.length} entities`);

    const idList = buildIdList(entityIds);
    const sql = `
      SELECT
        o."Owner GEM Entity ID" as entity_id,
        MAX(o."Owner") as entity_name,
        MAX(o."Owner Headquarters Country") as hq_country,
        COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
        SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
        AVG(CAST(o."Share" AS DOUBLE)) as avg_share_pct,
        COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN ${ASSET_ID_COALESCE_O} END) as operating,
        COUNT(DISTINCT CASE WHEN o."Status" IN ('proposed', 'announced', 'pre-permit', 'permitted') THEN ${ASSET_ID_COALESCE_O} END) as proposed,
        COUNT(DISTINCT CASE WHEN o."Status" IN ('construction', 'under construction') THEN ${ASSET_ID_COALESCE_O} END) as construction,
        STRING_AGG(DISTINCT o."Tracker", ', ') as trackers
      FROM ownership o
      WHERE o."Owner GEM Entity ID" IN (${idList})
      GROUP BY o."Owner GEM Entity ID"
      ORDER BY total_capacity_mw DESC
    `;

    const result = await widgetQuery(sql);
    log(`Entity portfolios: ${result.success ? result.data?.length : 'error'}`);
    return result.success ? result.data || [] : [];
  }

  // Query for shared assets (when entities in cart)
  async function querySharedAssets() {
    if (entityIds.length < 2) return []; // Need at least 2 entities to find shared assets
    log(`Querying shared assets for ${entityIds.length} entities`);

    const idList = buildIdList(entityIds);
    const sql = `
      WITH entity_assets AS (
        SELECT
          ${ASSET_ID_COALESCE_O} as asset_id,
          o."Project" as asset_name,
          o."Tracker" as tracker,
          o."Status" as status,
          COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw,
          o."Owner GEM Entity ID" as entity_id,
          o."Owner" as owner_name
        FROM ownership o
        WHERE o."Owner GEM Entity ID" IN (${idList})
          AND ${ASSET_ID_COALESCE_O} IS NOT NULL
      )
      SELECT
        asset_id,
        asset_name,
        tracker,
        status,
        MAX(capacity_mw) as capacity_mw,
        COUNT(DISTINCT entity_id) as co_owner_count,
        STRING_AGG(DISTINCT owner_name, '; ') as co_owners
      FROM entity_assets
      GROUP BY asset_id, asset_name, tracker, status
      HAVING COUNT(DISTINCT entity_id) > 1
      ORDER BY co_owner_count DESC, capacity_mw DESC
      LIMIT 100
    `;

    const result = await widgetQuery(sql);
    log(`Shared assets: ${result.success ? result.data?.length : 'error'}`);
    return result.success ? result.data || [] : [];
  }

  // Query for common owners (when assets in cart)
  async function queryCommonOwners() {
    if (assetIds.length < 1) return [];
    log(`Querying common owners for ${assetIds.length} assets`);

    const idList = buildIdList(assetIds);
    const sql = `
      SELECT
        o."Owner GEM Entity ID" as entity_id,
        MAX(o."Owner") as entity_name,
        MAX(o."Owner Headquarters Country") as hq_country,
        COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
        SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
        AVG(CAST(o."Share" AS DOUBLE)) as avg_share_pct
      FROM ownership o
      WHERE ${ASSET_ID_COALESCE_O} IN (${idList})
        AND o."Owner" IS NOT NULL AND o."Owner" != ''
      GROUP BY o."Owner GEM Entity ID"
      ORDER BY asset_count DESC, total_capacity_mw DESC
      LIMIT 100
    `;

    const result = await widgetQuery(sql);
    log(`Common owners: ${result.success ? result.data?.length : 'error'}`);
    return result.success ? result.data || [] : [];
  }

  // Query for geographic breakdown
  async function queryGeoBreakdown() {
    log('Querying geographic breakdown');
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        COALESCE(l."Country.Area", 'Unknown') as country,
        COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
        SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
        COUNT(DISTINCT o."Owner GEM Entity ID") as entity_count
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."Owner GEM Entity ID" IN (${entityList})
         OR ${ASSET_ID_COALESCE_O} IN (${assetList})
      GROUP BY 1
      ORDER BY asset_count DESC
      LIMIT 20
    `;

    const result = await widgetQuery(sql);
    log(`Geo breakdown: ${result.success ? result.data?.length : 'error'}`);
    return result.success ? result.data || [] : [];
  }

  // Query for tracker breakdown
  async function queryTrackerBreakdown() {
    log('Querying tracker breakdown');
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        o."Tracker" as tracker,
        COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
        SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
        COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN ${ASSET_ID_COALESCE_O} END) as operating,
        COUNT(DISTINCT CASE WHEN o."Status" IN ('proposed', 'announced', 'pre-permit', 'permitted') THEN ${ASSET_ID_COALESCE_O} END) as proposed
      FROM ownership o
      WHERE o."Owner GEM Entity ID" IN (${entityList})
         OR ${ASSET_ID_COALESCE_O} IN (${assetList})
      GROUP BY 1
      ORDER BY asset_count DESC
    `;

    const result = await widgetQuery(sql);
    log(`Tracker breakdown: ${result.success ? result.data?.length : 'error'}`);
    return result.success ? result.data || [] : [];
  }

  // Query for summary stats
  async function querySummary() {
    log('Querying summary');
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as total_assets,
        SUM(CAST(o."Capacity (MW)" AS DOUBLE)) as total_capacity,
        COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as countries,
        COUNT(DISTINCT o."Owner GEM Entity ID") as total_owners,
        STRING_AGG(DISTINCT o."Tracker", ', ') as trackers
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."Owner GEM Entity ID" IN (${entityList})
         OR ${ASSET_ID_COALESCE_O} IN (${assetList})
    `;

    const result = await widgetQuery(sql);
    if (result.success && result.data?.length > 0) {
      const row = result.data[0] as any;
      return {
        totalAssets: Number(row.total_assets) || 0,
        totalCapacity: Math.round(Number(row.total_capacity) || 0),
        countries: Number(row.countries) || 0,
        totalOwners: Number(row.total_owners) || 0,
        trackers: row.trackers ? String(row.trackers).split(', ') : [],
      };
    }
    return { totalAssets: 0, totalCapacity: 0, countries: 0, totalOwners: 0, trackers: [] };
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
    loadingSteps = [
      { id: 'init', label: 'Initializing DuckDB connection', status: 'pending' },
      { id: 'portfolios', label: 'Querying entity portfolios', status: 'pending' },
      { id: 'shared', label: 'Finding co-owned assets', status: 'pending' },
      { id: 'owners', label: 'Identifying common owners', status: 'pending' },
      { id: 'geo', label: 'Analyzing geographic distribution', status: 'pending' },
      { id: 'trackers', label: 'Breaking down by asset type', status: 'pending' },
      { id: 'summary', label: 'Computing summary statistics', status: 'pending' },
    ];

    // Start elapsed timer
    loadingStartTime = Date.now();
    loadingElapsed = 0;
    loadingInterval = setInterval(() => {
      loadingElapsed = Date.now() - loadingStartTime;
    }, 50);

    const startTime = Date.now();

    try {
      // Init step (simulates DuckDB warmup)
      updateStep('init', { status: 'running' });
      await new Promise((r) => setTimeout(r, 100)); // Small delay for visual
      updateStep('init', { status: 'done', ms: Date.now() - startTime });

      // Run queries sequentially for better loading UX (shows progress)
      const portfolios = await runStep('portfolios', queryEntityPortfolios, entityIds.length < 1);
      const shared = await runStep('shared', querySharedAssets, entityIds.length < 2);
      const common = await runStep('owners', queryCommonOwners, assetIds.length < 1);
      const geo = await runStep('geo', queryGeoBreakdown);
      const trackers = await runStep('trackers', queryTrackerBreakdown);
      const stats = await runStep('summary', querySummary);

      entityPortfolios = portfolios || [];
      sharedAssets = shared || [];
      commonOwners = common || [];
      geoBreakdown = geo || [];
      trackerBreakdown = trackers || [];
      summary = stats || { totalAssets: 0, totalCapacity: 0, countries: 0, totalOwners: 0, trackers: [] };

      queryTime = Date.now() - startTime;
      log(`Report loaded in ${queryTime}ms`);
    } catch (err) {
      console.error('Report query error:', err);
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

<main class="report-page">
  <header>
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> /
      <a href={link('explore')}>Explore</a> / Report
    </nav>
    <div class="title-block">
      <h1>Investigation Report</h1>
      <time class="report-date">{reportDate}</time>
    </div>
  </header>

  {#if isEmpty}
    <section class="empty-state">
      <h2>No Items in Cart</h2>
      <p>Add assets or entities to your investigation cart to generate a report.</p>
      <a href={link('explore')} class="btn">Go to Explore</a>
    </section>
  {:else if loading}
    <section class="loading-terminal">
      <div class="terminal-header">
        <span class="terminal-title">Generating Report</span>
        <span class="terminal-timer">{(loadingElapsed / 1000).toFixed(1)}s</span>
      </div>
      <div class="terminal-body">
        <div class="terminal-meta">
          <span>Investigating {cartItems.length} items</span>
          <span>{entityIds.length} entities · {assetIds.length} assets</span>
        </div>
        <ul class="query-steps">
          {#each loadingSteps as step}
            <li class="query-step {step.status}">
              <span class="step-indicator">
                {#if step.status === 'pending'}
                  <span class="dot">○</span>
                {:else if step.status === 'running'}
                  <span class="dot spinning">◐</span>
                {:else if step.status === 'done'}
                  <span class="dot done">●</span>
                {:else if step.status === 'skipped'}
                  <span class="dot skipped">–</span>
                {:else}
                  <span class="dot error">✕</span>
                {/if}
              </span>
              <span class="step-label">{step.label}</span>
              {#if step.status === 'done' && step.ms !== undefined}
                <span class="step-result">
                  {#if step.rows !== undefined && step.rows > 0}
                    {step.rows} rows ·
                  {/if}
                  {step.ms}ms
                </span>
              {:else if step.status === 'skipped'}
                <span class="step-result">skipped</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    </section>
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
        <p class="section-lede">{entityIds.length} {entityIds.length === 1 ? 'entity' : 'entities'} under investigation</p>

        <div class="entity-grid">
          {#each entityPortfolios as entity}
            <EntityMicroCard
              name={entity.entity_name}
              location={entity.hq_country}
              assetCount={entity.asset_count}
              totalCapacity={Math.round(entity.total_capacity_mw || 0)}
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
      <p class="section-lede">Combined holdings{#if entityIds.length > 0} across {entityIds.length} {entityIds.length === 1 ? 'entity' : 'entities'}{/if}</p>

      <!-- Key Figures -->
      <div class="key-figures">
        <div class="kf">
          <span class="kf-value">{summary.totalAssets.toLocaleString()}</span>
          <span class="kf-label">Assets</span>
        </div>
        <div class="kf">
          <span class="kf-value">{summary.totalCapacity.toLocaleString()}</span>
          <span class="kf-label">MW</span>
        </div>
        <div class="kf">
          <span class="kf-value">{summary.trackers.length}</span>
          <span class="kf-label">Types</span>
        </div>
        <div class="kf">
          <span class="kf-value">{summary.countries}</span>
          <span class="kf-label">Countries</span>
        </div>
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

    <!-- SECTION 3: GEOGRAPHY -->
    {#if geoBreakdown.length > 0}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num">3.</span>
          <h2>Geography</h2>
        </header>
        <p class="section-lede">
          {geoBreakdown.length} {geoBreakdown.length === 1 ? 'country' : 'countries'}{#if geoBreakdown[0]?.country}, largest presence in {geoBreakdown[0].country}{/if}
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

    <!-- SECTION 4: CONNECTIONS -->
    {#if hasEntities && entityIds.length >= 2}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num">4.</span>
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
            onRowClick={(row) => window.location.href = assetLink(row.asset_id)}
          />
        {:else}
          <p class="null-state">No co-owned assets found. The {entityIds.length} entities do not share direct ownership of any assets in the GEM database.</p>
        {/if}
      </section>
    {:else if hasEntities && entityIds.length === 1}
      <section class="report-section muted">
        <header class="section-head">
          <span class="section-num">4.</span>
          <h2>Connections</h2>
        </header>
        <p class="section-lede">Add ≥2 entities to analyze co-ownership</p>
      </section>
    {/if}

    <!-- SECTION: ASSET OWNERSHIP (when assets in cart) -->
    {#if hasAssets}
      <section class="report-section">
        <header class="section-head">
          <span class="section-num">{hasEntities ? '5' : '4'}.</span>
          <h2>Ownership</h2>
        </header>
        <p class="section-lede">Owners of {assetIds.length} selected {assetIds.length === 1 ? 'asset' : 'assets'}</p>

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
            onRowClick={(row) => window.location.href = entityLink(row.entity_id)}
          />
        {:else}
          <p class="null-state">No ownership data found.</p>
        {/if}
      </section>
    {/if}

    <!-- APPENDIX -->
    <footer class="appendix">
      <h2>Appendix</h2>
      <p class="appendix-lede">{cartItems.length} items · {entityIds.length} entities · {assetIds.length} assets</p>

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
            <EntityMicroCard
              name={item.name}
              href={entityLink(item.id)}
              variant="compact"
            />
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
</main>

<style>
  /* ═══════════════════════════════════════════════════════════════════
     TUFTE / SWISS DESIGN SYSTEM
     High data-ink ratio · Grid-based · Typography-driven
     ═══════════════════════════════════════════════════════════════════ */

  .report-page {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
    font-feature-settings: 'tnum' 1; /* tabular numbers */
  }

  /* Header */
  header {
    margin-bottom: var(--space-10);
  }

  .breadcrumb {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-4);
  }

  .breadcrumb a {
    color: inherit;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  .title-block {
    border-top: 2px solid var(--color-black);
    padding-top: var(--space-4);
  }

  h1 {
    font-size: 32px;
    font-weight: 400;
    margin: 0;
    letter-spacing: -0.02em;
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

  /* ═══════════════════════════════════════════════════════════════════
     LOADING TERMINAL
     ═══════════════════════════════════════════════════════════════════ */

  .loading-terminal {
    margin: var(--space-8) 0;
    border: 1px solid var(--color-gray-200);
    font-family: var(--font-family-mono);
    font-size: 12px;
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-100);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .terminal-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 10px;
  }

  .terminal-timer {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .terminal-body {
    padding: var(--space-4);
    background: var(--color-white);
  }

  .terminal-meta {
    display: flex;
    justify-content: space-between;
    color: var(--color-text-tertiary);
    font-size: 11px;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px dashed var(--color-gray-200);
  }

  .query-steps {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .query-step {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    color: var(--color-text-secondary);
  }

  .query-step.running {
    color: var(--color-black);
  }

  .query-step.done {
    color: var(--color-text-secondary);
  }

  .query-step.skipped {
    color: var(--color-text-tertiary);
    opacity: 0.6;
  }

  .query-step.error {
    color: var(--color-error);
  }

  .step-indicator {
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }

  .dot {
    display: inline-block;
    font-size: 10px;
  }

  .dot.spinning {
    animation: spin 0.6s linear infinite;
    color: var(--gem-primary-blue);
  }

  .dot.done {
    color: var(--color-status-operating, #2d6a4f);
  }

  .dot.skipped {
    color: var(--color-text-tertiary);
  }

  .dot.error {
    color: var(--color-error);
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .step-label {
    flex: 1;
  }

  .step-result {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .query-step.done .step-result {
    color: var(--color-status-operating, #2d6a4f);
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

  .muted {
    opacity: 0.5;
  }

  .null-state {
    font-size: 14px;
    color: var(--color-text-tertiary);
    padding: var(--space-6) 0;
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

    h1 {
      font-size: 24px;
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

    .title-block {
      border-top-width: 1px;
    }
  }
</style>
