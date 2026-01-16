<script>
  import { tick } from 'svelte';
  import { formatCount } from '$lib/format';
  import { staggerIn, timing, shouldAnimate } from '$lib/animations';

  /**
   * @type {{
   *   columns?: Array<{key: string, label: string, sortable?: boolean, filterable?: boolean, type?: 'string' | 'number' | 'date', width?: string}>,
   *   data?: Array<Record<string, any>>,
   *   pageSize?: number,
   *   showGlobalSearch?: boolean,
   *   showColumnFilters?: boolean,
   *   showPagination?: boolean,
   *   showExport?: boolean,
   *   showColumnToggle?: boolean,
   *   stickyHeader?: boolean,
   *   striped?: boolean,
   *   onRowClick?: ((row: Record<string, any>, index?: number) => void) | null,
   *   onRowHover?: ((row: Record<string, any>, event: MouseEvent) => void) | null,
   *   onRowLeave?: (() => void) | null,
   *   highlightRow?: ((row: Record<string, any>) => boolean) | null,
   *   selectedRows?: Array<Record<string, any>>
   * }}
   */
  let {
    columns = [],
    data = [],
    pageSize = 25,
    showGlobalSearch = true,
    showColumnFilters = true,
    showPagination = true,
    showExport = true,
    showColumnToggle = true,
    stickyHeader = true,
    striped = true,
    onRowClick = null,
    onRowHover = null,
    onRowLeave = null,
    highlightRow = null,
    selectedRows = $bindable([]),
  } = $props();

  // State
  let globalSearch = $state('');
  let columnFilters = $state({});
  let sortColumn = $state(null);
  let sortDirection = $state('asc');
  let currentPage = $state(1);
  let visibleColumns = $state([]);
  let showColumnMenu = $state(false);
  let activeFilters = $state([]);
  let filterLogic = $state('AND'); // AND or OR
  let lastColumnKeys = $state('');

  // Sync visibleColumns when columns prop changes
  $effect(() => {
    const columnKeys = columns.map((c) => c.key);
    const keysString = columnKeys.join(',');

    // Only update if columns actually changed
    if (keysString !== lastColumnKeys) {
      lastColumnKeys = keysString;
      // Keep existing visible state, add new columns
      const existingSet = new Set(visibleColumns);
      const validExisting = visibleColumns.filter((k) => columnKeys.includes(k));
      const newKeys = columnKeys.filter((k) => !existingSet.has(k));
      visibleColumns = [...validExisting, ...newKeys];
    }
  });

  // Animation state
  /** @type {HTMLElement | null} */
  let tbodyEl = $state(null);
  let prevPage = $state(1);

  // Animate rows when page changes
  async function animateRows() {
    if (!shouldAnimate()) return;
    await tick();
    if (tbodyEl) {
      const rows = tbodyEl.querySelectorAll('tr');
      if (rows.length > 0) {
        staggerIn(Array.from(rows), {
          staggerDelay: timing.staggerFast,
          duration: timing.quick,
          distance: timing.distanceSubtle,
        });
      }
    }
  }

  // Trigger animation on pagination
  $effect(() => {
    if (currentPage !== prevPage) {
      prevPage = currentPage;
      animateRows();
    }
  });

  // Reset page when filters change
  $effect(() => {
    if (globalSearch || Object.keys(columnFilters).length) {
      currentPage = 1;
    }
  });

  // Derived: filtered data
  let filteredData = $derived.by(() => {
    let result = [...data];

    // Global search
    if (globalSearch.trim()) {
      const search = globalSearch.toLowerCase();
      result = result.filter((row) =>
        visibleColumns.some((key) => {
          const val = row[key];
          return val != null && String(val).toLowerCase().includes(search);
        })
      );
    }

    // Column filters
    const activeFilterKeys = Object.entries(columnFilters).filter(([, v]) => v && v.trim());
    if (activeFilterKeys.length > 0) {
      result = result.filter((row) => {
        const matches = activeFilterKeys.map(([key, filterVal]) => {
          const cellVal = row[key];
          if (cellVal == null) return false;
          return String(cellVal).toLowerCase().includes(filterVal.toLowerCase());
        });

        return filterLogic === 'AND' ? matches.every(Boolean) : matches.some(Boolean);
      });
    }

    // Multi-filters (advanced filter chips)
    if (activeFilters.length > 0) {
      result = result.filter((row) => {
        const matches = activeFilters.map((filter) => {
          const cellVal = row[filter.column];
          if (cellVal == null) return false;

          switch (filter.operator) {
            case 'equals':
              return String(cellVal).toLowerCase() === filter.value.toLowerCase();
            case 'contains':
              return String(cellVal).toLowerCase().includes(filter.value.toLowerCase());
            case 'starts':
              return String(cellVal).toLowerCase().startsWith(filter.value.toLowerCase());
            case 'ends':
              return String(cellVal).toLowerCase().endsWith(filter.value.toLowerCase());
            case 'gt':
              return Number(cellVal) > Number(filter.value);
            case 'lt':
              return Number(cellVal) < Number(filter.value);
            case 'gte':
              return Number(cellVal) >= Number(filter.value);
            case 'lte':
              return Number(cellVal) <= Number(filter.value);
            default:
              return true;
          }
        });

        return filterLogic === 'AND' ? matches.every(Boolean) : matches.some(Boolean);
      });
    }

    return result;
  });

  // Derived: sorted data
  let sortedData = $derived.by(() => {
    if (!sortColumn) return filteredData;

    const col = columns.find((c) => c.key === sortColumn);
    const type = col?.type || 'string';

    return [...filteredData].sort((a, b) => {
      let valA = a[sortColumn];
      let valB = b[sortColumn];

      // Handle nulls
      if (valA == null && valB == null) return 0;
      if (valA == null) return 1;
      if (valB == null) return -1;

      // Type-aware comparison
      if (type === 'number') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      } else if (type === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  });

  // Derived: paginated data
  let paginatedData = $derived.by(() => {
    if (!showPagination) return sortedData;
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  });

  // Derived: pagination info
  let totalPages = $derived(Math.ceil(sortedData.length / pageSize) || 1);
  let startRow = $derived((currentPage - 1) * pageSize + 1);
  let endRow = $derived(Math.min(currentPage * pageSize, sortedData.length));

  // Visible column objects
  let displayColumns = $derived(columns.filter((c) => visibleColumns.includes(c.key)));

  // Functions
  function handleSort(key) {
    const col = columns.find((c) => c.key === key);
    if (!col?.sortable) return;

    if (sortColumn === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = key;
      sortDirection = 'asc';
    }
  }

  function toggleColumn(key) {
    if (visibleColumns.includes(key)) {
      visibleColumns = visibleColumns.filter((k) => k !== key);
    } else {
      visibleColumns = [...visibleColumns, key];
    }
  }

  function addFilter(column, operator, value) {
    if (!value.trim()) return;
    activeFilters = [...activeFilters, { id: Date.now(), column, operator, value }];
  }

  function removeFilter(id) {
    activeFilters = activeFilters.filter((f) => f.id !== id);
  }

  function clearAllFilters() {
    globalSearch = '';
    columnFilters = {};
    activeFilters = [];
  }

  function exportCSV() {
    const headers = displayColumns.map((c) => c.label).join(',');
    const rows = sortedData.map((row) =>
      displayColumns
        .map((c) => {
          const val = row[c.key];
          // Escape quotes and wrap in quotes if contains comma
          const str = String(val ?? '');
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        })
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');
    downloadFile(csv, 'table-export.csv', 'text/csv');
  }

  function exportJSON() {
    const exportData = sortedData.map((row) => {
      const obj = {};
      displayColumns.forEach((c) => {
        obj[c.key] = row[c.key];
      });
      return obj;
    });
    downloadFile(JSON.stringify(exportData, null, 2), 'table-export.json', 'application/json');
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleRowClick(row, index) {
    if (onRowClick) {
      onRowClick(row, index);
    }
  }

  function toggleRowSelection(row) {
    const idx = selectedRows.findIndex((r) => r === row);
    if (idx >= 0) {
      selectedRows = selectedRows.filter((_, i) => i !== idx);
    } else {
      selectedRows = [...selectedRows, row];
    }
  }

  function toggleSelectAll() {
    if (selectedRows.length === paginatedData.length) {
      selectedRows = [];
    } else {
      selectedRows = [...paginatedData];
    }
  }

  // Quick filter presets
  let newFilterColumn = $state('');
  let newFilterOperator = $state('contains');
  let newFilterValue = $state('');
</script>

<div class="data-table-container">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      {#if showGlobalSearch}
        <div class="search-box">
          <input type="text" placeholder="Search all columns..." bind:value={globalSearch} />
          {#if globalSearch}
            <button class="clear-btn" onclick={() => (globalSearch = '')}>×</button>
          {/if}
        </div>
      {/if}

      <div class="result-count">
        {formatCount(sortedData.length)} of {formatCount(data.length)} rows
      </div>
    </div>

    <div class="toolbar-right">
      {#if showColumnToggle}
        <div class="column-toggle">
          <button class="btn" onclick={() => (showColumnMenu = !showColumnMenu)}>
            Columns ({visibleColumns.length}/{columns.length})
          </button>
          {#if showColumnMenu}
            <div class="column-menu">
              {#each columns as col}
                <label>
                  <input
                    type="checkbox"
                    checked={visibleColumns.includes(col.key)}
                    onchange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      {#if showExport}
        <button class="btn" onclick={exportCSV}>CSV</button>
        <button class="btn" onclick={exportJSON}>JSON</button>
      {/if}

      {#if globalSearch || Object.keys(columnFilters).some((k) => columnFilters[k]) || activeFilters.length > 0}
        <button class="btn btn-danger" onclick={clearAllFilters}>Clear Filters</button>
      {/if}
    </div>
  </div>

  <!-- Advanced Filter Builder -->
  <div class="filter-builder">
    <div class="filter-row">
      <select bind:value={newFilterColumn}>
        <option value="">Add filter...</option>
        {#each columns as col}
          <option value={col.key}>{col.label}</option>
        {/each}
      </select>

      {#if newFilterColumn}
        <select bind:value={newFilterOperator}>
          <option value="contains">contains</option>
          <option value="equals">equals</option>
          <option value="starts">starts with</option>
          <option value="ends">ends with</option>
          <option value="gt">&gt;</option>
          <option value="lt">&lt;</option>
          <option value="gte">&gt;=</option>
          <option value="lte">&lt;=</option>
        </select>

        <input
          type="text"
          placeholder="Value..."
          bind:value={newFilterValue}
          onkeydown={(e) => {
            if (e.key === 'Enter' && newFilterValue) {
              addFilter(newFilterColumn, newFilterOperator, newFilterValue);
              newFilterColumn = '';
              newFilterValue = '';
            }
          }}
        />

        <button
          class="btn btn-small"
          onclick={() => {
            addFilter(newFilterColumn, newFilterOperator, newFilterValue);
            newFilterColumn = '';
            newFilterValue = '';
          }}>+</button
        >
      {/if}

      {#if activeFilters.length > 0}
        <div class="logic-toggle">
          <button
            class="btn btn-small"
            class:active={filterLogic === 'AND'}
            onclick={() => (filterLogic = 'AND')}>AND</button
          >
          <button
            class="btn btn-small"
            class:active={filterLogic === 'OR'}
            onclick={() => (filterLogic = 'OR')}>OR</button
          >
        </div>
      {/if}
    </div>

    {#if activeFilters.length > 0}
      <div class="filter-chips">
        {#each activeFilters as filter}
          <span class="chip">
            <strong>{columns.find((c) => c.key === filter.column)?.label}</strong>
            {filter.operator} "{filter.value}"
            <button class="chip-remove" onclick={() => removeFilter(filter.id)}>×</button>
          </span>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Table -->
  <div class="table-wrapper" class:sticky-header={stickyHeader}>
    <table>
      <thead>
        <!-- Header row (with sort handlers) -->
        <tr>
          <th class="checkbox-col">
            <input
              type="checkbox"
              checked={selectedRows.length === paginatedData.length && paginatedData.length > 0}
              onchange={toggleSelectAll}
            />
          </th>
          {#each displayColumns as col}
            <th
              class:sortable={col.sortable}
              class:sorted={sortColumn === col.key}
              style={col.width ? `width: ${col.width}` : ''}
              onclick={() => handleSort(col.key)}
              role="columnheader"
              aria-sort={sortColumn === col.key
                ? sortDirection === 'asc'
                  ? 'ascending'
                  : 'descending'
                : 'none'}
            >
              <span class="header-content">
                {col.label}
                {#if col.sortable}
                  <span class="sort-indicator">
                    {#if sortColumn === col.key}
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    {:else}
                      ⇅
                    {/if}
                  </span>
                {/if}
              </span>
            </th>
          {/each}
        </tr>

        <!-- Column filter row -->
        {#if showColumnFilters}
          <tr class="filter-row">
            <th class="checkbox-col"></th>
            {#each displayColumns as col}
              <th style={col.width ? `width: ${col.width}` : ''}>
                {#if col.filterable !== false}
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={columnFilters[col.key] || ''}
                    oninput={(e) =>
                      (columnFilters[col.key] = /** @type {HTMLInputElement} */ (e.target).value)}
                  />
                {/if}
              </th>
            {/each}
          </tr>
        {/if}
      </thead>
      <tbody bind:this={tbodyEl}>
        {#each paginatedData as row, i}
          <tr
            class:striped={striped && i % 2 === 1}
            class:selected={selectedRows.includes(row)}
            class:highlighted={highlightRow?.(row)}
            class:clickable={onRowClick}
            onclick={() => handleRowClick(row, i)}
            onmouseenter={(e) => onRowHover?.(row, e)}
            onmouseleave={() => onRowLeave?.()}
          >
            <td class="checkbox-col" onclick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedRows.includes(row)}
                onchange={() => toggleRowSelection(row)}
              />
            </td>
            {#each displayColumns as col}
              <td>
                {#if row[col.key] != null}
                  {#if col.type === 'number'}
                    {formatCount(Number(row[col.key]))}
                  {:else}
                    {row[col.key]}
                  {/if}
                {:else}
                  <span class="null-value">—</span>
                {/if}
              </td>
            {/each}
          </tr>
        {:else}
          <tr>
            <td colspan={displayColumns.length + 1} class="empty-state"> No data found </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if showPagination && totalPages > 1}
    <div class="pagination">
      <div class="pagination-info">
        Showing {startRow} - {endRow} of {formatCount(sortedData.length)}
      </div>

      <div class="pagination-controls">
        <button class="btn btn-small" disabled={currentPage === 1} onclick={() => (currentPage = 1)}
          >««</button
        >
        <button class="btn btn-small" disabled={currentPage === 1} onclick={() => currentPage--}
          >«</button
        >

        <span class="page-info">
          Page {currentPage} of {totalPages}
        </span>

        <button
          class="btn btn-small"
          disabled={currentPage === totalPages}
          onclick={() => currentPage++}>»</button
        >
        <button
          class="btn btn-small"
          disabled={currentPage === totalPages}
          onclick={() => (currentPage = totalPages)}>»»</button
        >
      </div>

      <div class="page-size">
        <select bind:value={pageSize}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={250}>250</option>
        </select>
        per page
      </div>
    </div>
  {/if}
</div>

<style>
  .data-table-container {
    background: var(--color-white);
    border: none;
    font-family: 'IBM Plex Mono', 'Fira Code', monospace;
    border-radius: 0;
    overflow: hidden;
  }

  /* Toolbar - compact */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-gray-200);
    background: transparent;
    flex-wrap: wrap;
    gap: 6px;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .search-box {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-box input {
    padding: 5px 28px 5px 8px;
    border: 1px solid var(--color-gray-300);
    font-size: 11px;
    width: 180px;
    font-family: inherit;
    border-radius: 0;
    background: var(--color-white);
  }

  .search-box .clear-btn {
    position: absolute;
    right: 6px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--color-text-secondary);
  }

  .result-count {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* Column toggle menu */
  .column-toggle {
    position: relative;
  }

  .column-menu {
    position: absolute;
    top: 100%;
    right: 0;
    background: var(--color-white);
    border: 1px solid var(--color-black);
    padding: 8px;
    z-index: 100;
    min-width: 180px;
    max-height: 300px;
    overflow-y: auto;
    box-shadow: 4px 4px 0 color-mix(in srgb, var(--color-black) 10%, transparent);
  }

  .column-menu label {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .column-menu label:hover {
    background: transparent;
  }

  /* Filter builder */
  .filter-builder {
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-gray-200);
    background: var(--color-white);
  }

  .filter-builder .filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .filter-builder select,
  .filter-builder input[type='text'] {
    padding: 7px 10px;
    border: 1px solid var(--color-gray-300);
    font-size: 11px;
    font-family: inherit;
    border-radius: 0;
  }

  .filter-builder select {
    min-width: 120px;
  }

  .logic-toggle {
    display: flex;
    gap: 4px;
    margin-left: 12px;
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 9px;
    background: transparent;
    border: 1px solid var(--color-gray-300);
    font-size: 11px;
    border-radius: 0;
  }

  .chip strong {
    color: var(--color-black);
  }

  .chip-remove {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    color: var(--color-text-secondary);
    padding: 0 2px;
  }

  .chip-remove:hover {
    color: var(--color-error);
  }

  /* Table wrapper */
  .table-wrapper {
    overflow-x: auto;
    max-height: calc(100vh - 200px);
    overflow-y: auto;
  }

  .table-wrapper.sticky-header thead {
    position: sticky;
    top: 0;
    z-index: 10;
  }

  /* Table */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  thead {
    background: var(--color-gray-100);
    color: var(--color-black);
  }

  thead tr.filter-row {
    background: var(--color-white);
  }

  thead tr.filter-row th {
    padding: 2px 4px;
  }

  thead tr.filter-row input {
    width: 100%;
    padding: 2px 4px;
    border: 1px solid var(--color-gray-200);
    font-size: 10px;
    font-family: inherit;
    background: var(--color-white);
    border-radius: 0;
  }

  th {
    padding: 4px 6px;
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
    border-bottom: 1px solid var(--color-gray-300);
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  th.sortable:hover {
    background: var(--color-gray-100);
  }

  th.sorted {
    background: var(--color-gray-200);
  }

  .header-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sort-indicator {
    font-size: 8px;
    opacity: 0.6;
    transition:
      transform 150ms ease,
      opacity 100ms ease;
  }

  th:hover .sort-indicator {
    opacity: 0.8;
  }

  th.sorted .sort-indicator {
    opacity: 1;
    transform: scale(1.1);
  }

  .checkbox-col {
    width: 24px;
    text-align: center;
  }

  td {
    padding: 3px 6px;
    border-bottom: 1px solid var(--color-gray-100);
    vertical-align: middle;
    line-height: 1.3;
  }

  tbody tr {
    transition: background 50ms ease;
  }

  tbody tr:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  tbody tr.striped {
    background: rgba(0, 0, 0, 0.02);
  }

  tbody tr.striped:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  tbody tr.selected {
    background: var(--color-selection, #e9f1ff);
  }

  tbody tr.selected:hover {
    background: var(--color-selection-hover, #d2e1ff);
  }

  tbody tr.highlighted {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 215, 0, 0.05) 100%);
    border-left: 3px solid #d4a700;
  }

  tbody tr.highlighted:hover {
    background: linear-gradient(90deg, rgba(255, 215, 0, 0.25) 0%, rgba(255, 215, 0, 0.1) 100%);
  }

  tbody tr.highlighted td:first-child {
    padding-left: 3px;
  }

  tbody tr.clickable {
    cursor: pointer;
  }

  tbody tr.clickable:active {
    transform: scale(0.995);
  }

  .null-value {
    color: var(--color-gray-300);
  }

  .empty-state {
    text-align: center;
    padding: 40px;
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 8px;
    border-top: 1px solid var(--color-gray-200);
    background: var(--color-gray-50);
    flex-wrap: wrap;
    gap: 8px;
  }

  .pagination-info {
    font-size: 10px;
    color: var(--color-text-secondary);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .page-info {
    font-size: 10px;
    font-weight: 600;
    margin: 0 4px;
  }

  .page-size {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .page-size select {
    padding: 5px 8px;
    border: 1px solid var(--color-gray-300);
    font-size: 11px;
    font-family: inherit;
    border-radius: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .toolbar {
      flex-direction: column;
      align-items: stretch;
    }

    .toolbar-left,
    .toolbar-right {
      justify-content: center;
    }

    .search-box input {
      width: 100%;
    }

    .pagination {
      flex-direction: column;
      gap: 8px;
    }
  }
</style>
