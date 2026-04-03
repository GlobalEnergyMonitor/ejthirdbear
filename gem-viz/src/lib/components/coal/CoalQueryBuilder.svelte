<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import { COAL_QUERY_KEY, appendCoalFilters } from '$lib/state/coal-query.svelte';
  import type { CoalQueryState } from '$lib/state/coal-query.svelte';
  import {
    type AggFn,
    type CoalQueryFilters,
    type Tracker,
    getField,
    getGroupableFields,
    getAggregatableFields,
  } from '$lib/data-config/coal-field-schema';
  import { fetchSummaryTable, type SummaryRow } from '$lib/data-config/aggregate-api';
  import DataTable from '$lib/components/table/DataTable.svelte';
  import QuerySentenceBuilder, { type FilterFieldDef, type QuickStart } from '$lib/components/filters/QuerySentenceBuilder.svelte';
  import StatusFilter from '$lib/components/filters/StatusFilter.svelte';
  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';
  import { STATUS_GROUPS } from '$lib/data-config/tracker-schema';

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

  // ── Picker state ───────────────────────────────────────────────────────────

  let openPicker = $state<string | null>(null);

  function togglePicker(key: string) {
    openPicker = openPicker === key ? null : key;
    if (openPicker !== 'country_area') countrySearch = '';
  }

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

  // ── Status bidirectional sync ──────────────────────────────────────────────

  function buildStatusChecks(selected: string[] | undefined): Record<string, boolean> {
    const selectedSet = new Set(selected ?? []);
    const checks: Record<string, boolean> = {};
    for (const sg of STATUS_GROUPS) {
      for (const s of sg.statuses) {
        checks[`status-${sg.id}-${s.value}`] = selectedSet.has(s.value);
      }
    }
    return checks;
  }

  function extractStatusValues(checks: Record<string, boolean>): string[] {
    return Object.entries(checks).filter(([, v]) => v).map(([key]) => key.split('-').slice(2).join('-'));
  }

  function sameStringSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every(v => s.has(v));
  }

  let statusChecks = $state<Record<string, boolean>>(buildStatusChecks(untrack(() => q.query.filters.status)));

  // statusChecks → q.query.filters.status
  $effect(() => {
    const vals = extractStatusValues(statusChecks);
    const cur = untrack(() => q.query.filters.status ?? []);
    if (sameStringSet(vals, cur)) return;
    untrack(() => q.setFilter('status', vals.length ? vals : undefined));
  });

  // q.query.filters.status → statusChecks (for quickstarts / URL changes)
  $effect(() => {
    const status = q.query.filters.status ?? [];
    const curVals = extractStatusValues(untrack(() => statusChecks));
    if (sameStringSet(status, curVals)) return;
    untrack(() => { statusChecks = buildStatusChecks(status); });
  });

  // ── Country bidirectional sync ─────────────────────────────────────────────

  let localSelectedCountries = $state<string[]>(untrack(() => q.query.filters.country_area ?? []));

  $effect(() => {
    const selected = localSelectedCountries;
    const cur = untrack(() => q.query.filters.country_area ?? []);
    if (sameStringSet(selected, cur)) return;
    untrack(() => q.setFilter('country_area', selected.length ? selected : undefined));
  });

  $effect(() => {
    const external = q.query.filters.country_area ?? [];
    const cur = untrack(() => localSelectedCountries);
    if (sameStringSet(external, cur)) return;
    untrack(() => { localSelectedCountries = [...external]; });
  });

  // ── Sentence builder wiring ────────────────────────────────────────────────

  const sentenceFilters = $derived(q.query.filters as Record<string, string[]>);

  function handleRemoveValue(key: string, val: string) {
    if (key === 'country_area') {
      localSelectedCountries = localSelectedCountries.filter(c => c !== val);
    } else {
      toggleValue(key as keyof CoalQueryFilters, val);
    }
  }

  function handleRemoveField(key: string) {
    q.clearFilter(key as keyof CoalQueryFilters);
    if (key === 'country_area') localSelectedCountries = [];
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

  function clearAll() {
    q.clearAllFilters();
    q.setGroupBy([]);
    q.setAggregates([]);
    outputMode = 'data';
    shownFields = [];
    showTable = false;
    openPicker = null;
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

  // Always count against /assets, even in summary mode
  const countUrl = $derived.by(() => {
    const p = new URLSearchParams();
    for (const t of q.query.trackers) p.append('asset_type', t);
    appendCoalFilters(p, q.query.filters);
    p.set('facets', 'true');
    p.set('limit', '1');
    return `${API_BASE}/assets?${p.toString()}`;
  });

  $effect(() => {
    const url = countUrl;
    countAbort?.abort();
    countAbort = new AbortController();
    countLoading = true;
    countResult = null;
    fetch(url, { signal: countAbort.signal })
      .then(r => r.json())
      .then(data => {
        const total = data.total ?? data.count ?? 0;
        // API facets.asset_type is global (all types) — filter to selected trackers only
        const SLUG_TO_DISPLAY: Record<string, string> = { 'coal-plant': 'Coal Plant', 'coal-mine': 'Coal Mine' };
        const allowedTypes = new Set(q.query.trackers.map(t => SLUG_TO_DISPLAY[t]).filter(Boolean));
        const rawByType: Record<string, number> = data.facets?.asset_type ?? {};
        const byType: Record<string, number> = {};
        for (const [type, n] of Object.entries(rawByType)) {
          if (allowedTypes.has(type)) byType[type] = n as number;
        }
        countResult = { total, byType };
        countLoading = false;
      })
      .catch(err => { if (err.name !== 'AbortError') countLoading = false; });
  });

  function fmt(n: number) { return n.toLocaleString(); }

  let apiCopied = $state(false);
  function copyApiUrls() {
    navigator.clipboard.writeText(q.apiUrls.join('\n')).then(() => {
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

  // DataTable-compatible column definitions
  const dataTableCols = $derived(
    tableCols.map(c => ({
      key: c.key,
      label: c.label,
      sortable: true,
      type: c.key === 'capacity_mw' ? 'number' as const : 'string' as const,
    }))
  );

  let showTable   = $state(false);
  let tableRows   = $state<Record<string, unknown>[]>([]);
  let tableOffset = $state(0);
  let tableHasMore = $state(false);
  let tableLoading = $state(false);
  const PAGE = 50;

  // Normalize rows: resolve altKeys so DataTable can find values by canonical key
  function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map(row => {
      const out = { ...row };
      for (const col of tableCols) {
        if (col.altKey && out[col.key] == null && out[col.altKey] != null) {
          out[col.key] = out[col.altKey];
        }
      }
      return out;
    });
  }

  // Build /assets URL for records table (always /assets, never aggregate endpoint)
  const assetsUrl = $derived.by(() => {
    const p = new URLSearchParams();
    for (const t of q.query.trackers) p.append('asset_type', t);
    appendCoalFilters(p, q.query.filters);
    return `${API_BASE}/assets?${p.toString()}`;
  });

  async function loadTable(reset = false) {
    if (reset) { tableRows = []; tableOffset = 0; }
    tableLoading = true;
    try {
      const url = `${assetsUrl}&limit=${PAGE}&offset=${tableOffset}`;
      const data = await fetch(url).then(r => r.json());
      const rows = normalizeRows((data.results ?? []) as Record<string, unknown>[]);
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
    void assetsUrl; // track as dependency
    untrack(() => { if (showTable) loadTable(true); });
  });

  async function downloadCsv() {
    const total = countResult?.total ?? 0;
    const limit = Math.min(total, 5000);
    const url = `${assetsUrl}&limit=${limit}`;
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

  // ── Results: summary table ──────────────────────────────────────────────────

  let summaryRows   = $state<SummaryRow[]>([]);
  let summaryLoading = $state(false);
  let summaryError   = $state<string | null>(null);

  // Column definitions for the summary table
  const summaryCols = $derived(() => {
    const cols: { key: string; label: string }[] = [];
    // Group-by columns first
    for (const gk of q.query.groupBy) {
      const f = getField(gk);
      cols.push({ key: gk, label: f?.shortLabel ?? f?.label ?? gk });
    }
    // Then aggregate value columns
    for (const agg of q.query.aggregates) {
      const f = getField(agg.field);
      const spec = f?.aggregatable?.find(s => s.fn === agg.fn);
      cols.push({
        key: `${agg.fn}:${agg.field}`,
        label: spec?.label ?? `${agg.fn}(${agg.field})`,
      });
    }
    return cols;
  });

  // Auto-fetch summary when in summary mode with group-by + aggregates
  $effect(() => {
    const inSummary = outputMode === 'summary';
    const hasGroupBy = q.query.groupBy.length > 0;
    const hasAggs = q.query.aggregates.length > 0;
    // Read reactive deps so $effect re-runs when these change
    const _trackers = q.query.trackers;
    const _filters = q.query.filters;
    const _granularity = q.query.granularity;
    const _groupBy = q.query.groupBy;
    const _aggregates = q.query.aggregates;

    if (!inSummary || !hasGroupBy || !hasAggs) {
      untrack(() => { summaryRows = []; summaryError = null; });
      return;
    }

    untrack(() => {
      summaryLoading = true;
      summaryError = null;
      fetchSummaryTable(q.query)
        .then(rows => {
          summaryRows = rows;
          summaryLoading = false;
        })
        .catch(err => {
          summaryError = err?.message ?? 'Failed to fetch summary';
          summaryRows = [];
          summaryLoading = false;
        });
    });
  });

  function fmtVal(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'number') return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return String(v);
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

  const QUICK_STARTS: QuickStart[] = [
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

  <div class="sentence-wrapper">
    <QuerySentenceBuilder
      fields={availableFilterFields}
      filters={sentenceFilters}
      isDirty={q.isDirty}
      quickStarts={QUICK_STARTS}
      bind:openPicker
      bind:shownFields
      panelTitles={{ tracker: 'Project type' }}
      columnPickerKeys={['country_area']}
      onRemoveValue={handleRemoveValue}
      onRemoveField={handleRemoveField}
      onClearAll={clearAll}
    >
      {#snippet subject()}
        <!-- Summary prefix: aggregate + groupBy chips -->
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
      {/snippet}

      {#snippet picker(fieldKey)}
        {#if fieldKey === 'tracker'}
          {#each (['coal-plant', 'coal-mine'] as Tracker[]) as t}
            <button class="pill" class:active={q.query.trackers.includes(t)} onclick={() => toggleTracker(t)}>{TRACKER_LABELS[t]}</button>
          {/each}
        {:else if fieldKey === 'status'}
          <StatusFilter bind:statusChecks statusGroups={STATUS_GROUPS} />
        {:else if fieldKey === 'country_area'}
          <CountryMultiSelect bind:selected={localSelectedCountries} countries={countryOptions} />
        {:else}
          {#if otherOptions[fieldKey]}
            {#each otherOptions[fieldKey] as val}
              {@const isActive = ((q.query.filters as Record<string, unknown>)[fieldKey] as string[] | undefined)?.includes(val)}
              <button class="pill" class:active={isActive} onclick={() => toggleValue(fieldKey as keyof CoalQueryFilters, val)}>{val}</button>
            {/each}
          {:else}
            <span class="loading-hint">Loading…</span>
          {/if}
        {/if}
      {/snippet}
    </QuerySentenceBuilder>
  </div>

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
        {#if q.showGranularityToggle}
          <div class="summary-row">
            <span class="output-label">granularity</span>
            <label class="radio-label">
              <input type="radio" name="granularity" value="project"
                checked={q.query.granularity === 'project'}
                onchange={() => q.setGranularity('project')} />
              per plant
            </label>
            <label class="radio-label">
              <input type="radio" name="granularity" value="unit"
                checked={q.query.granularity === 'unit'}
                onchange={() => q.setGranularity('unit')} />
              per unit
            </label>
          </div>
        {/if}
        <p class="summary-notice">
          Aggregation endpoints are live — see aggregate-api.ts for the data path.
        </p>
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
              {type === 'Coal Plant' ? 'plants' : type === 'Coal Mine' ? 'mines' : type}
            </span>
          {/each}
          <span class="count-total">({fmt(countResult.total)} total)</span>
        {:else}
          <span class="count-item"><strong>{fmt(countResult.total)}</strong> {q.entityLabel} match</span>
        {/if}
      {:else}
        <span class="count-empty">—</span>
      {/if}
    </div>

    <div class="results-actions">
      {#if outputMode === 'data' && countResult && countResult.total > 0}
        <button class="result-btn" class:active={showTable} onclick={toggleTable}>
          {showTable ? 'Hide table' : 'View table'}
        </button>
      {/if}
    </div>
  </div>

  <!-- ── Table (records mode) ──────────────────────────────────────────────── -->
  {#if outputMode === 'data' && showTable}
    <div class="table-section">
      {#if tableLoading && tableRows.length === 0}
        <div class="table-loading">Loading…</div>
      {:else}
        <DataTable
          columns={dataTableCols}
          data={tableRows}
          pageSize={50}
          showGlobalSearch={true}
          showColumnFilters={false}
          showPagination={true}
          showExport={true}
          showColumnToggle={false}
          stickyHeader={true}
          striped={true}
        />
        {#if tableHasMore}
          <div class="load-more-wrap">
            <button class="load-more-btn" onclick={() => loadTable()} disabled={tableLoading}>
              {tableLoading ? 'Loading…' : `Load more from API (${fmt((countResult?.total ?? 0) - tableRows.length)} remaining)`}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ── Summary table ─────────────────────────────────────────────────────── -->
  {#if outputMode === 'summary' && q.query.groupBy.length > 0 && q.query.aggregates.length > 0}
    <div class="table-wrap">
      {#if summaryLoading}
        <div class="table-loading">Loading summary…</div>
      {:else if summaryError}
        <div class="table-loading" style="color: #c44;">Error: {summaryError}</div>
      {:else if summaryRows.length > 0}
        <table class="data-table">
          <thead>
            <tr>
              {#each summaryCols() as col}
                <th>{col.label}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each summaryRows as row}
              <tr>
                {#each summaryCols() as col}
                  <td>{fmtVal(row[col.key])}</td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="summary-count">{summaryRows.length} groups</div>
      {:else}
        <div class="table-loading">No results</div>
      {/if}
    </div>
  {/if}

  <!-- ── Debug: API URLs ───────────────────────────────────────────────────── -->
  <div class="query-footer">
    <div class="api-url-list">
      {#each q.apiUrls as url}
        <div class="api-url-row">
          <span class="api-url-text" title={url}>{url}</span>
        </div>
      {/each}
      <button class="api-copy-btn" onclick={copyApiUrls}>
        {apiCopied ? '✓ Copied' : q.apiUrls.length > 1 ? `Copy ${q.apiUrls.length} API URLs` : 'Copy API URL'}
      </button>
    </div>
  </div>

</div>

<style>
  /* ── Layout ──────────────────────────────────────────────────────────────── */
  .builder {
    margin: 0 auto;
    padding: var(--space-10, 40px) var(--space-6, 24px) var(--space-16, 64px);
    font-family: var(--font-family, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

  /* Constrain intro/query sections, let table go full-width */
  .sentence-wrapper,
  .summary-card,
  .results-bar,
  .query-footer {
    max-width: var(--container-md, 768px);
    margin-left: auto;
    margin-right: auto;
  }

  .sentence-wrapper {
    max-width: var(--container-md, 768px);
    margin: 0 auto;
    --sentence-max-width: var(--container-md, 768px);
  }

  .word {
    color: var(--color-gray-600, #4c6267);
    white-space: nowrap;
  }

  /* ── Value chips ─────────────────────────────────────────────────────────── */
  .value-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 4px;
    padding: 0.15em 0.5em;
    font-family: var(--font-family-data, 'Barlow Semi Condensed', sans-serif);
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--gem-primary-blue, #1d4961);
    white-space: nowrap;
  }
  .chip-x {
    all: unset;
    cursor: pointer;
    color: var(--color-gray-400, #9eaaad);
    font-size: var(--font-size-sm, 12px);
    line-height: 1;
    padding: 0 2px;
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
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    color: var(--color-gray-600, #4c6267);
    font-size: var(--font-size-sm, 12px);
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

  /* ── Pills ───────────────────────────────────────────────────────────────── */
  .pill {
    all: unset;
    cursor: pointer;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 20px;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-medium, 500);
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

  .loading-hint { font-size: var(--font-size-sm, 12px); color: var(--color-gray-400, #9eaaad); font-style: italic; }

  /* ── Results bar ─────────────────────────────────────────────────────────── */
  .results-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4, 16px);
    margin-top: var(--space-6, 24px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    background: #fff;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 6px;
    min-height: 48px;
  }
  .results-count {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    font-size: var(--font-size-base, 14px);
    color: var(--color-gray-600, #4c6267);
    flex-wrap: wrap;
  }
  .count-item strong {
    color: var(--gem-primary-blue, #1d4961);
    font-weight: var(--font-weight-bold, 700);
    font-size: var(--font-size-md, 16px);
  }
  .count-total {
    font-size: var(--font-size-sm, 12px);
    color: var(--color-gray-400, #9eaaad);
  }
  .count-loading, .count-empty {
    font-size: var(--font-size-sm, 12px);
    color: var(--color-gray-400, #9eaaad);
    font-style: italic;
  }

  .results-actions {
    display: flex;
    gap: var(--space-2, 8px);
    flex-shrink: 0;
  }
  .result-btn {
    all: unset;
    cursor: pointer;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border-radius: 4px;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-semibold, 600);
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
  .table-section {
    margin-top: var(--space-6, 24px);
    border-top: 1px solid var(--color-gray-200, #dce3e5);
    padding-top: var(--space-4, 16px);
  }
  .table-wrap {
    margin-top: var(--space-3, 12px);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 6px;
    overflow: auto;
    max-height: 480px;
  }
  .table-loading {
    padding: var(--space-8, 32px);
    text-align: center;
    font-size: var(--font-size-sm, 12px);
    color: var(--color-gray-400, #9eaaad);
    font-style: italic;
  }
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm, 12px);
    font-family: var(--font-family-data, 'Barlow Semi Condensed', sans-serif);
  }
  .data-table th {
    position: sticky;
    top: 0;
    background: #fff;
    color: var(--color-gray-600, #4c6267);
    font-weight: var(--font-weight-bold, 700);
    font-size: var(--font-size-xs, 10px);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider, 0.04em);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    text-align: left;
    border-bottom: 2px solid var(--color-gray-200, #dce3e5);
    white-space: nowrap;
  }
  .data-table td {
    padding: var(--space-2, 8px) var(--space-4, 16px);
    color: var(--gem-primary-blue, #1d4961);
    border-bottom: 1px solid var(--color-gray-200, #dce3e5);
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tbody tr:hover td { background: var(--gem-navy-10, #e9eef1); }

  .summary-count {
    padding: var(--space-2, 8px) var(--space-4, 16px);
    font-size: var(--font-size-sm, 12px);
    color: var(--color-gray-400, #9eaaad);
  }

  .load-more-wrap {
    max-width: var(--container-md, 768px);
    margin: var(--space-4, 16px) auto 0;
  }
  .load-more-btn {
    all: unset;
    cursor: pointer;
    display: block;
    width: 100%;
    padding: var(--space-3, 12px);
    text-align: center;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--gem-primary-blue, #1d4961);
    background: #fff;
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 6px;
    transition: background 0.1s;
    box-sizing: border-box;
  }
  .load-more-btn:hover:not(:disabled) { background: var(--gem-navy-10, #e9eef1); }
  .load-more-btn:disabled { opacity: 0.5; cursor: default; }

  /* ── Summary card (output mode + group by + calculate) ───────────────────── */
  .summary-card {
    margin-top: var(--space-6, 24px);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.2s;
  }
  .summary-card--active {
    border-color: var(--gem-primary-blue, #1d4961);
  }

  .output-section {
    display: flex;
    align-items: center;
    gap: var(--space-5, 20px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    font-size: var(--font-size-base, 14px);
    background: #fff;
  }
  .summary-card--active .output-section {
    background: var(--gem-navy-10, #e9eef1);
  }

  .output-label {
    font-size: var(--font-size-xs, 10px);
    color: var(--color-gray-400, #9eaaad);
    font-weight: var(--font-weight-bold, 700);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider, 0.04em);
    min-width: 80px;
    flex-shrink: 0;
  }
  .summary-card--active .output-label {
    color: var(--gem-primary-blue, #1d4961);
  }

  .radio-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
    font-size: var(--font-size-base, 14px);
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

  .summary-divider {
    height: 1px;
    background: var(--color-gray-200, #dce3e5);
  }

  .summary-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px) var(--space-5, 20px);
    background: #fff;
  }
  .summary-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-4, 16px);
  }
  .value-pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
  }
  .value-pill {
    all: unset;
    cursor: pointer;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 20px;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-medium, 500);
    color: var(--color-gray-600, #4c6267);
    background: #fff;
    transition: all 0.12s;
    white-space: nowrap;
  }
  .value-pill:hover {
    border-color: var(--gem-primary-blue, #1d4961);
    color: var(--gem-primary-blue, #1d4961);
  }
  .value-pill.active {
    background: var(--gem-primary-blue, #1d4961);
    color: #fff;
    border-color: var(--gem-primary-blue, #1d4961);
  }
  .summary-notice {
    font-size: var(--font-size-xs, 10px);
    color: var(--color-gray-400, #9eaaad);
    font-style: italic;
    margin: var(--space-1, 4px) 0 0;
  }

  /* ── Summary chips in sentence ────────────────────────────────────────────── */
  .value-chip--summary {
    background: var(--gem-navy-10, #e9eef1);
    border-color: var(--gem-primary-blue, #1d4961);
    color: var(--gem-primary-blue, #1d4961);
  }
  .value-chip--summary .chip-x {
    color: var(--color-gray-400, #9eaaad);
  }
  .value-chip--summary .chip-x:hover {
    color: var(--gem-primary-blue, #1d4961);
  }

  /* ── API URL (debug) ─────────────────────────────────────────────────────── */
  .api-url-list {
    margin-top: var(--space-12, 48px);
    padding-top: var(--space-4, 16px);
    border-top: 1px dashed var(--color-gray-200, #dce3e5);
  }
  .api-url-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-1, 4px);
  }
  .api-url-text {
    font-family: var(--font-family-data, 'Barlow Semi Condensed', sans-serif);
    font-size: var(--font-size-xs, 10px);
    color: var(--color-gray-400, #9eaaad);
    word-break: break-all;
  }
  .api-copy-btn {
    all: unset;
    cursor: pointer;
    font-size: var(--font-size-xs, 10px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-gray-600, #4c6267);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 4px;
    padding: var(--space-1, 4px) var(--space-3, 12px);
    background: #fff;
    white-space: nowrap;
    float: right;
    margin-top: var(--space-2, 8px);
    transition: background 0.1s;
  }
  .api-copy-btn:hover { background: var(--gem-navy-10, #e9eef1); }
</style>
