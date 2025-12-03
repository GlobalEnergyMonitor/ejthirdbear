<script>
  import { base } from '$app/paths';
  export let data;

  const { assets, tableName, idCol, nameCol, statusCol, ownerCol, countryCol } = data;

  // Debug: log what we're getting
  if (assets.length > 0) {
    console.log('=== ASSET DATA DEBUG ===');
    console.log('Table:', tableName);
    console.log('All columns:', Object.keys(assets[0]));
    console.log('Detected columns:', { idCol, nameCol, statusCol, ownerCol, countryCol });
    console.log('First asset:', assets[0]);
    console.log('========================');
  }
</script>

<svelte:head>
  <title>All Assets — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Back to Overview</a>
    <span class="title">All Assets</span>
    <span class="count">{assets.length.toLocaleString()} assets</span>
  </header>

  {#if assets.length > 0}
    <div class="assets-list">
      {#each assets as asset}
        <a href="{base}/asset/{asset[idCol]}/index.html" class="asset-card">
          {#if nameCol && asset[nameCol]}
            <h3>{asset[nameCol]}</h3>
          {:else}
            <h3>ID: {asset[idCol]}</h3>
          {/if}

          <div class="asset-meta">
            {#if statusCol && asset[statusCol]}
              <span class="meta-item status">{asset[statusCol]}</span>
            {/if}
            {#if ownerCol && asset[ownerCol]}
              <span class="meta-item owner">{asset[ownerCol]}</span>
            {/if}
            {#if countryCol && asset[countryCol]}
              <span class="meta-item country">{asset[countryCol]}</span>
            {/if}
          </div>
        </a>
      {/each}
    </div>
  {:else}
    <p class="no-data">No assets found</p>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 0 40px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    gap: 20px;
    align-items: baseline;
  }

  .back-link {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .back-link:hover {
    text-decoration: none;
  }

  .title {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .count {
    font-size: 10px;
    color: #999;
    margin-left: auto;
  }

  .assets-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
  }

  .asset-card {
    padding: 20px;
    background: #fff;
    border: 1px solid #ddd;
    text-decoration: none;
    color: #000;
    transition: all 0.1s ease;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .asset-card:hover {
    border-color: #000;
    background: #fafafa;
  }

  h3 {
    font-size: 15px;
    font-weight: normal;
    margin: 0;
    font-family: Georgia, serif;
    line-height: 1.3;
  }

  .asset-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 10px;
  }

  .meta-item {
    padding: 3px 8px;
    background: #f0f0f0;
    border: 1px solid #ddd;
    font-family: Georgia, serif;
    letter-spacing: 0.3px;
  }

  .meta-item.status {
    font-weight: bold;
    background: #000;
    color: #fff;
    border-color: #000;
  }

  .no-data {
    padding: 60px 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
    font-style: italic;
  }

  @media (max-width: 768px) {
    .assets-list {
      grid-template-columns: 1fr;
    }
  }
</style>
