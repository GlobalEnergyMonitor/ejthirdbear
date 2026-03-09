<script>
  import { formatCount } from '$lib/format';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';

  let { state } = $props();
</script>

<div class="results-header">
  <div class="results-header-top">
    <div class="results-title-group">
      <h1>Filtered Assets</h1>
      <div class="results-meta">
        {#if state._fetchProgress}
          <span class="loading-text"
            >Loading {state._fetchProgress.fetched.toLocaleString()} of {state._fetchProgress.total.toLocaleString()}
            assets...</span
          >
        {:else if state.loading}
          <span class="loading-text">Loading...</span>
        {:else}
          <span class="result-count">{formatCount(state.totalCount)} results</span>
          <DataSourceBadge source="api" queryTime={state.queryTime} />
        {/if}
      </div>
    </div>
    <div class="results-export-group">
      <span class="export-label">Export all {formatCount(state.totalCount)}:</span>
      <button
        class="export-btn"
        onclick={state.exportCSV}
        disabled={state.exporting || state.totalCount === 0}
      >
        {state.exporting ? 'Exporting...' : 'CSV'}
      </button>
      <button
        class="export-btn"
        onclick={state.exportJSON}
        disabled={state.exporting || state.totalCount === 0}
      >
        JSON
      </button>
    </div>
  </div>
  <div class="results-actions">
    {#if state.allMatchingSelected}
      <span class="selection-count">{state.allMatchingIds.length.toLocaleString()} selected</span>
      {#if state.allMatchingNotInCart > 0}
        <button class="cart-btn add" onclick={state.addAllMatchingToCart}>Add all to report</button>
      {/if}
      {#if state.allMatchingInCart > 0}
        <button class="cart-btn remove" onclick={state.removeAllMatchingFromCart}>
          Remove {state.allMatchingInCart.toLocaleString()} from report
        </button>
      {/if}
      <button class="cart-btn text" onclick={state.clearAllMatchingSelection}>Cancel</button>
    {:else if state.selectedRows.length > 0}
      <span class="selection-count">{state.selectedRows.length} selected</span>
      {#if state.allPageSelected && state.totalCount > state.results.length}
        <button class="cart-btn secondary" onclick={state.selectAllMatching}>
          Select all {state.totalCount.toLocaleString()} matching
        </button>
      {/if}
      {#if state.selectedNotInCart > 0}
        <button class="cart-btn add" onclick={state.addSelectedToCart}>Add to report</button>
      {/if}
      {#if state.selectedInCart > 0}
        <button class="cart-btn remove" onclick={state.removeSelectedFromCart}
          >Remove from report</button
        >
      {/if}
    {:else if state.results.length > 0 && !state.loading}
      <span class="selection-hint">Select rows or:</span>
      <button
        class="cart-btn secondary"
        onclick={state.addPageToCart}
        disabled={state.pageInCart === state.results.length}
      >
        Add this page ({state.results.length - state.pageInCart} new)
      </button>
      {#if state.pageInCart > 0}
        <button class="cart-btn text remove" onclick={state.removePageFromCart}>
          Remove {state.pageInCart} from report
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .results-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }

  .results-header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .results-title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .results-header h1 {
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
  }

  .results-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .result-count {
    font-family: var(--font-family-data);
    font-weight: 700;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .results-export-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .export-label {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .results-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    flex-wrap: wrap;
    min-height: 32px;
  }

  .selection-count {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-black);
    background: var(--gem-orange-10);
    padding: var(--space-1) var(--space-2);
    border-radius: 4px;
  }

  .selection-hint {
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--color-text-secondary);
  }

  .cart-btn {
    padding: 6px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 700;
    background: transparent;
    color: var(--color-black);
    border: 2px solid var(--color-gray-300);
    border-radius: 4px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .cart-btn:hover:not(:disabled) {
    border-color: var(--color-black);
  }

  .cart-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cart-btn.add {
    background: var(--color-black);
    color: var(--color-white);
    border-color: var(--color-black);
  }

  .cart-btn.add:hover {
    background: var(--color-gray-800);
  }

  .cart-btn.secondary {
    background: transparent;
    color: var(--color-black);
  }

  .cart-btn.secondary:hover:not(:disabled) {
    background: var(--color-gray-100);
  }

  .cart-btn.text {
    background: transparent;
    border-color: transparent;
    padding: 5px var(--space-2);
  }

  .cart-btn.text:hover {
    text-decoration: underline;
    border-color: transparent;
  }

  .cart-btn.remove {
    color: var(--color-error);
    border-color: var(--color-error);
    background: transparent;
  }

  .cart-btn.remove:hover {
    background: var(--color-error-bg);
  }

  .cart-btn.text.remove {
    border-color: transparent;
  }

  .export-btn {
    padding: 6px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 700;
    background: var(--color-black);
    color: var(--color-white);
    border: 2px solid var(--color-black);
    border-radius: 4px;
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .export-btn:hover:not(:disabled) {
    background: var(--color-gray-800);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .loading-text {
    font-family: var(--font-family-data);
    font-weight: 700;
    color: var(--color-text-tertiary);
  }
</style>
