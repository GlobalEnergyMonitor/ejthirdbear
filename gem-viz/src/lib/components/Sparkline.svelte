<script>
  /**
   * Sparkline
   * Lightweight sparkline chart for temporal data
   * Shows trend over time with smooth transitions
   */

  import { formatCompact } from '$lib/format';

  let {
    data = [], // Array of { x: number, y: number } or just numbers
    width = 200,
    height = 40,
    color = '#000',
    fillColor = '',
    label = '',
    showDots = false,
    showArea = true,
    showEndValue = true,
    compact = false,
  } = $props();

  // Normalize data to { x, y } format, filtering out null/undefined values
  const normalizedData = $derived.by(() => {
    if (!data.length) return [];

    // Filter out null/undefined values first
    const validData = data.filter((d) => d != null);
    if (!validData.length) return [];

    // If data is just numbers, create x values
    if (typeof validData[0] === 'number') {
      return validData.filter((y) => !isNaN(y)).map((y, i) => ({ x: i, y }));
    }

    // Filter out objects with null/undefined/NaN x or y
    return validData.filter((p) => p.x != null && p.y != null && !isNaN(p.x) && !isNaN(p.y));
  });

  // Compute scales and path
  const chart = $derived.by(() => {
    const points = normalizedData;
    if (points.length < 2)
      return { path: '', areaPath: '', points: [], xRange: [0, 0], yRange: [0, 0] };

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);

    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    // Scale points to chart dimensions
    const scaled = points.map((p) => ({
      x: padding + ((p.x - xMin) / xRange) * chartWidth,
      y: padding + chartHeight - ((p.y - yMin) / yRange) * chartHeight,
      originalX: p.x,
      originalY: p.y,
    }));

    // Create SVG path
    const path = scaled.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');

    // Create area path (for fill)
    const areaPath =
      path +
      ` L ${scaled[scaled.length - 1].x} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`;

    return {
      path,
      areaPath,
      points: scaled,
      xRange: [xMin, xMax],
      yRange: [yMin, yMax],
      lastValue: points[points.length - 1]?.y,
    };
  });
</script>

<div class="sparkline" class:compact style="width: {width}px;">
  {#if label && !compact}
    <div class="label">{label}</div>
  {/if}

  <svg {width} {height}>
    {#if chart.points.length > 1}
      <!-- Area fill -->
      {#if showArea}
        <path d={chart.areaPath} fill={fillColor || color} opacity="0.1" />
      {/if}

      <!-- Line -->
      <path
        d={chart.path}
        fill="none"
        stroke={color}
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Dots -->
      {#if showDots}
        {#each chart.points as point}
          <circle cx={point.x} cy={point.y} r="2" fill={color}>
            <title>{point.originalX}: {formatCompact(point.originalY)}</title>
          </circle>
        {/each}
      {/if}

      <!-- End dot (always show) -->
      {#if chart.points.length > 0}
        {@const last = chart.points[chart.points.length - 1]}
        <circle cx={last.x} cy={last.y} r="3" fill={color}>
          <title>{last.originalX}: {formatCompact(last.originalY)}</title>
        </circle>
      {/if}
    {:else}
      <text x={width / 2} y={height / 2} font-size="10" fill="#999" text-anchor="middle">
        No data
      </text>
    {/if}
  </svg>

  {#if !compact}
    <div class="footer">
      {#if chart.xRange[0] !== chart.xRange[1]}
        <span class="range">{chart.xRange[0]} - {chart.xRange[1]}</span>
      {/if}
      {#if showEndValue && chart.lastValue != null}
        <span class="value">{formatCompact(chart.lastValue)}</span>
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
  .sparkline {
    display: inline-block;
  }

  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin-bottom: 2px;
  }

  svg {
    display: block;
  }

  path {
    transition: d 0.3s ease;
  }

  circle {
    transition:
      cx 0.3s ease,
      cy 0.3s ease;
  }

  .footer {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #999;
    margin-top: 2px;
  }

  .value {
    font-weight: 600;
    color: #333;
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
