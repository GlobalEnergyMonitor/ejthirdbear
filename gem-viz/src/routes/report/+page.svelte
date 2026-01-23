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
  import { buildIdList } from '$lib/utils/sql';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import PatternInsights from '$lib/components/PatternInsights.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import ExportPanel from '$lib/components/ExportPanel.svelte';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import InvestigationStatusChart from '$lib/components/InvestigationStatusChart.svelte';
  import InvestigationNetwork from '$lib/components/InvestigationNetwork.svelte';
  import InvestigationMap from '$lib/components/InvestigationMap.svelte';

  // State
  let loading = $state(true);
  let error = $state(null);
  let sharedAssets = $state([]);
  let commonOwners = $state([]);
  let geoBreakdown = $state([]);
  let entityPortfolios = $state([]); // Full portfolio for each entity
  let assetDetails = $state([]); // Full details for assets in cart
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
  let showClearConfirm = $state(false);

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const entityIds = $derived(cartItems.filter((i) => i.type === 'entity').map((i) => i.id));
  const assetIds = $derived(cartItems.filter((i) => i.type === 'asset').map((i) => i.id));
  const hasEntities = $derived(entityIds.length > 0);
  const hasAssets = $derived(assetIds.length > 0);
  const isEmpty = $derived(cartItems.length === 0);

  // Format timestamp
  const reportDate = new Date().toLocaleString();

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
          COALESCE(l."Country.Area", 'Unknown') as country,
          COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw,
          o."Owner GEM Entity ID" as entity_id,
          o."Owner" as owner_name,
          COALESCE(CAST(o."Share" AS DOUBLE), 0) as share_pct
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        INNER JOIN cart_entities c ON o."Owner GEM Entity ID" = c.entity_id
        WHERE o."GEM unit ID" IS NOT NULL
      ),
      shared AS (
        SELECT
          asset_id,
          asset_name,
          tracker,
          status,
          MAX(country) as country,
          MAX(capacity_mw) as capacity_mw,
          COUNT(DISTINCT entity_id) as co_owner_count,
          STRING_AGG(DISTINCT owner_name, '; ' ORDER BY owner_name) as co_owners,
          STRING_AGG(DISTINCT entity_id, '; ' ORDER BY entity_id) as co_owner_ids,
          SUM(share_pct) as total_share_pct
        FROM entity_assets
        GROUP BY asset_id, asset_name, tracker, status
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

  // Query for geographic breakdown (join locations parquet for asset country)
  async function queryGeoBreakdown() {
    const entityList = entityIds.length > 0 ? buildIdList(entityIds) : "'__none__'";
    const assetList = assetIds.length > 0 ? buildIdList(assetIds) : "'__none__'";

    const sql = `
      SELECT
        COALESCE(l."Country.Area", 'Unknown') as country,
        COUNT(DISTINCT o."GEM unit ID") as asset_count,
        COALESCE(SUM(CAST(o."Capacity (MW)" AS DOUBLE)), 0) as total_capacity,
        COUNT(DISTINCT o."Owner GEM Entity ID") as entity_count,
        STRING_AGG(DISTINCT o."Tracker", ', ' ORDER BY o."Tracker") as trackers
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."Owner GEM Entity ID" IN (${entityList})
         OR o."GEM unit ID" IN (${assetList})
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
        COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as country_count,
        STRING_AGG(DISTINCT o."Tracker", ', ' ORDER BY o."Tracker") as trackers,
        STRING_AGG(
          DISTINCT COALESCE(l."Country.Area", 'Unknown'),
          ', '
          ORDER BY COALESCE(l."Country.Area", 'Unknown')
        ) as countries,
        COUNT(DISTINCT CASE WHEN o."Status" = 'operating' THEN o."GEM unit ID" END) as operating_count,
        COUNT(DISTINCT CASE WHEN o."Status" = 'proposed' THEN o."GEM unit ID" END) as proposed_count,
        COUNT(DISTINCT CASE WHEN o."Status" = 'retired' THEN o."GEM unit ID" END) as retired_count
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."Owner GEM Entity ID" IN (${idList})
      GROUP BY o."Owner GEM Entity ID", o."Owner"
      ORDER BY total_capacity_mw DESC
    `;

    const result = await widgetQuery(sql);
    return result.success ? result.data || [] : [];
  }

  // Query for full asset details (for assets in cart)
  // Uses only columns confirmed to exist in the ownership parquet
  async function queryAssetDetails() {
    if (assetIds.length === 0) return [];

    const idList = buildIdList(assetIds);

    const sql = `
      SELECT
        o."GEM unit ID" as asset_id,
        o."Project" as asset_name,
        o."Tracker" as tracker,
        o."Status" as status,
        o."GEM location ID" as location_id,
        COALESCE(l."Country.Area", 'Unknown') as country,
        COALESCE(CAST(o."Capacity (MW)" AS DOUBLE), 0) as capacity_mw,
        o."Owner" as owner_name,
        o."Owner GEM Entity ID" as owner_entity_id,
        o."Owner Headquarters Country" as owner_hq_country,
        o."Owner Registration Country" as owner_reg_country,
        COALESCE(CAST(o."Share" AS DOUBLE), 0) as ownership_share,
        o."Immediate Project Owner" as immediate_owner,
        o."Immediate Project Owner GEM Entity ID" as immediate_owner_id
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."GEM unit ID" IN (${idList})
      ORDER BY o."Project"
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
        COUNT(DISTINCT o."GEM unit ID") as total_assets,
        COALESCE(SUM(CAST(o."Capacity (MW)" AS DOUBLE)), 0) as total_capacity,
        COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as countries,
        COUNT(DISTINCT o."Tracker") as tracker_count,
        COUNT(DISTINCT o."Owner GEM Entity ID") as total_entities,
        STRING_AGG(DISTINCT o."Tracker", ', ') as trackers
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."Owner GEM Entity ID" IN (${entityList})
         OR o."GEM unit ID" IN (${assetList})
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
      const [shared, common, geo, portfolios, assets, stats] = await Promise.all([
        querySharedAssets(),
        queryCommonOwners(),
        queryGeoBreakdown(),
        queryEntityPortfolios(),
        queryAssetDetails(),
        querySummary(),
      ]);

      sharedAssets = shared;
      commonOwners = common;
      geoBreakdown = geo;
      entityPortfolios = portfolios;
      assetDetails = assets;
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

  // CSV helper
  const esc = (s) => `"${String(s || '').replace(/"/g, '""')}"`;

  // Export metadata/summary CSV (human-readable report info)
  function exportMetadataCSV() {
    const rows = [];
    const ts = Date.now();

    rows.push(['GEM Investigation Report Metadata']);
    rows.push(['Generated', new Date().toISOString()]);
    rows.push(['Total Cart Items', cartItems.length]);
    rows.push(['Entities in Cart', entityIds.length]);
    rows.push(['Assets in Cart', assetIds.length]);
    rows.push(['Total Assets (all portfolios)', summary.totalAssets]);
    rows.push(['Total Capacity MW', summary.totalCapacity]);
    rows.push(['Countries', summary.countries]);
    rows.push(['Trackers', summary.trackers.join('; ')]);
    rows.push([]);
    rows.push(['--- CART CONTENTS ---']);
    rows.push(['Item ID', 'Item Name', 'Type', 'Tracker', 'Added At']);
    for (const item of cartItems) {
      rows.push([
        item.id,
        esc(item.name),
        item.type,
        item.tracker || '',
        new Date(item.addedAt).toISOString(),
      ]);
    }
    rows.push([]);
    rows.push(['--- GEOGRAPHIC SUMMARY ---']);
    rows.push(['Country', 'Asset Count', 'Capacity MW', 'Entity Count', 'Trackers']);
    for (const g of geoBreakdown) {
      rows.push([
        g.country || '',
        g.asset_count || 0,
        Math.round(g.total_capacity || 0),
        g.entity_count || 0,
        g.trackers || '',
      ]);
    }

    const csv = '\ufeff' + rows.map((r) => r.join(',')).join('\r\n');
    downloadFile(csv, `gem-report-metadata-${ts}.csv`, 'text/csv;charset=utf-8');
  }

  // Export clean data CSV (proper format for Excel/Pandas/etc)
  function exportDataCSV() {
    const ts = Date.now();

    // Asset details - clean CSV with header row
    if (assetDetails.length > 0) {
      const assetRows = [];
      assetRows.push(
        [
          'asset_id',
          'asset_name',
          'tracker',
          'status',
          'location_id',
          'capacity_mw',
          'owner_name',
          'owner_entity_id',
          'owner_hq_country',
          'owner_reg_country',
          'ownership_share_pct',
          'immediate_owner',
          'immediate_owner_id',
        ].join(',')
      );
      for (const a of assetDetails) {
        assetRows.push(
          [
            a.asset_id || '',
            esc(a.asset_name),
            a.tracker || '',
            a.status || '',
            a.location_id || '',
            a.capacity_mw || 0,
            esc(a.owner_name),
            a.owner_entity_id || '',
            a.owner_hq_country || '',
            a.owner_reg_country || '',
            a.ownership_share || '',
            esc(a.immediate_owner),
            a.immediate_owner_id || '',
          ].join(',')
        );
      }
      const assetCsv = '\ufeff' + assetRows.join('\r\n');
      downloadFile(assetCsv, `gem-assets-${ts}.csv`, 'text/csv;charset=utf-8');
    }

    // Entity portfolios - clean CSV
    if (entityPortfolios.length > 0) {
      const entityRows = [];
      entityRows.push(
        [
          'entity_id',
          'entity_name',
          'hq_country',
          'registration_country',
          'asset_count',
          'total_capacity_mw',
          'avg_ownership_pct',
          'operating_count',
          'proposed_count',
          'retired_count',
          'trackers',
        ].join(',')
      );
      for (const e of entityPortfolios) {
        entityRows.push(
          [
            e.entity_id || '',
            esc(e.entity_name),
            e.hq_country || '',
            e.registration_country || '',
            e.asset_count || 0,
            Math.round(e.total_capacity_mw || 0),
            e.avg_ownership_pct?.toFixed(2) || '',
            e.operating_count || 0,
            e.proposed_count || 0,
            e.retired_count || 0,
            esc(e.trackers),
          ].join(',')
        );
      }
      const entityCsv = '\ufeff' + entityRows.join('\r\n');
      downloadFile(entityCsv, `gem-entities-${ts}.csv`, 'text/csv;charset=utf-8');
    }

    // Co-ownership data - clean CSV
    if (sharedAssets.length > 0) {
      const sharedRows = [];
      sharedRows.push(
        [
          'asset_id',
          'asset_name',
          'tracker',
          'status',
          'capacity_mw',
          'co_owner_count',
          'total_share_pct',
          'co_owners',
          'co_owner_ids',
        ].join(',')
      );
      for (const a of sharedAssets) {
        sharedRows.push(
          [
            a.asset_id || '',
            esc(a.asset_name),
            a.tracker || '',
            a.status || '',
            a.capacity_mw || '',
            a.co_owner_count || 0,
            a.total_share_pct?.toFixed(2) || '',
            esc(a.co_owners),
            esc(a.co_owner_ids),
          ].join(',')
        );
      }
      const sharedCsv = '\ufeff' + sharedRows.join('\r\n');
      downloadFile(sharedCsv, `gem-shared-assets-${ts}.csv`, 'text/csv;charset=utf-8');
    }

    // Common owners - clean CSV
    if (commonOwners.length > 0) {
      const ownerRows = [];
      ownerRows.push(
        [
          'entity_id',
          'entity_name',
          'hq_country',
          'registration_country',
          'asset_count',
          'total_capacity_mw',
          'avg_share_pct',
          'trackers',
          'projects',
        ].join(',')
      );
      for (const o of commonOwners) {
        ownerRows.push(
          [
            o.entity_id || '',
            esc(o.entity_name),
            o.hq_country || '',
            o.registration_country || '',
            o.asset_count || 0,
            Math.round(o.total_capacity_mw || 0),
            o.avg_share_pct?.toFixed(2) || '',
            esc(o.trackers),
            esc(o.projects),
          ].join(',')
        );
      }
      const ownerCsv = '\ufeff' + ownerRows.join('\r\n');
      downloadFile(ownerCsv, `gem-common-owners-${ts}.csv`, 'text/csv;charset=utf-8');
    }
  }

  // Export to JSON - comprehensive export with all details
  function exportJSON() {
    const data = {
      report: {
        generated: new Date().toISOString(),
        version: '1.2',
        generator: 'GEM Viz Investigation Report',
      },
      cart: {
        total: cartItems.length,
        entities: entityIds,
        assets: assetIds,
        items: cartItems,
      },
      summary,
      assetDetails, // Full details for each asset in cart
      entityPortfolios, // Full portfolio for each entity in cart
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

  // Clear cart with confirmation
  function clearCart() {
    investigationCart.clear();
    showClearConfirm = false;
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
        <button
          class="btn btn-outline"
          onclick={exportMetadataCSV}
          title="Summary, cart contents, geographic breakdown">Export Summary</button
        >
        <button
          class="btn btn-outline"
          onclick={exportDataCSV}
          title="Clean CSV files for Excel/Pandas (downloads multiple files)"
          >Export Data CSVs</button
        >
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

    <!-- Pattern Analysis -->
    <PatternInsights {entityPortfolios} {sharedAssets} {commonOwners} {geoBreakdown} />

    <!-- Visualizations Section -->
    <section class="viz-section no-print">
      <h2>Visual Analysis</h2>

      <div class="viz-grid">
        <!-- Status Distribution Chart -->
        <div class="viz-cell">
          <InvestigationStatusChart {assetDetails} {entityPortfolios} />
        </div>

        <!-- Ownership Network -->
        <div class="viz-cell wide">
          <InvestigationNetwork {entityIds} {assetIds} {sharedAssets} {commonOwners} />
        </div>
      </div>

      <!-- Geographic Map -->
      <InvestigationMap {entityIds} {assetIds} />
    </section>

    <!-- Cart Items -->
    <section class="cart-section">
      <div class="cart-header">
        <h2>Investigation Cart ({cartItems.length})</h2>
        <button
          class="btn btn-danger btn-sm"
          onclick={() => (showClearConfirm = true)}
          disabled={cartItems.length === 0}
        >
          Clear Cart
        </button>
      </div>
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

              <!-- Ownership Flower visualization -->
              <div class="portfolio-flower no-print">
                <OwnershipFlower
                  ownerId={entity.entity_id}
                  size="small"
                  showLabels={false}
                  showTitle={false}
                />
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

    <!-- Citation -->
    <Citation variant="full" trackers={summary.trackers} />

    <section id="export" class="export-section no-print">
      <ExportPanel />
    </section>

    <!-- Print Footer -->
    <footer class="print-footer print-only">
      <p>Generated by GEM Viz on {reportDate}</p>
      <p>Data source: Global Energy Monitor Ownership Tracker</p>
    </footer>
  {/if}

  <!-- Clear Cart Confirmation Modal -->
  {#if showClearConfirm}
    <div
      class="modal-overlay"
      onclick={() => (showClearConfirm = false)}
      onkeydown={(e) => e.key === 'Escape' && (showClearConfirm = false)}
      role="button"
      tabindex="-1"
      aria-label="Close modal"
    >
      <div
        class="modal-dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="clear-cart-title"
        tabindex="-1"
      >
        <h3 id="clear-cart-title">Clear Investigation Cart?</h3>
        <p>
          This will remove all {cartItems.length} items from your cart. This action cannot be undone.
        </p>
        <div class="modal-actions">
          <button class="btn btn-outline" onclick={() => (showClearConfirm = false)}>Cancel</button>
          <button class="btn btn-danger" onclick={clearCart}>Yes, Clear Cart</button>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  /* Base Layout */
  .report-container {
    width: 100%;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  /* Header */
  .report-header {
    margin-bottom: var(--space-8);
  }
  .breadcrumb {
    font-size: var(--font-size-body);
    margin-bottom: var(--space-3);
  }
  .breadcrumb a {
    color: var(--color-gray-700);
    text-decoration: none;
  }
  .breadcrumb a:hover {
    text-decoration: underline;
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
  .loading,
  .error,
  .empty-cart {
    text-align: center;
    padding: var(--space-16) var(--space-5);
    background: transparent;
    border: none;
  }
  .loading-detail {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }
  .error {
    color: var(--color-error);
  }
  .empty-cart h2 {
    margin-top: 0;
  }
  .empty-cart a {
    color: var(--color-gray-700);
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-6);
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
  }
  .toolbar-right {
    display: flex;
    gap: var(--space-2);
  }
  .query-time {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  /* Summary */
  .summary-section {
    margin-bottom: var(--space-8);
    padding: var(--space-5);
    background: transparent;
    border: none;
  }
  .summary-section h2 {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    padding-bottom: var(--space-2);
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .stat-item {
    text-align: center;
  }
  .stat-value {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: bold;
    color: var(--color-black);
  }
  .stat-label {
    display: block;
    font-size: var(--font-size-base);
    text-transform: uppercase;
    color: var(--color-text-secondary);
    letter-spacing: var(--tracking-wide);
  }
  .tracker-list {
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
    border: none;
  }

  /* Cart Items */
  .cart-section {
    margin-bottom: var(--space-8);
  }
  .cart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }
  .cart-section h2 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0;
  }
  .btn-danger {
    background: var(--color-error);
    color: var(--color-white);
    border-color: var(--color-error);
  }
  .btn-danger:hover {
    background: var(--color-error);
    border-color: var(--color-error);
  }
  .btn-danger:disabled {
    background: var(--color-gray-300);
    border-color: var(--color-gray-300);
    cursor: not-allowed;
  }
  .btn-sm {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-dialog {
    background: var(--color-white);
    padding: var(--space-6);
    max-width: 400px;
    border: 0;
  }
  .modal-dialog h3 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-xl);
  }
  .modal-dialog p {
    margin: 0 0 var(--space-5) 0;
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
  }
  .modal-actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }
  .cart-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2);
  }
  .cart-item {
    padding: var(--space-2) var(--space-3);
    border: none;
    font-size: var(--font-size-body);
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
  .cart-item .item-id {
    display: block;
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    margin-top: 2px;
  }
  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--space-4);
    height: var(--space-4);
    font-size: 9px;
    font-weight: bold;
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }

  /* Connections Sections */
  .connections-section {
    margin-bottom: var(--space-8);
  }
  .connections-section h2 {
    font-size: var(--font-size-xl);
    margin: 0 0 var(--space-2) 0;
    padding-bottom: var(--space-2);
  }
  .section-intro {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .no-results {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    padding: var(--space-5);
    background: transparent;
    text-align: center;
  }

  /* Data Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-body);
  }
  .data-table th {
    text-align: left;
    padding: var(--space-2) var(--space-2);
    background: transparent;
    border: none;
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-weight: 600;
  }
  .data-table td {
    padding: var(--space-2) var(--space-2);
    border: none;
    vertical-align: top;
  }
  .data-table tbody tr:hover {
    background: transparent;
  }
  .data-table .numeric {
    text-align: right;
    font-family: var(--font-family-mono);
  }
  .data-table .truncate {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .asset-link,
  .entity-link {
    color: var(--color-black);
    text-decoration: underline;
  }
  .entity-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .co-owner-count {
    display: inline-block;
    padding: 2px var(--space-1);
    font-size: var(--font-size-base);
    font-weight: bold;
    margin-right: var(--space-1);
    color: var(--color-text-secondary);
  }
  .co-owner-names {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
  .country-name {
    font-weight: 600;
  }
  .tracker-cell {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
  }
  .tracker-mini {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-1);
    background: transparent;
    border: 0;
    font-size: var(--font-size-base);
  }

  /* Entity Portfolio Cards */
  .entity-portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-4);
  }
  .entity-portfolio-card {
    border: none;
    padding: var(--space-4);
  }
  .portfolio-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-2);
  }
  .portfolio-header .entity-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
    font-size: var(--font-size-lg);
    color: var(--color-black);
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
    font-size: var(--font-size-base);
    font-family: var(--font-family-mono);
    color: var(--color-text-tertiary);
  }
  .portfolio-meta {
    display: flex;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }
  .portfolio-meta .meta-item {
    padding: 2px var(--space-1);
    background: transparent;
    border-radius: var(--radius-sm);
  }
  .portfolio-stats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--space-2);
    padding: var(--space-3) 0;
    margin-bottom: var(--space-3);
  }
  .portfolio-stat {
    text-align: center;
  }
  .portfolio-stat .stat-num {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: bold;
    color: var(--color-black);
  }
  .portfolio-stat .stat-label {
    display: block;
    font-size: 9px;
    text-transform: uppercase;
    color: var(--color-text-secondary);
    letter-spacing: var(--tracking-wide);
  }
  .portfolio-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
  }
  .status-chip {
    font-size: var(--font-size-base);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
  .status-chip.operating {
    background: var(--color-gray-100);
    color: var(--color-status-operating);
  }
  .status-chip.proposed {
    background: transparent;
    color: var(--color-status-prospective);
  }
  .status-chip.retired {
    background: transparent;
    color: var(--color-status-retired);
  }
  .portfolio-trackers {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .portfolio-flower {
    display: flex;
    justify-content: center;
    padding: var(--space-2) 0;
  }

  /* Visualization Section */
  .viz-section {
    margin-bottom: var(--space-8);
  }

  .export-section {
    margin-top: var(--space-8);
  }
  .viz-section h2 {
    font-size: var(--font-size-xl);
    margin: 0 0 var(--space-4) 0;
    padding-bottom: var(--space-2);
  }
  .viz-grid {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: var(--space-5);
    margin-bottom: var(--space-5);
  }
  .viz-cell {
    min-width: 0;
  }
  .viz-cell.wide {
    grid-column: span 1;
  }
  @media (max-width: 900px) {
    .viz-grid {
      grid-template-columns: 1fr;
    }
    .viz-cell.wide {
      grid-column: span 1;
    }
  }

  /* Print-only elements */
  .print-only {
    display: none;
  }
  .print-header {
    text-align: center;
    margin-bottom: var(--space-6);
  }
  .print-header h1 {
    font-size: 20pt;
  }
  .report-meta {
    font-size: 10pt;
    color: var(--color-text-secondary);
    margin: var(--space-1) 0;
  }
  .print-footer {
    margin-top: var(--space-10);
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--color-black);
    font-size: 9pt;
    color: var(--color-text-secondary);
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

    :global(body) {
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
      background: var(--color-gray-100) !important;
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
      border: 1pt solid var(--color-black);
      padding: 10pt;
    }
    .stat-value {
      font-size: 16pt;
    }

    a {
      color: var(--color-black);
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
      font-size: var(--font-size-sm);
    }
    .toolbar {
      flex-direction: column;
      gap: var(--space-3);
    }
  }
</style>
