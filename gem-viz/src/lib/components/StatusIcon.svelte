<script>
  /**
   * StatusIcon - Inline SVG status indicator from Observable notebook
   * Shows different icons based on grouped status:
   * - proposed: yellow circle
   * - cancelled: grey X
   * - retired: dark purple X
   * - operating: no icon (clean look)
   */
  import { regroupStatus, colors } from '$lib/ownership-theme';

  let { status = '', size = 10 } = $props();

  const groupedStatus = $derived(regroupStatus(status));
  const r = size / 2;
  const strokeWidth = Math.max(1.25, size * 0.125);
</script>

{#if groupedStatus === 'proposed'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon proposed">
    <circle cx={r} cy={r} r={r * 0.7} fill={colors.yellow} />
  </svg>
{:else if groupedStatus === 'cancelled'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon cancelled">
    <line x1={r * 0.3} y1={r * 0.3} x2={size - r * 0.3} y2={size - r * 0.3}
          stroke={colors.grey} stroke-width={strokeWidth} stroke-linecap="round" />
    <line x1={size - r * 0.3} y1={r * 0.3} x2={r * 0.3} y2={size - r * 0.3}
          stroke={colors.grey} stroke-width={strokeWidth} stroke-linecap="round" />
  </svg>
{:else if groupedStatus === 'retired'}
  <svg width={size} height={size} viewBox="0 0 {size} {size}" class="status-icon retired">
    <line x1={r * 0.3} y1={r * 0.3} x2={size - r * 0.3} y2={size - r * 0.3}
          stroke={colors.midnightPurple} stroke-width={strokeWidth} stroke-linecap="round" />
    <line x1={size - r * 0.3} y1={r * 0.3} x2={r * 0.3} y2={size - r * 0.3}
          stroke={colors.midnightPurple} stroke-width={strokeWidth} stroke-linecap="round" />
  </svg>
{/if}

<style>
  .status-icon {
    display: inline-block;
    vertical-align: middle;
    margin-left: 4px;
    flex-shrink: 0;
  }
</style>
