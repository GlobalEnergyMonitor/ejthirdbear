<script>
  /**
   * ControlChainApp — shared search + results + modal logic.
   * Used by both /controlchain and /embed/controlchain.
   *
   * Props:
   *   initialQuery  - Starting search query
   *   initialType   - Starting search type: "all" | "assets" | "entities"
   *   onStateChange - Called with (q, type) whenever search state changes
   *                   (caller uses this to update URL params or hash)
   */
  import { listAssets, listEntities, getOwnershipGraph } from '$lib/ownership-api';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';

  /** @type {{ initialQuery?: string, initialType?: string, onStateChange?: (q: string, type: string) => void }} */
  let { initialQuery = '', initialType = 'all', onStateChange } = $props();

  const modes = [
    { id: 'all',      label: 'All',      placeholder: 'Search by name, ID, owner, or country...' },
    { id: 'assets',   label: 'Assets',   placeholder: 'Search assets by name...' },
    { id: 'entities', label: 'Entities', placeholder: 'Search entities by name...' },
  ];

  const examples = [
    { name: 'Eskom',       kind: 'entity', q: 'Eskom' },
    { name: 'Adani Power', kind: 'entity', q: 'Adani Power' },
    { name: 'Medupi',      kind: 'asset',  q: 'Medupi' },
    { name: 'NTPC',        kind: 'entity', q: 'NTPC' },
  ];

  let searchType  = $state(initialType);
  let query       = $state(initialQuery);

  let results     = $state(/** @type {any[]} */ ([]));
  let searching   = $state(false);
  let searchError = $state('');
  let hasSearched = $state(false);

  let selected      = $state(null);
  let treeNodes     = $state([]);
  let treeEdges     = $state([]);
  let treePaths     = $state({});
  let treeRootId    = $state('');
  let loadingTree   = $state(false);
  let treeError     = $state('');
  let treeDirection = $state('auto');
  let modalOpen     = $state(false);

  let debounceTimer;

  $effect(() => {
    const q    = query;
    const type = searchType;
    clearTimeout(debounceTimer);
    if (!q || q.length < 2) { results = []; hasSearched = false; return; }
    debounceTimer = setTimeout(() => {
      doSearch(q, type);
      onStateChange?.(q, type);
    }, 300);
  });

  async function doSearch(q, type) {
    if (!q || q.length < 2) { results = []; hasSearched = false; return; }
    searching = true;
    searchError = '';
    hasSearched = true;
    try {
      const merged = [];
      if (type === 'all' || type === 'assets') {
        const r = await listAssets({ q, limit: 20 });
        for (const a of r.results) {
          merged.push({ id: a.id, name: a.name, kind: 'asset', country: a.country, status: a.status, asset_type: a.facilityType });
        }
      }
      if (type === 'all' || type === 'entities') {
        const r = await listEntities({ q, limit: 20 });
        for (const e of r.results) {
          const rec = /** @type {any} */ (e);
          merged.push({ id: rec.id || rec.entity_id, name: rec.name || rec.Name, kind: 'entity', country: rec.country || rec.hq_country });
        }
      }
      results = merged;
    } catch (err) {
      searchError = err.message || 'Search failed';
      results = [];
    } finally {
      searching = false;
    }
  }

  function handleSearch(q, mode) {
    query = q;
    searchType = mode || 'all';
    clearTimeout(debounceTimer);
    onStateChange?.(q, searchType);
    if (!q || q.length < 2) { results = []; hasSearched = false; return; }
    debounceTimer = setTimeout(() => doSearch(q, searchType), 200);
  }

  function handleClear() {
    query = '';
    results = [];
    hasSearched = false;
    selected = null;
    modalOpen = false;
    treeNodes = [];
    treeEdges = [];
    onStateChange?.('', searchType);
  }

  function closeModal() {
    modalOpen = false;
    selected = null;
    treeNodes = [];
    treeEdges = [];
  }

  async function selectResult(item) {
    selected = item;
    modalOpen = true;
    loadingTree = true;
    treeError = '';
    treeNodes = [];
    treeEdges = [];
    treePaths = {};
    const direction = item.kind === 'asset' ? 'up' : 'down';
    treeDirection = direction;
    try {
      const graph = await getOwnershipGraph({ root: item.id, direction, max_depth: 5 });
      treeNodes  = graph.nodes  || [];
      treeEdges  = graph.edges  || [];
      treePaths  = graph.paths  || {};
      treeRootId = graph.root?.id || item.id;
    } catch (err) {
      treeError = err.message || 'Failed to load ownership tree';
    } finally {
      loadingTree = false;
    }
  }

  function searchExample(ex) {
    query = ex.q;
    searchType = ex.kind === 'asset' ? 'assets' : 'entities';
    doSearch(query, searchType);
    onStateChange?.(query, searchType);
  }

  // Run initial search if a query was provided
  if (initialQuery && initialQuery.length >= 2) {
    doSearch(initialQuery, initialType);
  }
</script>

<div class="cc-app">
  <div class="cc-search">
    <AssetSearchBar
      bind:value={query}
      bind:activeMode={searchType}
      {modes}
      label="Search assets and entities"
      placeholder="Search by name..."
      showButton={false}
      onSearch={handleSearch}
      onClear={handleClear}
    />
  </div>

  {#if !hasSearched && !selected}
    <div class="cc-empty">
      <p class="cc-empty-prompt">Try searching for an entity or asset, or explore an example:</p>
      <div class="cc-examples">
        {#each examples as ex}
          <button class="cc-chip" onclick={() => searchExample(ex)}>
            <span class="cc-kind" class:asset={ex.kind === 'asset'} class:entity={ex.kind === 'entity'}>{ex.kind}</span>
            {ex.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if searchError}
    <p class="cc-error">{searchError}</p>
  {/if}

  {#if searching}
    <div class="cc-status">
      <div class="cc-spinner"></div>
      <span>Searching...</span>
    </div>
  {/if}

  {#if results.length > 0}
    <div class="cc-results-panel">
      <div class="cc-results-header">
        <span class="cc-results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
      </div>
      <ul class="cc-results-list">
        {#each results as item (item.id)}
          <li>
            <button
              class="cc-result"
              class:selected={selected?.id === item.id}
              onclick={() => selectResult(item)}
            >
              <span class="cc-result-kind" class:asset={item.kind === 'asset'} class:entity={item.kind === 'entity'}>
                {item.kind === 'asset' ? 'Asset' : 'Entity'}
              </span>
              <div class="cc-result-info">
                <span class="cc-result-name">{item.name}</span>
                <span class="cc-result-meta">
                  {#if item.status}
                    <span class="cc-result-status">
                      <StatusIcon status={item.status} size={8} />
                      {item.status}
                    </span>
                  {/if}
                  {#if item.asset_type}<span class="cc-result-type">{item.asset_type}</span>{/if}
                  {#if item.country}<span class="cc-result-country">{item.country}</span>{/if}
                </span>
              </div>
              <svg class="cc-result-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {:else if !searching && hasSearched}
    <p class="cc-no-results">No results found for "{query}"</p>
  {/if}
</div>

<!-- Modal — position:fixed covers the viewport (page or iframe) -->
{#if modalOpen && selected}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="cc-modal-backdrop" onclick={closeModal}>
    <div class="cc-modal" onclick={(e) => e.stopPropagation()}>
      <div class="cc-modal-header">
        <div>
          <h2>{selected.name}</h2>
          <span class="cc-modal-sub">{treeDirection === 'up' ? 'WHO OWNS THIS?' : 'WHAT DOES THIS OWN?'}</span>
        </div>
        <button class="cc-modal-close" onclick={closeModal} aria-label="Close">✕</button>
      </div>

      <div class="cc-modal-body">
        {#if loadingTree}
          <div class="cc-tree-loading">
            <div class="cc-spinner"></div>
            <span>Loading control chain...</span>
          </div>
        {:else if treeError}
          <div class="cc-tree-error">{treeError}</div>
        {:else if treeNodes.length > 0}
          <div class="cc-tree-wrap">
            <OwnershipTreeGraph
              nodes={treeNodes}
              edges={treeEdges}
              paths={treePaths}
              rootId={treeRootId}
              direction={treeDirection === 'up' ? 'downstream' : 'upstream'}
              fullWidth={true}
            />
          </div>
        {:else}
          <div class="cc-tree-empty">No ownership data available for this {selected.kind}.</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .cc-app {
    width: 100%;
    font-family: var(--font-family-sans);
  }

  .cc-search {
    margin-bottom: var(--space-5);
  }

  /* Empty / examples */
  .cc-empty {
    text-align: center;
    padding: var(--space-10) var(--space-5);
  }
  .cc-empty-prompt {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .cc-examples {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    flex-wrap: wrap;
  }
  .cc-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-bg-primary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cc-chip:hover {
    border-color: var(--gem-navy, #1d4961);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }
  .cc-kind {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .cc-kind.asset   { background: #e8f5e9; color: #2e7d32; }
  .cc-kind.entity  { background: #e3f2fd; color: #1565c0; }

  /* Error / status */
  .cc-error {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    margin: var(--space-2) 0;
  }
  .cc-status, .cc-tree-loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-4) 0;
  }
  .cc-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--gem-navy, #1d4961);
    border-radius: 50%;
    animation: cc-spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes cc-spin { to { transform: rotate(360deg); } }

  .cc-no-results {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--space-8) 0;
  }

  /* Results */
  .cc-results-panel { min-width: 0; }
  .cc-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .cc-results-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .cc-results-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    max-height: 600px;
    overflow-y: auto;
  }
  .cc-results-list li + li {
    border-top: 1px solid var(--color-border-light, #eee);
  }
  .cc-result {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-primary);
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-sm);
    transition: background 0.1s;
  }
  .cc-result:hover { background: var(--color-bg-secondary); }
  .cc-result.selected {
    background: rgba(29, 73, 97, 0.06);
    border-left: 3px solid var(--gem-navy, #1d4961);
  }
  .cc-result-kind {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  .cc-result-kind.asset  { background: #e8f5e9; color: #2e7d32; }
  .cc-result-kind.entity { background: #e3f2fd; color: #1565c0; }
  .cc-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cc-result-name {
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cc-result-meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .cc-result-status {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  .cc-result-type, .cc-result-country {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }
  .cc-result-arrow {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    transition: transform 0.1s;
  }
  .cc-result:hover .cc-result-arrow {
    transform: translateX(2px);
    color: var(--gem-navy, #1d4961);
  }

  /* Modal */
  .cc-modal-backdrop {
    position: fixed;
    inset: 0;
    width: 100vw;
    max-width: none;
    background: rgba(0,0,0,0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5vh 5vw;
  }
  .cc-modal {
    background: var(--color-bg-primary);
    border-radius: var(--radius-lg, 8px);
    width: 90vw;
    max-width: 90vw;
    max-height: 90vh;
    min-height: 80vh;
    overflow: auto;
    box-shadow: 0 24px 64px rgba(0,0,0,0.2);
  }
  .cc-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-bg-primary);
    z-index: 1;
  }
  .cc-modal-header h2 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary);
    text-transform: none;
    letter-spacing: normal;
  }
  .cc-modal-sub {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary);
  }
  .cc-modal-close {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    line-height: 1;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .cc-modal-close:hover {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
  }

  /* Modal body padding so nothing hits edges */
  .cc-modal-body {
    padding: var(--space-4);
  }

  /* Tree inside modal: chart 70% | panel 30% */
  .cc-tree-wrap { width: 100%; min-width: 0; }

  .cc-tree-wrap :global(.ownership-tree),
  .cc-tree-wrap :global(.graph-area),
  .cc-tree-wrap :global(.graph-wrap) {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  .cc-tree-wrap :global(.container) {
    display: grid !important;
    grid-template-columns: 70% 30% !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .cc-tree-wrap :global(.graph-wrap) {
    max-height: 70vh !important;
    overflow: auto !important;
  }
  .cc-tree-wrap :global(.graph-wrap svg) {
    width: 100% !important;
    max-width: none !important;
    height: 70vh !important;
    max-height: 70vh !important;
  }
  .cc-tree-wrap :global(.panel) {
    height: 70vh !important;
    overflow-y: auto !important;
    border-left: 1px solid var(--color-border) !important;
    padding: var(--space-4) !important;
    box-sizing: border-box !important;
  }

  .cc-tree-error {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    padding: var(--space-6);
    text-align: center;
  }
  .cc-tree-empty {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-8);
    text-align: center;
  }
</style>
