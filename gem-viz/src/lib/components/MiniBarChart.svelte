<script>
  /**
   * MiniBarChart
   * Horizontal bar chart for categorical breakdowns
   * Shows top N items with their relative counts
   */

  import { formatCompact } from '$lib/format';

  let {
    data = [], // Array of { label: string, value: number, color?: string }
    maxItems = 5,
    width = 200,
    barHeight = 14,
    gap = 3,
    color = '#000',
    label = '',
    showValues = true,
    colorMap = {}, // Optional map of label -> color
    compact = false, // Compact mode: smaller text, legend below
  } = $props();

  // Sort and limit data
  const chartData = $derived.by(() => {
    if (!data.length) return [];

    const sorted = [...data]
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, maxItems);

    const maxValue = Math.max(...sorted.map((d) => d.value));

    return sorted.map((d) => ({
      ...d,
      width: maxValue > 0 ? (d.value / maxValue) * 100 : 0,
      displayColor: colorMap[d.label] || d.color || color,
    }));
  });

  // Use chartData.length (actual bars to render) not data.length (could have more items)
  const totalHeight = $derived(Math.max(0, (barHeight + gap) * chartData.length - gap));
  const total = $derived(data.reduce((sum, d) => sum + d.value, 0));
</script>

<div class="mini-bar-chart" class:compact style="width: {width}px;">
  {#if label && !compact}
    <div class="header">
      <span class="label">{label}</span>
      {#if total > 0}
        <span class="total">{formatCompact(total)}</span>
      {/if}
    </div>
  {/if}

  {#if chartData.length > 0}
    <div class="bars" style="height: {totalHeight}px;">
      {#each chartData as item, i}
        <div class="bar-row" style="top: {i * (barHeight + gap)}px; height: {barHeight}px;">
          <div
            class="bar"
            style="width: {item.width}%; background: {item.displayColor};"
            title="{item.label}: {formatCompact(item.value)}"
          ></div>
          {#if !compact}
            <span class="bar-label">{item.label}</span>
          {/if}
          {#if showValues}
            <span class="bar-value">{formatCompact(item.value)}</span>
          {/if}
        </div>
      {/each}
    </div>

    {#if data.length > maxItems}
      <div class="overflow">+{data.length - maxItems} more</div>
    {/if}
  {:else}
    <div class="empty">No data</div>
  {/if}

  {#if compact && label}
    <div class="legend-below">
      <span class="legend-label">{label}</span>
    </div>
  {/if}
</div>

<style>
  .mini-bar-chart {
    font-size: 11px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }

  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .total {
    font-size: 10px;
    color: #999;
  }

  .bars {
    position: relative;
  }

  .bar-row {
    position: absolute;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .bar {
    height: 100%;
    min-width: 2px;
    transition: width 0.3s ease;
    opacity: 0.8;
  }

  .bar-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: #333;
  }

  .bar-value {
    color: #666;
    font-family: monospace;
    font-size: 10px;
  }

  .overflow {
    margin-top: 4px;
    font-size: 9px;
    color: #999;
  }

  .empty {
    color: #999;
    font-size: 10px;
    padding: 10px 0;
    text-align: center;
  }

  /* Compact mode */
  .mini-bar-chart.compact {
    font-size: 9px;
  }

  .mini-bar-chart.compact .bar-value {
    font-size: 8px;
  }

  .legend-below {
    margin-top: 4px;
    text-align: center;
  }

  .legend-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
  }
</style>
