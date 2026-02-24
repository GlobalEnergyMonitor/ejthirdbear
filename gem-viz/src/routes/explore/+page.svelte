<script>
  /**
   * EXPLORE PAGE
   * Interactive dashboard with live DuckDB queries against parquet data
   */

  import { link, factsheetLink } from '$lib/links';
  import TopOwners from '$lib/widgets/TopOwners.svelte';
  import CountryBreakdown from '$lib/widgets/CountryBreakdown.svelte';
  import StatusDistribution from '$lib/widgets/StatusDistribution.svelte';

  // Filter state
  let selectedTracker = $state(null);

  const trackers = [
    { value: null, label: 'All Trackers' },
    { value: 'Coal Plant', label: 'Coal Plants' },
    { value: 'Gas Plant', label: 'Gas Plants' },
    { value: 'Coal Mine', label: 'Coal Mines' },
    { value: 'Steel Plant', label: 'Steel Plants' },
    { value: 'Iron Mine', label: 'Iron Mines' },
    { value: 'Bioenergy Power', label: 'Bioenergy' },
  ];
</script>

<svelte:head>
  <title>Explore Data — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse and explore Global Energy Monitor's ownership database by entity, asset, tracker type, and ownership structure."
  />
</svelte:head>

<main>
  <header>
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> / Explore
    </nav>
    <h1>Explore the Data</h1>
    <p class="lead">
      Interactive queries against GEM ownership data. All queries run client-side using DuckDB WASM.
    </p>
  </header>

  <!-- Tracker Filter -->
  <section class="filter-bar">
    <span class="filter-label">Filter by tracker:</span>
    <div class="filter-chips">
      {#each trackers as tracker}
        <button
          class="chip"
          class:active={selectedTracker === tracker.value}
          onclick={() => (selectedTracker = tracker.value)}
        >
          {tracker.label}
        </button>
      {/each}
    </div>
  </section>

  <!-- Dashboard Grid -->
  <section class="dashboard">
    <div class="widget-grid">
      <!-- Status Distribution -->
      <div class="widget-cell">
        <StatusDistribution tracker={selectedTracker} title="Status Distribution" />
      </div>

      <!-- Country Breakdown -->
      <div class="widget-cell wide">
        <CountryBreakdown tracker={selectedTracker} limit={20} title="Assets by Country" />
      </div>

      <!-- Top Owners by Assets -->
      <div class="widget-cell">
        <TopOwners
          tracker={selectedTracker}
          metric="assets"
          limit={10}
          title="Top Owners by Assets"
        />
      </div>

      <!-- Top Owners by Capacity -->
      <div class="widget-cell">
        <TopOwners
          tracker={selectedTracker}
          metric="capacity"
          limit={10}
          title="Top Owners by Capacity"
        />
      </div>
    </div>
  </section>

  <section class="factsheet-cta">
    <h3>Dataset Documentation</h3>
    <p>Explore field definitions, data distributions, and sample records for each tracker.</p>
    <div class="cta-links">
      <a href={factsheetLink('Coal Mine')} class="factsheet-link">Coal Mine Factsheet</a>
      <a href={link('cards')} class="factsheet-link secondary">Project Cards</a>
    </div>
  </section>

  <footer class="page-footer">
    <p>
      Data loaded from static parquet files. Queries execute in your browser using
      <a href="https://duckdb.org/docs/api/wasm" target="_blank" rel="noopener">DuckDB WASM</a>.
    </p>
    <a href={link('manifest')}>View data manifest</a>
  </footer>
</main>

<style>
  main {
    width: 100%;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  header {
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

  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
  }
  .filter-label {
    font-size: var(--font-size-body);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
  }
  .filter-chips {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .chip {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-body);
    border: none;
    background: transparent;
    cursor: pointer;
    transition: var(--transition-fast);
  }
  .chip:hover {
    text-decoration: underline;
  }
  .chip.active {
    color: var(--color-black);
    text-decoration: underline;
  }

  .dashboard {
    margin-bottom: var(--space-10);
  }
  .widget-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-5);
  }
  .widget-cell.wide {
    grid-column: span 2;
  }
  @media (max-width: 700px) {
    .widget-cell.wide {
      grid-column: span 1;
    }
  }

  .factsheet-cta {
    padding: var(--space-5);
    margin-bottom: var(--space-8);
  }
  .factsheet-cta h3 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-black);
    margin: 0 0 var(--space-2) 0;
  }
  .factsheet-cta p {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
  }
  .cta-links {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .factsheet-link {
    display: inline-block;
    padding: var(--space-2) var(--space-4);
    background: transparent;
    color: var(--color-black);
    text-decoration: none;
    font-size: var(--font-size-md);
    font-weight: 500;
    transition: var(--transition-fast);
    text-decoration: underline;
  }
  .factsheet-link:hover {
    text-decoration-thickness: 2px;
  }
  .factsheet-link.secondary {
    background: transparent;
  }
  .factsheet-link.secondary:hover {
    text-decoration-thickness: 2px;
  }

  .page-footer {
    padding-top: var(--space-5);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }
  .page-footer a {
    color: var(--color-gray-700);
  }
</style>
