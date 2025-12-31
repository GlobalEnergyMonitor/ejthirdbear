<script>
  /**
   * MiniHistogram
   * Lightweight histogram for showing distributions
   * Updates reactively as data changes
   */

  import { formatCompact, formatSI } from '$lib/format';

  let {
    data = [],
    bins = 10,
    width = 200,
    height = 60,
    color = '#000',
    label = '',
    unit = '',
    showAxis = true,
    compact = false,
  } = $props();

  // Compute histogram bins from data
  const histogram = $derived.by(() => {
    if (!data.length) return { bins: [], max: 0, min: 0, maxCount: 0 };

    const values = data.filter((d) => d != null && !isNaN(d)).map(Number);
    if (!values.length) return { bins: [], max: 0, min: 0, maxCount: 0 };

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const binWidth = range / bins;

    // Create bins
    const binData = Array.from({ length: bins }, (_, i) => ({
      x0: min + i * binWidth,
      x1: min + (i + 1) * binWidth,
      count: 0,
    }));

    // Count values in each bin
    for (const v of values) {
      const binIndex = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      binData[binIndex].count++;
    }

    const maxCount = Math.max(...binData.map((b) => b.count));

    return { bins: binData, max, min, maxCount };
  });

  // Layout
  const padding = { top: 4, right: 4, bottom: showAxis ? 16 : 4, left: 4 };
  const chartWidth = $derived(width - padding.left - padding.right);
  const chartHeight = $derived(height - padding.top - padding.bottom);
  // Ensure barWidth is at least 1px to prevent rendering issues
  const barWidth = $derived(Math.max(1, chartWidth / bins - 1));
</script>

<div class="mini-histogram" class:compact style="width: {width}px;">
  {#if label && !compact}
    <div class="label">{label}</div>
  {/if}

  <svg {width} {height}>
    <g transform="translate({padding.left}, {padding.top})">
      {#if histogram.bins.length > 0}
        {#each histogram.bins as bin, i}
          {@const barHeight =
            histogram.maxCount > 0 ? (bin.count / histogram.maxCount) * chartHeight : 0}
          <rect
            x={i * (chartWidth / bins)}
            y={chartHeight - barHeight}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={bin.count > 0 ? 0.8 : 0.1}
          >
            <title
              >{formatCompact(bin.count)} items ({formatSI(bin.x0)}–{formatSI(bin.x1)}
              {unit})</title
            >
          </rect>
        {/each}

        {#if showAxis}
          <!-- X-axis labels -->
          <text x="0" y={chartHeight + 12} font-size="9" fill="#666" text-anchor="start">
            {formatSI(histogram.min)}
          </text>
          <text x={chartWidth} y={chartHeight + 12} font-size="9" fill="#666" text-anchor="end">
            {formatSI(histogram.max)}
          </text>
        {/if}
      {:else}
        <text
          x={chartWidth / 2}
          y={chartHeight / 2}
          font-size="10"
          fill="#999"
          text-anchor="middle"
        >
          No data
        </text>
      {/if}
    </g>
  </svg>

  {#if data.length > 0 && !compact}
    <div class="stats">
      <span class="stat">{formatCompact(data.length)} items</span>
      {#if unit}
        <span class="stat">{unit}</span>
      {/if}
    </div>
  {/if}

  {#if compact && label}
    <div class="legend-below">
      <span class="legend-label">{label}</span>
    </div>
  {/if}
</div>

<style>
  .mini-histogram {
    display: inline-block;
  }

  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin-bottom: 4px;
  }

  svg {
    display: block;
  }

  rect {
    transition:
      height 0.2s ease,
      y 0.2s ease;
  }

  .stats {
    display: flex;
    gap: 8px;
    font-size: 9px;
    color: #999;
    margin-top: 2px;
  }

  .legend-below {
    margin-top: 2px;
    text-align: center;
  }

  .legend-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
  }
</style>
