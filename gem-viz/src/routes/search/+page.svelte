<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { listAssets, getOwnershipGraph } from '$lib/ownership-api';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  const _initSearchType = 'assets';
  const _initQuery = $page.url.searchParams.get('q') || '';
  let searchType = $state(_initSearchType);
  let query = $state(_initQuery);

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

  const modes = [
    { id: 'assets', label: 'Assets', placeholder: 'Search assets...' },
  ];

  // Debounce timer
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
    goto(`${link('search')}${qs ? `?${qs}` : ''}`, { replaceState: true, keepFocus: true });
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
    searchType = mode || 'assets';
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

    try {
      const graph = await getOwnershipGraph({
        root: item.id,
        direction: 'up',
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

  // Run initial search if URL has query params
  if (_initQuery) {
    doSearch(_initQuery, _initSearchType);
  }
</script>

<svelte:head>
  <title>Search — Global Energy Monitor</title>
  <meta
    name="description"
    content="Search for assets and view their ownership trees."
  />
  <SeoMeta
    title="Search — Global Energy Monitor"
    description="Search for assets and view their ownership trees."
  />
</svelte:head>

<div class="page-container">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'Search' }]}
    title="Ownership Search"
    lead="Search for assets and view their ownership structure."
  />

  <section class="search-section">
    <AssetSearchBar
      bind:value={query}
      bind:activeMode={searchType}
      {modes}
      label="Search assets"
      placeholder="Search by name..."
      showButton={false}
      onSearch={handleSearch}
      onClear={handleClear}
    />
  </section>

  {#if searchError}
    <p class="error">{searchError}</p>
  {/if}

  {#if searching}
    <p class="status">Searching...</p>
  {/if}

  {#if !searching && hasSearched && results.length === 0}
    <p class="status">No results found for "{query}"</p>
  {/if}

  {#if results.length > 0}
    <section class="results">
      <h2 class="results-count">{results.length} result{results.length !== 1 ? 's' : ''}</h2>
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
              >
                Asset
              </span>
              <span class="result-name">{item.name}</span>
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
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if selected}
    <section class="tree-section">
      <div class="tree-header">
        <h2>{selected.name}</h2>
        <a href={assetLink(selected.id)} class="detail-link">
          View full details →
        </a>
      </div>

      {#if loadingTree}
        <p class="status">Loading ownership tree...</p>
      {:else if treeError}
        <p class="error">{treeError}</p>
      {:else if treeNodes.length > 0}
        <div class="tree-container">
          <OwnershipTreeGraph
            nodes={treeNodes}
            edges={treeEdges}
            paths={treePaths}
            rootId={treeRootId}
          />
        </div>
      {:else}
        <p class="status">No ownership data available for this asset.</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .search-section {
    margin-bottom: 1.5rem;
  }

  .error {
    color: #c00;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }

  .status {
    color: #666;
    font-size: 0.85rem;
    margin: 0.5rem 0;
  }

  .results {
    margin-bottom: 1.5rem;
  }

  .results-count {
    font-size: 0.8rem;
    color: #888;
    font-weight: normal;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .results-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    overflow: hidden;
  }

  .results-list li + li {
    border-top: 1px solid #eee;
  }

  .result-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 0.8rem;
    background: white;
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: 0.9rem;
    transition: background 0.1s;
  }

  .result-item:hover {
    background: #f5f7fa;
  }

  .result-item.selected {
    background: #eef3ff;
    border-left: 3px solid #3b82f6;
  }

  .result-kind {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.15rem 0.4rem;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .result-kind.asset {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .result-name {
    font-weight: 500;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .result-status {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: #666;
    flex-shrink: 0;
  }

  .result-type {
    font-size: 0.7rem;
    color: #888;
    flex-shrink: 0;
  }

  .result-country {
    font-size: 0.75rem;
    color: #999;
    flex-shrink: 0;
  }

  .tree-section {
    border-top: 2px solid #e0e0e0;
    padding-top: 1.5rem;
  }

  .tree-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .tree-header h2 {
    font-size: 1.2rem;
    margin: 0;
  }

  .detail-link {
    font-size: 0.85rem;
    color: #3b82f6;
    text-decoration: none;
    flex-shrink: 0;
  }

  .detail-link:hover {
    text-decoration: underline;
  }

  .tree-container {
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    padding: 1rem;
    background: #fafbfc;
    min-height: 200px;
  }
</style>
