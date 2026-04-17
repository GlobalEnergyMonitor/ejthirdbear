<script lang="ts">
  import { untrack } from 'svelte';
  import type {
    CoalQuery,
    CoalQueryFilters,
    CoalQueryAggregate,
    Tracker,
    Granularity,
    AggFn,
    CoalField,
  } from '$lib/data-config/coal-field-schema';
  import {
    getField,
    getGroupableFields,
    getAggregatableFields,
    getFilterableFields,
  } from '$lib/data-config/coal-field-schema';
  import { fetchSummaryTable, type SummaryRow } from '$lib/data-config/aggregate-api';
  import { appendCoalFilters } from '$lib/state/coal-query.svelte';
  import { STATUS_GROUPS, discoverStatusGroups } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import { WIZARD_PRESETS, type WizardPreset } from '$lib/data-config/coal-wizard-presets';
  import { CAPTIVE_INDUSTRY_GROUPS } from '$lib/data-config/asset-class-definitions';
  import StatusFilter from '$lib/components/filters/StatusFilter.svelte';
  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';
  import DataTable from '$lib/components/table/DataTable.svelte';
  import CoalPlantCard from '$lib/components/cards/CoalPlantCard.svelte';
  import type { CoalPlantUnit } from '$lib/components/cards/coal-plant-types';
  import CoalMineCard from '$lib/components/cards/CoalMineCard.svelte';
  import type { CoalMineAsset } from '$lib/components/cards/coal-mine-types';

  const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // ── Core wizard state ──────────────────────────────────────────────────────

  let outputMode = $state<'records' | 'summary'>('records');
  let trackers = $state<Tracker[]>(['coal-plant']);
  let filters = $state<CoalQueryFilters>({});
  let groupBy = $state<string[]>([]);
  let aggregates = $state<CoalQueryAggregate[]>([]);
  let granularity = $state<Granularity>('project');

  // CoalQuery shape for API consumers (fetchSummaryTable, etc.)
  const coalQuery = $derived<CoalQuery>({
    trackers,
    filters,
    groupBy: outputMode === 'summary' ? groupBy : [],
    aggregates: outputMode === 'summary' ? aggregates : [],
    granularity,
    view: 'table',
  });

  // ── Tracker selection (plants / mines / both) ──────────────────────────────

  const trackerMode = $derived(
    trackers.length === 2 ? 'both' : trackers.includes('coal-plant') ? 'plants' : 'mines'
  );

  function setTrackerMode(mode: 'plants' | 'mines' | 'both') {
    const newTrackers: Tracker[] =
      mode === 'both'
        ? ['coal-plant', 'coal-mine']
        : mode === 'plants'
          ? ['coal-plant']
          : ['coal-mine'];
    if (JSON.stringify(newTrackers) === JSON.stringify(trackers)) return;
    // Prune summary selections to only valid fields for new trackers
    const validAggKeys = new Set(getAggregatableFields(newTrackers).map((f) => f.key));
    const validGroupKeys = new Set(getGroupableFields(newTrackers).map((f) => f.key));
    aggregates = aggregates.filter((a) => validAggKeys.has(a.field));
    groupBy = groupBy.filter((k) => validGroupKeys.has(k));
    // Remove tracker-specific extra filters that no longer apply
    const validFilterKeys = new Set(getFilterableFields(newTrackers).map((f) => f.key));
    shownExtraFields = shownExtraFields.filter((k) => validFilterKeys.has(k));
    trackers = newTrackers;
  }

  // ── Status bidirectional sync ──────────────────────────────────────────────

  function makeFullStatusGroups(): DynamicStatusGroup[] {
    return STATUS_GROUPS.map((sg) => ({
      id: sg.id,
      label: sg.label,
      statuses: (sg.statuses as readonly string[]).map((s) => ({ value: s, count: 0 })),
      totalCount: 0,
    }));
  }

  let coalStatusGroups = $state<DynamicStatusGroup[]>(makeFullStatusGroups());
  let showStatusRefine = $state(true);

  function buildStatusChecks(
    selected: string[] | undefined,
    groups?: DynamicStatusGroup[]
  ): Record<string, boolean> {
    const g = groups ?? coalStatusGroups;
    const selectedSet = new Set(selected ?? []);
    const checks: Record<string, boolean> = {};
    for (const sg of g) {
      for (const s of sg.statuses) {
        checks[`status-${sg.id}-${s.value}`] = selectedSet.has(s.value);
      }
    }
    return checks;
  }

  function extractStatusValues(checks: Record<string, boolean>): string[] {
    return Object.entries(checks)
      .filter(([, v]) => v)
      .map(([key]) => key.split('-').slice(2).join('-'));
  }

  function sameStringSet(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    const s = new Set(a);
    return b.every((v) => s.has(v));
  }

  // Default: operating + planned checked
  function makeDefaultStatusChecks(): Record<string, boolean> {
    const groups = makeFullStatusGroups();
    const defaultGroupIds = new Set(['operating', 'planned']);
    const checks: Record<string, boolean> = {};
    for (const sg of groups) {
      for (const s of sg.statuses) {
        checks[`status-${sg.id}-${s.value}`] = defaultGroupIds.has(sg.id);
      }
    }
    return checks;
  }

  let statusChecks = $state<Record<string, boolean>>(makeDefaultStatusChecks());

  // Sync statusChecks → filters.status
  $effect(() => {
    const vals = extractStatusValues(statusChecks);
    const cur = untrack(() => filters.status ?? []);
    if (sameStringSet(vals, cur)) return;
    untrack(() => {
      filters = { ...filters, status: vals.length ? vals : undefined };
    });
  });

  // Sync filters.status → statusChecks (for external changes)
  $effect(() => {
    const status = filters.status ?? [];
    const curVals = extractStatusValues(untrack(() => statusChecks));
    if (sameStringSet(status, curVals)) return;
    untrack(() => {
      statusChecks = buildStatusChecks(status);
    });
  });

  // Reload dynamic status groups when tracker changes
  $effect(() => {
    const t = trackers;
    const isMulti = t.length > 1;
    untrack(() => {
      showStatusRefine = !isMulti;
    });
    if (!isMulti) {
      Promise.all([
        import('$lib/ownership-api').then((m) => m.fetchStatusTaxonomy().catch(() => null)),
        import('$lib/ownership-api').then((m) => m.fetchStatusFacets(t[0])),
      ])
        .then(([taxonomy, facets]) => {
          untrack(() => {
            if (JSON.stringify(trackers) !== JSON.stringify(t)) return;
            const discovered = discoverStatusGroups(facets, taxonomy ?? undefined);
            coalStatusGroups = discovered;
            statusChecks = buildStatusChecks(filters.status, discovered);
          });
        })
        .catch(() => {});
    }
  });

  // ── Country bidirectional sync ─────────────────────────────────────────────

  let selectedCountries = $state<string[]>([]);

  $effect(() => {
    const selected = selectedCountries;
    const cur = untrack(() => filters.country_area ?? []);
    if (sameStringSet(selected, cur)) return;
    untrack(() => {
      filters = { ...filters, country_area: selected.length ? selected : undefined };
    });
  });

  $effect(() => {
    const external = filters.country_area ?? [];
    const cur = untrack(() => selectedCountries);
    if (sameStringSet(external, cur)) return;
    untrack(() => {
      selectedCountries = [...external];
    });
  });

  // ── Extra filter fields (More fields…) ────────────────────────────────────

  const ALWAYS_SHOWN = new Set(['status', 'country_area']);

  let shownExtraFields = $state<string[]>([]);
  let fieldOptions = $state<Record<string, string[]>>({});
  let captiveRefineExpanded = $state<Record<string, boolean>>({});

  const extraFilterableFields = $derived(
    getFilterableFields(trackers).filter((f) => !ALWAYS_SHOWN.has(f.key))
  );

  async function fetchFieldOptions(key: string) {
    if (fieldOptions[key]) return;
    // Use the primary tracker for fetching options
    const tracker = trackers.includes('coal-plant') ? 'coal-plant' : 'coal-mine';
    const slug = tracker === 'coal-plant' ? 'coal-plants' : 'coal-mines';
    try {
      const res = await fetch(`${API_BASE}/catalog/metadata/${slug}/fields/${key}/stats`);
      const data = await res.json();
      if (Array.isArray(data.value_counts)) {
        fieldOptions = {
          ...fieldOptions,
          [key]: data.value_counts.map((vc: { value: string }) => String(vc.value)),
        };
      }
    } catch {
      /* ignore */
    }
  }

  function toggleExtraField(key: string) {
    if (shownExtraFields.includes(key)) {
      shownExtraFields = shownExtraFields.filter((k) => k !== key);
      const f = { ...filters };
      delete (f as Record<string, unknown>)[key];
      filters = f;
      if (openFilterPanel === key) openFilterPanel = null;
    } else {
      shownExtraFields = [...shownExtraFields, key];
      const field = getField(key);
      if (field?.filterable === 'categorical') fetchFieldOptions(key);
      // Auto-open the new field's panel and close the "add" picker
      openFilterPanel = key;
    }
  }

  function removeExtraField(key: string) {
    shownExtraFields = shownExtraFields.filter((k) => k !== key);
    const f = { ...filters };
    delete (f as Record<string, unknown>)[key];
    filters = f;
  }

  function toggleExtraValue(key: keyof CoalQueryFilters, val: string) {
    const cur = (filters[key] as string[] | undefined) ?? [];
    const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
    filters = {
      ...filters,
      [key]: next.length ? (next as CoalQueryFilters[typeof key]) : undefined,
    };
  }

  // ── Summary: aggregate + groupBy toggles ──────────────────────────────────

  const groupableFields = $derived(getGroupableFields(trackers));
  const aggregatableFields = $derived(getAggregatableFields(trackers));

  // Fields only available when a single tracker is selected (hint text)
  const singleTrackerOnlyHints = $derived.by(() => {
    if (trackers.length < 2) return [];
    const curKeys = new Set(groupableFields.map((f) => f.key));
    return (['coal-plant', 'coal-mine'] as Tracker[]).flatMap((t) =>
      getGroupableFields([t])
        .filter((f) => !curKeys.has(f.key))
        .map((f) => ({
          label: f.shortLabel ?? f.label,
          tracker: t === 'coal-plant' ? 'Coal Plants' : 'Coal Mines',
        }))
    );
  });

  function toggleAggregate(fn: AggFn, field: string) {
    const exists = aggregates.some((a) => a.fn === fn && a.field === field);
    aggregates = exists
      ? aggregates.filter((a) => !(a.fn === fn && a.field === field))
      : [...aggregates, { fn, field }];
  }

  function toggleGroupBy(field: string) {
    groupBy = groupBy.includes(field) ? groupBy.filter((f) => f !== field) : [...groupBy, field];
  }

  // Group fields by category for display
  function groupByCategory<T extends CoalField>(fields: T[]): { category: string; fields: T[] }[] {
    const map = new Map<string, T[]>();
    for (const f of fields) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push(f);
    }
    return [...map.entries()].map(([category, fields]) => ({ category, fields }));
  }

  // ── Count fetch ────────────────────────────────────────────────────────────

  type CountResult = { total: number; byType: Record<string, number> };
  let countResult = $state<CountResult | null>(null);
  let countLoading = $state(false);
  let countAbort: AbortController | null = null;

  const countUrl = $derived.by(() => {
    const p = new URLSearchParams();
    for (const t of trackers) p.append('asset_type', t);
    appendCoalFilters(p, filters);
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
      .then((r) => r.json())
      .then((data) => {
        const total = data.total ?? data.count ?? 0;
        const SLUG_TO_DISPLAY: Record<string, string> = {
          'coal-plant': 'Coal Plant',
          'coal-mine': 'Coal Mine',
        };
        const allowedTypes = new Set(trackers.map((t) => SLUG_TO_DISPLAY[t]).filter(Boolean));
        const rawByType: Record<string, number> = data.facets?.asset_type ?? {};
        const byType: Record<string, number> = {};
        for (const [type, n] of Object.entries(rawByType)) {
          if (allowedTypes.has(type)) byType[type] = n as number;
        }
        countResult = { total, byType };
        countLoading = false;
      })
      .catch((err) => {
        if (err.name !== 'AbortError') countLoading = false;
      });
  });

  function fmt(n: number) {
    return n.toLocaleString();
  }

  // ── Records table ──────────────────────────────────────────────────────────

  type TableCol = { key: string; altKey?: string | string[]; label: string };

  const tableCols = $derived<TableCol[]>(
    (() => {
      const isPlant = trackers.includes('coal-plant');
      const isMine = trackers.includes('coal-mine');
      if (isPlant && !isMine)
        return [
          { key: 'asset_name', altKey: 'name', label: 'Name' },
          { key: 'country_area', altKey: 'country', label: 'Country' },
          { key: 'status', altKey: ['Status', 'operating_status'], label: 'Status' },
          { key: 'sub_status', altKey: 'operating_sub_status', label: 'Sub-status' },
          { key: 'capacity_mw', altKey: 'capacity_megawatts', label: 'Cap. (MW)' },
          { key: 'combustion_technology', label: 'Technology' },
        ];
      if (isMine && !isPlant)
        return [
          { key: 'asset_name', altKey: 'name', label: 'Name' },
          { key: 'country_area', altKey: 'country', label: 'Country' },
          { key: 'status', altKey: ['Status', 'operating_status'], label: 'Status' },
          { key: 'sub_status', altKey: 'operating_sub_status', label: 'Sub-status' },
          { key: 'capacity_value', label: 'Capacity (Mtpa)' },
          { key: 'capacity_unit', label: 'Unit' },
        ];
      return [
        { key: 'asset_name', altKey: 'name', label: 'Name' },
        { key: 'country_area', altKey: 'country', label: 'Country' },
        { key: 'status', altKey: ['Status', 'operating_status'], label: 'Status' },
        { key: 'sub_status', altKey: 'operating_sub_status', label: 'Sub-status' },
        { key: 'asset_type', label: 'Type' },
      ];
    })()
  );

  const dataTableCols = $derived(
    tableCols.map((c) => ({
      key: c.key,
      label: c.label,
      sortable: true,
      type:
        c.key === 'capacity_mw' || c.key === 'capacity_value'
          ? ('number' as const)
          : ('string' as const),
    }))
  );

  let showTable = $state(false);
  let tableRows = $state<Record<string, unknown>[]>([]);
  let tableOffset = $state(0);
  let tableHasMore = $state(false);
  let tableLoading = $state(false);
  const PAGE = 50;

  function normalizeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
    return rows.map((row) => {
      const nested =
        (row['coal_plant_fields'] as Record<string, unknown> | null) ??
        (row['coal_mine_fields'] as Record<string, unknown> | null) ??
        {};
      const out: Record<string, unknown> = { ...nested, ...row };
      for (const col of tableCols) {
        if (out[col.key] != null || !col.altKey) continue;
        const alts = Array.isArray(col.altKey) ? col.altKey : [col.altKey];
        for (const alt of alts) {
          if (out[alt] != null) {
            out[col.key] = out[alt];
            break;
          }
        }
      }
      return out;
    });
  }

  const assetsUrl = $derived.by(() => {
    const p = new URLSearchParams();
    for (const t of trackers) p.append('asset_type', t);
    appendCoalFilters(p, filters);
    return `${API_BASE}/assets?${p.toString()}`;
  });

  async function loadTable(reset = false) {
    if (reset) {
      tableRows = [];
      tableOffset = 0;
    }
    tableLoading = true;
    try {
      const url = `${assetsUrl}&limit=${PAGE}&offset=${tableOffset}`;
      const data = await fetch(url).then((r) => r.json());
      const rows = normalizeRows((data.results ?? []) as Record<string, unknown>[]);
      tableRows = reset ? rows : [...tableRows, ...rows];
      tableOffset = tableRows.length;
      tableHasMore = tableRows.length < (data.total ?? 0);
    } catch {
      /* ignore */
    }
    tableLoading = false;
  }

  function toggleTable() {
    showTable = !showTable;
    if (showTable && tableRows.length === 0) loadTable(true);
  }

  $effect(() => {
    void assetsUrl;
    untrack(() => {
      if (showTable) loadTable(true);
      else {
        tableRows = [];
        tableOffset = 0;
      }
    });
  });

  async function downloadCsv() {
    const total = countResult?.total ?? 0;
    const limit = Math.min(total, 5000);
    const url = `${assetsUrl}&limit=${limit}`;
    const data = await fetch(url).then((r) => r.json());
    const rows = (data.results ?? []) as Record<string, unknown>[];
    if (!rows.length) return;
    const cols = tableCols.map((c) => c.key);
    const header = tableCols.map((c) => c.label);
    const lines = [
      header.join(','),
      ...rows.map((row) =>
        cols
          .map((k) => {
            const v = row[k] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gem-coal-data.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Summary table ──────────────────────────────────────────────────────────

  let summaryRows = $state<SummaryRow[]>([]);
  let summaryLoading = $state(false);
  let summaryError = $state<string | null>(null);
  let sortCol = $state<string | null>(null);
  let sortDir = $state<'asc' | 'desc'>('asc');

  function setSort(key: string) {
    if (sortCol === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else {
      sortCol = key;
      sortDir = 'asc';
    }
  }

  $effect(() => {
    void groupBy;
    untrack(() => {
      sortCol = null;
      sortDir = 'asc';
    });
  });

  const sortedSummaryRows = $derived.by(() => {
    const rows = summaryRows;
    const col = sortCol;
    if (!col) {
      if (groupBy.length === 0) return rows;
      return [...rows].sort((a, b) => {
        for (const k of groupBy) {
          const cmp = String(a[k] ?? '').localeCompare(String(b[k] ?? ''), undefined, {
            numeric: true,
            sensitivity: 'base',
          });
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }
    return [...rows].sort((a, b) => {
      const av = a[col] ?? '',
        bv = b[col] ?? '';
      const numA = Number(av),
        numB = Number(bv);
      const isNum = !isNaN(numA) && !isNaN(numB);
      const cmp = isNum
        ? numA - numB
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  });

  const summaryCols = $derived(() => {
    const cols: { key: string; label: string; tracker?: string }[] = [];
    const isBoth = trackers.length === 2;
    for (const gk of groupBy) {
      const f = getField(gk);
      cols.push({ key: gk, label: f?.shortLabel ?? f?.label ?? gk });
    }
    for (const agg of aggregates) {
      const f = getField(agg.field);
      const spec = f?.aggregatable?.find((s) => s.fn === agg.fn);
      cols.push({
        key: `${agg.fn}:${agg.field}`,
        label: spec?.label ?? `${agg.fn}(${agg.field})`,
        tracker: isBoth && f?.trackers.length === 1 ? f.trackers[0] : undefined,
      });
    }
    return cols;
  });

  // Auto-fetch summary when mode=summary with groupBy + aggregates
  $effect(() => {
    const q = coalQuery;
    if (q.aggregates.length === 0 || q.groupBy.length === 0) {
      untrack(() => {
        summaryRows = [];
        summaryError = null;
      });
      return;
    }
    untrack(() => {
      summaryLoading = true;
      summaryError = null;
      fetchSummaryTable(q)
        .then((rows) => {
          summaryRows = rows;
          summaryLoading = false;
        })
        .catch((err) => {
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

  async function downloadSummaryCsv() {
    const cols = summaryCols();
    if (!summaryRows.length || !cols.length) return;
    const header = cols.map((c) => c.label);
    const lines = [
      header.join(','),
      ...summaryRows.map((row) =>
        cols
          .map((c) => {
            const v = row[c.key] ?? '';
            return `"${String(v).replace(/"/g, '""')}"`;
          })
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'gem-coal-summary.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Plant card modal ───────────────────────────────────────────────────────

  let modalOpen = $state(false);
  let modalUnits = $state<CoalPlantUnit[] | null>(null);
  let modalLoading = $state(false);
  let modalError = $state<string | null>(null);

  function extractLocationId(row: Record<string, unknown>): string | null {
    const loc = row['location_id'] ?? row['GEM Location ID'] ?? row['gem_location_id'];
    if (loc && typeof loc === 'string') return loc;
    const id = row['asset_id'] ?? row['id'];
    if (typeof id === 'string' && /^L\d+_G\d+$/.test(id)) return id.split('_')[0];
    if (typeof id === 'string' && /^L\d+$/.test(id)) return id;
    return null;
  }

  async function openPlantModal(row: Record<string, unknown>) {
    if (row['asset_type'] && row['asset_type'] !== 'Coal Plant') return;
    const locationId = extractLocationId(row);
    if (!locationId) return;
    modalUnits = null;
    modalError = null;
    modalLoading = true;
    modalOpen = true;
    try {
      const { fetchCoalPlantLocation } = await import('$lib/ownership-api');
      const location = await fetchCoalPlantLocation(locationId);
      modalUnits = location?.units ?? null;
      if (!modalUnits?.length) modalError = 'No unit data found for this plant.';
    } catch {
      modalError = 'Failed to load plant details.';
    } finally {
      modalLoading = false;
    }
  }

  function closeModal() {
    modalOpen = false;
    modalUnits = null;
    modalError = null;
  }

  $effect(() => {
    if (!modalOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });

  // ── Mine card modal ────────────────────────────────────────────────────────

  let mineModalOpen = $state(false);
  let mineAsset = $state<CoalMineAsset | null>(null);
  let mineModalLoading = $state(false);
  let mineModalError = $state<string | null>(null);

  async function openMineModal(row: Record<string, unknown>) {
    const assetId = row['asset_id'] ?? row['gem_mine_id'] ?? row['id'];
    if (!assetId || typeof assetId !== 'string') return;
    mineAsset = null;
    mineModalError = null;
    mineModalLoading = true;
    mineModalOpen = true;
    try {
      const { fetchCoalMineAsset } = await import('$lib/ownership-api');
      mineAsset = await fetchCoalMineAsset(assetId);
      if (!mineAsset) mineModalError = 'No mine data found.';
    } catch {
      mineModalError = 'Failed to load mine details.';
    } finally {
      mineModalLoading = false;
    }
  }

  function closeMineModal() {
    mineModalOpen = false;
    mineAsset = null;
    mineModalError = null;
  }

  $effect(() => {
    if (!mineModalOpen) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMineModal();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  });

  function handleRowClick(row: Record<string, unknown>) {
    if (
      row['asset_type'] === 'Coal Mine' ||
      (!trackers.includes('coal-plant') && trackers.includes('coal-mine'))
    ) {
      openMineModal(row);
    } else {
      openPlantModal(row);
    }
  }

  // ── Collapsible section state ──────────────────────────────────────────────

  let statsExpanded = $state(true);
  let groupingExpanded = $state(true);
  /** Which filter chip panel is open: 'status' | 'country' | fieldKey | 'add' | null */
  let openFilterPanel = $state<string | null>(null);

  function toggleFilterPanel(key: string) {
    openFilterPanel = openFilterPanel === key ? null : key;
    if (key !== 'status' && key !== 'country' && key !== 'add') {
      const field = getField(key);
      if (field?.filterable === 'categorical') fetchFieldOptions(key);
    }
  }

  // ── Filter chip label helpers ──────────────────────────────────────────────

  function getStatusChipLabel(): string {
    const statusVals = new Set(filters.status ?? []);
    if (statusVals.size === 0) return 'All';
    // Check if every status across all groups is selected → "All"
    const allVals = coalStatusGroups.flatMap((sg) => sg.statuses.map((s) => s.value));
    if (allVals.length > 0 && allVals.every((v) => statusVals.has(v))) return 'All';
    const groupLabels: string[] = [];
    for (const sg of coalStatusGroups) {
      const sgVals = sg.statuses.map((s) => s.value);
      if (sgVals.length > 0 && sgVals.every((v) => statusVals.has(v))) {
        groupLabels.push(sg.label);
      }
    }
    if (groupLabels.length > 0) return groupLabels.join(' + ');
    return `${statusVals.size} status${statusVals.size !== 1 ? 'es' : ''}`;
  }

  function getCountryChipLabel(): string {
    if (selectedCountries.length === 0) return 'All';
    if (selectedCountries.length <= 2) return selectedCountries.join(', ');
    return `${selectedCountries.length} countries`;
  }

  function getExtraFieldChipLabel(key: string): string {
    const val = (filters as Record<string, unknown>)[key];
    if (!val) return '—';
    if (Array.isArray(val)) {
      if (val.length === 0) return '—';
      if (val.length === 1) return String(val[0]);
      return `${val.length} selected`;
    }
    if (typeof val === 'object') {
      const range = val as { min?: number; max?: number };
      if (range.min != null && range.max != null) return `${range.min}–${range.max}`;
      if (range.min != null) return `≥ ${range.min}`;
      if (range.max != null) return `≤ ${range.max}`;
    }
    return String(val);
  }

  // ── Summary text helpers ───────────────────────────────────────────────────

  function getAggSummary(): string {
    if (aggregates.length === 0) return 'None selected';
    return aggregates
      .map((a) => {
        const field = getField(a.field);
        const spec = field?.aggregatable?.find((s) => s.fn === a.fn);
        return spec?.label ?? `${a.fn}(${a.field})`;
      })
      .join(' · ');
  }

  function getGroupBySummary(): string {
    if (groupBy.length === 0) return 'None selected';
    return groupBy.map((k) => getField(k)?.shortLabel ?? getField(k)?.label ?? k).join(' · ');
  }

  // ── Quick-start preset loader (exposed via bind:this) ─────────────────────

  export function loadPreset(preset: WizardPreset) {
    outputMode = preset.outputMode;
    setTrackerMode(preset.trackerMode);

    // Build status checks from group IDs (empty = select all)
    const groups = makeFullStatusGroups();
    const groupSet = new Set(preset.statusGroupIds);
    const checks: Record<string, boolean> = {};
    for (const sg of groups) {
      for (const s of sg.statuses) {
        checks[`status-${sg.id}-${s.value}`] = groupSet.size === 0 || groupSet.has(sg.id);
      }
    }
    statusChecks = checks;

    groupBy = preset.groupBy;
    aggregates = preset.aggregates;
    selectedCountries = preset.countries ?? [];

    // Clear old extra filter values, then apply new ones
    const extra = preset.extraFilters ?? {};
    const extraKeys = Object.keys(extra);
    const stripped: Record<string, unknown> = { ...filters };
    for (const k of shownExtraFields) delete stripped[k];
    for (const [k, v] of Object.entries(extra)) {
      stripped[k] = v;
      fetchFieldOptions(k);
    }
    filters = stripped as typeof filters;
    shownExtraFields = extraKeys;

    openFilterPanel = null;

    if (preset.outputMode === 'summary') {
      statsExpanded = aggregates.length === 0;
      groupingExpanded = groupBy.length === 0;
    } else {
      // Records mode: open the table immediately
      showTable = true;
    }
  }

  // Expose presets list so the page can render the quickstart modal
  export { WIZARD_PRESETS };
  export type { WizardPreset };
</script>

<div class="wizard">
  <!-- ── Compact query bar (steps 1 + 2 combined) ───────────────────────────── -->
  <div class="query-bar">
    <div class="query-group">
      <span class="query-label">GET</span>
      <div class="seg-control" role="radiogroup" aria-label="Output mode">
        <label
          class="seg-btn"
          class:seg-btn--active={outputMode === 'records'}
          data-tooltip="Preview and download Raw Data on Coal Plants and Mines"
        >
          <input type="radio" name="output-mode" value="records" bind:group={outputMode} />
          Individual Records
        </label>
        <label
          class="seg-btn"
          class:seg-btn--active={outputMode === 'summary'}
          data-tooltip="Calculate, view and download summary stats on capacity, production and more, by geography, status, or other data"
        >
          <input type="radio" name="output-mode" value="summary" bind:group={outputMode} />
          Summary Statistics
        </label>
      </div>
    </div>

    <div class="query-divider" aria-hidden="true"></div>

    <div class="query-group">
      <span class="query-label">FOR</span>
      <div class="seg-control" role="radiogroup" aria-label="Dataset">
        {#each [{ value: 'plants', label: 'Coal Plants' }, { value: 'mines', label: 'Coal Mines' }, { value: 'both', label: 'Both' }] as const as opt (opt.value)}
          <label class="seg-btn" class:seg-btn--active={trackerMode === opt.value}>
            <input
              type="radio"
              name="tracker-mode"
              value={opt.value}
              checked={trackerMode === opt.value}
              onchange={() => setTrackerMode(opt.value)}
            />
            {opt.label}
          </label>
        {/each}
      </div>
    </div>
  </div>

  <!-- ── Statistics (summary mode only, collapsible) ───────────────────────── -->
  {#if outputMode === 'summary'}
    <div class="wiz-section">
      {#if !statsExpanded}
        <div class="section-summary">
          <span class="section-summary-label">Statistics</span>
          <span
            class="section-summary-text"
            class:section-summary-text--empty={aggregates.length === 0}
          >
            {getAggSummary()}
          </span>
          <button class="section-edit-btn" onclick={() => (statsExpanded = true)}>Edit ▾</button>
        </div>
      {:else}
        <div class="section-header">
          <span class="section-title">Choose your statistics:</span>
          <button class="section-done-btn" onclick={() => (statsExpanded = false)}>Done ▴</button>
        </div>

        <div class="agg-columns">
          {#if trackers.includes('coal-plant')}
            <div class="agg-col">
              {#if trackers.length > 1}
                <span class="tracker-badge tracker-badge--plant">Coal Plants</span>
              {/if}
              {#each aggregatableFields.filter((f) => f.trackers.includes('coal-plant') && !f.trackers.includes('coal-mine')) as field (field.key)}
                {#each field.aggregatable ?? [] as spec}
                  <label class="check-row">
                    <input
                      type="checkbox"
                      checked={aggregates.some((a) => a.fn === spec.fn && a.field === field.key)}
                      onchange={() => toggleAggregate(spec.fn, field.key)}
                    />
                    <span class="check-label">{spec.label}</span>
                    {#if spec.unit}<span class="unit-tag">{spec.unit}</span>{/if}
                  </label>
                {/each}
              {/each}
            </div>
          {/if}

          {#if trackers.includes('coal-mine')}
            <div class="agg-col">
              {#if trackers.length > 1}
                <span class="tracker-badge tracker-badge--mine">Coal Mines</span>
              {/if}
              {#each aggregatableFields.filter((f) => f.trackers.includes('coal-mine') && !f.trackers.includes('coal-plant')) as field (field.key)}
                {#each field.aggregatable ?? [] as spec}
                  <label class="check-row">
                    <input
                      type="checkbox"
                      checked={aggregates.some((a) => a.fn === spec.fn && a.field === field.key)}
                      onchange={() => toggleAggregate(spec.fn, field.key)}
                    />
                    <span class="check-label">{spec.label}</span>
                    {#if spec.unit}<span class="unit-tag">{spec.unit}</span>{/if}
                  </label>
                {/each}
              {/each}
            </div>
          {/if}
        </div>

        {#if aggregates.length === 0}
          <p class="step-hint">Select at least one statistic to calculate.</p>
        {/if}
      {/if}
    </div>

    <!-- ── Grouping (collapsible) ─────────────────────────────────────────── -->
    <div class="wiz-section">
      {#if !groupingExpanded}
        <div class="section-summary">
          <span class="section-summary-label">Group by</span>
          <span
            class="section-summary-text"
            class:section-summary-text--empty={groupBy.length === 0}
          >
            {getGroupBySummary()}
          </span>
          <button class="section-edit-btn" onclick={() => (groupingExpanded = true)}>Edit ▾</button>
        </div>
      {:else}
        <div class="section-header">
          <span class="section-title">Choose your grouping fields:</span>
          <button class="section-done-btn" onclick={() => (groupingExpanded = false)}>Done ▴</button
          >
        </div>

        <div class="group-grid">
          {#each groupByCategory(groupableFields) as cat (cat.category)}
            <div class="group-cat">
              <span class="cat-label">{cat.category}</span>
              {#each cat.fields as field (field.key)}
                <label class="check-row">
                  <input
                    type="checkbox"
                    checked={groupBy.includes(field.key)}
                    onchange={() => toggleGroupBy(field.key)}
                  />
                  <span class="check-label">{field.shortLabel ?? field.label}</span>
                </label>
              {/each}
            </div>
          {/each}
        </div>

        {#if singleTrackerOnlyHints.length > 0}
          <p class="step-hint">
            Switch to Coal Plants or Coal Mines only for more fields:
            {singleTrackerOnlyHints.map((h) => h.label).join(', ')}.
          </p>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- ── Filters (chip row) ────────────────────────────────────────────────── -->
  <div class="wiz-section">
    <div class="filter-chips">
      <!-- Status chip — always shown -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        class="filter-chip"
        class:filter-chip--active={openFilterPanel === 'status'}
        role="button"
        onclick={() => toggleFilterPanel('status')}
        onkeydown={(e) => e.key === 'Enter' && toggleFilterPanel('status')}
        tabindex="0"
      >
        <span class="chip-key">Status</span>
        <span class="chip-val">{getStatusChipLabel()}</span>
      </div>

      <!-- Countries chip -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        class="filter-chip"
        class:filter-chip--active={openFilterPanel === 'country'}
        role="button"
        onclick={() => toggleFilterPanel('country')}
        onkeydown={(e) => e.key === 'Enter' && toggleFilterPanel('country')}
        tabindex="0"
      >
        <span class="chip-key">Countries</span>
        <span class="chip-val">{getCountryChipLabel()}</span>
        {#if selectedCountries.length > 0}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <span
            class="chip-clear"
            role="button"
            tabindex="-1"
            onclick={(e) => {
              e.stopPropagation();
              selectedCountries = [];
            }}
            aria-label="Clear countries">×</span
          >
        {/if}
      </div>

      <!-- Extra field chips -->
      {#each shownExtraFields as fieldKey (fieldKey)}
        {@const field = getField(fieldKey)}
        {#if field}
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="filter-chip"
            class:filter-chip--active={openFilterPanel === fieldKey}
            role="button"
            onclick={() => toggleFilterPanel(fieldKey)}
            onkeydown={(e) => e.key === 'Enter' && toggleFilterPanel(fieldKey)}
            tabindex="0"
          >
            <span class="chip-key">{field.shortLabel ?? field.label}</span>
            <span class="chip-val">{getExtraFieldChipLabel(fieldKey)}</span>
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <span
              class="chip-clear"
              role="button"
              tabindex="-1"
              onclick={(e) => {
                e.stopPropagation();
                removeExtraField(fieldKey);
                if (openFilterPanel === fieldKey) openFilterPanel = null;
              }}
              aria-label="Remove {field.label} filter">×</span
            >
          </div>
        {/if}
      {/each}

      <!-- Add filter chip -->
      <!-- svelte-ignore a11y_interactive_supports_focus -->
      <div
        class="filter-chip filter-chip--add"
        class:filter-chip--active={openFilterPanel === 'add'}
        role="button"
        onclick={() => toggleFilterPanel('add')}
        onkeydown={(e) => e.key === 'Enter' && toggleFilterPanel('add')}
        tabindex="0"
      >
        + Add filter
      </div>
    </div>

    <!-- Inline expansion panel (one at a time) -->
    {#if openFilterPanel === 'status'}
      <div class="filter-panel">
        <StatusFilter
          bind:statusChecks
          statusGroups={coalStatusGroups}
          showRefine={showStatusRefine}
        />
        <div class="panel-footer">
          <button class="panel-done-btn" onclick={() => (openFilterPanel = null)}>Done</button>
        </div>
      </div>
    {:else if openFilterPanel === 'country'}
      <div class="filter-panel">
        <CountryMultiSelect bind:selected={selectedCountries} />
        <div class="panel-footer">
          <button class="panel-done-btn" onclick={() => (openFilterPanel = null)}>Done</button>
        </div>
      </div>
    {:else if openFilterPanel === 'add'}
      <div class="filter-panel">
        <div class="field-picker-list">
          {#each extraFilterableFields as field (field.key)}
            <label class="field-picker-item">
              <input
                type="checkbox"
                checked={shownExtraFields.includes(field.key)}
                onchange={() => toggleExtraField(field.key)}
              />
              <span class="field-picker-label">{field.label}</span>
              {#if field.trackers.length === 1}
                <span class="field-tracker-tag">
                  {field.trackers[0] === 'coal-plant' ? 'Plants' : 'Mines'}
                </span>
              {/if}
            </label>
          {/each}
          {#if extraFilterableFields.length === 0}
            <p class="field-picker-empty">No additional filters for current selection.</p>
          {/if}
        </div>
        <div class="panel-footer">
          <button class="panel-done-btn" onclick={() => (openFilterPanel = null)}>Done</button>
        </div>
      </div>
    {:else if openFilterPanel && shownExtraFields.includes(openFilterPanel)}
      {@const fpKey = openFilterPanel}
      {@const fpField = getField(fpKey)}
      {#if fpField}
        <div class="filter-panel">
          {#if fpKey === 'captive'}
            <div class="captive-groups">
              {#each Object.entries(CAPTIVE_INDUSTRY_GROUPS) as [groupKey, group]}
                {@const groupVals = [...group.values] as string[]}
                {@const selected = (filters.captive ?? []) as string[]}
                {@const checkedCount = groupVals.filter((v) => selected.includes(v)).length}
                {@const allChecked = checkedCount === groupVals.length}
                {@const someChecked = checkedCount > 0 && !allChecked}
                {@const canRefine = groupVals.length > 1}
                <div class="captive-group">
                  <div class="captive-group-header">
                    <label class="check-row">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        indeterminate={someChecked}
                        onchange={() => {
                          const cur = (filters.captive ?? []) as string[];
                          if (allChecked) {
                            const next = cur.filter((v) => !groupVals.includes(v));
                            filters = { ...filters, captive: next.length ? next : undefined };
                          } else {
                            const toAdd = groupVals.filter((v) => !cur.includes(v));
                            filters = { ...filters, captive: [...cur, ...toAdd] };
                          }
                        }}
                      />
                      <span class="check-label captive-group-label">{group.label}</span>
                    </label>
                    {#if canRefine}
                      <button
                        class="captive-refine-toggle"
                        onclick={() => {
                          captiveRefineExpanded = {
                            ...captiveRefineExpanded,
                            [groupKey]: !captiveRefineExpanded[groupKey],
                          };
                        }}>{captiveRefineExpanded[groupKey] ? '▼' : '▶'} Refine</button
                      >
                    {/if}
                  </div>
                  {#if canRefine && captiveRefineExpanded[groupKey]}
                    <div class="captive-refine-panel">
                      {#each groupVals as val}
                        <label class="check-row check-row--indent">
                          <input
                            type="checkbox"
                            checked={selected.includes(val)}
                            onchange={() => toggleExtraValue('captive', val)}
                          />
                          <span class="check-label">{val}</span>
                        </label>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if fpField.filterable === 'categorical'}
            {#if !fieldOptions[fpKey]}
              <p class="loading-text">Loading options…</p>
            {:else}
              <div class="multi-check-grid">
                {#each fieldOptions[fpKey] as opt}
                  <label class="check-row">
                    <input
                      type="checkbox"
                      checked={(
                        (filters[fpKey as keyof CoalQueryFilters] as string[] | undefined) ?? []
                      ).includes(opt)}
                      onchange={() => toggleExtraValue(fpKey as keyof CoalQueryFilters, opt)}
                    />
                    <span class="check-label">{opt}</span>
                  </label>
                {/each}
              </div>
            {/if}
          {:else if fpField.filterable === 'range'}
            {@const rangeVal = filters[fpKey as keyof CoalQueryFilters] as
              | { min?: number; max?: number }
              | undefined}
            <div class="range-inputs">
              <label class="range-label">
                <span>Min</span>
                <input
                  type="number"
                  class="range-input"
                  value={rangeVal?.min ?? ''}
                  oninput={(e) => {
                    const val = (e.currentTarget as HTMLInputElement).value;
                    const cur =
                      (filters[fpKey as keyof CoalQueryFilters] as {
                        min?: number;
                        max?: number;
                      }) ?? {};
                    filters = {
                      ...filters,
                      [fpKey]: val ? { ...cur, min: Number(val) } : { ...cur, min: undefined },
                    };
                  }}
                />
              </label>
              <label class="range-label">
                <span>Max</span>
                <input
                  type="number"
                  class="range-input"
                  value={rangeVal?.max ?? ''}
                  oninput={(e) => {
                    const val = (e.currentTarget as HTMLInputElement).value;
                    const cur =
                      (filters[fpKey as keyof CoalQueryFilters] as {
                        min?: number;
                        max?: number;
                      }) ?? {};
                    filters = {
                      ...filters,
                      [fpKey]: val ? { ...cur, max: Number(val) } : { ...cur, max: undefined },
                    };
                  }}
                />
              </label>
            </div>
          {:else if fpField.filterable === 'text'}
            <input
              type="text"
              class="text-input"
              value={(filters[fpKey as keyof CoalQueryFilters] as string | undefined) ?? ''}
              oninput={(e) => {
                const val = (e.currentTarget as HTMLInputElement).value;
                filters = { ...filters, [fpKey]: val || undefined };
              }}
              placeholder="Search {fpField.label.toLowerCase()}…"
            />
          {/if}
          <div class="panel-footer">
            <button class="panel-done-btn" onclick={() => (openFilterPanel = null)}>Done</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>

  <!-- ── Results ────────────────────────────────────────────────────────────── -->
  <div class="wizard-results">
    <div class="count-bar">
      <div class="count-info">
        {#if countLoading}
          <span class="count-loading">Counting…</span>
        {:else if countResult}
          <strong class="count-total">{fmt(countResult.total)}</strong>
          <span class="count-label">
            {trackers.includes('coal-plant') && trackers.includes('coal-mine')
              ? 'records'
              : trackers.includes('coal-plant')
                ? 'coal plant units'
                : 'coal mines'}
          </span>
          {#if trackers.length === 2 && Object.keys(countResult.byType).length > 0}
            <span class="count-breakdown">
              ({Object.entries(countResult.byType)
                .map(([k, v]) => `${fmt(v)} ${k}s`)
                .join(', ')})
            </span>
          {/if}
        {/if}
      </div>

      <div class="count-actions">
        {#if outputMode === 'records'}
          <button class="action-btn" onclick={toggleTable}>
            {showTable ? 'Hide table' : 'Preview table'}
          </button>
          <button
            class="action-btn action-btn--primary"
            onclick={downloadCsv}
            disabled={!countResult || countResult.total === 0}
          >
            Download CSV
          </button>
        {:else}
          <button
            class="action-btn action-btn--primary"
            onclick={downloadSummaryCsv}
            disabled={!summaryRows.length}
          >
            Download CSV
          </button>
        {/if}
      </div>
    </div>

    <!-- Records table -->
    {#if outputMode === 'records' && showTable}
      {#if tableLoading && tableRows.length === 0}
        <div class="table-status">Loading…</div>
      {:else}
        <DataTable
          columns={dataTableCols}
          data={tableRows}
          onRowClick={handleRowClick}
          showGlobalSearch={false}
          showColumnFilters={false}
          showColumnToggle={false}
          showExport={false}
          pageSize={50}
        />
        {#if tableHasMore}
          <button class="load-more-btn" onclick={() => loadTable()} disabled={tableLoading}>
            {tableLoading ? 'Loading…' : 'Load more'}
          </button>
        {/if}
      {/if}
    {/if}

    <!-- Summary table -->
    {#if outputMode === 'summary'}
      {#if groupBy.length === 0 || aggregates.length === 0}
        <p class="summary-prompt">
          {#if groupBy.length === 0 && aggregates.length === 0}
            Select statistics and grouping fields above to see results.
          {:else if groupBy.length === 0}
            Select grouping fields above to see results.
          {:else}
            Select at least one statistic above to see results.
          {/if}
        </p>
      {:else if summaryLoading}
        <div class="table-status">Calculating…</div>
      {:else if summaryError}
        <p class="summary-error">{summaryError}</p>
      {:else if summaryRows.length === 0}
        <p class="summary-prompt">No results for the current selection.</p>
      {:else}
        {@const cols = summaryCols()}
        <div class="summary-table-wrap">
          <table class="summary-table">
            <thead>
              <tr>
                {#each cols as col (col.key)}
                  <th
                    class="summary-th"
                    class:summary-th--sorted={sortCol === col.key}
                    onclick={() => setSort(col.key)}
                    role="button"
                    tabindex="0"
                    onkeydown={(e) => e.key === 'Enter' && setSort(col.key)}
                  >
                    <span class="th-inner">
                      {col.label}
                      {#if col.tracker}
                        <span class="th-tracker">
                          ({col.tracker === 'coal-plant' ? 'Plants' : 'Mines'})
                        </span>
                      {/if}
                      {#if sortCol === col.key}
                        <span class="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
                      {:else}
                        <span class="sort-arrow sort-arrow--idle">↕</span>
                      {/if}
                    </span>
                  </th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each sortedSummaryRows as row, i (i)}
                <tr class="summary-row">
                  {#each cols as col (col.key)}
                    <td class="summary-td">{fmtVal(row[col.key])}</td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
          <p class="summary-row-count">{summaryRows.length} rows</p>
        </div>
      {/if}
    {/if}
  </div>
</div>

<!-- ── Plant card modal ──────────────────────────────────────────────────────── -->
{#if modalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={closeModal} role="button" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-wrap" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close-btn" onclick={closeModal} aria-label="Close">✕</button>
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Coal Plant Details"
        tabindex="-1"
      >
        {#if modalLoading}
          <div class="modal-loading">Loading plant details…</div>
        {:else if modalError}
          <div class="modal-error">{modalError}</div>
        {:else if modalUnits}
          <CoalPlantCard units={modalUnits} open={true} />
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- ── Mine card modal ───────────────────────────────────────────────────────── -->
{#if mineModalOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={closeMineModal} role="button" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-wrap" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close-btn" onclick={closeMineModal} aria-label="Close">✕</button>
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Coal Mine Details"
        tabindex="-1"
      >
        {#if mineModalLoading}
          <div class="modal-loading">Loading mine details…</div>
        {:else if mineModalError}
          <div class="modal-error">{mineModalError}</div>
        {:else if mineAsset}
          <CoalMineCard asset={mineAsset} open={true} />
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ── Wizard shell ── */
  .wizard {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .wizard-results {
    margin-top: var(--space-2);
  }

  /* ── Query bar (GET / FOR row) ── */
  .query-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    margin-bottom: var(--space-3);
  }

  .query-group {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .query-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--gem-navy);
    min-width: 2.5rem;
    flex-shrink: 0;
  }

  .query-divider {
    width: 1px;
    height: 28px;
    background: var(--color-border);
    flex-shrink: 0;
  }

  /* ── Segmented control ── */
  .seg-control {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    width: fit-content;
  }

  .seg-btn {
    display: flex;
    align-items: center;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    background: var(--color-bg-primary);
    cursor: pointer;
    border-right: 1px solid var(--color-border);
    white-space: nowrap;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
    line-height: 1.6;
  }

  .seg-btn:first-child {
    border-radius: var(--radius-md) 0 0 var(--radius-md);
  }

  .seg-btn:last-child {
    border-right: none;
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  .seg-btn input[type='radio'] {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
    pointer-events: none;
  }

  .seg-btn--active {
    background: var(--gem-navy);
    color: #fff;
  }

  .seg-btn:hover:not(.seg-btn--active) {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  /* CSS-only tooltip for seg-btn options */
  .seg-btn[data-tooltip] {
    position: relative;
  }

  .seg-btn[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 220px;
    padding: 6px 10px;
    background: var(--color-text-primary, #1a2332);
    color: #fff;
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    text-transform: none;
    letter-spacing: 0;
    text-decoration: none;
    border-radius: 3px;
    white-space: normal;
    pointer-events: none;
    z-index: 200;
  }

  /* ── Collapsible wizard sections ── */
  .wiz-section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-4) var(--space-5);
    margin-bottom: var(--space-3);
    background: var(--color-bg-primary);
  }

  /* Collapsed state */
  .section-summary {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .section-summary-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    min-width: 4.5rem;
    flex-shrink: 0;
  }

  .section-summary-text {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .section-summary-text--empty {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .section-edit-btn {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--gem-navy);
    background: none;
    border: 1px solid var(--gem-navy);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2);
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .section-edit-btn:hover {
    background: var(--gem-navy);
    color: #fff;
  }

  /* Expanded state */
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }

  .section-title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
  }

  .section-done-btn {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--gem-navy);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    padding: 0;
  }

  .section-done-btn:hover {
    text-decoration: underline;
  }

  /* ── Summary: agg columns ── */
  .agg-columns {
    display: flex;
    gap: var(--space-6);
    flex-wrap: wrap;
  }

  .agg-col {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 220px;
  }

  .tracker-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    margin-bottom: var(--space-1);
  }

  .tracker-badge--plant {
    background: #e0ecf4;
    color: var(--gem-navy);
  }

  .tracker-badge--mine {
    background: #f0ede7;
    color: #7a5c30;
  }

  .unit-tag {
    font-size: 10px;
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    margin-left: var(--space-1);
    white-space: nowrap;
  }

  /* ── Summary: group-by grid ── */
  .group-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-5);
  }

  .group-cat {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 160px;
  }

  .cat-label {
    font-size: 10px;
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin-bottom: 2px;
  }

  /* ── Shared checkbox row ── */
  .check-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    line-height: 1.3;
  }

  .check-row input[type='checkbox'] {
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--gem-navy);
    cursor: pointer;
    width: 14px;
    height: 14px;
  }

  .check-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  /* ── Filter chip row ── */
  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-bg-primary);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    white-space: nowrap;
    transition:
      border-color var(--transition-fast),
      background var(--transition-fast),
      color var(--transition-fast);
    user-select: none;
  }

  .filter-chip:hover:not(.filter-chip--active) {
    border-color: var(--gem-navy);
    color: var(--color-text-primary);
  }

  .filter-chip--active {
    border-color: var(--gem-mint);
    border-width: 1.5px;
    background: rgba(0, 179, 136, 0.08);
    color: var(--color-text-primary);
  }

  .filter-chip--add {
    border-style: dashed;
    color: var(--color-text-tertiary);
  }

  .filter-chip--add:hover,
  .filter-chip--add.filter-chip--active {
    border-style: solid;
    border-color: var(--gem-navy);
    color: var(--gem-navy);
    background: var(--color-bg-primary);
  }

  .chip-key {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
  }

  .filter-chip--active .chip-key {
    color: var(--gem-navy);
  }

  .chip-val {
    font-size: var(--font-size-sm);
  }

  .chip-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    font-size: 11px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.08);
    color: inherit;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
  }

  .chip-clear:hover {
    background: rgba(0, 0, 0, 0.18);
  }

  .filter-chip--active .chip-clear {
    background: rgba(0, 179, 136, 0.2);
  }

  /* Expanded filter panel below chips */
  .filter-panel {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-light);
  }

  .panel-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-light);
  }

  .panel-done-btn {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--gem-navy);
    background: none;
    border: 1px solid var(--gem-navy);
    border-radius: var(--radius-sm);
    padding: 3px var(--space-3);
    cursor: pointer;
    font-family: inherit;
    transition:
      background var(--transition-fast),
      color var(--transition-fast);
  }

  .panel-done-btn:hover {
    background: var(--gem-navy);
    color: #fff;
  }

  .multi-check-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--space-2) var(--space-4);
  }

  /* ── Captive grouped filter ── */
  .captive-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .captive-group {
    border-radius: var(--radius-md);
  }

  .captive-group-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .captive-group-label {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .captive-refine-toggle {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    background: none;
    border: none;
    padding: 0 var(--space-1);
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }

  .captive-refine-toggle:hover {
    color: var(--color-text-secondary);
  }

  .captive-refine-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-1) 0 var(--space-1) var(--space-6);
    margin-top: var(--space-1);
  }

  .check-row--indent {
    padding-left: var(--space-1);
  }

  .range-inputs {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .range-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .range-input {
    width: 100px;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-family: inherit;
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
  }

  .text-input {
    width: 100%;
    max-width: 320px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    font-family: inherit;
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
  }

  .loading-text {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .field-picker-list {
    padding: var(--space-3) var(--space-4);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2) var(--space-5);
  }

  .field-picker-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
  }

  .field-picker-item input[type='checkbox'] {
    flex-shrink: 0;
    margin: 0;
    accent-color: var(--gem-navy);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }

  .field-picker-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .field-tracker-tag {
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
    background: var(--color-bg-tertiary);
    padding: 1px 5px;
    border-radius: var(--radius-full);
    margin-left: auto;
    white-space: nowrap;
  }

  .field-picker-empty {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: 0;
    grid-column: 1 / -1;
  }

  /* ── Step hint ── */
  .step-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: var(--space-3) 0 0 0;
  }

  /* ── Count bar ── */
  .count-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-3);
  }

  .count-info {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .count-total {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
  }

  .count-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .count-breakdown {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .count-loading {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .count-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .action-btn {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  .action-btn:hover:not(:disabled) {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
  }

  .action-btn--primary {
    background: var(--gem-navy);
    border-color: var(--gem-navy);
    color: #fff;
  }

  .action-btn--primary:hover:not(:disabled) {
    background: #163a50;
    border-color: #163a50;
    color: #fff;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* ── Table states ── */
  .table-status {
    padding: var(--space-6);
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .load-more-btn {
    display: block;
    margin: var(--space-3) auto 0;
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-family: inherit;
  }

  .load-more-btn:hover:not(:disabled) {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
  }

  /* ── Summary table ── */
  .summary-prompt,
  .summary-error {
    padding: var(--space-5);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-align: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    margin: 0;
  }

  .summary-error {
    color: var(--color-error);
    background: var(--color-error-light);
    border-color: var(--color-error);
  }

  .summary-table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .summary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .summary-th {
    padding: var(--space-2) var(--space-4);
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }

  .summary-th:hover {
    background: var(--color-bg-tertiary);
    color: var(--color-text-primary);
  }

  .summary-th--sorted {
    color: var(--gem-navy);
  }

  .th-inner {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .th-tracker {
    font-weight: 400;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  .sort-arrow {
    font-size: 11px;
    color: var(--gem-navy);
  }

  .sort-arrow--idle {
    color: var(--color-text-tertiary);
    opacity: 0.4;
  }

  .summary-row:nth-child(even) {
    background: var(--color-bg-secondary);
  }

  .summary-td {
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border-light);
    color: var(--color-text-primary);
    white-space: nowrap;
  }

  .summary-row-count {
    padding: var(--space-2) var(--space-4);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    border-top: 1px solid var(--color-border);
    margin: 0;
    background: var(--color-bg-secondary);
  }

  /* ── Modals ── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    z-index: 1000;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: var(--space-8) var(--space-4);
    overflow-y: auto;
  }

  /* Outer wrapper: overflow visible so the close button can bleed outside the card */
  .modal-wrap {
    position: relative;
    width: 100%;
    max-width: 900px;
    margin: auto;
  }

  .modal-panel {
    background: var(--color-bg-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    width: 100%;
    overflow: hidden;
  }

  /* Disable the card's native collapse toggle inside the modal */
  .modal-panel :global(details.tracker-card > summary) {
    pointer-events: none;
    cursor: default;
  }

  .modal-close-btn {
    position: absolute;
    top: -14px;
    right: -14px;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid var(--color-bg-primary);
    background: var(--color-text-secondary);
    color: #fff;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    box-shadow: var(--shadow-md);
  }

  .modal-close-btn:hover {
    background: var(--color-text-primary);
  }

  .modal-loading,
  .modal-error {
    padding: var(--space-8);
    text-align: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .modal-error {
    color: var(--color-error);
  }
</style>
