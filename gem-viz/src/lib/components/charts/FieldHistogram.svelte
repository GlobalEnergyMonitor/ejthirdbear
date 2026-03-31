<script lang="ts">
  /**
   * FieldHistogram
   * Interactive histogram for numeric fields in the FieldGuide right panel.
   * Accepts a pre-sorted values array from the /fields/{field}/stats API endpoint.
   *
   * Binning algorithm ported from Stephen's Observable notebook (binDataWeightedJenksy1):
   * - Point mass detection (dominant values get own bins)
   * - Tail peeling (outlier tails isolated before core binning)
   * - Jenks natural breaks (DP on bucket histogram, minimizes within-bin SSD)
   * - Quantile-Jenks blending via weight slider (0 = pure Jenks, 1 = pure quantile)
   * - IQR-aware magnitude-local step snapping for nice round labels
   * - Adaptive K/M/B number formatting
   */

  let {
    values = [] as number[],
    unit = '',
    nullCount = 0,
    totalRows = 0,
  } = $props();

  let numBins = $state(4);
  let weight = $state(0.7);

  // =========================================================================
  // Jenks-weighted binning — ported from Observable notebook
  // =========================================================================

  interface Bin {
    lo: number;
    hi: number;
    count: number;
    label: string;
  }

  function quantileFrom(data: number[], q: number): number {
    const m = data.length;
    if (m === 0) return 0;
    const pos = q * (m - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return data[lo] + (data[hi] - data[lo]) * (pos - lo);
  }

  function computeMinStep(r: number): number {
    const magnitude = Math.pow(10, Math.floor(Math.log10(r)));
    const normalized = r / magnitude;
    const raw = magnitude / 10;
    return normalized >= 5 ? raw * 5 : normalized >= 2 ? raw * 2 : raw;
  }

  function clean(v: number): number {
    return parseFloat(v.toPrecision(10));
  }

  const bins = $derived.by((): Bin[] => {
    if (!values.length || numBins < 1) return [];

    const sorted = values; // already pre-sorted from API
    const n = sorted.length;
    const dataMin = sorted[0];
    const dataMax = sorted[n - 1];
    const range = dataMax - dataMin;

    if (range === 0) {
      const label = unit ? `${dataMin} ${unit}` : `${dataMin}`;
      return [{ lo: dataMin, hi: dataMax, count: n, label }];
    }

    // IQR-aware step computation
    const q25 = quantileFrom(sorted, 0.25);
    const q75 = quantileFrom(sorted, 0.75);
    const iqr = q75 - q25;
    const referenceRange = iqr > 0 ? iqr : range;
    const minStep = computeMinStep(referenceRange);

    function localStep(v: number): number {
      if (v === 0) return minStep;
      const valMag = Math.pow(10, Math.floor(Math.log10(Math.abs(v))));
      return Math.max(minStep, valMag / 10);
    }
    function snapToStep(v: number): number {
      const s = localStep(v);
      return parseFloat((Math.round(v / s) * s).toPrecision(10));
    }
    function snapDown(v: number): number {
      if (v === 0) return 0;
      const s = localStep(Math.abs(v));
      return parseFloat((Math.floor(v / s) * s).toPrecision(10));
    }
    function snapUp(v: number): number {
      if (v === 0) return 0;
      const s = localStep(Math.abs(v));
      return parseFloat((Math.ceil(v / s) * s).toPrecision(10));
    }

    function formatValue(v: number): string {
      const s = localStep(Math.abs(v) || minStep);
      const sMag = Math.floor(Math.log10(s));
      if (sMag >= 9) return (v / 1e9).toPrecision(4).replace(/\.?0+$/, '') + 'B';
      if (sMag >= 6) return (v / 1e6).toPrecision(4).replace(/\.?0+$/, '') + 'M';
      if (sMag >= 3) return (v / 1e3).toPrecision(4).replace(/\.?0+$/, '') + 'K';
      if (sMag >= 0) return Math.round(v).toString();
      return v.toFixed(Math.max(0, -sMag));
    }

    // --- Point mass detection ---
    const fairShare = n / numBins;
    const valueCounts = new Map<number, number>();
    for (const v of sorted) valueCounts.set(v, (valueCounts.get(v) || 0) + 1);

    const pointMasses = [...valueCounts.entries()]
      .filter(([, count]) => count > fairShare * 2)
      .map(([v, count]) => ({ v, count }))
      .sort((a, b) => a.v - b.v);

    const pointMassValues = new Set(pointMasses.map((p) => p.v));
    const remainingData = sorted.filter((v) => !pointMassValues.has(v));
    const remainingBins = numBins - pointMasses.length;

    if (remainingBins < 1) {
      return pointMasses.map(({ v, count }) => ({
        lo: v,
        hi: v,
        count,
        label: unit ? `${formatValue(v)} ${unit}` : formatValue(v),
      }));
    }

    const rMin = remainingData.length > 0 ? remainingData[0] : dataMin;
    const rMax = remainingData.length > 0 ? remainingData[remainingData.length - 1] : dataMax;
    const outerMin = rMin === 0 ? 0 : snapDown(rMin);
    const outerMax = snapUp(rMax);

    let boundaries: number[];

    if (numBins <= 2 || remainingBins <= 2) {
      // Simple equal-width for very few bins
      const span = outerMax - outerMin;
      boundaries = Array.from({ length: remainingBins + 1 }, (_, i) =>
        clean(outerMin + (i / remainingBins) * span)
      );
    } else {
      // --- Tail peeling ---
      function peelTails(
        data: number[],
        availableBins: number,
        oLo: number,
        oHi: number,
        depth = 0
      ): {
        leftTails: number[];
        rightTails: number[];
        coreLo: number;
        coreHi: number;
      } {
        const maxDepth = availableBins <= 4 ? 0 : 1;
        if (data.length === 0 || availableBins < 3 || depth > maxDepth) {
          return { leftTails: [], rightTails: [], coreLo: oLo, coreHi: oHi };
        }

        const tailQ = Math.min(0.95, 1 - 1 / (availableBins * 1.5));
        const qRight = quantileFrom(data, tailQ);
        const qLeft = quantileFrom(data, 1 - tailQ);
        const span = oHi - oLo;
        const halfSpan = span / 2;
        const tailThreshold = 1 / availableBins;

        const hasRight = (oHi - qRight) / span > tailThreshold;
        const hasLeft = (qLeft - oLo) / span > tailThreshold;

        if (!hasRight && !hasLeft) {
          return { leftTails: [], rightTails: [], coreLo: oLo, coreHi: oHi };
        }

        const rightBoundary = hasRight
          ? clean(snapToStep(availableBins >= 4 ? Math.max(qRight, oHi - halfSpan) : qRight))
          : null;
        const leftBoundary = hasLeft
          ? clean(snapToStep(availableBins >= 4 ? Math.min(qLeft, oLo + halfSpan) : qLeft))
          : null;

        const coreData = data.filter(
          (v) => (!hasLeft || v >= leftBoundary!) && (!hasRight || v <= rightBoundary!)
        );

        const remainingB = availableBins - (hasRight ? 1 : 0) - (hasLeft ? 1 : 0);
        const coreLo = hasLeft ? leftBoundary! : oLo;
        const coreHi = hasRight ? rightBoundary! : oHi;
        const inner = peelTails(coreData, remainingB, coreLo, coreHi, depth + 1);

        return {
          leftTails: hasLeft ? [leftBoundary!, ...inner.leftTails] : inner.leftTails,
          rightTails: hasRight ? [...inner.rightTails, rightBoundary!] : inner.rightTails,
          coreLo: inner.coreLo,
          coreHi: inner.coreHi,
        };
      }

      const { leftTails, rightTails, coreLo, coreHi } = peelTails(
        remainingData,
        remainingBins,
        outerMin,
        outerMax
      );

      const tailBinCount = leftTails.length + rightTails.length;
      const coreBins = remainingBins - tailBinCount;

      // --- Jenks DP on bucket histogram ---
      const BUCKETS = 500;
      const bucketWidth = (outerMax - outerMin) / BUCKETS;
      const bucketCounts = new Array(BUCKETS).fill(0);
      for (const v of remainingData) {
        const idx = Math.min(Math.floor((v - outerMin) / bucketWidth), BUCKETS - 1);
        bucketCounts[idx]++;
      }

      const bucketEdge = (i: number) => outerMin + i * bucketWidth;
      const bucketMid = (i: number) => outerMin + (i + 0.5) * bucketWidth;

      const cumCounts = new Array(BUCKETS + 1).fill(0);
      const cumSum = new Array(BUCKETS + 1).fill(0);
      const cumSumSq = new Array(BUCKETS + 1).fill(0);
      for (let i = 0; i < BUCKETS; i++) {
        const mid = bucketMid(i);
        cumCounts[i + 1] = cumCounts[i] + bucketCounts[i];
        cumSum[i + 1] = cumSum[i] + bucketCounts[i] * mid;
        cumSumSq[i + 1] = cumSumSq[i] + bucketCounts[i] * mid * mid;
      }

      function countInRange(lo: number, hi: number): number {
        return cumCounts[hi] - cumCounts[lo];
      }
      function withinBinSSD(lo: number, hi: number): number {
        const c = countInRange(lo, hi);
        if (c === 0) return 0;
        const s = cumSum[hi] - cumSum[lo];
        const sq = cumSumSq[hi] - cumSumSq[lo];
        return sq - (s * s) / c;
      }

      const coreLoIdx = Math.min(Math.round((coreLo - outerMin) / bucketWidth), BUCKETS);
      const coreHiIdx = Math.min(Math.round((coreHi - outerMin) / bucketWidth), BUCKETS);

      let innerBoundaries: number[] = [];

      if (coreBins >= 2) {
        const N = coreHiIdx - coreLoIdx;
        const K = coreBins;
        const lssd = (lo: number, hi: number) => withinBinSSD(coreLoIdx + lo, coreLoIdx + hi);

        const dp = Array.from({ length: K + 1 }, () => new Float64Array(N + 1).fill(Infinity));
        const backtrack = Array.from({ length: K + 1 }, () => new Int32Array(N + 1));

        dp[0][0] = 0;
        for (let i = 1; i <= N; i++) {
          dp[1][i] = lssd(0, i);
          backtrack[1][i] = 0;
        }
        for (let k = 2; k <= K; k++) {
          for (let i = k; i <= N; i++) {
            for (let j = k - 1; j < i; j++) {
              if (dp[k - 1][j] === Infinity) continue;
              const cost = dp[k - 1][j] + lssd(j, i);
              if (cost < dp[k][i]) {
                dp[k][i] = cost;
                backtrack[k][i] = j;
              }
            }
          }
        }

        // Backtrack to find break positions
        const breakBuckets: number[] = [];
        let pos = N;
        for (let k = K; k >= 2; k--) {
          pos = backtrack[k][pos];
          breakBuckets.unshift(pos);
        }

        // Raw Jenks breaks
        const jenksRaw = breakBuckets.map((b) => bucketEdge(coreLoIdx + b));

        // Quantile raw breaks over core data
        const coreData = remainingData.filter((v) => v >= coreLo && v <= coreHi);
        const qBreaksRaw = Array.from({ length: coreBins - 1 }, (_, i) =>
          quantileFrom(coreData, (i + 1) / coreBins)
        );

        // Blend raw values first (weight=1 → pure quantile, weight=0 → pure Jenks), then snap once
        innerBoundaries = jenksRaw.map((jRaw, i) => {
          const blended = jRaw * (1 - weight) + qBreaksRaw[i] * weight;
          return clean(snapToStep(blended));
        });

        // Enforce monotonicity
        for (let i = 1; i < innerBoundaries.length; i++) {
          if (innerBoundaries[i] <= innerBoundaries[i - 1]) {
            innerBoundaries[i] = clean(innerBoundaries[i - 1] + localStep(innerBoundaries[i - 1]));
          }
        }

        // Snap boundaries near point masses to exact values
        innerBoundaries = innerBoundaries.map((v) => {
          for (const { v: pmv } of pointMasses) {
            if (Math.abs(v - pmv) <= localStep(pmv) * 2) return clean(pmv);
          }
          return v;
        });
      }

      boundaries = [outerMin, ...leftTails, ...innerBoundaries, ...rightTails, outerMax];

      // Monotonicity forward pass
      for (let i = 1; i < boundaries.length - 1; i++) {
        if (boundaries[i] <= boundaries[i - 1]) {
          boundaries[i] = clean(boundaries[i - 1] + localStep(boundaries[i - 1]));
        }
      }
      // Backward pass
      for (let i = boundaries.length - 2; i > 0; i--) {
        if (boundaries[i] >= boundaries[i + 1]) {
          boundaries[i] = clean(boundaries[i + 1] - localStep(boundaries[i + 1]));
        }
      }
    }

    // --- Count remaining data into bins ---
    const counts = new Array(remainingBins).fill(0);
    for (const v of remainingData) {
      if (v < boundaries[0] || v > boundaries[remainingBins]) continue;
      if (v === boundaries[remainingBins]) {
        counts[remainingBins - 1]++;
        continue;
      }
      let lo = 0,
        hi = remainingBins - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (v < boundaries[mid + 1]) hi = mid;
        else lo = mid + 1;
      }
      counts[lo]++;
    }

    // --- Merge range bins and point mass bins ---
    const allBins: Bin[] = [];

    for (let i = 0; i < remainingBins; i++) {
      if (boundaries[i] >= boundaries[i + 1]) continue;
      const isLast = i === remainingBins - 1;
      const hiStr = unit
        ? `${formatValue(boundaries[i + 1])} ${unit}`
        : formatValue(boundaries[i + 1]);
      const label = isLast
        ? `${formatValue(boundaries[i])} – ${hiStr}`
        : `${formatValue(boundaries[i])} – <${hiStr}`;
      allBins.push({ lo: boundaries[i], hi: boundaries[i + 1], count: counts[i], label });
    }

    for (const { v, count } of pointMasses) {
      const label = unit ? `${formatValue(v)} ${unit}` : formatValue(v);
      allBins.push({ lo: v, hi: v, count, label });
    }

    allBins.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    return allBins;
  });

  const maxCount = $derived(Math.max(...bins.map((b) => b.count), 1));
  const nonNullCount = $derived(values.length);
  const nullPct = $derived(totalRows > 0 ? nullCount / totalRows : 0);

  function fmtCount(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  }

  function pct(n: number): string {
    // Divide by totalRows (incl. nulls) to match Observable notebook's nUnits denominator
    const denom = totalRows > 0 ? totalRows : nonNullCount || 1;
    return `${((n / denom) * 100).toFixed(1)}%`;
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

  <!-- Controls -->
  <div class="controls">
    <label class="bins-control">
      <span class="bins-label">Bins</span>
      <input type="range" min="2" max="12" step="1" bind:value={numBins} />
      <span class="bins-value">{numBins}</span>
    </label>
    <label class="bins-control">
      <span class="bins-label">Weight:</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={weight} />
      <span class="bins-value">{weight.toFixed(2)}</span>
    </label>
  </div>

  <!-- Histogram bars -->
  <div class="bars">
    {#each bins as bin}
      {@const barPct = (bin.count / maxCount) * 100}
      <div class="bar-row">
        <span class="bar-label">{bin.label}</span>
        <span class="bar-wrap">
          <span class="bar" style="width: {barPct.toFixed(1)}%"></span>
        </span>
        <span class="bar-count">{fmtCount(bin.count)} ({pct(bin.count)})</span>
      </div>
    {/each}
  </div>

  <div class="summary">
    {fmtCount(nonNullCount)} values · {bins.length} bins
    {#if unit}
      · {unit}{/if}
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
    grid-template-columns: 130px 1fr 90px;
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
    display: flex;
    gap: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: var(--space-1);
  }

  .bins-control {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    flex: 1;
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
