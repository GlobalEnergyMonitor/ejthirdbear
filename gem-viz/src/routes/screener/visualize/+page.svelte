<script>
  /**
   * ASSET-CLASS SCREENER - Step 4: Visualize + Export
   * Shows ownership network charts for selected owners with inline multi-format export.
   *
   * Design: Tufte-style information density
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getEntity, listAssets } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import ScreenerExportPanel from '$lib/components/screener/ScreenerExportPanel.svelte';
  import MiniBarChart from '$lib/components/charts/MiniBarChart.svelte';
  import { buildScreenerUrl, parseJsonSearchParam } from '$lib/screener-url';
  import { formatCapacity } from '$lib/format-utils';
  import { formatNumber } from '$lib/components/cart/export-panel-utils';
  import { statusColorsGranular } from '$lib/design-tokens';

  // Get params from URL
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse owner IDs
  const ownerIds = $derived(ownersParam ? ownersParam.split(',') : []);

  // Parse asset class info from URL for display
  const parsedClasses = $derived(parseJsonSearchParam(classesParam) || []);
  const assetClassName = $derived(
    parsedClasses.length > 0 ? parsedClasses[0]?.tracker || parsedClasses[0]?.name || '' : ''
  );
  const trackerSlug = $derived(parsedClasses.length > 0 ? parsedClasses[0]?.id || '' : '');

  // Owner data
  let owners = $state([]);
  let pageLoading = $state(true);
  let error = $state(null);

  // View options
  let viewMode = $state('grid');
  let selectedOwner = $state(null);
  let showHelp = $state(false);

  // Data collection from chart callbacks
  let assetsByOwner = $state(new Map());
  let chartContainers = $state(new Map());
  let chartsLoaded = $state(0);

  // Derived: deduped flat asset array for export
  const allAssets = $derived(() => {
    const seen = new Set();
    const result = [];
    for (const assets of assetsByOwner.values()) {
      for (const asset of assets) {
        if (!seen.has(asset.id)) {
          seen.add(asset.id);
          result.push(asset);
        }
      }
    }
    return result;
  });

  const chartsStillLoading = $derived(chartsLoaded < owners.length);

  // --- Distribution comparison ---
  let baseFacets = $state({ statuses: [], trackers: [], countries: [] });
  let baseFacetsLoaded = $state(false);

  // Portfolio distributions (from loaded assets)
  const portfolioStatusDist = $derived(() => {
    const assets = allAssets();
    if (!assets.length) return [];
    const counts = {};
    for (const a of assets) {
      const s = a.status || 'Unknown';
      counts[s] = (counts[s] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  const portfolioTypeDist = $derived(() => {
    const assets = allAssets();
    if (!assets.length) return [];
    const counts = {};
    for (const a of assets) {
      const t = a.facilityType || 'Unknown';
      counts[t] = (counts[t] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  const portfolioCountryDist = $derived(() => {
    const assets = allAssets();
    if (!assets.length) return [];
    const counts = {};
    for (const a of assets) {
      const c = a.country || 'Unknown';
      counts[c] = (counts[c] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  // Base (full dataset) distributions
  const baseStatusDist = $derived(
    baseFacets.statuses.map((f) => ({ label: f.value, value: f.count }))
  );
  const baseTrackerDist = $derived(
    baseFacets.trackers.map((f) => ({ label: f.value, value: f.count }))
  );
  const baseCountryDist = $derived(
    baseFacets.countries.map((f) => ({ label: f.value, value: f.count }))
  );

  const showDistribution = $derived(baseFacetsLoaded && allAssets().length > 0);

  // Data table sort state
  let sortCol = $state('name');
  let sortDir = $state(1); // 1 = asc, -1 = desc
  const TABLE_LIMIT = 200;

  // Denormalized rows for data table (one per asset-owner pair)
  const tableRows = $derived(() => {
    const flat = [];
    for (const asset of allAssets()) {
      const assetOwners = asset.owners || [];
      if (assetOwners.length === 0) {
        flat.push({
          name: asset.name,
          type: asset.facilityType || '',
          status: asset.status || '',
          country: asset.country || '',
          capacity: asset.capacity || 0,
          ownerName: asset.ownerName || '',
          ownershipShare: null,
        });
      } else {
        for (const o of assetOwners) {
          flat.push({
            name: asset.name,
            type: asset.facilityType || '',
            status: asset.status || '',
            country: asset.country || '',
            capacity: asset.capacity || 0,
            ownerName: o.name || '',
            ownershipShare: o.ownershipShare,
          });
        }
      }
    }
    // Sort
    flat.sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * sortDir;
      }
      return String(av || '').localeCompare(String(bv || '')) * sortDir;
    });
    return flat;
  });

  function toggleSort(col) {
    if (sortCol === col) {
      sortDir = sortDir * -1;
    } else {
      sortCol = col;
      sortDir = 1;
    }
  }

  function sortIndicator(col) {
    if (sortCol !== col) return '';
    return sortDir === 1 ? ' \u25B4' : ' \u25BE';
  }

  // Dynamic subtitle
  const subtitle = $derived(() => {
    const parts = [];
    if (owners.length > 0)
      parts.push(`${owners.length} ${owners.length === 1 ? 'owner' : 'owners'}`);
    if (assetClassName) parts.push(assetClassName);
    const total = allAssets();
    if (total.length > 0) parts.push(`${total.length.toLocaleString()} assets`);
    return parts.join(' \u00b7 ');
  });

  // Chart data callback
  function handleDataLoaded(data) {
    assetsByOwner = new Map(assetsByOwner).set(data.entityId, data.assets);
    chartsLoaded = chartsLoaded + 1;
  }

  // Chart container callback
  function handleContainerReady(entityId, el) {
    chartContainers = new Map(chartContainers).set(entityId, el);
  }

  // Load owner data
  onMount(async () => {
    if (ownerIds.length === 0) {
      pageLoading = false;
      return;
    }

    try {
      const ownerData = await Promise.all(
        ownerIds.map(async (id) => {
          try {
            const entity = await getEntity(id);
            return {
              id,
              name: entity?.name || id,
              country: entity?.headquartersCountry || '',
            };
          } catch (err) {
            if (import.meta.env.DEV) console.warn(`Failed to load owner ${id}:`, err);
            return { id, name: id, country: '' };
          }
        })
      );

      owners = ownerData;
      if (owners.length === 1) {
        selectedOwner = owners[0];
        viewMode = 'single';
      }
    } catch (err) {
      error = err?.message || 'Failed to load owner data';
    } finally {
      pageLoading = false;
    }

    // Fetch base facets for distribution comparison (non-blocking)
    try {
      const res = await listAssets({ limit: 1, facets: true });
      if (res.facets) {
        baseFacets = {
          statuses: Object.entries(res.facets.status || {}).map(([value, count]) => ({
            value,
            count,
          })),
          trackers: Object.entries(res.facets.asset_type || {}).map(([value, count]) => ({
            value,
            count,
          })),
          countries: Object.entries(res.facets.country || {}).map(([value, count]) => ({
            value,
            count,
          })),
        };
        baseFacetsLoaded = true;
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[screener] Failed to load base facets:', e);
    }
  });

  // Navigation
  function goBack() {
    goto(
      buildScreenerUrl('screener/results', {
        classes: classesParam || undefined,
        owners: ownersParam || undefined,
      })
    );
  }

  function goToOwner(owner) {
    selectedOwner = owner;
    viewMode = 'single';
  }

  function backToGrid() {
    viewMode = 'grid';
    selectedOwner = null;
  }

  function openEntityPage(ownerId) {
    goto(link(`entity/${ownerId}`));
  }

  function toggleHelp() {
    showHelp = !showHelp;
  }
</script>

<svelte:head>
  <title>Ownership Analysis — Global Energy Monitor</title>
  <meta
    name="description"
    content="Visualize ownership network connections and export asset data for selected companies."
  />
</svelte:head>

<ScreenerLayout currentStep={4} subtitle={subtitle()} {classesParam} {ownersParam} maxWidth="wide">
  {#snippet headerRight()}
    {#if owners.length > 1 && viewMode === 'single'}
      <button class="text-link" onclick={backToGrid}>
        View all {owners.length}
      </button>
    {/if}
  {/snippet}

  <!-- Visualization section -->
  <section class="viz-section">
    {#if pageLoading}
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Retrieving ownership data</p>
      </div>
    {:else if error}
      <div class="error-state">
        <p>{error}</p>
      </div>
    {:else if owners.length === 0}
      <div class="empty-state">
        <p>No entities selected. Return to results to select entities.</p>
      </div>
    {:else if viewMode === 'single' && selectedOwner}
      <!-- Single owner view -->
      <div class="owner-bar">
        <div class="owner-title">
          <h2>{selectedOwner.name}</h2>
          {#if selectedOwner.country}
            <span class="country">{selectedOwner.country}</span>
          {/if}
        </div>
        <div class="bar-actions">
          <button class="text-link muted" onclick={toggleHelp}>
            {showHelp ? 'Hide guide' : 'Guide'}
          </button>
          <span class="separator">|</span>
          <button class="text-link muted" onclick={() => openEntityPage(selectedOwner.id)}>
            Profile
          </button>
          {#if owners.length > 1}
            <span class="separator">|</span>
            <button class="text-link" onclick={backToGrid}>
              All {owners.length}
            </button>
          {/if}
        </div>
      </div>

      {#if showHelp}
        <p class="help-text">
          <strong>Owner node</strong> is the primary entity.
          <strong>Subsidiaries</strong> show ownership stakes.
          <strong>Percentages</strong> appear on connection lines. Click any node to explore.
        </p>
      {/if}

      <AssetScreenerChart
        entityId={selectedOwner.id}
        entityName={selectedOwner.name}
        {assetClassName}
        {trackerSlug}
        onDataLoaded={handleDataLoaded}
        onContainerReady={(el) => handleContainerReady(selectedOwner.id, el)}
      />
    {:else}
      <!-- Grid view -->
      <div class="grid-view">
        {#each owners as owner}
          <article class="graph-card">
            <header class="card-header">
              <h3>{owner.name}</h3>
              {#if owner.country}
                <span class="country">{owner.country}</span>
              {/if}
            </header>
            <div
              class="card-graph"
              role="button"
              tabindex="0"
              onclick={() => goToOwner(owner)}
              onkeydown={(e) => e.key === 'Enter' && goToOwner(owner)}
            >
              <AssetScreenerChart
                entityId={owner.id}
                entityName={owner.name}
                {assetClassName}
                {trackerSlug}
                onDataLoaded={handleDataLoaded}
                onContainerReady={(el) => handleContainerReady(owner.id, el)}
              />
            </div>
            <footer class="card-footer">
              <button class="text-link" onclick={() => goToOwner(owner)}>Expand</button>
              <button class="text-link muted" onclick={() => openEntityPage(owner.id)}>
                Profile
              </button>
            </footer>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Distribution comparison -->
  {#if showDistribution}
    <section class="distribution-section">
      <details open>
        <summary class="dist-summary">Portfolio distribution vs. all assets</summary>
        <div class="dist-grid">
          <div class="dist-card">
            <MiniBarChart
              data={portfolioStatusDist()}
              compareData={baseStatusDist}
              label="Status"
              maxItems={5}
              width={200}
              barHeight={12}
              gap={3}
              colorMap={statusColorsGranular}
            />
          </div>
          <div class="dist-card">
            <MiniBarChart
              data={portfolioTypeDist()}
              compareData={baseTrackerDist}
              label="Asset Type"
              maxItems={5}
              width={200}
              barHeight={12}
              gap={3}
            />
          </div>
          <div class="dist-card">
            <MiniBarChart
              data={portfolioCountryDist()}
              compareData={baseCountryDist}
              label="Country"
              maxItems={5}
              width={200}
              barHeight={12}
              gap={3}
            />
          </div>
        </div>
        <p class="dist-note">Colored bars = this portfolio. Ghost bars = all GEM assets.</p>
      </details>
    </section>
  {/if}

  <!-- Export panel -->
  {#if !pageLoading && owners.length > 0}
    <ScreenerExportPanel
      assets={allAssets()}
      {owners}
      {chartContainers}
      {assetClassName}
      loading={chartsStillLoading}
      pageUrl={$page.url.href}
    />
  {/if}

  <!-- Data table -->
  {#if !pageLoading && allAssets().length > 0}
    {@const rows = tableRows()}
    <details class="data-table-section">
      <summary class="table-summary">Data table ({formatNumber(allAssets().length)} assets)</summary
      >
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th onclick={() => toggleSort('name')}>Name{sortIndicator('name')}</th>
              <th onclick={() => toggleSort('type')}>Type{sortIndicator('type')}</th>
              <th onclick={() => toggleSort('status')}>Status{sortIndicator('status')}</th>
              <th onclick={() => toggleSort('country')}>Country{sortIndicator('country')}</th>
              <th class="num" onclick={() => toggleSort('capacity')}
                >Capacity{sortIndicator('capacity')}</th
              >
              <th onclick={() => toggleSort('ownerName')}>Owner{sortIndicator('ownerName')}</th>
              <th class="num" onclick={() => toggleSort('ownershipShare')}
                >%{sortIndicator('ownershipShare')}</th
              >
            </tr>
          </thead>
          <tbody>
            {#each rows.slice(0, TABLE_LIMIT) as row}
              <tr>
                <td>{row.name}</td>
                <td>{row.type}</td>
                <td>{row.status}</td>
                <td>{row.country}</td>
                <td class="num">{formatCapacity(row.capacity) || '—'}</td>
                <td>{row.ownerName}</td>
                <td class="num"
                  >{row.ownershipShare != null
                    ? `${(row.ownershipShare * 100).toFixed(1)}%`
                    : '—'}</td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      {#if rows.length > TABLE_LIMIT}
        <p class="table-note">
          Showing {TABLE_LIMIT} of {formatNumber(rows.length)} — export CSV for full dataset
        </p>
      {/if}
    </details>
  {/if}

  <!-- Navigation -->
  <nav class="nav-row">
    <button class="text-link nav-link" onclick={goBack}>Back to results</button>
    <button class="text-link nav-link" onclick={() => goto(link('screener'))}> New search </button>
  </nav>
</ScreenerLayout>

<style>
  /* Text links: the primary action style */
  .text-link {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-body);
    color: var(--color-accent);
    cursor: pointer;
    text-decoration: none;
  }

  .text-link:hover {
    text-decoration: underline;
  }

  .text-link.muted {
    color: var(--color-text-tertiary);
    transition: color var(--duration-slow) var(--ease-in-out-quad);
  }

  .text-link.muted:hover {
    color: var(--color-text-secondary);
  }

  /* States */
  .loading-state,
  .empty-state,
  .error-state {
    text-align: center;
    padding: 80px var(--space-6);
    color: var(--color-text-tertiary);
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-text-tertiary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-3);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    color: var(--color-error);
  }

  .owner-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .owner-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .owner-title h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .country {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .separator {
    color: var(--color-gray-300);
    font-size: var(--font-size-body);
  }

  .help-text {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-4) 0;
    line-height: var(--line-height-relaxed);
  }

  .help-text strong {
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  /* Grid view */
  .grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-5);
  }

  .graph-card {
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .card-header h3 {
    margin: 0;
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: var(--space-2);
  }

  .card-graph {
    cursor: pointer;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    margin-top: var(--space-2);
  }

  /* Navigation row */
  .nav-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-6);
    border-top: var(--border-width) solid var(--color-border);
  }

  .nav-link {
    font-size: var(--font-size-body);
  }

  /* Data table */
  .data-table-section {
    margin-top: var(--space-4);
  }

  .table-summary {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: var(--space-2) 0;
    user-select: none;
  }

  .table-summary:hover {
    color: var(--color-text-primary);
  }

  .table-scroll {
    overflow-x: auto;
    margin-top: var(--space-3);
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
  }

  .data-table th {
    text-align: left;
    font-weight: 500;
    color: var(--color-text-secondary);
    padding: var(--space-2) var(--space-3);
    border-bottom: 2px solid var(--color-border);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }

  .data-table th:hover {
    color: var(--color-text-primary);
  }

  .data-table th.num,
  .data-table td.num {
    text-align: right;
  }

  .data-table td {
    padding: var(--space-1) var(--space-3);
    color: var(--color-text-primary);
    border: none;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .data-table tbody tr:nth-child(even) {
    background: var(--color-bg-subtle, rgba(0, 0, 0, 0.02));
  }

  .data-table tbody tr:hover {
    background: var(--color-bg-hover, rgba(0, 0, 0, 0.04));
  }

  .table-note {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin-top: var(--space-2);
    font-style: italic;
  }

  /* Distribution comparison */
  .distribution-section {
    margin-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-4);
  }

  .dist-summary {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: var(--space-2) 0;
    user-select: none;
  }

  .dist-summary:hover {
    color: var(--color-text-primary);
  }

  .dist-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-4);
    margin-top: var(--space-3);
  }

  .dist-card {
    padding: var(--space-2);
  }

  .dist-note {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin-top: var(--space-2);
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .grid-view {
      grid-template-columns: 1fr;
    }

    .owner-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .bar-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
