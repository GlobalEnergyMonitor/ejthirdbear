<script>
  /**
   * ASSET-CLASS SCREENER - Step 3: Results
   * Shows owners with their asset counts matching selected classes.
   */

  import { link, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getEntity, getEntityOwned } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  // Table columns definition
  const columns = [
    { key: 'name', label: 'Company Name', sortable: true },
    { key: 'country', label: 'Country', sortable: true },
    { key: 'totalAssets', label: 'Total Assets', sortable: true, type: 'number' },
    { key: 'matchedAssets', label: 'Matched Assets', sortable: true, type: 'number' },
  ];

  // Get params from URL
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse owner IDs
  const ownerIds = $derived(ownersParam ? ownersParam.split(',') : []);

  // Results state
  let results = $state([]);
  let loading = $state(true);
  let error = $state(null);

  // Selected owners for visualization
  let selectedForViz = $state(new Set());

  // Load owner data on mount
  onMount(async () => {
    if (ownerIds.length === 0) {
      loading = false;
      return;
    }

    try {
      const ownerData = await Promise.all(
        ownerIds.map(async (id) => {
          try {
            const [entity, assets] = await Promise.all([getEntity(id), getEntityOwned(id)]);

            const assetList = assets || [];
            const totalAssets = assetList.length;

            // Count assets matching selected classes
            // For now, we'll show all assets since we don't have class filtering yet
            const matchedAssets = totalAssets;

            return {
              id,
              name: entity?.name || id,
              country: entity?.headquartersCountry || '',
              totalAssets,
              matchedAssets,
              assets: assetList,
            };
          } catch (err) {
            console.warn(`Failed to load owner ${id}:`, err);
            return {
              id,
              name: id,
              country: '',
              totalAssets: 0,
              matchedAssets: 0,
              assets: [],
            };
          }
        })
      );

      results = ownerData;
    } catch (err) {
      error = err?.message || 'Failed to load results';
    } finally {
      loading = false;
    }
  });

  // Toggle selection for visualization
  function toggleVizSelection(ownerId) {
    const newSet = new Set(selectedForViz);
    if (newSet.has(ownerId)) {
      newSet.delete(ownerId);
    } else {
      newSet.add(ownerId);
    }
    selectedForViz = newSet;
  }

  // Select all for visualization
  function selectAll() {
    selectedForViz = new Set(results.map((r) => r.id));
  }

  // Clear selection
  function clearSelection() {
    selectedForViz = new Set();
  }

  // Navigation
  function goBack() {
    goto(link(`screener/owners?classes=${encodeURIComponent(classesParam)}`));
  }

  function goToVisualize() {
    const vizOwners = Array.from(selectedForViz).join(',');
    goto(
      link(
        `screener/visualize?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(vizOwners)}`
      )
    );
  }

  function visualizeSingle(ownerId) {
    goto(
      link(
        `screener/visualize?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(ownerId)}`
      )
    );
  }

  // Total stats
  const totalAssets = $derived(results.reduce((sum, r) => sum + r.totalAssets, 0));
  const totalMatched = $derived(results.reduce((sum, r) => sum + r.matchedAssets, 0));
</script>

<svelte:head>
  <title>Results — Asset-Class Screener — GEM Viz</title>
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
      <div class="step active">
        <span class="step-num">3</span>
        <span class="step-label">Results</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">4</span>
        <span class="step-label">Visualize</span>
      </div>
    </nav>

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Results</h1>
        <p class="subtitle">
          {#if results.length > 0}
            Found {totalMatched} assets across {results.length} owners.
          {:else if loading}
            Loading owner data...
          {:else}
            No owners selected.
          {/if}
        </p>
      </div>

      <!-- Selection summary -->
      {#if selectedForViz.size > 0}
        <div class="selection-panel">
          <div class="selection-count">{selectedForViz.size} selected for visualization</div>
          <button class="clear-btn" onclick={clearSelection}>Clear</button>
        </div>
      {/if}
    </header>

    <!-- Results section -->
    <section class="results-section">
      <LoadingWrapper
        {loading}
        {error}
        empty={results.length === 0}
        loadingMessage="Loading owner data..."
        emptyMessage="No owners to show. Go back and select some owners."
      >
        <!-- Table controls -->
        <div class="table-controls">
          <button class="control-btn" onclick={selectAll}>Select All</button>
          <button class="control-btn" onclick={clearSelection}>Clear Selection</button>
          <span class="results-count">{results.length} owners</span>
        </div>

        <!-- Results table -->
        <div class="table-wrapper">
          <table class="results-table">
            <thead>
              <tr>
                <th class="col-select">
                  <input
                    type="checkbox"
                    checked={selectedForViz.size === results.length && results.length > 0}
                    onchange={() =>
                      selectedForViz.size === results.length ? clearSelection() : selectAll()}
                  />
                </th>
                <th class="col-name">Company Name</th>
                <th class="col-country">Country</th>
                <th class="col-total">Total Assets</th>
                <th class="col-matched">Matched Assets</th>
                <th class="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each results as row}
                <tr class:selected={selectedForViz.has(row.id)}>
                  <td class="col-select">
                    <input
                      type="checkbox"
                      checked={selectedForViz.has(row.id)}
                      onchange={() => toggleVizSelection(row.id)}
                    />
                  </td>
                  <td class="col-name">
                    <a href={link(`entity/${row.id}`)} class="entity-link">{row.name}</a>
                  </td>
                  <td class="col-country">{row.country || '—'}</td>
                  <td class="col-total">{row.totalAssets}</td>
                  <td class="col-matched">
                    <span class="matched-count">{row.matchedAssets}</span>
                  </td>
                  <td class="col-actions">
                    <button class="viz-btn" onclick={() => visualizeSingle(row.id)}>
                      Visualize →
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td class="col-name"><strong>Total</strong></td>
                <td></td>
                <td class="col-total"><strong>{totalAssets}</strong></td>
                <td class="col-matched"><strong>{totalMatched}</strong></td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </LoadingWrapper>
    </section>

    <!-- Navigation buttons -->
    <div class="nav-buttons">
      <button class="back-btn" onclick={goBack}> ← Back to Find Owners </button>
      <button class="continue-btn" onclick={goToVisualize} disabled={selectedForViz.size === 0}>
        Visualize Selected ({selectedForViz.size}) →
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
    max-width: 1100px;
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

  /* Selection panel */
  .selection-panel {
    background: #e8f4f8;
    border: 1px solid #b8d4e3;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .selection-count {
    font-size: 14px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .clear-btn {
    padding: 4px 12px;
    font-size: 12px;
    background: white;
    border: 1px solid #b8d4e3;
    border-radius: 4px;
    cursor: pointer;
  }

  .clear-btn:hover {
    background: #f5f5f5;
  }

  /* Results section */
  .results-section {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  /* Table controls */
  .table-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e0e0e0;
  }

  .control-btn {
    padding: 6px 12px;
    font-size: 12px;
    background: white;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
  }

  .control-btn:hover {
    background: #f5f5f5;
  }

  .results-count {
    margin-left: auto;
    font-size: 13px;
    color: #666;
  }

  /* Table */
  .table-wrapper {
    overflow-x: auto;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .results-table th,
  .results-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e0e0e0;
  }

  .results-table th {
    font-weight: 600;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    background: #f8f9fa;
  }

  .results-table tbody tr:hover {
    background: #f8f9fa;
  }

  .results-table tbody tr.selected {
    background: #f0f7fa;
  }

  .results-table tfoot td {
    border-top: 2px solid #e0e0e0;
    border-bottom: none;
    background: #f8f9fa;
  }

  .col-select {
    width: 40px;
    text-align: center;
  }

  .col-name {
    min-width: 200px;
  }

  .col-country {
    width: 120px;
  }

  .col-total,
  .col-matched {
    width: 100px;
    text-align: right;
  }

  .col-actions {
    width: 100px;
    text-align: right;
  }

  .entity-link {
    color: #1a5f7a;
    text-decoration: none;
  }

  .entity-link:hover {
    text-decoration: underline;
  }

  .matched-count {
    display: inline-block;
    padding: 2px 8px;
    background: #e8f4f8;
    border-radius: 4px;
    font-weight: 500;
  }

  .viz-btn {
    padding: 6px 12px;
    font-size: 12px;
    background: #1a5f7a;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .viz-btn:hover {
    background: #145266;
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

  .continue-btn {
    padding: 14px 32px;
    font-size: 16px;
    font-weight: 600;
    background: #1a5f7a;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  .continue-btn:hover:not(:disabled) {
    background: #145266;
  }

  .continue-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  @media (max-width: 768px) {
    .screener-header {
      flex-direction: column;
    }

    .selection-panel {
      width: 100%;
    }

    .table-controls {
      flex-wrap: wrap;
    }

    .results-count {
      width: 100%;
      margin-left: 0;
      margin-top: 8px;
    }

    .nav-buttons {
      flex-direction: column;
      gap: 12px;
    }
  }
</style>
