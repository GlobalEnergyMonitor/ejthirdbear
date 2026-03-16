<script>
  /**
   * GEM ControlChain
   * Search for assets or entities and view their ownership tree.
   * A polished, demo-ready interface for ownership structure exploration.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink, entityLink } from '$lib/links';
  import { listAssets, listEntities, getOwnershipGraph } from '$lib/ownership-api';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import { getTrackerColor, getStatusColor } from '$lib/design-tokens';

  let searchType = $state(/** @type {string} */ ($page.url.searchParams.get('type') || 'all'));
  let query = $state($page.url.searchParams.get('q') || '');

  let results = $state(/** @type {any[]} */ ([]));
  let searching = $state(false);
  let searchError = $state('');
  let hasSearched = $state(false);

  // Selected item + ownership tree
  let selected = $state(null);
  let treeNodes = $state([]);
  let treeEdges = $state([]);
  let treePaths = $state({});
  let treeRootId = $state('');
  let loadingTree = $state(false);
  let treeError = $state('');
  let treeDirection = $state('auto');

  const modes = [
    { id: 'all', label: 'All', placeholder: 'Search by name, ID, owner, or country...' },
    { id: 'assets', label: 'Assets', placeholder: 'Search assets by name...' },
    { id: 'entities', label: 'Entities', placeholder: 'Search entities by name...' },
  ];

  let debounceTimer;

  // Search-as-you-type: react to query changes from the bound input
  $effect(() => {
    const q = query;
    const type = searchType;
    clearTimeout(debounceTimer);
    if (!q || q.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }
    debounceTimer = setTimeout(() => {
      doSearch(q, type);
      updateUrl(q, type);
    }, 300);
  });

  function updateUrl(q, type) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type && type !== 'all') params.set('type', type);
    const qs = params.toString();
    goto(`${link('controlchain')}${qs ? `?${qs}` : ''}`, { replaceState: true, keepFocus: true });
  }

  async function doSearch(q, type) {
    if (!q || q.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }

    searching = true;
    searchError = '';
    hasSearched = true;

    try {
      const merged = [];

      if (type === 'all' || type === 'assets') {
        const assetRes = await listAssets({ q, limit: 20 });
        for (const a of assetRes.results) {
          merged.push({
            id: a.id,
            name: a.name,
            kind: 'asset',
            country: a.country,
            status: a.status,
            asset_type: a.facilityType,
          });
        }
      }

      if (type === 'all' || type === 'entities') {
        const entityRes = await listEntities({ q, limit: 20 });
        for (const e of entityRes.results) {
          const rec = /** @type {any} */ (e);
          merged.push({
            id: rec.id || rec.entity_id,
            name: rec.name || rec.Name,
            kind: 'entity',
            country: rec.country || rec.hq_country,
          });
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
    updateUrl(q, searchType);

    if (!q || q.length < 2) {
      results = [];
      hasSearched = false;
      return;
    }

    debounceTimer = setTimeout(() => doSearch(q, searchType), 200);
  }

  function handleClear() {
    query = '';
    results = [];
    hasSearched = false;
    selected = null;
    treeNodes = [];
    treeEdges = [];
    updateUrl('', searchType);
  }

  async function selectResult(item) {
    selected = item;
    loadingTree = true;
    treeError = '';
    treeNodes = [];
    treeEdges = [];
    treePaths = {};

    // Assets: look up (who owns this?), Entities: look down (what do they own?)
    const direction = item.kind === 'asset' ? 'up' : 'down';
    treeDirection = direction;

    try {
      const graph = await getOwnershipGraph({
        root: item.id,
        direction,
        max_depth: 5,
      });

      treeNodes = graph.nodes || [];
      treeEdges = graph.edges || [];
      treePaths = graph.paths || {};
      treeRootId = graph.root?.id || item.id;
    } catch (err) {
      treeError = err.message || 'Failed to load ownership tree';
    } finally {
      loadingTree = false;
    }
  }

  // Featured examples for empty state
  const examples = [
    { name: 'Eskom', kind: 'entity', q: 'Eskom' },
    { name: 'Adani Power', kind: 'entity', q: 'Adani Power' },
    { name: 'Medupi', kind: 'asset', q: 'Medupi' },
    { name: 'NTPC', kind: 'entity', q: 'NTPC' },
  ];

  function searchExample(ex) {
    query = ex.q;
    searchType = ex.kind === 'asset' ? 'assets' : 'entities';
    doSearch(query, searchType);
    updateUrl(query, searchType);
  }

  // Run initial search if URL has query params
  if (query) {
    doSearch(query, searchType);
  }
</script>

<svelte:head>
  <title>GEM ControlChain — Global Energy Monitor</title>
  <SeoMeta
    title="GEM ControlChain — Global Energy Monitor"
    description="Explore ownership structures for energy assets worldwide. Search for any asset or entity to see who controls it."
  />
</svelte:head>

<div class="controlchain-page">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'ControlChain' }]}
    title="GEM ControlChain"
    lead="Explore ownership structures for energy assets worldwide. Search for any asset or entity to trace who controls it."
  />

  <!-- Search -->
  <section class="search-section">
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
  </section>

  <!-- Empty state: show examples -->
  {#if !hasSearched && !selected}
    <section class="empty-state">
      <p class="empty-prompt">Try searching for an entity or asset, or explore an example:</p>
      <div class="examples">
        {#each examples as ex}
          <button class="example-chip" onclick={() => searchExample(ex)}>
            <span class="example-kind" class:asset={ex.kind === 'asset'} class:entity={ex.kind === 'entity'}>
              {ex.kind}
            </span>
            {ex.name}
          </button>
        {/each}
      </div>
    </section>
  {/if}

  {#if searchError}
    <p class="error-msg">{searchError}</p>
  {/if}

  {#if searching}
    <div class="search-status">
      <div class="search-spinner"></div>
      <span>Searching...</span>
    </div>
  {/if}

  <!-- Results + Tree in two-column layout when selected -->
  <div class="main-content" class:has-selection={selected}>
    <!-- Results list -->
    {#if results.length > 0}
      <section class="results-panel">
        <div class="results-header">
          <span class="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</span>
          {#if selected}
            <button class="clear-selection" onclick={() => { selected = null; treeNodes = []; }}>
              Clear selection
            </button>
          {/if}
        </div>
        <ul class="results-list">
          {#each results as item (item.id)}
            <li>
              <button
                class="result-item"
                class:selected={selected?.id === item.id}
                onclick={() => selectResult(item)}
              >
                <span
                  class="result-kind"
                  class:asset={item.kind === 'asset'}
                  class:entity={item.kind === 'entity'}
                >
                  {item.kind === 'asset' ? 'Asset' : 'Entity'}
                </span>
                <div class="result-info">
                  <span class="result-name">{item.name}</span>
                  <span class="result-meta">
                    {#if item.status}
                      <span class="result-status">
                        <StatusIcon status={item.status} size={8} />
                        {item.status}
                      </span>
                    {/if}
                    {#if item.asset_type}
                      <span class="result-type">{item.asset_type}</span>
                    {/if}
                    {#if item.country}
                      <span class="result-country">{item.country}</span>
                    {/if}
                  </span>
                </div>
                <svg class="result-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {:else if !searching && hasSearched}
      <p class="no-results">No results found for "{query}"</p>
    {/if}

    <!-- Ownership Tree -->
    {#if selected}
      <section class="tree-panel">
        <div class="tree-header">
          <div class="tree-title-row">
            <h2>{selected.name}</h2>
            <span class="tree-direction">
              {treeDirection === 'up' ? 'Who owns this?' : 'What does this entity own?'}
            </span>
          </div>
          <a
            href={selected.kind === 'asset' ? assetLink(selected.id) : entityLink(selected.id)}
            class="detail-link"
          >
            View full details
          </a>
        </div>

        {#if loadingTree}
          <div class="tree-loading">
            <div class="tree-spinner"></div>
            <span>Loading ownership tree...</span>
          </div>
        {:else if treeError}
          <div class="tree-error">{treeError}</div>
        {:else if treeNodes.length > 0}
          <div class="tree-container">
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
          <div class="tree-empty">No ownership data available for this {selected.kind}.</div>
        {/if}
      </section>
    {/if}
  </div>
</div>

<style>
  .controlchain-page {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  /* Search */
  .search-section {
    margin-bottom: var(--space-5);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: var(--space-10) var(--space-5);
  }

  .empty-prompt {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }

  .examples {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    flex-wrap: wrap;
  }

  .example-chip {
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

  .example-chip:hover {
    border-color: var(--gem-navy, #1d4961);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .example-kind {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .example-kind.asset {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .example-kind.entity {
    background: #e3f2fd;
    color: #1565c0;
  }

  /* Error / status */
  .error-msg {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    margin: var(--space-2) 0;
  }

  .search-status, .tree-loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-4) 0;
  }

  .search-spinner, .tree-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--gem-navy, #1d4961);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .no-results {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--space-8) 0;
  }

  /* Main content layout */
  .main-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .main-content.has-selection {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--space-5);
    align-items: start;
  }

  /* Results panel */
  .results-panel {
    min-width: 0;
  }

  .main-content.has-selection .results-panel {
    order: 2;
  }

  .main-content.has-selection .tree-panel {
    order: 1;
  }

  .results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }

  .results-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .clear-selection {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .results-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    max-height: 600px;
    overflow-y: auto;
  }

  .main-content.has-selection .results-list {
    max-height: 70vh;
  }

  .results-list li + li {
    border-top: 1px solid var(--color-border-light, #eee);
  }

  .result-item {
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

  .result-item:hover {
    background: var(--color-bg-secondary);
  }

  .result-item.selected {
    background: rgba(29, 73, 97, 0.06);
    border-left: 3px solid var(--gem-navy, #1d4961);
  }

  .result-kind {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .result-kind.asset {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .result-kind.entity {
    background: #e3f2fd;
    color: #1565c0;
  }

  .result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .result-name {
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .result-status {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .result-type, .result-country {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  .result-arrow {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    transition: transform 0.1s;
  }

  .result-item:hover .result-arrow {
    transform: translateX(2px);
    color: var(--gem-navy, #1d4961);
  }

  /* Tree panel */
  .tree-panel {
    min-width: 0;
  }

  .tree-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .tree-title-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .tree-title-row h2 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary);
    text-transform: none;
    letter-spacing: normal;
  }

  .tree-direction {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary);
  }

  .detail-link {
    font-size: var(--font-size-sm);
    color: var(--gem-navy, #1d4961);
    text-decoration: none;
    flex-shrink: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all 0.15s ease;
  }

  .detail-link:hover {
    background: rgba(29, 73, 97, 0.05);
    border-color: var(--gem-navy, #1d4961);
  }

  .tree-container {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    min-height: 400px;
    overflow: hidden;
  }

  .tree-error {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    padding: var(--space-6);
    text-align: center;
  }

  .tree-empty {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-8);
    text-align: center;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .main-content.has-selection {
      grid-template-columns: 1fr;
    }

    .main-content.has-selection .tree-panel {
      order: 2;
    }

    .main-content.has-selection .results-panel {
      order: 1;
    }

    .results-list {
      max-height: 300px;
    }
  }
</style>
