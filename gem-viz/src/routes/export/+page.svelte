<script>
  import { base, assets as assetsPath } from '$app/paths';
  import { goto } from '$app/navigation';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { exportList } from '$lib/exportList';
  import { isValidSlug } from '$lib/slug';
  import DataTable from '$lib/components/DataTable.svelte';

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state(null);
  let dbReady = $state(false);
  let exportProgress = $state('');
  let selectedRows = $state([]);

  const columns = [
    { key: 'name', label: 'Name', sortable: true, filterable: true, width: '250px' },
    { key: 'id', label: 'ID', sortable: true, filterable: true, width: '150px' },
    { key: 'tracker', label: 'Tracker', sortable: true, filterable: true, width: '120px' },
    { key: 'addedAt', label: 'Added', sortable: true, type: 'date', width: '120px' },
  ];

  // Remove single asset
  function removeAsset(id) {
    exportList.remove(id);
  }

  // Remove selected assets
  function removeSelected() {
    if (selectedRows.length === 0) return;
    if (confirm(`Remove ${selectedRows.length} assets from export list?`)) {
      selectedRows.forEach((row) => exportList.remove(row.id));
      selectedRows = [];
    }
  }

  // Clear entire list
  function clearAll() {
    if (confirm('Remove all assets from export list?')) {
      exportList.clear();
      selectedRows = [];
    }
  }

  // Initialize DuckDB for export
  async function ensureDB() {
    if (dbReady) return;

    loading = true;
    try {
      await initDuckDB();

      const parquetBase = assetsPath || '';
      const ownershipResult = await loadParquetFromPath(
        `${parquetBase}/all_trackers_ownership@1.parquet`,
        'ownership'
      );
      if (!ownershipResult.success) throw new Error(ownershipResult.error);

      const locResult = await loadParquetFromPath(
        `${parquetBase}/asset_locations.parquet`,
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

  // Export ALL columns for selected IDs
  async function exportCSV() {
    const ids = exportList.getIds();
    if (ids.length === 0) {
      alert('No assets in export list');
      return;
    }

    // Warn about very large exports
    if (ids.length > 1000) {
      const proceed = confirm(
        `You're about to export ${ids.length} assets. This may take a while and use significant memory. Continue?`
      );
      if (!proceed) return;
    }

    exporting = true;
    exportProgress = 'Initializing database...';
    error = null;

    try {
      await ensureDB();

      exportProgress = `Querying full data for ${ids.length} assets...`;

      // Build ID list for SQL IN clause - escape single quotes for SQL safety
      const idList = ids
        .map((id) => {
          // Validate ID format using slug utility
          if (!isValidSlug(id)) {
            console.warn('Suspicious ID format:', id);
          }
          // SQL escape: double single quotes
          return `'${id.replace(/'/g, "''")}'`;
        })
        .join(',');

      // Query ALL columns from ownership table, joined with locations
      const sql = `
        SELECT
          o.*,
          l."Latitude",
          l."Longitude",
          l."Country.Area" as "Location Country",
          l."State.Province" as "Location State"
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE o."GEM location ID" IN (${idList})
        ORDER BY o."GEM location ID", o."Owner"
      `;

      console.log(`Executing export query for ${ids.length} assets...`);
      const result = await query(sql);

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      const data = result.data || [];

      if (data.length === 0) {
        throw new Error(
          `No data found for selected assets. The assets may have been removed from the database, ` +
            `or the IDs may not match. Try clearing your export list and re-selecting assets.`
        );
      }

      // Sanity check: warn if we got way more rows than expected (possible data issue)
      const rowsPerAsset = data.length / ids.length;
      if (rowsPerAsset > 50) {
        console.warn(
          `High row count: ${data.length} rows for ${ids.length} assets (${rowsPerAsset.toFixed(1)} per asset)`
        );
      }

      exportProgress = `Converting ${data.length} rows to CSV...`;

      // Convert to CSV
      const csv = convertToCSV(data);

      // Check CSV size
      const csvSizeMB = (new Blob([csv]).size / 1024 / 1024).toFixed(2);
      console.log(`CSV size: ${csvSizeMB} MB`);

      if (parseFloat(csvSizeMB) > 50) {
        console.warn(`Large CSV file: ${csvSizeMB} MB`);
      }

      // Download
      exportProgress = 'Downloading...';
      const filename = `gem-export-${ids.length}-assets-${new Date().toISOString().slice(0, 10)}.csv`;
      downloadCSV(csv, filename);

      exportProgress = `Exported ${data.length} rows for ${ids.length} assets (${csvSizeMB} MB)`;
      console.log(`Export complete: ${filename}`);
    } catch (err) {
      console.error('Export error:', err);
      error = err.message || 'Unknown error during export';
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Convert array of objects to CSV string (RFC 4180 compliant)
  function convertToCSV(data) {
    if (data.length === 0) return '';

    // Get all unique column names, sorted for consistency
    const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].sort();

    // Escape a value for CSV: handle quotes, newlines, commas
    function escapeCSV(val) {
      if (val === null || val === undefined) return '';

      // Convert non-primitives to JSON string
      if (typeof val === 'object') {
        val = JSON.stringify(val);
      }

      // Convert to string
      const str = String(val);

      // Check if quoting is needed (contains comma, quote, or newline)
      const needsQuoting = /[",\n\r]/.test(str);

      if (needsQuoting) {
        // Escape double quotes by doubling them, wrap in quotes
        return `"${str.replace(/"/g, '""')}"`;
      }

      return str;
    }

    // Header row - escape column names too (they might contain special chars)
    const header = columns.map((col) => escapeCSV(col)).join(',');

    // Data rows
    const rows = data.map((row) => {
      return columns.map((col) => escapeCSV(row[col])).join(',');
    });

    return [header, ...rows].join('\r\n'); // CRLF per RFC 4180
  }

  // Trigger browser download
  function downloadCSV(csv, filename) {
    // Add UTF-8 BOM for Excel compatibility with special characters
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(row) {
    goto(`${base}/asset/${row.id}/index.html`);
  }

  // Format data for DataTable
  function formatAssets(assets) {
    return assets.map((a) => ({
      ...a,
      addedAt: new Date(a.addedAt).toLocaleDateString(),
    }));
  }

  let assets = $derived($exportList);
  let assetCount = $derived(assets.length);
  let formattedAssets = $derived(formatAssets(assets));
</script>

<svelte:head>
  <title>Export List ({assetCount}) — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Back to Map</a>
    <span class="title">Export List</span>
    <span class="count">{assetCount} assets</span>
  </header>

  {#if assetCount === 0}
    <div class="empty-state">
      <h2>No assets in export list</h2>
      <p>Use the map to search for assets and add them to your export list.</p>
      <a href="{base}/index.html" class="action-btn">Go to Map</a>
    </div>
  {:else}
    <div class="export-actions">
      <button class="action-btn primary" onclick={exportCSV} disabled={exporting || loading}>
        {#if exporting}
          Exporting...
        {:else}
          Download Full CSV ({assetCount} assets)
        {/if}
      </button>
      {#if selectedRows.length > 0}
        <button class="action-btn danger" onclick={removeSelected}>
          Remove Selected ({selectedRows.length})
        </button>
      {/if}
      <button class="action-btn danger" onclick={clearAll} disabled={exporting}> Clear All </button>
      {#if exportProgress}
        <span class="progress">{exportProgress}</span>
      {/if}
    </div>

    {#if error}
      <div class="error-banner">
        Error: {error}
      </div>
    {/if}

    <div class="info-box">
      <strong>What you'll get:</strong> A CSV with ALL columns from the GEM database for each asset,
      including ownership details, capacity, status, coordinates, and more. Multiple rows per asset if
      there are multiple owners.
    </div>

    <DataTable
      {columns}
      data={formattedAssets}
      pageSize={50}
      showGlobalSearch={true}
      showColumnFilters={false}
      showPagination={true}
      showExport={false}
      showColumnToggle={false}
      stickyHeader={true}
      striped={true}
      onRowClick={handleRowClick}
      bind:selectedRows
    />

    <div class="export-actions bottom">
      <button class="action-btn primary" onclick={exportCSV} disabled={exporting || loading}>
        {#if exporting}
          Exporting...
        {:else}
          Download Full CSV ({assetCount} assets)
        {/if}
      </button>
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
    max-width: 1200px;
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

  .action-btn {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    border: none;
    cursor: pointer;
    text-decoration: none;
  }

  .action-btn:hover:not(:disabled) {
    background: #333;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: #1976d2;
    font-size: 12px;
    padding: 10px 20px;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #1565c0;
  }

  .action-btn.danger {
    background: #d32f2f;
  }

  .action-btn.danger:hover:not(:disabled) {
    background: #c62828;
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
    background: #e3f2fd;
    border: 1px solid #bbdefb;
    margin-bottom: 20px;
    font-size: 12px;
    line-height: 1.5;
  }

  .info-box strong {
    display: block;
    margin-bottom: 4px;
  }

  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
  }
</style>
