<script>
  // ============================================================================
  // ENTITY DETAIL PAGE
  // Shows entity profile with ownership flower, tracker/status breakdowns,
  // representative assets, and asset screener
  // ============================================================================

  // --- IMPORTS ---
  // Core
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { PUBLIC_SITE_URL } from '$env/static/public';

  // Links
  import { assetLink, entityLink } from '$lib/links';

  // Formatting
  import { formatCount, formatCapacity } from '$lib/format';

  // Data fetching - dynamic import to avoid SSR issues
  /** @type {typeof import('$lib/component-data/schema').fetchOwnerPortfolio} */
  let fetchOwnerPortfolio;
  /** @type {typeof import('$lib/component-data/schema').fetchOwnerStats} */
  let fetchOwnerStats;

  // Components
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import ConnectionFinder from '$lib/widgets/ConnectionFinder.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import PortfolioMap from '$lib/components/PortfolioMap.svelte';
  import CrossTrackerBadge from '$lib/components/CrossTrackerBadge.svelte';
  import DataInsights from '$lib/components/DataInsights.svelte';
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';
  import { detectEntityAnomalies } from '$lib/anomaly-detection';

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

  // -------------------------------------------------------------------------
  // Capacity by tracker (MW distribution, not just counts)
  // Shows what % of total capacity comes from each tracker type
  // -------------------------------------------------------------------------
  const capacityByTracker = $derived.by(() => {
    const totals = new Map();
    (portfolio?.assets || []).forEach((a) => {
      const key = a.tracker || 'Unknown';
      const mw = Number(a.capacityMw) || 0;
      totals.set(key, (totals.get(key) || 0) + mw);
    });
    const total = Array.from(totals.values()).reduce((a, b) => a + b, 0);
    return Array.from(totals, ([tracker, mw]) => ({
      tracker,
      mw,
      pct: total > 0 ? (mw / total) * 100 : 0,
    })).sort((a, b) => b.mw - a.mw);
  });

  // -------------------------------------------------------------------------
  // Subsidiary count (how many intermediaries own assets for this entity)
  // Extracted from ownerExplorerData if available
  // -------------------------------------------------------------------------
  const subsidiaryCount = $derived.by(() => {
    const subs = data?.ownerExplorerData?.subsidiariesMatched;
    if (!subs) return 0;
    // Handle both Map and Array formats
    if (subs instanceof Map) return subs.size;
    if (Array.isArray(subs)) return subs.length;
    if (typeof subs === 'object') return Object.keys(subs).length;
    return 0;
  });

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

  // Status filter state
  let selectedStatus = $state(null);

  // Summary assets: first 20, optionally filtered by status
  const summaryAssets = $derived.by(() => {
    let assets = portfolio?.assets || [];
    if (selectedStatus) {
      assets = assets.filter((a) => a.status === selectedStatus);
    }
    return assets.slice(0, 24); // Show more when filtered
  });

  function toggleStatusFilter(status) {
    selectedStatus = selectedStatus === status ? null : status;
  }

  // Stats helpers
  const totalAssets = $derived(stats?.total_assets ?? portfolio?.assets?.length ?? 0);
  const totalCapacity = $derived(stats?.total_capacity_mw || 0);
  const countryCount = $derived(stats?.countries || 0);

  // Tracker diversity (for cross-tracker badge) - defined before OG description that uses it
  const entityTrackers = $derived(entity?.trackers || []);

  const siteUrl = PUBLIC_SITE_URL ? PUBLIC_SITE_URL.replace(/\/$/, '') : '';
  const ogTitle = $derived(entityName || entityId || 'Entity');
  const ogDescription = $derived.by(() => {
    const parts = [];
    if (totalAssets) parts.push(`${formatCount(totalAssets)} assets`);
    if (totalCapacity) parts.push(`${formatCapacity(totalCapacity)} capacity`);
    if (countryCount) parts.push(`${countryCount} countries`);
    if (entityTrackers.length) parts.push(`${entityTrackers.length} trackers`);
    return parts.length ? parts.join(' | ') : 'GEM entity profile';
  });
  const ogPath = $derived(
    entityId ? `${base}/og/entity/${entityId}.svg` : `${base}/og/entity/default.svg`
  );
  const ogImage = $derived(siteUrl ? `${siteUrl}${ogPath}` : ogPath);
  const ogUrl = $derived.by(() => {
    const path = entityId ? entityLink(entityId) : `${base}/entity/`;
    return siteUrl ? `${siteUrl}${path}` : path;
  });

  // Detect data anomalies
  const anomalies = $derived(
    detectEntityAnomalies({
      entity,
      assets: portfolio?.assets || [],
      stats,
    })
  );

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
    // Dynamic import to avoid SSR bundling of WASM client
    const schema = await import('$lib/component-data/schema');
    fetchOwnerPortfolio = schema.fetchOwnerPortfolio;
    fetchOwnerStats = schema.fetchOwnerStats;

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
  <meta property="og:type" content="website" />
  <meta property="og:title" content={ogTitle} />
  <meta property="og:description" content={ogDescription} />
  <meta property="og:url" content={ogUrl} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={ogTitle} />
  <meta name="twitter:description" content={ogDescription} />
  <meta name="twitter:image" content={ogImage} />
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
              {formatCount(totalAssets)} assets
              {#if totalCapacity}· {formatCapacity(totalCapacity)}{/if}
              {#if countryCount}· {countryCount} {countryCount === 1 ? 'country' : 'countries'}{/if}
              {#if subsidiaryCount > 0}· via {subsidiaryCount}
                {subsidiaryCount === 1 ? 'subsidiary' : 'subsidiaries'}{/if}
            {/if}
          </p>
          {#if entityTrackers.length >= 2}
            <div class="cross-tracker-wrapper">
              <CrossTrackerBadge trackers={entityTrackers} expanded={false} />
            </div>
          {/if}
          <div class="page-actions">
            <AddToCartButton
              id={entityId}
              name={entityName || entityId}
              type="entity"
              metadata={{ assetCount: totalAssets, capacity: totalCapacity }}
            />
          </div>
        </div>
        {#if portfolio && entityTrackers.length > 1}
          <div class="header-flower">
            <OwnershipFlower {portfolio} size="medium" showTitle={false} />
          </div>
        {/if}
      </div>

      <!-- -----------------------------------------------------------------------
           Jump Links (Table of Contents)
           Quick navigation to main sections on the page
           ----------------------------------------------------------------------- -->
      <nav class="jump-links" aria-label="Page sections">
        <a href="#overview">Overview</a>
        {#if portfolio?.assets?.length > 0}<a href="#map">Map</a>{/if}
        <a href="#network">Network</a>
        <a href="#connections">Connections</a>
        {#if trackerBreakdown.length > 0}<a href="#trackers">Trackers</a>{/if}
        {#if capacityByTracker.length > 1}<a href="#capacity">Capacity</a>{/if}
        {#if summaryAssets.length > 0}<a href="#assets">Assets</a>{/if}
        <a href="#portfolio">Portfolio</a>
      </nav>

      <!-- Meta Grid -->
      <div id="overview" class="meta-grid">
        <div class="meta-item">
          <span class="label">GEM Entity ID</span>
          <span class="value"><code>{entityId}</code></span>
        </div>
        <div class="meta-item">
          <span class="label">Assets Tracked</span>
          <span class="value">{formatCount(totalAssets)}</span>
        </div>
        {#if totalCapacity}
          <div class="meta-item">
            <span class="label">Total Capacity</span>
            <span class="value">{formatCapacity(totalCapacity)}</span>
          </div>
        {/if}
        {#if countryCount}
          <div class="meta-item">
            <span class="label">Countries</span>
            <span class="value">{countryCount}</span>
          </div>
        {/if}
      </div>

      <!-- Data Insights (automatic anomaly detection) -->
      {#if anomalies.length > 0}
        <DataInsights {anomalies} />
      {/if}

      <!-- -----------------------------------------------------------------------
           Geographic Footprint
           Mini-map showing all asset locations for this entity
           ----------------------------------------------------------------------- -->
      <div class="map-network-grid">
        {#if portfolio?.assets?.length > 0}
          <section id="map" class="map-section">
            <h2>Geographic Footprint</h2>
            <p class="section-subtitle">Locations of known assets in this portfolio.</p>
            <PortfolioMap assets={portfolio.assets} {entityName} height={320} />
          </section>
        {/if}

        <!-- Ownership Network (3D Visualization) -->
        <section id="network" class="network-section">
          <h2>Ownership Network</h2>
          <p class="section-subtitle">
            Interactive 3D view of connected assets and co-owners. Drag to pan, scroll to zoom,
            shift+drag to rotate.
          </p>
          <MiniNetworkGraph {entityId} {entityName} maxHops={2} height={320} />
        </section>
      </div>

      <!-- Connected Entities (Co-Owners) -->
      <section id="connections" class="connection-section">
        <ConnectionFinder {entityId} {entityName} title="Connected Entities (Co-Owners)" />
      </section>

      <!-- Tracker Mix -->
      {#if trackerBreakdown.length > 0}
        <section id="trackers" class="breakdown-section">
          <h2>Tracker Mix</h2>
          <ul class="tracker-list">
            {#each trackerBreakdown as row}
              <li class="tracker-row">
                <TrackerIcon tracker={row.tracker} size={14} showLabel variant="pill" />
                <span class="tracker-count">{formatCount(row.count)} assets</span>
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
              <button
                class="status-row"
                class:active={selectedStatus === row.status}
                onclick={() => toggleStatusFilter(row.status)}
                title="Click to filter assets by {row.status}"
              >
                <StatusIcon status={row.status} size={12} />
                <span class="status-label">{row.status}</span>
                <span class="status-count">{formatCount(row.count)}</span>
              </button>
            {/each}
          </ul>
          {#if selectedStatus}
            <button class="clear-filter" onclick={() => (selectedStatus = null)}>
              Clear filter
            </button>
          {/if}
        </section>
      {/if}

      <!-- -----------------------------------------------------------------------
           Capacity Distribution
           Shows MW breakdown by tracker type as a stacked bar
           More informative than asset counts alone
           ----------------------------------------------------------------------- -->
      {#if capacityByTracker.length > 1 && totalCapacity > 0}
        <section id="capacity" class="breakdown-section">
          <h2>Capacity Distribution</h2>
          <p class="section-subtitle">{formatCapacity(totalCapacity)} total</p>
          <div class="capacity-bar">
            {#each capacityByTracker as item}
              <div
                class="capacity-segment"
                style="width: {item.pct}%"
                title="{item.tracker}: {formatCapacity(item.mw)} ({item.pct.toFixed(1)}%)"
              >
                {#if item.pct > 15}
                  <span class="segment-label">{item.pct.toFixed(0)}%</span>
                {/if}
              </div>
            {/each}
          </div>
          <ul class="capacity-legend">
            {#each capacityByTracker as item}
              <li>
                <TrackerIcon tracker={item.tracker} size={12} />
                <span class="tracker-name">{item.tracker}</span>
                <span class="tracker-mw">{formatCapacity(item.mw)}</span>
                <span class="tracker-pct">({item.pct.toFixed(1)}%)</span>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <!-- Representative Assets -->
      {#if summaryAssets.length > 0 || selectedStatus}
        <section id="assets" class="properties">
          <h2>
            {#if selectedStatus}
              {selectedStatus} Assets
              <span class="filter-count">({summaryAssets.length} shown)</span>
            {:else}
              Representative Assets
            {/if}
          </h2>
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
                  {#if asset.capacityMw}<span class="chip">{formatCapacity(asset.capacityMw)}</span
                    >{/if}
                </div>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <!-- Asset Screener -->
      <section id="portfolio" class="asset-screener-section">
        <h2>Asset Portfolio</h2>
        <p class="section-subtitle">
          Full portfolio breakdown with subsidiary paths, mini bar charts, and status icons
        </p>
        <AssetScreener prebakedPortfolio={data?.ownerExplorerData} />
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
    max-width: 100%;
    padding: 40px;
    box-sizing: border-box;
    overflow-x: hidden;
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
  .cross-tracker-wrapper {
    margin: 12px 0;
  }
  .page-actions {
    margin-top: 12px;
  }

  /* -------------------------------------------------------------------------
     Jump Links (Table of Contents)
     Sticky mini-nav for quick section access
     ------------------------------------------------------------------------- */
  .jump-links {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
    padding: 12px 0;
    border-bottom: 1px solid #eee;
  }
  .jump-links a {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    text-decoration: none;
    padding: 4px 8px;
    border: 1px solid #ddd;
    transition: all 0.15s;
  }
  .jump-links a:hover {
    color: #000;
    border-color: #000;
  }

  /* -------------------------------------------------------------------------
     Capacity Distribution Bar
     Stacked horizontal bar showing MW breakdown by tracker
     ------------------------------------------------------------------------- */
  .capacity-bar {
    display: flex;
    height: 24px;
    background: #f0f0f0;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .capacity-segment {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #333;
    color: white;
    font-size: 10px;
    font-weight: bold;
    min-width: 2px;
    transition: opacity 0.15s;
  }
  .capacity-segment:nth-child(1) {
    background: #1a1a1a;
  }
  .capacity-segment:nth-child(2) {
    background: #4a4a4a;
  }
  .capacity-segment:nth-child(3) {
    background: #666;
  }
  .capacity-segment:nth-child(4) {
    background: #888;
  }
  .capacity-segment:nth-child(5) {
    background: #aaa;
  }
  .capacity-segment:hover {
    opacity: 0.8;
  }
  .segment-label {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  }
  .capacity-legend {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }
  .capacity-legend li {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
  }
  .tracker-name {
    font-weight: 500;
  }
  .tracker-mw {
    color: #000;
  }
  .tracker-pct {
    color: #888;
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
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
    padding: 6px 10px;
    background: transparent;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .status-row:hover {
    background: #f5f5f5;
    border-color: #ddd;
  }
  .status-row.active {
    background: #000;
    border-color: #000;
  }
  .status-row.active .status-label,
  .status-row.active .status-count {
    color: #fff;
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
  .clear-filter {
    margin-top: 12px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid #000;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    cursor: pointer;
    font-family: system-ui, sans-serif;
  }
  .clear-filter:hover {
    background: #000;
    color: #fff;
  }
  .filter-count {
    font-weight: normal;
    font-size: 14px;
    color: #666;
    margin-left: 8px;
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

  .map-network-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    margin: 30px 0;
  }

  /* Sections */
  .map-section {
    margin: 0;
  }
  .map-section h2 {
    margin-top: 0;
  }
  .network-section {
    margin: 0;
  }
  .network-section h2 {
    margin-top: 0;
  }
  .connection-section {
    margin: 30px 0;
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
    .map-network-grid {
      grid-template-columns: 1fr;
      gap: 20px;
      margin: 20px 0;
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
