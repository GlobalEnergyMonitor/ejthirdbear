<script>
  /**
   * StatusIcon - Inline SVG status indicator from Observable notebook
   * Shows different icons based on grouped status:
   * - prospective: light circle
   * - cancelled: light X
   * - retired: dark X
   * - operating: no icon (clean look)
   */
  import { regroupStatus, getAggregatedStatusColor } from '$lib/design-tokens';

  let { status = '', size = 10 } = $props();

  const groupedStatus = $derived(regroupStatus(status));
  const r = $derived(size / 2);
  const statusColor = $derived(getAggregatedStatusColor(status));
  const strokeWidth = $derived(Math.max(1.25, size * 0.125));
</script>

{#if groupedStatus === 'prospective' || groupedStatus === 'proposed'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon proposed">
    <circle cx={r} cy={r} r={r * 0.7} fill={statusColor} />
  </svg>
{:else if groupedStatus === 'cancelled'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon cancelled">
    <line
      x1={r * 0.3}
      y1={r * 0.3}
      x2={size - r * 0.3}
      y2={size - r * 0.3}
      stroke={statusColor}
      stroke-width={strokeWidth}
      stroke-linecap="round"
    />
    <line
      x1={size - r * 0.3}
      y1={r * 0.3}
      x2={r * 0.3}
      y2={size - r * 0.3}
      stroke={statusColor}
      stroke-width={strokeWidth}
      stroke-linecap="round"
    />
  </svg>
{:else if groupedStatus === 'retired'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon retired">
    <line
      x1={r * 0.3}
      y1={r * 0.3}
      x2={size - r * 0.3}
      y2={size - r * 0.3}
      stroke={statusColor}
      stroke-width={strokeWidth}
      stroke-linecap="round"
    />
    <line
      x1={size - r * 0.3}
      y1={r * 0.3}
      x2={r * 0.3}
      y2={size - r * 0.3}
      stroke={statusColor}
      stroke-width={strokeWidth}
      stroke-linecap="round"
    />
  </svg>
{/if}

<style>
  .status-icon {
    display: inline-block;
    vertical-align: middle;
    margin-left: 4px;
    flex-shrink: 0;
  }

  .status-icon.proposed {
    animation: gentle-pulse 2.5s ease-in-out infinite;
  }

  @keyframes gentle-pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.7;
      transform: scale(1.1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .status-icon.proposed {
      animation: none;
    }
  }
</style>
