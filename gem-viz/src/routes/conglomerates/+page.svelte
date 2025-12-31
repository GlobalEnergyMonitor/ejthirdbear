<script>
  /**
   * CONGLOMERATES PAGE
   * Shows entities that own assets across multiple tracker types (Coal + Gas, etc.)
   *
   * This is a key researcher feature for identifying diversified fossil fuel players.
   */
  import { goto } from '$app/navigation';
  import { entityLink } from '$lib/links';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import CrossTrackerBadge from '$lib/components/CrossTrackerBadge.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';

  // --- PROPS (from +page.server.js) ---
  let { data } = $props();

  // --- STATE ---
  let sortBy = $state('trackerCount');
  let sortDir = $state('desc');
  let filterMinTrackers = $state(2);

  // --- COMPUTED ---
  const conglomerates = $derived(data?.conglomerates || []);
  const stats = $derived(data?.stats || {});

  // Filtered and sorted list
  const displayList = $derived.by(() => {
    let list = conglomerates.filter(e => e.trackerCount >= filterMinTrackers);

    list.sort((a, b) => {
      const aVal = a[sortBy] ?? 0;
      const bVal = b[sortBy] ?? 0;
      const diff = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
      return sortDir === 'desc' ? -diff : diff;
    });

    return list;
  });

  // --- HANDLERS ---
  function handleSort(column) {
    if (sortBy === column) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortBy = column;
      sortDir = 'desc';
    }
  }

  function navigateToEntity(id) {
    goto(entityLink(id));
  }
</script>

<svelte:head>
  <title>Cross-Sector Conglomerates — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <span class="page-type">Analysis</span>
  </header>

  <article>
    <h1>Cross-Sector Conglomerates</h1>
    <p class="subtitle">
      Entities that own assets across multiple tracker types. These diversified players
      span coal, gas, steel, and other sectors.
    </p>

    <!-- Stats -->
    <div class="stats-row">
      <div class="stat">
        <span class="stat-value">{stats.totalConglomerates?.toLocaleString()}</span>
        <span class="stat-label">Multi-sector entities</span>
      </div>
      <div class="stat">
        <span class="stat-value">{stats.maxTrackers}</span>
        <span class="stat-label">Max trackers</span>
      </div>
      <div class="stat">
        <span class="stat-value">{stats.avgTrackers}</span>
        <span class="stat-label">Avg trackers</span>
      </div>
      <div class="stat">
        <span class="stat-value">{((stats.totalConglomerates / stats.totalEntities) * 100).toFixed(1)}%</span>
        <span class="stat-label">of all entities</span>
      </div>
    </div>

    <!-- Filters -->
    <div class="filters">
      <label>
        <span>Minimum trackers:</span>
        <select bind:value={filterMinTrackers}>
          <option value={2}>2+ (Multi-sector)</option>
          <option value={3}>3+ (Conglomerate)</option>
          <option value={4}>4+ (Major conglomerate)</option>
          <option value={5}>5+ (Super conglomerate)</option>
        </select>
      </label>
      <span class="result-count">
        Showing {displayList.length.toLocaleString()} entities
      </span>
    </div>

    <!-- Table -->
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th class="rank">#</th>
            <th
              class="sortable name-col"
              class:active={sortBy === 'name'}
              onclick={() => handleSort('name')}
            >
              Entity
              {#if sortBy === 'name'}<span class="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>{/if}
            </th>
            <th
              class="sortable"
              class:active={sortBy === 'trackerCount'}
              onclick={() => handleSort('trackerCount')}
            >
              Trackers
              {#if sortBy === 'trackerCount'}<span class="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>{/if}
            </th>
            <th class="trackers-col">Sectors</th>
            <th
              class="sortable"
              class:active={sortBy === 'assetCount'}
              onclick={() => handleSort('assetCount')}
            >
              Assets
              {#if sortBy === 'assetCount'}<span class="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>{/if}
            </th>
            <th
              class="sortable"
              class:active={sortBy === 'totalCapacityMw'}
              onclick={() => handleSort('totalCapacityMw')}
            >
              Capacity
              {#if sortBy === 'totalCapacityMw'}<span class="sort-arrow">{sortDir === 'desc' ? '↓' : '↑'}</span>{/if}
            </th>
            <th class="actions-col"></th>
          </tr>
        </thead>
        <tbody>
          {#each displayList as entity, i}
            <tr onclick={() => navigateToEntity(entity.id)}>
              <td class="rank">{i + 1}</td>
              <td class="name-col">
                <a href={entityLink(entity.id)} class="entity-link">
                  {entity.name || entity.id}
                </a>
                <span class="entity-id">{entity.id}</span>
              </td>
              <td class="tracker-count">
                <span class="count-badge" class:conglomerate={entity.trackerCount >= 3}>
                  {entity.trackerCount}
                </span>
              </td>
              <td class="trackers-col">
                <div class="tracker-icons">
                  {#each entity.trackers as tracker}
                    <TrackerIcon {tracker} size={14} />
                  {/each}
                </div>
              </td>
              <td>{entity.assetCount?.toLocaleString()}</td>
              <td>
                {#if entity.totalCapacityMw}
                  {Number(entity.totalCapacityMw).toLocaleString()} MW
                {:else}
                  —
                {/if}
              </td>
              <td class="actions-col" onclick={(e) => e.stopPropagation()}>
                <AddToCartButton
                  id={entity.id}
                  name={entity.name || entity.id}
                  type="entity"
                  metadata={{ assetCount: entity.assetCount, trackerCount: entity.trackerCount }}
                />
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if displayList.length === 0}
      <p class="no-results">No entities match the current filter.</p>
    {/if}
  </article>
</main>

<style>
  main {
    width: 100%;
    padding: 40px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }

  .page-type {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 10px 0;
    font-family: Georgia, serif;
  }

  .subtitle {
    font-size: 14px;
    color: #666;
    margin: 0 0 30px 0;
    max-width: 600px;
    line-height: 1.5;
  }

  /* Stats */
  .stats-row {
    display: flex;
    gap: 30px;
    margin-bottom: 30px;
    padding: 20px 0;
    border-top: 1px solid #eee;
    border-bottom: 1px solid #eee;
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-value {
    font-size: 24px;
    font-weight: 600;
    font-family: system-ui, sans-serif;
  }

  .stat-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  /* Filters */
  .filters {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
  }

  .filters label {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .filters select {
    padding: 6px 10px;
    border: 1px solid #ccc;
    font-size: 13px;
  }

  .result-count {
    color: #666;
    font-size: 12px;
  }

  /* Table */
  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-family: system-ui, sans-serif;
    font-size: 13px;
  }

  thead {
    border-bottom: 2px solid #000;
  }

  th {
    text-align: left;
    padding: 10px 12px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: 600;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  th.sortable:hover {
    color: #000;
  }

  th.active {
    color: #000;
  }

  .sort-arrow {
    margin-left: 4px;
  }

  td {
    padding: 12px;
    border-bottom: 1px solid #eee;
    vertical-align: middle;
  }

  tbody tr {
    cursor: pointer;
    transition: background 0.15s;
  }

  tbody tr:hover {
    background: #fafafa;
  }

  .rank {
    width: 40px;
    color: #999;
    font-size: 12px;
  }

  .name-col {
    min-width: 200px;
  }

  .entity-link {
    color: #000;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
    font-weight: 500;
  }

  .entity-link:hover {
    text-decoration-color: currentColor;
  }

  .entity-id {
    display: block;
    font-size: 10px;
    color: #999;
    font-family: monospace;
    margin-top: 2px;
  }

  .tracker-count {
    text-align: center;
  }

  .count-badge {
    display: inline-block;
    min-width: 24px;
    padding: 4px 8px;
    background: #f0f0f0;
    font-weight: 600;
    text-align: center;
  }

  .count-badge.conglomerate {
    background: #000;
    color: #fff;
  }

  .trackers-col {
    min-width: 150px;
  }

  .tracker-icons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .actions-col {
    width: 100px;
    text-align: right;
  }

  .no-results {
    text-align: center;
    padding: 40px;
    color: #666;
  }

  @media (max-width: 768px) {
    .stats-row {
      flex-wrap: wrap;
      gap: 20px;
    }

    .filters {
      flex-direction: column;
      align-items: flex-start;
    }

    .trackers-col {
      display: none;
    }
  }
</style>
