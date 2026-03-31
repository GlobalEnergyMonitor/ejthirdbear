/**
 * @module tokens/colors
 * Color constants: brand, tracker, status, map, ownership, and legacy Maps.
 */

import {
  STATUS_GROUPS as _SCHEMA_STATUS_GROUPS,
  FOSSIL_TRACKERS as _SCHEMA_FOSSIL_TRACKERS,
  PROSPECTIVE_STATUSES as _SCHEMA_PROSPECTIVE_STATUSES,
} from '$lib/data-config/tracker-schema';

// =============================================================================
// 1. GEM BRAND COLORS
// =============================================================================

export const colors = {
  // --- GEM Core Brand ---
  primaryBlue: '#1D4961',
  navy: '#1D4961',
  mint: '#9DF7E5',
  mintDataviz: '#A5E9E4',
  orange: '#FE4F2D',
  teal: '#1D4961',
  midnight: '#1D4961',
  warmWhite: '#FFFFFE',
  white: '#FFFFFF',

  // --- GEM Secondary Palette (Nadieh Bremer) ---
  deepRed: '#7F142A',
  redLight: '#CA4A50',
  yellow: '#FFE366',
  mintGreen: '#95E6AF',
  green: '#51BF7E',
  midnightGreen: '#004F61',
  blue: '#099ED8',
  purple: '#A0AAE5',
  midnightPurple: '#061F5F',
  grey: '#BECCCF',

  // --- Neutrals ---
  black: '#1D4961',
  gray50: '#F2F2EB',
  gray100: '#ECEAE3',
  gray200: '#dce3e5',
  gray300: '#BECCCF',
  gray400: '#9EAAAD',
  gray500: '#6e8c91',
  gray600: '#4c6267',
  gray700: '#3a4d51',
  gray800: '#1C1F23',
  gray900: '#1D4961',

  // --- Semantic UI ---
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F2F2EB',
  bgTertiary: '#ECEAE3',

  textPrimary: '#1D4961',
  textSecondary: '#4c6267',
  textTertiary: '#9EAAAD',

  border: '#dce3e5',
  borderDark: '#1D4961',
  borderLight: '#ECEAE3',

  // --- Feedback ---
  success: '#51BF7E',
  successLight: '#95E6AF',
  warning: '#FE4F2D',
  warningLight: '#FED3CA',
  error: '#7F142A',
  errorLight: '#f4b7b3',
  info: '#1D4961',
  infoLight: '#E9EEF1',
} as const;

// =============================================================================
// 2. TRACKER COLORS
// =============================================================================

export const trackerColors: Record<string, string> = {
  'Coal Plant': '#7F142A',
  'Coal Mine': '#7F142A',

  'Gas Plant': '#CA4A50',
  'Oil & Gas Plant': '#CA4A50',
  'Gas Pipeline': '#CA4A50',
  'Natural Gas Transmission Pipeline': '#CA4A50',
  'Oil & NGL Pipeline': '#CA4A50',
  'Oil or NGL Pipeline': '#CA4A50',
  'Oil Pipeline': '#CA4A50',

  'Cement and Concrete': '#6e8c91',
  'Cement or Concrete Plant': '#6e8c91',
  'Cement Plant': '#6e8c91',

  'Bioenergy Power': '#A0AAE5',
  'Bioenergy Plant': '#A0AAE5',

  Geothermal: '#004F61',

  'Iron Mine': '#004F61',
  'Iron Ore Mine': '#004F61',
  'Steel Plant': '#004F61',
  'Iron & Steel Plant': '#004F61',

  Solar: '#FFE366',
  Wind: '#51BF7E',
  Hydropower: '#099ED8',
  Nuclear: '#4A57A8',
};

export const trackerColorMap = new Map(Object.entries(trackerColors));

export const renewableTrackerColors: Record<string, string> = {
  Solar: '#FFE366',
  Wind: '#51BF7E',
  Hydropower: '#099ED8',
  Nuclear: '#4A57A8',
  Geothermal: '#004F61',
};

export const renewableTrackerColorMap = new Map(Object.entries(renewableTrackerColors));

// =============================================================================
// 3. STATUS COLORS
// =============================================================================

export const statusColors: Record<string, string> = {
  operating: '#7F142A',
  planned: '#CA4A50',
  retired: '#6e8c91',
  cancelled: '#dce3e5',
  unknown: '#BECCCF',
};

export const statusColorsGranular: Record<string, string> = {
  operating: '#7F142A',
  'operating pre-retirement': '#7F142A',

  planned: '#CA4A50',
  proposed: '#f4b7b3',
  announced: '#f4b7b3',
  'pre-permit': '#CA4A50',
  permitted: '#CA4A50',
  'pre-construction': '#CA4A50',
  construction: '#7F142A',

  retired: '#6e8c91',
  mothballed: '#6e8c91',
  idle: '#6e8c91',
  'mothballed pre-retirement': '#6e8c91',

  cancelled: '#dce3e5',
  shelved: '#BECCCF',
  'cancelled - inferred 4 y': '#dce3e5',
  'shelved - inferred 2 y': '#BECCCF',
};

const _findGroup = (id: string) =>
  (_SCHEMA_STATUS_GROUPS.find((g) => g.id === id)?.statuses ?? []) as readonly string[];

export const statusGroups = {
  operating: _findGroup('operating'),
  planned: [..._findGroup('planned'), 'planned'] as readonly string[],
  retired: _findGroup('retired'),
  cancelled: _findGroup('cancelled'),
} as const;

export const statusColorLegend = [
  { color: '#7F142A', label: 'Operating', statuses: statusGroups.operating },
  { color: '#CA4A50', label: 'Planned', statuses: statusGroups.planned },
  { color: '#6e8c91', label: 'Retired', statuses: statusGroups.retired },
  { color: '#dce3e5', label: 'Cancelled', statuses: statusGroups.cancelled },
];

export const prospectiveColorLegend = [
  { color: '#f4b7b3', label: 'Proposed/Announced', statuses: ['proposed', 'announced'] },
  {
    color: '#CA4A50',
    label: 'Pre-construction',
    statuses: ['pre-permit', 'permitted', 'pre-construction'],
  },
  { color: '#7F142A', label: 'Construction', statuses: ['construction'] },
];

// =============================================================================
// 4. MAP COLORS
// =============================================================================

export const mapColors = {
  coal: '#7F142A',
  coalMine: '#7F142A',
  gas: '#CA4A50',
  steel: '#004F61',
  iron: '#004F61',
  cement: '#6e8c91',
  bioenergy: '#A0AAE5',

  solar: '#FFE366',
  wind: '#51BF7E',
  hydro: '#099ED8',

  default: '#1D4961',
  selected: '#FE4F2D',
  unselected: '#BECCCF',
  stroke: '#FFFFFF',
} as const;

export const trackerToMapColor: Record<string, string> = {
  'Coal Plant': mapColors.coal,
  'Coal Mine': mapColors.coalMine,
  'Gas Plant': mapColors.gas,
  'Gas Pipeline': mapColors.gas,
  'Oil & NGL Pipeline': mapColors.gas,
  'Steel Plant': mapColors.steel,
  'Iron Mine': mapColors.iron,
  'Iron Ore Mine': mapColors.iron,
  'Cement and Concrete': mapColors.cement,
  'Bioenergy Power': mapColors.bioenergy,
  Solar: mapColors.solar,
  Wind: mapColors.wind,
  Hydropower: mapColors.hydro,
};

// =============================================================================
// 5. OWNERSHIP COLORS
// =============================================================================

export const ownershipColors = {
  direct: '#1D4961',
  indirect: '#1D4961',
  ultimate: '#1D4961',
  edge: '#BECCCF',
  edgeHighlight: '#FE4F2D',

  treeNavy: '#1D4961',
  treeTeal: '#004F61',
  treeMint: '#9DF7E5',
  treeWarmWhite: '#F2F2EB',
  treeNodeFill: '#BECCCF',
  treeEdge: '#A5E9E4',
  treeEdgeImputed: '#dce3e5',
  treeMidnight: '#1C1F23',

  entityGovernment: '#A0AAE5',
  entityGovernmentDark: '#061F5F',
  entityGovernmentLight: '#d0d5f2',
  entityPublicCorp: '#099ED8',
  entityPublicCorpDark: '#1D4961',
  entityPublicCorpLight: '#84cfec',
  entityPrivate: '#51BF7E',
  entityPrivateDark: '#1D4961',
  entityPrivateLight: '#95E6AF',
  entityOther: '#BECCCF',
  entityOtherDark: '#3a4d51',
  entityOtherLight: '#dce3e5',
} as const;

/**
 * Country color palette for ownership tree "color by country" mode.
 * Top 5 countries get distinct colors; additional countries use gray fallback.
 * Each triple: bg (circle fill), fg (pie arc, dark), light (hover highlight).
 * TODO: refine these with Nadieh — intentionally garish placeholders for now.
 */
export const countryPalette = [
  { bg: '#E8A87C', fg: '#8B3A0F', light: '#F5D4BC' }, // peach / burnt sienna
  { bg: '#85B8CB', fg: '#1B4F6B', light: '#C2DCE5' }, // steel blue / dark navy
  { bg: '#C4A6D6', fg: '#4A2170', light: '#E2D3EB' }, // lavender / deep purple
  { bg: '#8FC49E', fg: '#1F5C2E', light: '#C7E2CE' }, // sage / forest
  { bg: '#D4B483', fg: '#6B4C1D', light: '#EAD9C1' }, // sand / dark amber
] as const;

export const countryGray = { bg: '#BECCCF', fg: '#3a4d51', light: '#dce3e5' } as const;

// =============================================================================
// 6. LEGACY EXPORTS
// =============================================================================

export const colorByTracker = trackerColorMap;
export const colorByTrackerRenewable = renewableTrackerColorMap;
export const colorByStatus = new Map(Object.entries(statusColorsGranular));

export const statusColorsProspective = new Map([
  ['#f4b7b3', { descript: 'proposed/announced', statuses: ['proposed', 'announced'] }],
  [
    '#CA4A50',
    { descript: 'pre-construction', statuses: ['pre-permit', 'permitted', 'pre-construction'] },
  ],
  ['#7F142A', { descript: 'construction', statuses: ['construction'] }],
]);

export const colorByStatusProspective = new Map(
  Array.from(statusColorsProspective).flatMap(([color, { statuses }]) =>
    statuses.map((status) => [status, color])
  )
);

export const statusColorsMap = new Map([
  ['#7F142A', { descript: 'operating', statuses: statusGroups.operating }],
  ['#CA4A50', { descript: 'planned', statuses: statusGroups.planned }],
  ['#6e8c91', { descript: 'retired/mothballed/idle', statuses: statusGroups.retired }],
  ['#dce3e5', { descript: 'cancelled/shelved', statuses: statusGroups.cancelled }],
]);

export const colMaps = {
  byTracker: colorByTracker,
  byStatus: colorByStatus,
  byStatusProspective: colorByStatusProspective,
  statusLegend: statusColorsMap,
  statusProspectiveLegend: statusColorsProspective,
};

// =============================================================================
// 7. STATUS/TRACKER LISTS
// =============================================================================

export const fossilTrackers = [..._SCHEMA_FOSSIL_TRACKERS];
export const prospectiveStatuses: string[] = [..._SCHEMA_PROSPECTIVE_STATUSES];
