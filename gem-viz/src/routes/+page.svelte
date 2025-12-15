<script>
  // ============================================================================
  // HOMEPAGE
  // Landing page with navigation, featured assets/entities, and interactive map
  // ============================================================================

  // --- IMPORTS ---
  import { link, assetLink, entityLink } from '$lib/links';
  import SimpleMap from '$lib/SimpleMap.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  // --- DATA ---
  // Featured entity
  const featuredEntity = { name: 'BlackRock Inc', id: 'E100001000348' };

  // Featured assets (Coal Plants - MotherDuck currently only has coal_plant_ownership)
  const featuredAssets = [
    { name: 'Sines Power Station', id: 'G100000109409', tracker: 'Coal Plant' },
    { name: 'Baghlan Power Station', id: 'G100001057899', tracker: 'Coal Plant' },
    { name: 'Maranhao Sao Luis Coal Plant', id: 'G100000106660', tracker: 'Coal Plant' },
    { name: 'Nanshan Aluminum Donghai Coal Plant', id: 'G100000107258', tracker: 'Coal Plant' },
    { name: 'Daqing Coal Plant', id: 'G100000105872', tracker: 'Coal Plant' },
    { name: 'Boryeong Coal Plant', id: 'G100000107719', tracker: 'Coal Plant' },
  ];
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>GEM Viz — Global Energy Monitor Data Visualization</title>
</svelte:head>

<main>
  <!-- Header with navigation -->
  <header>
    <h1>Global Energy Monitor</h1>
    <nav>
      <a href={link('network')}>Ownership Network</a>
      <a href={link('asset')}>View All Assets</a>
    </nav>
  </header>

  <!-- Featured Assets -->
  <section class="asset-links">
    <p>Featured assets</p>
    <div class="link-list">
      {#each featuredAssets as asset}
        <a href={assetLink(asset.id)} class="asset-link">
          <TrackerIcon tracker={asset.tracker} size={10} />
          {asset.name}
        </a>
      {/each}
    </div>
  </section>

  <!-- Featured Entity -->
  <section class="asset-links">
    <p>Featured entity</p>
    <div class="link-list">
      <a href={entityLink(featuredEntity.id)} class="entity-link">
        <span class="entity-icon">E</span>
        {featuredEntity.name}
      </a>
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
    padding: 20px 40px;
  }

  /* Header */
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }
  h1 {
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }
  nav {
    display: flex;
    gap: 20px;
  }
  nav a {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  nav a:hover {
    text-decoration: none;
  }

  /* Featured Sections */
  .asset-links {
    display: flex;
    gap: 14px;
    align-items: baseline;
    margin-bottom: 24px;
    flex-wrap: wrap;
  }
  .asset-links p {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #444;
  }
  .link-list {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .link-list a {
    color: #000;
    font-size: 12px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #004a63;
    color: white;
    border-radius: 50%;
    font-size: 9px;
    font-weight: bold;
    flex-shrink: 0;
  }
</style>
