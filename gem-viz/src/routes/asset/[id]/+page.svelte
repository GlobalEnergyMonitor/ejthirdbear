<script>
  import { base } from '$app/paths';
  import AssetMap from '$lib/components/AssetMap.svelte';

  export const prerender = true;
  export let data;

  const { asset, tableName, columns, svgs, resolvedId, paramsId } = data;

  // Find special columns for prominent display
  const nameCol = columns.find(c => {
    const lower = c.toLowerCase();
    return lower === 'mine' || lower === 'plant' || lower === 'project' || lower === 'facility' ||
           lower === 'mine name' || lower === 'plant name' || lower === 'project name';
  });

  const statusCol = columns.find(c => c.toLowerCase() === 'status');
  const ownerCol = columns.find(c => c.toLowerCase() === 'owner' || c.toLowerCase() === 'parent');
  const countryCol = columns.find(c => c.toLowerCase() === 'country');
  const latCol = columns.find(c => c.toLowerCase() === 'latitude' || c.toLowerCase() === 'lat');
  const lonCol = columns.find(c => c.toLowerCase() === 'longitude' || c.toLowerCase() === 'lon');
  const gemUnitIdCol = columns.find(c => c.toLowerCase() === 'gem unit id');

  // Group remaining columns
  const specialCols = [nameCol, statusCol, ownerCol, countryCol, latCol, lonCol].filter(Boolean);
  const otherCols = columns.filter(c => !specialCols.includes(c));
</script>

<svelte:head>
  <title>{(nameCol && asset[nameCol]) ? asset[nameCol] : `ID: ${asset[columns[0]]}`} — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/asset/index.html" class="back-link">← All Assets</a>
    <span class="table-name">{tableName}</span>
  </header>

  <article class="asset-detail">
    {#if nameCol && asset[nameCol]}
      <h1>{asset[nameCol]}</h1>
    {:else}
      <h1>ID: {asset[columns[0]]}</h1>
    {/if}

    {#if resolvedId && paramsId && resolvedId !== paramsId}
      <p class="resolved-id">Resolved to composite ID: {resolvedId}</p>
    {/if}

    <div class="meta-grid">
      {#if statusCol && asset[statusCol]}
        <div class="meta-item">
          <span class="label">Status</span>
          <span class="value status">{asset[statusCol]}</span>
        </div>
      {/if}

      {#if ownerCol && asset[ownerCol]}
        <div class="meta-item">
          <span class="label">Owner</span>
          <span class="value">{asset[ownerCol]}</span>
        </div>
      {/if}

      {#if countryCol && asset[countryCol]}
        <div class="meta-item">
          <span class="label">Country</span>
          <span class="value">{asset[countryCol]}</span>
        </div>
      {/if}

      {#if latCol && lonCol && asset[latCol] && asset[lonCol]}
        <div class="meta-item">
          <span class="label">Coordinates</span>
          <span class="value">{asset[latCol]}, {asset[lonCol]}</span>
        </div>
      {/if}
    </div>

    <!-- Interactive location map -->
    {#if gemUnitIdCol && asset[gemUnitIdCol]}
      <section class="map-section">
        <h2>Location</h2>
        <AssetMap
          gemUnitId={asset[gemUnitIdCol]}
          assetName={(nameCol && asset[nameCol]) ? asset[nameCol] : `ID: ${asset[columns[0]]}`}
        />
      </section>
    {/if}

    <!-- Pre-baked server-side SVGs - zero client overhead! -->
    {#if svgs && (svgs.map || svgs.capacity || svgs.status)}
      <section class="viz-section">
        <h2>Visualizations</h2>
        <div class="viz-grid">
          {#if svgs.map}
            <div class="viz-item">
              <h3>Location Map</h3>
              {@html svgs.map}
            </div>
          {/if}

          {#if svgs.status}
            <div class="viz-item inline-badge">
              <h3>Status</h3>
              {@html svgs.status}
            </div>
          {/if}

          {#if svgs.capacity}
            <div class="viz-item">
              <h3>Capacity</h3>
              {@html svgs.capacity}
            </div>
          {/if}
        </div>
      </section>
    {/if}

    {#if otherCols.length > 0}
      <section class="properties">
        <h2>All Properties</h2>
        <dl>
          {#each otherCols as col}
            {#if asset[col] !== null && asset[col] !== undefined && asset[col] !== ''}
              <div class="property">
                <dt>{col}</dt>
                <dd>{asset[col]}</dd>
              </div>
            {/if}
          {/each}
        </dl>
      </section>
    {/if}
  </article>
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
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

  .table-name {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .asset-detail {
    font-family: Georgia, serif;
  }

  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 30px 0;
    line-height: 1.2;
  }

  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    font-weight: bold;
  }

  .value {
    font-size: 14px;
    color: #000;
  }

  .value.status {
    font-weight: bold;
  }

  .properties dl {
    display: grid;
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .property {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 20px;
    padding: 12px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .property:last-child {
    border-bottom: none;
  }

  dt {
    font-size: 11px;
    font-weight: bold;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  dd {
    font-size: 13px;
    color: #000;
    margin: 0;
  }

  .map-section {
    margin: 40px 0;
  }

  .map-section h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 0 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .viz-section {
    margin: 40px 0;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
  }

  .resolved-id {
    font-size: 11px;
    color: #555;
    margin-top: -20px;
    margin-bottom: 20px;
  }

  .viz-section h2 {
    margin-top: 0;
  }

  .viz-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 30px;
    margin-top: 20px;
  }

  .viz-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .viz-item.inline-badge {
    align-items: flex-start;
  }

  .viz-item h3 {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0;
  }

  .viz-item :global(svg) {
    max-width: 100%;
    height: auto;
  }

  @media (max-width: 768px) {
    .property {
      grid-template-columns: 1fr;
      gap: 5px;
    }

    .meta-grid {
      grid-template-columns: 1fr;
    }

    .viz-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
