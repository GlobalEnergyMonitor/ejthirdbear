<script>
  /**
   * ASSET-CLASS SCREENER - Step 4: Visualize
   * Shows ownership network visualizations for selected owners.
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getEntity } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import MiniNetworkGraph from '$lib/components/MiniNetworkGraph.svelte';

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
</script>

<svelte:head>
  <title>Visualize — Asset-Class Screener — GEM Viz</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <nav class="step-nav">
      <div class="step completed">
        <span class="step-num">1</span>
        <span class="step-label">Asset Classes</span>
      </div>
      <div class="step-line completed"></div>
      <div class="step completed">
        <span class="step-num">2</span>
        <span class="step-label">Find Owners</span>
      </div>
      <div class="step-line completed"></div>
      <div class="step completed">
        <span class="step-num">3</span>
        <span class="step-label">Results</span>
      </div>
      <div class="step-line completed"></div>
      <div class="step active">
        <span class="step-num">4</span>
        <span class="step-label">Visualize</span>
      </div>
    </nav>

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Ownership Visualization</h1>
        <p class="subtitle">
          {#if viewMode === 'single' && selectedOwner}
            Viewing ownership network for {selectedOwner.name}
          {:else if owners.length > 0}
            Viewing {owners.length} ownership networks
          {:else if loading}
            Loading visualizations...
          {:else}
            No owners to visualize.
          {/if}
        </p>
      </div>

      <!-- View toggle -->
      {#if owners.length > 1}
        <div class="view-toggle">
          {#if viewMode === 'single'}
            <button class="toggle-btn" onclick={backToGrid}>← View All ({owners.length})</button>
          {:else}
            <span class="view-hint">Click a card to expand</span>
          {/if}
        </div>
      {/if}
    </header>

    <!-- Visualization section -->
    <section class="viz-section">
      {#if loading}
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading owner data...</p>
        </div>
      {:else if error}
        <div class="error-state">{error}</div>
      {:else if owners.length === 0}
        <div class="empty-state">
          <p>No owners to visualize. Go back and select some owners.</p>
        </div>
      {:else if viewMode === 'single' && selectedOwner}
        <!-- Single owner view -->
        <div class="single-view">
          <div class="owner-header">
            <h2>{selectedOwner.name}</h2>
            {#if selectedOwner.country}
              <span class="owner-country">{selectedOwner.country}</span>
            {/if}
            <button class="entity-link-btn" onclick={() => openEntityPage(selectedOwner.id)}>
              View Entity Page →
            </button>
          </div>
          <div class="large-graph">
            <MiniNetworkGraph
              entityId={selectedOwner.id}
              entityName={selectedOwner.name}
              maxHops={2}
              height={500}
            />
          </div>
        </div>
      {:else}
        <!-- Grid view -->
        <div class="grid-view">
          {#each owners as owner}
            <div class="graph-card">
              <div class="card-header">
                <h3>{owner.name}</h3>
                {#if owner.country}
                  <span class="owner-country">{owner.country}</span>
                {/if}
              </div>
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
                  height={250}
                />
              </div>
              <div class="card-actions">
                <button class="expand-btn" onclick={() => goToOwner(owner)}>Expand</button>
                <button class="entity-btn" onclick={() => openEntityPage(owner.id)}>
                  Entity Page
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Navigation buttons -->
    <div class="nav-buttons">
      <button class="back-btn" onclick={goBack}> ← Back to Results </button>
      <button class="done-btn" onclick={() => goto(link('screener'))}>
        Start New Screener Query
      </button>
    </div>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: #f8f9fa;
  }

  .screener-layout {
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 24px;
  }

  /* Step navigation */
  .step-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    opacity: 0.4;
  }

  .step.active,
  .step.completed {
    opacity: 1;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 2px solid #1a5f7a;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .step.active .step-num,
  .step.completed .step-num {
    background: #1a5f7a;
    color: white;
  }

  .step-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: #ddd;
  }

  .step-line.completed {
    background: #1a5f7a;
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 32px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: 32px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #1a1a2e;
  }

  .subtitle {
    font-size: 15px;
    color: #666;
    margin: 0;
  }

  /* View toggle */
  .view-toggle {
    display: flex;
    align-items: center;
  }

  .toggle-btn {
    padding: 8px 16px;
    font-size: 13px;
    background: #e8f4f8;
    color: #1a5f7a;
    border: 1px solid #b8d4e3;
    border-radius: 4px;
    cursor: pointer;
  }

  .toggle-btn:hover {
    background: #d0e8f0;
  }

  .view-hint {
    font-size: 12px;
    color: #888;
  }

  /* Visualization section */
  .viz-section {
    margin-bottom: 24px;
  }

  .loading-state,
  .empty-state {
    text-align: center;
    padding: 80px 20px;
    color: #666;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e0e0e0;
    border-top-color: #1a5f7a;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error-state {
    padding: 20px;
    background: #fee;
    border: 1px solid #fcc;
    color: #c00;
    border-radius: 4px;
  }

  /* Single view */
  .single-view {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
  }

  .owner-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }

  .owner-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  .owner-country {
    font-size: 13px;
    color: #666;
    padding: 4px 8px;
    background: #e8e8e8;
    border-radius: 4px;
  }

  .entity-link-btn {
    margin-left: auto;
    padding: 8px 16px;
    font-size: 13px;
    background: white;
    color: #1a5f7a;
    border: 1px solid #1a5f7a;
    border-radius: 4px;
    cursor: pointer;
  }

  .entity-link-btn:hover {
    background: #f0f7fa;
  }

  .large-graph {
    padding: 24px;
  }

  /* Grid view */
  .grid-view {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 24px;
  }

  .graph-card {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    overflow: hidden;
    transition: box-shadow 0.2s;
  }

  .graph-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f9fa;
  }

  .card-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-graph {
    cursor: pointer;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid #e0e0e0;
    background: #f8f9fa;
  }

  .expand-btn,
  .entity-btn {
    flex: 1;
    padding: 8px 12px;
    font-size: 12px;
    border-radius: 4px;
    cursor: pointer;
  }

  .expand-btn {
    background: #1a5f7a;
    color: white;
    border: none;
  }

  .expand-btn:hover {
    background: #145266;
  }

  .entity-btn {
    background: white;
    color: #333;
    border: 1px solid #ccc;
  }

  .entity-btn:hover {
    background: #f5f5f5;
  }

  /* Navigation buttons */
  .nav-buttons {
    display: flex;
    justify-content: space-between;
    padding: 24px 0;
  }

  .back-btn {
    padding: 12px 24px;
    font-size: 14px;
    background: white;
    color: #333;
    border: 1px solid #ccc;
    border-radius: 6px;
    cursor: pointer;
  }

  .back-btn:hover {
    background: #f5f5f5;
  }

  .done-btn {
    padding: 14px 32px;
    font-size: 16px;
    font-weight: 600;
    background: #1a5f7a;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .done-btn:hover {
    background: #145266;
  }

  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
    }

    .grid-view {
      grid-template-columns: 1fr;
    }

    .owner-header {
      flex-wrap: wrap;
    }

    .entity-link-btn {
      width: 100%;
      margin-left: 0;
      margin-top: 12px;
    }

    .nav-buttons {
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
