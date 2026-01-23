<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { page } from '$app/stores';
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import { fetchOwnerPortfolio } from '$lib/component-data/schema';

  // Server data from +page.server.js (API-based)
  /** @type {{ data: any }} */
  let { data } = $props();

  // Check if this looks like an asset ID (starts with G) instead of entity ID (starts with E)
  function isLikelyAssetId(id) {
    return id && /^G\d+$/.test(id);
  }

  // Local state - initialized from server data if available
  let loading = $state(true); // Start loading until we fetch portfolio
  let error = $state(null);

  let entityId = $state(data?.entityId || '');
  let entityName = $state(data?.entityName || '');
  let _entity = $state(data?.entity || null); // Available from server if needed
  let portfolio = $state(null); // Fetched client-side from DuckDB

  // Compute stats from portfolio data (no longer uses fetchOwnerStats which returns 0)
  const stats = $derived.by(() => {
    if (!portfolio?.assets?.length) return null;
    const assets = portfolio.assets;
    const countries = new Set(assets.map((a) => a.country).filter(Boolean));
    const totalCapacity = assets.reduce((sum, a) => sum + (Number(a.capacityMw) || 0), 0);
    return {
      total_assets: assets.length,
      total_capacity_mw: totalCapacity > 0 ? totalCapacity : null,
      countries: countries.size,
    };
  });

  // Derived data from portfolio (client-fetched)
  const trackerBreakdown = $derived.by(() => {
    // From client fetch - portfolio has assets
    const counts = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  const statusBreakdown = $derived.by(() => {
    const counts = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.status || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([status, count]) => ({ status, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  const summaryAssets = $derived((portfolio?.assets || []).slice(0, 20));

  // Client-side fetch for portfolio data (API provides basic entity, but we need DuckDB for portfolio)
  onMount(async () => {
    const paramsId = $page.params?.id;

    // Redirect if this looks like an asset ID instead of entity ID
    if (isLikelyAssetId(paramsId)) {
      console.log(`[Entity] Redirecting ${paramsId} to asset page (G-prefix = asset ID)`);
      goto(assetLink(paramsId), { replaceState: true });
      return;
    }

    // Use entity name from API if available
    if (data?.entity?.name) {
      entityName = data.entity.name;
    }

    // Always fetch portfolio data from DuckDB (API doesn't provide this)
    try {
      loading = true;
      error = null;

      if (!paramsId) throw new Error('Missing entity ID');
      entityId = paramsId;

      // Fetch portfolio from DuckDB (stats are computed as a derived value from portfolio)
      portfolio = await fetchOwnerPortfolio(paramsId);

      // Use portfolio name if we don't have one from API
      if (!entityName && portfolio?.spotlightOwner?.Name) {
        entityName = portfolio.spotlightOwner.Name;
      }
    } catch (err) {
      console.error('Entity portfolio load error:', err);
      // Don't set error if we have basic entity data from API
      if (!data?.entity) {
        error = err?.message || 'Failed to load entity';
      }
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
    <a href={link('index')} class="back-link">← Home</a>
    <span class="entity-type">Entity Profile</span>
  </header>

  {#if loading}
    <p class="loading">Loading entity directly from MotherDuck…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="entity-detail">
      <div class="entity-header">
        <div class="header-content">
          <h1>{entityName || `ID: ${entityId}`}</h1>
          <p class="entity-subtitle">
            {#if stats?.total_assets || portfolio?.assets?.length}
              {(stats?.total_assets ?? portfolio?.assets?.length ?? 0).toLocaleString()} assets
              {#if stats?.total_capacity_mw}
                · {Number(stats.total_capacity_mw).toLocaleString()} MW
              {/if}
              {#if stats?.countries}
                · {stats.countries} countries
              {/if}
            {/if}
          </p>
        </div>
        {#if portfolio}
          <div class="header-flower">
            <OwnershipFlower {portfolio} size="medium" showTitle={false} />
          </div>
        {/if}
      </div>

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
      </div>

      {#if trackerBreakdown.length > 0}
        <section class="breakdown-section">
          <h2>Tracker Mix</h2>
          <ul class="tracker-list">
            {#each trackerBreakdown as row}
              <li class="tracker-row">
                <TrackerIcon tracker={row.tracker} size={14} showLabel variant="pill" />
                <span class="tracker-count">{row.count.toLocaleString()} assets</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if statusBreakdown.length > 0}
        <section class="breakdown-section">
          <h2>Status Breakdown</h2>
          <ul class="status-list">
            {#each statusBreakdown as row}
              <li class="status-row">
                <StatusIcon status={row.status} size={12} />
                <span class="status-label">{row.status}</span>
                <span class="status-count">{row.count.toLocaleString()}</span>
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
                  {#if asset.tracker}
                    <TrackerIcon tracker={asset.tracker} size={10} />
                  {/if}
                  <a href={assetLink(asset.id)} class="asset-link">
                    {asset.name || asset.id}
                  </a>
                  {#if asset.status}
                    <StatusIcon status={asset.status} size={10} />
                  {/if}
                </div>
                <div class="asset-meta">
                  {#if asset.status}
                    <span class="chip">{asset.status}</span>
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
        <h2>Owner Explorer (3D Network)</h2>
        <OwnershipExplorerD3 ownerEntityId={entityId} prebakedData={data?.ownerExplorerData} />
      </section>

      <section class="asset-screener-section">
        <h2>Asset Screener (Observable)</h2>
        <p class="section-subtitle">
          Full portfolio breakdown with subsidiary paths, mini bar charts, and status icons — ported
          from GEM's Observable notebook
        </p>
        <AssetScreener {entityId} {portfolio} />
      </section>
    </article>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: var(--space-10);
    max-width: 1200px;
    margin: 0 auto;
  }

  .loading {
    padding: var(--space-8) 0 var(--space-2) 0;
    color: var(--color-text-secondary);
  }

  .loading.error {
    color: var(--color-error);
  }

  header {
    border-bottom: var(--border-width) solid var(--color-black);
    padding-bottom: var(--space-4);
    margin-bottom: var(--space-8);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .back-link {
    color: var(--color-black);
    text-decoration: underline;
    font-size: var(--font-size-md);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .back-link:hover {
    text-decoration: none;
  }

  .entity-type {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .entity-detail {
    font-family: var(--font-family);
  }

  .entity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    margin-bottom: var(--space-8);
  }

  .header-content {
    flex: 1;
  }

  .header-flower {
    flex-shrink: 0;
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: normal;
    margin: 0 0 var(--space-2) 0;
    line-height: var(--line-height-snug);
  }

  .entity-subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    font-family: var(--font-family-sans);
  }

  h2 {
    font-size: var(--font-size-xl);
    font-weight: normal;
    margin: var(--space-10) 0 var(--space-5) 0;
    border-bottom: var(--border-width) solid var(--color-gray-300);
    padding-bottom: var(--space-2);
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-5);
    margin-bottom: var(--space-10);
    padding: var(--space-5);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-gray-300);
  }

  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .label {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
    font-weight: bold;
  }

  .value {
    font-size: var(--font-size-lg);
    color: var(--color-black);
  }

  .breakdown-section {
    margin: var(--space-8) 0;
    padding: var(--space-5);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
  }

  .breakdown-section h2 {
    margin-top: 0;
    margin-bottom: var(--space-4);
    border-bottom: none;
    padding-bottom: 0;
  }

  .tracker-list,
  .status-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .tracker-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .tracker-count {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    font-family: var(--font-family-sans);
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-gray-300);
  }

  .status-label {
    font-size: var(--font-size-md);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-family: var(--font-family-sans);
  }

  .status-count {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    font-family: var(--font-family-sans);
    margin-left: var(--space-1);
  }

  .chip {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    padding: 2px 6px;
    background: var(--color-gray-100);
    border: var(--border-width) solid var(--color-gray-300);
    font-family: var(--font-family-sans);
  }

  .properties {
    margin: var(--space-10) 0;
  }

  .asset-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-3);
  }

  .asset-card {
    border: var(--border-width) solid var(--color-gray-300);
    padding: var(--space-3);
    background: var(--color-bg-secondary);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .asset-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    justify-content: space-between;
  }

  .asset-link {
    color: var(--color-black);
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

  .ownership-explorer {
    margin-top: var(--space-8);
  }

  .asset-screener-section {
    margin-top: var(--space-10);
    padding-top: var(--space-8);
    border-top: var(--border-width) solid var(--color-gray-300);
  }

  .section-subtitle {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: calc(-1 * var(--space-4)) 0 var(--space-5) 0;
    font-family: var(--font-family-sans);
  }

  @media (max-width: 768px) {
    .entity-header {
      flex-direction: column;
      gap: var(--space-5);
    }

    .header-flower {
      align-self: center;
    }

    .meta-grid {
      grid-template-columns: 1fr;
    }

    .asset-list {
      grid-template-columns: 1fr;
    }
  }
</style>
