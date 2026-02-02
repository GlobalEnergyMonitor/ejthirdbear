<script lang="ts">
  /**
   * INVESTIGATION REPORT PAGE
   * Shows co-ownership patterns for items in the investigation cart.
   * Simplified version - core functionality without complex visualizations.
   */

  import { onMount } from 'svelte';
  import { investigationCart } from '$lib/investigationCart';
  import { widgetQuery } from '$lib/widgets/widget-utils';
  import { link, assetLink, entityLink } from '$lib/links';
  import { buildIdList } from '$lib/utils/sql';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
  import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let sharedAssets = $state<any[]>([]);
  let commonOwners = $state<any[]>([]);
  let geoBreakdown = $state<any[]>([]);
  let summary = $state({
    totalAssets: 0,
    totalCapacity: 0,
    countries: 0,
    trackers: [] as string[],
    totalEntities: 0,
  });
  let queryTime = $state(0);
  let debugLogs = $state<string[]>([]);

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const entityIds = $derived(cartItems.filter((i) => i.type === 'entity').map((i) => i.id));
  const assetIds = $derived(cartItems.filter((i) => i.type === 'asset').map((i) => i.id));
  const hasEntities = $derived(entityIds.length > 0);
  const hasAssets = $derived(assetIds.length > 0);
  const isEmpty = $derived(cartItems.length === 0);

  function log(msg: string) {
    debugLogs = [...debugLogs, `${new Date().toISOString().slice(11, 19)} ${msg}`];
    console.log('[report]', msg);
  }

  // Query for shared assets (when entities in cart)
  async function querySharedAssets() {
    if (entityIds.length < 1) return [];
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
        COUNT(DISTINCT o."Owner GEM Entity ID") as total_entities,
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
        totalEntities: Number(row.total_entities) || 0,
        trackers: row.trackers ? String(row.trackers).split(', ') : [],
      };
    }
    return { totalAssets: 0, totalCapacity: 0, countries: 0, totalEntities: 0, trackers: [] };
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
    const startTime = Date.now();

    try {
      const [shared, common, geo, stats] = await Promise.all([
        querySharedAssets(),
        queryCommonOwners(),
        queryGeoBreakdown(),
        querySummary(),
      ]);

      sharedAssets = shared;
      commonOwners = common;
      geoBreakdown = geo;
      summary = stats;
      queryTime = Date.now() - startTime;
      log(`Report loaded in ${queryTime}ms`);
    } catch (err) {
      console.error('Report query error:', err);
      error = err instanceof Error ? err.message : 'Failed to generate report';
      log(`Error: ${error}`);
    } finally {
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
      sharedAssets,
      commonOwners,
      geoBreakdown,
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
    <h1>Investigation Report</h1>
    <p class="lead">
      Co-ownership analysis for {cartItems.length} items in your investigation cart.
    </p>
  </header>

  {#if isEmpty}
    <section class="empty-state">
      <h2>No Items in Cart</h2>
      <p>Add assets or entities to your investigation cart to generate a report.</p>
      <a href={link('explore')} class="btn">Go to Explore</a>
    </section>
  {:else if loading}
    <section class="loading-state">
      <p>Generating report...</p>
      <p class="loading-detail">Analyzing {cartItems.length} items</p>
    </section>
  {:else if error}
    <section class="error-state">
      <h2>Error</h2>
      <p>{error}</p>
      <button class="btn" onclick={loadReport}>Retry</button>
    </section>
  {:else}
    <!-- Toolbar -->
    <section class="toolbar">
      <span class="query-time">{queryTime}ms</span>
      <div class="toolbar-actions">
        <button class="btn btn-outline" onclick={exportJSON}>Export JSON</button>
        <button class="btn btn-outline" onclick={() => window.print()}>Print</button>
        <button class="btn btn-danger" onclick={clearCart}>Clear Cart</button>
      </div>
    </section>

    <!-- Summary Stats -->
    <section class="summary-section">
      <h2>Summary</h2>
      <div class="stats-grid">
        <div class="stat">
          <span class="stat-value">{summary.totalAssets.toLocaleString()}</span>
          <span class="stat-label">Assets</span>
        </div>
        <div class="stat">
          <span class="stat-value">{summary.totalCapacity.toLocaleString()}</span>
          <span class="stat-label">MW Capacity</span>
        </div>
        <div class="stat">
          <span class="stat-value">{summary.totalEntities}</span>
          <span class="stat-label">Entities</span>
        </div>
        <div class="stat">
          <span class="stat-value">{summary.countries}</span>
          <span class="stat-label">Countries</span>
        </div>
      </div>
      {#if summary.trackers.length > 0}
        <div class="trackers">
          {#each summary.trackers as tracker}
            <span class="tracker-chip">
              <TrackerIcon {tracker} size={12} />
              {tracker}
            </span>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Cart Items -->
    <section class="cart-section">
      <h2>Cart ({cartItems.length})</h2>
      <div class="cart-grid">
        {#each cartItems as item}
          <div class="cart-item">
            {#if item.type === 'asset'}
              <a href={assetLink(item.id)}>
                {#if item.tracker}<TrackerIcon tracker={item.tracker} size={12} />{/if}
                {item.name}
              </a>
            {:else}
              <a href={entityLink(item.id)}>
                <span class="entity-badge">E</span>
                {item.name}
              </a>
            {/if}
            <span class="item-id">{item.id}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Shared Assets -->
    {#if hasEntities}
      <section class="data-section">
        <h2>Shared Assets ({sharedAssets.length})</h2>
        {#if sharedAssets.length > 0}
          <p class="section-desc">Assets co-owned by multiple entities in your cart:</p>
          <table class="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Tracker</th>
                <th>Capacity</th>
                <th>Co-owners</th>
              </tr>
            </thead>
            <tbody>
              {#each sharedAssets as asset}
                <tr>
                  <td>
                    <a href={assetLink(asset.asset_id)}>{asset.asset_name || asset.asset_id}</a>
                  </td>
                  <td>
                    {#if asset.tracker}<TrackerIcon tracker={asset.tracker} size={12} />{/if}
                    {asset.tracker || '-'}
                  </td>
                  <td class="numeric">{asset.capacity_mw?.toLocaleString() || '-'} MW</td>
                  <td>
                    <strong>{asset.co_owner_count}</strong>
                    <span class="muted">{asset.co_owners}</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="no-data">No shared assets found between selected entities.</p>
        {/if}
      </section>
    {/if}

    <!-- Common Owners -->
    {#if hasAssets}
      <section class="data-section">
        <h2>Common Owners ({commonOwners.length})</h2>
        {#if commonOwners.length > 0}
          <p class="section-desc">Entities that own assets in your cart:</p>
          <table class="data-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th>HQ Country</th>
                <th>Assets</th>
                <th>Capacity</th>
                <th>Avg Share</th>
              </tr>
            </thead>
            <tbody>
              {#each commonOwners as owner}
                <tr>
                  <td>
                    <a href={entityLink(owner.entity_id)}>
                      <span class="entity-badge">E</span>
                      {owner.entity_name || owner.entity_id}
                    </a>
                  </td>
                  <td>{owner.hq_country || '-'}</td>
                  <td class="numeric">{owner.asset_count}</td>
                  <td class="numeric">{owner.total_capacity_mw?.toLocaleString() || '-'} MW</td>
                  <td class="numeric">{owner.avg_share_pct?.toFixed(1) || '-'}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="no-data">No owner data found for selected assets.</p>
        {/if}
      </section>
    {/if}

    <!-- Geographic Breakdown -->
    {#if geoBreakdown.length > 0}
      <section class="data-section">
        <h2>Geographic Breakdown ({geoBreakdown.length})</h2>
        <table class="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Assets</th>
              <th>Capacity (MW)</th>
              <th>Entities</th>
            </tr>
          </thead>
          <tbody>
            {#each geoBreakdown as row}
              <tr>
                <td><strong>{row.country}</strong></td>
                <td class="numeric">{row.asset_count?.toLocaleString()}</td>
                <td class="numeric">{row.total_capacity?.toLocaleString() || '-'}</td>
                <td class="numeric">{row.entity_count}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <!-- Citation -->
    <Citation variant="full" trackers={summary.trackers} />

    <!-- Debug Panel -->
    <DebugPanel title="Debug" time={queryTime}>
      <pre>{debugLogs.join('\n')}</pre>
      <p>Entities: {entityIds.length}, Assets: {assetIds.length}</p>
    </DebugPanel>
  {/if}
</main>

<style>
  .report-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  header {
    margin-bottom: var(--space-8);
  }

  .breadcrumb {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-2);
  }
  .breadcrumb a {
    color: inherit;
  }

  h1 {
    font-size: var(--font-size-3xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
  }

  /* States */
  .empty-state,
  .loading-state,
  .error-state {
    text-align: center;
    padding: var(--space-16) var(--space-6);
  }
  .loading-detail {
    color: var(--color-text-tertiary);
  }
  .error-state {
    color: var(--color-error);
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-6);
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-gray-200);
  }
  .toolbar-actions {
    display: flex;
    gap: var(--space-2);
  }
  .query-time {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  /* Buttons */
  .btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    font-weight: 600;
    border: 1px solid var(--color-gray-300);
    background: var(--color-white);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--color-gray-100);
  }
  .btn-outline {
    background: transparent;
  }
  .btn-danger {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  /* Summary */
  .summary-section {
    margin-bottom: var(--space-8);
  }
  .summary-section h2 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0 0 var(--space-4) 0;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .stat {
    text-align: center;
  }
  .stat-value {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: bold;
  }
  .stat-label {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    color: var(--color-text-secondary);
  }
  .trackers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .tracker-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
    background: var(--color-gray-100);
  }

  /* Cart */
  .cart-section {
    margin-bottom: var(--space-8);
  }
  .cart-section h2 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    margin: 0 0 var(--space-3) 0;
  }
  .cart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2);
  }
  .cart-item {
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-50);
  }
  .cart-item a {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-black);
    text-decoration: none;
  }
  .cart-item a:hover {
    text-decoration: underline;
  }
  .item-id {
    display: block;
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-text-tertiary);
  }
  .entity-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    font-size: 10px;
    font-weight: bold;
    background: var(--color-gray-200);
    border-radius: 2px;
  }

  /* Data Sections */
  .data-section {
    margin-bottom: var(--space-8);
  }
  .data-section h2 {
    font-size: var(--font-size-xl);
    margin: 0 0 var(--space-2) 0;
  }
  .section-desc {
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .no-data {
    color: var(--color-text-tertiary);
    padding: var(--space-6);
    text-align: center;
    background: var(--color-gray-50);
  }

  /* Tables */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }
  .data-table th {
    text-align: left;
    padding: var(--space-2);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    border-bottom: 2px solid var(--color-gray-300);
  }
  .data-table td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--color-gray-100);
    vertical-align: top;
  }
  .data-table .numeric {
    text-align: right;
    font-family: var(--font-family-mono);
  }
  .data-table a {
    color: var(--color-black);
  }
  .muted {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    display: block;
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .toolbar {
      flex-direction: column;
      gap: var(--space-3);
    }
  }

  /* Print */
  @media print {
    .toolbar,
    .btn-danger {
      display: none;
    }
  }
</style>
