/**
 * coal-query.svelte.ts
 *
 * Reactive state for the Coal Data Explorer. Instantiated once in +page.svelte
 * and passed to child components via Svelte context.
 *
 * Owns the CoalQuery object and all derived representations of it:
 *   - URL search params (for navigation / sharing)
 *   - Human-readable description (for CoalQueryBar)
 *   - API URL (for the "Copy API URL" button)
 */

import { goto } from '$app/navigation';
import { base } from '$app/paths';
import {
  DEFAULT_QUERY,
  queryToParams,
  paramsToQuery,
  getField,
  type CoalQuery,
  type CoalQueryFilters,
  type CoalQueryAggregate,
  type CoalView,
  type Tracker,
} from '$lib/data-config/coal-field-schema';

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

const TRACKER_LABELS: Record<Tracker, string> = {
  'coal-plant': 'Coal Plants',
  'coal-mine': 'Coal Mines',
};

export class CoalQueryState {
  query = $state<CoalQuery>(structuredClone(DEFAULT_QUERY));

  // ── Derived representations ──────────────────────────────────────────────

  params = $derived(queryToParams(this.query));

  apiUrl = $derived.by(() => {
    const p = new URLSearchParams();
    // Tracker → asset_type
    for (const t of this.query.trackers) p.append('asset_type', t);
    // Filters
    const f = this.query.filters;
    if (f.country_area?.length) for (const c of f.country_area) p.append('country', c);
    if (f.status?.length) for (const s of f.status) p.append('status', s);
    // Group-by and aggregates (API will support these; include for forward-compat)
    if (this.query.groupBy.length) p.set('group_by', this.query.groupBy.join(','));
    if (this.query.aggregates.length)
      p.set('aggregate', this.query.aggregates.map((a) => `${a.fn}:${a.field}`).join(','));
    return `${API_BASE}/assets?${p.toString()}`;
  });

  // Plain-English sentence describing the current query.
  // e.g. "Coal Plants in China · operating · grouped by subnational unit + status · total capacity (MW)"
  description = $derived.by((): string => {
    const parts: string[] = [];

    // Trackers
    parts.push(this.query.trackers.map((t) => TRACKER_LABELS[t]).join(' + '));

    // Geography
    const f = this.query.filters;
    if (f.country_area?.length) {
      parts.push(`in ${f.country_area.join(', ')}`);
    }

    // Status
    if (f.status?.length) {
      parts.push(f.status.join(', '));
    }

    // Other active filters (everything except country + status)
    const skipKeys = new Set(['country_area', 'status']);
    for (const [key, val] of Object.entries(f)) {
      if (skipKeys.has(key) || val == null) continue;
      const field = getField(key);
      const label = field?.shortLabel ?? field?.label ?? key;
      if (Array.isArray(val) && val.length) {
        parts.push(`${label}: ${val.join(', ')}`);
      } else if (typeof val === 'object' && ('min' in val || 'max' in val)) {
        const { min, max } = val as { min?: number; max?: number };
        if (min != null && max != null) parts.push(`${label}: ${min}–${max}`);
        else if (min != null) parts.push(`${label}: ≥${min}`);
        else if (max != null) parts.push(`${label}: ≤${max}`);
      } else if (typeof val === 'string' && val) {
        parts.push(`${label}: ${val}`);
      }
    }

    // Group-by
    if (this.query.groupBy.length) {
      const labels = this.query.groupBy
        .map((k) => getField(k)?.shortLabel ?? getField(k)?.label ?? k)
        .join(' + ');
      parts.push(`grouped by ${labels}`);
    }

    // Aggregates
    if (this.query.aggregates.length) {
      const labels = this.query.aggregates
        .map((a) => {
          const field = getField(a.field);
          const spec = field?.aggregatable?.find((s) => s.fn === a.fn);
          return spec?.label ?? `${a.fn}(${a.field})`;
        })
        .join(', ');
      parts.push(labels);
    }

    return parts.join(' · ');
  });

  // True if any filters/groupBy/aggregates differ from the default
  isDirty = $derived(
    JSON.stringify(this.query.filters) !== JSON.stringify(DEFAULT_QUERY.filters) ||
      this.query.groupBy.length > 0 ||
      this.query.aggregates.length > 0
  );

  activeFilterCount = $derived(
    Object.values(this.query.filters).filter((v) => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.values(v).some((x) => x != null);
      return !!v;
    }).length
  );

  // ── Initialisation ───────────────────────────────────────────────────────

  init(searchParams: URLSearchParams) {
    this.query = paramsToQuery(searchParams);
  }

  // ── Mutation helpers ─────────────────────────────────────────────────────

  setTrackers(trackers: Tracker[]) {
    this.query = { ...this.query, trackers };
    this.#sync();
  }

  setFilter<K extends keyof CoalQueryFilters>(key: K, value: CoalQueryFilters[K]) {
    if (JSON.stringify(this.query.filters[key]) === JSON.stringify(value)) return;
    this.query = { ...this.query, filters: { ...this.query.filters, [key]: value } };
    this.#sync();
  }

  clearFilter(key: keyof CoalQueryFilters) {
    const filters = { ...this.query.filters };
    delete filters[key];
    this.query = { ...this.query, filters };
    this.#sync();
  }

  clearAllFilters() {
    this.query = { ...this.query, filters: {} };
    this.#sync();
  }

  setGroupBy(groupBy: string[]) {
    this.query = { ...this.query, groupBy };
    this.#sync();
  }

  setAggregates(aggregates: CoalQueryAggregate[]) {
    this.query = { ...this.query, aggregates };
    this.#sync();
  }

  setView(view: CoalView) {
    this.query = { ...this.query, view };
    this.#sync();
  }

  // Apply a full query snapshot at once (used by presets)
  applyQuery(partial: Partial<Omit<CoalQuery, 'view'>>) {
    this.query = {
      ...structuredClone(DEFAULT_QUERY),
      ...partial,
      view: this.query.view,
    };
    this.#sync();
  }

  // ── URL sync ─────────────────────────────────────────────────────────────

  #sync() {
    const params = queryToParams(this.query);
    goto(`${base}/coal?${params.toString()}`, { replaceState: true, keepFocus: true });
  }
}

// Context key for passing state through the component tree
export const COAL_QUERY_KEY = Symbol('coal-query');
