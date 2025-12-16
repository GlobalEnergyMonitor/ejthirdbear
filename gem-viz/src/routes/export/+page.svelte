<script>
  import { goto } from '$app/navigation';
  import { link, assetLink, entityLink, assetPath } from '$lib/links';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { investigationCart } from '$lib/investigationCart';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state(null);
  let dbReady = $state(false);
  let exportProgress = $state('');
  // Derived cart data
  const cartItems = $derived($investigationCart);
  const assetItems = $derived(cartItems.filter((i) => i.type === 'asset'));
  const entityItems = $derived(cartItems.filter((i) => i.type === 'entity'));
  const totalCount = $derived(cartItems.length);
  const assetCount = $derived(assetItems.length);
  const entityCount = $derived(entityItems.length);

  // Clear entire list
  function clearAll() {
    if (confirm('Remove all items from cart?')) {
      investigationCart.clear();
    }
  }

  // Initialize DuckDB for export
  async function ensureDB() {
    if (dbReady) return;

    loading = true;
    try {
      await initDuckDB();

      const ownershipResult = await loadParquetFromPath(
        assetPath('all_trackers_ownership@1.parquet'),
        'ownership'
      );
      if (!ownershipResult.success) throw new Error(ownershipResult.error);

      const locResult = await loadParquetFromPath(
        assetPath('asset_locations.parquet'),
        'locations'
      );
      if (!locResult.success) throw new Error(locResult.error);

      dbReady = true;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Escape SQL string
  function escapeSQL(str) {
    return str.replace(/'/g, "''");
  }

  // Build ID list for SQL IN clause
  function buildIdList(ids) {
    return ids.map((id) => `'${escapeSQL(id)}'`).join(',');
  }

  // Export assets CSV
  async function exportAssetsCSV() {
    const ids = assetItems.map((a) => a.id);
    if (ids.length === 0) {
      alert('No assets in cart');
      return;
    }

    exporting = true;
    exportProgress = 'Initializing database...';
    error = null;

    try {
      await ensureDB();

      exportProgress = `Querying data for ${ids.length} assets...`;
      const idList = buildIdList(ids);

      const sql = `
        SELECT
          o.*,
          l."Latitude",
          l."Longitude"
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE o."GEM unit ID" IN (${idList})
        ORDER BY o."GEM unit ID", o."Owner"
      `;

      const result = await query(sql);
      if (!result.success) throw new Error(result.error || 'Query failed');

      const data = result.data || [];
      if (data.length === 0) {
        throw new Error('No data found for selected assets.');
      }

      exportProgress = `Converting ${data.length} rows to CSV...`;
      const csv = convertToCSV(data);
      const filename = `gem-assets-${ids.length}-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(csv, filename);

      exportProgress = `Exported ${data.length} rows for ${ids.length} assets`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Export entities CSV - includes their portfolio (owned assets)
  async function exportEntitiesCSV() {
    const ids = entityItems.map((e) => e.id);
    if (ids.length === 0) {
      alert('No entities in cart');
      return;
    }

    exporting = true;
    exportProgress = 'Initializing database...';
    error = null;

    try {
      await ensureDB();

      exportProgress = `Querying portfolio for ${ids.length} entities...`;
      const idList = buildIdList(ids);

      // Query all assets owned by these entities
      const sql = `
        SELECT
          'Entity Portfolio' as "Record Type",
          o."Owner GEM Entity ID" as "Entity ID",
          o."Owner" as "Entity Name",
          o."Owner Registration Country" as "Entity Registration Country",
          o."Owner Headquarters Country" as "Entity HQ Country",
          o."GEM unit ID" as "Asset ID",
          o."Project" as "Asset Name",
          o."Unit" as "Unit Name",
          o."Tracker" as "Asset Type",
          o."Status" as "Asset Status",
          o."Country" as "Asset Country",
          CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
          CAST(o."Share" AS DOUBLE) as "Ownership Share %",
          o."Ownership Path" as "Ownership Path"
        FROM ownership o
        WHERE o."Owner GEM Entity ID" IN (${idList})
        ORDER BY o."Owner", o."Project"
      `;

      const result = await query(sql);
      if (!result.success) throw new Error(result.error || 'Query failed');

      const data = result.data || [];
      if (data.length === 0) {
        throw new Error('No portfolio data found for selected entities.');
      }

      exportProgress = `Converting ${data.length} rows to CSV...`;
      const csv = convertToCSV(data);
      const filename = `gem-entities-${ids.length}-portfolio-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(csv, filename);

      exportProgress = `Exported ${data.length} ownership records for ${ids.length} entities`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Export everything (combined)
  async function exportAllCSV() {
    if (totalCount === 0) {
      alert('No items in cart');
      return;
    }

    exporting = true;
    exportProgress = 'Initializing database...';
    error = null;

    try {
      await ensureDB();

      const assetIds = assetItems.map((a) => a.id);
      const entityIds = entityItems.map((e) => e.id);
      const allData = [];

      // Query assets
      if (assetIds.length > 0) {
        exportProgress = `Querying ${assetIds.length} assets...`;
        const assetIdList = buildIdList(assetIds);
        const assetSql = `
          SELECT
            'Asset' as "Record Type",
            o."GEM unit ID" as "ID",
            o."Project" as "Name",
            o."Tracker" as "Type",
            o."Status",
            o."Country",
            CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
            o."Owner" as "Owner Name",
            o."Owner GEM Entity ID" as "Owner ID",
            CAST(o."Share" AS DOUBLE) as "Ownership %",
            l."Latitude",
            l."Longitude"
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE o."GEM unit ID" IN (${assetIdList})
        `;
        const assetResult = await query(assetSql);
        if (assetResult.success && assetResult.data) {
          allData.push(...assetResult.data);
        }
      }

      // Query entity portfolios
      if (entityIds.length > 0) {
        exportProgress = `Querying ${entityIds.length} entity portfolios...`;
        const entityIdList = buildIdList(entityIds);
        const entitySql = `
          SELECT
            'Entity Portfolio' as "Record Type",
            o."Owner GEM Entity ID" as "ID",
            o."Owner" as "Name",
            o."Tracker" as "Type",
            o."Status",
            o."Country",
            CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
            o."Project" as "Owned Asset",
            o."GEM unit ID" as "Owned Asset ID",
            CAST(o."Share" AS DOUBLE) as "Ownership %",
            NULL as "Latitude",
            NULL as "Longitude"
          FROM ownership o
          WHERE o."Owner GEM Entity ID" IN (${entityIdList})
        `;
        const entityResult = await query(entitySql);
        if (entityResult.success && entityResult.data) {
          allData.push(...entityResult.data);
        }
      }

      if (allData.length === 0) {
        throw new Error('No data found for selected items.');
      }

      exportProgress = `Converting ${allData.length} rows to CSV...`;
      const csv = convertToCSV(allData);
      const filename = `gem-export-${totalCount}-items-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(csv, filename);

      exportProgress = `Exported ${allData.length} rows`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Convert array of objects to CSV string (RFC 4180 compliant)
  function convertToCSV(data) {
    if (data.length === 0) return '';

    const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].sort();

    function escapeCSVVal(val) {
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') val = JSON.stringify(val);
      const str = String(val);
      const needsQuoting = /[",\n\r]/.test(str);
      if (needsQuoting) return `"${str.replace(/"/g, '""')}"`;
      return str;
    }

    const header = columns.map((col) => escapeCSVVal(col)).join(',');
    const rows = data.map((row) => columns.map((col) => escapeCSVVal(row[col])).join(','));
    return [header, ...rows].join('\r\n');
  }

  // Trigger browser download
  function downloadCSV(csv, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(row) {
    if (row.type === 'entity') {
      goto(entityLink(row.id));
    } else {
      goto(assetLink(row.id));
    }
  }
</script>

<svelte:head>
  <title>Export ({totalCount}) — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href={link('index')} class="back-link">Back to Map</a>
    <span class="title">Export List</span>
    <span class="count">
      {totalCount} items
      {#if assetCount > 0 && entityCount > 0}
        ({assetCount} assets, {entityCount} entities)
      {:else if assetCount > 0}
        ({assetCount} assets)
      {:else if entityCount > 0}
        ({entityCount} entities)
      {/if}
    </span>
  </header>

  {#if totalCount === 0}
    <div class="empty-state">
      <h2>No items in export list</h2>
      <p>Add assets or entities to your cart from the map, search, or detail pages.</p>
      <div class="empty-actions">
        <a href={link('index')} class="btn">Go to Map</a>
        <a href={link('explore')} class="btn">Explore Data</a>
      </div>
    </div>
  {:else}
    <div class="export-actions">
      <button class="btn btn-primary" onclick={exportAllCSV} disabled={exporting || loading}>
        {exporting ? 'Exporting...' : `Export All (${totalCount} items)`}
      </button>
      {#if assetCount > 0}
        <button class="btn" onclick={exportAssetsCSV} disabled={exporting || loading}>
          Assets Only ({assetCount})
        </button>
      {/if}
      {#if entityCount > 0}
        <button class="btn" onclick={exportEntitiesCSV} disabled={exporting || loading}>
          Entities Only ({entityCount})
        </button>
      {/if}
      <button class="btn btn-danger" onclick={clearAll} disabled={exporting}>Clear All</button>
      {#if exportProgress}
        <span class="progress">{exportProgress}</span>
      {/if}
    </div>

    {#if error}
      <div class="error-banner">Error: {error}</div>
    {/if}

    <div class="info-box">
      <strong>Export Options:</strong>
      <ul>
        <li><strong>Assets:</strong> Full ownership data with coordinates, capacity, status</li>
        <li>
          <strong>Entities:</strong> Complete portfolio of owned assets with ownership percentages
        </li>
      </ul>
    </div>

    <!-- Assets Section -->
    {#if assetCount > 0}
      <section class="item-section">
        <h2>Assets ({assetCount})</h2>
        <div class="item-grid">
          {#each assetItems as item}
            <div class="item-card asset" onclick={() => handleRowClick(item)}>
              <div class="item-header">
                {#if item.tracker}
                  <TrackerIcon tracker={item.tracker} size={12} />
                {/if}
                <span class="item-name">{item.name}</span>
              </div>
              <div class="item-meta">
                <span class="item-id">{item.id}</span>
                {#if item.tracker}
                  <span class="item-tracker">{item.tracker}</span>
                {/if}
              </div>
              <button
                class="remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  investigationCart.remove(item.id);
                }}>×</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Entities Section -->
    {#if entityCount > 0}
      <section class="item-section">
        <h2>Entities ({entityCount})</h2>
        <div class="item-grid">
          {#each entityItems as item}
            <div class="item-card entity" onclick={() => handleRowClick(item)}>
              <div class="item-header">
                <span class="entity-icon">E</span>
                <span class="item-name">{item.name}</span>
              </div>
              <div class="item-meta">
                <span class="item-id">{item.id}</span>
                {#if item.metadata?.assetCount}
                  <span class="asset-count">{item.metadata.assetCount} assets</span>
                {/if}
              </div>
              <button
                class="remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  investigationCart.remove(item.id);
                }}>×</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <div class="export-actions bottom">
      <button class="btn btn-primary" onclick={exportAllCSV} disabled={exporting || loading}>
        {exporting ? 'Exporting...' : `Export All (${totalCount} items)`}
      </button>
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0 auto;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 20px;
    display: flex;
    gap: 20px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .back-link {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .back-link:hover {
    text-decoration: none;
  }

  .title {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .count {
    font-size: 10px;
    color: #666;
    margin-left: auto;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .empty-state h2 {
    font-size: 18px;
    font-weight: normal;
    margin-bottom: 10px;
  }

  .empty-state p {
    margin-bottom: 20px;
  }

  .empty-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: #f5f5f5;
    border: 1px solid #ddd;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .export-actions.bottom {
    margin-top: 20px;
    margin-bottom: 0;
    justify-content: center;
  }

  .progress {
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  .error-banner {
    padding: 12px 16px;
    background: #ffebee;
    border: 1px solid #ef9a9a;
    color: #c62828;
    margin-bottom: 20px;
    font-size: 12px;
  }

  .info-box {
    padding: 12px 16px;
    background: #f9f9f9;
    border: 1px solid #ddd;
    margin-bottom: 20px;
    font-size: 12px;
    line-height: 1.5;
  }

  .info-box strong {
    display: block;
    margin-bottom: 4px;
  }

  .info-box ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
  }

  .info-box li {
    margin-bottom: 4px;
  }

  /* Item sections */
  .item-section {
    margin-bottom: 32px;
  }

  .item-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid #ddd;
  }

  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .item-card {
    position: relative;
    padding: 12px 32px 12px 12px;
    background: #fff;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .item-card:hover {
    border-color: #000;
    background: #fafafa;
  }

  .item-card.asset {
    border-left: 3px solid #333;
  }

  .item-card.entity {
    border-left: 3px solid #7b1fa2;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .item-name {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    display: flex;
    gap: 12px;
    font-size: 10px;
    color: #666;
  }

  .item-id {
    font-family: monospace;
  }

  .item-tracker {
    text-transform: uppercase;
  }

  .asset-count {
    color: #7b1fa2;
  }

  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: #7b1fa2;
    color: white;
    border-radius: 50%;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: #999;
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #c62828;
  }

  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
    .item-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
