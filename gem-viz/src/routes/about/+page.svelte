<script>
  /**
   * ABOUT / METHODOLOGY / CHANGELOG
   * Public-facing documentation for GEM Viz
   */

  import { link } from '$lib/links';
  import { dataVersionInfo, TrackerDatasets } from '$lib/data-config/data-sources';

  // Version history - add new entries at the top
  const changelog = [
    {
      version: '0.1.14',
      date: '2025-12-15',
      changes: [
        'Added investigation cart for collecting assets and entities',
        'New /report page with co-ownership analysis and PDF export',
        'Added persistent navigation bar across all pages',
        'Geographic breakdown showing asset distribution by country',
        'Shareable investigation URLs with clipboard copy',
      ],
    },
    {
      version: '0.1.13',
      date: '2025-12-15',
      changes: [
        'Added custom 404 error page with helpful navigation',
        'Refactored all route pages for improved code readability',
        'Added unit test suite with 61 tests (vitest)',
        'Created data manifest page for admin/debugging',
        'Fixed version metadata synchronization',
      ],
    },
    {
      version: '0.1.12',
      date: '2025-12-15',
      changes: [
        'Integrated Observable notebook visualizations (Ownership Flower, Asset Screener)',
        'Added TrackerIcon and StatusIcon components with GEM brand colors',
        'Consolidated and removed 13 zombie/duplicate components',
        'Added RelationshipNetwork visualization to asset pages',
      ],
    },
    {
      version: '0.1.11',
      date: '2025-12-12',
      changes: [
        'Fixed Digital Ocean Spaces URL routing (trailing slash handling)',
        'Pre-baked entity portfolio data at build time',
        'Added map color coding by tracker type with legend',
        'Removed dead hydration code from ownership visualizations',
        'Added smart redirects between asset and entity pages',
      ],
    },
    {
      version: '0.1.10',
      date: '2025-12-10',
      changes: [
        'Switched to bare GEM Unit ID URLs (/asset/G100001057899)',
        'Consolidated ownership records into single asset pages',
        'Reduced page count from 62,366 to 13,472 unique assets',
        'Added ownership table with all owners per asset',
      ],
    },
    {
      version: '0.1.0',
      date: '2025-11-22',
      changes: [
        'Initial release with static site generation',
        'Bulk fetch architecture for MotherDuck data',
        'Interactive MapLibre maps on asset pages',
        'Digital Ocean Spaces deployment',
      ],
    },
  ];

  // Data sources for methodology section (from data-sources.ts)
  const trackers = Object.values(TrackerDatasets).map((d) => ({
    name: d.name,
    assets: `~${d.rowCount?.toLocaleString() || 'N/A'}`,
    lastUpdated: d.lastUpdated,
    version: d.version,
  }));
</script>

<svelte:head>
  <title>About — GEM Viz</title>
  <meta
    name="description"
    content="About GEM Viz: methodology, data sources, and version history for the Global Energy Monitor data visualization tool."
  />
</svelte:head>

<main>
  <header class="page-header">
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> / About
    </nav>
    <h1>About GEM Viz</h1>
    <p class="lead">
      An interactive visualization tool for exploring Global Energy Monitor's energy infrastructure
      and ownership data.
    </p>
  </header>

  <nav class="toc">
    <h2>Contents</h2>
    <ul>
      <li><a href="#overview">Overview</a></li>
      <li><a href="#data-sources">Data Sources</a></li>
      <li><a href="#methodology">Methodology</a></li>
      <li><a href="#how-to-use">How to Use</a></li>
      <li><a href="#changelog">Version History</a></li>
      <li><a href="#credits">Credits & Contact</a></li>
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
      <h4>Current Data Release</h4>
      <div class="version-grid">
        <div class="version-item">
          <span class="label">Release Version</span>
          <span class="value">{dataVersionInfo.currentReleaseVersion}</span>
        </div>
        <div class="version-item">
          <span class="label">Release Date</span>
          <span class="value">{dataVersionInfo.releaseDate}</span>
        </div>
        <div class="version-item">
          <span class="label">Last Verified</span>
          <span class="value">{dataVersionInfo.lastVerificationDate}</span>
        </div>
      </div>
    </div>

    <p>
      All data comes from Global Energy Monitor's publicly published trackers. GEM maintains
      comprehensive databases of energy infrastructure assets through a combination of official
      filings, news monitoring, satellite imagery, and direct research.
    </p>

    <h3>Asset Trackers</h3>
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

    <h3>Ownership Data</h3>
    <p>
      The Ownership Tracker consolidates ownership relationships from all asset trackers, providing:
    </p>
    <ul>
      <li>
        <strong>~50,000 entities</strong> — Companies, governments, individuals, and other owners
      </li>
      <li>
        <strong>~100,000 entity relationships</strong> — Parent-subsidiary and shareholder links
      </li>
      <li>
        <strong>~150,000 asset ownership records</strong> — Direct ownership stakes in infrastructure
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
      <li>Use the 3D network view to explore relationship graphs</li>
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
        Colored dots indicate asset type using GEM brand colors (red = coal, purple = gas, green =
        bioenergy, etc.)
      </dd>

      <dt>Status Icons</dt>
      <dd>Yellow circle = proposed, X mark = retired/cancelled, no icon = operating</dd>
    </dl>

    <h3>Exporting Data</h3>
    <p>
      Use the <a href={link('export')}>Export page</a> to download selected assets as CSV for further
      analysis. Geographic searches can be added to the export list.
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
      <li>MotherDuck — Cloud data warehouse</li>
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

  <footer class="page-footer">
    <a href={link('index')}>Back to Homepage</a>
  </footer>
</main>

<style>
  main {
    width: 100%;
    padding: 40px 20px 80px;
    font-family: system-ui, sans-serif;
    line-height: 1.6;
  }

  /* Keep prose sections readable */
  main p, main li {
    max-width: 65ch;
  }

  .page-header {
    margin-bottom: 40px;
    padding-bottom: 24px;
    border-bottom: 2px solid #000;
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
    font-size: 36px;
    margin: 0 0 12px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .lead {
    font-size: 18px;
    color: #333;
    margin: 0;
  }

  .toc {
    background: #f9f9f9;
    padding: 20px 24px;
    margin-bottom: 48px;
    border: 1px solid #ddd;
  }
  .toc h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
    color: #666;
  }
  .toc ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 24px;
  }
  .toc a {
    color: #333;
    text-decoration: none;
    font-size: 14px;
  }
  .toc a:hover {
    text-decoration: underline;
  }

  section {
    margin-bottom: 56px;
  }
  section h2 {
    font-size: 24px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid #000;
    padding-bottom: 8px;
    margin: 0 0 20px 0;
  }
  section h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 28px 0 12px 0;
    color: #333;
  }
  section p {
    margin: 0 0 16px 0;
    color: #333;
  }
  .section-intro {
    color: #666;
    font-size: 15px;
  }

  ul,
  ol {
    margin: 0 0 20px 0;
    padding-left: 24px;
  }
  li {
    margin-bottom: 8px;
  }
  .feature-list li {
    margin-bottom: 12px;
  }

  a {
    color: #333;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0 24px;
    font-size: 14px;
  }
  .data-table th,
  .data-table td {
    text-align: left;
    padding: 10px 12px;
    border-bottom: 1px solid #ddd;
  }
  .data-table th {
    background: #f5f5f5;
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
  }
  .data-table tbody tr:hover {
    background: #fafafa;
  }

  .data-version-box {
    background: #f9f9f9;
    border: 2px solid #000;
    padding: 20px;
    margin-bottom: 24px;
  }
  .data-version-box h4 {
    margin: 0 0 16px 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .version-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .version-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .version-item .label {
    font-size: 10px;
    text-transform: uppercase;
    color: #666;
    letter-spacing: 0.5px;
  }
  .version-item .value {
    font-size: 16px;
    font-weight: 600;
    font-family: monospace;
  }
  .data-contact {
    font-size: 13px;
    color: #666;
    margin-top: 16px;
  }

  .example-box {
    background: #f5f5f5;
    padding: 16px 20px;
    margin: 16px 0 24px;
    border-left: 3px solid #333;
  }
  .example-box code {
    display: block;
    font-size: 13px;
    color: #333;
    margin-bottom: 12px;
    word-break: break-word;
  }
  .example-note {
    font-size: 13px;
    color: #666;
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
    gap: 10px;
    margin-bottom: 10px;
  }
  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-dot.proposed {
    background: #ffe366;
  }
  .status-dot.operating {
    background: #4a57a8;
  }
  .status-dot.retired {
    background: #061f5f;
  }
  .status-dot.cancelled {
    background: #becccf;
  }

  .viz-guide {
    margin: 16px 0;
  }
  .viz-guide dt {
    font-weight: 600;
    margin-top: 16px;
  }
  .viz-guide dd {
    margin: 4px 0 0 0;
    color: #555;
  }

  .changelog {
    margin-top: 24px;
  }
  .release {
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #eee;
  }
  .release:last-child {
    border-bottom: none;
  }
  .release header {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 12px;
  }
  .release h3 {
    margin: 0;
    font-size: 18px;
    font-family: 'Monaco', monospace;
  }
  .release time {
    font-size: 13px;
    color: #666;
  }
  .release ul {
    margin: 0;
    padding-left: 20px;
  }
  .release li {
    font-size: 14px;
    color: #444;
    margin-bottom: 6px;
  }

  .tech-list {
    columns: 2;
    column-gap: 32px;
  }
  .tech-list li {
    font-size: 14px;
  }

  .page-footer {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid #ddd;
  }
  .page-footer a {
    color: #333;
    text-decoration: none;
    font-size: 14px;
  }
  .page-footer a:hover {
    text-decoration: underline;
  }

  @media (max-width: 600px) {
    .toc ul {
      flex-direction: column;
      gap: 8px;
    }
    .tech-list {
      columns: 1;
    }
    .release header {
      flex-direction: column;
      gap: 4px;
    }
  }
</style>
