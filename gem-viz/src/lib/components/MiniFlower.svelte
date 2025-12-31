<script>
  /**
   * MiniFlower - Tiny inline Nadieh Bremer–style flower
   *
   * A compact version of OwnershipFlower for use in lists, search results, etc.
   * Renders tracker distribution as colored petals with capacity-based length.
   *
   * @example
   * <MiniFlower trackers={[
   *   { tracker: 'Coal Plant', count: 5, capacity: 2000 },
   *   { tracker: 'Gas Plant', count: 3, capacity: 1500 }
   * ]} size={24} />
   */
  import { colorByTracker, colors } from '$lib/ownership-theme';

  let {
    /** @type {{ tracker: string, count: number, capacity: number }[]} */
    trackers = [],
    size = 24,
    showTooltip = true,
  } = $props();

  // Helper to safely convert BigInt to Number
  function num(val) {
    if (val === null || val === undefined) return 0;
    return typeof val === 'bigint' ? Number(val) : Number(val) || 0;
  }

  // Build petal data from tracker stats
  const petals = $derived.by(() => {
    // Safety check - ensure trackers is an array
    const trackersArray = Array.isArray(trackers) ? trackers : [];
    if (trackersArray.length === 0) return [];

    // Convert BigInt values to Number for math operations
    const normalized = trackersArray.map((t) => ({
      tracker: t.tracker,
      count: num(t.count),
      capacity: num(t.capacity),
    }));

    const sorted = [...normalized].sort((a, b) => b.count - a.count);
    const totalCount = sorted.reduce((sum, t) => sum + t.count, 0) || 1;
    const maxCapacity = Math.max(...sorted.map((t) => t.capacity)) || 1;

    const innerRadius = size * 0.15;
    const maxRadius = size * 0.45;
    const minRadius = size * 0.25;

    let angleAcc = 0;
    return sorted.map((t) => {
      const angle = (t.count / totalCount) * 2 * Math.PI;
      const angleStart = angleAcc;
      const angleEnd = angleAcc + angle;
      angleAcc = angleEnd;

      // Petal length based on capacity (log scale for better distribution)
      const capacityRatio = t.capacity > 0 ? Math.log10(t.capacity) / Math.log10(maxCapacity) : 0.3;
      const radius = minRadius + (maxRadius - minRadius) * Math.max(capacityRatio, 0.3);

      return {
        tracker: t.tracker,
        count: t.count,
        capacity: t.capacity,
        angleStart,
        angleEnd,
        innerRadius,
        outerRadius: radius,
        color: colorByTracker.get(t.tracker) || colors.grey,
      };
    });
  });

  // Generate SVG arc path
  function arcPath(startAngle, endAngle, innerR, outerR) {
    // Adjust angles to start from top (12 o'clock)
    const start = startAngle - Math.PI / 2;
    const end = endAngle - Math.PI / 2;

    const x1 = Math.cos(start) * innerR;
    const y1 = Math.sin(start) * innerR;
    const x2 = Math.cos(start) * outerR;
    const y2 = Math.sin(start) * outerR;
    const x3 = Math.cos(end) * outerR;
    const y3 = Math.sin(end) * outerR;
    const x4 = Math.cos(end) * innerR;
    const y4 = Math.sin(end) * innerR;

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1} Z`;
  }

  // Tooltip text (convert BigInt to Number for display)
  const tooltipText = $derived(
    (Array.isArray(trackers) ? trackers : [])
      .map((t) => `${t.tracker}: ${num(t.count)} assets`)
      .join('\n')
  );
</script>

{#if petals.length > 0}
  <svg
    class="mini-flower"
    width={size}
    height={size}
    viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
    aria-label="Tracker distribution"
  >
    {#if showTooltip}
      <title>{tooltipText}</title>
    {/if}

    {#each petals as petal}
      <path
        d={arcPath(petal.angleStart, petal.angleEnd, petal.innerRadius, petal.outerRadius)}
        fill={petal.color}
        stroke="#111"
        stroke-width={size < 20 ? 0.3 : 0.5}
        fill-opacity="0.9"
      />
    {/each}

    <!-- Center dot -->
    <circle r={size * 0.08} fill="#fff" stroke="#111" stroke-width={size < 20 ? 0.5 : 0.75} />
  </svg>
{:else}
  <!-- Empty state: simple circle -->
  <svg
    class="mini-flower empty"
    width={size}
    height={size}
    viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
  >
    <circle r={size * 0.3} fill="none" stroke="#ccc" stroke-width="1" />
  </svg>
{/if}

<style>
  .mini-flower {
    display: inline-block;
    vertical-align: middle;
    flex-shrink: 0;
  }
</style>
