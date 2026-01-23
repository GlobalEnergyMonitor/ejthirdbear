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
  import MiniFlower from '$lib/components/MiniFlower.svelte';
  import OwnershipFlower from '$lib/components/OwnershipFlower.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import { colorByStatus, colorByTracker, regroupStatus } from '$lib/design-tokens';
  import { formatCompact } from '$lib/format';

  // DuckDB utilities
  let loadParquetFromPath;
  let query;

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
    } catch {
      // JSON parse failed, fall back to comma-separated
    }
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
  const statusOrder = [
    'operating',
    'construction',
    'pre-construction',
    'permitted',
    'announced',
    'proposed',
    'mothballed',
    'retired',
    'cancelled',
    'shelved',
  ];

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

          const assets = result.data.map((row) => {
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

      matched.forEach((owner) => {
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

  // Compute donut chart arcs for status
  function getStatusArcs(breakdown, total) {
    const arcs = [];
    let startAngle = -Math.PI / 2;
    const cx = 50,
      cy = 50,
      r = 45,
      innerR = 28;

    // Group into operating/proposed/retired/cancelled
    const grouped = {};
    for (const [status, count] of Object.entries(breakdown)) {
      const group = regroupStatus(status);
      grouped[group] = (grouped[group] || 0) + count;
    }

    const statusColors = {
      operating: colorByStatus.get('operating') || '#4A57A8',
      proposed: colorByStatus.get('proposed') || '#E5A835',
      retired: colorByStatus.get('retired') || '#6B5B95',
      cancelled: colorByStatus.get('cancelled') || '#888',
      unknown: '#ddd',
    };

    const sortedStatuses = ['operating', 'proposed', 'retired', 'cancelled'].filter(
      (s) => grouped[s] > 0
    );

    for (const status of sortedStatuses) {
      const count = grouped[status];
      const angle = (count / total) * 2 * Math.PI;
      const endAngle = startAngle + angle;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const x3 = cx + innerR * Math.cos(endAngle);
      const y3 = cy + innerR * Math.sin(endAngle);
      const x4 = cx + innerR * Math.cos(startAngle);
      const y4 = cy + innerR * Math.sin(startAngle);

      const largeArc = angle > Math.PI ? 1 : 0;

      arcs.push({
        path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`,
        color: statusColors[status] || '#ddd',
        status,
        count,
        pct: Math.round((count / total) * 100),
      });

      startAngle = endAngle;
    }

    return arcs;
  }

  // Derived donut arcs
  const statusArcs = $derived(totalAssets > 0 ? getStatusArcs(statusBreakdown, totalAssets) : []);

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
    const ownerIdList = matchedResults.map((o) => o.id).join(',');
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
          <div class="stats-hero">
            <!-- Big numbers -->
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

            <!-- Status donut chart -->
            {#if statusArcs.length > 0}
              <div class="status-donut">
                <svg viewBox="0 0 100 100" class="donut-svg">
                  {#each statusArcs as arc}
                    <path d={arc.path} fill={arc.color}>
                      <title>{arc.status}: {arc.count.toLocaleString()} ({arc.pct}%)</title>
                    </path>
                  {/each}
                  <text
                    x="50"
                    y="50"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="donut-total"
                  >
                    {formatCompact(totalAssets)}
                  </text>
                </svg>
                <div class="donut-legend">
                  {#each statusArcs as arc}
                    <div class="donut-legend-item">
                      <StatusIcon status={arc.status} size={10} />
                      <span class="donut-label">{arc.status}</span>
                      <span class="donut-count">{arc.pct}%</span>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Aggregate flower showing tracker distribution -->
            {#if Object.keys(trackerBreakdown).length > 0}
              <div class="aggregate-flower">
                <OwnershipFlower
                  portfolio={{
                    assets: Object.entries(trackerBreakdown).flatMap(([tracker, count]) =>
                      Array(count).fill({ tracker })
                    ),
                  }}
                  size="large"
                  showLabels={false}
                  showTitle={false}
                />
              </div>
            {/if}
          </div>

          <!-- Tracker breakdown with icons -->
          {#if Object.keys(trackerBreakdown).length > 0}
            <div class="breakdown-section tracker-section">
              <h3 class="breakdown-label">By Tracker</h3>
              <div class="tracker-breakdown">
                {#each topN(trackerBreakdown, 8) as [tracker, count]}
                  <div class="tracker-badge" style="--tracker-color: {getTrackerColor(tracker)}">
                    <TrackerIcon {tracker} size={14} />
                    <span class="tracker-name">{tracker}</span>
                    <span class="tracker-count">{count.toLocaleString()}</span>
                    <div class="tracker-bar" style="width: {pct(count, totalAssets)}%"></div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Status breakdown bar -->
          <div class="breakdown-section">
            <h3 class="breakdown-label">Status Detail</h3>
            <div class="breakdown-bar">
              {#each statusOrder as status}
                {#if statusBreakdown[status]}
                  <div
                    class="bar-segment"
                    style="width: {pct(
                      statusBreakdown[status],
                      totalAssets
                    )}%; background: {getStatusColor(status)}"
                    title="{status}: {statusBreakdown[status]} ({Math.round(
                      pct(statusBreakdown[status], totalAssets)
                    )}%)"
                  ></div>
                {/if}
              {/each}
            </div>
            <div class="breakdown-legend">
              {#each topN(statusBreakdown, 6) as [status, count]}
                <span class="legend-item">
                  <StatusIcon {status} size={10} />
                  <span class="legend-text">{status}</span>
                  <span class="legend-count">{count}</span>
                </span>
              {/each}
            </div>
          </div>

          <!-- Country breakdown -->
          {#if Object.keys(countryBreakdown).length > 1}
            <div class="breakdown-section">
              <h3 class="breakdown-label">Top Countries</h3>
              <div class="country-breakdown">
                {#each topN(countryBreakdown, 8) as [country, count]}
                  <div class="country-badge">
                    <span class="country-name">{country}</span>
                    <span class="country-count">{count}</span>
                    <div class="country-bar" style="width: {pct(count, totalAssets)}%"></div>
                  </div>
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
            {unmatchedOwners.length}
            {unmatchedOwners.length === 1 ? 'owner' : 'owners'} could not be matched.
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

                  <!-- Mini flower showing tracker distribution -->
                  <div class="row-flower">
                    <MiniFlower
                      trackers={Object.entries(row.trackerBreakdown).map(([tracker, count]) => ({
                        tracker,
                        count,
                      }))}
                      size={36}
                    />
                  </div>

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
                          style="flex: {row.statusBreakdown[status]}; background: {getStatusColor(
                            status
                          )}"
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
                <div class="row-details-wrapper" class:expanded={expandedRows.has(row.id)}>
                  <div class="row-details">
                    <div class="details-header">
                      <h4>Assets ({row.matchedAssets})</h4>
                      <button class="visualize-btn" onclick={() => visualizeSingle(row.id)}>
                        View in Visualizer →
                      </button>
                    </div>

                    <!-- Tracker breakdown for this owner -->
                    <div class="owner-tracker-breakdown">
                      {#each topN(row.trackerBreakdown, 5) as [tracker, count]}
                        <span class="owner-tracker">
                          <TrackerIcon {tracker} size={12} />
                          <span class="owner-tracker-count">{count}</span>
                        </span>
                      {/each}
                    </div>

                    <!-- Status breakdown for this owner -->
                    <div class="owner-breakdown">
                      {#each topN(row.statusBreakdown, 6) as [status, count]}
                        <span class="owner-stat">
                          <StatusIcon {status} size={10} />
                          <span class="owner-status-name">{status}</span>
                          <span class="owner-status-count">{count}</span>
                        </span>
                      {/each}
                    </div>

                    <!-- Asset list (show top 10) -->
                    <div class="asset-list">
                      {#each row.assets.slice(0, 10) as asset}
                        <a href={link(`asset/${asset.gem_id || asset.id}`)} class="asset-item">
                          {#if asset.tracker}
                            <TrackerIcon tracker={asset.tracker} size={12} />
                          {/if}
                          <StatusIcon status={asset.status} size={10} />
                          <span class="asset-name">{asset.name || asset.gem_id || 'Unknown'}</span>
                          <span class="asset-meta">
                            {#if asset.country}
                              <span class="asset-country">{asset.country}</span>
                            {/if}
                            {#if asset.capacity && parseFloat(asset.capacity) > 0}
                              <span class="asset-capacity"
                                >{formatCapacity(parseFloat(asset.capacity))}</span
                              >
                            {/if}
                          </span>
                        </a>
                      {/each}
                      {#if row.assets.length > 10}
                        <a href={link(`entity/${row.id}`)} class="more-assets">
                          View all {row.assets.length} assets →
                        </a>
                      {/if}
                    </div>
                  </div>
                </div>
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
      <button class="back-btn" onclick={goBack}> ← Back to Owner Selection </button>
    </nav>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: var(--color-bg-secondary);
  }

  .screener-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-8) 120px;
  }

  /* Header */
  .screener-header {
    margin-bottom: var(--space-8);
  }

  .header-content {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
  }

  h1 {
    font-size: var(--font-size-2xl);
    font-weight: 400;
    margin: 0;
    color: var(--color-text-primary);
    letter-spacing: var(--tracking-tight);
  }

  .filter-badge {
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-secondary);
    background: var(--color-border);
    padding: var(--space-1) var(--space-2);
    margin: 0;
  }

  /* Stats Panel */
  .stats-panel {
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    padding: var(--space-6);
    margin-bottom: var(--space-8);
  }

  .aggregate-flower {
    flex-shrink: 0;
  }

  .stat-group {
    display: flex;
    gap: var(--space-12);
  }

  .stat-large {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: var(--font-size-3xl);
    font-weight: 300;
    color: var(--color-text-primary);
    line-height: var(--line-height-tight);
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin-top: 6px;
  }

  /* Breakdown sections */
  .breakdown-section {
    margin-top: var(--space-5);
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--color-border-light);
  }

  .breakdown-label {
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin: 0 0 var(--space-2) 0;
  }

  .breakdown-bar {
    display: flex;
    height: 8px;
    overflow: hidden;
    background: var(--color-gray-100);
    gap: 1px;
  }

  .bar-segment {
    min-width: 3px;
    transition: width var(--duration-slower) var(--ease-in-out-quad);
  }

  .breakdown-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-top: var(--space-2);
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .legend-count {
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  /* Unmatched notice */
  .unmatched-notice {
    margin-bottom: var(--space-6);
    padding-left: var(--space-3);
    border-left: 2px solid var(--color-gray-300);
  }

  .unmatched-text {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .toggle-details {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    text-decoration: underline;
    cursor: pointer;
    font-size: var(--font-size-body);
    padding: 0;
    margin-left: var(--space-1);
  }

  .toggle-details:hover {
    color: var(--color-text-primary);
  }

  .unmatched-list {
    margin: var(--space-3) 0 0 0;
    padding: 0;
    list-style: none;
  }

  .unmatched-list li {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    padding: var(--space-1) 0;
  }

  .unmatched-list .reason {
    color: var(--color-text-tertiary);
  }

  /* Results Section */
  .results-section {
    margin-bottom: var(--space-8);
  }

  .results-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Result Row */
  .result-row {
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    transition: border-color var(--duration-slow) var(--ease-in-out-quad);
  }

  .result-row.expanded {
    border-color: var(--color-gray-400);
  }

  .row-main {
    display: grid;
    grid-template-columns: 40px 44px 1fr 180px 120px 40px;
    align-items: center;
    gap: var(--space-4);
    width: 100%;
    padding: var(--space-4) var(--space-5);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background var(--duration-base) var(--ease-in-out-quad);
  }

  .row-flower {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .row-main:hover {
    background: var(--color-bg-secondary);
  }

  .row-rank {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-tertiary);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .row-info {
    min-width: 0;
  }

  .row-name {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-country {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }

  .row-stats {
    display: flex;
    gap: var(--space-6);
  }

  .row-stat {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }

  .stat-num {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  .stat-text {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .row-status-bar {
    display: flex;
    height: 6px;
    overflow: hidden;
    background: var(--color-gray-100);
    gap: 1px;
  }

  .mini-segment {
    min-width: 2px;
  }

  .row-expand {
    font-size: var(--font-size-xl);
    color: var(--color-text-tertiary);
    text-align: center;
    font-weight: 300;
    transition: transform var(--duration-slow) var(--ease-in-out-quad);
  }

  .result-row.expanded .row-expand {
    transform: rotate(90deg);
  }

  /* Expanded Row Details - smooth height animation */
  .row-details-wrapper {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows var(--duration-slow) var(--ease-in-out-quad);
  }

  .row-details-wrapper.expanded {
    grid-template-rows: 1fr;
  }

  .row-details {
    overflow: hidden;
    min-height: 0;
  }

  .row-details-wrapper.expanded .row-details {
    padding: var(--space-5) var(--space-5) var(--space-6) 76px;
    background: var(--color-bg-secondary);
    border-top: var(--border-width) solid var(--color-border-light);
  }

  .details-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
  }

  .details-header h4 {
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .visualize-btn {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .visualize-btn:hover {
    color: var(--color-text-primary);
  }

  .owner-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .owner-stat {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .asset-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .asset-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border-light);
    text-decoration: none;
    color: inherit;
    transition: border-color var(--transition-fast);
  }

  .asset-item:hover {
    border-color: var(--color-gray-300);
  }

  .asset-name {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .asset-meta {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  /* Continue Section */
  .continue-section {
    display: flex;
    justify-content: center;
    padding: var(--space-8) 0;
    border-top: var(--border-width) solid var(--color-border);
    margin-top: var(--space-4);
  }

  .continue-btn {
    padding: var(--space-5) 56px;
    font-size: var(--font-size-xl);
    font-weight: 600;
    background: var(--color-text-primary);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    transition: background var(--duration-slow) var(--ease-in-out-quad);
    letter-spacing: var(--tracking-wide);
  }

  .continue-btn:hover {
    background: var(--color-black);
  }

  /* Navigation */
  .nav-buttons {
    padding-top: var(--space-6);
  }

  .back-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-body);
    background: transparent;
    color: var(--color-text-secondary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .back-btn:hover {
    color: var(--color-text-primary);
    border-color: var(--color-gray-400);
  }

  /* Stats Hero Layout */
  .stats-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-6);
    flex-wrap: wrap;
    margin-bottom: var(--space-6);
  }

  /* Status Donut Chart */
  .status-donut {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .donut-svg {
    width: 100px;
    height: 100px;
    flex-shrink: 0;
  }

  .donut-svg path {
    transition: opacity var(--transition-base);
  }

  .donut-svg path:hover {
    opacity: 0.8;
  }

  .donut-total {
    font-size: var(--font-size-body);
    font-weight: 600;
    fill: var(--color-text-primary);
  }

  .donut-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .donut-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-body);
  }

  .donut-label {
    text-transform: capitalize;
    color: var(--color-text-secondary);
    min-width: 70px;
  }

  .donut-count {
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  /* Tracker Breakdown */
  .tracker-section {
    border-top: none;
    padding-top: 0;
    margin-top: var(--space-6);
  }

  .tracker-breakdown {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-2);
  }

  .tracker-badge {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    overflow: hidden;
  }

  .tracker-badge .tracker-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    background: var(--tracker-color, var(--color-text-tertiary));
    transition: width var(--transition-slow);
  }

  .tracker-name {
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-primary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tracker-count {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* Country Breakdown */
  .country-breakdown {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }

  .country-badge {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    overflow: hidden;
  }

  .country-badge .country-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    background: var(--color-text-tertiary);
  }

  .country-name {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .country-badge .country-count {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
    margin-left: 0;
  }

  /* Legend with icons */
  .legend-text {
    text-transform: capitalize;
  }

  /* Owner tracker breakdown in expanded row */
  .owner-tracker-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    padding-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border-light);
  }

  .owner-tracker {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
  }

  .owner-tracker-count {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  /* Owner status breakdown */
  .owner-status-name {
    font-size: var(--font-size-md);
    text-transform: capitalize;
    color: var(--color-text-secondary);
  }

  .owner-status-count {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  /* Asset country/capacity meta */
  .asset-country {
    color: var(--color-text-secondary);
  }

  .asset-capacity {
    color: var(--color-text-tertiary);
    margin-left: var(--space-1);
  }

  .asset-capacity::before {
    content: '·';
    margin-right: var(--space-1);
    color: var(--color-gray-300);
  }

  /* More assets link */
  .more-assets {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    padding: var(--space-2) var(--space-3);
    font-style: normal;
    text-decoration: none;
    background: var(--color-bg-tertiary);
    border: var(--border-width) solid var(--color-border);
    text-align: center;
    display: block;
  }

  .more-assets:hover {
    background: var(--color-border);
    color: var(--color-text-primary);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .row-details-wrapper,
    .row-expand {
      transition: none;
    }
  }

  @media (max-width: 768px) {
    .screener-layout {
      padding: var(--space-8) var(--space-5) 100px;
    }

    .stats-hero {
      flex-direction: column;
      gap: var(--space-5);
    }

    .stat-group {
      flex-wrap: wrap;
      gap: var(--space-6);
    }

    .status-donut {
      flex-direction: column;
      align-items: flex-start;
    }

    .tracker-breakdown {
      grid-template-columns: 1fr;
    }

    .country-breakdown {
      grid-template-columns: 1fr 1fr;
    }

    .row-main {
      grid-template-columns: 32px 40px 1fr 40px;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
    }

    .row-stats,
    .row-status-bar {
      display: none;
    }

    .row-flower {
      display: flex;
    }

    .row-details {
      padding: var(--space-4);
    }

    .owner-tracker-breakdown {
      flex-direction: column;
      gap: var(--space-2);
    }
  }
</style>
