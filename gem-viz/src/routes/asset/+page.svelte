<script>
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import motherduck from '$lib/motherduck-wasm';
  import { getTables } from '$lib/component-data/schema';
  import DataTable from '$lib/components/DataTable.svelte';

  // SQL helpers live at the top so each query is explicit
  const SCHEMA_SQL = (schema, table) => `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = '${schema}'
      AND table_name = '${table}'
    ORDER BY ordinal_position
  `;

  const LIST_SQL = (fullName, cols) => `
    SELECT ${cols.map((c) => `"${c}"`).join(', ')}
    FROM ${fullName}
    LIMIT 10000
  `;

  let loading = $state(true);
  let error = $state(null);

  let assets = $state([]);
  let tableName = $state('');
  let columnsAvailable = $state([]);

  let idCol = $state('');
  let nameCol = $state('');
  let statusCol = $state('');
  let ownerCol = $state('');
  let countryCol = $state('');
  let ownerIdCol = $state('');
  let unitIdCol = $state('');
  let useCompositeId = $state(false);

  const columns = $derived(() => {
    if (!idCol) return [];
    const cols = [];

    if (nameCol) {
      cols.push({
        key: nameCol,
        label: 'Name',
        sortable: true,
        filterable: true,
        width: '250px',
      });
    }

    cols.push({
      key: idCol,
      label: 'ID',
      sortable: true,
      filterable: true,
      width: '120px',
    });

    if (statusCol) {
      cols.push({
        key: statusCol,
        label: 'Status',
        sortable: true,
        filterable: true,
        width: '120px',
      });
    }

    if (ownerCol) {
      cols.push({
        key: ownerCol,
        label: 'Owner',
        sortable: true,
        filterable: true,
        width: '200px',
      });
    }

    if (countryCol) {
      cols.push({
        key: countryCol,
        label: 'Country',
        sortable: true,
        filterable: true,
        width: '150px',
      });
    }

    return cols;
  });

  onMount(async () => {
    try {
      loading = true;
      error = null;

      const { assetTable } = await getTables();
      tableName = assetTable;
      const [schemaName, rawTable] = assetTable.split('.');

      const schemaResult = await motherduck.query(SCHEMA_SQL(schemaName, rawTable));
      columnsAvailable = schemaResult.data?.map((c) => c.column_name) ?? [];

      countryCol = columnsAvailable.find(
        (c) => c.toLowerCase() === 'country' || c.toLowerCase() === 'country/area'
      );
      ownerCol = columnsAvailable.find((c) => c.toLowerCase() === 'owner');
      ownerIdCol = columnsAvailable.find((c) => {
        const lower = c.toLowerCase();
        return lower.includes('owner') && lower.includes('id');
      });
      unitIdCol = columnsAvailable.find((c) => c.toLowerCase() === 'gem unit id');
      useCompositeId = Boolean(ownerIdCol && unitIdCol);

      idCol =
        unitIdCol ||
        columnsAvailable.find((c) => {
          const lower = c.toLowerCase();
          return (
            lower === 'id' ||
            lower === 'wiki page' ||
            lower === 'project id' ||
            lower.includes('_id')
          );
        }) ||
        columnsAvailable[0] ||
        '';

      nameCol = columnsAvailable.find((c) => {
        const lower = c.toLowerCase();
        return (
          lower === 'mine' ||
          lower === 'plant' ||
          lower === 'project' ||
          lower === 'facility' ||
          lower === 'mine name' ||
          lower === 'plant name' ||
          lower === 'project name'
        );
      });

      statusCol = columnsAvailable.find((c) => c.toLowerCase() === 'status');

      const columnsToSelect = [idCol];
      if (nameCol) columnsToSelect.push(nameCol);
      if (statusCol) columnsToSelect.push(statusCol);
      if (ownerCol) columnsToSelect.push(ownerCol);
      if (countryCol) columnsToSelect.push(countryCol);
      if (ownerIdCol) columnsToSelect.push(ownerIdCol);
      if (unitIdCol) columnsToSelect.push(unitIdCol);

      const listResult = await motherduck.query(LIST_SQL(tableName, columnsToSelect));
      if (!listResult.success) {
        throw new Error(listResult.error || 'Failed to load assets');
      }

      assets = listResult.data ?? [];
    } catch (err) {
      console.error('Asset list load error:', err);
      error = err?.message || 'Failed to load assets';
    } finally {
      loading = false;
    }
  });

  function handleRowClick(row) {
    if (!idCol) return;

    let id = row[idCol];

    // Ownership tables need composite IDs to match prerendered pages
    if (useCompositeId && ownerIdCol && unitIdCol && row[ownerIdCol] && row[unitIdCol]) {
      id = `${row[ownerIdCol]}_${row[unitIdCol]}`;
    }

    goto(`${base}/asset/${id}.html`);
  }
</script>

<svelte:head>
  <title>All Assets — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href="{base}/index.html" class="back-link">← Back to Overview</a>
    <span class="title">All Assets</span>
    <span class="count">
      {#if loading}
        Loading…
      {:else}
        {assets.length.toLocaleString()} assets
      {/if}
    </span>
  </header>

  {#if loading}
    <p class="no-data">Fetching assets directly from MotherDuck…</p>
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
