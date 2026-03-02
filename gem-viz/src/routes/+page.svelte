<script>
  // ============================================================================
  // HOMEPAGE
  // Landing page with navigation, featured assets/entities, and interactive map
  // ============================================================================

  // --- IMPORTS ---
  import { assetLink, entityLink } from '$lib/links';
  import TrackerGlobeGrid from '$lib/components/TrackerGlobeGrid.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  // --- DATA ---
  // Featured entities - interesting ownership structures from Observable notebooks
  const featuredEntities = [
    { name: 'BlackRock Inc', id: 'E100001000348', note: 'Major institutional investor' },
    { name: 'Vanguard Group', id: 'E100001000349', note: 'Large passive investor' },
    { name: 'State Grid Corporation of China', id: 'E100000106145', note: 'State-owned utility' },
    { name: 'Adani Group', id: 'E100000122804', note: 'Indian conglomerate' },
  ];

  // Featured assets - diverse types from Observable notebooks
  // Coal Plants
  const coalPlants = [
    { name: 'Sines Power Station', id: 'G100000109409', tracker: 'Coal Plant', note: 'Portugal' },
    {
      name: 'Baghlan Power Station',
      id: 'G100001057899',
      tracker: 'Coal Plant',
      note: 'Complex gov ownership',
    },
    {
      name: 'Nanshan Aluminum Donghai',
      id: 'G100000107258',
      tracker: 'Coal Plant',
      note: 'China industrial',
    },
    { name: 'Cebu Energy', id: 'G100000110218', tracker: 'Coal Plant', note: 'Philippines' },
  ];

  // Steel & Mining - cyclic ownership examples
  const steelMining = [
    {
      name: 'CAP Acero Huachipato Steel',
      id: 'P100000120066',
      tracker: 'Steel Plant',
      note: 'Cyclic ownership',
    },
    { name: 'PKN Coal Mines', id: 'M4499', tracker: 'Coal Mine', note: 'Polish mining' },
  ];

  // Oil & Gas
  const oilGas = [
    {
      name: 'Bayernoil Refinery',
      id: 'G100000400116',
      tracker: 'Gas Plant',
      note: 'German refinery',
    },
  ];
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>Global Energy Monitor — Ownership Data Explorer</title>
  <meta
    name="description"
    content="Explore ownership structures, corporate relationships, and asset portfolios across global energy infrastructure with interactive visualizations."
  />
</svelte:head>

<div class="page home">
  <div class="home-layout">
    <aside class="home-sidebar">
      <!-- Featured Entities -->
      <section class="asset-links">
        <p>Featured entities</p>
        <div class="link-list">
          {#each featuredEntities as entity}
            <a href={entityLink(entity.id)} class="entity-link" title={entity.note}>
              <span class="entity-icon">E</span>
              {entity.name}
            </a>
          {/each}
        </div>
      </section>

      <!-- Coal Plants -->
      <section class="asset-links">
        <p>Coal plants</p>
        <div class="link-list">
          {#each coalPlants as asset}
            <a href={assetLink(asset.id)} class="asset-link" title={asset.note}>
              <TrackerIcon tracker={asset.tracker} size={10} />
              {asset.name}
            </a>
          {/each}
        </div>
      </section>

      <!-- Steel & Mining -->
      <section class="asset-links">
        <p>Steel & Mining</p>
        <div class="link-list">
          {#each steelMining as asset}
            <a href={assetLink(asset.id)} class="asset-link" title={asset.note}>
              <TrackerIcon tracker={asset.tracker} size={10} />
              {asset.name}
            </a>
          {/each}
        </div>
      </section>

      <!-- Oil & Gas -->
      <section class="asset-links">
        <p>Oil & Gas</p>
        <div class="link-list">
          {#each oilGas as asset}
            <a href={assetLink(asset.id)} class="asset-link" title={asset.note}>
              <TrackerIcon tracker={asset.tracker} size={10} />
              {asset.name}
            </a>
          {/each}
        </div>
      </section>
    </aside>

    <!-- Tracker Globe Grid -->
    <section class="home-globe">
      <TrackerGlobeGrid />
    </section>
  </div>
</div>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  .page.home {
    width: 100%;
    margin: 0;
    padding: var(--space-5) var(--space-10) var(--space-8);
  }

  .home-layout {
    display: grid;
    grid-template-columns: minmax(240px, 360px) minmax(0, 1.35fr);
    gap: var(--space-8);
    align-items: stretch;
  }

  .home-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .home-globe {
    min-height: 0;
    max-height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .home-globe :global(.globe-grid) {
    max-width: 500px;
  }

  /* Featured Sections */
  .asset-links {
    display: flex;
    gap: var(--space-3);
    align-items: baseline;
    margin-bottom: var(--space-6);
    flex-wrap: wrap;
  }
  .asset-links p {
    margin: 0;
    font-size: var(--font-size-md);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-gray-600);
  }
  .link-list {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .link-list a {
    color: var(--color-black);
    font-size: var(--font-size-body);
    text-decoration: underline;
  }
  .link-list a:hover {
    text-decoration: none;
  }
  .asset-link,
  .entity-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .entity-icon {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  @media (max-width: 1024px) {
    .home-layout {
      grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
      gap: var(--space-5);
    }

    .home-globe :global(.globe-grid) {
      max-width: 420px;
    }
  }

  @media (max-width: 900px) {
    .page.home {
      padding: var(--space-4) var(--space-5) var(--space-6);
    }

    .home-layout {
      grid-template-columns: 1fr;
    }

    .home-globe {
      order: -1;
    }

    .home-globe :global(.globe-grid) {
      max-width: 100%;
    }
  }
</style>
