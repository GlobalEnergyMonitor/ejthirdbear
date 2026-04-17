import type { CoalQueryAggregate } from './coal-field-schema';
import { CAPTIVE_INDUSTRY_GROUPS } from './asset-class-definitions';

export type TrackerMode = 'plants' | 'mines' | 'both';

export interface WizardPreset {
  id: string;
  label: string;
  description: string;
  outputMode: 'records' | 'summary';
  trackerMode: TrackerMode;
  /** Status group IDs to enable. Empty array = all statuses selected. */
  statusGroupIds: string[];
  groupBy: string[];
  aggregates: CoalQueryAggregate[];
  countries?: string[];
  /** Extra filter values keyed by field key (e.g. captive, coal_type). */
  extraFilters?: Record<string, string[]>;
}

export const WIZARD_PRESETS: WizardPreset[] = [
  {
    id: 'planned-plants-and-mines',
    label: 'Planned plants and mines',
    description: 'Planned coal plants and coal mines, globally.',
    outputMode: 'records',
    trackerMode: 'both',
    statusGroupIds: ['planned'],
    groupBy: [],
    aggregates: [],
  },
  {
    id: 'plants-and-mines-count-by-country)',
    label: 'Project counts by country',
    description: 'Count of operating coal plants and coal mines, by country.',
    outputMode: 'summary',
    trackerMode: 'both',
    statusGroupIds: ['operating'],
    groupBy: ['country_area'],
    aggregates: [
      { fn: 'count', field: '_count_mines' },
      { fn: 'count', field: '_count_plants' },
    ],
  },
  {
    id: 'planned-captive-plants-metals',
    label: 'Planned captive plants for metals',
    description: 'Planned coal plants supplying captive power to metals industries.',
    outputMode: 'records',
    trackerMode: 'plants',
    statusGroupIds: ['planned'],
    groupBy: [],
    aggregates: [],
    extraFilters: {
      captive: [...CAPTIVE_INDUSTRY_GROUPS.metals.values],
    },
  },
  {
    id: 'surface-mines-in-china',
    label: 'Surface mines in China',
    description: 'Operating surface coal mines in China.',
    outputMode: 'records',
    trackerMode: 'mines',
    statusGroupIds: ['operating'],
    groupBy: [],
    aggregates: [],
    extraFilters: {
      mine_type: ['Surface', 'Underground & Surface'],
    },
    countries: ['China'],
  },
  {
    id: 'capacity-by-state-and-status-india',
    label: 'Capacity by state & status in India',
    description:
      'Coal plant count and MW capacity grouped by province and status, filtered to India.',
    outputMode: 'summary',
    trackerMode: 'plants',
    statusGroupIds: [],
    groupBy: ['subnational_unit_province_state', 'status'],
    aggregates: [
      { fn: 'count', field: '_count_plants' },
      { fn: 'sum', field: 'capacity_mw' },
    ],
    countries: ['India'],
  },
  {
    id: 'mine-workforce-by-country',
    label: 'Mine workforce by country',
    description: 'Total workforce at operating coal mines, grouped by country.',
    outputMode: 'summary',
    trackerMode: 'mines',
    statusGroupIds: ['operating'],
    groupBy: ['country_area'],
    aggregates: [
      { fn: 'count', field: '_count_mines' },
      { fn: 'sum', field: 'workforce_size' },
    ],
  },
];
