<script>
  import { link, assetLink, entityLink } from '$lib/links';
  import SimpleMap from '$lib/SimpleMap.svelte';

  // Featured entity
  const featuredEntity = { name: 'Featured Entity', id: 'E100001000348' };

  // Featured assets (G = coal plant, P = plant, M = mine)
  const featuredAssets = [
    { name: 'Sines Power Station', id: 'G100000109409' },
    { name: 'Baghlan Power Station', id: 'G100001057899' },
    { name: 'CAP Acero Huachipato Steel Plant', id: 'P100000120066' },
    { name: 'PKN Coal Mines', id: 'M4499' },
    { name: 'Maranhao Sao Luis Coal Plant', id: 'G100000106660' },
    { name: 'Nanshan Aluminum Donghai Coal Plant', id: 'G100000107258' }
  ];
</script>

<svelte:head>
  <title>GEM Viz — Global Energy Monitor Data Visualization</title>
</svelte:head>

<main>
  <header>
    <h1>Global Energy Monitor</h1>
    <nav>
      <a href={link('network')}>Ownership Network</a>
      <a href={link('asset')}>View All Assets</a>
    </nav>
  </header>

  <section class="asset-links">
    <p>Featured assets</p>
    <div class="link-list">
      {#each featuredAssets as asset}
        <a href={assetLink(asset.id)}>{asset.name}</a>
      {/each}
    </div>
  </section>

  <section class="asset-links">
    <p>Featured entity</p>
    <div class="link-list">
      <a href={entityLink(featuredEntity.id)}>{featuredEntity.id}</a>
    </div>
  </section>

  <SimpleMap />
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
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
</style>
