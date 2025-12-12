<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { link, assetLink } from '$lib/links';
  import { getTables } from '$lib/component-data/schema';
  import { SCHEMA_SQL } from '$lib/component-data/sql-helpers';
  import { findCommonColumns, getAssetId } from '$lib/component-data/id-helpers';
  import DataTable from '$lib/components/DataTable.svelte';

  // MotherDuck WASM - dynamically imported to avoid SSR issues
  let motherduck;

  // Query groups by asset to count ownership records and get unique assets
  const LIST_SQL = (fullName, cols, unitIdCol) => `
    SELECT
      ${cols.map((c) => `FIRST("${c}") AS "${c}"`).join(', ')},
      COUNT(*) AS owner_count
    FROM ${fullName}
    GROUP BY "${unitIdCol}"
    ORDER BY owner_count DESC
    LIMIT 10000
  `;

  let loading = $state(true);
  let error = $state(null);

  let assets = $state([]);
  let tableName = $state('');
  let resolvedCols = $state({ idCol: null, unitIdCol: null, nameCol: null, statusCol: null, ownerCol: null, countryCol: null });

  const columns = $derived.by(() => {
    const { idCol, nameCol, statusCol, ownerCol, countryCol } = resolvedCols;
    if (!idCol) return [];

    const cols = [];
    if (nameCol) cols.push({ key: nameCol, label: 'Name', sortable: true, filterable: true, width: '250px' });
    cols.push({ key: idCol, label: 'ID', sortable: true, filterable: true, width: '120px' });
    // Owner count column - sorted by default (query orders by this)
    cols.push({ key: 'owner_count', label: 'Owners', sortable: true, type: 'number', width: '80px' });
    if (statusCol) cols.push({ key: statusCol, label: 'Status', sortable: true, filterable: true, width: '120px' });
    if (ownerCol) cols.push({ key: ownerCol, label: 'Owner', sortable: true, filterable: true, width: '200px' });
    if (countryCol) cols.push({ key: countryCol, label: 'Country', sortable: true, filterable: true, width: '150px' });
    return cols;
  });

  onMount(async () => {
    try {
      loading = true;
      error = null;

      const md = await import('$lib/motherduck-wasm');
      motherduck = md.default;

      const { assetTable } = await getTables();
      tableName = assetTable;
      const [schemaName, rawTable] = assetTable.split('.');

      const schemaResult = await motherduck.query(SCHEMA_SQL(schemaName, rawTable));
      const availableCols = schemaResult.data?.map((c) => c.column_name) ?? [];

      // Use centralized column finder
      resolvedCols = findCommonColumns(availableCols);
      const { idCol, unitIdCol, nameCol, statusCol, ownerCol, countryCol } = resolvedCols;

      // Build SELECT list
      const columnsToSelect = new Set([idCol]);
      if (nameCol) columnsToSelect.add(nameCol);
      if (statusCol) columnsToSelect.add(statusCol);
      if (ownerCol) columnsToSelect.add(ownerCol);
      if (countryCol) columnsToSelect.add(countryCol);
      if (unitIdCol) columnsToSelect.add(unitIdCol);

      // Use unitIdCol for grouping, or fall back to idCol
      const groupByCol = unitIdCol || idCol;
      const listResult = await motherduck.query(LIST_SQL(tableName, [...columnsToSelect].filter(Boolean), groupByCol));
      if (!listResult.success) throw new Error(listResult.error || 'Failed to load assets');

      assets = listResult.data ?? [];
    } catch (err) {
      console.error('Asset list load error:', err);
      error = err?.message || 'Failed to load assets';
    } finally {
      loading = false;
    }
  });

  function handleRowClick(row) {
    const id = getAssetId(row, resolvedCols);
    if (!id) return;
    goto(assetLink(id));
  }
</script>

<svelte:head>
  <title>All Assets — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href={link('index')} class="back-link">← Back to Overview</a>
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
