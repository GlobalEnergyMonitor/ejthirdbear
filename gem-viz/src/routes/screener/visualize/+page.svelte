<script>
  /**
   * ASSET-CLASS SCREENER - Step 4: Visualize
   * Shows ownership network visualizations for selected owners.
   *
   * Design: Tufte-style information density
   * - Maximize data-ink ratio
   * - Subtle typography hierarchy
   * - Generous whitespace for the visualization
   * - Muted UI chrome, prominent data
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getEntity } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';
  import { buildScreenerUrl, parseJsonSearchParam } from '$lib/screener-url';

  // Get params from URL
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse owner IDs
  const ownerIds = $derived(ownersParam ? ownersParam.split(',') : []);

  // Parse asset class info from URL for display
  const parsedClasses = $derived(
    parseJsonSearchParam(classesParam) || []
  );
  const assetClassName = $derived(
    parsedClasses.length > 0 ? (parsedClasses[0]?.tracker || parsedClasses[0]?.name || '') : ''
  );
  const trackerSlug = $derived(
    parsedClasses.length > 0 ? (parsedClasses[0]?.id || '') : ''
  );

  // Owner data
  let owners = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // View options
  let viewMode = $state('grid'); // 'grid' | 'single'
  let selectedOwner = $state(null);
  let showHelp = $state(false);

  // Load owner data
  onMount(async () => {
    if (ownerIds.length === 0) {
      loading = false;
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
      loading = false;
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

  // Download ownership data as CSV
  function downloadData() {
    if (!selectedOwner && owners.length === 0) return;

    const ownerList = selectedOwner ? [selectedOwner] : owners;
    const csvRows = ['Owner ID,Owner Name,Country'];

    ownerList.forEach((owner) => {
      csvRows.push(`"${owner.id}","${owner.name}","${owner.country || ''}"`);
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ownership-data-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Toggle help tooltip
  function toggleHelp() {
    showHelp = !showHelp;
  }
</script>

<svelte:head>
  <title>Ownership Networks — Global Energy Monitor</title>
  <meta
    name="description"
    content="Visualize ownership network connections between selected companies and their energy asset portfolios."
  />
</svelte:head>

<div class="page">
  <div class="screener-layout">
    <!-- Step indicator -->
    <ScreenerStepNav currentStep={4} {classesParam} {ownersParam} />

    <!-- Header: compact, typography-focused -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Ownership Networks</h1>
        <p class="subtitle">
          {#if viewMode === 'single' && selectedOwner}
            {selectedOwner.name}
          {:else if owners.length > 0}
            {owners.length} {owners.length === 1 ? 'entity' : 'entities'} selected
          {:else if loading}
            Loading...
          {:else}
            No entities selected
          {/if}
        </p>
      </div>

      {#if owners.length > 1 && viewMode === 'single'}
        <button class="text-link" onclick={backToGrid}>
          View all {owners.length}
        </button>
      {/if}
    </header>

    <!-- Visualization section -->
    <section class="viz-section">
      {#if loading}
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
        <!-- Single owner view: flat, no box -->
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
            <button class="text-link muted" onclick={downloadData}> Export </button>
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
        />
      {:else}
        <!-- Grid view: cards are minimal frames for graphs -->
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
                />
              </div>
              <footer class="card-footer">
                <button class="text-link" onclick={() => goToOwner(owner)}> Expand </button>
                <button class="text-link muted" onclick={() => openEntityPage(owner.id)}>
                  Profile
                </button>
              </footer>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Navigation: minimal -->
    <nav class="nav-row">
      <button class="text-link nav-link" onclick={goBack}> Back to results </button>
      <button class="text-link nav-link" onclick={() => goto(link('screener'))}>
        New search
      </button>
    </nav>
  </div>
</div>

<style>
  /*
   * Tufte-style design system
   * - High data-ink ratio
   * - Subtle UI chrome
   * - Typography does the work
   */

  .page {
    min-height: 100vh;
    background: var(--color-bg-secondary);
  }

  .screener-layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-12);
  }

  /* Header: compact, restrained */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-6);
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  h1 {
    font-size: var(--font-size-lg);
    font-weight: 400;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .subtitle {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: var(--space-1) 0 0 0;
  }

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

  /* Visualization section */
  .viz-section {
    margin-bottom: var(--space-8);
  }

  /* States: minimal */
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

  /* Grid view: minimal cards */
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

  /* Navigation row: minimal */
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

  /* Responsive */
  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
      align-items: flex-start;
      gap: var(--space-2);
    }

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
