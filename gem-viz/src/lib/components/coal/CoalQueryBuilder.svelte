<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { COAL_QUERY_KEY } from '$lib/state/coal-query.svelte';
  import type { CoalQueryState } from '$lib/state/coal-query.svelte';
  import {
    type AggFn,
    type CoalQueryFilters,
    type Tracker,
    getGroupableFields,
    getAggregatableFields,
  } from '$lib/data-config/coal-field-schema';

  const q = getContext<CoalQueryState>(COAL_QUERY_KEY);
  const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // ── API options (for pickers) ──────────────────────────────────────────────

  let statusOptions  = $state<string[]>([]);
  let countryOptions = $state<string[]>([]);
  let otherOptions   = $state<Record<string, string[]>>({});
  let countrySearch  = $state('');

  async function fetchStats(tracker: 'coal-plant' | 'coal-mine', key: string): Promise<string[]> {
    try {
      const slug = tracker === 'coal-plant' ? 'coal-plants' : 'coal-mines';
      const res = await fetch(`${API_BASE}/catalog/metadata/${slug}/fields/${key}/stats`);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.value_counts))
        return data.value_counts.map((vc: { value: string }) => String(vc.value));
    } catch { /* ignore */ }
    return [];
  }

  const primaryTracker = $derived<'coal-plant' | 'coal-mine'>(
    q.query.trackers.includes('coal-plant') ? 'coal-plant' : 'coal-mine'
  );

  $effect(() => {
    const t = primaryTracker;
    fetchStats(t, 'status').then(v => (statusOptions = v));
    fetchStats(t, 'country_area').then(v => (countryOptions = v));
  });

  // Fetch options lazily when a picker opens for a non-standard field
  $effect(() => {
    const key = openPicker;
    const t = primaryTracker;
    const SKIP = new Set(['tracker', '__fields', 'status', 'country_area', null]);
    if (SKIP.has(key)) return;
    untrack(() => {
      if (key && !otherOptions[key]) {
        fetchStats(t, key).then(v => { otherOptions = { ...otherOptions, [key]: v }; });
      }
    });
  });

  // ── Filter field definitions ───────────────────────────────────────────────

  type FilterFieldDef = { key: string; label: string; phrase: string };

  const PLANT_FIELDS: FilterFieldDef[] = [
    { key: 'status',                          label: 'Operating status', phrase: 'with a status of'        },
    { key: 'country_area',                    label: 'Country',          phrase: 'located in'              },
    { key: 'combustion_technology',           label: 'Technology',       phrase: 'using'                   },
    { key: 'coal_type',                       label: 'Coal type',        phrase: 'burning'                 },
    { key: 'chp',                             label: 'CHP',              phrase: 'with CHP'                },
    { key: 'captive',                         label: 'Captive',          phrase: 'as captive'              },
    { key: 'subnational_unit_province_state', label: 'Subnational unit', phrase: 'in'                      },
  ];
  const MINE_FIELDS: FilterFieldDef[] = [
    { key: 'status',        label: 'Operating status', phrase: 'with a status of' },
    { key: 'country_area',  label: 'Country',          phrase: 'located in'       },
    { key: 'mine_type',     label: 'Mine type',        phrase: 'of mine type'     },
    { key: 'mining_method', label: 'Mining method',    phrase: 'using'            },
    { key: 'coal_grade',    label: 'Coal grade',       phrase: 'of coal grade'    },
  ];

  const availableFilterFields = $derived<FilterFieldDef[]>(
    q.query.trackers.length === 2
      ? [...new Map([...PLANT_FIELDS, ...MINE_FIELDS].map(f => [f.key, f])).values()]
      : q.query.trackers.includes('coal-plant') ? PLANT_FIELDS : MINE_FIELDS
  );

  // ── Shown filter fields ────────────────────────────────────────────────────

  let shownFields = $state<string[]>([]);

  $effect(() => {
    const isDirty = q.isDirty;
    untrack(() => { if (!isDirty) shownFields = []; });
  });

  $effect(() => {
    const f = q.query.filters;
    untrack(() => {
      for (const k of Object.keys(f) as (keyof CoalQueryFilters)[]) {
        const v = f[k];
        if (v != null && (Array.isArray(v) ? v.length > 0 : !!v) && !shownFields.includes(k)) {
          shownFields = [...shownFields, k];
        }
      }
    });
  });

  function toggleFilterField(key: string) {
    if (shownFields.includes(key)) {
      shownFields = shownFields.filter(k => k !== key);
      q.clearFilter(key as keyof CoalQueryFilters);
    } else {
      shownFields = [...shownFields, key];
      openPicker = key;
    }
  }

  // ── Picker state ───────────────────────────────────────────────────────────

  let openPicker = $state<string | null>(null);

  function togglePicker(key: string) {
    openPicker = openPicker === key ? null : key;
    if (openPicker !== 'country_area') countrySearch = '';
  }

  const panelTitle = $derived(() => {
    if (!openPicker) return '';
    if (openPicker === 'tracker')   return 'Project type';
    if (openPicker === '__fields')  return 'Add filter fields';
    return availableFilterFields.find(f => f.key === openPicker)?.label ?? openPicker;
  });

  // ── Trackers ───────────────────────────────────────────────────────────────

  const TRACKER_LABELS: Record<Tracker, string> = {
    'coal-plant': 'Coal Plants',
    'coal-mine':  'Coal Mines',
  };

  function removeTracker(t: Tracker) {
    const next = q.query.trackers.filter(x => x !== t);
    if (next.length > 0) q.setTrackers(next as Tracker[]);
  }

  function toggleTracker(t: Tracker) {
    const cur = q.query.trackers;
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    if (next.length > 0) q.setTrackers(next as Tracker[]);
  }

  // ── Filter mutations ───────────────────────────────────────────────────────

  function toggleStatus(s: string) {
    const cur = q.query.filters.status ?? [];
    const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s];
    q.setFilter('status', next.length ? next : undefined);
  }

  const countryDropdown = $derived(
    countrySearch.trim()
      ? countryOptions.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase())).slice(0, 50)
      : countryOptions.slice(0, 50)
  );

  function addCountry(c: string) {
    const cur = q.query.filters.country_area ?? [];
    if (!cur.includes(c)) q.setFilter('country_area', [...cur, c]);
  }
  function removeCountry(c: string) {
    const cur = q.query.filters.country_area ?? [];
    const next = cur.filter(x => x !== c);
    q.setFilter('country_area', next.length ? next : undefined);
  }

  function toggleValue(key: keyof CoalQueryFilters, val: string) {
    const cur = (q.query.filters[key] as string[] | undefined) ?? [];
    const next = cur.includes(val) ? cur.filter(v => v !== val) : [...cur, val];
    q.setFilter(key, next.length ? (next as CoalQueryFilters[typeof key]) : undefined);
  }

  // ── Output mode + groupBy + aggregate ─────────────────────────────────────

  let outputMode = $state<'data' | 'summary'>('data');

  $effect(() => {
    const hasSummary = q.query.groupBy.length > 0 || q.query.aggregates.length > 0;
    untrack(() => { if (hasSummary) outputMode = 'summary'; });
  });

  function setOutputMode(mode: 'data' | 'summary') {
    outputMode = mode;
    if (mode === 'data') { q.setGroupBy([]); q.setAggregates([]); }
  }

  const groupableFields    = $derived(getGroupableFields(q.query.trackers));
  const aggregatableFields = $derived(getAggregatableFields(q.query.trackers));

  function toggleGroupBy(field: string) {
    const cur = q.query.groupBy;
    q.setGroupBy(cur.includes(field) ? cur.filter(f => f !== field) : [...cur, field]);
  }

  function toggleAggregate(fn: AggFn, field: string) {
    const cur = q.query.aggregates;
    const exists = cur.some(a => a.fn === fn && a.field === field);
    q.setAggregates(exists
      ? cur.filter(a => !(a.fn === fn && a.field === field))
      : [...cur, { fn, field }]);
  }

  // ── Results: count ──────────────────────────────────────────���──────────────

  type CountResult = { total: number; byType: Record<string, number> };
  let countResult  = $state<CountResult | null>(null);
  let countLoading = $state(false);
  let countAbort: AbortController | null = null;

  $effect(() => {
    const url = `${q.apiUrl}&limit=1`;
    countAbort?.abort();
    countAbort = new AbortController();
    countLoading = true;
    countResult = null;
    fetch(url, { signal: countAbort.signal })
      .then(r => r.json())
      .then(data => {
        const total = data.total ?? data.count ?? 0;
        countResult = { total, byType: data.facets?.asset_type ?? {} };
        countLoading = false;
      })
      .catch(err => { if (err.name !== 'AbortError') countLoading = false; });
  });

  function fmt(n: number) { return n.toLocaleString(); }

  let apiCopied = $state(false);
  function copyApiUrl() {
    navigator.clipboard.writeText(q.apiUrl).then(() => {
      apiCopied = true;
      setTimeout(() => (apiCopied = false), 2000);
    });
  }

  // ── Results: table ─────────────────────────────────────────────────────────

  type TableCol = { key: string; altKey?: string; label: string };

  const tableCols = $derived<TableCol[]>((() => {
    const isPlant = q.query.trackers.includes('coal-plant');
    const isMine  = q.query.trackers.includes('coal-mine');
    if (isPlant && !isMine) return [
      { key: 'asset_name', altKey: 'name', label: 'Name' },
      { key: 'country_area', altKey: 'country', label: 'Country' },
      { key: 'status', label: 'Status' },
      { key: 'capacity_mw', label: 'Cap. (MW)' },
      { key: 'combustion_technology', label: 'Technology' },
    ];
    if (isMine && !isPlant) return [
      { key: 'asset_name', altKey: 'name', label: 'Name' },
      { key: 'country_area', altKey: 'country', label: 'Country' },
      { key: 'status', label: 'Status' },
      { key: 'mine_type', label: 'Mine Type' },
    ];
    return [
      { key: 'asset_name', altKey: 'name', label: 'Name' },
      { key: 'country_area', altKey: 'country', label: 'Country' },
      { key: 'status', label: 'Status' },
      { key: 'asset_type', label: 'Type' },
    ];
  })());

  function cellVal(row: Record<string, unknown>, col: TableCol): string {
    const v = row[col.key] ?? (col.altKey ? row[col.altKey] : undefined);
    if (v == null || v === '') return '—';
    return String(v);
  }

  let showTable   = $state(false);
  let tableRows   = $state<Record<string, unknown>[]>([]);
  let tableOffset = $state(0);
  let tableHasMore = $state(false);
  let tableLoading = $state(false);
  const PAGE = 50;

  async function loadTable(reset = false) {
    if (reset) { tableRows = []; tableOffset = 0; }
    tableLoading = true;
    try {
      const url = `${q.apiUrl}&limit=${PAGE}&offset=${tableOffset}`;
      const data = await fetch(url).then(r => r.json());
      const rows = (data.results ?? []) as Record<string, unknown>[];
      tableRows = reset ? rows : [...tableRows, ...rows];
      tableOffset = tableRows.length;
      tableHasMore = tableRows.length < (data.total ?? 0);
    } catch { /* ignore */ }
    tableLoading = false;
  }

  function toggleTable() {
    showTable = !showTable;
    if (showTable && tableRows.length === 0) loadTable(true);
  }

  // Re-fetch table when query changes (if table is open)
  $effect(() => {
    void q.apiUrl; // track as dependency
    untrack(() => { if (showTable) loadTable(true); });
  });

  async function downloadCsv() {
    const total = countResult?.total ?? 0;
    const limit = Math.min(total, 5000);
    const url = `${q.apiUrl}&limit=${limit}`;
    const data = await fetch(url).then(r => r.json());
    const rows = (data.results ?? []) as Record<string, unknown>[];
    if (!rows.length) return;
    const cols = tableCols.map(c => c.key);
    const header = tableCols.map(c => c.label);
    const lines = [
      header.join(','),
      ...rows.map(row => cols.map(k => {
        const v = row[k] ?? '';
        return `"${String(v).replace(/"/g, '""')}"`;
      }).join(',')),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gem-coal-data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Close picker (removes field if no values selected) ────────────────────

  function closePicker() {
    if (openPicker && openPicker !== 'tracker' && openPicker !== '__fields') {
      const val = (q.query.filters as Record<string, unknown>)[openPicker];
      const hasVal = val != null && (Array.isArray(val) ? val.length > 0 : !!val);
      if (!hasVal) shownFields = shownFields.filter(k => k !== openPicker);
    }
    openPicker = null;
  }

  // ── Quick starts ───────────────────────────────────────────────────────────

  const QUICK_STARTS: { sentence: string; apply: () => void }[] = [
    {
      sentence: 'Planned captive coal plants in Indonesia',
      apply: () => q.applyQuery({
        trackers: ['coal-plant'],
        filters: { status: ['announced', 'pre-permit', 'permitted', 'construction'], country_area: ['Indonesia'], captive: ['Yes'] },
      }),
    },
    {
      sentence: 'Coal plants and mines in…',
      apply: () => {
        q.applyQuery({ trackers: ['coal-plant', 'coal-mine'], filters: {} });
        // Let reactive effects settle before setting shownFields
        setTimeout(() => {
          if (!shownFields.includes('country_area')) shownFields = [...shownFields, 'country_area'];
          openPicker = 'country_area';
        }, 50);
      },
    },
    {
      sentence: 'Coal mines with a workforce over 1,000',
      apply: () => q.applyQuery({ trackers: ['coal-mine'], filters: { status: ['operating'] } }),
    },
    {
      sentence: 'Total coal mine capacity by province in India',
      apply: () => q.applyQuery({
        trackers: ['coal-mine'],
        filters: { country_area: ['India'] },
        groupBy: ['subnational_unit_province_state'],
        aggregates: [{ fn: 'sum', field: 'capacity_mtpa' }],
      }),
    },
    {
      sentence: 'Median age of operating coal plants by country',
      apply: () => q.applyQuery({
        trackers: ['coal-plant'],
        filters: { status: ['operating'] },
        groupBy: ['country_area'],
        aggregates: [{ fn: 'avg', field: 'plant_age_years' }],
      }),
    },
  ];
</script>

<div class="builder">

  <!-- ── Quick starts ─────────────────────────────────────────────────────── -->
  {#if !q.isDirty}
    <div class="quick-starts">
      <p class="qs-heading">What would you like to explore?</p>
      {#each QUICK_STARTS as qs}
        <button class="qs-item" onclick={qs.apply}>
          {qs.sentence} <span class="qs-arrow">→</span>
        </button>
      {/each}
    </div>
  {/if}

  <!-- ── Sentence ─────────────────────────────────────────────────────────── -->
  <div class="sentence">

    <span class="word">See</span>

    <!-- Summary prefix: aggregate chips + "by" groupBy chips + "for" connector -->
    {#if outputMode === 'summary' && (q.query.aggregates.length > 0 || q.query.groupBy.length > 0)}
      {#each q.query.aggregates as agg (agg.fn + agg.field)}
        {@const af = aggregatableFields.find(f => f.key === agg.field)}
        {@const spec = af?.aggregatable?.find(s => s.fn === agg.fn)}
        <span class="value-chip value-chip--summary">
          {spec?.label ?? `${agg.fn}(${agg.field})`}
          <button class="chip-x" onclick={() => toggleAggregate(agg.fn, agg.field)}>×</button>
        </span>
      {/each}
      {#if q.query.groupBy.length > 0}
        <span class="word">by</span>
        {#each q.query.groupBy as field (field)}
          {@const gf = groupableFields.find(f => f.key === field)}
          <span class="value-chip value-chip--summary">
            {gf?.shortLabel ?? gf?.label ?? field}
            <button class="chip-x" onclick={() => toggleGroupBy(field)}>×</button>
          </span>
        {/each}
      {/if}
      <span class="word">for</span>
    {/if}

    <!-- Tracker chips -->
    {#each q.query.trackers as t (t)}
      <span class="value-chip">
        {TRACKER_LABELS[t]}
        {#if q.query.trackers.length > 1}
          <button class="chip-x" onclick={() => removeTracker(t)} aria-label="Remove {TRACKER_LABELS[t]}">×</button>
        {/if}
      </span>
    {/each}
    <button
      class="open-btn"
      class:open={openPicker === 'tracker'}
      onclick={() => togglePicker('tracker')}
      aria-label="Edit project type"
    >{openPicker === 'tracker' ? '−' : '+'}</button>

    <!-- Active filter groups -->
    {#each shownFields as fieldKey (fieldKey)}
      {@const def = availableFilterFields.find(f => f.key === fieldKey)}
      {#if def}
        <span class="word">{def.phrase}</span>

        {#if fieldKey === 'country_area'}
          {#each q.query.filters.country_area ?? [] as c (c)}
            <span class="value-chip">{c}<button class="chip-x" onclick={() => removeCountry(c)}>×</button></span>
          {/each}
        {:else}
          {#each ((q.query.filters as Record<string, unknown>)[fieldKey] as string[] | undefined ?? []) as v (v)}
            <span class="value-chip">{v}<button class="chip-x" onclick={() => toggleValue(fieldKey as keyof CoalQueryFilters, v)}>×</button></span>
          {/each}
        {/if}

        <button
          class="open-btn"
          class:open={openPicker === fieldKey}
          onclick={() => togglePicker(fieldKey)}
          aria-label="Add {def.label}"
        >{openPicker === fieldKey ? '−' : '+'}</button>
      {/if}
    {/each}

    <!-- Add filter -->
    <button
      class="add-filter-btn"
      class:open={openPicker === '__fields'}
      onclick={() => togglePicker('__fields')}
    >{openPicker === '__fields' ? '− fewer filters' : '+ add filter'}</button>

    <span class="sentence-end">.</span>

    <!-- Clear all (only when filters are active) -->
    {#if q.isDirty}
      <button class="clear-all-btn" onclick={() => q.clearAllFilters()}>clear all</button>
    {/if}
  </div>

  <!-- ── Picker panel (stable position, below sentence) ───────────────────── -->
  {#if openPicker}
    <div class="picker-panel">
      <div class="panel-header">
        <span class="panel-title">{panelTitle()}</span>
        <button class="panel-close" onclick={closePicker}>Done</button>
      </div>
      <div class="panel-body" class:panel-body--country={openPicker === 'country_area'}>

        {#if openPicker === 'tracker'}
          {#each (['coal-plant', 'coal-mine'] as Tracker[]) as t}
            <button class="pill" class:active={q.query.trackers.includes(t)} onclick={() => toggleTracker(t)}>{TRACKER_LABELS[t]}</button>
          {/each}

        {:else if openPicker === '__fields'}
          {#each availableFilterFields as f}
            <button class="pill" class:active={shownFields.includes(f.key)} onclick={() => toggleFilterField(f.key)}>{f.label}</button>
          {/each}

        {:else if openPicker === 'status'}
          {#if statusOptions.length === 0}
            <span class="loading-hint">Loading…</span>
          {:else}
            {#each statusOptions as s}
              <button class="pill" class:active={q.query.filters.status?.includes(s)} onclick={() => toggleStatus(s)}>{s}</button>
            {/each}
          {/if}

        {:else if openPicker === 'country_area'}
          <input class="search-input" type="text" placeholder="Search countries…" bind:value={countrySearch} />
          <div class="country-list">
            {#each countryDropdown as c}
              {@const sel = (q.query.filters.country_area ?? []).includes(c)}
              <button class="country-opt" class:selected={sel} onclick={() => sel ? removeCountry(c) : addCountry(c)}>
                <span class="country-check">{sel ? '✓' : ''}</span>{c}
              </button>
            {/each}
          </div>

        {:else}
          {#if otherOptions[openPicker]}
            {#each otherOptions[openPicker] as val}
              {@const isActive = ((q.query.filters as Record<string, unknown>)[openPicker] as string[] | undefined)?.includes(val)}
              <button class="pill" class:active={isActive} onclick={() => toggleValue(openPicker as keyof CoalQueryFilters, val)}>{val}</button>
            {/each}
          {:else}
            <span class="loading-hint">Loading…</span>
          {/if}
        {/if}

      </div>
    </div>
  {/if}

  <!-- ── Output mode + summary options (visually grouped) ─────────────────── -->
  <div class="summary-card" class:summary-card--active={outputMode === 'summary'}>
    <div class="output-section">
      <span class="output-label">show me</span>
      <label class="radio-label">
        <input type="radio" name="output-mode" value="data" checked={outputMode === 'data'} onchange={() => setOutputMode('data')} />
        individual records
      </label>
      <label class="radio-label">
        <input type="radio" name="output-mode" value="summary" checked={outputMode === 'summary'} onchange={() => setOutputMode('summary')} />
        summary statistics
      </label>
    </div>

    {#if outputMode === 'summary'}
      <div class="summary-divider"></div>
      <div class="summary-section">
        <div class="summary-row">
          <span class="output-label">group by</span>
          <div class="value-pills">
            {#each groupableFields as f}
              <button class="value-pill" class:active={q.query.groupBy.includes(f.key)} onclick={() => toggleGroupBy(f.key)}>{f.shortLabel ?? f.label}</button>
            {/each}
          </div>
        </div>
        {#if q.query.groupBy.length > 0}
          <div class="summary-row">
            <span class="output-label">calculate</span>
            <div class="value-pills">
              {#each aggregatableFields as f}
                {#each f.aggregatable ?? [] as spec}
                  <button
                    class="value-pill"
                    class:active={q.query.aggregates.some(a => a.fn === spec.fn && a.field === f.key)}
                    onclick={() => toggleAggregate(spec.fn, f.key)}
                  >{spec.label}</button>
                {/each}
              {/each}
            </div>
          </div>
        {/if}
        <p class="summary-notice">Summary statistics require API grouping support — coming soon.</p>
      </div>
    {/if}
  </div>

  <!-- ── Results ───────────────────────────────────────────────────────────── -->
  <div class="results-bar">
    <div class="results-count">
      {#if countLoading}
        <span class="count-loading">Counting…</span>
      {:else if countResult}
        {#if Object.keys(countResult.byType).length > 1}
          {#each Object.entries(countResult.byType) as [type, n]}
            <span class="count-item">
              <strong>{fmt(n)}</strong>
              {type === 'coal-plant' ? 'plants' : type === 'coal-mine' ? 'mines' : type}
            </span>
          {/each}
          <span class="count-total">({fmt(countResult.total)} total)</span>
        {:else}
          <span class="count-item"><strong>{fmt(countResult.total)}</strong> {q.query.trackers.includes('coal-plant') ? 'plants' : 'mines'} match</span>
        {/if}
      {:else}
        <span class="count-empty">—</span>
      {/if}
    </div>

    <div class="results-actions">
      {#if countResult && countResult.total > 0}
        <button class="result-btn" class:active={showTable} onclick={toggleTable}>
          {showTable ? 'Hide table' : 'View table'}
        </button>
        <button class="result-btn" onclick={downloadCsv}>Download CSV</button>
      {/if}
    </div>
  </div>

  <!-- ── Table ─────────────────────────────────────────────────────────────── -->
  {#if showTable}
    <div class="table-wrap">
      {#if tableLoading && tableRows.length === 0}
        <div class="table-loading">Loading…</div>
      {:else}
        <table class="data-table">
          <thead>
            <tr>
              {#each tableCols as col}
                <th>{col.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each tableRows as row}
              <tr>
                {#each tableCols as col}
                  <td>{cellVal(row, col)}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        {#if tableHasMore}
          <button class="load-more-btn" onclick={() => loadTable()} disabled={tableLoading}>
            {tableLoading ? 'Loading…' : `Load more (${fmt((countResult?.total ?? 0) - tableRows.length)} remaining)`}
          </button>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ── Debug: API URL ────────────────────────────────────────────────────── -->
  <div class="api-url-row">
    <span class="api-url-text" title={q.apiUrl}>{q.apiUrl}</span>
    <button class="api-copy-btn" onclick={copyApiUrl}>{apiCopied ? '✓ Copied' : 'Copy API URL'}</button>
  </div>

</div>

<style>
  /* ── Layout ──────────────────────────────────────────────────────────────── */
  .builder {
    max-width: 720px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

  /* ── Quick starts ────────────────────────────────────────────────────────── */
  .quick-starts {
    margin-bottom: 2rem;
  }
  .qs-heading {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--color-gray-400, #9eaaad);
    margin: 0 0 0.6rem;
  }
  .qs-item {
    all: unset;
    display: block;
    cursor: pointer;
    width: 100%;
    padding: 0.55rem 0.75rem;
    font-size: 0.92rem;
    color: var(--color-gray-600, #4c6267);
    border-left: 2px solid var(--color-gray-200, #dce3e5);
    margin-bottom: 0.3rem;
    transition: color 0.12s, border-color 0.12s, background 0.12s;
    border-radius: 0 4px 4px 0;
  }
  .qs-item:hover {
    color: var(--gem-primary-blue, #1d4961);
    border-color: var(--gem-primary-blue, #1d4961);
    background: var(--gem-navy-10, #e9eef1);
  }
  .qs-arrow {
    color: var(--color-gray-300, #becccf);
    transition: color 0.12s;
  }
  .qs-item:hover .qs-arrow { color: var(--gem-primary-blue, #1d4961); }

  /* ── Sentence ────────────────────────────────────────────────────────────── */
  .sentence {
    font-size: 1.15rem;
    line-height: 2;
    color: var(--gem-primary-blue, #1d4961);
    margin-bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.3rem;
  }
  .word {
    color: var(--color-gray-600, #4c6267);
    white-space: nowrap;
  }
  .sentence-end { color: var(--color-gray-300, #becccf); }

  /* ── Value chips ─────────────────────────────────────────────────────────── */
  .value-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.2em;
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 4px;
    padding: 0.1em 0.45em;
    font-family: var(--font-family-mono, 'Barlow Semi Condensed', sans-serif);
    font-size: 0.9em;
    font-weight: 600;
    color: var(--gem-primary-blue, #1d4961);
    white-space: nowrap;
  }
  .chip-x {
    all: unset;
    cursor: pointer;
    color: var(--color-gray-400, #9eaaad);
    font-size: 0.9em;
    line-height: 1;
    padding: 0 0.05em;
    transition: color 0.1s;
  }
  .chip-x:hover { color: var(--gem-primary-blue, #1d4961); }

  /* ── +/− toggle buttons ──────────────────────────────────────────────────── */
  .open-btn {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    color: var(--color-gray-600, #4c6267);
    font-size: 0.8rem;
    line-height: 1;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }
  .open-btn:hover {
    background: var(--gem-navy-10, #e9eef1);
    border-color: var(--color-gray-300, #becccf);
    color: var(--gem-primary-blue, #1d4961);
  }
  .open-btn.open {
    background: var(--gem-primary-blue, #1d4961);
    border-color: var(--gem-primary-blue, #1d4961);
    color: #fff;
  }

  .clear-all-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    color: var(--color-gray-400, #9eaaad);
    text-decoration: underline;
    text-decoration-color: var(--color-gray-300, #becccf);
    text-underline-offset: 2px;
    white-space: nowrap;
    transition: color 0.1s;
  }
  .clear-all-btn:hover { color: var(--gem-orange, #fe4f2d); }

  .add-filter-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--color-gray-400, #9eaaad);
    border: 1px dashed var(--color-gray-300, #becccf);
    border-radius: 4px;
    padding: 0.15em 0.5em;
    white-space: nowrap;
    transition: color 0.1s, border-color 0.1s;
  }
  .add-filter-btn:hover,
  .add-filter-btn.open {
    color: var(--gem-primary-blue, #1d4961);
    border-color: var(--color-gray-400, #9eaaad);
  }

  /* ── Picker panel ────────────────────────────────────────────────────────── */
  .picker-panel {
    margin-top: 0.75rem;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 8px;
    background: var(--gem-warm-white, #fffffe);
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: var(--color-gray-100, #eceae3);
    border-bottom: 1px solid var(--color-gray-200, #dce3e5);
  }
  .panel-title {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-gray-600, #4c6267);
  }
  .panel-close {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--gem-primary-blue, #1d4961);
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--color-gray-300, #becccf);
    border-radius: 4px;
    background: #fff;
    transition: background 0.1s;
  }
  .panel-close:hover { background: var(--gem-navy-10, #e9eef1); }

  .panel-body {
    padding: 0.75rem;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    min-height: 48px;
  }
  .panel-body--country {
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 0.4rem;
    padding: 0.6rem;
  }

  /* ── Pills ───────────────────────────────────────────────────────────────── */
  .pill {
    all: unset;
    cursor: pointer;
    padding: 0.25rem 0.65rem;
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--color-gray-600, #4c6267);
    background: #fff;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .pill:hover {
    border-color: var(--gem-primary-blue, #1d4961);
    color: var(--gem-primary-blue, #1d4961);
  }
  .pill.active {
    background: var(--gem-primary-blue, #1d4961);
    color: #fff;
    border-color: var(--gem-primary-blue, #1d4961);
  }

  /* ── Country picker ──────────────────────────────────────────────────────── */
  .search-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.35rem 0.6rem;
    font-size: 0.82rem;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 5px;
    background: #fff;
    color: var(--gem-primary-blue, #1d4961);
    font-family: inherit;
  }
  .search-input:focus {
    outline: none;
    border-color: var(--gem-primary-blue, #1d4961);
  }

  .country-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 5px;
    background: #fff;
  }
  .country-opt {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.82rem;
    color: var(--color-gray-600, #4c6267);
    transition: background 0.07s;
  }
  .country-opt:hover { background: var(--gem-navy-10, #e9eef1); }
  .country-opt.selected { font-weight: 600; color: var(--gem-primary-blue, #1d4961); }
  .country-check { width: 1rem; font-size: 0.75rem; flex-shrink: 0; color: var(--gem-primary-blue, #1d4961); }

  .loading-hint { font-size: 0.78rem; color: var(--color-gray-400, #9eaaad); font-style: italic; }

  /* ── Results bar ─────────────────────────────────────────────────────────── */
  .results-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 1.25rem;
    padding: 0.75rem 1rem;
    background: var(--color-gray-100, #eceae3);
    border-radius: 6px;
    min-height: 44px;
  }
  .results-count {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: var(--color-gray-600, #4c6267);
    flex-wrap: wrap;
  }
  .count-item strong {
    color: var(--gem-primary-blue, #1d4961);
    font-weight: 700;
    font-size: 1rem;
  }
  .count-total {
    font-size: 0.78rem;
    color: var(--color-gray-400, #9eaaad);
  }
  .count-loading, .count-empty {
    font-size: 0.82rem;
    color: var(--color-gray-400, #9eaaad);
    font-style: italic;
  }

  .results-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .result-btn {
    all: unset;
    cursor: pointer;
    padding: 0.3rem 0.7rem;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 600;
    border: 1px solid var(--color-gray-300, #becccf);
    background: #fff;
    color: var(--gem-primary-blue, #1d4961);
    transition: background 0.1s, border-color 0.1s;
  }
  .result-btn:hover {
    background: var(--gem-navy-10, #e9eef1);
    border-color: var(--color-gray-400, #9eaaad);
  }
  .result-btn.active {
    background: var(--gem-primary-blue, #1d4961);
    color: #fff;
    border-color: var(--gem-primary-blue, #1d4961);
  }

  /* ── Table ───────────────────────────────────────────────────────────────── */
  .table-wrap {
    margin-top: 0.75rem;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 6px;
    overflow: auto;
    max-height: 480px;
  }
  .table-loading {
    padding: 2rem;
    text-align: center;
    font-size: 0.82rem;
    color: var(--color-gray-400, #9eaaad);
    font-style: italic;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
    font-family: var(--font-family-data, 'Barlow Semi Condensed', sans-serif);
  }
  .data-table th {
    position: sticky;
    top: 0;
    background: var(--color-gray-100, #eceae3);
    color: var(--color-gray-600, #4c6267);
    font-weight: 700;
    font-size: 0.68rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 0.5rem 0.75rem;
    text-align: left;
    border-bottom: 1px solid var(--color-gray-200, #dce3e5);
    white-space: nowrap;
  }
  .data-table td {
    padding: 0.4rem 0.75rem;
    color: var(--gem-primary-blue, #1d4961);
    border-bottom: 1px solid var(--color-gray-100, #eceae3);
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tbody tr:hover td { background: var(--gem-navy-10, #e9eef1); }

  .load-more-btn {
    all: unset;
    cursor: pointer;
    display: block;
    width: 100%;
    padding: 0.6rem;
    text-align: center;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--gem-primary-blue, #1d4961);
    background: var(--color-gray-100, #eceae3);
    border-top: 1px solid var(--color-gray-200, #dce3e5);
    transition: background 0.1s;
    box-sizing: border-box;
  }
  .load-more-btn:hover:not(:disabled) { background: var(--gem-navy-10, #e9eef1); }
  .load-more-btn:disabled { opacity: 0.5; cursor: default; }

  /* ── Summary card (output mode + group by + calculate) ───────────────────── */
  .summary-card {
    margin-top: 1.5rem;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .summary-card--active {
    border-color: #099ed8;
  }

  .output-section {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    padding: 0.65rem 0.9rem;
    font-size: 0.82rem;
    background: var(--color-gray-100, #eceae3);
  }
  .summary-card--active .output-section {
    background: rgba(9, 158, 216, 0.08);
  }

  .output-label {
    font-size: 0.72rem;
    color: var(--color-gray-400, #9eaaad);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    min-width: 72px;
    flex-shrink: 0;
  }
  .summary-card--active .output-label {
    color: #006d94;
  }

  .radio-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    color: var(--color-gray-600, #4c6267);
    cursor: pointer;
    user-select: none;
  }
  input[type='radio'] {
    accent-color: var(--gem-primary-blue, #1d4961);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
  .summary-card--active input[type='radio'] {
    accent-color: #099ed8;
  }

  .summary-divider {
    height: 1px;
    background: #b8dff0;
  }

  .summary-section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.75rem 0.9rem;
    background: rgba(9, 158, 216, 0.04);
  }
  .summary-row {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
  }
  .value-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }
  .value-pill {
    all: unset;
    cursor: pointer;
    padding: 0.25rem 0.65rem;
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 20px;
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--color-gray-600, #4c6267);
    background: #fff;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .value-pill:hover {
    border-color: #099ed8;
    color: #006d94;
  }
  .value-pill.active {
    background: #099ed8;
    color: #fff;
    border-color: #099ed8;
  }
  .summary-notice {
    font-size: 0.72rem;
    color: #6bb8d4;
    font-style: italic;
    margin: 0.1rem 0 0;
  }

  /* ── Summary chips in sentence ────────────────────────────────────────────── */
  .value-chip--summary {
    background: rgba(9, 158, 216, 0.1);
    border-color: #099ed8;
    color: #005f7a;
  }
  .value-chip--summary .chip-x {
    color: #6bb8d4;
  }
  .value-chip--summary .chip-x:hover {
    color: #005f7a;
  }

  /* ── API URL (debug) ─────────────────────────────────────────────────────── */
  .api-url-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 1px dashed var(--color-gray-200, #dce3e5);
  }
  .api-url-text {
    flex: 1;
    font-family: var(--font-family-mono, monospace);
    font-size: 0.68rem;
    color: var(--color-gray-400, #9eaaad);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .api-copy-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--color-gray-600, #4c6267);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    background: #fff;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 0.1s;
  }
  .api-copy-btn:hover { background: var(--gem-navy-10, #e9eef1); }
</style>
