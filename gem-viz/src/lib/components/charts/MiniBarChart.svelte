<script>
  /**
   * MiniBarChart
   * Horizontal bar chart for categorical breakdowns
   * Shows top N items with their relative counts
   */

  import { formatCompact } from '$lib/utils/format';
  import { colors } from '$lib/design-tokens';

  let {
    data = [], // Array of { label: string, value: number, color?: string }
    compareData = [], // Optional baseline data for comparison (same shape as data)
    maxItems = 5,
    width = 200,
    barHeight = 14,
    gap = 3,
    color = colors.navy, // GEM Navy as default bar color
    label = '',
    showValues = true,
    colorMap = {}, // Optional map of label -> color
    compact = false, // Compact mode: smaller text, legend below
  } = $props();

  // Build a lookup from compareData for ghost bars
  const compareMap = $derived.by(() => {
    if (!compareData.length) return new Map();
    const map = new Map();
    for (const d of compareData) map.set(d.label, d.value);
    return map;
  });

  const hasComparison = $derived(compareData.length > 0 && data.length > 0);

  // Sort and limit data
  const chartData = $derived.by(() => {
    if (!data.length) return [];

    const sorted = [...data]
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, maxItems);

    // When comparing, scale bars relative to the max of either dataset (for same labels)
    const filteredMax = Math.max(...sorted.map((d) => d.value));
    const compareMax = hasComparison
      ? Math.max(...sorted.map((d) => compareMap.get(d.label) || 0))
      : 0;
    const maxValue = Math.max(filteredMax, compareMax);

    return sorted.map((d) => {
      const compareValue = compareMap.get(d.label) || 0;
      return {
        ...d,
        width: maxValue > 0 ? (d.value / maxValue) * 100 : 0,
        compareWidth: maxValue > 0 && compareValue > 0 ? (compareValue / maxValue) * 100 : 0,
        compareValue,
        displayColor: colorMap[d.label] || d.color || color,
      };
    });
  });

  // Use chartData.length (actual bars to render) not data.length (could have more items)
  const totalHeight = $derived(Math.max(0, (barHeight + gap) * chartData.length - gap));
  const total = $derived(data.reduce((sum, d) => sum + d.value, 0));
  const compareTotal = $derived(compareData.reduce((sum, d) => sum + d.value, 0));
</script>

<div class="mini-bar-chart" class:compact style="width: {width}px;">
  {#if label && !compact}
    <div class="header">
      <span class="label">{label}</span>
      {#if total > 0}
        <span class="total">
          {formatCompact(total)}{#if hasComparison}
            / {formatCompact(compareTotal)}{/if}
        </span>
      {/if}
    </div>
  {/if}

  {#if chartData.length > 0}
    <div class="bars" style="height: {totalHeight}px;">
      {#each chartData as item, i}
        <div class="bar-row" style="top: {i * (barHeight + gap)}px; height: {barHeight}px;">
          {#if hasComparison && item.compareWidth > 0}
            <div
              class="bar bar-ghost"
              style="width: {item.compareWidth}%; background: {item.displayColor};"
              title="{item.label} (all): {formatCompact(item.compareValue)}"
            ></div>
          {/if}
          <div
            class="bar"
            class:bar-filtered={hasComparison}
            style="width: {item.width}%; background: {item.displayColor};"
            title="{item.label}: {formatCompact(item.value)}{hasComparison
              ? ` / ${formatCompact(item.compareValue)}`
              : ''}"
          ></div>
          {#if !compact}
            <span class="bar-label">{item.label}</span>
          {/if}
          {#if showValues}
            <span class="bar-value">
              {formatCompact(item.value)}{#if hasComparison && item.compareValue > 0}<span
                  class="compare-value">/{formatCompact(item.compareValue)}</span
                >{/if}
            </span>
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
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-secondary);
  }

  .total {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
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

  .bar-ghost {
    position: absolute;
    left: 0;
    top: 0;
    opacity: 0.15;
    z-index: 0;
  }

  .bar-filtered {
    position: relative;
    z-index: 1;
  }

  .compare-value {
    opacity: 0.5;
    font-size: 0.85em;
  }

  .bar-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--color-text-primary);
  }

  .bar-value {
    color: var(--color-text-secondary);
    font-family: var(--font-family-data);
    font-size: var(--font-size-xs);
  }

  .overflow {
    margin-top: var(--space-1);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .empty {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    padding: var(--space-3) 0;
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
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
  }
</style>
