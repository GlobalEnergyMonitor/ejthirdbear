<script>
  /**
   * EXPLORE PAGE
   * Interactive dashboard with live DuckDB queries against parquet data
   */

  import { link } from '$lib/links';
  import TopOwners from '$lib/widgets/TopOwners.svelte';
  import CountryBreakdown from '$lib/widgets/CountryBreakdown.svelte';
  import StatusDistribution from '$lib/widgets/StatusDistribution.svelte';
  import QuickSearch from '$lib/widgets/QuickSearch.svelte';

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
  <title>Explore — GEM Viz</title>
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

  <!-- Search -->
  <section class="search-section">
    <QuickSearch placeholder="Search for assets or owners..." limit={8} />
  </section>

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

      <!-- Country Breakdown -->
      <div class="widget-cell wide">
        <CountryBreakdown tracker={selectedTracker} limit={20} title="Assets by Country" />
      </div>
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
    padding: 40px 20px;
    font-family: system-ui, sans-serif;
  }

  header {
    margin-bottom: 32px;
  }
  .breadcrumb {
    font-size: 12px;
    margin-bottom: 12px;
  }
  .breadcrumb a {
    color: var(--color-gray-700);
    text-decoration: none;
  }
  .breadcrumb a:hover {
    text-decoration: underline;
  }
  h1 {
    font-size: 32px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .lead {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .search-section {
    margin-bottom: 24px;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .filter-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }
  .filter-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    padding: 6px 12px;
    font-size: 12px;
    border: none;
    background: var(--color-white);
    cursor: pointer;
    transition: all 0.15s;
  }
  .chip:hover {
    border-color: var(--color-text-tertiary);
  }
  .chip.active {
    background: var(--color-black);
    color: var(--color-white);
    border-color: var(--color-black);
  }

  .dashboard {
    margin-bottom: 40px;
  }
  .widget-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }
  .widget-cell.wide {
    grid-column: span 2;
  }
  @media (max-width: 700px) {
    .widget-cell.wide {
      grid-column: span 1;
    }
  }

  .page-footer {
    border-top: 1px solid var(--color-border);
    padding-top: 20px;
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .page-footer a {
    color: var(--color-gray-700);
  }
</style>
