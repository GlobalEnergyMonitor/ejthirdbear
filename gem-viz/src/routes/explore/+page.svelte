<script>
  /**
   * EXPLORE PAGE
   * Interactive dashboard with live REST API queries
   */

  import { link, fieldguideLink } from '$lib/links';
  import TopOwners from '$lib/widgets/TopOwners.svelte';
  import CountryBreakdown from '$lib/widgets/CountryBreakdown.svelte';
  import StatusDistribution from '$lib/widgets/StatusDistribution.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // Filter state
  let selectedTracker = $state(null);

  const trackers = [
    { value: null, label: 'All Trackers' },
    { value: 'Coal Plant', label: 'Coal Plants' },
    { value: 'Gas Plant', label: 'Gas Plants' },
    { value: 'Steel Plant', label: 'Steel Plants' },
    { value: 'Iron Mine', label: 'Iron Mines' },
    { value: 'Bioenergy Power', label: 'Bioenergy' },
    { value: 'Gas Pipeline', label: 'Gas Pipelines' },
  ];
</script>

<svelte:head>
  <title>Explore Data — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse and explore Global Energy Monitor's ownership database by entity, asset, tracker type, and ownership structure."
  />
  <SeoMeta
    title="Explore Data — Global Energy Monitor"
    description="Browse and explore Global Energy Monitor's ownership database by entity, asset, tracker type, and ownership structure."
  />
</svelte:head>

<div class="page">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'Explore' }]}
    title="Explore the Data"
    lead="Interactive queries against GEM ownership data via the REST API."
  />

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
      <a href={fieldguideLink()} class="factsheet-link">Tracker FieldGuide</a>
      <a href={link('controlchain')} class="factsheet-link secondary">ControlChain</a>
      <a href={link('cards')} class="factsheet-link secondary">Project Cards</a>
    </div>
  </section>

  <footer class="page-back-footer">
    <p>Data from the GEM REST API at gem-api.thirdbear.net. Exact counts via faceted queries.</p>
    <a href={link('manifest')}>View data manifest</a>
  </footer>
</div>

<style>
  .page {
    width: 100%;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
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
  @media (max-width: 768px) {
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
</style>
