<script lang="ts">
  /**
   * IronSteelMethodsWidget — two horizontal stacked bar charts showing
   * iron and steel production capacity by operating status and technology type.
   *
   * Data source: /assets?asset_type=iron-steel-plant (via listAssets)
   * Iron classification: iron_steel_plant_fields.furnace_category ∈ {blast_furnace, dri}
   * Steel classification: iron_steel_plant_fields.furnace_category ∈ {bof, eaf, induction, ohf}
   * DRI sub-type: iron_steel_plant_fields.current_or_initial_reductant ∈ {"coal (solid)", "gas", "unknown"}
   */

  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';
  import { listAssets } from '$lib/ownership-api';

  let selectedCountries = $state<string[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // ---------------------------------------------------------------------------
  // Data types
  // ---------------------------------------------------------------------------

  interface Segment {
    tech: string;
    capacity: number;
  }
  interface ChartRow {
    status: string;
    label: string;
    segments: Segment[];
    total: number;
  }
  interface BarSeg extends Segment {
    x: number;
    w: number;
  }

  // ---------------------------------------------------------------------------
  // Category definitions
  // ---------------------------------------------------------------------------

  const IRON_CATS = ['BF', 'DRI coal', 'DRI gas', 'DRI other/unknown'] as const;
  const IRON_COLORS: Record<string, string> = {
    'BF': '#601515',
    'DRI coal': '#a03030',
    'DRI gas': '#e8a898',
    'DRI other/unknown': '#ccd4cc',
  };

  const STEEL_CATS = ['BOF', 'EAF', 'IF', 'OHF'] as const;
  const STEEL_COLORS: Record<string, string> = {
    'BOF': '#cc7060',
    'EAF': '#4a90a8',
    'IF': '#a8d0e0',
    'OHF': '#8a9898',
  };

  const STATUS_ORDER = [
    'announced',
    'pre-permit',
    'permitted',
    'construction',
    'operating',
    'mothballed',
    'retired',
    'cancelled',
    'shelved',
  ];
  const STATUS_LABEL: Record<string, string> = {
    'announced': 'Announced',
    'pre-permit': 'Pre-permit',
    'permitted': 'Permitted',
    'construction': 'Construction',
    'operating': 'Operating',
    'mothballed': 'Mothballed',
    'retired': 'Retired',
    'cancelled': 'Cancelled',
    'shelved': 'Shelved',
  };

  // ---------------------------------------------------------------------------
  // Classification helpers
  // ---------------------------------------------------------------------------

  function classifyIron(
    fc: string | null,
    reductant: string | null
  ): (typeof IRON_CATS)[number] | null {
    if (fc === 'blast_furnace') return 'BF';
    if (fc === 'dri') {
      if (reductant === 'coal (solid)') return 'DRI coal';
      if (reductant === 'gas') return 'DRI gas';
      return 'DRI other/unknown'; // 'unknown' or null
    }
    return null;
  }

  function classifySteel(fc: string | null): (typeof STEEL_CATS)[number] | null {
    if (fc === 'bof') return 'BOF';
    if (fc === 'eaf') return 'EAF';
    if (fc === 'induction') return 'IF';
    if (fc === 'ohf') return 'OHF';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Data aggregation
  // ---------------------------------------------------------------------------

  function buildRows(
    map: Map<string, Map<string, number>>,
    cats: readonly string[]
  ): ChartRow[] {
    return STATUS_ORDER.filter((s) => map.has(s))
      .map((status) => {
        const techMap = map.get(status)!;
        const segments = cats
          .map((t) => ({ tech: t, capacity: techMap.get(t) ?? 0 }))
          .filter((s) => s.capacity > 0);
        const total = segments.reduce((acc, s) => acc + s.capacity, 0);
        return { status, label: STATUS_LABEL[status] ?? status, segments, total };
      })
      .filter((r) => r.total > 0);
  }

  let ironRows = $state<ChartRow[]>([]);
  let steelRows = $state<ChartRow[]>([]);

  async function fetchData() {
    loading = true;
    error = null;
    ironRows = [];
    steelRows = [];

    try {
      const ironMap = new Map<string, Map<string, number>>();
      const steelMap = new Map<string, Map<string, number>>();

      const countryParam = selectedCountries.length > 0 ? selectedCountries : undefined;

      let offset = 0;
      while (true) {
        const page = await listAssets({
          asset_type: 'iron-steel-plant',
          country: countryParam,
          limit: 500,
          offset,
        });

        const items = page.results;
        if (items.length === 0) break;

        for (const asset of items) {
          const fields = asset.raw.iron_steel_plant_fields as Record<string, unknown> | null | undefined;
          const fc = (fields?.furnace_category ?? null) as string | null;
          const reductant = (fields?.current_or_initial_reductant ?? null) as string | null;
          const capacity = Number(asset.capacity) || 0;
          if (capacity <= 0) continue;

          const status = (asset.status ?? '').toLowerCase();
          if (!STATUS_ORDER.includes(status)) continue;

          const ironCat = classifyIron(fc, reductant);
          if (ironCat) {
            if (!ironMap.has(status)) ironMap.set(status, new Map());
            const m = ironMap.get(status)!;
            m.set(ironCat, (m.get(ironCat) ?? 0) + capacity);
          }

          const steelCat = classifySteel(fc);
          if (steelCat) {
            if (!steelMap.has(status)) steelMap.set(status, new Map());
            const m = steelMap.get(status)!;
            m.set(steelCat, (m.get(steelCat) ?? 0) + capacity);
          }
        }

        if (items.length < 500 || offset >= 50000) break;
        offset += 500;
      }

      ironRows = buildRows(ironMap, IRON_CATS);
      steelRows = buildRows(steelMap, STEEL_CATS);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    // Spread to access all elements and establish reactive dependency on contents
    const _dep = [...selectedCountries];
    void _dep;
    fetchData();
  });

  // ---------------------------------------------------------------------------
  // SVG chart helpers
  // ---------------------------------------------------------------------------

  const LABEL_W = 110;
  const BAR_H = 34;
  const ROW_GAP = 10;
  const R_PAD = 20;
  const AXIS_H = 32;
  const CHART_W = 670;
  const SVG_W = LABEL_W + CHART_W + R_PAD;

  function svgH(rows: ChartRow[]): number {
    return rows.length * (BAR_H + ROW_GAP) + AXIS_H;
  }

  function maxTotal(rows: ChartRow[]): number {
    return Math.max(0, ...rows.map((r) => r.total));
  }

  function niceTicks(max: number): number[] {
    if (max <= 0) return [0];
    const rough = max / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const candidates = [1, 2, 2.5, 5, 10].map((c) => c * mag);
    const step =
      candidates.find((s) => max / s >= 4 && max / s <= 10) ?? candidates[candidates.length - 1];
    const nicedMax = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= nicedMax; v += step) ticks.push(v);
    return ticks;
  }

  function fmtTick(v: number): string {
    if (v >= 1000) return `${Math.round(v / 1000)}k`;
    return String(Math.round(v));
  }

  function computeSegs(segments: Segment[], tickMax: number): BarSeg[] {
    let x = 0;
    return segments.map((s) => {
      const w = tickMax > 0 ? (s.capacity / tickMax) * CHART_W : 0;
      const seg: BarSeg = { ...s, x, w };
      x += w;
      return seg;
    });
  }

  function activeCats<T extends string>(rows: ChartRow[], cats: readonly T[]): T[] {
    return cats.filter((c) => rows.some((r) => r.segments.some((s) => s.tech === c)));
  }
</script>

<div class="ism-widget">
  <!-- Country selector -->
  <div class="ism-filter">
    <div class="ism-filter-label">Country / Region</div>
    <CountryMultiSelect bind:selected={selectedCountries} />
    {#if selectedCountries.length === 0}
      <div class="ism-scope-note">Showing global data (all countries)</div>
    {/if}
  </div>

  <!-- States -->
  {#if loading}
    <div class="ism-state">
      <div class="ism-spinner"></div>
      Loading data…
    </div>
  {:else if error}
    <div class="ism-state ism-state--error">Error: {error}</div>
  {:else if ironRows.length === 0 && steelRows.length === 0}
    <div class="ism-state">No data found for the selected countries.</div>
  {:else}
    <div class="ism-charts">

      <!-- Iron chart -->
      {#if ironRows.length > 0}
        {@const iMax = maxTotal(ironRows)}
        {@const iTicks = niceTicks(iMax)}
        {@const iTickMax = iTicks[iTicks.length - 1]}
        {@const iActive = activeCats(ironRows, IRON_CATS)}
        <div class="ism-panel">
          <h3 class="ism-chart-title">Ironmaking capacity</h3>
          <p class="ism-chart-subtitle">By status and technology type, in ttpa</p>
          <div class="ism-legend">
            {#each iActive as cat}
              <span class="ism-legend-item">
                <span class="ism-swatch" style="background:{IRON_COLORS[cat]}"></span>
                {cat}
              </span>
            {/each}
          </div>
          <svg
            viewBox="0 0 {SVG_W} {svgH(ironRows)}"
            style="width:100%;display:block;overflow:visible"
            aria-label="Ironmaking capacity by status and technology"
          >
            <!-- Grid lines -->
            {#each iTicks as tick}
              {@const gx = LABEL_W + (tick / iTickMax) * CHART_W}
              <line
                x1={gx} y1={0}
                x2={gx} y2={ironRows.length * (BAR_H + ROW_GAP)}
                stroke="#e4e4dc" stroke-width="1"
              />
            {/each}
            <!-- Bars -->
            {#each ironRows as row, i}
              {@const barY = i * (BAR_H + ROW_GAP) + ROW_GAP / 2}
              {@const segs = computeSegs(row.segments, iTickMax)}
              <text
                x={LABEL_W - 8}
                y={barY + BAR_H / 2}
                text-anchor="end"
                dominant-baseline="middle"
                font-size="13"
                fill="#1a2c3a"
              >{row.label}</text>
              {#each segs as seg}
                <rect
                  x={LABEL_W + seg.x}
                  y={barY}
                  width={seg.w}
                  height={BAR_H}
                  fill={IRON_COLORS[seg.tech] ?? '#999'}
                >
                  <title>{seg.tech}: {Math.round(seg.capacity).toLocaleString()} ttpa</title>
                </rect>
              {/each}
            {/each}
            <!-- X-axis labels -->
            {#each iTicks as tick}
              {@const ax = LABEL_W + (tick / iTickMax) * CHART_W}
              <text
                x={ax}
                y={ironRows.length * (BAR_H + ROW_GAP) + 18}
                text-anchor="middle"
                font-size="11"
                fill="#6a7a7a"
              >{fmtTick(tick)}</text>
            {/each}
          </svg>
        </div>
      {/if}

      <!-- Steel chart -->
      {#if steelRows.length > 0}
        {@const sMax = maxTotal(steelRows)}
        {@const sTicks = niceTicks(sMax)}
        {@const sTickMax = sTicks[sTicks.length - 1]}
        {@const sActive = activeCats(steelRows, STEEL_CATS)}
        <div class="ism-panel">
          <h3 class="ism-chart-title">Steelmaking capacity</h3>
          <p class="ism-chart-subtitle">By status and technology type, in ttpa</p>
          <div class="ism-legend">
            {#each sActive as cat}
              <span class="ism-legend-item">
                <span class="ism-swatch" style="background:{STEEL_COLORS[cat]}"></span>
                {cat}
              </span>
            {/each}
          </div>
          <svg
            viewBox="0 0 {SVG_W} {svgH(steelRows)}"
            style="width:100%;display:block;overflow:visible"
            aria-label="Steelmaking capacity by status and technology"
          >
            {#each sTicks as tick}
              {@const gx = LABEL_W + (tick / sTickMax) * CHART_W}
              <line
                x1={gx} y1={0}
                x2={gx} y2={steelRows.length * (BAR_H + ROW_GAP)}
                stroke="#e4e4dc" stroke-width="1"
              />
            {/each}
            {#each steelRows as row, i}
              {@const barY = i * (BAR_H + ROW_GAP) + ROW_GAP / 2}
              {@const segs = computeSegs(row.segments, sTickMax)}
              <text
                x={LABEL_W - 8}
                y={barY + BAR_H / 2}
                text-anchor="end"
                dominant-baseline="middle"
                font-size="13"
                fill="#1a2c3a"
              >{row.label}</text>
              {#each segs as seg}
                <rect
                  x={LABEL_W + seg.x}
                  y={barY}
                  width={seg.w}
                  height={BAR_H}
                  fill={STEEL_COLORS[seg.tech] ?? '#999'}
                >
                  <title>{seg.tech}: {Math.round(seg.capacity).toLocaleString()} ttpa</title>
                </rect>
              {/each}
            {/each}
            {#each sTicks as tick}
              {@const ax = LABEL_W + (tick / sTickMax) * CHART_W}
              <text
                x={ax}
                y={steelRows.length * (BAR_H + ROW_GAP) + 18}
                text-anchor="middle"
                font-size="11"
                fill="#6a7a7a"
              >{fmtTick(tick)}</text>
            {/each}
          </svg>
        </div>
      {/if}

    </div>

    <div class="ism-source">Source: Global Energy Monitor, GIST</div>
  {/if}
</div>

<style>
  .ism-widget {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    color: var(--color-text-primary, #1a2c3a);
    max-width: 960px;
  }

  /* ── Filter ──────────────────────────────────────────────────────────── */
  .ism-filter {
    margin-bottom: 28px;
  }

  .ism-filter-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-secondary, #5a7080);
    margin-bottom: 8px;
  }

  .ism-scope-note {
    margin-top: 6px;
    font-size: 12px;
    color: var(--color-text-secondary, #5a7080);
    font-style: italic;
  }

  /* ── State messages ──────────────────────────────────────────────────── */
  .ism-state {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 48px 0;
    font-size: 14px;
    color: var(--color-text-secondary, #5a7080);
  }

  .ism-state--error {
    color: #b03030;
  }

  .ism-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid #e0e0da;
    border-top-color: #4a8fa8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Charts ──────────────────────────────────────────────────────────── */
  .ism-charts {
    display: flex;
    flex-direction: column;
    gap: 40px;
  }

  .ism-panel {
    width: 100%;
  }

  .ism-chart-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-text-primary, #1a2c3a);
    margin: 0 0 2px;
  }

  .ism-chart-subtitle {
    font-size: 13px;
    color: var(--color-text-secondary, #5a7080);
    margin: 0 0 12px;
  }

  /* ── Legend ──────────────────────────────────────────────────────────── */
  .ism-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-bottom: 14px;
  }

  .ism-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-text-secondary, #5a7080);
  }

  .ism-swatch {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* ── Source ──────────────────────────────────────────────────────────── */
  .ism-source {
    margin-top: 24px;
    font-size: 12px;
    color: var(--color-text-secondary, #5a7080);
  }
</style>
