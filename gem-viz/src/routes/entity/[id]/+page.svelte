<script>
  // ============================================================================
  // ENTITY DETAIL PAGE
  // Shows entity profile with ownership flower, tracker/status breakdowns,
  // representative assets, 3D network explorer, and Observable asset screener
  // ============================================================================

  // --- IMPORTS ---
  // Core
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  // Links
  import { assetLink } from '$lib/links';

  // Data fetching
  import { fetchOwnerPortfolio, fetchOwnerStats } from '$lib/component-data/schema';

  // Components
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import ConnectionFinder from '$lib/widgets/ConnectionFinder.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';

  // --- PROPS (from +page.server.js) ---
  let { data } = $props();

  // --- STATE ---
  let loading = $state(!data?.entity);
  /** @type {string | null} */
  let error = $state(null);
  let entityId = $state(data?.entityId || '');
  let entityName = $state(data?.entityName || '');
  let entity = $state(data?.entity || null);
  let portfolio = $state(data?.portfolio || null);
  let stats = $state(data?.stats || null);

  // --- HELPERS ---
  /** Check if ID is asset (G-prefix) vs entity (E-prefix) */
  function isLikelyAssetId(id) {
    return id && /^G\d+$/.test(id);
  }

  // --- DATA TRANSFORMS ---

  // Tracker breakdown: count assets by tracker type
  const trackerBreakdown = $derived.by(() => {
    if (entity?.trackers) {
      // From server cache - trackers is already an array
      return entity.trackers.map((t) => ({ tracker: t, count: 1 }));
    }
    // From client fetch - aggregate from portfolio assets
    const counts = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.tracker || 'Unknown';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts, ([tracker, count]) => ({ tracker, count })).sort(
      (a, b) => b.count - a.count
    );
  });

  // Status breakdown: count assets by status
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

  // Summary assets: first 20 for preview grid
  const summaryAssets = $derived((portfolio?.assets || []).slice(0, 20));

  // Stats helpers
  const totalAssets = $derived(stats?.total_assets ?? portfolio?.assets?.length ?? 0);
  const totalCapacity = $derived(stats?.total_capacity_mw || 0);
  const countryCount = $derived(stats?.countries || 0);

  // --- DATA FETCHING (client-side for dev mode) ---
  onMount(async () => {
    const paramsId = $page.params?.id;

    // Redirect if asset ID was passed to entity page
    if (isLikelyAssetId(paramsId)) {
      console.log(`[Entity] Redirecting ${paramsId} to asset page (G-prefix = asset ID)`);
      goto(assetLink(paramsId), { replaceState: true });
      return;
    }

    // If server data exists, we're done
    if (data?.entity) {
      loading = false;
      return;
    }

    // Dev mode: fetch from MotherDuck client-side
    try {
      loading = true;
      error = null;
      if (!paramsId) throw new Error('Missing entity ID');
      entityId = paramsId;

      const [portfolioResult, statsResult] = await Promise.all([
        fetchOwnerPortfolio(paramsId),
        fetchOwnerStats(paramsId),
      ]);

      portfolio = portfolioResult;
      stats = statsResult;
      entityName = portfolio?.spotlightOwner?.Name || paramsId;
    } catch (err) {
      console.error('Entity load error:', err);
      error = err?.message || 'Failed to load entity';
    } finally {
      loading = false;
    }
  });
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>{entityName || entityId || 'Entity'} — GEM Viz</title>
</svelte:head>

<main>
  <!-- Header -->
  <header>
    <span class="entity-type">Entity Profile</span>
  </header>

  {#if loading}
    <p class="loading">Loading entity directly from MotherDuck…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="entity-detail">
      <!-- Hero: Name + Flower -->
      <div class="entity-header">
        <div class="header-content">
          <h1>{entityName || `ID: ${entityId}`}</h1>
          <p class="entity-subtitle">
            {#if totalAssets}
              {totalAssets.toLocaleString()} assets
              {#if totalCapacity}· {Number(totalCapacity).toLocaleString()} MW{/if}
              {#if countryCount}· {countryCount} {countryCount === 1 ? 'country' : 'countries'}{/if}
            {/if}
          </p>
          <div class="page-actions">
            <AddToCartButton
              id={entityId}
              name={entityName || entityId}
              type="entity"
              metadata={{ assetCount: totalAssets, capacity: totalCapacity }}
            />
          </div>
        </div>
        {#if portfolio}
          <div class="header-flower">
            <OwnershipFlower {portfolio} size="medium" showTitle={false} />
          </div>
        {/if}
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <span class="label">GEM Entity ID</span>
          <span class="value"><code>{entityId}</code></span>
        </div>
        <div class="meta-item">
          <span class="label">Assets Tracked</span>
          <span class="value">{totalAssets.toLocaleString()}</span>
        </div>
        {#if totalCapacity}
          <div class="meta-item">
            <span class="label">Total Capacity (MW)</span>
            <span class="value">{Number(totalCapacity).toLocaleString()}</span>
          </div>
        {/if}
        {#if countryCount}
          <div class="meta-item">
            <span class="label">Countries</span>
            <span class="value">{countryCount}</span>
          </div>
        {/if}
      </div>

      <!-- Connected Entities (Co-Owners) -->
      <section class="connection-section">
        <ConnectionFinder {entityId} {entityName} title="Connected Entities (Co-Owners)" />
      </section>

      <!-- Tracker Mix -->
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

      <!-- Status Breakdown -->
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

      <!-- Representative Assets -->
      {#if summaryAssets.length > 0}
        <section class="properties">
          <h2>Representative Assets</h2>
          <div class="asset-list">
            {#each summaryAssets as asset}
              <div class="asset-card">
                <div class="asset-header">
                  {#if asset.tracker}<TrackerIcon tracker={asset.tracker} size={10} />{/if}
                  <a href={assetLink(asset.id)} class="asset-link">{asset.name || asset.id}</a>
                  {#if asset.status}<StatusIcon status={asset.status} size={10} />{/if}
                </div>
                <div class="asset-meta">
                  {#if asset.status}<span class="chip">{asset.status}</span>{/if}
                  {#if asset.capacityMw}<span class="chip"
                      >{Number(asset.capacityMw).toLocaleString()} MW</span
                    >{/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- 3D Network Explorer -->
      <section class="ownership-explorer">
        <h2>Owner Explorer (3D Network)</h2>
        <OwnershipExplorerD3 ownerEntityId={entityId} prebakedData={data?.ownerExplorerData} />
      </section>

      <!-- Observable Asset Screener -->
      <section class="asset-screener-section">
        <h2>Asset Screener (Observable)</h2>
        <p class="section-subtitle">
          Full portfolio breakdown with subsidiary paths, mini bar charts, and status icons — ported
          from GEM's Observable notebook
        </p>
        <AssetScreener />
      </section>
    </article>
  {/if}
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  main {
    width: 100%;
    padding: 40px;
  }

  /* Loading states */
  .loading {
    padding: 30px 0 10px 0;
    color: #555;
  }
  .loading.error {
    color: #b10000;
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

  /* Entity Detail */
  .entity-detail {
    font-family: Georgia, serif;
  }
  .entity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 30px;
    margin-bottom: 30px;
  }
  .header-content {
    flex: 1;
  }
  .header-flower {
    flex-shrink: 0;
  }
  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 10px 0;
    line-height: 1.2;
  }
  .entity-subtitle {
    font-size: 14px;
    color: #666;
    margin: 0;
    font-family: system-ui, sans-serif;
  }
  .page-actions {
    margin-top: 12px;
  }

  /* Section Headings */
  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
    padding: 20px 0;
    border-bottom: 1px solid #ddd;
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

  /* Breakdown Sections */
  .breakdown-section {
    margin: 30px 0;
    padding: 0;
  }
  .breakdown-section h2 {
    margin-top: 0;
    margin-bottom: 15px;
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
    gap: 12px;
  }
  .tracker-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tracker-count {
    font-size: 12px;
    color: #666;
    font-family: system-ui, sans-serif;
  }
  .status-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
  }
  .status-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    font-family: system-ui, sans-serif;
  }
  .status-count {
    font-size: 12px;
    color: #666;
    font-family: system-ui, sans-serif;
    margin-left: 4px;
  }

  /* Asset Cards */
  .properties {
    margin: 40px 0;
  }
  .asset-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }
  .asset-card {
    border: none;
    padding: 12px;
    background: transparent;
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
  .chip {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 2px 6px;
    background: transparent;
    border: none;
    font-family: system-ui, sans-serif;
  }

  /* Sections */
  .connection-section {
    margin: 30px 0;
  }
  .ownership-explorer {
    margin-top: 32px;
  }
  .asset-screener-section {
    margin-top: 40px;
    padding-top: 30px;
    border-top: 1px solid #ddd;
  }
  .section-subtitle {
    font-size: 12px;
    color: #666;
    margin: -15px 0 20px 0;
    font-family: system-ui, sans-serif;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .entity-header {
      flex-direction: column;
      gap: 20px;
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
