<script>
  /**
   * StatusDistribution Widget
   * Donut chart showing operating vs proposed vs retired vs cancelled
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { regroupStatus, colors } from '$lib/ownership-theme';

  // Props
  let { tracker = null, title = 'Status Distribution' } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let results = $state([]);
  let queryTime = $state(0);
  let total = $state(0);

  // Status colors
  const statusColors = {
    operating: '#4A57A8',
    proposed: colors.yellow,
    retired: colors.midnightPurple,
    cancelled: colors.grey,
    unknown: '#ddd',
  };

  async function loadData() {
    loading = true;
    error = null;

    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';

    const sql = `
      SELECT
        "Status" as status,
        COUNT(DISTINCT "GEM unit ID") as count
      FROM ownership
      ${trackerFilter}
      GROUP BY "Status"
      ORDER BY count DESC
    `;

    const result = await widgetQuery(sql);

    if (result.success) {
      // Regroup statuses
      const grouped = {};
      for (const row of result.data || []) {
        const group = regroupStatus(String(row.status));
        grouped[group] = (grouped[group] || 0) + Number(row.count);
      }

      results = Object.entries(grouped)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      total = results.reduce((sum, r) => sum + r.count, 0);
      queryTime = result.executionTime || 0;
    } else {
      error = result.error;
    }

    loading = false;
  }

  onMount(() => {
    loadData();
  });

  $effect(() => {
    void tracker;
    loadData();
  });

  // Calculate arc paths for donut
  function getArcs(data, total) {
    const arcs = [];
    let startAngle = -Math.PI / 2;
    const cx = 60,
      cy = 60,
      r = 50,
      innerR = 30;

    for (const item of data) {
      const angle = (item.count / total) * 2 * Math.PI;
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
        color: statusColors[item.status] || statusColors.unknown,
        status: item.status,
        count: item.count,
        pct: Math.round((item.count / total) * 100),
      });

      startAngle = endAngle;
    }

    return arcs;
  }

  const arcs = $derived(total > 0 ? getArcs(results, total) : []);
</script>

<div class="widget status-distribution">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{queryTime}ms</span>
  </header>

  {#if loading}
    <div class="loading">Loading status...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if results.length === 0}
    <div class="empty">No data available</div>
  {:else}
    <div class="chart-container">
      <svg viewBox="0 0 120 120" class="donut">
        {#each arcs as arc}
          <path d={arc.path} fill={arc.color}>
            <title>{arc.status}: {arc.count} ({arc.pct}%)</title>
          </path>
        {/each}
        <text x="60" y="60" text-anchor="middle" dominant-baseline="middle" class="total">
          {total.toLocaleString()}
        </text>
      </svg>

      <div class="legend">
        {#each arcs as arc}
          <div class="legend-item">
            <span class="dot" style="background: {arc.color}"></span>
            <span class="label">{arc.status}</span>
            <span class="pct">{arc.pct}%</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .widget {
    background: var(--color-white);
    border: 1px solid var(--color-border);
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--color-gray-100);
    padding-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .query-time {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-family: monospace;
  }

  .loading,
  .error,
  .empty {
    font-size: 13px;
    color: var(--color-text-secondary);
    padding: 20px 0;
    text-align: center;
  }
  .error {
    color: var(--color-error);
  }

  .chart-container {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .donut {
    width: 120px;
    height: 120px;
    flex-shrink: 0;
  }
  .total {
    font-size: 14px;
    font-weight: bold;
    fill: var(--color-gray-700);
  }

  .legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .label {
    flex: 1;
    text-transform: capitalize;
    color: var(--color-gray-700);
  }
  .pct {
    font-family: monospace;
    color: var(--color-text-secondary);
  }
</style>
