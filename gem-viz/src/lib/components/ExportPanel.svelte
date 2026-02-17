<script>
  import { goto } from '$app/navigation';
  import { assetLink, entityLink, assetPath } from '$lib/links';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { investigationCart } from '$lib/investigationCart';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import {
    formatNumber,
    escapeCSVVal,
    sparklinePoints,
    buildExportManifest,
    downloadFile,
    runPreflight,
    buildAssetQuery,
    buildEntityQuery,
    buildCombinedQuery,
  } from './export-panel-utils';

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state(null);
  let dbReady = $state(false);
  let exportProgress = $state('');
  let exportLog = $state([]);
  let lastExportManifest = $state(null);

  let analysisLoading = $state(false);
  let analysisError = $state(null);
  let analysis = $state(null);
  let analysisDebounceTimer = $state(null);

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const assetItems = $derived(cartItems.filter((i) => i.type === 'asset'));
  const entityItems = $derived(cartItems.filter((i) => i.type === 'entity'));
  const totalCount = $derived(cartItems.length);
  const assetCount = $derived(assetItems.length);
  const entityCount = $derived(entityItems.length);

  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
  const appVersion = __APP_VERSION__;

  // Clear entire list
  function clearAll() {
    if (confirm('Remove all items from cart?')) {
      investigationCart.clear();
    }
  }

  function addLog(message, detail = null) {
    exportLog = [
      ...exportLog,
      {
        t: new Date().toLocaleTimeString(),
        message,
        detail,
      },
    ];
  }

  function resetExportUI() {
    exportProgress = '';
    exportLog = [];
    lastExportManifest = null;
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

  async function runAnalysis() {
    if (!totalCount) return;
    analysisLoading = true;
    analysisError = null;
    try {
      await ensureDB();
      const assetIds = assetItems.map((a) => a.id);
      const entityIds = entityItems.map((e) => e.id);
      analysis = await runPreflight({ assetIds, entityIds });
    } catch (err) {
      analysisError = err.message;
    } finally {
      analysisLoading = false;
    }
  }

  function queueAnalysis() {
    if (analysisDebounceTimer) clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = setTimeout(() => {
      runAnalysis();
      analysisDebounceTimer = null;
    }, 300);
  }

  $effect(() => {
    if (totalCount === 0) {
      analysis = null;
      analysisError = null;
      return;
    }
    queueAnalysis();
  });

  // App info for manifest
  const appInfo = { version: appVersion, buildTime, buildHash };

  async function exportQuery(sql, filenameBase, _selection) {
    await ensureDB();
    const startTime = Date.now();
    exportProgress = `Running SQL...`;
    addLog('SQL query started');

    const res = await query(sql);
    if (!res.success) {
      throw new Error(res.error || 'Query failed');
    }

    exportProgress = `Formatting CSV...`;
    const rows = res.data || [];
    if (!rows.length) {
      exportProgress = '';
      addLog('No rows returned');
      return {
        file: { name: `${filenameBase}.csv` },
        rowCount: 0,
        bytes: 0,
        seconds: ((Date.now() - startTime) / 1000).toFixed(1),
      };
    }

    const columns = Object.keys(rows[0]);
    const lines = [];
    lines.push(columns.map((col) => escapeCSVVal(col)).join(','));
    for (let i = 0; i < rows.length; i += 1) {
      lines.push(columns.map((col) => escapeCSVVal(rows[i][col])).join(','));
    }

    const csv = lines.join('\n');
    await downloadFile(csv, `${filenameBase}.csv`, 'text/csv;charset=utf-8');

    const elapsed = (Date.now() - startTime) / 1000;
    const bytes = new Blob([csv]).size;
    addLog('CSV download complete', { rows: rows.length, bytes });

    exportProgress = `Exported ${rows.length.toLocaleString()} rows`;

    return {
      file: { name: `${filenameBase}.csv` },
      rowCount: rows.length,
      bytes,
      seconds: elapsed.toFixed(1),
    };
  }

  // Shared export logic: build SQL, run query, download CSV + manifest
  async function doExport(kind, sql, filenameBase, selection) {
    resetExportUI();
    exporting = true;
    try {
      const result = await exportQuery(sql, filenameBase, selection);
      lastExportManifest = buildExportManifest(kind, selection, result, { sql }, appInfo);
      addLog('Manifest created');
      await downloadFile(JSON.stringify(lastExportManifest, null, 2), `${filenameBase}-manifest.json`, 'application/json;charset=utf-8');
      addLog('Manifest downloaded');
    } catch (err) {
      error = err.message;
      addLog('Export error', err.message);
    } finally {
      exporting = false;
    }
  }

  function exportAssetsCSV() {
    if (!assetItems.length) return;
    const ids = assetItems.map((a) => a.id);
    doExport('assets', buildAssetQuery(ids), 'gem-assets-export', { assets: ids, entities: [] });
  }

  function exportEntitiesCSV() {
    if (!entityItems.length) return;
    const ids = entityItems.map((e) => e.id);
    doExport('entities', buildEntityQuery(ids), 'gem-entities-export', { assets: [], entities: ids });
  }

  function exportAllCSV() {
    if (!totalCount) return;
    const aIds = assetItems.map((a) => a.id), eIds = entityItems.map((e) => e.id);
    doExport('combined', buildCombinedQuery(aIds, eIds), 'gem-export', { assets: aIds, entities: eIds });
  }

  async function handleRowClick(row) {
    if (row.type === 'entity') {
      goto(entityLink(row.id));
    } else {
      goto(assetLink(row.id));
    }
  }
</script>

<section class="export-panel">
  <header class="export-header">
    <h2>Export</h2>
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
      <h3>No items in export list</h3>
      <p>Add assets or entities to your cart from the map, search, or detail pages.</p>
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

    <section class="analysis-panel">
      <div class="analysis-header">
        <h3>Export Preflight</h3>
        <div class="analysis-meta">
          {#if analysisLoading}
            <span class="muted">Analyzing…</span>
          {:else if analysis}
            <span class="muted">Updated {new Date(analysis.generatedAt).toLocaleString()}</span>
          {:else}
            <span class="muted">Not analyzed yet</span>
          {/if}
          <button
            class="btn btn-small"
            onclick={runAnalysis}
            disabled={analysisLoading || loading || exporting}
          >
            Refresh
          </button>
        </div>
      </div>

      {#if analysisError}
        <div class="error-banner">Analysis error: {analysisError}</div>
      {/if}

      {#if analysis}
        <div class="analysis-grid">
          {#if analysis.combined?.summary}
            <div class="stat-card">
              <div class="stat-title">Combined Export</div>
              <div class="stat-value">
                {formatNumber(analysis.combined.summary.ownership_rows)} rows
              </div>
              <div class="stat-sub">
                {formatNumber(analysis.combined.summary.distinct_assets)} assets ·
                {formatNumber(analysis.combined.summary.distinct_entities)} entities ·
                {formatNumber(analysis.combined.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
          {#if analysis.assets?.summary}
            <div class="stat-card">
              <div class="stat-title">Assets Export</div>
              <div class="stat-value">
                {formatNumber(analysis.assets.summary.ownership_rows)} rows
              </div>
              <div class="stat-sub">
                {formatNumber(analysis.assets.summary.distinct_assets)} assets ·
                {formatNumber(analysis.assets.summary.distinct_entities)} owners ·
                {formatNumber(analysis.assets.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
          {#if analysis.entities?.summary}
            <div class="stat-card">
              <div class="stat-title">Entities Export</div>
              <div class="stat-value">
                {formatNumber(analysis.entities.summary.ownership_rows)} rows
              </div>
              <div class="stat-sub">
                {formatNumber(analysis.entities.summary.distinct_assets)} assets ·
                {formatNumber(analysis.entities.summary.distinct_entities)} entities ·
                {formatNumber(analysis.entities.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
        </div>

        <div class="spark-grid">
          {#each [
            { title: 'Top Trackers', data: analysis.combined?.topTrackers },
            { title: 'Top Statuses', data: analysis.combined?.topStatuses },
            { title: 'Top Countries', data: analysis.combined?.topCountries },
          ].filter(c => c.data?.length) as card}
            <div class="spark-card">
              <div class="spark-header">
                <span class="spark-title">{card.title}</span>
                <svg class="sparkline" viewBox="0 0 80 18" aria-hidden="true">
                  <polyline fill="none" stroke="currentColor" stroke-width="1.5" points={sparklinePoints(card.data.map((r) => r.rows))} />
                </svg>
              </div>
              <div class="spark-rows">
                {#each card.data as row}
                  <div class="spark-row">
                    <span class="spark-key">{row.key}</span>
                    <span class="spark-val">{formatNumber(row.rows)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <details class="details">
          <summary>Schema + SQL details</summary>
          <div class="details-body">
            <div class="details-grid">
              <div>
                <div class="details-title">Ownership Columns</div>
                <div class="details-mono">
                  {analysis.ownershipSchema
                    ? analysis.ownershipSchema.map((c) => `${c.name} (${c.type})`).join('\n')
                    : 'Unavailable'}
                </div>
              </div>
              <div>
                <div class="details-title">Locations Columns</div>
                <div class="details-mono">
                  {analysis.locationsSchema
                    ? analysis.locationsSchema.map((c) => `${c.name} (${c.type})`).join('\n')
                    : 'Unavailable'}
                </div>
              </div>
            </div>
            {#if analysis.combined?.sql?.summary}
              <div class="details-title">Preflight SQL (summary)</div>
              <div class="details-mono">{analysis.combined.sql.summary}</div>
            {/if}
          </div>
        </details>
      {/if}
    </section>

    {#if exportLog.length > 0}
      <section class="log-panel">
        <h3>Export Log</h3>
        <div class="log-rows">
          {#each exportLog as row}
            <div class="log-row">
              <span class="log-time">{row.t}</span>
              <span class="log-msg">{row.message}</span>
              {#if row.detail}
                <span class="log-detail">{JSON.stringify(row.detail)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if lastExportManifest}
      <section class="manifest-panel">
        <h3>Last Export</h3>
        <div class="manifest-grid">
          <div class="manifest-item">
            <div class="manifest-k">Kind</div>
            <div class="manifest-v">{lastExportManifest.kind}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">Rows</div>
            <div class="manifest-v">{formatNumber(lastExportManifest.result.rowCount)}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">CSV</div>
            <div class="manifest-v">{lastExportManifest.result.file.name}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">Build</div>
            <div class="manifest-v">
              v{lastExportManifest.app.version} ({lastExportManifest.app.buildHash})
            </div>
          </div>
        </div>
        <p class="muted">
          Each export also downloads a JSON manifest + README with SQL hashes, timings, and
          selection metadata.
        </p>
      </section>
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
        <h3>Assets ({assetCount})</h3>
        <div class="item-grid">
          {#each assetItems as item}
            <div
              class="item-card asset"
              onclick={() => handleRowClick(item)}
              onkeydown={(e) => e.key === 'Enter' && handleRowClick(item)}
              role="button"
              tabindex="0"
            >
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
        <h3>Entities ({entityCount})</h3>
        <div class="item-grid">
          {#each entityItems as item}
            <div
              class="item-card entity"
              onclick={() => handleRowClick(item)}
              onkeydown={(e) => e.key === 'Enter' && handleRowClick(item)}
              role="button"
              tabindex="0"
            >
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
</section>

<style>
  .export-panel {
    width: 100%;
    margin: 0 auto;
    padding: 20px 0 10px;
  }

  .export-header {
    display: flex;
    gap: 16px;
    align-items: baseline;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }

  .export-header h2 {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .count {
    font-size: 10px;
    color: var(--color-text-secondary);
    margin-left: auto;
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-text-secondary);
  }

  .empty-state h3 {
    font-size: 16px;
    font-weight: 500;
    margin-bottom: 10px;
  }

  .empty-state p {
    margin-bottom: 20px;
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 0;
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
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .muted {
    color: var(--color-text-secondary);
    font-size: 11px;
  }

  .analysis-panel,
  .log-panel,
  .manifest-panel {
    padding: 16px 0;
    margin-bottom: 20px;
  }

  .analysis-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    padding-bottom: 10px;
    margin-bottom: 12px;
  }

  .analysis-header h3,
  .log-panel h3,
  .manifest-panel h3 {
    margin: 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .analysis-meta {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .stat-card {
    padding: 12px 0;
  }

  .stat-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .stat-sub {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .spark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin-bottom: 10px;
  }

  .spark-card {
    padding: 12px 0;
  }

  .spark-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .spark-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-black);
  }

  .sparkline {
    width: 90px;
    height: 18px;
    color: var(--color-black);
    opacity: 0.7;
  }

  .spark-rows {
    display: grid;
    gap: 6px;
  }

  .spark-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    font-size: 11px;
  }

  .spark-key {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-gray-700);
  }

  .spark-val {
    font-family: var(--font-family-data);
    color: var(--color-text-secondary);
  }

  .details {
    padding-top: 10px;
    margin-top: 10px;
  }

  .details summary {
    cursor: pointer;
    font-size: 12px;
  }

  .details-body {
    margin-top: 10px;
    display: grid;
    gap: 10px;
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 10px;
  }

  .details-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 6px;
    color: var(--color-text-secondary);
  }

  .details-mono {
    font-family: var(--font-family-data);
    font-size: 10px;
    white-space: pre-wrap;
    padding: 10px;
    color: var(--color-gray-700);
    max-height: 260px;
    overflow: auto;
  }

  .log-rows {
    display: grid;
    gap: 6px;
  }

  .log-row {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 10px;
    font-size: 11px;
    padding: 8px 0;
  }

  .log-time {
    font-family: var(--font-family-data);
    color: var(--color-text-secondary);
  }

  .log-detail {
    grid-column: 1 / -1;
    font-family: var(--font-family-data);
    color: var(--color-text-secondary);
    white-space: pre-wrap;
  }

  .manifest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 8px;
  }

  .manifest-item {
    padding: 10px 0;
  }

  .manifest-k {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
    margin-bottom: 4px;
  }

  .manifest-v {
    font-size: 12px;
    font-family: var(--font-family-data);
  }

  .btn.btn-small {
    padding: 6px 10px;
    font-size: 11px;
  }

  .error-banner {
    padding: 12px 0;
    color: var(--color-error);
    margin-bottom: 20px;
    font-size: 12px;
  }

  .info-box {
    padding: 12px 0;
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

  .item-section h3 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
    padding-bottom: 8px;
  }

  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .item-card {
    position: relative;
    padding: 12px 32px 12px 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .item-card:hover {
    text-decoration: underline;
  }

  .item-card.asset {
    border-left: 3px solid var(--color-gray-700);
    padding-left: 12px;
  }

  .item-card.entity {
    border-left: 3px solid var(--gem-teal);
    padding-left: 12px;
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
    color: var(--color-text-secondary);
  }

  .item-id {
    font-family: var(--font-family-data);
  }

  .item-tracker {
    text-transform: uppercase;
  }

  .asset-count {
    color: var(--color-entity-text, #7b1fa2);
  }

  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
    color: var(--color-text-secondary);
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
    color: var(--color-text-tertiary);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: var(--color-error);
  }

  @media (max-width: 768px) {
    .export-panel {
      padding: 15px 0;
    }
    .item-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
