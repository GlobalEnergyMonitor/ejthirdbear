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
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';

  // Get params from URL
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse owner IDs
  const ownerIds = $derived(ownersParam ? ownersParam.split(',') : []);

  // Owner data
  let owners = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // View options
  let viewMode = $state('grid'); // 'grid' | 'single'
  let selectedOwner = $state(null);
  let displayMode = $state('tree'); // 'tree' | 'tabular'
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
            console.warn(`Failed to load owner ${id}:`, err);
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
      link(
        `screener/results?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(ownersParam)}`
      )
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

  // Toggle between tree and tabular display
  function toggleDisplayMode() {
    displayMode = displayMode === 'tree' ? 'tabular' : 'tree';
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
  <title>Ownership Networks — Asset Screener — GEM Viz</title>
</svelte:head>

<main>
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
        <!-- Single owner view: visualization is primary -->
        <div class="single-view">
          <!-- Minimal header bar -->
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
              <button class="text-link muted" onclick={toggleDisplayMode}>
                {displayMode === 'tree' ? 'Table' : 'Network'}
              </button>
              <span class="separator">|</span>
              <button class="text-link muted" onclick={downloadData}>
                Export
              </button>
              {#if owners.length > 1}
                <button class="close-btn" onclick={backToGrid} title="Return to grid">
                  <span class="sr-only">Close</span>
                  <span aria-hidden="true">×</span>
                </button>
              {/if}
            </div>
          </div>

          <!-- Help: subtle, inline -->
          {#if showHelp}
            <aside class="help-panel">
              <p>
                <strong>Owner node</strong> is the primary entity.
                <strong>Subsidiaries</strong> show ownership stakes.
                <strong>Percentages</strong> appear on connection lines.
                Click any node to explore.
              </p>
            </aside>
          {/if}

          {#if displayMode === 'tree'}
            <!-- Graph gets maximum space -->
            <div class="graph-container">
              <MiniNetworkGraph
                entityId={selectedOwner.id}
                entityName={selectedOwner.name}
                maxHops={2}
                height={560}
              />
            </div>
          {:else}
            <!-- Tabular view -->
            <div class="tabular-view">
              <table class="ownership-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Type</th>
                    <th>Relationship</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{selectedOwner.name}</td>
                    <td>Parent</td>
                    <td>Primary</td>
                  </tr>
                  <tr class="placeholder">
                    <td colspan="3">Loading subsidiary data...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Entity link: subtle, bottom -->
          <div class="entity-link">
            <button class="text-link" onclick={() => openEntityPage(selectedOwner.id)}>
              View full entity profile
            </button>
          </div>
        </div>
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
                <MiniNetworkGraph
                  entityId={owner.id}
                  entityName={owner.name}
                  maxHops={1}
                  height={220}
                />
              </div>
              <footer class="card-footer">
                <button class="text-link" onclick={() => goToOwner(owner)}>
                  Expand
                </button>
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
      <button class="text-link nav-link" onclick={goBack}>
        Back to results
      </button>
      <button class="text-link nav-link" onclick={() => goto(link('screener'))}>
        New search
      </button>
    </nav>
  </div>
</main>

<style>
  /*
   * Tufte-style design system
   * - High data-ink ratio
   * - Subtle UI chrome
   * - Typography does the work
   */

  main {
    min-height: 100vh;
    background: #fafafa;
  }

  .screener-layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px 48px;
  }

  /* Header: compact, restrained */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e5e5;
  }

  h1 {
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #888;
    margin: 0;
  }

  .subtitle {
    font-size: 13px;
    color: #666;
    margin: 4px 0 0 0;
  }

  /* Text links: the primary action style */
  .text-link {
    background: none;
    border: none;
    padding: 0;
    font-size: 13px;
    color: #1a5f7a;
    cursor: pointer;
    text-decoration: none;
  }

  .text-link:hover {
    text-decoration: underline;
  }

  .text-link.muted {
    color: #888;
  }

  .text-link.muted:hover {
    color: #555;
  }

  /* Visualization section */
  .viz-section {
    margin-bottom: 32px;
  }

  /* States: minimal */
  .loading-state,
  .empty-state,
  .error-state {
    text-align: center;
    padding: 80px 24px;
    color: #888;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 2px solid #e0e0e0;
    border-top-color: #888;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 12px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-state {
    color: #991b1b;
  }

  /* Single view: visualization-first */
  .single-view {
    background: white;
    border: 1px solid #e5e5e5;
  }

  .owner-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid #eee;
  }

  .owner-title {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  .owner-title h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
    color: #222;
  }

  .country {
    font-size: 12px;
    color: #999;
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .separator {
    color: #ddd;
    font-size: 12px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .close-btn {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    background: none;
    border: none;
    cursor: pointer;
    color: #999;
    margin-left: 8px;
  }

  .close-btn:hover {
    color: #555;
  }

  /* Help panel: subtle, inline */
  .help-panel {
    padding: 12px 20px;
    background: #f9f9f9;
    border-bottom: 1px solid #eee;
    font-size: 12px;
    color: #666;
    line-height: 1.6;
  }

  .help-panel p {
    margin: 0;
  }

  .help-panel strong {
    color: #555;
    font-weight: 500;
  }

  /* Graph container: maximize space */
  .graph-container {
    padding: 32px 20px 40px;
  }

  /* Tabular view */
  .tabular-view {
    padding: 24px 20px;
  }

  .ownership-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .ownership-table th,
  .ownership-table td {
    padding: 10px 12px;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  .ownership-table th {
    font-weight: 500;
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .ownership-table .placeholder {
    color: #bbb;
    font-style: italic;
  }

  /* Entity link footer */
  .entity-link {
    padding: 12px 20px;
    border-top: 1px solid #eee;
    text-align: right;
  }

  /* Grid view: minimal cards */
  .grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .graph-card {
    background: white;
    border: 1px solid #e5e5e5;
    transition: border-color 0.15s;
  }

  .graph-card:hover {
    border-color: #ccc;
  }

  .card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #eee;
  }

  .card-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    margin-right: 8px;
  }

  .card-graph {
    cursor: pointer;
    padding: 8px 0;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    padding: 10px 14px;
    border-top: 1px solid #eee;
  }

  /* Navigation row: minimal */
  .nav-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 24px;
    border-top: 1px solid #e5e5e5;
  }

  .nav-link {
    font-size: 13px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }

    .grid-view {
      grid-template-columns: 1fr;
    }

    .owner-bar {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .bar-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
