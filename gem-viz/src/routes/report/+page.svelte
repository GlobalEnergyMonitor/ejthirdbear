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
      const [portfolios, shared, common, geo, trackers, stats] = await Promise.all([
        queryEntityPortfolios(),
        querySharedAssets(),
        queryCommonOwners(),
        queryGeoBreakdown(),
        queryTrackerBreakdown(),
        querySummary(),
      ]);

      entityPortfolios = portfolios;
      sharedAssets = shared;
      commonOwners = common;
      geoBreakdown = geo;
      trackerBreakdown = trackers;
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
    <h1>Investigation Report</h1>
    <p class="report-date">{reportDate}</p>
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
      <span class="query-time">Query time: {queryTime}ms</span>
      <div class="toolbar-actions">
        <button class="btn btn-outline" onclick={exportJSON}>Export JSON</button>
        <button class="btn btn-outline" onclick={() => window.print()}>Print</button>
        <button class="btn btn-danger" onclick={clearCart}>Clear Cart</button>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════
         SECTION 1: THE SUBJECTS (WHO)
         Who are we investigating?
         ═══════════════════════════════════════════════════════════════════ -->

    {#if hasEntities}
      <section class="primary-section">
        <div class="section-header">
          <span class="section-number">1</span>
          <div>
            <h2>The Subjects</h2>
            <p class="section-subtitle">Who is under investigation</p>
          </div>
        </div>

        <div class="entity-grid">
          {#each entityPortfolios as entity}
            <div class="entity-card">
              <div class="entity-header">
                <a href={entityLink(entity.entity_id)} class="entity-name">
                  {entity.entity_name}
                </a>
                <span class="entity-id">{entity.entity_id}</span>
              </div>
              {#if entity.hq_country}
                <div class="entity-hq">Headquarters: {entity.hq_country}</div>
              {/if}
              <div class="entity-stats">
                <div class="entity-stat">
                  <span class="entity-value">{entity.asset_count}</span>
                  <span class="entity-label">assets</span>
                </div>
                <div class="entity-stat">
                  <span class="entity-value">{Math.round(entity.total_capacity_mw || 0).toLocaleString()}</span>
                  <span class="entity-label">MW</span>
                </div>
                <div class="entity-stat">
                  <span class="entity-value">{entity.avg_share_pct?.toFixed(0) || '-'}%</span>
                  <span class="entity-label">avg stake</span>
                </div>
              </div>
              <div class="entity-status">
                {#if entity.operating > 0}
                  <span class="status-pill operating">{entity.operating} operating</span>
                {/if}
                {#if entity.construction > 0}
                  <span class="status-pill construction">{entity.construction} construction</span>
                {/if}
                {#if entity.proposed > 0}
                  <span class="status-pill proposed">{entity.proposed} proposed</span>
                {/if}
              </div>
              {#if entity.trackers}
                <div class="entity-trackers">
                  {#each entity.trackers.split(', ') as tracker}
                    <span class="mini-tracker">
                      <TrackerIcon {tracker} size={10} />
                      {tracker}
                    </span>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════
         SECTION 2: THE PORTFOLIO (WHAT)
         What do they own? How much?
         ═══════════════════════════════════════════════════════════════════ -->

    <section class="primary-section">
      <div class="section-header">
        <span class="section-number">2</span>
        <div>
          <h2>The Portfolio</h2>
          <p class="section-subtitle">Combined holdings across all {entityIds.length} entities</p>
        </div>
      </div>

      <!-- Aggregate Stats -->
      <div class="stats-row">
        <div class="stat-card primary">
          <span class="stat-value">{summary.totalAssets.toLocaleString()}</span>
          <span class="stat-label">Total Assets</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{summary.totalCapacity.toLocaleString()}</span>
          <span class="stat-label">MW Capacity</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{summary.trackers.length}</span>
          <span class="stat-label">Asset Types</span>
        </div>
        <div class="stat-card">
          <span class="stat-value">{summary.countries}</span>
          <span class="stat-label">Countries</span>
        </div>
      </div>

      <!-- Asset Type Breakdown -->
      {#if trackerBreakdown.length > 0}
        <h3 class="subsection-title">By Asset Type</h3>
        <div class="tracker-grid">
          {#each trackerBreakdown as t}
            <div class="tracker-card">
              <div class="tracker-header">
                <TrackerIcon tracker={t.tracker} size={16} />
                <span class="tracker-name">{t.tracker}</span>
              </div>
              <div class="tracker-stats">
                <div class="tracker-stat">
                  <span class="tracker-value">{t.asset_count?.toLocaleString()}</span>
                  <span class="tracker-label">assets</span>
                </div>
                <div class="tracker-stat">
                  <span class="tracker-value">{Math.round(t.total_capacity || 0).toLocaleString()}</span>
                  <span class="tracker-label">MW</span>
                </div>
                {#if t.operating > 0}
                  <div class="tracker-stat">
                    <span class="tracker-value operating">{t.operating}</span>
                    <span class="tracker-label">operating</span>
                  </div>
                {/if}
                {#if t.proposed > 0}
                  <div class="tracker-stat">
                    <span class="tracker-value proposed">{t.proposed}</span>
                    <span class="tracker-label">proposed</span>
                  </div>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- ═══════════════════════════════════════════════════════════════════
         SECTION 3: THE GEOGRAPHY (WHERE)
         Where are these assets located?
         ═══════════════════════════════════════════════════════════════════ -->

    {#if geoBreakdown.length > 0}
      <section class="primary-section">
        <div class="section-header">
          <span class="section-number">3</span>
          <div>
            <h2>The Geography</h2>
            <p class="section-subtitle">
              Asset locations across {geoBreakdown.length} {geoBreakdown.length === 1 ? 'country' : 'countries'}
              {#if geoBreakdown[0]?.country}
                — largest presence in <strong>{geoBreakdown[0].country}</strong>
              {/if}
            </p>
          </div>
        </div>

        <table class="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th class="numeric"># Assets</th>
              <th class="numeric">Capacity (MW)</th>
              <th class="numeric"># Entities Active</th>
            </tr>
          </thead>
          <tbody>
            {#each geoBreakdown as row, i}
              <tr class:highlight={i === 0}>
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

    <!-- ═══════════════════════════════════════════════════════════════════
         SECTION 4: THE CONNECTIONS (HOW)
         How are these entities connected?
         ═══════════════════════════════════════════════════════════════════ -->

    {#if hasEntities && entityIds.length >= 2}
      <section class="primary-section">
        <div class="section-header">
          <span class="section-number">4</span>
          <div>
            <h2>The Connections</h2>
            <p class="section-subtitle">
              {#if sharedAssets.length > 0}
                {sharedAssets.length} assets are co-owned by multiple entities in this investigation
              {:else}
                Analyzing co-ownership patterns between the {entityIds.length} entities
              {/if}
            </p>
          </div>
        </div>

        {#if sharedAssets.length > 0}
          <p class="connection-insight">
            These {sharedAssets.length} co-owned assets may indicate joint ventures, partnerships,
            or coordinated investments between the entities under investigation.
          </p>
          <table class="data-table">
            <thead>
              <tr>
                <th>Asset Name</th>
                <th>Type</th>
                <th>Status</th>
                <th class="numeric">Capacity</th>
                <th class="numeric"># Co-Owners</th>
                <th>Shared By</th>
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
                  <td>{asset.status || '-'}</td>
                  <td class="numeric">{asset.capacity_mw?.toLocaleString() || '-'} MW</td>
                  <td class="numeric"><strong>{asset.co_owner_count}</strong></td>
                  <td class="co-owners">{asset.co_owners}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <div class="no-connection-box">
            <div class="no-connection-icon">∅</div>
            <p class="no-connection-title">No Direct Connections Found</p>
            <p class="no-connection-text">
              The {entityIds.length} entities in this investigation do not appear to co-own any assets together
              in the GEM database. This could mean they operate independently, or their connections
              exist through other corporate structures not captured in direct ownership data.
            </p>
          </div>
        {/if}
      </section>
    {:else if hasEntities && entityIds.length === 1}
      <section class="primary-section muted-section">
        <div class="section-header">
          <span class="section-number">4</span>
          <div>
            <h2>The Connections</h2>
            <p class="section-subtitle">Add more entities to analyze co-ownership patterns</p>
          </div>
        </div>
        <p class="muted-message">
          Co-ownership analysis requires at least 2 entities. Add more entities to your
          investigation cart to discover shared assets and potential connections.
        </p>
      </section>
    {/if}

    <!-- Common Owners (only shown when assets are in cart) -->
    {#if hasAssets}
      <section class="primary-section">
        <div class="section-header">
          <span class="section-number">{hasEntities ? '5' : '4'}</span>
          <div>
            <h2>Asset Ownership</h2>
            <p class="section-subtitle">Who owns the {assetIds.length} assets in your cart</p>
          </div>
        </div>

        {#if commonOwners.length > 0}
          <table class="data-table">
            <thead>
              <tr>
                <th>Owner Entity</th>
                <th>HQ Country</th>
                <th class="numeric"># Assets</th>
                <th class="numeric">Total Capacity</th>
                <th class="numeric">Avg Stake</th>
              </tr>
            </thead>
            <tbody>
              {#each commonOwners as owner}
                <tr>
                  <td>
                    <a href={entityLink(owner.entity_id)}>
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
          <p class="no-data">No ownership data found for the selected assets.</p>
        {/if}
      </section>
    {/if}

    <!-- ═══════════════════════════════════════════════════════════════════
         APPENDIX: Reference Information
         ═══════════════════════════════════════════════════════════════════ -->

    <section class="appendix-section">
      <h2>Appendix: Investigation Cart</h2>
      <p class="section-desc">
        {cartItems.length} items analyzed in this report
        {#if entityIds.length > 0 && assetIds.length > 0}
          ({entityIds.length} entities, {assetIds.length} assets)
        {:else if entityIds.length > 0}
          ({entityIds.length} entities)
        {:else}
          ({assetIds.length} assets)
        {/if}
      </p>
      <div class="cart-grid">
        {#each cartItems as item}
          <div class="cart-item">
            {#if item.type === 'asset'}
              <a href={assetLink(item.id)}>
                {#if item.tracker}<TrackerIcon tracker={item.tracker} size={12} />{/if}
                {item.name}
              </a>
              <span class="item-type">Asset</span>
            {:else}
              <a href={entityLink(item.id)}>
                <span class="entity-badge">E</span>
                {item.name}
              </a>
              <span class="item-type">Entity</span>
            {/if}
            <span class="item-id">{item.id}</span>
          </div>
        {/each}
      </div>
    </section>

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
  .report-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-6);
  }

  header {
    margin-bottom: var(--space-6);
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
    margin: 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .report-date {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: var(--space-1) 0 0 0;
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
    margin-bottom: var(--space-8);
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

  /* ═══════════════════════════════════════════════════════════════════
     PRIMARY SECTIONS - The main numbered sections
     ═══════════════════════════════════════════════════════════════════ */

  .primary-section {
    margin-bottom: var(--space-12);
    padding-bottom: var(--space-8);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .primary-section:last-of-type {
    border-bottom: none;
  }

  .section-header {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .section-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    background: var(--gem-primary-blue);
    color: white;
    font-size: var(--font-size-xl);
    font-weight: bold;
    font-family: var(--font-family-data);
    flex-shrink: 0;
  }

  .section-header h2 {
    font-size: var(--font-size-2xl);
    margin: 0;
    letter-spacing: var(--tracking-tight);
  }

  .section-subtitle {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: var(--space-1) 0 0 0;
  }

  .subsection-title {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: var(--space-8) 0 var(--space-4) 0;
    color: var(--color-text-secondary);
  }

  .muted-section {
    opacity: 0.6;
  }

  .muted-message {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-md);
    padding: var(--space-6);
    background: var(--color-gray-50);
    text-align: center;
  }

  /* Stats Row */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
  }

  .stat-card {
    text-align: center;
    padding: var(--space-5);
    background: var(--color-gray-50);
  }

  .stat-card.primary {
    background: var(--gem-primary-blue);
    color: white;
  }

  .stat-card .stat-value {
    display: block;
    font-size: var(--font-size-3xl);
    font-weight: bold;
    font-family: var(--font-family-data);
    line-height: 1;
  }

  .stat-card .stat-label {
    display: block;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin-top: var(--space-2);
    opacity: 0.8;
  }

  /* Entity Grid */
  .entity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-4);
  }

  .entity-card {
    padding: var(--space-4);
    background: var(--color-gray-50);
    border-left: 3px solid var(--gem-primary-blue);
  }

  .entity-header {
    margin-bottom: var(--space-2);
  }

  .entity-name {
    display: block;
    font-weight: 600;
    font-size: var(--font-size-md);
    color: var(--color-black);
    text-decoration: none;
  }

  .entity-name:hover {
    text-decoration: underline;
  }

  .entity-id {
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-text-tertiary);
  }

  .entity-hq {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .entity-stats {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }

  .entity-stat {
    text-align: center;
  }

  .entity-value {
    display: block;
    font-size: var(--font-size-xl);
    font-weight: bold;
    font-family: var(--font-family-data);
  }

  .entity-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
  }

  .entity-status {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }

  .status-pill {
    font-size: var(--font-size-xs);
    padding: 2px var(--space-2);
    border-radius: 99px;
  }

  .status-pill.operating {
    background: rgba(45, 106, 79, 0.1);
    color: var(--color-status-operating, #2d6a4f);
  }

  .status-pill.construction {
    background: rgba(234, 179, 8, 0.1);
    color: #b45309;
  }

  .status-pill.proposed {
    background: rgba(124, 58, 237, 0.1);
    color: var(--color-status-prospective, #7c3aed);
  }

  .entity-trackers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .mini-tracker {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  /* Tracker Grid */
  .tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .tracker-card {
    padding: var(--space-3);
    background: var(--color-white);
    border: 1px solid var(--color-gray-200);
  }

  .tracker-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .tracker-name {
    font-weight: 600;
    font-size: var(--font-size-sm);
  }

  .tracker-stats {
    display: flex;
    gap: var(--space-3);
  }

  .tracker-stat {
    text-align: center;
  }

  .tracker-value {
    display: block;
    font-size: var(--font-size-lg);
    font-weight: bold;
    font-family: var(--font-family-data);
  }

  .tracker-value.operating {
    color: var(--color-status-operating, #2d6a4f);
  }

  .tracker-value.proposed {
    color: var(--color-status-prospective, #7c3aed);
  }

  .tracker-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
  }

  /* Connection States */
  .connection-insight {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-4);
    padding: var(--space-3);
    background: rgba(45, 106, 79, 0.05);
    border-left: 3px solid var(--color-status-operating, #2d6a4f);
  }

  .no-connection-box {
    padding: var(--space-8);
    text-align: center;
    background: var(--color-gray-50);
  }

  .no-connection-icon {
    font-size: 48px;
    color: var(--color-gray-300);
    margin-bottom: var(--space-3);
  }

  .no-connection-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0 0 var(--space-2) 0;
  }

  .no-connection-text {
    color: var(--color-text-secondary);
    max-width: 500px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* Tables */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .data-table th {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    border-bottom: 2px solid var(--color-gray-300);
    background: var(--color-gray-50);
  }

  .data-table th.numeric {
    text-align: right;
  }

  .data-table td {
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-gray-100);
    vertical-align: top;
  }

  .data-table tr.highlight td {
    background: rgba(29, 73, 97, 0.05);
  }

  .data-table .numeric {
    text-align: right;
    font-family: var(--font-family-mono);
  }

  .data-table a {
    color: var(--color-black);
  }

  .co-owners {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    max-width: 250px;
  }

  .no-data {
    color: var(--color-text-tertiary);
    padding: var(--space-6);
    text-align: center;
    background: var(--color-gray-50);
  }

  /* Appendix Section */
  .appendix-section {
    margin-top: var(--space-8);
    padding-top: var(--space-6);
    border-top: 2px solid var(--color-gray-200);
  }

  .appendix-section h2 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-2) 0;
  }

  .section-desc {
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
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
    font-weight: 500;
  }

  .cart-item a:hover {
    text-decoration: underline;
  }

  .item-type {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
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

  /* Responsive */
  @media (max-width: 768px) {
    .stats-row {
      grid-template-columns: repeat(2, 1fr);
    }
    .toolbar {
      flex-direction: column;
      gap: var(--space-3);
    }
    .entity-grid,
    .tracker-grid {
      grid-template-columns: 1fr;
    }
    .section-header {
      flex-direction: column;
      gap: var(--space-2);
    }
    .section-number {
      width: 32px;
      height: 32px;
      font-size: var(--font-size-lg);
    }
  }

  /* Print */
  @media print {
    .toolbar,
    .btn-danger {
      display: none;
    }
    .primary-section {
      page-break-inside: avoid;
    }
    .section-number {
      background: #000 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
