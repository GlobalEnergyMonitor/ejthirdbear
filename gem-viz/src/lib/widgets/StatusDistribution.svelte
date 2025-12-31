<script lang="ts">
  /**
   * StatusDistribution Widget
   * Donut chart showing operating vs proposed vs retired vs cancelled
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { regroupStatus, colors } from '$lib/ownership-theme';
  import { formatCount } from '$lib/format';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  interface StatusRow {
    status: string;
    count: number;
  }

  // Props
  let { tracker = null as string | null, title = 'Status Distribution' } = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<StatusRow[]>([]);
  let queryTime = $state(0);

  // Derived values
  const total = $derived(data.reduce((sum, r) => sum + r.count, 0));

  // Status colors
  const statusColors: Record<string, string> = {
    operating: '#4A57A8',
    proposed: colors.yellow,
    retired: colors.midnightPurple,
    cancelled: colors.grey,
    unknown: '#ddd',
  };

  async function loadData() {
    loading = true;
    error = null;
    const startTime = Date.now();

    const trackerFilter = tracker ? `WHERE "Tracker" = '${tracker}'` : '';

    try {
      const result = await widgetQuery<{ status: string; count: number }>(`
        SELECT
          "Status" as status,
          COUNT(DISTINCT "GEM unit ID") as count
        FROM ownership
        ${trackerFilter}
        GROUP BY "Status"
        ORDER BY count DESC
      `);

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      // Regroup statuses
      const grouped: Record<string, number> = {};
      for (const row of result.data || []) {
        const group = regroupStatus(String(row.status));
        grouped[group] = (grouped[group] || 0) + Number(row.count);
      }

      data = Object.entries(grouped)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      queryTime = Date.now() - startTime;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      queryTime = Date.now() - startTime;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadData();
  });

  $effect(() => {
    void tracker;
    loadData();
  });

  // Calculate arc paths for donut
  function getArcs(items: StatusRow[], totalCount: number) {
    const arcs: Array<{ path: string; color: string; status: string; count: number; pct: number }> =
      [];
    let startAngle = -Math.PI / 2;
    const cx = 60,
      cy = 60,
      r = 50,
      innerR = 30;

    for (const item of items) {
      const angle = (item.count / totalCount) * 2 * Math.PI;
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
        pct: Math.round((item.count / totalCount) * 100),
      });

      startAngle = endAngle;
    }

    return arcs;
  }

  const arcs = $derived(total > 0 ? getArcs(data, total) : []);
</script>

<div class="widget status-distribution">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{queryTime}ms</span>
  </header>

  <LoadingWrapper {loading} {error} empty={data.length === 0} loadingMessage="Loading status...">
    <div class="chart-container">
      <svg viewBox="0 0 120 120" class="donut">
        {#each arcs as arc}
          <path d={arc.path} fill={arc.color}>
            <title>{arc.status}: {arc.count} ({arc.pct}%)</title>
          </path>
        {/each}
        <text x="60" y="60" text-anchor="middle" dominant-baseline="middle" class="total">
          {formatCount(total)}
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
  </LoadingWrapper>
</div>

<style>
  .widget {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid #eee;
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
    color: #999;
    font-family: monospace;
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
    fill: #333;
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
    color: #333;
  }
  .pct {
    font-family: monospace;
    color: #666;
  }
</style>
