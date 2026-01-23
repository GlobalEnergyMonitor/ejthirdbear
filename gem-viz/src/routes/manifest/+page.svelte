<script>
  /**
   * MANIFEST / ADMIN INDEX
   * Shows all data sources, schemas, and sample rows
   */
  import { link } from '$lib/links';

  /** @type {{ data: import('./$types').PageData }} */
  let { data } = $props();

  const { api, trackerConfigs, dataSources, dataVersionInfo, meta } = data;

  // Helpers
  function formatNumber(n) {
    if (n == null) return '—';
    return n.toLocaleString();
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
      <span>API: {api?.baseUrl || '—'}</span>
    </div>
    {#if meta.error}
      <div class="error-banner">Error: {meta.error}</div>
    {/if}
  </header>

  <!-- Table of Contents -->
  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      <li><a href="#api-info">Ownership API</a></li>
      <li><a href="#tracker-configs">Tracker Configs ({trackerConfigs.length})</a></li>
      <li><a href="#data-sources">Data Source Registry</a></li>
      <li><a href="#version-info">Version Info</a></li>
    </ul>
  </nav>

  <!-- Ownership API -->
  <section id="api-info">
    <h2>Ownership API</h2>
    <p class="section-desc">Primary runtime data source for asset/entity ownership.</p>
    <div class="api-card">
      <div><strong>Base URL:</strong> {api?.baseUrl || '—'}</div>
      <div>{api?.note || '—'}</div>
    </div>
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
    <p><a href={link('index')}>Back to Homepage</a></p>
  </footer>
</main>

<style>
  main {
    width: 100%;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  header {
    margin-bottom: var(--space-10);
    border-bottom: 2px solid var(--color-black);
    padding-bottom: var(--space-5);
  }
  h1 {
    font-size: var(--font-size-3xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .meta-bar {
    display: flex;
    gap: var(--space-6);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    flex-wrap: wrap;
  }
  .meta-bar span {
    background: var(--color-gray-100);
    padding: var(--space-1) var(--space-2);
  }
  .error-banner {
    background: var(--color-error-bg, #fee);
    border: var(--border-width) solid var(--color-error);
    padding: var(--space-3);
    margin-top: var(--space-4);
    color: var(--color-error);
  }

  .toc {
    background: var(--color-gray-50);
    padding: var(--space-5);
    margin-bottom: var(--space-10);
    border: var(--border-width) solid var(--color-border);
  }
  .toc h2 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    margin: 0 0 var(--space-3) 0;
  }
  .toc ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: var(--space-5);
    flex-wrap: wrap;
  }
  .toc a {
    color: var(--color-gray-700);
    text-decoration: none;
    font-size: var(--font-size-md);
  }
  .toc a:hover {
    text-decoration: underline;
  }

  section {
    margin-bottom: var(--space-16);
  }
  section h2 {
    font-size: var(--font-size-2xl);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    border-bottom: var(--border-width) solid var(--color-black);
    padding-bottom: var(--space-2);
    margin-bottom: var(--space-4);
  }
  section h3 {
    font-size: var(--font-size-2xl);
    margin: var(--space-6) 0 var(--space-3) 0;
    color: var(--color-gray-700);
  }
  .section-desc {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  .api-card {
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--font-size-md);
  }

  .no-data {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-body);
    padding: var(--space-4);
    font-style: italic;
  }

  .config-card {
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .config-card h3 {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-xl);
  }
  .config-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2);
    margin: 0;
  }
  .config-list div {
    display: flex;
    gap: var(--space-2);
  }
  .config-list dt {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    min-width: 80px;
  }
  .config-list dd {
    margin: 0;
    font-size: var(--font-size-md);
  }
  .config-list code {
    background: var(--color-gray-100);
    padding: 2px var(--space-1);
    font-size: var(--font-size-sm);
  }
  .docs-ref {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--space-3);
    font-style: italic;
  }

  .source-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-4);
    margin-bottom: var(--space-8);
  }
  .source-card {
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-4);
  }
  .source-card h4 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-lg);
  }
  .source-desc {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
  }
  .source-meta {
    display: flex;
    gap: var(--space-4);
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-sm);
    flex-wrap: wrap;
  }
  .source-meta div {
    display: flex;
    gap: var(--space-1);
  }
  .source-meta dt {
    color: var(--color-text-tertiary);
  }
  .source-meta dd {
    margin: 0;
  }
  .source-notes {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: var(--space-2) 0 0 0;
    font-style: italic;
  }
  .source-url,
  .source-path {
    font-size: var(--font-size-base);
    color: var(--color-gray-700);
    word-break: break-all;
    display: block;
    margin-top: var(--space-2);
  }
  .source-path {
    background: var(--color-gray-100);
    padding: var(--space-1) var(--space-2);
    color: var(--color-gray-700);
  }

  .version-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: var(--space-3);
    margin: 0;
  }
  .version-list div {
    display: flex;
    gap: var(--space-2);
  }
  .version-list dt {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    min-width: 120px;
  }
  .version-list dd {
    margin: 0;
    font-size: var(--font-size-md);
  }
  .version-list a {
    color: var(--color-gray-700);
  }

  .release-notes {
    margin-top: var(--space-6);
  }
  .release-notes summary {
    cursor: pointer;
    font-size: var(--font-size-md);
    color: var(--color-gray-700);
  }
  .release-notes pre {
    background: var(--color-gray-100);
    padding: var(--space-4);
    font-size: var(--font-size-body);
    white-space: pre-wrap;
    margin-top: var(--space-3);
    line-height: var(--leading-relaxed);
  }

  footer {
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-5);
    text-align: center;
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }
  footer a {
    color: var(--color-gray-700);
  }
</style>
