<script>
  /**
   * ENTITY PAGE
   * Shows an entity's ownership structure: upstream/downstream graphs,
   * portfolio breakdown by tracker/status/country, asset screener, and network viz.
   * Data comes from +page.server.js (cached or runtime API), then streams portfolio client-side.
   */

  // --- Imports ---
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { page } from '$app/stores';

  // Components
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import UltimateOwners from '$lib/components/UltimateOwners.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';
  import SectionHeader from '$lib/components/SectionHeader.svelte';
  import {
    EntityPortfolioFilters,
    EntityPortfolioHeader,
    OwnershipTreeGraph,
    OwnershipSummaryTables,
    AssetRingVisualization,
  } from '$lib/components/ownership';

  // Data
  import { streamOwnerPortfolio } from '$lib/ownership-data';
  import { getEntityGraphUp, getEntityGraphDown } from '$lib/ownership-api';
  import { trackerColors } from '$lib/design-tokens';

  // --- Props ---
  /** @type {{ data: any }} */
  let { data } = $props();

  // --- Helpers ---
  function isLikelyAssetId(id) {
    return id && /^G\d+$/.test(id);
  }

  // --- State ---
  let loadingPhase = $state('init');
  let loadingMessage = $state('Initializing...');
  let error = $state(null);

  const loadingPhases = [
    { key: 'init', label: 'Initialize' },
    { key: 'direct', label: 'Direct Assets' },
    { key: 'subsidiaries', label: 'Subsidiaries' },
    { key: 'done', label: 'Complete' },
  ];
  const currentPhaseIndex = $derived(loadingPhases.findIndex((p) => p.key === loadingPhase));

  let entityId = $state(data?.entityId || '');
  let entityName = $state(data?.entityName || '');
  let portfolio = $state(null);
  let headerPortfolio = $state(null);

  // Graph data
  let graphUp = $state(null);
  let graphDown = $state(null);
  let graphLoading = $state(true);
  let graphError = $state(null);

  // Query timing
  let graphQueryTime = $state(null);
  let portfolioQueryTime = $state(null);

  // Derived data
  function countBy(field) {
    const counts = new Map();
    for (const a of portfolio?.assets || []) {
      const k = a[field] || 'Unknown';
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({ key: value, count })).sort(
      (a, b) => b.count - a.count
    );
  }

  const trackerBreakdown = $derived.by(() => countBy('tracker'));
  const statusBreakdown = $derived.by(() => countBy('status'));
  const countryBreakdown = $derived.by(() => countBy('country'));

  // Filters
  let selectedCountries = $state(new Set());
  let selectedTrackers = $state(new Set());
  let selectedStatuses = $state(new Set());

  function passesFilters(asset) {
    if (selectedCountries.size > 0 && !selectedCountries.has(asset.country || 'Unknown'))
      return false;
    if (selectedTrackers.size > 0 && !selectedTrackers.has(asset.tracker || 'Unknown'))
      return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(asset.status || 'Unknown')) return false;
    return true;
  }

  const hasActiveFilters = $derived(
    selectedCountries.size > 0 || selectedTrackers.size > 0 || selectedStatuses.size > 0
  );

  const filteredAssets = $derived.by(() => {
    const assets = portfolio?.assets || [];
    return hasActiveFilters ? assets.filter(passesFilters) : assets;
  });

  const filteredPortfolio = $derived.by(() => {
    if (!portfolio || !hasActiveFilters) return portfolio;
    const filteredSubsidiaries = new Map();
    for (const [subId, assets] of portfolio.subsidiariesMatched || []) {
      const filtered = assets.filter(passesFilters);
      if (filtered.length > 0) filteredSubsidiaries.set(subId, filtered);
    }
    return {
      ...portfolio,
      subsidiariesMatched: filteredSubsidiaries,
      directlyOwned: (portfolio.directlyOwned || []).filter(passesFilters),
      assets: filteredAssets,
    };
  });

  // Load graphs
  async function loadGraphData(id) {
    graphLoading = true;
    graphError = null;
    const startTime = performance.now();
    try {
      const [upResult, downResult] = await Promise.all([
        getEntityGraphUp(id).catch((e) => {
          if (import.meta.env.DEV) console.warn('Failed to fetch upstream graph:', e);
          return null;
        }),
        getEntityGraphDown(id).catch((e) => {
          if (import.meta.env.DEV) console.warn('Failed to fetch downstream graph:', e);
          return null;
        }),
      ]);
      graphUp = upResult;
      graphDown = downResult;
      graphQueryTime = performance.now() - startTime;
      if (upResult?.rootEntityName && !entityName) {
        entityName = upResult.rootEntityName;
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Graph data load error:', err);
      graphError = err?.message || 'Failed to load ownership graph';
    } finally {
      graphLoading = false;
    }
  }

  // Refresh graph on entity change
  $effect(() => {
    if (entityId) {
      loadGraphData(entityId);
    }
  });

  // Stream portfolio
  onMount(async () => {
    const paramsId = $page.params?.id;
    if (isLikelyAssetId(paramsId)) {
      goto(assetLink(paramsId), { replaceState: true });
      return;
    }
    if (data?.entity?.Name || data?.entity?.name) entityName = data.entity.Name || data.entity.name;

    if (!paramsId) {
      error = 'Missing entity ID';
      loadingPhase = 'error';
      return;
    }

    entityId = paramsId;

    const portfolioStartTime = performance.now();
    let lastHeaderUpdate = 0;
    let lastHeaderPhase = 'init';
    const HEADER_UPDATE_MS = 500;

    try {
      error = null;

      for await (const update of streamOwnerPortfolio(paramsId)) {
        loadingPhase = update.phase;
        loadingMessage = update.message;
        if (update.portfolio) {
          portfolio = update.portfolio;
          const now = performance.now();
          const phaseChanged = update.phase !== lastHeaderPhase;
          const timeElapsed = now - lastHeaderUpdate >= HEADER_UPDATE_MS;
          const shouldUpdateHeader =
            phaseChanged || timeElapsed || update.phase === 'done' || update.phase === 'error';
          if (shouldUpdateHeader) {
            headerPortfolio = update.portfolio;
            lastHeaderUpdate = now;
            lastHeaderPhase = update.phase;
          }
          if (!entityName && portfolio?.spotlightOwner?.Name) {
            entityName = portfolio.spotlightOwner.Name;
          }
        }
        if (update.phase === 'error') error = update.error;
        if (update.phase === 'done') {
          portfolioQueryTime = performance.now() - portfolioStartTime;
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Entity portfolio load error:', err);
      loadingPhase = 'error';
      if (!data?.entity) error = err?.message || 'Failed to load entity';
    }
  });
</script>

<svelte:head>
  <title>{entityName || entityId || 'Entity'} — Global Energy Monitor</title>
  <meta
    name="description"
    content="Corporate ownership profile for {entityName ||
      entityId} including subsidiary structure, asset portfolio, and ownership hierarchy."
  />
</svelte:head>

{#snippet embedBtn(href)}
  <a {href} class="embed-btn" target="_blank" rel="noopener" title="Embed this visualization">↗</a>
{/snippet}

<div class="page">
  <header>
    <a href={link('index')} class="back-link">← Home</a>
    <span class="entity-type">Entity Profile</span>
  </header>

  {#if loadingPhase === 'error' || (error && !portfolio?.assets?.length)}
    <div class="error-notice">
      <p class="loading error">{error || 'Failed to load entity data'}</p>
      <p><a href={link('index')}>← Back to home</a></p>
    </div>
  {:else if loadingPhase !== 'done' && !portfolio}
    <div class="loading-progress">
      <p class="loading">{loadingMessage}</p>
      <div class="progress-phases">
        {#each loadingPhases as phase, idx}
          <span
            class="phase"
            class:active={idx === currentPhaseIndex}
            class:done={idx < currentPhaseIndex}
          >
            {phase.label}
          </span>
          {#if idx < loadingPhases.length - 1}
            <span class="phase-arrow">→</span>
          {/if}
        {/each}
      </div>
    </div>
  {:else}
    <article class="entity-detail">
      {#if loadingPhase !== 'done' && loadingPhase !== 'error'}
        <div class="streaming-banner">
          <span class="streaming-dot"></span>
          {loadingMessage}
          {#if portfolio?.assets?.length}
            — {portfolio.assets.length} assets loaded{/if}
        </div>
      {/if}

      {#if portfolio?.truncated && loadingPhase === 'done' && portfolio.assets?.length > 0}
        <p class="truncation-note">
          Showing {portfolio.assets.length.toLocaleString()} of {portfolio.totalCount?.toLocaleString() ||
            'many'} assets. Use filters or export for full data.
        </p>
      {/if}

      <!-- Hero -->
      <EntityPortfolioHeader
        portfolio={headerPortfolio || portfolio}
        {entityId}
        {entityName}
        sticky={false}
        showFlower={false}
      />

      <!-- Portfolio overview (only shown when assets exist) -->
      {#if portfolio?.assets?.length}
        <SectionHeader title="Portfolio Overview">
          <div class="source-badges">
            <DataSourceBadge source="api" label="Assets" queryTime={portfolioQueryTime} />
          </div>
        </SectionHeader>

        <div class="split-row">
          <div class="split-col panel panel--hero">
            <h3>
              Ownership Flower
              {@render embedBtn(`/embed/ownership-flower?entityId=${entityId}`)}
            </h3>
            <div class="flower-wrapper">
              <OwnershipFlower ownerId={entityId} {portfolio} size="large" />
            </div>
          </div>
          <div class="split-col">
            <div class="stats-hero">
              <div class="stat-big">
                <span class="stat-number">{portfolio.assets.length.toLocaleString()}</span>
                <span class="stat-unit">Assets</span>
              </div>
              <div class="stat-row">
                <div class="stat-item">
                  <span class="stat-value">{trackerBreakdown.length}</span>
                  <span class="stat-label">Trackers</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{countryBreakdown.length}</span>
                  <span class="stat-label">Countries</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{portfolio.subsidiariesMatched?.size || 0}</span>
                  <span class="stat-label">Subsidiaries</span>
                </div>
              </div>
            </div>

            <!-- Tracker breakdown -->
            {#if trackerBreakdown.length > 0}
              <div class="tracker-bars">
                {#each trackerBreakdown.slice(0, 5) as row}
                  {@const maxCount = trackerBreakdown[0]?.count || 1}
                  {@const pct = (row.count / maxCount) * 100}
                  {@const barColor = trackerColors[row.key] || '#6e8c91'}
                  <div class="tracker-bar-row">
                    <TrackerIcon tracker={row.key} size={14} showLabel variant="pill" />
                    <div class="bar-container">
                      <div class="bar-fill" style="width: {pct}%; background: {barColor}"></div>
                    </div>
                    <span class="bar-count">{row.count.toLocaleString()}</span>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Upstream ownership — HERO when data exists -->
      {#if graphLoading}
        <SectionHeader title="Ownership Structure">
          <div class="source-badges">
            <DataSourceBadge source="api" label="Graph" queryTime={graphQueryTime} />
          </div>
        </SectionHeader>
        <div class="section-block panel">
          <p class="placeholder">Loading ownership graph...</p>
        </div>
      {:else if graphUp?.nodes?.length > 1}
        <SectionHeader title={`Who Owns ${entityName || 'This Entity'}`}>
          <div class="source-badges">
            <DataSourceBadge source="api" label="Graph" queryTime={graphQueryTime} />
          </div>
        </SectionHeader>

        <div class="section-block panel panel--graph-hero">
          <h3>
            Upstream Ownership
            {@render embedBtn(`/embed/ownership-graph?entityId=${entityId}&direction=up`)}
          </h3>
          <OwnershipTreeGraph
            nodes={graphUp.nodes}
            edges={graphUp.edges}
            paths={graphUp.paths || {}}
            rootId={entityId}
          />
        </div>

        <!-- Ownership detail row: Ultimate Owners + Summary Tables -->
        <div class="split-row">
          <div class="split-col panel panel--tall">
            <h3>
              Ultimate Owners
              {@render embedBtn(`/embed/ultimate-owners?entityId=${entityId}`)}
            </h3>
            <UltimateOwners {entityId} />
          </div>
          <div class="split-col panel panel--tall">
            <h3>Ownership Breakdown</h3>
            <OwnershipSummaryTables nodes={graphUp.nodes} edges={graphUp.edges} rootId={entityId} />
          </div>
        </div>
      {:else if graphError}
        <SectionHeader title="Ownership Structure" />
        <div class="section-block panel">
          <p class="placeholder error">Failed to load ownership graph: {graphError}</p>
        </div>
      {/if}

      <!-- Downstream ownership — full width -->
      {#if graphDown?.nodes?.length > 1}
        <SectionHeader
          title="Subsidiaries & Holdings"
          subtitle={`Entities and assets owned by ${entityName || entityId}`}
        />

        <div class="section-block panel panel--graph-hero">
          <h3>
            Downstream Ownership
            {@render embedBtn(`/embed/ownership-graph?entityId=${entityId}&direction=down`)}
          </h3>
          <OwnershipTreeGraph
            nodes={graphDown.nodes}
            edges={graphDown.edges}
            paths={graphDown.paths || {}}
            rootId={entityId}
          />
        </div>
      {/if}

      <!-- Network analysis -->
      <SectionHeader
        title="Network Analysis"
        subtitle="Interactive ownership network exploration"
      />

      <div class="section-block panel panel--mega">
        <h3>Ownership Structure</h3>
        <AssetScreenerChart {entityId} entityName={entityName} />
      </div>

      <div class="section-block panel panel--mega">
        <h3>
          Ownership Network
          {@render embedBtn(`/embed/network-3d?entityId=${entityId}`)}
        </h3>
        <MiniNetworkGraph {entityId} height={500} maxHops={3} />
      </div>

      <!-- Asset distribution -->
      {#if filteredAssets.length > 0}
        <SectionHeader
          title="Asset Distribution"
          subtitle={`${filteredAssets.length.toLocaleString()} assets across ${countryBreakdown.length} countries`}
        />

        <div class="section-block panel">
          <h3>
            Asset Ring Visualization
            {@render embedBtn(`/embed/asset-ring?entityId=${entityId}`)}
          </h3>
          <AssetRingVisualization assets={filteredAssets.slice(0, 150)} />
        </div>

        <!-- Status breakdown -->
        <div class="split-row">
          <div class="split-col panel">
            <h3>Status Distribution</h3>
            <div class="status-grid">
              {#each statusBreakdown as row}
                {@const total = portfolio?.assets?.length || 1}
                {@const pct = ((row.count / total) * 100).toFixed(1)}
                <div class="status-card">
                  <StatusIcon status={row.key} size={24} />
                  <div class="status-info">
                    <span class="status-name">{row.key}</span>
                    <span class="status-stats">{row.count.toLocaleString()} ({pct}%)</span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <div class="split-col panel">
            <h3>Geographic Distribution</h3>
            <div class="country-grid">
              {#each countryBreakdown.slice(0, 12) as row}
                {@const total = portfolio?.assets?.length || 1}
                {@const pct = ((row.count / total) * 100).toFixed(1)}
                <div class="country-card">
                  <span class="country-name">{row.key}</span>
                  <span class="country-count">{row.count.toLocaleString()} ({pct}%)</span>
                </div>
              {/each}
            </div>
          </div>
        </div>
      {/if}

      <!-- Asset screener -->
      {#if portfolio?.assets?.length > 0}
        <SectionHeader
          title="Asset Screener"
          subtitle="Filter and explore all assets in this portfolio"
        >
          <div class="source-badges">
            <DataSourceBadge source="api" label="Assets" queryTime={portfolioQueryTime} />
          </div>
        </SectionHeader>

        <div class="section-block">
          <EntityPortfolioFilters
            assets={portfolio.assets}
            {selectedCountries}
            {selectedTrackers}
            {selectedStatuses}
            onCountryChange={(c) => (selectedCountries = c)}
            onTrackerChange={(t) => (selectedTrackers = t)}
            onStatusChange={(s) => (selectedStatuses = s)}
          />
        </div>

        <div class="section-block">
          <h3>
            Assets
            {#if hasActiveFilters}
              <span class="filter-indicator">
                ({filteredAssets.length} of {portfolio.assets.length})
              </span>
            {/if}
          </h3>
          <AssetScreener {entityId} portfolio={filteredPortfolio} />
        </div>
      {/if}
    </article>
  {/if}

  <a
    href="/embed/entity?id={entityId}"
    class="embed-link"
    target="_blank"
    rel="noopener"
    title="Embeddable version"
  >
    Embed ↗
  </a>
</div>

<style>
  .page {
    width: 100%;
    padding: var(--space-6);
    max-width: 1800px;
    margin: 0 auto;
  }

  header {
    border-bottom: var(--border-width) solid var(--color-black);
    padding-bottom: var(--space-4);
    margin-bottom: var(--space-6);
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

  .entity-type {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .source-badges {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  /* Layout */
  .split-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-6);
    margin-bottom: var(--space-6);
  }

  .split-col {
    min-width: 0;
  }

  .panel {
    border: 2px solid var(--color-black);
    background: var(--color-bg-secondary);
    padding: var(--space-4);
    overflow: auto;
  }

  .panel--hero {
    min-height: 400px;
    max-height: 500px;
  }

  .panel--tall {
    min-height: 120px;
    max-height: 80vh;
    overflow: auto;
  }

  .panel--graph-hero {
    min-height: 300px;
    max-height: 85vh;
    overflow: auto;
  }

  .panel--mega {
    min-height: 600px;
    max-height: 90vh;
    overflow: auto;
  }

  .flower-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 350px;
  }

  .section-block {
    margin-bottom: var(--space-6);
  }

  h3 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--font-size-lg);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0 0 var(--space-4) 0;
    padding-bottom: var(--space-2);
    border-bottom: 1px solid var(--color-gray-300);
  }

  .embed-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--gem-mint);
    color: var(--gem-navy);
    font-size: var(--font-size-xs);
    font-weight: 700;
    text-decoration: none;
    border-radius: 4px;
    opacity: 0.6;
    transition: all 0.15s ease;
    text-transform: none;
    letter-spacing: 0;
  }

  .embed-btn:hover {
    opacity: 1;
    background: var(--gem-teal);
    color: var(--gem-warm-white);
  }

  .placeholder {
    color: var(--color-text-tertiary);
    font-style: italic;
    padding: var(--space-4);
  }

  /* Stats */
  .stats-hero {
    padding: var(--space-4);
    background: var(--gem-primary-blue, #1d4961);
    color: white;
    margin-bottom: var(--space-4);
  }

  .stat-big {
    text-align: center;
    margin-bottom: var(--space-4);
  }

  .stat-number {
    font-size: 4rem;
    font-family: var(--font-family-data);
    font-weight: 700;
    line-height: 1;
    display: block;
  }

  .stat-unit {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    opacity: 0.7;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    text-align: center;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: var(--space-4);
  }

  .stat-item .stat-value {
    display: block;
    font-size: var(--font-size-2xl);
    font-weight: 700;
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .stat-item .stat-label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    opacity: 0.7;
  }

  /* Tracker bars */
  .tracker-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tracker-bar-row {
    display: grid;
    grid-template-columns: 140px 1fr 60px;
    gap: var(--space-2);
    align-items: center;
  }

  .bar-container {
    height: 24px;
    background: var(--color-gray-200);
    position: relative;
  }

  .bar-fill {
    height: 100%;
    /* Color set inline via tracker color */
    transition: width 0.5s ease-out;
  }

  .bar-count {
    font-size: var(--font-size-sm);
    font-family: var(--font-family-data);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    text-align: right;
  }

  /* Status grid */
  .status-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3);
  }

  .status-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-gray-200);
  }

  .status-info {
    display: flex;
    flex-direction: column;
  }

  .status-name {
    font-weight: 700;
    text-transform: uppercase;
    font-size: var(--font-size-sm);
  }

  .status-stats {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-data);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  /* Country grid */
  .country-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-2);
  }

  .country-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-gray-200);
  }

  .country-name {
    font-size: var(--font-size-sm);
    font-weight: 700;
  }

  .country-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-data);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  /* Filter */
  .filter-indicator {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  /* Loading */
  .loading {
    padding: 0;
    margin: 0;
    color: var(--gem-navy);
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .loading.error {
    color: var(--color-error);
    font-weight: 700;
  }

  .error-notice {
    text-align: center;
    padding: var(--space-12) var(--space-6);
  }

  .error-notice a {
    color: var(--color-text-secondary);
    text-decoration: underline;
  }

  .loading-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 300px;
    padding: var(--space-12) var(--space-6);
  }

  .progress-phases {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-6);
    font-size: var(--font-size-sm);
  }

  .phase {
    padding: 8px 14px;
    background: var(--color-gray-100);
    border: none;
    border-radius: 5px;
    color: var(--color-text-tertiary);
    font-weight: 700;
    transition: all 0.2s ease;
  }

  .phase.active {
    background: var(--gem-teal);
    color: var(--gem-warm-white);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .phase.done {
    background: var(--gem-mint);
    color: var(--gem-navy);
    font-weight: 700;
  }

  .phase-arrow {
    color: var(--color-gray-300);
    font-size: var(--font-size-lg);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.85;
      transform: scale(1.02);
    }
  }

  .streaming-banner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    background: var(--gem-teal);
    color: var(--gem-warm-white);
    font-size: var(--font-size-sm);
    margin-bottom: var(--space-6);
  }

  .truncation-note {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
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

  .embed-link {
    position: fixed;
    bottom: var(--space-4);
    right: var(--space-4);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: 2px solid var(--color-black);
    color: var(--color-black);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    transition: all 0.2s;
  }

  .embed-link:hover {
    background: var(--color-black);
    color: white;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .split-row {
      gap: var(--space-4);
    }
  }

  @media (max-width: 900px) {
    .split-row {
      grid-template-columns: 1fr;
    }

    .panel {
      max-height: 70vh;
    }

    .panel--mega {
      min-height: 400px;
    }

    .stat-number {
      font-size: 3rem;
    }
  }
</style>
