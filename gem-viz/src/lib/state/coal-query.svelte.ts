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
  type Granularity,
} from '$lib/data-config/coal-field-schema';
import { STATUS_GROUPS, displayStatusToApiKey, isCoarseStatus } from '$lib/data-config/tracker-schema';

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

/**
 * Appends coal filter params to a URLSearchParams.
 * - status → status=groupId when all group members selected, sub_status=val otherwise
 * - country_area → country
 * - all other categorical filter arrays → field_key=val (passed through as-is)
 */
export function appendCoalFilters(p: URLSearchParams, filters: CoalQueryFilters): void {
  // Status: map individual values to status= or sub_status= based on group membership.
  // The API only accepts status= for coarse groups (operating/planned/retired).
  // All other values must be sent as sub_status= in snake_case API format.
  if (filters.status?.length) {
    const selectedSet = new Set(filters.status);
    const handledVals = new Set<string>();

    for (const sg of STATUS_GROUPS) {
      const inGroup = (sg.statuses as readonly string[]).filter((s) => selectedSet.has(s));
      if (inGroup.length === 0) continue;

      if (inGroup.length === sg.statuses.length && isCoarseStatus(sg.id)) {
        // Full group selected and API supports status=groupId
        p.append('status', sg.id);
      } else {
        // Partial group or non-coarse group (e.g. cancelled) → individual sub_status values
        for (const v of inGroup) {
          const apiKey = displayStatusToApiKey(v);
          if (apiKey) p.append('sub_status', apiKey);
        }
      }
      for (const v of inGroup) handledVals.add(v);
    }

    // Any selected values not matched by STATUS_GROUPS
    for (const v of filters.status) {
      if (!handledVals.has(v)) {
        if (isCoarseStatus(v)) {
          p.append('status', v);
        } else {
          const apiKey = displayStatusToApiKey(v);
          if (apiKey) p.append('sub_status', apiKey);
        }
      }
    }
  }

  // Country
  if (filters.country_area?.length) {
    for (const c of filters.country_area) p.append('country', c);
  }

  // All other categorical filter arrays
  const SKIP = new Set(['status', 'country_area']);
  for (const [key, vals] of Object.entries(filters)) {
    if (SKIP.has(key) || !Array.isArray(vals) || vals.length === 0) continue;
    for (const v of vals) p.append(key, v as string);
  }
}

const TRACKER_LABELS: Record<Tracker, string> = {
  'coal-plant': 'Coal Plants',
  'coal-mine': 'Coal Mines',
};

export class CoalQueryState {
  query = $state<CoalQuery>(structuredClone(DEFAULT_QUERY));

  // ── Derived representations ──────────────────────────────────────────────

  params = $derived(queryToParams(this.query));

  /**
   * All API URLs the current query will hit.
   * Records mode: single /assets URL.
   * Summary mode: one URL per aggregate field, reflecting granularity
   * (location_id in group_by when plant-mode for coal-plant fields).
   */
  apiUrls = $derived.by((): string[] => {
    if (this.query.aggregates.length === 0) {
      const p = new URLSearchParams();
      for (const t of this.query.trackers) p.append('asset_type', t);
      appendCoalFilters(p, this.query.filters);
      return [`${API_BASE}/assets?${p.toString()}`];
    }

    return this.query.aggregates.map(agg => {
      const field = getField(agg.field);
      const tracker = field?.trackers[0] ?? this.query.trackers[0];
      const trackerSlug = tracker.endsWith('s') ? tracker : tracker + 's';
      const p = new URLSearchParams();
      appendCoalFilters(p, this.query.filters);
      // Reflect granularity: plant-mode adds location_id for coal-plant fields
      const needsPlantCollapse =
        this.query.granularity === 'project' &&
        tracker === 'coal-plant' &&
        field?.aggregatable != null;
      if (needsPlantCollapse) p.append('group_by', 'location_id');
      for (const g of this.query.groupBy) p.append('group_by', g);
      return `${API_BASE}/catalog/metadata/${trackerSlug}/fields/${agg.field}/${agg.fn}?${p.toString()}`;
    });
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

  /**
   * Whether to show the plant/unit toggle.
   * Only when coal-plant is selected AND in summary mode with aggregates.
   * Mines have no sub-units so the toggle would be meaningless.
   */
  showGranularityToggle = $derived(
    this.query.trackers.includes('coal-plant') &&
    this.query.aggregates.length > 0
  );

  /**
   * Label for counts — changes with tracker selection and granularity.
   * "plants" / "mines" / "units" / "projects" as appropriate.
   */
  entityLabel = $derived.by((): string => {
    const hasPlant = this.query.trackers.includes('coal-plant');
    const hasMine = this.query.trackers.includes('coal-mine');
    if (hasPlant && hasMine) {
      return this.query.granularity === 'unit' ? 'units & mines' : 'projects';
    }
    if (hasMine) return 'mines';
    return this.query.granularity === 'unit' ? 'units' : 'plant units';
  });

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

  setGranularity(granularity: Granularity) {
    this.query = { ...this.query, granularity };
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
    goto(`${base}/coal-data-explorer?${params.toString()}`, { replaceState: true, keepFocus: true });
  }
}

// Context key for passing state through the component tree
export const COAL_QUERY_KEY = Symbol('coal-query');
