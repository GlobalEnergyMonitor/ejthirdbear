<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { page } from '$app/stores';
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import { EntityPortfolioFilters, EntityPortfolioHeader } from '$lib/components/ownership';
  import { streamOwnerPortfolio } from '$lib/ownership-data';

  // Server data from +page.server.js (API-based)
  /** @type {{ data: any }} */
  let { data } = $props();

  // Check if this looks like an asset ID (starts with G) instead of entity ID (starts with E)
  function isLikelyAssetId(id) {
    return id && /^G\d+$/.test(id);
  }

  // Progressive loading states
  let loadingPhase = $state('init'); // 'init' | 'direct' | 'subsidiaries' | 'done' | 'error'
  let loadingMessage = $state('Initializing DuckDB...');
  let error = $state(null);

  let entityId = $state(data?.entityId || '');
  let entityName = $state(data?.entityName || '');
  let _entity = $state(data?.entity || null); // Available from server if needed
  let portfolio = $state(null); // Fetched client-side from DuckDB - progressively updated

  // Derived data from portfolio (client-fetched)
  const trackerBreakdown = $derived.by(() => {
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

  // Filter state
  let selectedCountries = $state(new Set());
  let selectedTrackers = $state(new Set());
  let selectedStatuses = $state(new Set());

  // Filtered assets based on selections
  const filteredAssets = $derived.by(() => {
    const assets = portfolio?.assets || [];
    if (
      selectedCountries.size === 0 &&
      selectedTrackers.size === 0 &&
      selectedStatuses.size === 0
    ) {
      return assets;
    }
    return assets.filter((asset) => {
      if (selectedCountries.size > 0 && !selectedCountries.has(asset.country || 'Unknown')) {
        return false;
      }
      if (selectedTrackers.size > 0 && !selectedTrackers.has(asset.tracker || 'Unknown')) {
        return false;
      }
      if (selectedStatuses.size > 0 && !selectedStatuses.has(asset.status || 'Unknown')) {
        return false;
      }
      return true;
    });
  });

  // Build a filtered portfolio for AssetScreener when filters are active
  const filteredPortfolio = $derived.by(() => {
    if (!portfolio) return null;
    if (
      selectedCountries.size === 0 &&
      selectedTrackers.size === 0 &&
      selectedStatuses.size === 0
    ) {
      return portfolio;
    }

    // Filter the subsidiariesMatched map
    const filteredSubsidiaries = new Map();
    for (const [subId, assets] of portfolio.subsidiariesMatched || []) {
      const filtered = assets.filter((asset) => {
        if (selectedCountries.size > 0 && !selectedCountries.has(asset.country || 'Unknown')) {
          return false;
        }
        if (selectedTrackers.size > 0 && !selectedTrackers.has(asset.tracker || 'Unknown')) {
          return false;
        }
        if (selectedStatuses.size > 0 && !selectedStatuses.has(asset.status || 'Unknown')) {
          return false;
        }
        return true;
      });
      if (filtered.length > 0) {
        filteredSubsidiaries.set(subId, filtered);
      }
    }

    // Filter directlyOwned
    const filteredDirect = (portfolio.directlyOwned || []).filter((asset) => {
      if (selectedCountries.size > 0 && !selectedCountries.has(asset.country || 'Unknown')) {
        return false;
      }
      if (selectedTrackers.size > 0 && !selectedTrackers.has(asset.tracker || 'Unknown')) {
        return false;
      }
      if (selectedStatuses.size > 0 && !selectedStatuses.has(asset.status || 'Unknown')) {
        return false;
      }
      return true;
    });

    return {
      ...portfolio,
      subsidiariesMatched: filteredSubsidiaries,
      directlyOwned: filteredDirect,
      assets: filteredAssets,
    };
  });

  const summaryAssets = $derived(filteredAssets.slice(0, 20));
  const hasActiveFilters = $derived(
    selectedCountries.size > 0 || selectedTrackers.size > 0 || selectedStatuses.size > 0
  );

  // Client-side fetch for portfolio data with PROGRESSIVE STREAMING
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

    // Stream portfolio data progressively from DuckDB
    try {
      error = null;
      if (!paramsId) throw new Error('Missing entity ID');
      entityId = paramsId;

      // Use streaming fetch - updates portfolio as data arrives
      for await (const update of streamOwnerPortfolio(paramsId)) {
        loadingPhase = update.phase;
        loadingMessage = update.message;

        // Update portfolio progressively
        if (update.portfolio) {
          portfolio = update.portfolio;

          // Use portfolio name if we don't have one from API
          if (!entityName && portfolio?.spotlightOwner?.Name) {
            entityName = portfolio.spotlightOwner.Name;
          }
        }

        if (update.phase === 'error') {
          error = update.error;
        }
      }
    } catch (err) {
      console.error('Entity portfolio load error:', err);
      loadingPhase = 'error';
      // Don't set error if we have basic entity data from API
      if (!data?.entity) {
        error = err?.message || 'Failed to load entity';
      }
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

  {#if loadingPhase === 'error' && error}
    <p class="loading error">{error}</p>
  {:else if loadingPhase !== 'done' && !portfolio}
    <div class="loading-progress">
      <p class="loading">{loadingMessage}</p>
      <div class="progress-phases">
        <span
          class="phase"
          class:active={loadingPhase === 'init'}
          class:done={['direct', 'subsidiaries', 'done'].includes(loadingPhase)}>Initialize</span
        >
        <span class="phase-arrow">→</span>
        <span
          class="phase"
          class:active={loadingPhase === 'direct'}
          class:done={['subsidiaries', 'done'].includes(loadingPhase)}>Direct Assets</span
        >
        <span class="phase-arrow">→</span>
        <span
          class="phase"
          class:active={loadingPhase === 'subsidiaries'}
          class:done={loadingPhase === 'done'}>Subsidiaries</span
        >
        <span class="phase-arrow">→</span>
        <span class="phase" class:active={loadingPhase === 'done'}>Complete</span>
      </div>
    </div>
  {:else}
    <article class="entity-detail">
      <!-- Show loading banner if still streaming data -->
      {#if loadingPhase !== 'done' && loadingPhase !== 'error'}
        <div class="streaming-banner">
          <span class="streaming-dot"></span>
          {loadingMessage}
          {#if portfolio?.assets?.length}
            — {portfolio.assets.length} assets loaded
          {/if}
        </div>
      {/if}

      <!-- Unified header component with stats and flower -->
      <EntityPortfolioHeader
        {portfolio}
        {entityId}
        {entityName}
        sticky={false}
        showFlower={true}
        flowerSize="medium"
      />

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

      {#if portfolio?.assets?.length > 0}
        <section class="filter-section">
          <h2>Filter Assets</h2>
          <EntityPortfolioFilters
            assets={portfolio.assets}
            {selectedCountries}
            {selectedTrackers}
            {selectedStatuses}
            onCountryChange={(c) => (selectedCountries = c)}
            onTrackerChange={(t) => (selectedTrackers = t)}
            onStatusChange={(s) => (selectedStatuses = s)}
          />
        </section>
      {/if}

      {#if summaryAssets.length > 0}
        <section class="properties">
          <h2>
            {#if hasActiveFilters}
              Filtered Assets ({filteredAssets.length} of {portfolio?.assets?.length})
            {:else}
              Representative Assets
            {/if}
          </h2>
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
        <h2>
          Asset Screener
          {#if hasActiveFilters}
            <span class="filter-indicator"
              >({filteredAssets.length} of {portfolio?.assets?.length || 0} assets)</span
            >
          {/if}
        </h2>
        <p class="section-subtitle">
          Full portfolio breakdown with subsidiary paths, mini bar charts, and status icons
          {#if hasActiveFilters}
            — filtered by your selections above
          {/if}
        </p>
        <AssetScreener {entityId} portfolio={filteredPortfolio} />
      </section>
    </article>
  {/if}

  <!-- Embed Link -->
  <a
    href="/embed/entity?id={entityId}"
    class="embed-link"
    target="_blank"
    rel="noopener"
    title="Open embeddable version"
  >
    Embed ↗
  </a>
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

  .loading-progress {
    padding: var(--space-8) 0;
  }

  .progress-phases {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-4);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-sans);
  }

  .phase {
    padding: var(--space-1) var(--space-2);
    background: var(--color-gray-100);
    border: 1px solid var(--color-gray-300);
    color: var(--color-text-tertiary);
    transition: all 0.2s ease;
  }

  .phase.active {
    background: var(--color-accent, #f59e0b);
    border-color: var(--color-accent, #f59e0b);
    color: white;
    animation: pulse 1s ease-in-out infinite;
  }

  .phase.done {
    background: var(--color-success, #10b981);
    border-color: var(--color-success, #10b981);
    color: white;
  }

  .phase-arrow {
    color: var(--color-gray-400);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }

  .streaming-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--color-accent, #f59e0b);
    color: white;
    font-size: var(--font-size-sm);
    font-family: var(--font-family-sans);
    margin-bottom: var(--space-6);
  }

  .streaming-dot {
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    animation: blink 1s ease-in-out infinite;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
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

  h2 {
    font-size: var(--font-size-xl);
    font-weight: normal;
    margin: var(--space-10) 0 var(--space-5) 0;
    border-bottom: var(--border-width) solid var(--color-gray-300);
    padding-bottom: var(--space-2);
  }

  .filter-indicator {
    font-size: var(--font-size-body);
    font-weight: normal;
    color: var(--color-text-secondary);
    margin-left: var(--space-2);
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

  .filter-section {
    margin: var(--space-8) 0;
  }

  .filter-section h2 {
    margin-top: 0;
    margin-bottom: var(--space-4);
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
    .asset-list {
      grid-template-columns: 1fr;
    }
  }

  /* Embed Link */
  .embed-link {
    position: fixed;
    bottom: var(--space-4);
    right: var(--space-4);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-decoration: none;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .embed-link:hover {
    opacity: 1;
    color: var(--color-black);
  }
</style>
