<script>
  /**
   * ASSET-CLASS SCREENER - Step 3: Results
   * Rich analysis view showing owners with detailed asset breakdowns.
   * Data-dense Tufte-style presentation with expandable rows.
   * Uses DuckDB queries on parquet for full asset details.
   */

  import { link, assetPath } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getEntity } from '$lib/ownership-api';
  import { onMount } from 'svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';
  import { colorByTracker, colorByStatus } from '$lib/design-tokens';
  import { formatCompact } from '$lib/format';

  // DuckDB utilities
  let loadParquetFromPath;
  let query;
  let duckdbReady = $state(false);

  // Get params from URL
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse selected classes for display
  const selectedClasses = $derived(() => {
    if (!classesParam) return [];
    try {
      return JSON.parse(decodeURIComponent(classesParam));
    } catch {
      return [];
    }
  });

  // Get tracker filter from classes
  const trackerFilter = $derived(() => {
    const classes = selectedClasses();
    if (classes.length > 0 && classes[0].tracker) {
      return classes[0].tracker;
    }
    return null;
  });

  // Parse owner IDs
  const ownerIds = $derived(() => {
    if (!ownersParam) return [];
    try {
      const parsed = JSON.parse(decodeURIComponent(ownersParam));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return ownersParam.split(',').filter((id) => id.trim());
  });

  // Results state
  let matchedResults = $state([]);
  let unmatchedOwners = $state([]);
  let loading = $state(true);
  let error = $state(null);
  let showUnmatchedList = $state(false);
  let expandedRows = $state(new Set());

  // Aggregate stats
  let totalCapacity = $state(0);
  let totalAssets = $state(0);
  let statusBreakdown = $state({});
  let trackerBreakdown = $state({});
  let countryBreakdown = $state({});

  // Status display order
  const statusOrder = ['operating', 'construction', 'pre-construction', 'permitted', 'announced', 'proposed', 'mothballed', 'retired', 'cancelled', 'shelved'];

  // Load data on mount using DuckDB
  onMount(async () => {
    const ids = ownerIds();
    if (ids.length === 0) {
      loading = false;
      return;
    }

    try {
      // Initialize DuckDB
      const duckdbUtils = await import('$lib/duckdb-utils');
      loadParquetFromPath = duckdbUtils.loadParquetFromPath;
      query = duckdbUtils.query;

      const ownershipPath = assetPath('all_trackers_ownership@1.parquet');
      await loadParquetFromPath(ownershipPath, 'ownership');
      duckdbReady = true;

      // Build tracker filter clause
      const tracker = trackerFilter();
      const trackerClause = tracker ? `AND Tracker = '${tracker.replace(/'/g, "''")}'` : '';

      // Query for each owner's assets
      const matched = [];
      const unmatched = [];

      for (const id of ids) {
        try {
          // Get entity info from API
          const entity = await getEntity(id);

          // Query parquet for assets owned by this entity
          const sql = `
            SELECT
              "GEM Asset ID" as gem_id,
              "Project Name" as name,
              Status,
              Tracker,
              Country,
              "Capacity (MW)" as capacity,
              "Ownership %" as ownership_pct
            FROM ownership
            WHERE "Owner GEM Entity ID" = '${id.replace(/'/g, "''")}'
            ${trackerClause}
            ORDER BY "Capacity (MW)" DESC NULLS LAST
            LIMIT 100
          `;

          const result = await query(sql);

          if (!result.success || !result.data || result.data.length === 0) {
            // Try without tracker filter to see if owner exists
            const checkSql = `
              SELECT COUNT(*) as cnt
              FROM ownership
              WHERE "Owner GEM Entity ID" = '${id.replace(/'/g, "''")}'
            `;
            const checkResult = await query(checkSql);
            const hasAnyAssets = checkResult.success && checkResult.data?.[0]?.cnt > 0;

            if (!hasAnyAssets) {
              unmatched.push({ id, name: entity?.name || id, reason: 'No assets found' });
            } else {
              // Has assets but none match filter
              matched.push({
                id,
                name: entity?.name || id,
                country: entity?.headquartersCountry || '',
                totalAssets: checkResult.data[0].cnt,
                matchedAssets: 0,
                capacity: 0,
                assets: [],
                statusBreakdown: {},
                trackerBreakdown: {},
                countryBreakdown: {},
              });
            }
            continue;
          }

          // Calculate breakdowns
          const ownerStatusBreakdown = {};
          const ownerTrackerBreakdown = {};
          const ownerCountryBreakdown = {};
          let ownerCapacity = 0;

          const assets = result.data.map(row => {
            const status = (row.Status || 'unknown').toLowerCase();
            ownerStatusBreakdown[status] = (ownerStatusBreakdown[status] || 0) + 1;

            const t = row.Tracker || 'Unknown';
            ownerTrackerBreakdown[t] = (ownerTrackerBreakdown[t] || 0) + 1;

            const country = row.Country || 'Unknown';
            ownerCountryBreakdown[country] = (ownerCountryBreakdown[country] || 0) + 1;

            const cap = parseFloat(row.capacity) || 0;
            ownerCapacity += cap;

            return {
              gem_id: row.gem_id,
              name: row.name || row.gem_id,
              status: status,
              tracker: row.Tracker,
              country: row.Country,
              capacity: cap,
              ownershipPct: row.ownership_pct,
            };
          });

          matched.push({
            id,
            name: entity?.name || id,
            country: entity?.headquartersCountry || '',
            totalAssets: assets.length,
            matchedAssets: assets.length,
            capacity: ownerCapacity,
            assets,
            statusBreakdown: ownerStatusBreakdown,
            trackerBreakdown: ownerTrackerBreakdown,
            countryBreakdown: ownerCountryBreakdown,
          });

        } catch (err) {
          console.error(`Failed to load data for ${id}:`, err);
          unmatched.push({ id, name: id, reason: err?.message || 'Query failed' });
        }
      }

      // Sort by capacity descending
      matched.sort((a, b) => b.capacity - a.capacity);
      matchedResults = matched;
      unmatchedOwners = unmatched;

      // Calculate aggregates
      let aggCapacity = 0;
      let aggAssets = 0;
      const aggStatus = {};
      const aggTracker = {};
      const aggCountry = {};

      matched.forEach(owner => {
        aggCapacity += owner.capacity;
        aggAssets += owner.matchedAssets;

        Object.entries(owner.statusBreakdown).forEach(([status, count]) => {
          aggStatus[status] = (aggStatus[status] || 0) + count;
        });

        Object.entries(owner.trackerBreakdown).forEach(([tracker, count]) => {
          aggTracker[tracker] = (aggTracker[tracker] || 0) + count;
        });

        Object.entries(owner.countryBreakdown).forEach(([country, count]) => {
          aggCountry[country] = (aggCountry[country] || 0) + count;
        });
      });

      totalCapacity = aggCapacity;
      totalAssets = aggAssets;
      statusBreakdown = aggStatus;
      trackerBreakdown = aggTracker;
      countryBreakdown = aggCountry;

    } catch (err) {
      console.error('Results page error:', err);
      error = err?.message || 'Failed to load results';
    } finally {
      loading = false;
    }
  });

  // Toggle row expansion
  function toggleRow(id) {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedRows = newSet;
  }

  // Format capacity
  function formatCapacity(mw) {
    if (!mw || mw === 0) return '—';
    if (mw >= 1000) {
      return `${(mw / 1000).toFixed(1)} GW`;
    }
    return `${formatCompact(mw)} MW`;
  }

  // Get status color
  function getStatusColor(status) {
    return colorByStatus.get(status) || '#888';
  }

  // Get tracker color
  function getTrackerColor(tracker) {
    return colorByTracker.get(tracker) || '#888';
  }

  // Calculate percentage
  function pct(value, total) {
    if (!total) return 0;
    return (value / total) * 100;
  }

  // Top N items from breakdown
  function topN(breakdown, n = 5) {
    return Object.entries(breakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n);
  }

  // Navigation
  function goBack() {
    goto(link(`screener/owners?classes=${encodeURIComponent(classesParam)}`));
  }

  function continueToVisualize() {
    const ownerIdList = matchedResults.map(o => o.id).join(',');
    goto(
      link(
        `screener/visualize?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(ownerIdList)}`
      )
    );
  }

  function visualizeSingle(ownerId) {
    goto(
      link(
        `screener/visualize?classes=${encodeURIComponent(classesParam)}&owners=${encodeURIComponent(ownerId)}`
      )
    );
  }
</script>

<svelte:head>
  <title>Screening Results — GEM Ownership Tracker</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <ScreenerStepNav currentStep={3} {classesParam} {ownersParam} />

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Screening Results</h1>
        {#if trackerFilter()}
          <p class="filter-badge">{trackerFilter()}</p>
        {/if}
      </div>
    </header>

    <LoadingWrapper
      {loading}
      {error}
      empty={matchedResults.length === 0 && unmatchedOwners.length === 0}
      loadingMessage="Analyzing ownership data..."
      emptyMessage="No owners selected."
    >
      <!-- Aggregate Stats Panel -->
      {#if matchedResults.length > 0}
        <section class="stats-panel">
          <div class="stat-group">
            <div class="stat-large">
              <span class="stat-value">{matchedResults.length}</span>
              <span class="stat-label">{matchedResults.length === 1 ? 'Owner' : 'Owners'}</span>
            </div>
            <div class="stat-large">
              <span class="stat-value">{formatCompact(totalAssets)}</span>
              <span class="stat-label">Assets</span>
            </div>
            <div class="stat-large">
              <span class="stat-value">{formatCapacity(totalCapacity)}</span>
              <span class="stat-label">Total Capacity</span>
            </div>
          </div>

          <!-- Status breakdown bar -->
          <div class="breakdown-section">
            <h3 class="breakdown-label">By Status</h3>
            <div class="breakdown-bar">
              {#each statusOrder as status}
                {#if statusBreakdown[status]}
                  <div
                    class="bar-segment"
                    style="width: {pct(statusBreakdown[status], totalAssets)}%; background: {getStatusColor(status)}"
                    title="{status}: {statusBreakdown[status]} ({Math.round(pct(statusBreakdown[status], totalAssets))}%)"
                  ></div>
                {/if}
              {/each}
            </div>
            <div class="breakdown-legend">
              {#each topN(statusBreakdown, 4) as [status, count]}
                <span class="legend-item">
                  <span class="legend-dot" style="background: {getStatusColor(status)}"></span>
                  {status} <span class="legend-count">{count}</span>
                </span>
              {/each}
            </div>
          </div>

          <!-- Country breakdown -->
          {#if Object.keys(countryBreakdown).length > 1}
            <div class="breakdown-section">
              <h3 class="breakdown-label">Top Countries</h3>
              <div class="country-list">
                {#each topN(countryBreakdown, 5) as [country, count]}
                  <span class="country-item">
                    {country} <span class="country-count">{count}</span>
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <!-- Unmatched notice -->
      {#if unmatchedOwners.length > 0}
        <aside class="unmatched-notice">
          <p class="unmatched-text">
            {unmatchedOwners.length} {unmatchedOwners.length === 1 ? 'owner' : 'owners'} could not be matched.
            <button class="toggle-details" onclick={() => (showUnmatchedList = !showUnmatchedList)}>
              {showUnmatchedList ? 'Hide' : 'Details'}
            </button>
          </p>
          {#if showUnmatchedList}
            <ul class="unmatched-list">
              {#each unmatchedOwners as owner}
                <li>{owner.name} <span class="reason">— {owner.reason}</span></li>
              {/each}
            </ul>
          {/if}
        </aside>
      {/if}

      <!-- Results Table -->
      {#if matchedResults.length > 0}
        <section class="results-section">
          <div class="results-list">
            {#each matchedResults as row, i}
              <div class="result-row" class:expanded={expandedRows.has(row.id)}>
                <button class="row-main" onclick={() => toggleRow(row.id)}>
                  <div class="row-rank">{i + 1}</div>

                  <div class="row-info">
                    <div class="row-name">{row.name}</div>
                    {#if row.country}
                      <div class="row-country">{row.country}</div>
                    {/if}
                  </div>

                  <div class="row-stats">
                    <div class="row-stat">
                      <span class="stat-num">{row.matchedAssets}</span>
                      <span class="stat-text">assets</span>
                    </div>
                    <div class="row-stat">
                      <span class="stat-num">{formatCapacity(row.capacity)}</span>
                      <span class="stat-text">capacity</span>
                    </div>
                  </div>

                  <!-- Status mini-bar -->
                  <div class="row-status-bar">
                    {#each statusOrder as status}
                      {#if row.statusBreakdown[status]}
                        <div
                          class="mini-segment"
                          style="flex: {row.statusBreakdown[status]}; background: {getStatusColor(status)}"
                          title="{status}: {row.statusBreakdown[status]}"
                        ></div>
                      {/if}
                    {/each}
                  </div>

                  <div class="row-expand">
                    {expandedRows.has(row.id) ? '−' : '+'}
                  </div>
                </button>

                <!-- Expanded details -->
                {#if expandedRows.has(row.id)}
                  <div class="row-details">
                    <div class="details-header">
                      <h4>Assets ({row.matchedAssets})</h4>
                      <button class="visualize-btn" onclick={() => visualizeSingle(row.id)}>
                        View in Visualizer →
                      </button>
                    </div>

                    <!-- Status breakdown for this owner -->
                    <div class="owner-breakdown">
                      {#each topN(row.statusBreakdown, 6) as [status, count]}
                        <span class="owner-stat">
                          <span class="owner-dot" style="background: {getStatusColor(status)}"></span>
                          {status}: {count}
                        </span>
                      {/each}
                    </div>

                    <!-- Asset list (show top 10) -->
                    <div class="asset-list">
                      {#each row.assets.slice(0, 10) as asset}
                        <a href={link(`asset/${asset.gem_id || asset.id}`)} class="asset-item">
                          <span class="asset-status" style="background: {getStatusColor(asset.status?.toLowerCase())}"></span>
                          <span class="asset-name">{asset.name || asset.gem_id || 'Unknown'}</span>
                          <span class="asset-meta">
                            {#if asset.country}{asset.country}{/if}
                            {#if asset.capacity && parseFloat(asset.capacity) > 0}
                              · {formatCapacity(parseFloat(asset.capacity))}
                            {/if}
                          </span>
                        </a>
                      {/each}
                      {#if row.assets.length > 10}
                        <div class="more-assets">
                          + {row.assets.length - 10} more assets
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <!-- Continue button -->
        <div class="continue-section">
          <button class="continue-btn" onclick={continueToVisualize}>
            Continue to Visualization
          </button>
        </div>
      {/if}
    </LoadingWrapper>

    <!-- Navigation -->
    <nav class="nav-buttons">
      <button class="back-btn" onclick={goBack}>
        ← Back to Owner Selection
      </button>
    </nav>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: #faf9f7;
  }

  .screener-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 32px 120px;
  }

  /* Header */
  .screener-header {
    margin-bottom: 32px;
  }

  .header-content {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }

  h1 {
    font-size: 28px;
    font-weight: 400;
    margin: 0;
    color: #222;
    letter-spacing: -0.01em;
  }

  .filter-badge {
    font-size: 12px;
    font-weight: 500;
    color: #666;
    background: #e8e8e8;
    padding: 4px 10px;
    margin: 0;
  }

  /* Stats Panel */
  .stats-panel {
    background: #fff;
    border: 1px solid #e0e0e0;
    padding: 24px 28px;
    margin-bottom: 32px;
  }

  .stat-group {
    display: flex;
    gap: 48px;
    margin-bottom: 24px;
  }

  .stat-large {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 32px;
    font-weight: 300;
    color: #222;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: 11px;
    font-weight: 500;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 6px;
  }

  /* Breakdown sections */
  .breakdown-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #eee;
  }

  .breakdown-label {
    font-size: 10px;
    font-weight: 500;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 10px 0;
  }

  .breakdown-bar {
    display: flex;
    height: 8px;
    overflow: hidden;
    background: #f0f0f0;
    gap: 1px;
  }

  .bar-segment {
    min-width: 3px;
    transition: width 0.3s ease;
  }

  .breakdown-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 10px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #555;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .legend-count {
    color: #999;
    font-variant-numeric: tabular-nums;
  }

  .country-list {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .country-item {
    font-size: 13px;
    color: #444;
  }

  .country-count {
    color: #999;
    font-size: 12px;
    margin-left: 4px;
    font-variant-numeric: tabular-nums;
  }

  /* Unmatched notice */
  .unmatched-notice {
    margin-bottom: 24px;
    padding-left: 12px;
    border-left: 2px solid #ccc;
  }

  .unmatched-text {
    font-size: 13px;
    color: #666;
    margin: 0;
  }

  .toggle-details {
    background: none;
    border: none;
    color: #666;
    text-decoration: underline;
    cursor: pointer;
    font-size: 13px;
    padding: 0;
    margin-left: 4px;
  }

  .toggle-details:hover {
    color: #333;
  }

  .unmatched-list {
    margin: 12px 0 0 0;
    padding: 0;
    list-style: none;
  }

  .unmatched-list li {
    font-size: 13px;
    color: #666;
    padding: 4px 0;
  }

  .unmatched-list .reason {
    color: #999;
  }

  /* Results Section */
  .results-section {
    margin-bottom: 32px;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Result Row */
  .result-row {
    background: #fff;
    border: 1px solid #e0e0e0;
  }

  .result-row.expanded {
    border-color: #999;
  }

  .row-main {
    display: grid;
    grid-template-columns: 40px 1fr 180px 120px 40px;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 16px 20px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 0.1s;
  }

  .row-main:hover {
    background: #fafafa;
  }

  .row-rank {
    font-size: 14px;
    font-weight: 500;
    color: #999;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .row-info {
    min-width: 0;
  }

  .row-name {
    font-size: 15px;
    font-weight: 500;
    color: #222;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-country {
    font-size: 12px;
    color: #888;
    margin-top: 2px;
  }

  .row-stats {
    display: flex;
    gap: 24px;
  }

  .row-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .stat-num {
    font-size: 16px;
    font-weight: 500;
    color: #333;
    font-variant-numeric: tabular-nums;
  }

  .stat-text {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .row-status-bar {
    display: flex;
    height: 6px;
    overflow: hidden;
    background: #f0f0f0;
    gap: 1px;
  }

  .mini-segment {
    min-width: 2px;
  }

  .row-expand {
    font-size: 18px;
    color: #999;
    text-align: center;
    font-weight: 300;
  }

  /* Expanded Row Details */
  .row-details {
    padding: 20px 20px 24px 76px;
    background: #fafafa;
    border-top: 1px solid #eee;
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .details-header h4 {
    font-size: 13px;
    font-weight: 500;
    color: #555;
    margin: 0;
  }

  .visualize-btn {
    font-size: 12px;
    color: #666;
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .visualize-btn:hover {
    color: #222;
  }

  .owner-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 16px;
  }

  .owner-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #555;
  }

  .owner-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .asset-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .asset-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #fff;
    border: 1px solid #eee;
    text-decoration: none;
    transition: border-color 0.1s;
  }

  .asset-item:hover {
    border-color: #ccc;
  }

  .asset-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .asset-name {
    font-size: 13px;
    color: #333;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .asset-meta {
    font-size: 11px;
    color: #888;
    flex-shrink: 0;
  }

  .more-assets {
    font-size: 12px;
    color: #888;
    padding: 8px 12px;
    font-style: italic;
  }

  /* Continue Section */
  .continue-section {
    display: flex;
    justify-content: center;
    padding: 32px 0;
    border-top: 1px solid #e0e0e0;
    margin-top: 16px;
  }

  .continue-btn {
    padding: 20px 56px;
    font-size: 18px;
    font-weight: 600;
    background: #222;
    color: white;
    border: none;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    letter-spacing: 0.02em;
  }

  .continue-btn:hover {
    background: #000;
    transform: translateY(-1px);
  }

  /* Navigation */
  .nav-buttons {
    padding-top: 24px;
  }

  .back-btn {
    padding: 10px 16px;
    font-size: 13px;
    background: transparent;
    color: #666;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.1s;
  }

  .back-btn:hover {
    color: #333;
    border-color: #bbb;
  }

  @media (max-width: 768px) {
    .screener-layout {
      padding: 32px 20px 100px;
    }

    .stat-group {
      flex-wrap: wrap;
      gap: 24px;
    }

    .row-main {
      grid-template-columns: 32px 1fr 40px;
      gap: 12px;
      padding: 14px 16px;
    }

    .row-stats,
    .row-status-bar {
      display: none;
    }

    .row-details {
      padding: 16px;
    }
  }
</style>
