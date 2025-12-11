<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { base } from '$app/paths';
  import { page } from '$app/stores';
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';
  import { fetchOwnerPortfolio, fetchOwnerStats, getTables } from '$lib/component-data/schema';
  import motherduck from '$lib/motherduck-wasm';

  const SCHEMA_SQL = (schema, table) => `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = '${schema}'
      AND table_name = '${table}'
    ORDER BY ordinal_position
  `;

  let loading = $state(true);
  let error = $state(null);

  let entityId = $state('');
  let entityName = $state('');
  let portfolio = $state(null);
  let stats = $state(null);
  let columns = $state([]);

  const summaryAssets = $derived(() => (portfolio?.assets || []).slice(0, 20));
  const trackerBreakdown = $derived(() => {
    const counts = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count })).sort(
      (a, b) => b.count - a.count
    );
  });
  const statusBreakdown = $derived(() => {
    const counts = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.status || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([status, count]) => ({ status, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  onMount(async () => {
    try {
      loading = true;
      error = null;

      const paramsId = get(page)?.params?.id;
      if (!paramsId) throw new Error('Missing entity ID');
      entityId = paramsId;

      const [portfolioResult, statsResult] = await Promise.all([
        fetchOwnerPortfolio(paramsId),
        fetchOwnerStats(paramsId),
      ]);

      portfolio = portfolioResult;
      stats = statsResult;
      entityName = portfolio?.spotlightOwner?.Name || paramsId;

      const { assetTable } = await getTables();
      const [schemaName, rawTable] = assetTable.split('.');
      const schemaResult = await motherduck.query(SCHEMA_SQL(schemaName, rawTable));
      columns = schemaResult.data?.map((c) => c.column_name) ?? [];
    } catch (err) {
      console.error('Entity load error:', err);
      error = err?.message || 'Failed to load entity';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{entityName || entityId || 'Entity'} — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Home</a>
    <span class="entity-type">Entity Profile</span>
  </header>

  {#if loading}
    <p class="loading">Loading entity directly from MotherDuck…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="entity-detail">
      <h1>{entityName || `ID: ${entityId}`}</h1>

      <div class="meta-grid">
        <div class="meta-item">
          <span class="label">GEM Entity ID</span>
          <span class="value"><code>{entityId}</code></span>
        </div>

        <div class="meta-item">
          <span class="label">Assets Tracked</span>
          <span class="value">
            {(stats?.total_assets ?? portfolio?.assets?.length ?? 0).toLocaleString()}
          </span>
        </div>

        {#if stats?.total_capacity_mw !== null && stats?.total_capacity_mw !== undefined}
          <div class="meta-item">
            <span class="label">Total Capacity (MW)</span>
            <span class="value">
              {Number(stats.total_capacity_mw || 0).toLocaleString()}
            </span>
          </div>
        {/if}

        {#if stats?.countries}
          <div class="meta-item">
            <span class="label">Countries</span>
            <span class="value">{stats.countries}</span>
          </div>
        {/if}

        {#if columns.length}
          <div class="meta-item">
            <span class="label">Columns scanned</span>
            <span class="value">{columns.length}</span>
          </div>
        {/if}
      </div>

      {#if trackerBreakdown.length > 0}
        <section class="external-ids">
          <h2>Tracker Mix</h2>
          <ul class="chip-list">
            {#each trackerBreakdown as row}
              <li class="chip-row">
                <span class="chip">{row.tracker}</span>
                <span class="chip-count">{row.count.toLocaleString()}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if statusBreakdown.length > 0}
        <section class="external-ids">
          <h2>Status Breakdown</h2>
          <ul class="chip-list">
            {#each statusBreakdown as row}
              <li class="chip-row">
                <span class="chip">{row.status}</span>
                <span class="chip-count">{row.count.toLocaleString()}</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if summaryAssets.length > 0}
        <section class="properties">
          <h2>Representative Assets</h2>
          <div class="asset-list">
            {#each summaryAssets as asset}
              <div class="asset-card">
                <div class="asset-header">
                  <a href="{base}/asset/{asset.id}.html" class="asset-link">
                    {asset.name || asset.id}
                  </a>
                  {#if asset.tracker}
                    <span class="badge">{asset.tracker}</span>
                  {/if}
                </div>
                <div class="asset-meta">
                  {#if asset.status}
                    <span class="chip">{asset.status}</span>
                  {/if}
                  {#if asset.locationId}
                    <span class="chip">Location {asset.locationId}</span>
                  {/if}
                  {#if asset.capacityMw}
                    <span class="chip">{Number(asset.capacityMw).toLocaleString()} MW</span>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <section class="ownership-explorer">
        <h2>Owner Explorer</h2>
        <OwnershipExplorerD3 />
      </section>
    </article>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .loading {
    padding: 30px 0 10px 0;
    color: #555;
  }

  .loading.error {
    color: #b10000;
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

  .entity-type {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .entity-detail {
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

  .value.badge {
    padding: 4px 8px;
    background: #f0f0f0;
    border-radius: 3px;
    font-size: 12px;
    font-weight: bold;
    display: inline-block;
    width: fit-content;
  }

  .value.badge.yes {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .external-ids {
    margin: 40px 0;
    padding: 20px;
    background: #f5f5f5;
    border: 1px solid #ddd;
  }

  .chip-list {
    list-style: none;
    padding: 0;
    margin: 10px 0 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip-row {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 1px solid #ddd;
    padding: 6px 10px;
  }

  .chip {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .chip-count {
    font-size: 12px;
    color: #666;
  }

  .properties {
    margin: 40px 0;
  }

  .asset-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  .asset-card {
    border: 1px solid #ddd;
    padding: 12px;
    background: #fafafa;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .asset-header {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }

  .asset-link {
    color: #000;
    text-decoration: underline;
    font-weight: 600;
  }

  .asset-link:hover {
    text-decoration: none;
  }

  .asset-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .badge {
    border: 1px solid #000;
    padding: 3px 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .metadata {
    margin-top: 60px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .gem-id {
    font-size: 12px;
    color: #999;
  }

  .gem-id code {
    background: #f5f5f5;
    padding: 2px 6px;
    border-radius: 2px;
    font-family: 'Monaco', 'Courier New', monospace;
  }

  .ownership-explorer {
    margin-top: 32px;
  }

  @media (max-width: 768px) {
    .meta-grid {
      grid-template-columns: 1fr;
    }

    .asset-list {
      grid-template-columns: 1fr;
    }
  }
</style>
