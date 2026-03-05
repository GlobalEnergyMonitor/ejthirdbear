<script>
  /**
   * ABOUT / METHODOLOGY / CHANGELOG
   * Public-facing documentation for GEM Viz
   */

  import { link } from '$lib/links';
  import { dataVersionInfo, TrackerDatasets } from '$lib/data-config/data-sources';
  import { changelog } from '$lib/data/changelog';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';

  /**
   * @typedef {Object} PageStats
   * @property {number} [totalLocations]
   * @property {number} [totalCountries]
   * @property {number} [totalAssets]
   * @property {number} [totalEntities]
   * @property {Array<{name: string, count: number}>} [trackerBreakdown]
   * @property {string} [buildTime]
   * @property {string} [version]
   */

  // Real stats from +page.server.js
  /** @type {{ data?: { stats?: PageStats } }} */
  let { data } = $props();
  /** @type {PageStats} */
  const stats = $derived(data?.stats || {});

  // Data sources for methodology section (from data-sources.ts)
  const trackers = Object.values(TrackerDatasets).map((d) => ({
    name: d.name,
    assets: `~${d.rowCount?.toLocaleString() || 'N/A'}`,
    lastUpdated: d.lastUpdated,
    version: d.version,
  }));
</script>

<svelte:head>
  <title>About — Global Energy Monitor</title>
  <meta
    name="description"
    content="About the Global Energy Monitor ownership visualization platform: methodology, data sources, and how to explore energy asset ownership structures."
  />
</svelte:head>

<div class="page">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'About' }]}
    title="About GEM Viz"
    lead="An interactive visualization tool for exploring Global Energy Monitor's energy infrastructure and ownership data."
  />

  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      <li><a href="#overview">Overview</a></li>
      <li><a href="#data-sources">Data Sources</a></li>
      <li><a href="#methodology">Methodology</a></li>
      <li><a href="#how-to-use">How to Use</a></li>
      <li><a href="#changelog">Version History</a></li>
      <li><a href="#credits">Credits & Contact</a></li>
      <li><a href="#dev-tools">Developer Tools</a></li>
    </ul>
  </nav>

  <!-- Overview -->
  <section id="overview">
    <h2>Overview</h2>
    <p>
      GEM Viz provides interactive access to Global Energy Monitor's comprehensive database of
      energy infrastructure worldwide. The tool enables researchers, journalists, policymakers, and
      the public to:
    </p>
    <ul class="feature-list">
      <li>
        <strong>Explore assets</strong> — Browse detailed information on power plants, mines, pipelines,
        and industrial facilities
      </li>
      <li>
        <strong>Trace ownership</strong> — Follow ownership chains from assets through subsidiaries to
        ultimate parent companies
      </li>
      <li>
        <strong>Visualize networks</strong> — See relationship graphs showing how entities connect through
        ownership
      </li>
      <li>
        <strong>Search geographically</strong> — Find assets within any region using the interactive
        map
      </li>
      <li>
        <strong>Analyze portfolios</strong> — View aggregated holdings by entity, tracker type, and status
      </li>
    </ul>
  </section>

  <!-- Data Sources -->
  <section id="data-sources">
    <h2>Data Sources</h2>

    <div class="data-version-box">
      <h4>Current Database Statistics</h4>
      <div class="version-grid stats-grid">
        <div class="version-item stat-item">
          <span class="value stat-value">{stats.totalAssets?.toLocaleString() || '13,472'}</span>
          <span class="label">Unique Assets</span>
        </div>
        <div class="version-item stat-item">
          <span class="value stat-value">{stats.totalEntities?.toLocaleString() || '3,952'}</span>
          <span class="label">Owner Entities</span>
        </div>
        <div class="version-item stat-item">
          <span class="value stat-value">{stats.totalLocations?.toLocaleString() || '21,898'}</span>
          <span class="label">Locations</span>
        </div>
        <div class="version-item stat-item">
          <span class="value stat-value">{stats.totalCountries || 185}</span>
          <span class="label">Countries</span>
        </div>
      </div>
      <div class="version-meta">
        {#if stats.buildTime}
          <span>Last updated: {stats.buildTime}</span>
        {/if}
        {#if stats.version}
          <span>Build: {stats.version}</span>
        {/if}
      </div>
    </div>

    <p>
      All data comes from Global Energy Monitor's publicly published trackers. GEM maintains
      comprehensive databases of energy infrastructure assets through a combination of official
      filings, news monitoring, satellite imagery, and direct research.
    </p>

    <h3>Asset Trackers</h3>
    {#if stats.trackerBreakdown?.length > 0}
      <table class="data-table">
        <thead>
          <tr>
            <th>Tracker</th>
            <th>Locations</th>
            <th>% of Total</th>
          </tr>
        </thead>
        <tbody>
          {#each stats.trackerBreakdown as tracker}
            <tr>
              <td>{tracker.name}</td>
              <td>{tracker.count.toLocaleString()}</td>
              <td>{((tracker.count / stats.totalLocations) * 100).toFixed(1)}%</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th>Tracker</th>
            <th>Assets</th>
            <th>Version</th>
            <th>Last Updated</th>
          </tr>
        </thead>
        <tbody>
          {#each trackers as tracker}
            <tr>
              <td>{tracker.name}</td>
              <td>{tracker.assets}</td>
              <td>{tracker.version}</td>
              <td>{tracker.lastUpdated}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    <h3>Ownership Data</h3>
    <p>
      The Ownership Tracker consolidates ownership relationships from all asset trackers, providing:
    </p>
    <ul>
      <li>
        <strong>{stats.totalEntities?.toLocaleString() || '~4,000'} entities</strong> — Companies, governments,
        individuals, and other owners
      </li>
      <li>
        <strong>{stats.totalAssets?.toLocaleString() || '~13,000'} unique assets</strong> — Energy infrastructure
        units across all trackers
      </li>
      <li>
        <strong>{stats.totalLocations?.toLocaleString() || '~22,000'} locations</strong> —
        Geographic coordinates in {stats.totalCountries || 185} countries
      </li>
    </ul>

    <h3>Data Updates</h3>
    <p>
      GEM trackers are updated on a rolling basis, with major releases typically occurring
      quarterly. This visualization reflects the data snapshot taken at build time (see version info
      in footer).
    </p>
    <p class="data-contact">
      For data questions: <a href="mailto:{dataVersionInfo.dataContact}"
        >{dataVersionInfo.dataContact}</a
      >
    </p>
  </section>

  <!-- Methodology -->
  <section id="methodology">
    <h2>Methodology</h2>

    <h3>Ownership Chains</h3>
    <p>Ownership is tracked through chains of relationships. For example:</p>
    <div class="example-box">
      <code> BlackRock Inc (6.82%) → EDP SA (100%) → EDP Gestão (100%) → Sines Power Station </code>
      <p class="example-note">
        BlackRock owns 6.82% of EDP SA, which owns 100% of EDP Gestão, which owns 100% of Sines
        Power Station. BlackRock's effective ownership of Sines is 6.82% × 100% × 100% = 6.82%.
      </p>
    </div>

    <h3>Status Categories</h3>
    <p>Assets are categorized into four status groups:</p>
    <ul class="status-list">
      <li>
        <span class="status-dot proposed"></span> <strong>Proposed</strong> — Announced, pre-permit,
        permitted, pre-construction, or under construction
      </li>
      <li>
        <span class="status-dot operating"></span> <strong>Operating</strong> — Currently active and
        generating/producing
      </li>
      <li>
        <span class="status-dot retired"></span> <strong>Retired</strong> — Permanently closed, mothballed,
        or idle
      </li>
      <li>
        <span class="status-dot cancelled"></span> <strong>Cancelled</strong> — Cancelled or shelved
        projects that will not proceed
      </li>
    </ul>

    <h3>Capacity Metrics</h3>
    <p>Capacity is measured in tracker-specific units:</p>
    <ul>
      <li><strong>MW</strong> — Megawatts for power plants (coal, gas, bioenergy)</li>
      <li><strong>Mtpa</strong> — Million tonnes per annum for coal mines</li>
      <li><strong>ttpa</strong> — Thousand tonnes per annum for steel plants and iron mines</li>
      <li><strong>Bcm/y</strong> — Billion cubic meters per year for gas pipelines</li>
    </ul>

    <h3>ID System</h3>
    <p>GEM uses standardized identifiers:</p>
    <ul>
      <li><strong>G-prefix</strong> — Asset/unit IDs (e.g., G100000109409)</li>
      <li><strong>E-prefix</strong> — Entity IDs (e.g., E100001000348)</li>
      <li><strong>L-prefix</strong> — Location IDs</li>
      <li><strong>M-prefix</strong> — Mine IDs (legacy format)</li>
    </ul>
  </section>

  <!-- How to Use -->
  <section id="how-to-use">
    <h2>How to Use</h2>

    <h3>Finding Assets</h3>
    <ol>
      <li>Use the <a href={link('index')}>homepage map</a> to browse assets geographically</li>
      <li>SHIFT+drag to select a rectangular region</li>
      <li>Use the polygon tool to draw custom boundaries</li>
      <li>Click any marker to view the asset detail page</li>
    </ol>

    <h3>Exploring Ownership</h3>
    <ol>
      <li>
        Visit any <a href={link('asset/G100000109409')}>asset page</a> to see its ownership table
      </li>
      <li>Click owner names to navigate to their entity profile</li>
      <li>Entity pages show portfolio breakdown by tracker and status</li>
      <li>Use the ownership network view to explore relationship graphs</li>
    </ol>

    <h3>Understanding Visualizations</h3>
    <dl class="viz-guide">
      <dt>Ownership Flower</dt>
      <dd>
        Radial chart where petals represent tracker types. Petal angle shows share of portfolio,
        length shows capacity.
      </dd>

      <dt>Ownership Pie</dt>
      <dd>Mini pie charts show ownership percentage. Full circle = 100% ownership.</dd>

      <dt>Tracker Icons</dt>
      <dd>
        Dots indicate asset type using a warm grayscale ramp (darker = fossil, lighter =
        renewables).
      </dd>

      <dt>Status Icons</dt>
      <dd>Light circle = prospective, X mark = retired/cancelled, no icon = operating</dd>
    </dl>

    <h3>Exporting Data</h3>
    <p>
      Use the <a href={`${link('report')}#export`}>Export section in the report</a> to download selected
      assets as CSV for further analysis. Geographic searches can be added to the export list.
    </p>
  </section>

  <!-- Changelog -->
  <section id="changelog">
    <h2>Version History</h2>
    <p class="section-intro">
      GEM Viz follows semantic versioning. Major changes are documented below.
    </p>

    <div class="changelog">
      {#each changelog as release}
        <article class="release">
          <header>
            <h3>v{release.version}</h3>
            <time datetime={release.date}
              >{new Date(release.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}</time
            >
          </header>
          <ul>
            {#each release.changes as change}
              <li>{change}</li>
            {/each}
          </ul>
        </article>
      {/each}
    </div>
  </section>

  <!-- Credits -->
  <section id="credits">
    <h2>Credits & Contact</h2>

    <h3>Global Energy Monitor</h3>
    <p>
      <a href="https://globalenergymonitor.org" target="_blank" rel="noopener"
        >Global Energy Monitor</a
      >
      is a nonprofit organization that develops and shares information on energy projects worldwide.
      GEM's network of researchers creates databases that identify, map, and characterize energy infrastructure.
    </p>

    <h3>Data Access</h3>
    <ul>
      <li>
        <a href="https://github.com/GlobalEnergyMonitor" target="_blank" rel="noopener"
          >GEM GitHub</a
        > — Raw tracker data and documentation
      </li>
      <li>
        <a
          href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/"
          target="_blank"
          rel="noopener">Coal Plant Tracker</a
        >
      </li>
      <li>
        <a
          href="https://globalenergymonitor.org/projects/global-gas-plant-tracker/"
          target="_blank"
          rel="noopener">Gas Plant Tracker</a
        >
      </li>
      <li>
        <a
          href="https://globalenergymonitor.org/projects/global-steel-plant-tracker/"
          target="_blank"
          rel="noopener">Steel Plant Tracker</a
        >
      </li>
    </ul>

    <h3>Visualization Credits</h3>
    <p>
      Ownership flower visualization adapted from work by
      <a href="https://www.visualcinnamon.com/" target="_blank" rel="noopener">Nadieh Bremer</a>.
      Asset screener components ported from GEM's Observable notebooks.
    </p>

    <h3>Technical Stack</h3>
    <ul class="tech-list">
      <li>SvelteKit — Application framework</li>
      <li>Ownership Tracing API — Cloud ownership service</li>
      <li>MapLibre GL — Interactive maps</li>
      <li>D3.js — Data visualizations</li>
      <li>Digital Ocean Spaces — Static hosting</li>
    </ul>

    <h3>Contact</h3>
    <p>
      For data questions: <a href="mailto:data@globalenergymonitor.org"
        >data@globalenergymonitor.org</a
      ><br />
      For technical issues:
      <a
        href="https://github.com/GlobalEnergyMonitor/Ownership_External_Dataset/issues"
        target="_blank"
        rel="noopener">GitHub Issues</a
      >
    </p>

    <h3>License</h3>
    <p>
      GEM data is available under
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener"
        >Creative Commons Attribution 4.0</a
      >. Please cite Global Energy Monitor when using this data.
    </p>
  </section>

  <!-- Developer Tools -->
  <section id="dev-tools">
    <h2>Developer Tools</h2>
    <p class="section-intro">
      All data is now fetched from the REST API. Coal plant G-prefix IDs are resolved server-side
      via the <code>/api/resolve-id</code> endpoint.
    </p>
  </section>

  <footer class="page-back-footer">
    <a href={link('index')}>Back to Homepage</a>
  </footer>
</div>

<style>
  .page {
    width: 100%;
    padding: var(--space-10) var(--space-5) var(--space-20);
    font-family: var(--font-family-sans);
    line-height: var(--leading-relaxed);
  }

  /* Keep prose sections readable */
  .page p,
  .page li {
    max-width: 65ch;
  }

  .toc {
    background: var(--color-gray-50);
    padding: var(--space-5) var(--space-6);
    margin-bottom: var(--space-12);
    border: var(--border-width) solid var(--color-border);
  }
  .toc h2 {
    font-size: var(--font-size-body);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0 0 var(--space-3) 0;
    color: var(--color-text-secondary);
  }
  .toc ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
  }
  .toc a {
    color: var(--color-gray-700);
    text-decoration: none;
    font-size: var(--font-size-lg);
  }
  .toc a:hover {
    text-decoration: underline;
  }

  section {
    margin-bottom: var(--space-14);
  }
  section h2 {
    font-size: var(--font-size-2xl);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    border-bottom: var(--border-width) solid var(--color-black);
    padding-bottom: var(--space-2);
    margin: 0 0 var(--space-5) 0;
  }
  section h3 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: var(--space-7) 0 var(--space-3) 0;
    color: var(--color-gray-700);
  }
  section p {
    margin: 0 0 var(--space-4) 0;
    color: var(--color-gray-700);
  }
  .section-intro {
    color: var(--color-text-secondary);
    font-size: var(--font-size-lg);
  }

  ul,
  ol {
    margin: 0 0 var(--space-5) 0;
    padding-left: var(--space-6);
  }
  li {
    margin-bottom: var(--space-2);
  }
  .feature-list li {
    margin-bottom: var(--space-3);
  }

  a {
    color: var(--color-gray-700);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin: var(--space-4) 0 var(--space-6);
    font-size: var(--font-size-lg);
  }
  .data-table th,
  .data-table td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
  }
  .data-table th {
    background: var(--color-gray-50);
    font-weight: 600;
    font-size: var(--font-size-body);
    text-transform: uppercase;
  }
  .data-table tbody tr:hover {
    background: var(--color-gray-50);
  }

  .data-version-box {
    background: var(--color-gray-50);
    border: 2px solid var(--color-black);
    padding: var(--space-5);
    margin-bottom: var(--space-6);
  }
  .data-version-box h4 {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--font-size-body);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .version-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-5);
  }
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
  .version-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .stat-item {
    text-align: center;
    flex-direction: column-reverse;
  }
  .version-item .label {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    color: var(--color-text-secondary);
    letter-spacing: var(--tracking-wide);
  }
  .version-item .value {
    font-size: var(--font-size-xl);
    font-weight: 600;
    font-family: var(--font-family-mono);
  }
  .stat-value {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--color-black);
  }
  .version-meta {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--color-border);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    display: flex;
    gap: var(--space-4);
  }
  .data-contact {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin-top: var(--space-4);
  }

  .example-box {
    background: var(--color-gray-50);
    padding: var(--space-4) var(--space-5);
    margin: var(--space-4) 0 var(--space-6);
    border-left: 3px solid var(--color-gray-700);
  }
  .example-box code {
    display: block;
    font-size: var(--font-size-md);
    color: var(--color-gray-700);
    margin-bottom: var(--space-3);
    word-break: break-word;
  }
  .example-note {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0;
    font-style: italic;
  }

  .status-list {
    list-style: none;
    padding: 0;
  }
  .status-list li {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .status-dot {
    width: var(--space-3);
    height: var(--space-3);
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }
  .status-dot.proposed {
    background: var(--color-status-prospective);
  }
  .status-dot.operating {
    background: var(--color-status-operating);
  }
  .status-dot.retired {
    background: var(--color-status-retired);
  }
  .status-dot.cancelled {
    background: var(--color-status-cancelled);
  }

  .viz-guide {
    margin: var(--space-4) 0;
  }
  .viz-guide dt {
    font-weight: 600;
    margin-top: var(--space-4);
  }
  .viz-guide dd {
    margin: var(--space-1) 0 0 0;
    color: var(--color-gray-600);
  }

  .changelog {
    margin-top: var(--space-6);
  }
  .release {
    margin-bottom: var(--space-8);
    padding-bottom: var(--space-6);
    border-bottom: var(--border-width) solid var(--color-gray-100);
  }
  .release:last-child {
    border-bottom: none;
  }
  .release header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }
  .release h3 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-family: var(--font-family-mono);
  }
  .release time {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
  }
  .release ul {
    margin: 0;
    padding-left: var(--space-5);
  }
  .release li {
    font-size: var(--font-size-lg);
    color: var(--color-gray-600);
    margin-bottom: var(--space-1);
  }

  .tech-list {
    columns: 2;
    column-gap: var(--space-8);
  }
  .tech-list li {
    font-size: var(--font-size-lg);
  }

  @media (max-width: 600px) {
    .toc ul {
      flex-direction: column;
      gap: var(--space-2);
    }
    .tech-list {
      columns: 1;
    }
    .release header {
      flex-direction: column;
      gap: var(--space-1);
    }
    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
    }
    .stat-value {
      font-size: var(--font-size-2xl);
    }
    .version-meta {
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
