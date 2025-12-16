<script>
  /**
   * MANIFEST / ADMIN INDEX
   * Shows all data sources, schemas, and sample rows
   */

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const { tables, trackerConfigs, dataSources, dataVersionInfo, staticFiles, meta } = data;

  // Helpers
  function formatNumber(n) {
    if (n == null) return '—';
    return n.toLocaleString();
  }

  function truncate(str, len = 50) {
    if (!str) return '—';
    const s = String(str);
    return s.length > len ? s.slice(0, len) + '...' : s;
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
</script>

<svelte:head>
  <title>Data Manifest — GEM Viz Admin</title>
</svelte:head>

<main>
  <header>
    <h1>Data Manifest</h1>
    <p class="subtitle">Admin view of all data sources, schemas, and sample data</p>
    <div class="meta-bar">
      <span>Generated: {new Date(meta.generatedAt).toLocaleString()}</span>
      <span>Load time: {meta.loadTime}ms</span>
      <span>Tables: {meta.tableCount}</span>
      <span>Total rows: {formatNumber(meta.totalRows)}</span>
    </div>
    {#if meta.error}
      <div class="error-banner">Error: {meta.error}</div>
    {/if}
  </header>

  <!-- Table of Contents -->
  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      <li><a href="#database-tables">Database Tables ({tables.length})</a></li>
      <li><a href="#tracker-configs">Tracker Configs ({trackerConfigs.length})</a></li>
      <li><a href="#data-sources">Data Source Registry</a></li>
      <li><a href="#version-info">Version Info</a></li>
    </ul>
  </nav>

  <!-- Database Tables -->
  <section id="database-tables">
    <h2>Database Tables</h2>
    <p class="section-desc">
      All tables in MotherDuck gem_data database with schemas and sample rows.
    </p>

    {#each tables as table, i}
      <article class="table-card" id="table-{i}">
        <header class="table-header">
          <h3>{table.fullName}</h3>
          <div class="table-meta">
            <span class="badge">{table.type}</span>
            <span class="row-count">{formatNumber(table.rowCount)} rows</span>
            <span class="col-count">{table.columns.length} columns</span>
          </div>
        </header>

        {#if table.errors.length > 0}
          <div class="table-errors">
            {#each table.errors as err}
              <p class="error">{err}</p>
            {/each}
          </div>
        {/if}

        <!-- Schema -->
        <div class="schema-section">
          <h4>Schema</h4>
          <table class="schema-table">
            <thead>
              <tr>
                <th>Column</th>
                <th>Type</th>
                <th>Nullable</th>
                <th>Default</th>
              </tr>
            </thead>
            <tbody>
              {#each table.columns as col}
                <tr>
                  <td class="col-name">{col.column_name}</td>
                  <td class="col-type">{col.data_type}</td>
                  <td class="col-nullable">{col.is_nullable}</td>
                  <td class="col-default">{truncate(col.column_default, 30)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Sample Rows -->
        {#if table.sampleRows.length > 0}
          <div class="sample-section">
            <h4>Sample Rows ({table.sampleRows.length})</h4>
            <div class="sample-scroll">
              <table class="sample-table">
                <thead>
                  <tr>
                    {#each Object.keys(table.sampleRows[0] || {}) as key}
                      <th>{key}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  {#each table.sampleRows as row}
                    <tr>
                      {#each Object.values(row) as val}
                        <td>{truncate(val, 40)}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {:else}
          <p class="no-data">No sample rows available</p>
        {/if}
      </article>
    {/each}
  </section>

  <!-- Tracker Configs -->
  <section id="tracker-configs">
    <h2>Tracker Configurations</h2>
    <p class="section-desc">Field mappings for each asset tracker type.</p>

    {#each trackerConfigs as { name, config }}
      <article class="config-card">
        <h3>{name}</h3>
        {#if config}
          <dl class="config-list">
            <div>
              <dt>Asset Type</dt>
              <dd>{config.assetType}</dd>
            </div>
            <div>
              <dt>ID Field</dt>
              <dd><code>{config.idField}</code></dd>
            </div>
            <div>
              <dt>Name Fields</dt>
              <dd><code>{JSON.stringify(config.nameFields)}</code></dd>
            </div>
            <div>
              <dt>Capacity Field</dt>
              <dd><code>{config.capacityField || '—'}</code> ({config.capacityUnit || '—'})</dd>
            </div>
            <div>
              <dt>Status Field</dt>
              <dd><code>{config.statusField}</code></dd>
            </div>
            <div>
              <dt>Source Tab</dt>
              <dd>{config.sourceTab}</dd>
            </div>
          </dl>
          {#if config.docsRef}
            <p class="docs-ref">{config.docsRef}</p>
          {/if}
        {:else}
          <p class="no-data">No configuration found</p>
        {/if}
      </article>
    {/each}
  </section>

  <!-- Data Sources Registry -->
  <section id="data-sources">
    <h2>Data Source Registry</h2>

    <h3>Ownership Tracker Datasets</h3>
    <div class="source-grid">
      {#each dataSources.ownership as source}
        <article class="source-card">
          <h4>{source.name}</h4>
          <p class="source-desc">{source.description}</p>
          <dl class="source-meta">
            <div>
              <dt>Version</dt>
              <dd>{source.version}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{source.lastUpdated}</dd>
            </div>
            {#if source.rowCount}<div>
                <dt>Rows</dt>
                <dd>{formatNumber(source.rowCount)}</dd>
              </div>{/if}
          </dl>
          {#if source.notes}<p class="source-notes">{source.notes}</p>{/if}
        </article>
      {/each}
    </div>

    <h3>Asset Tracker Datasets</h3>
    <div class="source-grid">
      {#each dataSources.trackers as source}
        <article class="source-card">
          <h4>{source.name}</h4>
          <p class="source-desc">{source.description}</p>
          <dl class="source-meta">
            <div>
              <dt>Version</dt>
              <dd>{source.version}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{source.lastUpdated}</dd>
            </div>
            {#if source.rowCount}<div>
                <dt>Rows</dt>
                <dd>{formatNumber(source.rowCount)}</dd>
              </div>{/if}
          </dl>
          <a href={source.url} class="source-url" target="_blank">{source.url}</a>
        </article>
      {/each}
    </div>

    <h3>Derived Datasets</h3>
    <div class="source-grid">
      {#each dataSources.derived as source}
        <article class="source-card">
          <h4>{source.name}</h4>
          <p class="source-desc">{source.description}</p>
          <dl class="source-meta">
            <div>
              <dt>Version</dt>
              <dd>{source.version}</dd>
            </div>
            <div>
              <dt>Last Updated</dt>
              <dd>{source.lastUpdated}</dd>
            </div>
          </dl>
          <code class="source-path">{source.url}</code>
        </article>
      {/each}
    </div>
  </section>

  <!-- Version Info -->
  <section id="version-info">
    <h2>Data Version Info</h2>
    <dl class="version-list">
      <div>
        <dt>Release Version</dt>
        <dd>{dataVersionInfo.currentReleaseVersion}</dd>
      </div>
      <div>
        <dt>Release Date</dt>
        <dd>{dataVersionInfo.releaseDate}</dd>
      </div>
      <div>
        <dt>Last Verification</dt>
        <dd>{dataVersionInfo.lastVerificationDate}</dd>
      </div>
      <div>
        <dt>Data Contact</dt>
        <dd><a href="mailto:{dataVersionInfo.dataContact}">{dataVersionInfo.dataContact}</a></dd>
      </div>
      <div>
        <dt>Issue Tracker</dt>
        <dd>
          <a href={dataVersionInfo.issueTracker} target="_blank">{dataVersionInfo.issueTracker}</a>
        </dd>
      </div>
      <div>
        <dt>Documentation</dt>
        <dd>
          <a href={dataVersionInfo.documentation} target="_blank">{dataVersionInfo.documentation}</a
          >
        </dd>
      </div>
    </dl>

    <details class="release-notes">
      <summary>Release Notes</summary>
      <pre>{dataVersionInfo.releaseNotes}</pre>
    </details>
  </section>

  <footer>
    <p>GEM Viz Data Manifest — Generated at build time</p>
    <p><a href="/">Back to Homepage</a></p>
  </footer>
</main>

<style>
  main {
    width: 100%;
    padding: 40px 20px;
    font-family: system-ui, sans-serif;
  }

  header {
    margin-bottom: 40px;
    border-bottom: 2px solid #000;
    padding-bottom: 20px;
  }
  h1 {
    font-size: 32px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .subtitle {
    font-size: 14px;
    color: #666;
    margin: 0 0 16px 0;
  }
  .meta-bar {
    display: flex;
    gap: 24px;
    font-size: 12px;
    color: #666;
    flex-wrap: wrap;
  }
  .meta-bar span {
    background: #f0f0f0;
    padding: 4px 8px;
  }
  .error-banner {
    background: #fee;
    border: 1px solid #c00;
    padding: 12px;
    margin-top: 16px;
    color: #900;
  }

  .toc {
    background: #f9f9f9;
    padding: 20px;
    margin-bottom: 40px;
    border: 1px solid #ddd;
  }
  .toc h2 {
    font-size: 14px;
    text-transform: uppercase;
    margin: 0 0 12px 0;
  }
  .toc ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }
  .toc a {
    color: #333;
    text-decoration: none;
    font-size: 13px;
  }
  .toc a:hover {
    text-decoration: underline;
  }

  section {
    margin-bottom: 60px;
  }
  section h2 {
    font-size: 24px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #000;
    padding-bottom: 8px;
    margin-bottom: 16px;
  }
  section h3 {
    font-size: 18px;
    margin: 24px 0 12px 0;
    color: #333;
  }
  .section-desc {
    font-size: 13px;
    color: #666;
    margin-bottom: 24px;
  }

  .table-card {
    background: #fff;
    border: 1px solid #ddd;
    margin-bottom: 32px;
  }
  .table-header {
    background: #f5f5f5;
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
  }
  .table-header h3 {
    margin: 0;
    font-size: 16px;
    font-family: 'Monaco', 'Courier New', monospace;
  }
  .table-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
  }
  .badge {
    background: #333;
    color: #fff;
    padding: 2px 8px;
    text-transform: uppercase;
    font-size: 10px;
  }
  .row-count,
  .col-count {
    color: #666;
  }

  .table-errors {
    background: #fee;
    padding: 12px 16px;
    border-bottom: 1px solid #fcc;
  }
  .table-errors .error {
    color: #900;
    font-size: 12px;
    margin: 4px 0;
  }

  .schema-section,
  .sample-section {
    padding: 16px;
    border-top: 1px solid #eee;
  }
  .schema-section h4,
  .sample-section h4 {
    font-size: 11px;
    text-transform: uppercase;
    color: #999;
    margin: 0 0 12px 0;
  }

  .schema-table,
  .sample-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  .schema-table th,
  .sample-table th {
    text-align: left;
    background: #f9f9f9;
    padding: 6px 8px;
    border-bottom: 1px solid #ddd;
    font-weight: 600;
  }
  .schema-table td,
  .sample-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #eee;
    vertical-align: top;
  }
  .col-name {
    font-family: 'Monaco', monospace;
    font-weight: 600;
  }
  .col-type {
    color: #666;
    font-family: 'Monaco', monospace;
    font-size: 11px;
  }
  .col-nullable {
    color: #999;
  }
  .col-default {
    color: #999;
    font-size: 11px;
  }

  .sample-scroll {
    overflow-x: auto;
  }
  .sample-table td {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'Monaco', monospace;
    font-size: 11px;
  }

  .no-data {
    color: #999;
    font-size: 12px;
    padding: 16px;
    font-style: italic;
  }

  .config-card {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
    margin-bottom: 16px;
  }
  .config-card h3 {
    margin: 0 0 12px 0;
    font-size: 16px;
  }
  .config-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    margin: 0;
  }
  .config-list div {
    display: flex;
    gap: 8px;
  }
  .config-list dt {
    font-size: 11px;
    color: #999;
    text-transform: uppercase;
    min-width: 80px;
  }
  .config-list dd {
    margin: 0;
    font-size: 13px;
  }
  .config-list code {
    background: #f5f5f5;
    padding: 2px 6px;
    font-size: 11px;
  }
  .docs-ref {
    font-size: 11px;
    color: #666;
    margin-top: 12px;
    font-style: italic;
  }

  .source-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }
  .source-card {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
  }
  .source-card h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
  }
  .source-desc {
    font-size: 12px;
    color: #666;
    margin: 0 0 12px 0;
  }
  .source-meta {
    display: flex;
    gap: 16px;
    margin: 0 0 8px 0;
    font-size: 11px;
    flex-wrap: wrap;
  }
  .source-meta div {
    display: flex;
    gap: 4px;
  }
  .source-meta dt {
    color: #999;
  }
  .source-meta dd {
    margin: 0;
  }
  .source-notes {
    font-size: 11px;
    color: #666;
    margin: 8px 0 0 0;
    font-style: italic;
  }
  .source-url,
  .source-path {
    font-size: 10px;
    color: #333;
    word-break: break-all;
    display: block;
    margin-top: 8px;
  }
  .source-path {
    background: #f5f5f5;
    padding: 4px 8px;
    color: #333;
  }

  .version-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 12px;
    margin: 0;
  }
  .version-list div {
    display: flex;
    gap: 8px;
  }
  .version-list dt {
    font-size: 12px;
    color: #999;
    min-width: 120px;
  }
  .version-list dd {
    margin: 0;
    font-size: 13px;
  }
  .version-list a {
    color: #333;
  }

  .release-notes {
    margin-top: 24px;
  }
  .release-notes summary {
    cursor: pointer;
    font-size: 13px;
    color: #333;
  }
  .release-notes pre {
    background: #f5f5f5;
    padding: 16px;
    font-size: 12px;
    white-space: pre-wrap;
    margin-top: 12px;
    line-height: 1.6;
  }

  footer {
    border-top: 1px solid #ddd;
    padding-top: 20px;
    text-align: center;
    font-size: 12px;
    color: #666;
  }
  footer a {
    color: #333;
  }
</style>
