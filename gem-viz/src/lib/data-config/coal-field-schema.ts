/**
 * coal-field-schema.ts
 *
 * Single source of truth for every field that can be filtered on, grouped by,
 * or aggregated in the Coal Data Explorer (coal plants + coal mines).
 *
 * Keys match the `code_friendly_name` values from the API metadata endpoints:
 *   GET /catalog/metadata/coal-plants
 *   GET /catalog/metadata/coal-mines
 *
 * `groupable` and `aggregatable` are defined here client-side; the API metadata
 * does not yet expose these flags. `filterable` aligns with `is_filterable` in
 * the API metadata where it exists, extended where we need it.
 *
 * URL serialization for the CoalQuery is documented at the bottom of this file.
 *
 * Plant vs unit granularity: coal plant data is at the *unit* level — a power
 * station can have multiple generating units. When aggregating, the user
 * explicitly chooses whether to treat each unit as a row ("per unit") or to
 * first collapse units into plants via location_id ("per plant"). This is a
 * UI toggle, not encoded metadata — researchers should see what computation
 * they're asking for.
 */

export type Tracker = 'coal-plant' | 'coal-mine';

export type FilterType =
  | 'categorical' // multi-select from a known value set
  | 'range' // numeric min/max or year min/max
  | 'text'; // free-text search (not suitable for group-by)

export type AggFn = 'sum' | 'avg' | 'count';

export interface AggregateSpec {
  fn: AggFn;
  label: string; // e.g. "Total capacity (MW)"
  unit?: string; // e.g. "MW", "Mtpa", "Mt CO₂"
}

export interface CoalField {
  key: string; // API code_friendly_name
  label: string; // Full display label
  shortLabel?: string; // For column headers / chips where space is tight
  trackers: Tracker[]; // Which tracker(s) this field belongs to
  category: string; // Mirrors API fieldCategoriesOrdered
  filterable?: FilterType;
  groupable?: boolean;
  groupableSingleTrackerOnly?: boolean; // If true, only show in group-by when a single tracker is selected
  aggregatable?: AggregateSpec[];
  apiFieldKey?: string; // Override API field key in URL (defaults to key)
  skipPlantCollapse?: boolean; // Skip location_id collapse even in project granularity mode
}

// ── Shared fields (present in both trackers with the same API key) ─────────

const SHARED: CoalField[] = [
  {
    key: 'country_area',
    label: 'Country / Area',
    shortLabel: 'Country',
    trackers: ['coal-plant', 'coal-mine'],
    category: 'Geography',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'status',
    label: 'Status',
    trackers: ['coal-plant', 'coal-mine'],
    category: 'Main',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'sub_status',
    label: 'Sub-status',
    trackers: ['coal-plant', 'coal-mine'],
    category: 'Main',
    groupable: true,
    groupableSingleTrackerOnly: true,
  },
  {
    key: 'coal_type',
    label: 'Coal type',
    trackers: ['coal-plant', 'coal-mine'],
    category: 'Details',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'owner', // 'owner' for plants, 'owners' for mines — resolved per-tracker
    label: 'Owner',
    trackers: ['coal-plant', 'coal-mine'],
    category: 'Ownership',
    filterable: 'text',
  },
];

// ── Count pseudo-fields (use status as API proxy, never shown as filters) ──

const COUNT_FIELDS: CoalField[] = [
  {
    key: '_count_plants',
    label: 'Count of plants',
    shortLabel: '# Plants',
    trackers: ['coal-plant'],
    category: 'Count',
    apiFieldKey: 'status',
    aggregatable: [{ fn: 'count', label: 'Count of plants' }],
  },
  {
    key: '_count_plant_units',
    label: 'Count of plant units',
    shortLabel: '# Plant units',
    trackers: ['coal-plant'],
    category: 'Count',
    apiFieldKey: 'status',
    skipPlantCollapse: true,
    aggregatable: [{ fn: 'count', label: 'Count of plant units' }],
  },
  {
    key: '_count_mines',
    label: 'Count of mines',
    shortLabel: '# Mines',
    trackers: ['coal-mine'],
    category: 'Count',
    apiFieldKey: 'status',
    aggregatable: [{ fn: 'count', label: 'Count of mines' }],
  },
];

// ── Coal Plant-only fields ─────────────────────────────────────────────────

const PLANT_FIELDS: CoalField[] = [
  {
    key: 'subnational_unit_province_state',
    label: 'Subnational unit (province / state)',
    shortLabel: 'Subnational unit',
    trackers: ['coal-plant'],
    category: 'Geography',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'region',
    label: 'Region',
    trackers: ['coal-plant'],
    category: 'Geography',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'subregion',
    label: 'Subregion',
    trackers: ['coal-plant'],
    category: 'Geography',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'combustion_technology',
    label: 'Combustion technology',
    shortLabel: 'Technology',
    trackers: ['coal-plant'],
    category: 'Main',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'coal_source',
    label: 'Coal source',
    trackers: ['coal-plant'],
    category: 'Main',
    filterable: 'text',
  },
  {
    key: 'captive',
    label: 'Captive',
    trackers: ['coal-plant'],
    category: 'Details',
    filterable: 'categorical',
    // groupable omitted: field can return arrays of values, making grouping ambiguous.
    // Revisit once API normalises this field.
  },
  {
    key: 'chp',
    label: 'CHP (heat & power)',
    shortLabel: 'CHP',
    trackers: ['coal-plant'],
    category: 'Details',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'alternate_fuel',
    label: 'Alternate fuel',
    trackers: ['coal-plant'],
    category: 'Details',
    filterable: 'categorical',
  },
  {
    key: 'capacity_mw',
    label: 'Capacity (MW)',
    shortLabel: 'Capacity',
    trackers: ['coal-plant'],
    category: 'Size',
    aggregatable: [{ fn: 'sum', label: 'Total capacity (MW)', unit: 'MW' }],
  },
  {
    key: 'annual_co2_million_tonnes___annum',
    label: 'Annual CO₂ (Mt / yr)',
    shortLabel: 'Annual CO₂',
    trackers: ['coal-plant'],
    category: 'CO2 estimates',
    aggregatable: [{ fn: 'sum', label: 'Total annual CO₂ (Mt / yr)', unit: 'Mt CO₂/yr' }],
  },
  {
    key: 'lifetime_co2_million_tonnes',
    label: 'Lifetime CO₂ (Mt)',
    shortLabel: 'Lifetime CO₂',
    trackers: ['coal-plant'],
    category: 'CO2 estimates',
    aggregatable: [{ fn: 'sum', label: 'Total lifetime CO₂ (Mt)', unit: 'Mt CO₂' }],
  },
  {
    key: 'plant_age_years',
    label: 'Plant age (years)',
    shortLabel: 'Age',
    trackers: ['coal-plant'],
    category: 'Age',
  },
  {
    key: 'remaining_plant_lifetime_years',
    label: 'Remaining lifetime (years)',
    shortLabel: 'Remaining life',
    trackers: ['coal-plant'],
    category: 'Age',
  },
  {
    key: 'start_year',
    label: 'Start year',
    trackers: ['coal-plant'],
    category: 'Age',
    filterable: 'range',
  },
  {
    key: 'retired_year',
    label: 'Retired year',
    trackers: ['coal-plant'],
    category: 'Age',
    filterable: 'range',
  },
  {
    key: 'planned_retirement',
    label: 'Planned retirement',
    shortLabel: 'Planned ret.',
    trackers: ['coal-plant'],
    category: 'Details',
    filterable: 'range',
  },
];

// ── Coal Mine-only fields ──────────────────────────────────────────────────

const MINE_FIELDS: CoalField[] = [
  {
    key: 'mine_type',
    label: 'Mine type',
    trackers: ['coal-mine'],
    category: 'Main',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'mining_method',
    label: 'Mining method',
    trackers: ['coal-mine'],
    category: 'Main',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'coal_grade',
    label: 'Coal grade',
    trackers: ['coal-mine'],
    category: 'Details',
    filterable: 'categorical',
    groupable: true,
  },
  {
    key: 'percentage_of_met_coal',
    label: '% Met coal',
    trackers: ['coal-mine'],
    category: 'Details',
    filterable: 'range',
  },
  {
    key: 'percentage_of_thermal_coal',
    label: '% Thermal coal',
    trackers: ['coal-mine'],
    category: 'Details',
    filterable: 'range',
  },
  {
    key: 'capacity_mtpa',
    label: 'Capacity (Mtpa)',
    shortLabel: 'Capacity',
    trackers: ['coal-mine'],
    category: 'Size',
    aggregatable: [{ fn: 'sum', label: 'Total capacity (Mtpa)', unit: 'Mtpa' }],
  },
  {
    key: 'production_mtpa',
    label: 'Production (Mtpa)',
    shortLabel: 'Production',
    trackers: ['coal-mine'],
    category: 'Size',
    aggregatable: [{ fn: 'sum', label: 'Total production (Mtpa)', unit: 'Mtpa' }],
  },
  {
    key: 'workforce_size',
    label: 'Workforce size',
    shortLabel: 'Workforce',
    trackers: ['coal-mine'],
    category: 'Size',
    aggregatable: [{ fn: 'sum', label: 'Total workforce', unit: 'workers' }],
  },
  {
    key: 'gem_coal_mine_methane_emissions_estimate_m_tonnes_yr',
    label: 'GEM methane estimate (Mt / yr)',
    shortLabel: 'Methane (Mt/yr)',
    trackers: ['coal-mine'],
    category: 'Methane',
    aggregatable: [{ fn: 'sum', label: 'Total methane emissions (Mt / yr)', unit: 'Mt/yr' }],
  },
  {
    key: 'opening_year',
    label: 'Opening year',
    trackers: ['coal-mine'],
    category: 'Age',
    filterable: 'range',
  },
  {
    key: 'closing_year',
    label: 'Closing year',
    trackers: ['coal-mine'],
    category: 'Age',
    filterable: 'range',
  },
  {
    key: 'primary_consumer_destination',
    label: 'Primary consumer / destination',
    shortLabel: 'Primary consumer',
    trackers: ['coal-mine'],
    category: 'End Users',
    filterable: 'text',
  },
];

// ── Master list ────────────────────────────────────────────────────────────

export const COAL_FIELDS: CoalField[] = [
  ...SHARED,
  ...PLANT_FIELDS,
  ...MINE_FIELDS,
  ...COUNT_FIELDS,
];

// ── Lookup helpers ─────────────────────────────────────────────────────────

export function getField(key: string): CoalField | undefined {
  return COAL_FIELDS.find((f) => f.key === key);
}

export function getFieldsForTrackers(trackers: Tracker[]): CoalField[] {
  return COAL_FIELDS.filter((f) => f.trackers.some((t) => trackers.includes(t)));
}

export function getFilterableFields(trackers: Tracker[]): CoalField[] {
  return getFieldsForTrackers(trackers).filter((f) => f.filterable);
}

export function getGroupableFields(trackers: Tracker[]): CoalField[] {
  const isMulti = trackers.length > 1;
  return COAL_FIELDS.filter((f) => {
    if (!f.groupable) return false;
    // When multiple trackers selected: field must cover ALL selected trackers
    if (isMulti) {
      if (f.groupableSingleTrackerOnly) return false;
      return trackers.every((t) => f.trackers.includes(t));
    }
    // Single tracker: field must apply to that tracker
    return f.trackers.includes(trackers[0]);
  });
}

export function getAggregatableFields(trackers: Tracker[]): CoalField[] {
  return getFieldsForTrackers(trackers).filter((f) => f.aggregatable && f.aggregatable.length > 0);
}

// ── CoalQuery type & URL serialization ────────────────────────────────────
//
// URL format (all params flat, arrays comma-separated):
//
//   ?tracker=coal-plant,coal-mine
//   &filter.country_area=China,India
//   &filter.status=operating,construction
//   &filter.start_year=2000:2015          (range: min:max, either side optional → :2015 or 2000:)
//   &filter.percentage_of_met_coal=50:    (range: 50% or more)
//   &groupBy=country_area,status
//   &aggregate=sum:capacity_mw,avg:plant_age_years
//   &view=table
//
// Example plain-English rendering of the above:
//   "Coal Plants in China or India · operating or under construction ·
//    started 2000–2015 · grouped by country + status · total capacity (MW)"

export interface CoalQueryFilters {
  country_area?: string[];
  status?: string[];
  // plants
  subnational_unit_province_state?: string[];
  region?: string[];
  subregion?: string[];
  combustion_technology?: string[];
  coal_source?: string;
  captive?: string[];
  chp?: string[];
  alternate_fuel?: string[];
  start_year?: { min?: number; max?: number };
  retired_year?: { min?: number; max?: number };
  planned_retirement?: { min?: number; max?: number };
  // mines
  mine_type?: string[];
  mining_method?: string[];
  coal_grade?: string[];
  percentage_of_met_coal?: { min?: number; max?: number };
  percentage_of_thermal_coal?: { min?: number; max?: number };
  opening_year?: { min?: number; max?: number };
  closing_year?: { min?: number; max?: number };
  primary_consumer_destination?: string;
  // shared
  coal_type?: string[];
  owner?: string;
}

export interface CoalQueryAggregate {
  fn: AggFn;
  field: string; // CoalField.key
}

export type CoalView = 'table' | 'cards' | 'summary';

/**
 * Granularity: per project (plant/mine) or per unit?
 *
 * 'project' → coal-plant queries include location_id in group_by so the API
 *             returns one row per plant. Client then collapses using the user's
 *             chosen agg function. Mines unaffected (one row per mine already).
 * 'unit'    → no location_id. Each generating unit is a row. Only matters for
 *             coal-plant; mines have no sub-units.
 *
 * Default: 'project' — researchers think about power stations, not units.
 */
export type Granularity = 'project' | 'unit';

export interface CoalQuery {
  trackers: Tracker[];
  filters: CoalQueryFilters;
  groupBy: string[]; // CoalField.key[]
  aggregates: CoalQueryAggregate[];
  granularity: Granularity;
  view: CoalView;
}

export const DEFAULT_QUERY: CoalQuery = {
  trackers: ['coal-plant'],
  filters: {},
  groupBy: [],
  aggregates: [],
  granularity: 'project',
  view: 'table',
};

// Serialize a CoalQuery to URLSearchParams
export function queryToParams(q: CoalQuery): URLSearchParams {
  const p = new URLSearchParams();

  p.set('tracker', q.trackers.join(','));

  for (const [key, val] of Object.entries(q.filters)) {
    if (val == null) continue;
    if (Array.isArray(val)) {
      if (val.length) p.set(`filter.${key}`, val.join(','));
    } else if (typeof val === 'object') {
      // range
      const range = val as { min?: number; max?: number };
      const str = `${range.min ?? ''}:${range.max ?? ''}`;
      if (str !== ':') p.set(`filter.${key}`, str);
    } else if (typeof val === 'string' && val) {
      p.set(`filter.${key}`, val);
    }
  }

  if (q.groupBy.length) p.set('groupBy', q.groupBy.join(','));
  if (q.aggregates.length)
    p.set('aggregate', q.aggregates.map((a) => `${a.fn}:${a.field}`).join(','));
  if (q.granularity !== 'project') p.set('granularity', q.granularity);
  if (q.view !== 'table') p.set('view', q.view);

  return p;
}

// Parse URLSearchParams back to a CoalQuery
export function paramsToQuery(p: URLSearchParams): CoalQuery {
  const q: CoalQuery = structuredClone(DEFAULT_QUERY);

  const tracker = p.get('tracker');
  if (tracker) q.trackers = tracker.split(',') as Tracker[];

  for (const [rawKey, rawVal] of p.entries()) {
    if (!rawKey.startsWith('filter.')) continue;
    const key = rawKey.slice('filter.'.length) as keyof CoalQueryFilters;
    const field = getField(key);
    if (!field) continue;

    if (field.filterable === 'range') {
      const [minStr, maxStr] = rawVal.split(':');
      const range: { min?: number; max?: number } = {};
      if (minStr) range.min = Number(minStr);
      if (maxStr) range.max = Number(maxStr);
      (q.filters as Record<string, unknown>)[key] = range;
    } else if (field.filterable === 'categorical') {
      (q.filters as Record<string, unknown>)[key] = rawVal.split(',');
    } else {
      (q.filters as Record<string, unknown>)[key] = rawVal;
    }
  }

  const groupBy = p.get('groupBy');
  if (groupBy) q.groupBy = groupBy.split(',');

  const aggregate = p.get('aggregate');
  if (aggregate) {
    q.aggregates = aggregate.split(',').map((a) => {
      const [fn, field] = a.split(':');
      return { fn: fn as AggFn, field };
    });
  }

  const granularity = p.get('granularity') as Granularity | null;
  if (granularity) q.granularity = granularity;

  const view = p.get('view') as CoalView | null;
  if (view) q.view = view;

  return q;
}
