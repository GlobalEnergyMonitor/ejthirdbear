<script lang="ts">
  /**
   * FieldHistogram
   * Interactive histogram for numeric fields in the FieldGuide right panel.
   * Accepts a pre-sorted values array from the /fields/{field}/stats API endpoint.
   * Supports blended quantile/equal-width binning per the Observable prototype.
   */

  let {
    values = [] as number[],
    histogramWeight = 0.5,
    unit = '',
    nullCount = 0,
    totalRows = 0,
  } = $props();

  let numBins = $state(10);
  const weight = 0.5;

  // Binary search: index of first element >= target
  function lowerBound(arr: number[], target: number): number {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // Compute blended bin edges and counts from pre-sorted values
  const bins = $derived.by(() => {
    if (!values.length || numBins < 1) return [];

    const n = Math.min(numBins, values.length);
    const min = values[0];
    const max = values[values.length - 1];
    if (min === max) {
      return [{ lo: min, hi: max, count: values.length, label: fmtNum(min) }];
    }

    // Equal-width edges
    const ewEdges = Array.from({ length: n + 1 }, (_, i) => min + (max - min) * (i / n));

    // Quantile edges (equal-count)
    const qEdges = Array.from({ length: n + 1 }, (_, i) => {
      const idx = Math.min(Math.round((i * (values.length - 1)) / n), values.length - 1);
      return values[idx];
    });

    // Blend: weight=1 → equal-width, weight=0 → quantile
    let edges = ewEdges.map((ew, i) => ew * weight + qEdges[i] * (1 - weight));

    // Deduplicate and ensure strictly increasing
    edges = [...new Set(edges.map((e) => +e.toFixed(6)))].sort((a, b) => a - b);
    if (edges[0] > min) edges.unshift(min);
    if (edges[edges.length - 1] < max) edges.push(max);

    const result: { lo: number; hi: number; count: number; label: string }[] = [];
    for (let i = 0; i < edges.length - 1; i++) {
      const lo = edges[i];
      const hi = edges[i + 1];
      const isLast = i === edges.length - 2;
      // Count values in [lo, hi) — last bin is [lo, hi] inclusive
      const from = lowerBound(values, lo);
      const to = isLast ? values.length : lowerBound(values, hi);
      const count = to - from;
      const label = isLast
        ? `${fmtNum(lo)} – ${fmtNum(hi)}`
        : `${fmtNum(lo)} – <${fmtNum(hi)}`;
      result.push({ lo, hi, count, label });
    }
    return result.filter((b) => b.count > 0);
  });

  const maxCount = $derived(Math.max(...bins.map((b) => b.count), 1));
  const nonNullCount = $derived(values.length);
  const nullPct = $derived(totalRows > 0 ? nullCount / totalRows : 0);

  function fmtNum(n: number): string {
    if (Math.abs(n) >= 10000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (Math.abs(n) >= 100) return n.toFixed(1);
    if (Math.abs(n) >= 1) return n.toFixed(2);
    return n.toPrecision(3);
  }

  function fmtCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function pct(n: number): string {
    return `${((n / (nonNullCount || 1)) * 100).toFixed(1)}%`;
  }
</script>

<div class="field-histogram">
  <!-- Null info -->
  {#if nullCount > 0}
    <div class="null-row">
      <span class="null-label">Null</span>
      <span class="null-bar-wrap">
        <span class="null-bar" style="width: {(nullPct * 100).toFixed(1)}%"></span>
      </span>
      <span class="null-count">{fmtCount(nullCount)} ({(nullPct * 100).toFixed(1)}%)</span>
    </div>
  {/if}

  <!-- Histogram bars -->
  <div class="bars">
    {#each bins as bin}
      {@const barPct = (bin.count / maxCount) * 100}
      <div class="bar-row">
        <span class="bar-label">{bin.label}{unit ? ` ${unit}` : ''}</span>
        <span class="bar-wrap">
          <span class="bar" style="width: {barPct.toFixed(1)}%"></span>
        </span>
        <span class="bar-count">{fmtCount(bin.count)} ({pct(bin.count)})</span>
      </div>
    {/each}
  </div>

  <!-- Controls -->
  <div class="controls">
    <label class="bins-control">
      <span class="bins-label">Bins</span>
      <input type="range" min="2" max="40" step="1" bind:value={numBins} />
      <span class="bins-value">{numBins}</span>
    </label>
  </div>

  <div class="summary">
    {fmtCount(nonNullCount)} values · {bins.length} bins
    {#if unit} · {unit}{/if}
  </div>
</div>

<style>
  .field-histogram {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    font-family: var(--font-family);
  }

  /* Null row */
  .null-row {
    display: grid;
    grid-template-columns: 100px 1fr 80px;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-1);
  }

  .null-label {
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    font-weight: var(--font-weight-semibold);
  }

  .null-bar-wrap {
    height: 10px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .null-bar {
    display: block;
    height: 100%;
    background: var(--color-gray-300);
    border-radius: var(--radius-full);
  }

  .null-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-align: right;
  }

  /* Histogram bars */
  .bars {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 110px 1fr 90px;
    align-items: center;
    gap: var(--space-2);
  }

  .bar-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-wrap {
    height: 14px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .bar {
    display: block;
    height: 100%;
    background: var(--gem-teal);
    border-radius: var(--radius-full);
    transition: width 0.2s ease;
    min-width: 2px;
  }

  .bar-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  /* Controls */
  .controls {
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-1);
  }

  .bins-control {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-3);
    cursor: pointer;
  }

  .bins-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
  }

  .bins-value {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    min-width: 1.5em;
    text-align: right;
  }

  input[type='range'] {
    width: 100%;
    accent-color: var(--gem-teal);
    cursor: pointer;
    border: none;
  }

  /* Summary */
  .summary {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }
</style>
