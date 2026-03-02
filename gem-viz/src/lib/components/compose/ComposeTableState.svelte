<script>
  import DataTable from '$lib/components/DataTable.svelte';

  export let state;
</script>

{#if state.loading || !state.initialLoadComplete}
  <div class="skeleton-table">
    <div class="skeleton-table-header">
      <div class="skeleton-th"></div>
      <div class="skeleton-th"></div>
      <div class="skeleton-th"></div>
      <div class="skeleton-th"></div>
      <div class="skeleton-th"></div>
    </div>
    {#each Array(8) as _, i}
      <div class="skeleton-table-row" style="animation-delay: {i * 0.05}s">
        <div class="skeleton-td"></div>
        <div class="skeleton-td"></div>
        <div class="skeleton-td"></div>
        <div class="skeleton-td"></div>
        <div class="skeleton-td"></div>
      </div>
    {/each}
  </div>
{:else if state.results.length > 0}
  {#if state.allPageSelected && !state.allMatchingSelected && state.totalCount > state.results.length}
    <div class="select-all-banner">
      All {state.results.length} assets on this page selected.
      <button onclick={state.selectAllMatching}>
        Select all {state.totalCount.toLocaleString()} that match your filters?
      </button>
    </div>
  {/if}
  {#if state.allMatchingSelected}
    <div class="select-all-banner selected">
      <strong>{state.allMatchingIds.length.toLocaleString()} assets</strong> matching your filters
      are selected.
      <button onclick={state.clearAllMatchingSelection}>Clear</button>
    </div>
  {/if}

  <DataTable
    columns={state.tableColumns}
    data={state.tableRows}
    pageSize={state.pageSize}
    showGlobalSearch={true}
    showColumnFilters={true}
    showPagination={false}
    showExport={false}
    showColumnToggle={true}
    showSelection={true}
    bind:selectedRows={state.selectedRows}
    stickyHeader={true}
    striped={true}
    onRowClick={state.handleRowClick}
    onRowHover={state.handleRowHover}
    onRowLeave={state.handleRowLeave}
    highlightRow={state.isRowInCart}
  />

  <div class="pagination">
    <div class="pagination-info">
      Showing {((state.currentPage - 1) * state.pageSize + 1).toLocaleString()}–{Math.min(
        state.currentPage * state.pageSize,
        state.totalCount
      ).toLocaleString()} of {state.totalCount.toLocaleString()} results
    </div>
    <div class="pagination-controls">
      <button
        class="page-btn"
        disabled={state.currentPage === 1 || state.loading}
        onclick={() => state.goToPage(1)}
        title="First page"
      >
        ««
      </button>
      <button
        class="page-btn"
        disabled={state.currentPage === 1 || state.loading}
        onclick={() => state.goToPage(state.currentPage - 1)}
        title="Previous page"
      >
        «
      </button>
      <span class="page-indicator"
        >Page {state.currentPage} of {state.totalPages.toLocaleString()}</span
      >
      <button
        class="page-btn"
        disabled={state.currentPage >= state.totalPages || state.loading}
        onclick={() => state.goToPage(state.currentPage + 1)}
        title="Next page"
      >
        »
      </button>
      <button
        class="page-btn"
        disabled={state.currentPage >= state.totalPages || state.loading}
        onclick={() => state.goToPage(state.totalPages)}
        title="Last page"
      >
        »»
      </button>
    </div>
  </div>
{:else}
  <div class="no-results">
    {#if state.hasFilters}
      <p>No assets match your filters.</p>
      <button onclick={state.clearFilters}>Clear filters</button>
    {:else}
      <p>Select filters to search assets.</p>
    {/if}
  </div>
{/if}

<style>
  .select-all-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-warning-bg);
    border: var(--border-width) solid var(--color-warning);
    font-size: var(--font-size-sm);
    color: var(--color-warning-text);
  }

  .select-all-banner.selected {
    background: var(--color-info-bg);
    border-color: var(--color-info);
    color: var(--color-info-text);
  }

  .select-all-banner button {
    background: none;
    border: none;
    color: var(--color-link);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .select-all-banner button:hover {
    color: var(--color-link-hover);
  }

  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-2);
    font-size: var(--font-size-sm);
  }

  .pagination-info {
    color: var(--color-text-secondary);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
    background: transparent;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
  }

  .page-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator {
    padding: 0 var(--space-2);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .no-results {
    text-align: center;
    padding: var(--space-10) var(--space-5);
    color: var(--color-text-secondary);
  }

  .no-results p {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-body);
  }

  .no-results button {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  .skeleton-table-header {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
  }

  .skeleton-th {
    flex: 1;
    height: var(--space-3);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-th:nth-child(1) {
    flex: 2;
  }

  .skeleton-th:nth-child(2) {
    flex: 1.5;
  }

  .skeleton-table-row {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-table-row:nth-child(even) {
    background: transparent;
  }

  .skeleton-td {
    flex: 1;
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
  }

  .skeleton-td:nth-child(1) {
    flex: 2;
  }

  .skeleton-td:nth-child(2) {
    flex: 1.5;
  }

  :global(.results-panel .data-table-container) {
    border: 0;
  }

  :global(.results-panel .data-table) {
    font-size: 11px;
    table-layout: fixed;
  }

  :global(.results-panel .data-table th),
  :global(.results-panel .data-table td) {
    padding: 4px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    line-height: 1.3;
  }

  :global(.results-panel .data-table th) {
    font-size: 9px;
  }

  :global(.results-panel .data-table td:first-child) {
    max-width: 280px;
    font-weight: 500;
  }

  :global(.results-panel .data-table tr) {
    height: 28px;
  }

  :global(.results-panel .data-table-controls) {
    padding: 4px 6px;
    gap: 4px;
  }

  :global(.results-panel .data-table-controls input) {
    padding: 4px 6px;
    font-size: 10px;
  }

  :global(.results-panel .data-table-controls button) {
    padding: 3px 8px;
    font-size: 9px;
  }
</style>
