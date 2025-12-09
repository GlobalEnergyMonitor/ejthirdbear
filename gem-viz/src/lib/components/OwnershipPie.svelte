<script>
  import { colors } from '$lib/ownership-theme';

  // Props
  let {
    percentage = 100,
    size = 30,
    fillColor = colors.navy,
    strokeColor = colors.navy,
    strokeWidth = 2,
    showLabel = false,
  } = $props();

  // Calculate arc path for the filled portion
  function describeArc(x, y, radius, startAngle, endAngle) {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
      'M',
      x,
      y,
      'L',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
      'Z',
    ].join(' ');
  }

  function polarToCartesian(cx, cy, radius, angleInDegrees) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleInRadians),
      y: cy + radius * Math.sin(angleInRadians),
    };
  }

  // Reactive calculations
  let radius = $derived(size / 2);
  let innerRadius = $derived(radius - strokeWidth);
  let endAngle = $derived((percentage / 100) * 360);
  let arcPath = $derived(
    percentage >= 100
      ? null // Full circle, use circle element
      : percentage <= 0
        ? null // Empty, no arc
        : describeArc(radius, radius, innerRadius - 1, 0, endAngle)
  );
</script>

<svg width={size} height={size} viewBox="0 0 {size} {size}" class="ownership-pie">
  <!-- Background circle (stroke only) -->
  <circle
    cx={radius}
    cy={radius}
    r={innerRadius}
    fill={percentage >= 100 ? fillColor : `${fillColor}22`}
    stroke={strokeColor}
    stroke-width={strokeWidth}
  />

  <!-- Filled arc for partial ownership -->
  {#if arcPath && percentage > 0 && percentage < 100}
    <path d={arcPath} fill={fillColor} stroke="none" />
  {/if}

  <!-- Optional label -->
  {#if showLabel}
    <text
      x={radius}
      y={radius}
      text-anchor="middle"
      dominant-baseline="central"
      font-size={size * 0.3}
      fill={percentage >= 50 ? colors.white : colors.navy}
      font-family="monospace"
    >
      {percentage.toFixed(0)}%
    </text>
  {/if}
</svg>

<style>
  .ownership-pie {
    display: inline-block;
    vertical-align: middle;
  }
</style>
