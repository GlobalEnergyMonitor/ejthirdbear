<script>
  // ============================================================================
  // ASSET LIST PAGE
  // Shows all assets in a DataTable with filtering, sorting, pagination
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { listAssets } from '$lib/ownership-api';
  import DataTable from '$lib/components/DataTable.svelte';

  // --- STATE ---
  let loading = $state(true);
  /** @type {string | null} */
  let error = $state(null);
  let assets = $state([]);

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

  // --- HANDLERS ---
  function handleRowClick(row) {
    if (row?.id) goto(assetLink(row.id));
  }

  // --- DATA FETCHING ---
  onMount(async () => {
    try {
      loading = true;
      error = null;

      const pageSize = 1000;
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
      console.error('Asset list load error:', err);
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
  <title>All Assets — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href={link('index')} class="back-link">Back to Overview</a>
    <span class="title">All Assets</span>
    <span class="count">
      {#if loading}Loading…{:else}{assets.length.toLocaleString()} assets{/if}
    </span>
  </header>

  {#if loading}
    <p class="no-data">Fetching assets from Ownership API…</p>
  {:else if error}
    <p class="no-data">{error}</p>
  {:else if assets.length > 0}
    <DataTable
      {columns}
      data={assets}
      pageSize={100}
      showGlobalSearch={true}
      showColumnFilters={true}
      showPagination={true}
      showExport={true}
      showColumnToggle={true}
      stickyHeader={true}
      striped={true}
      onRowClick={handleRowClick}
    />
  {:else}
    <p class="no-data">No assets found</p>
  {/if}
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  main {
    width: 100%;
    padding: 20px 40px;
  }

  /* Header */
  header {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--color-gray-200);
    padding-bottom: 18px;
    margin-bottom: 20px;
  }
  .back-link {
    color: var(--color-black);
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .back-link:hover {
    text-decoration: none;
  }
  .title {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }
  .count {
    font-size: 10px;
    color: var(--color-gray-600);
    margin-left: auto;
    padding: 6px 10px;
    border: 1px solid var(--color-gray-200);
    border-radius: 999px;
    background: var(--color-gray-50);
  }

  /* Empty States */
  .no-data {
    padding: 60px 20px;
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: 14px;
    font-style: italic;
  }

  /* Responsive */
  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
  }
</style>
