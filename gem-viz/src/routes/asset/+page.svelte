<script>
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import DataTable from '$lib/components/DataTable.svelte';
  export let data;

  const {
    assets,
    tableName,
    idCol,
    nameCol,
    statusCol,
    ownerCol,
    countryCol,
    ownerIdCol,
    unitIdCol,
    useCompositeId,
  } = data;

  // Build columns config dynamically based on what's available
  const columns = [];

  if (nameCol) {
    columns.push({
      key: nameCol,
      label: 'Name',
      sortable: true,
      filterable: true,
      width: '250px',
    });
  }

  columns.push({
    key: idCol,
    label: 'ID',
    sortable: true,
    filterable: true,
    width: '120px',
  });

  if (statusCol) {
    columns.push({
      key: statusCol,
      label: 'Status',
      sortable: true,
      filterable: true,
      width: '120px',
    });
  }

  if (ownerCol) {
    columns.push({
      key: ownerCol,
      label: 'Owner',
      sortable: true,
      filterable: true,
      width: '200px',
    });
  }

  if (countryCol) {
    columns.push({
      key: countryCol,
      label: 'Country',
      sortable: true,
      filterable: true,
      width: '150px',
    });
  }

  function handleRowClick(row) {
    let id = row[idCol];

    // Ownership tables need composite IDs to match prerendered pages
    if (useCompositeId && ownerIdCol && unitIdCol && row[ownerIdCol] && row[unitIdCol]) {
      id = `${row[ownerIdCol]}_${row[unitIdCol]}`;
    }

    goto(`${base}/asset/${id}/index.html`);
  }
</script>

<svelte:head>
  <title>All Assets — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Back to Overview</a>
    <span class="title">All Assets</span>
    <span class="count">{assets.length.toLocaleString()} assets</span>
  </header>

  {#if assets.length > 0}
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

<style>
  main {
    width: 100%;
    max-width: 1600px;
    margin: 0 auto;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 18px;
    margin-bottom: 20px;
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
  }

  .back-link {
    color: #000;
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
    color: #555;
    margin-left: auto;
    padding: 6px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 999px;
    background: #f7f7f7;
  }

  .no-data {
    padding: 60px 20px;
    text-align: center;
    color: #999;
    font-size: 14px;
    font-style: italic;
  }

  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
  }
</style>
