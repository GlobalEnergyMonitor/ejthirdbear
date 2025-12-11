<script>
  /**
   * OwnershipArc - Arc-inside-circle ownership percentage indicator
   * Faithful port of the Observable d3.arc() pattern
   *
   * Shows a filled wedge inside a stroked circle, where the wedge
   * represents the ownership percentage.
   */
  import { colors } from '$lib/ownership-theme';

  let {
    percentage = 100,
    size = 30,
    fillColor = colors.navy,
    strokeColor = colors.navy,
    strokeWidth = 2,
    unknownColor = '#B9B9B9',
    interactive = false,
    onHover = () => {},
    onLeave = () => {},
  } = $props();

  // Calculate arc path using d3.arc() math
  function describeArc(cx, cy, radius, startAngle, endAngle) {
    // Convert to radians (d3.arc uses radians, starting from 12 o'clock)
    const start = angleToPoint(cx, cy, radius, startAngle);
    const end = angleToPoint(cx, cy, radius, endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    // SVG arc path: M center, L start, A radius radius 0 largeArc 1 end, Z
    return [
      'M',
      cx,
      cy,
      'L',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArc,
      1,
      end.x,
      end.y,
      'Z',
    ].join(' ');
  }

  function angleToPoint(cx, cy, radius, angle) {
    // Angle 0 = 12 o'clock, clockwise
    return {
      x: cx + radius * Math.sin(angle),
      y: cy - radius * Math.cos(angle),
    };
  }

  // Reactive calculations
  let radius = $derived(size / 2);
  let innerRadius = $derived(radius - strokeWidth);

  // Convert percentage to radians (0-100% -> 0-2π)
  let endAngle = $derived((percentage / 100) * 2 * Math.PI);

  // Determine fill color - grey if no percentage known
  let arcFill = $derived(
    percentage !== null && percentage !== undefined ? fillColor : unknownColor
  );

  // Arc path (only if percentage > 0 and < 100)
  let arcPath = $derived(
    percentage > 0 && percentage < 100
      ? describeArc(radius, radius, innerRadius - 1, 0, endAngle)
      : null
  );
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 {size} {size}"
  class="ownership-arc"
  class:interactive
  role={interactive ? 'button' : 'img'}
  tabindex={interactive ? 0 : -1}
  onmouseenter={interactive ? onHover : undefined}
  onmouseleave={interactive ? onLeave : undefined}
>
  <!-- Background circle with stroke -->
  <circle
    cx={radius}
    cy={radius}
    r={innerRadius}
    fill={percentage >= 100 ? arcFill : `${fillColor}1A`}
    stroke={strokeColor}
    stroke-width={strokeWidth}
  />

  <!-- Filled arc wedge for partial ownership -->
  {#if arcPath}
    <path d={arcPath} fill={arcFill} class="arc-fill" />
  {/if}
</svg>

<style>
  .ownership-arc {
    display: inline-block;
    vertical-align: middle;
  }

  .ownership-arc.interactive {
    cursor: pointer;
  }

  .ownership-arc.interactive:hover circle {
    fill-opacity: 0.3;
  }

  .arc-fill {
    pointer-events: none;
  }
</style>
