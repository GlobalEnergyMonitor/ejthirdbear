<script>
  /**
   * InvestigationStatusChart - Status distribution for investigation cart
   * Shows operating/proposed/retired breakdown for assets in the investigation
   */

  import { regroupStatus, colors } from '$lib/design-tokens';

  // Props - receive pre-computed data from parent
  let { assetDetails = [], entityPortfolios = [] } = $props();

  // Status colors
  const statusColors = {
    operating: '#4A57A8',
    proposed: colors.yellow,
    retired: colors.midnightPurple,
    cancelled: colors.grey,
    unknown: '#ddd',
  };

  // Compute status distribution from asset details
  const statusData = $derived.by(() => {
    const grouped = {};

    // Count from asset details (direct assets in cart)
    for (const asset of assetDetails) {
      const status = regroupStatus(String(asset.status || 'unknown'));
      grouped[status] = (grouped[status] || 0) + 1;
    }

    // Also add from entity portfolios
    for (const entity of entityPortfolios) {
      if (entity.operating_count)
        grouped['operating'] = (grouped['operating'] || 0) + entity.operating_count;
      if (entity.proposed_count)
        grouped['proposed'] = (grouped['proposed'] || 0) + entity.proposed_count;
      if (entity.retired_count)
        grouped['retired'] = (grouped['retired'] || 0) + entity.retired_count;
    }

    return Object.entries(grouped)
      .map(([status, count]) => ({ status, count }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
  });

  const total = $derived(statusData.reduce((sum, r) => sum + r.count, 0));

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

  const arcs = $derived(total > 0 ? getArcs(statusData, total) : []);
</script>

{#if total > 0}
  <div class="status-chart">
    <h3>Status Distribution</h3>
    <div class="chart-container">
      <svg viewBox="0 0 120 120" class="donut">
        {#each arcs as arc}
          <path d={arc.path} fill={arc.color}>
            <title>{arc.status}: {arc.count.toLocaleString()} ({arc.pct}%)</title>
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
            <span class="count">{arc.count.toLocaleString()}</span>
            <span class="pct">{arc.pct}%</span>
          </div>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .status-chart {
    padding: 16px;
    background: var(--color-white);
  }

  h3 {
    margin: 0 0 16px 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }

  .chart-container {
    display: flex;
    align-items: center;
    gap: 24px;
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
    gap: 8px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .label {
    flex: 1;
    text-transform: capitalize;
    color: var(--color-gray-700);
    min-width: 80px;
  }

  .count {
    font-family: monospace;
    color: var(--color-black);
    min-width: 50px;
    text-align: right;
  }

  .pct {
    font-family: monospace;
    color: var(--color-text-secondary);
    min-width: 35px;
    text-align: right;
  }

  @media print {
    .status-chart {
      page-break-inside: avoid;
    }
    .donut path {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .dot {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
