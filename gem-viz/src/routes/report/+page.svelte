<script>
  /**
   * INVESTIGATION REPORT PAGE
   * Analyzes co-ownership patterns between items in the investigation cart.
   * Supports both entities (find shared assets) and assets (find common owners).
   * Printable with print CSS, exportable to CSV/JSON.
   */

  import { onMount } from 'svelte';
  import { investigationCart } from '$lib/investigationCart';
  import { widgetQuery } from '$lib/widgets/widget-utils';
  import { link, assetLink, entityLink } from '$lib/links';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  // State
  let loading = $state(true);
  let error = $state(null);
  let sharedAssets = $state([]);
  let commonOwners = $state([]);
  let geoBreakdown = $state([]);
  let entityPortfolios = $state([]); // NEW: Full portfolio for each entity
  let summary = $state({
    totalAssets: 0,
    totalCapacity: 0,
    countries: 0,
    trackers: [],
    totalEntities: 0,
  });
  let queryTime = $state(0);
  let shareUrl = $state('');
  let copied = $state(false);

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const entityIds = $derived(cartItems.filter((i) => i.type === 'entity').map((i) => i.id));
  const assetIds = $derived(cartItems.filter((i) => i.type === 'asset').map((i) => i.id));
  const hasEntities = $derived(entityIds.length > 0);
  const hasAssets = $derived(assetIds.length > 0);
  const isEmpty = $derived(cartItems.length === 0);

  // Format timestamp
  const reportDate = new Date().toLocaleString();

  // Escape SQL string
  function escapeSQL(str) {
    return str.replace(/'/g, "''");
  }

  // Build ID list for SQL IN clause
  function buildIdList(ids) {
    return ids.map((id) => `'${escapeSQL(id)}'`).join(',');
  }

  // Query for shared assets (when entities in cart)
  async function querySharedAssets() {
    if (entityIds.length < 1) return [];

    const idList = buildIdList(entityIds);

    const sql = `
      WITH cart_entities AS (
        SELECT unnest([${idList}]) as entity_id
      ),
      entity_assets AS (
        SELECT
          o."GEM unit ID" as asset_id,
          o."Project" as asset_name,
          o."Tracker" as tracker,
          o."Status" as status,
          o."Country" as country,
          COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw,
          o."Owner GEM Entity ID" as entity_id,
          o."Owner" as owner_name,
          COALESCE(CAST(o."Share" AS DOUBLE), 0) as share_pct
        FROM ownership o
        INNER JOIN cart_entities c ON o."Owner GEM Entity ID" = c.entity_id
        WHERE o."GEM unit ID" IS NOT NULL
      ),
      shared AS (
        SELECT
          asset_id,
          asset_name,
          tracker,
          status,
          country,
          MAX(capacity_mw) as capacity_mw,
          COUNT(DISTINCT entity_id) as co_owner_count,
          STRING_AGG(DISTINCT owner_name, '; ' ORDER BY owner_name) as co_owners,
          STRING_AGG(DISTINCT entity_id, '; ' ORDER BY entity_id) as co_owner_ids,
          SUM(share_pct) as total_share_pct
        FROM entity_assets
        GROUP BY asset_id, asset_name, tracker, status, country
        HAVING COUNT(DISTINCT entity_id) > 1
      )
      SELECT * FROM shared
      ORDER BY co_owner_count DESC, total_share_pct DESC, capacity_mw DESC
      LIMIT 200
    `;

    const result = await widgetQuery(sql);
    return result.success ? result.data || [] : [];
  }

  // Query for common owners (when assets in cart)
  async function queryCommonOwners() {
    if (assetIds.length < 1) return [];

    const idList = buildIdList(assetIds);

    const sql = `
      WITH cart_assets AS (
        SELECT unnest([${idList}]) as asset_id
      ),
      asset_owners AS (
        SELECT
          o."Owner GEM Entity ID" as entity_id,
          o."Owner" as entity_name,
          o."Owner Registration Country" as registration_country,
          o."Owner Headquarters Country" as hq_country,
          o."GEM unit ID" as asset_id,
          o."Project" as project_name,
          o."Tracker" as tracker,
          COALESCE(CAST(o."Share" AS DOUBLE), 0) as share_pct,
          COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw
        FROM ownership o
        INNER JOIN cart_assets c ON o."GEM unit ID" = c.asset_id
        WHERE o."Owner" IS NOT NULL AND o."Owner" != ''
      ),
      common AS (
        SELECT
          entity_id,
          MAX(entity_name) as entity_name,
          MAX(registration_country) as registration_country,
          MAX(hq_country) as hq_country,
          COUNT(DISTINCT asset_id) as asset_count,
          SUM(share_pct) as total_share_pct,
          AVG(share_pct) as avg_share_pct,
          STRING_AGG(DISTINCT project_name, '; ' ORDER BY project_name) as projects,
          STRING_AGG(DISTINCT tracker, '; ' ORDER BY tracker) as trackers,
          SUM(capacity_mw) as total_capacity_mw
        FROM asset_owners
        GROUP BY entity_id
        HAVING COUNT(DISTINCT asset_id) >= 1
      )
      SELECT * FROM common
      ORDER BY asset_count DESC, total_capacity_mw DESC
      LIMIT 200
    `;

    const result = await widgetQuery(sql);
    return result.success ? result.data || [] : [];
  }

  // Query for geographic breakdown
  async function queryGeoBreakdown() {
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        COALESCE("Country", 'Unknown') as country,
        COUNT(DISTINCT "GEM unit ID") as asset_count,
        COALESCE(SUM(CAST("Capacity (MW)" AS DOUBLE)), 0) as total_capacity,
        COUNT(DISTINCT "Owner GEM Entity ID") as entity_count,
        STRING_AGG(DISTINCT "Tracker", ', ' ORDER BY "Tracker") as trackers
      FROM ownership
      WHERE "Owner GEM Entity ID" IN (${entityList})
         OR "GEM unit ID" IN (${assetList})
      GROUP BY 1
      ORDER BY asset_count DESC
      LIMIT 30
    `;

    const result = await widgetQuery(sql);
    return result.success ? result.data || [] : [];
  }

  // Query for entity portfolios (full breakdown per entity)
  async function queryEntityPortfolios() {
    if (entityIds.length === 0) return [];

    const idList = buildIdList(entityIds);

    const sql = `
      SELECT
        o."Owner GEM Entity ID" as entity_id,
        o."Owner" as entity_name,
        MAX(o."Owner Registration Country") as registration_country,
        MAX(o."Owner Headquarters Country") as hq_country,
        COUNT(DISTINCT o."GEM unit ID") as asset_count,
        COALESCE(SUM(CAST(o."Capacity (MW)" AS DOUBLE)), 0) as total_capacity_mw,
        AVG(CAST(o."Share" AS DOUBLE)) as avg_ownership_pct,
        COUNT(DISTINCT o."Country") as country_count,
        STRING_AGG(DISTINCT o."Tracker", ', ' ORDER BY o."Tracker") as trackers,
        STRING_AGG(DISTINCT o."Country", ', ' ORDER BY o."Country") as countries,
        COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN o."GEM unit ID" END) as operating_count,
        COUNT(DISTINCT CASE WHEN o."Status" = 'proposed' THEN o."GEM unit ID" END) as proposed_count,
        COUNT(DISTINCT CASE WHEN o."Status" = 'retired' THEN o."GEM unit ID" END) as retired_count
      FROM ownership o
      WHERE o."Owner GEM Entity ID" IN (${idList})
      GROUP BY o."Owner GEM Entity ID", o."Owner"
      ORDER BY total_capacity_mw DESC
    `;

    const result = await widgetQuery(sql);
    return result.success ? result.data || [] : [];
  }

  // Query for summary stats
  async function querySummary() {
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        COUNT(DISTINCT "GEM unit ID") as total_assets,
        COALESCE(SUM(CAST("Capacity (MW)" AS DOUBLE)), 0) as total_capacity,
        COUNT(DISTINCT "Country") as countries,
        COUNT(DISTINCT "Tracker") as tracker_count,
        COUNT(DISTINCT "Owner GEM Entity ID") as total_entities,
        STRING_AGG(DISTINCT "Tracker", ', ') as trackers
      FROM ownership
      WHERE "Owner GEM Entity ID" IN (${entityList})
         OR "GEM unit ID" IN (${assetList})
    `;

    const result = await widgetQuery(sql);
    if (result.success && result.data?.length > 0) {
      /** @type {Record<string, any>} */
      const row = result.data[0];
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
      loading = false;
      return;
    }

    loading = true;
    error = null;
    const startTime = Date.now();

    try {
      const [shared, common, geo, portfolios, stats] = await Promise.all([
        querySharedAssets(),
        queryCommonOwners(),
        queryGeoBreakdown(),
        queryEntityPortfolios(),
        querySummary(),
      ]);

      sharedAssets = shared;
      commonOwners = common;
      geoBreakdown = geo;
      entityPortfolios = portfolios;
      summary = stats;
      queryTime = Date.now() - startTime;

      // Generate shareable URL
      generateShareUrl();
    } catch (err) {
      console.error('Report query error:', err);
      error = err?.message || 'Failed to generate report';
    } finally {
      loading = false;
    }
  }

  // Export to CSV
  function exportCSV() {
    const rows = [];

    // Entity Portfolios section
    if (entityPortfolios.length > 0) {
      rows.push(['--- ENTITY PORTFOLIOS ---'].join(','));
      rows.push(
        [
          'Entity ID',
          'Entity Name',
          'HQ Country',
          'Registration Country',
          'Asset Count',
          'Total Capacity MW',
          'Avg Ownership %',
          'Countries',
          'Operating',
          'Proposed',
          'Retired',
          'Trackers',
        ].join(',')
      );
      for (const entity of entityPortfolios) {
        rows.push(
          [
            entity.entity_id,
            `"${(entity.entity_name || '').replace(/"/g, '""')}"`,
            entity.hq_country || '',
            entity.registration_country || '',
            entity.asset_count || 0,
            Math.round(entity.total_capacity_mw || 0),
            entity.avg_ownership_pct?.toFixed(2) || '',
            entity.country_count || 0,
            entity.operating_count || 0,
            entity.proposed_count || 0,
            entity.retired_count || 0,
            `"${(entity.trackers || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
      }
      rows.push(''); // Empty line separator
    }

    // Shared Assets section
    if (sharedAssets.length > 0) {
      rows.push(['--- SHARED ASSETS ---'].join(','));
      rows.push(
        [
          'Asset ID',
          'Asset Name',
          'Tracker',
          'Country',
          'Capacity MW',
          'Co-Owner Count',
          'Total Share %',
          'Co-Owners',
        ].join(',')
      );
      for (const asset of sharedAssets) {
        rows.push(
          [
            asset.asset_id,
            `"${(asset.asset_name || '').replace(/"/g, '""')}"`,
            asset.tracker || '',
            asset.country || '',
            asset.capacity_mw || '',
            asset.co_owner_count || 0,
            asset.total_share_pct?.toFixed(2) || '',
            `"${(asset.co_owners || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
      }
      rows.push(''); // Empty line separator
    }

    // Common Owners section
    if (commonOwners.length > 0) {
      rows.push(['--- COMMON OWNERS ---'].join(','));
      rows.push(
        [
          'Entity ID',
          'Entity Name',
          'HQ Country',
          'Asset Count',
          'Total Capacity MW',
          'Avg Share %',
          'Projects',
        ].join(',')
      );
      for (const owner of commonOwners) {
        rows.push(
          [
            owner.entity_id,
            `"${(owner.entity_name || '').replace(/"/g, '""')}"`,
            owner.hq_country || '',
            owner.asset_count || 0,
            Math.round(owner.total_capacity_mw || 0),
            owner.avg_share_pct?.toFixed(2) || '',
            `"${(owner.projects || '').replace(/"/g, '""')}"`,
          ].join(',')
        );
      }
    }

    const csv = '\ufeff' + rows.join('\r\n'); // UTF-8 BOM for Excel
    downloadFile(csv, `gem-investigation-${Date.now()}.csv`, 'text/csv;charset=utf-8');
  }

  // Export to JSON
  function exportJSON() {
    const data = {
      report: {
        generated: new Date().toISOString(),
        version: '1.1',
        generator: 'GEM Viz Investigation Report',
      },
      cart: {
        total: cartItems.length,
        entities: entityIds,
        assets: assetIds,
        items: cartItems,
      },
      summary,
      entityPortfolios,
      connections: {
        sharedAssets,
        commonOwners,
      },
      geography: geoBreakdown,
    };

    const json = JSON.stringify(data, null, 2);
    downloadFile(json, `gem-investigation-${Date.now()}.json`, 'application/json');
  }

  // Generate shareable URL with cart IDs
  function generateShareUrl() {
    if (typeof window === 'undefined') return;
    const ids = cartItems.map((i) => i.id).join(',');
    const url = new URL(window.location.href);
    url.searchParams.set('ids', ids);
    shareUrl = url.toString();
  }

  // Copy share URL to clipboard
  async function copyShareUrl() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  // Load cart from URL params on mount
  function loadFromUrl() {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const idsParam = url.searchParams.get('ids');
    if (idsParam && cartItems.length === 0) {
      const ids = idsParam.split(',').filter((id) => /^[GE]\d+$/.test(id));
      if (ids.length > 0) {
        const items = ids.map((id) => ({
          id,
          name: id, // Will show ID until they navigate to the item
          type: /** @type {'asset' | 'entity'} */ (id.startsWith('G') ? 'asset' : 'entity'),
        }));
        investigationCart.addMany(items);
      }
    }
  }

  // Download helper
  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Print report
  function printReport() {
    setTimeout(() => window.print(), 100);
  }

  // Load on mount and when cart changes
  onMount(() => {
    loadFromUrl(); // Check for shared URL first
    loadReport();
  });

  $effect(() => {
    void cartItems;
    loadReport();
  });
</script>

<svelte:head>
  <title>Investigation Report — GEM Viz</title>
</svelte:head>

<main class="report-container">
  <!-- Header -->
  <header class="report-header no-print">
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> /
      <a href={link('explore')}>Explore</a> / Report
    </nav>
    <h1>Investigation Report</h1>
    <p class="lead">
      Co-ownership analysis for {cartItems.length} items in your investigation cart.
    </p>
  </header>

  <!-- Print Header (only shows in print) -->
  <div class="print-header print-only">
    <h1>GEM Ownership Investigation Report</h1>
    <p class="report-meta">Generated: {reportDate}</p>
    <p class="report-meta">
      {cartItems.length} items analyzed ({entityIds.length} entities, {assetIds.length} assets)
    </p>
  </div>

  {#if isEmpty}
    <section class="empty-cart">
      <h2>No Items in Cart</h2>
      <p>Add assets or entities to your investigation cart to generate a report.</p>
      <p>
        <a href={link('explore')}>Go to Explore</a> to search and add items.
      </p>
    </section>
  {:else if loading}
    <section class="loading">
      <p>Generating report...</p>
      <p class="loading-detail">Analyzing co-ownership patterns across {cartItems.length} items</p>
    </section>
  {:else if error}
    <section class="error">
      <h2>Error</h2>
      <p>{error}</p>
      <button class="btn" onclick={loadReport}>Retry</button>
    </section>
  {:else}
    <!-- Toolbar (no-print) -->
    <section class="toolbar no-print">
      <div class="toolbar-left">
        <span class="query-time">{queryTime}ms</span>
      </div>
      <div class="toolbar-right">
        <button
          class="btn btn-outline"
          class:active={copied}
          onclick={copyShareUrl}
          title="Copy shareable link"
        >
          {copied ? 'Copied!' : 'Share Link'}
        </button>
        <button class="btn btn-outline" onclick={printReport}>Print / PDF</button>
        <button class="btn btn-outline" onclick={exportCSV}>Export CSV</button>
        <button class="btn btn-outline" onclick={exportJSON}>Export JSON</button>
      </div>
    </section>

    <!-- Summary Stats -->
    <section class="summary-section">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="stat-item">
          <span class="stat-value">{summary.totalAssets.toLocaleString()}</span>
          <span class="stat-label">Assets</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{summary.totalCapacity.toLocaleString()}</span>
          <span class="stat-label">MW Capacity</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{summary.totalEntities || entityIds.length}</span>
          <span class="stat-label">Entities</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{summary.countries}</span>
          <span class="stat-label">Countries</span>
        </div>
      </div>
      {#if summary.trackers.length > 0}
        <div class="tracker-list">
          {#each summary.trackers as tracker}
            <span class="tracker-chip">
              <TrackerIcon {tracker} size={10} />
              {tracker}
            </span>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Cart Items -->
    <section class="cart-section">
      <h2>Investigation Cart ({cartItems.length})</h2>
      <div class="cart-grid">
        {#each cartItems as item}
          <div class="cart-item {item.type}">
            {#if item.type === 'asset'}
              <a href={assetLink(item.id)}>
                {#if item.tracker}<TrackerIcon tracker={item.tracker} size={10} />{/if}
                {item.name}
              </a>
            {:else}
              <a href={entityLink(item.id)}>
                <span class="entity-icon">E</span>
                {item.name}
              </a>
            {/if}
            <span class="item-id">{item.id}</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- Entity Portfolios (detailed breakdown per entity) -->
    {#if hasEntities && entityPortfolios.length > 0}
      <section class="connections-section page-break-before">
        <h2>Entity Portfolios ({entityPortfolios.length})</h2>
        <p class="section-intro">Complete asset portfolio for each entity in your investigation:</p>

        <div class="entity-portfolio-grid">
          {#each entityPortfolios as entity}
            <div class="entity-portfolio-card">
              <div class="portfolio-header">
                <a href={entityLink(entity.entity_id)} class="entity-link">
                  <span class="entity-icon">E</span>
                  <span class="entity-name">{entity.entity_name}</span>
                </a>
                <span class="entity-id">{entity.entity_id}</span>
              </div>

              <div class="portfolio-meta">
                {#if entity.hq_country}
                  <span class="meta-item">HQ: {entity.hq_country}</span>
                {/if}
                {#if entity.registration_country && entity.registration_country !== entity.hq_country}
                  <span class="meta-item">Reg: {entity.registration_country}</span>
                {/if}
              </div>

              <div class="portfolio-stats">
                <div class="portfolio-stat">
                  <span class="stat-num">{entity.asset_count}</span>
                  <span class="stat-label">Assets</span>
                </div>
                <div class="portfolio-stat">
                  <span class="stat-num"
                    >{Math.round(entity.total_capacity_mw || 0).toLocaleString()}</span
                  >
                  <span class="stat-label">MW</span>
                </div>
                <div class="portfolio-stat">
                  <span class="stat-num">{entity.country_count}</span>
                  <span class="stat-label">Countries</span>
                </div>
                <div class="portfolio-stat">
                  <span class="stat-num">{entity.avg_ownership_pct?.toFixed(1) || '-'}%</span>
                  <span class="stat-label">Avg Share</span>
                </div>
              </div>

              <div class="portfolio-breakdown">
                {#if entity.operating_count > 0}
                  <span class="status-chip operating">{entity.operating_count} operating</span>
                {/if}
                {#if entity.proposed_count > 0}
                  <span class="status-chip proposed">{entity.proposed_count} proposed</span>
                {/if}
                {#if entity.retired_count > 0}
                  <span class="status-chip retired">{entity.retired_count} retired</span>
                {/if}
              </div>

              {#if entity.trackers}
                <div class="portfolio-trackers">
                  {#each entity.trackers.split(', ') as tracker}
                    <span class="tracker-mini">
                      <TrackerIcon {tracker} size={8} />
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

    <!-- Shared Assets (when entities in cart) -->
    {#if hasEntities && sharedAssets.length > 0}
      <section class="connections-section page-break-before">
        <h2>Shared Assets ({sharedAssets.length})</h2>
        <p class="section-intro">Assets co-owned by multiple entities in your investigation:</p>

        <table class="data-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Tracker</th>
              <th>Country</th>
              <th>Capacity</th>
              <th>Co-Owners</th>
              <th>Total Share</th>
            </tr>
          </thead>
          <tbody>
            {#each sharedAssets as asset}
              <tr>
                <td>
                  <a href={assetLink(asset.asset_id)} class="asset-link">
                    {asset.asset_name || asset.asset_id}
                  </a>
                </td>
                <td>
                  {#if asset.tracker}<TrackerIcon tracker={asset.tracker} size={10} />{/if}
                  {asset.tracker || '-'}
                </td>
                <td>{asset.country || '-'}</td>
                <td class="numeric">{asset.capacity_mw?.toLocaleString() || '-'} MW</td>
                <td>
                  <span class="co-owner-count">{asset.co_owner_count}</span>
                  <span class="co-owner-names">{asset.co_owners}</span>
                </td>
                <td class="numeric">{asset.total_share_pct?.toFixed(1) || '-'}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {:else if hasEntities}
      <section class="connections-section">
        <h2>Shared Assets</h2>
        <p class="no-results">No shared assets found between the selected entities.</p>
      </section>
    {/if}

    <!-- Common Owners (when assets in cart) -->
    {#if hasAssets && commonOwners.length > 0}
      <section class="connections-section page-break-before">
        <h2>Common Owners ({commonOwners.length})</h2>
        <p class="section-intro">Entities that own assets in your investigation:</p>

        <table class="data-table">
          <thead>
            <tr>
              <th>Entity</th>
              <th>HQ Country</th>
              <th>Assets</th>
              <th>Total Capacity</th>
              <th>Avg Share</th>
              <th>Projects</th>
            </tr>
          </thead>
          <tbody>
            {#each commonOwners as owner}
              <tr>
                <td>
                  <a href={entityLink(owner.entity_id)} class="entity-link">
                    <span class="entity-icon">E</span>
                    {owner.entity_name || owner.entity_id}
                  </a>
                </td>
                <td>{owner.hq_country || '-'}</td>
                <td class="numeric">{owner.asset_count}</td>
                <td class="numeric">{owner.total_capacity_mw?.toLocaleString() || '-'} MW</td>
                <td class="numeric">{owner.avg_share_pct?.toFixed(1) || '-'}%</td>
                <td class="truncate">{owner.projects || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {:else if hasAssets}
      <section class="connections-section">
        <h2>Common Owners</h2>
        <p class="no-results">No owner data found for the selected assets.</p>
      </section>
    {/if}

    <!-- Geographic Breakdown -->
    {#if geoBreakdown.length > 0}
      <section class="connections-section page-break-before">
        <h2>Geographic Breakdown ({geoBreakdown.length} countries)</h2>
        <p class="section-intro">Distribution of assets by country:</p>

        <table class="data-table">
          <thead>
            <tr>
              <th>Country</th>
              <th>Assets</th>
              <th>Capacity (MW)</th>
              <th>Entities</th>
              <th>Trackers</th>
            </tr>
          </thead>
          <tbody>
            {#each geoBreakdown as row}
              <tr>
                <td class="country-name">{row.country}</td>
                <td class="numeric">{row.asset_count?.toLocaleString()}</td>
                <td class="numeric">{row.total_capacity?.toLocaleString() || '-'}</td>
                <td class="numeric">{row.entity_count}</td>
                <td class="tracker-cell">
                  {#if row.trackers}
                    {#each row.trackers.split(', ') as tracker}
                      <span class="tracker-mini">
                        <TrackerIcon {tracker} size={8} />
                      </span>
                    {/each}
                  {:else}
                    -
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    <!-- Print Footer -->
    <footer class="print-footer print-only">
      <p>Generated by GEM Viz on {reportDate}</p>
      <p>Data source: Global Energy Monitor Ownership Tracker</p>
    </footer>
  {/if}
</main>

<style>
  /* Base Layout */
  .report-container {
    width: 100%;
    padding: 40px 20px;
    font-family: system-ui, sans-serif;
  }

  /* Header */
  .report-header {
    margin-bottom: 32px;
  }
  .breadcrumb {
    font-size: 12px;
    margin-bottom: 12px;
  }
  .breadcrumb a {
    color: #333;
    text-decoration: none;
  }
  .breadcrumb a:hover {
    text-decoration: underline;
  }
  h1 {
    font-size: 28px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .lead {
    font-size: 14px;
    color: #666;
    margin: 0;
  }

  /* States */
  .loading,
  .error,
  .empty-cart {
    text-align: center;
    padding: 60px 20px;
    background: transparent;
    border: none;
  }
  .loading-detail {
    font-size: 12px;
    color: #999;
  }
  .error {
    color: #c00;
  }
  .empty-cart h2 {
    margin-top: 0;
  }
  .empty-cart a {
    color: #333;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 12px 16px;
    background: transparent;
    border: none;
  }
  .toolbar-right {
    display: flex;
    gap: 8px;
  }
  .query-time {
    font-size: 10px;
    color: #999;
    font-family: monospace;
  }

  /* Summary */
  .summary-section {
    margin-bottom: 32px;
    padding: 20px;
    background: transparent;
    border: none;
  }
  .summary-section h2 {
    margin: 0 0 16px 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 8px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }
  .stat-item {
    text-align: center;
  }
  .stat-value {
    display: block;
    font-size: 24px;
    font-weight: bold;
    color: #000;
  }
  .stat-label {
    display: block;
    font-size: 10px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
  }
  .tracker-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tracker-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    background: #fff;
    border: none;
  }

  /* Cart Items */
  .cart-section {
    margin-bottom: 32px;
  }
  .cart-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
  }
  .cart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
  }
  .cart-item {
    padding: 8px 12px;
    background: #fff;
    border: none;
    font-size: 12px;
  }
  .cart-item a {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #000;
    text-decoration: none;
  }
  .cart-item a:hover {
    text-decoration: underline;
  }
  .cart-item .item-id {
    display: block;
    font-size: 10px;
    color: #999;
    font-family: monospace;
    margin-top: 2px;
  }
  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #333;
    color: white;
    border-radius: 50%;
    font-size: 9px;
    font-weight: bold;
    flex-shrink: 0;
  }

  /* Connections Sections */
  .connections-section {
    margin-bottom: 32px;
  }
  .connections-section h2 {
    font-size: 16px;
    margin: 0 0 8px 0;
    border-bottom: 1px solid #000;
    padding-bottom: 8px;
  }
  .section-intro {
    font-size: 13px;
    color: #666;
    margin: 0 0 16px 0;
  }
  .no-results {
    font-size: 13px;
    color: #666;
    padding: 20px;
    background: transparent;
    text-align: center;
  }

  /* Data Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .data-table th {
    text-align: left;
    padding: 10px 8px;
    background: transparent;
    border: none;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-weight: 600;
  }
  .data-table td {
    padding: 10px 8px;
    border: none;
    vertical-align: top;
  }
  .data-table tbody tr:hover {
    background: transparent;
  }
  .data-table .numeric {
    text-align: right;
    font-family: monospace;
  }
  .data-table .truncate {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-link,
  .entity-link {
    color: #000;
    text-decoration: underline;
  }
  .entity-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .co-owner-count {
    display: inline-block;
    padding: 2px 6px;
    background: #333;
    color: white;
    font-size: 10px;
    font-weight: bold;
    margin-right: 6px;
  }
  .co-owner-names {
    font-size: 11px;
    color: #666;
  }
  .country-name {
    font-weight: 600;
  }
  .tracker-cell {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .tracker-mini {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: transparent;
    border: 1px solid #eee;
    font-size: 10px;
  }

  /* Entity Portfolio Cards */
  .entity-portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
  }
  .entity-portfolio-card {
    background: #fff;
    border: none;
    border-left: 4px solid #333;
    padding: 16px;
  }
  .portfolio-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 8px;
  }
  .portfolio-header .entity-link {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: #000;
    text-decoration: none;
  }
  .portfolio-header .entity-link:hover {
    text-decoration: underline;
  }
  .portfolio-header .entity-name {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .portfolio-header .entity-id {
    font-size: 10px;
    font-family: monospace;
    color: #999;
  }
  .portfolio-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: #666;
    margin-bottom: 12px;
  }
  .portfolio-meta .meta-item {
    padding: 2px 6px;
    background: transparent;
    border-radius: 2px;
  }
  .portfolio-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    padding: 12px 0;
    border-top: 1px solid #eee;
    border-bottom: 1px solid #eee;
    margin-bottom: 12px;
  }
  .portfolio-stat {
    text-align: center;
  }
  .portfolio-stat .stat-num {
    display: block;
    font-size: 18px;
    font-weight: bold;
    color: #000;
  }
  .portfolio-stat .stat-label {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.3px;
  }
  .portfolio-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .status-chip {
    font-size: 10px;
    padding: 3px 8px;
    border: 1px solid currentColor;
  }
  .status-chip.operating {
    color: #333;
  }
  .status-chip.proposed {
    color: #888;
  }
  .status-chip.retired {
    color: #000;
  }
  .portfolio-trackers {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  /* Print-only elements */
  .print-only {
    display: none;
  }
  .print-header {
    text-align: center;
    margin-bottom: 24px;
  }
  .print-header h1 {
    font-size: 20pt;
  }
  .report-meta {
    font-size: 10pt;
    color: #666;
    margin: 4px 0;
  }
  .print-footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #000;
    font-size: 9pt;
    color: #666;
    text-align: center;
  }

  /* Print Styles */
  @media print {
    .no-print {
      display: none !important;
    }
    .print-only {
      display: block !important;
    }

    @page {
      size: A4 portrait;
      margin: 2cm 1.5cm;
    }

    body {
      font-size: 10pt;
      line-height: 1.4;
    }

    .report-container {
      max-width: 100%;
      padding: 0;
    }

    h1 {
      font-size: 18pt;
    }
    h2 {
      font-size: 14pt;
      page-break-after: avoid;
    }

    .summary-section,
    .cart-section,
    .connections-section {
      page-break-inside: avoid;
    }

    .page-break-before {
      page-break-before: always;
    }

    .data-table {
      font-size: 9pt;
    }
    .data-table th {
      background: #f0f0f0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    thead {
      display: table-header-group;
    }
    tbody tr {
      page-break-inside: avoid;
    }

    .summary-grid {
      border: 1pt solid #000;
      padding: 10pt;
    }
    .stat-value {
      font-size: 16pt;
    }

    a {
      color: #000;
      text-decoration: none;
    }
    a[href]:after {
      content: '';
    }

    .entity-icon,
    .co-owner-count {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .summary-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .cart-grid {
      grid-template-columns: 1fr;
    }
    .data-table {
      font-size: 11px;
    }
    .toolbar {
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
