<script>
  // ============================================================================
  // ASSET LIST PAGE
  // Shows all assets in a DataTable with filtering, sorting, pagination
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { listAssets } from '$lib/ownership-api';
  import DataTable from '$lib/components/DataTable.svelte';
  import AssetSearchBar from '$lib/components/AssetSearchBar.svelte';

  // --- STATE ---
  let loading = $state(true);
  /** @type {string | null} */
  let error = $state(null);
  let assets = $state([]);
  let searchQuery = $state('');
  let searchMode = $state('asset');
  let syncedQuery = $state('');

  // --- DATA TRANSFORMS ---
  const columns = $derived([
    { key: 'name', label: 'Name', sortable: true, filterable: true, width: '260px' },
    { key: 'id', label: 'ID', sortable: true, filterable: true, width: '130px' },
    { key: 'status', label: 'Status', sortable: true, filterable: true, width: '120px' },
    {
      key: 'facilityType',
      label: 'Facility Type',
      sortable: true,
      filterable: true,
      width: '150px',
    },
    { key: 'ownerName', label: 'Owner', sortable: true, filterable: true, width: '220px' },
    { key: 'country', label: 'Country', sortable: true, filterable: true, width: '160px' },
    {
      key: 'capacity',
      label: 'Capacity',
      sortable: true,
      type: /** @type {'number'} */ ('number'),
      width: '120px',
    },
  ]);

  const filteredAssets = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return assets;

    return assets.filter((asset) =>
      [asset.id, asset.name, asset.ownerName, asset.country, asset.status, asset.facilityType].some(
        (value) => value != null && String(value).toLowerCase().includes(query)
      )
    );
  });

  $effect(() => {
    const nextQuery = $page.url.searchParams.get('q') || '';
    if (nextQuery !== syncedQuery) {
      syncedQuery = nextQuery;
      searchQuery = nextQuery;
    }
  });

  // --- HANDLERS ---
  function handleRowClick(row) {
    if (row?.id) goto(assetLink(row.id));
  }

  function updateSearchInUrl(query) {
    const params = new URLSearchParams($page.url.searchParams);
    const trimmed = query.trim();
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');

    const queryString = params.toString();
    const href = `${link('asset')}${queryString ? `?${queryString}` : ''}`;
    goto(href, { replaceState: true, noScroll: true, keepFocus: true });
  }

  function handleSearch(query) {
    searchQuery = query;
    updateSearchInUrl(query);
  }

  // --- DATA FETCHING ---
  onMount(async () => {
    try {
      loading = true;
      error = null;

      const pageSize = 500;
      let offset = 0;
      let hasMore = true;
      const results = [];

      while (hasMore && results.length < 10000) {
        const page = await listAssets({ limit: pageSize, offset });
        results.push(...page.results);
        offset += pageSize;
        hasMore = page.results.length === pageSize;
      }

      assets = results;
    } catch (err) {
      error = err?.message || 'Failed to load assets';
    } finally {
      loading = false;
    }
  });
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>Browse Assets — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse all energy assets in the Global Energy Monitor database including coal plants, gas plants, steel facilities, and more."
  />
</svelte:head>

<div class="page">
  <header>
    <a href={link('index')} class="back-link">Back to Overview</a>
    <span class="title">All Assets</span>
    <span class="count">
      {#if loading}
        Loading…
      {:else if searchQuery.trim()}
        {filteredAssets.length.toLocaleString()} of {assets.length.toLocaleString()} assets
      {:else}
        {assets.length.toLocaleString()} assets
      {/if}
    </span>
  </header>

  {#if loading}
    <p class="no-data">Fetching assets from Ownership API…</p>
  {:else if error}
    <p class="no-data">{error}</p>
  {:else if assets.length > 0}
    <div class="search-toolbar">
      <AssetSearchBar
        bind:value={searchQuery}
        bind:activeMode={searchMode}
        modes={[
          {
            id: 'asset',
            label: 'Assets',
            placeholder: 'Search by asset name, ID, owner, country, or status',
          },
        ]}
        buttonLabel="Find"
        helperText="Live filtering is instant. Press Enter to save this query in the URL for sharing or CMS embeds."
        onSearch={handleSearch}
      />
    </div>

    {#if filteredAssets.length > 0}
      <DataTable
        {columns}
        data={filteredAssets}
        pageSize={100}
        showGlobalSearch={false}
        showColumnFilters={true}
        showPagination={true}
        showExport={true}
        showColumnToggle={true}
        stickyHeader={true}
        striped={true}
        onRowClick={handleRowClick}
      />
    {:else}
      <p class="no-data">No assets match this search query.</p>
    {/if}
  {:else}
    <p class="no-data">No assets found</p>
  {/if}
</div>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  .page {
    width: 100%;
    padding: var(--space-5) var(--space-10);
  }

  /* Header */
  header {
    display: flex;
    gap: var(--space-4);
    align-items: center;
    flex-wrap: wrap;
    border-bottom: var(--border-width) solid var(--color-gray-200);
    padding-bottom: var(--space-5);
    margin-bottom: var(--space-5);
  }
  .back-link {
    color: var(--color-black);
    text-decoration: underline;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
  }
  .back-link:hover {
    text-decoration: none;
  }
  .title {
    font-size: var(--font-size-xl);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
  }
  .count {
    font-size: var(--font-size-base);
    color: var(--color-gray-600);
    margin-left: auto;
    padding: var(--space-1) var(--space-3);
    border: var(--border-width) solid var(--color-gray-200);
    border-radius: var(--radius-full);
    background: var(--color-gray-50);
  }

  .search-toolbar {
    margin-bottom: var(--space-4);
  }

  /* Empty States */
  .no-data {
    padding: var(--space-16) var(--space-5);
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-lg);
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page {
      padding: var(--space-4);
    }
  }
</style>
