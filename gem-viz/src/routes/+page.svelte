<script>
  // ============================================================================
  // HOMEPAGE
  // Landing page with navigation, featured assets/entities, and interactive map
  // ============================================================================

  // --- IMPORTS ---
  import { assetLink, entityLink } from '$lib/links';
  import SimpleMap from '$lib/SimpleMap.svelte';
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

  // Combined for any future use
  const _featuredAssets = [...coalPlants, ...steelMining, ...oilGas];
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>GEM Viz — Global Energy Monitor Data Visualization</title>
</svelte:head>

<main>
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

  <!-- Interactive Map -->
  <SimpleMap />
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  main {
    width: 100%;
    margin: 0;
    padding: var(--space-5) var(--space-10);
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
</style>
