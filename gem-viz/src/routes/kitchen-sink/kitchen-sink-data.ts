/**
 * Kitchen Sink example data
 * Extracted from +page.svelte to reduce file size
 */

// Real tracker types from GEM
export const trackers = [
  'Coal Plant',
  'Gas Plant',
  'Steel Plant',
  'Coal Mine',
  'LNG',
  'Gas Pipeline',
  'Iron Mine',
  'Bioenergy Power',
];

export const statuses = [
  'operating',
  'proposed',
  'construction',
  'cancelled',
  'retired',
  'shelved',
];

// Real company examples
export const realCompanies = [
  {
    name: 'China Energy Investment Corporation',
    location: 'Beijing, China',
    assetCount: 847,
    totalCapacity: 187000,
    trackers: [
      { tracker: 'Coal Plant', count: 312, capacity: 142000 },
      { tracker: 'Coal Mine', count: 285, capacity: 23000 },
      { tracker: 'Gas Plant', count: 89, capacity: 12000 },
      { tracker: 'Steel Plant', count: 45, capacity: 8000 },
      { tracker: 'Bioenergy Power', count: 116, capacity: 2000 },
    ],
  },
  {
    name: 'NTPC Limited',
    location: 'New Delhi, India',
    assetCount: 234,
    totalCapacity: 72000,
    trackers: [
      { tracker: 'Coal Plant', count: 178, capacity: 58000 },
      { tracker: 'Gas Plant', count: 42, capacity: 12000 },
      { tracker: 'Bioenergy Power', count: 14, capacity: 2000 },
    ],
  },
  {
    name: 'Adani Power Limited',
    location: 'Ahmedabad, India',
    assetCount: 89,
    totalCapacity: 15000,
    trackers: [
      { tracker: 'Coal Plant', count: 67, capacity: 12500 },
      { tracker: 'Gas Plant', count: 22, capacity: 2500 },
    ],
  },
];

// Real asset examples
export const realAssets = [
  {
    id: 'G100000109409',
    name: 'Shenhua Ningxia Coal Power Station',
    tracker: 'Coal Plant',
    status: 'operating',
    country: 'China',
    capacity: 3200,
    owner: 'China Energy Investment Corporation',
  },
  {
    id: 'G100001234567',
    name: 'Sabine Pass LNG Terminal',
    tracker: 'LNG',
    status: 'operating',
    country: 'United States',
    capacity: 30000,
    owner: 'Cheniere Energy',
  },
  {
    id: 'G100002345678',
    name: 'Tata Steel Jamshedpur Works',
    tracker: 'Steel Plant',
    status: 'operating',
    country: 'India',
    capacity: 10000,
    owner: 'Tata Steel Limited',
  },
  {
    id: 'G100003456789',
    name: 'Carmichael Coal Mine',
    tracker: 'Coal Mine',
    status: 'construction',
    country: 'Australia',
    capacity: 60,
    owner: 'Adani Group',
  },
];

// Country breakdown - real data
export const countryData = [
  { label: 'China', value: 2847 },
  { label: 'India', value: 1234 },
  { label: 'United States', value: 892 },
  { label: 'Russia', value: 654 },
  { label: 'Indonesia', value: 543 },
  { label: 'Japan', value: 432 },
  { label: 'Germany', value: 321 },
  { label: 'South Africa', value: 287 },
  { label: 'Australia', value: 234 },
  { label: 'Poland', value: 198 },
];

// Capacity time series (MW added per year, roughly real)
export const capacityTimeSeries = [
  { x: 2015, y: 72000 },
  { x: 2016, y: 68000 },
  { x: 2017, y: 54000 },
  { x: 2018, y: 48000 },
  { x: 2019, y: 42000 },
  { x: 2020, y: 38000 },
  { x: 2021, y: 45000 },
  { x: 2022, y: 52000 },
  { x: 2023, y: 48000 },
  { x: 2024, y: 35000 },
];

// Capacity histogram data (plant sizes in MW)
export const capacityDistribution = [
  150, 200, 180, 350, 400, 500, 660, 660, 660, 800, 1000, 1000, 1000, 1200, 1320, 1320, 1320, 1500,
  2000, 2000, 2640, 3200, 4000, 5000, 6000, 8000, 200, 300, 400, 500, 660, 660, 800, 1000, 1000,
  1200, 1320, 1500, 1800,
];

// Sample filters for breadcrumbs
export const sampleFilters = {
  trackers: ['Coal Plant'],
  statuses: ['operating'],
  countries: ['China'],
  ownerCountries: [],
  owners: [],
  capacityMin: 1000,
  capacityMax: null,
  shareMin: null,
  shareMax: null,
  startYearMin: null,
  startYearMax: null,
  search: '',
};

// Sample asset classes for panel
export const sampleClassesParam = JSON.stringify([
  {
    id: 'coal-operating',
    name: 'Operating Coal Plants',
    tracker: 'Coal Plant',
    filters: { status: 'Operating' },
  },
  {
    id: 'lng-proposed',
    name: 'Proposed LNG Terminals',
    tracker: 'LNG',
    filters: { status: 'Proposed' },
  },
]);

// Range slider histogram
export const rangeHistogram = [12, 25, 45, 78, 92, 85, 67, 43, 28, 15, 8, 4, 2, 1];

// OwnershipTreeGraph demo data — three scenarios for label mode testing
// 1. Small/default: 6 nodes, 2 depth — all labels shown centered below
export const treeGraphSmall = {
  rootId: 'ASSET-1',
  nodes: [
    { id: 'ASSET-1', type: 'asset', Name: 'Shenhua Ningxia Coal' },
    { id: 'E001', type: 'entity', Name: 'China Energy', entity_id: 'E001', headquarters_country: 'China', entity_type: 'State-Owned Enterprise' },
    { id: 'E002', type: 'entity', Name: 'Guohua Power', entity_id: 'E002', headquarters_country: 'China', entity_type: 'Subsidiary' },
    { id: 'E003', type: 'entity', Name: 'State Council', entity_id: 'E003', headquarters_country: 'China', entity_type: 'Government' },
    { id: 'E004', type: 'entity', Name: 'NTPC Limited', entity_id: 'E004', headquarters_country: 'India', entity_type: 'State-Owned Enterprise' },
    { id: 'E005', type: 'entity', Name: 'Adani Power', entity_id: 'E005', headquarters_country: 'India', entity_type: 'Private Company' },
  ],
  edges: [
    { source: 'E001', target: 'ASSET-1', value: 51 },
    { source: 'E002', target: 'ASSET-1', value: 20 },
    { source: 'E004', target: 'ASSET-1', value: 15 },
    { source: 'E005', target: 'ASSET-1', value: 14 },
    { source: 'E003', target: 'E001', value: 100 },
  ],
  paths: {
    'E001': [{ route: ['E001', 'ASSET-1'], cumulative_pct: 51 }],
    'E002': [{ route: ['E002', 'ASSET-1'], cumulative_pct: 20 }],
    'E003': [{ route: ['E003', 'E001', 'ASSET-1'], cumulative_pct: 51 }],
    'E004': [{ route: ['E004', 'ASSET-1'], cumulative_pct: 15 }],
    'E005': [{ route: ['E005', 'ASSET-1'], cumulative_pct: 14 }],
  },
};

// 2. Deep-narrow: 12 nodes, 7 depth — labels shift right
export const treeGraphDeep = {
  rootId: 'ASSET-D',
  nodes: [
    { id: 'ASSET-D', type: 'asset', Name: 'Tata Steel Jamshedpur' },
    { id: 'D01', type: 'entity', Name: 'Tata Steel Ltd', entity_id: 'D01', headquarters_country: 'India', entity_type: 'Public Company' },
    { id: 'D02', type: 'entity', Name: 'Tata Sons Pvt', entity_id: 'D02', headquarters_country: 'India', entity_type: 'Private Company' },
    { id: 'D03', type: 'entity', Name: 'Tata Trusts', entity_id: 'D03', headquarters_country: 'India', entity_type: 'Foundation' },
    { id: 'D04', type: 'entity', Name: 'Sir Dorabji Trust', entity_id: 'D04', headquarters_country: 'India', entity_type: 'Foundation' },
    { id: 'D05', type: 'entity', Name: 'Sir Ratan Trust', entity_id: 'D05', headquarters_country: 'India', entity_type: 'Foundation' },
    { id: 'D06', type: 'entity', Name: 'JN Tata Trust', entity_id: 'D06', headquarters_country: 'India', entity_type: 'Foundation' },
    { id: 'D07', type: 'entity', Name: 'Navajbai Trust', entity_id: 'D07', headquarters_country: 'India', entity_type: 'Foundation' },
    { id: 'D08', type: 'entity', Name: 'LIC of India', entity_id: 'D08', headquarters_country: 'India', entity_type: 'State-Owned Enterprise' },
    { id: 'D09', type: 'entity', Name: 'Govt of India', entity_id: 'D09', headquarters_country: 'India', entity_type: 'Government' },
    { id: 'D10', type: 'entity', Name: 'SBI Mutual Fund', entity_id: 'D10', headquarters_country: 'India', entity_type: 'Fund' },
    { id: 'D11', type: 'entity', Name: 'State Bank India', entity_id: 'D11', headquarters_country: 'India', entity_type: 'State-Owned Enterprise' },
  ],
  edges: [
    { source: 'D01', target: 'ASSET-D', value: 100 },
    { source: 'D02', target: 'D01', value: 33 },
    { source: 'D03', target: 'D02', value: 66 },
    { source: 'D04', target: 'D03', value: 30 },
    { source: 'D05', target: 'D03', value: 25 },
    { source: 'D06', target: 'D03', value: 25 },
    { source: 'D07', target: 'D03', value: 20 },
    { source: 'D08', target: 'D01', value: 12 },
    { source: 'D09', target: 'D08', value: 100 },
    { source: 'D10', target: 'D01', value: 8 },
    { source: 'D11', target: 'D10', value: 63 },
    { source: 'D09', target: 'D11', value: 57 },
  ],
  paths: {
    'D01': [{ route: ['D01', 'ASSET-D'], cumulative_pct: 100 }],
    'D02': [{ route: ['D02', 'D01', 'ASSET-D'], cumulative_pct: 33 }],
    'D03': [{ route: ['D03', 'D02', 'D01', 'ASSET-D'], cumulative_pct: 21.8 }],
    'D04': [{ route: ['D04', 'D03', 'D02', 'D01', 'ASSET-D'], cumulative_pct: 6.5 }],
    'D05': [{ route: ['D05', 'D03', 'D02', 'D01', 'ASSET-D'], cumulative_pct: 5.4 }],
    'D06': [{ route: ['D06', 'D03', 'D02', 'D01', 'ASSET-D'], cumulative_pct: 5.4 }],
    'D07': [{ route: ['D07', 'D03', 'D02', 'D01', 'ASSET-D'], cumulative_pct: 4.4 }],
    'D08': [{ route: ['D08', 'D01', 'ASSET-D'], cumulative_pct: 12 }],
    'D09': [
      { route: ['D09', 'D08', 'D01', 'ASSET-D'], cumulative_pct: 12 },
      { route: ['D09', 'D11', 'D10', 'D01', 'ASSET-D'], cumulative_pct: 2.9 },
    ],
    'D10': [{ route: ['D10', 'D01', 'ASSET-D'], cumulative_pct: 8 }],
    'D11': [{ route: ['D11', 'D10', 'D01', 'ASSET-D'], cumulative_pct: 5 }],
  },
};

// 3. Large: 30 nodes — labels hidden except high-pct & hovered
export const treeGraphLarge = (() => {
  const rootId = 'ASSET-L';
  const nodes = [
    { id: rootId, type: 'asset', Name: 'Medupi Coal Power Station' },
  ];
  const edges = [];
  const paths: Record<string, Array<{ route: string[]; cumulative_pct: number }>> = {};
  const entityTypes = ['State-Owned Enterprise', 'Public Company', 'Private Company', 'Fund', 'Government', 'Subsidiary'];
  const countries = ['South Africa', 'United States', 'United Kingdom', 'China', 'France', 'Germany', 'Japan'];
  const names = [
    'Eskom Holdings', 'Govt of South Africa', 'BlackRock Inc', 'Vanguard Group', 'State Street Corp',
    'Fidelity Investments', 'JP Morgan Chase', 'Goldman Sachs', 'Morgan Stanley', 'HSBC Holdings',
    'Barclays PLC', 'Deutsche Bank', 'BNP Paribas', 'Credit Suisse', 'UBS Group',
    'Citigroup Inc', 'Bank of America', 'Royal Bank Canada', 'Toronto-Dominion', 'Mitsubishi UFJ',
    'Sumitomo Mitsui', 'Mizuho Financial', 'Industrial & Commercial Bank China', 'China Construction Bank',
    'Agricultural Bank China', 'Bank of China', 'Standard Chartered', 'Investec Group', 'Old Mutual',
  ];

  // First entity is direct 100% owner
  nodes.push({
    id: 'L01', type: 'entity', Name: names[0],
    entity_id: 'L01', headquarters_country: countries[0], entity_type: entityTypes[0],
  } as any);
  edges.push({ source: 'L01', target: rootId, value: 100 });
  paths['L01'] = [{ route: ['L01', rootId], cumulative_pct: 100 }];

  // Second entity owns first
  nodes.push({
    id: 'L02', type: 'entity', Name: names[1],
    entity_id: 'L02', headquarters_country: countries[0], entity_type: entityTypes[4],
  } as any);
  edges.push({ source: 'L02', target: 'L01', value: 100 });
  paths['L02'] = [{ route: ['L02', 'L01', rootId], cumulative_pct: 100 }];

  // Remaining 27 entities spread across L01 as minority shareholders
  for (let i = 3; i <= 29; i++) {
    const id = `L${String(i).padStart(2, '0')}`;
    const pct = Math.max(1, Math.round(40 / (i - 2)));
    nodes.push({
      id, type: 'entity', Name: names[i - 1] || `Entity ${i}`,
      entity_id: id,
      headquarters_country: countries[i % countries.length],
      entity_type: entityTypes[i % entityTypes.length],
    } as any);
    edges.push({ source: id, target: 'L01', value: pct });
    paths[id] = [{ route: [id, 'L01', rootId], cumulative_pct: pct }];
  }

  return { rootId, nodes, edges, paths };
})();

// ProjectCard synthetic asset data
export const sampleProjectAssets = [
  {
    id: 'G100000109409',
    name: 'Shenhua Ningxia Coal Power Station',
    status: 'operating',
    capacity: 3200,
    capacityUnit: 'MW',
    country: 'China',
    state: 'Ningxia',
    owner: 'China Energy Investment Corporation',
    ownershipShare: 0.51,
    startYear: 2011,
    plantAge: 15,
    annualCO2: 18.2,
    technology: 'Subcritical',
    tracker: 'Coal Plant',
    lat: 38.47,
    lon: 106.27,
  },
  {
    id: 'G100001234567',
    name: 'Sabine Pass LNG Terminal',
    status: 'operating',
    capacity: 30000,
    capacityUnit: 'ktpa',
    country: 'United States',
    state: 'Louisiana',
    owner: 'Cheniere Energy',
    ownershipShare: 1.0,
    startYear: 2016,
    tracker: 'LNG',
    lat: 29.77,
    lon: -93.85,
  },
];

// AssetRingVisualization data
export const sampleRingAssets = [
  { id: 'U1', name: 'Unit 1', status: 'operating', tracker: 'Coal Plant', capacityMw: 660, share: 0.51 },
  { id: 'U2', name: 'Unit 2', status: 'operating', tracker: 'Coal Plant', capacityMw: 660, share: 0.51 },
  { id: 'U3', name: 'Unit 3', status: 'construction', tracker: 'Coal Plant', capacityMw: 1000, share: 0.51 },
  { id: 'U4', name: 'Unit 4', status: 'proposed', tracker: 'Coal Plant', capacityMw: 1000, share: 0.33 },
  { id: 'U5', name: 'Unit 5', status: 'retired', tracker: 'Coal Plant', capacityMw: 300, share: 1.0 },
  { id: 'U6', name: 'Unit 6', status: 'operating', tracker: 'Coal Plant', capacityMw: 660, share: 0.75 },
];

// DataTable sample data
export const tableColumns = [
  { key: 'name', label: 'Asset Name', sortable: true, filterable: true },
  { key: 'tracker', label: 'Tracker', sortable: true, filterable: true },
  { key: 'status', label: 'Status', sortable: true, filterable: true },
  { key: 'country', label: 'Country', sortable: true, filterable: true },
  { key: 'capacity', label: 'Capacity (MW)', sortable: true, type: 'number' as const },
  { key: 'owner', label: 'Owner', sortable: true, filterable: true },
];

export const tableData = [
  { name: 'Shenhua Ningxia', tracker: 'Coal Plant', status: 'Operating', country: 'China', capacity: 3200, owner: 'China Energy' },
  { name: 'Sabine Pass LNG', tracker: 'LNG', status: 'Operating', country: 'United States', capacity: 30000, owner: 'Cheniere Energy' },
  { name: 'Tata Steel Jamshedpur', tracker: 'Steel Plant', status: 'Operating', country: 'India', capacity: 10000, owner: 'Tata Steel' },
  { name: 'Carmichael Mine', tracker: 'Coal Mine', status: 'Construction', country: 'Australia', capacity: 60, owner: 'Adani Group' },
  { name: 'Medupi Power Station', tracker: 'Coal Plant', status: 'Operating', country: 'South Africa', capacity: 4764, owner: 'Eskom' },
  { name: 'Kudgi Super Thermal', tracker: 'Coal Plant', status: 'Operating', country: 'India', capacity: 2400, owner: 'NTPC Limited' },
  { name: 'Neurath Power Station', tracker: 'Coal Plant', status: 'Operating', country: 'Germany', capacity: 4400, owner: 'RWE' },
  { name: 'Taichung Power Plant', tracker: 'Coal Plant', status: 'Operating', country: 'Taiwan', capacity: 5780, owner: 'Taipower' },
  { name: 'Belchatow Power Station', tracker: 'Coal Plant', status: 'Operating', country: 'Poland', capacity: 5298, owner: 'PGE' },
  { name: 'Mundra UMPP', tracker: 'Coal Plant', status: 'Operating', country: 'India', capacity: 4000, owner: 'Tata Power' },
];

// ReportLoadingTerminal steps
export const sampleReportSteps = [
  { id: 'cart', label: 'Loading investigation cart', status: 'done' as const, rows: 3, ms: 120 },
  { id: 'entities', label: 'Fetching entity details', status: 'done' as const, rows: 12, ms: 450 },
  { id: 'assets', label: 'Resolving owned assets', status: 'done' as const, rows: 847, ms: 2340 },
  { id: 'graph', label: 'Building ownership graph', status: 'running' as const },
  { id: 'stats', label: 'Aggregating statistics', status: 'pending' as const },
  { id: 'export', label: 'Preparing export data', status: 'pending' as const },
];

// Country list for CountryMultiSelect
export const sampleCountries = [
  'Argentina', 'Australia', 'Brazil', 'Canada', 'China', 'France', 'Germany',
  'India', 'Indonesia', 'Italy', 'Japan', 'Mexico', 'Poland', 'Russia',
  'Saudi Arabia', 'South Africa', 'South Korea', 'Turkey', 'United Kingdom', 'United States',
] as const;

// Component registry with file paths (comprehensive — 69 components across 15 directories)
export const componentIndex = [
  // Primitives & feedback
  { name: 'StatusIcon', path: 'src/lib/components/tracker/StatusIcon.svelte', category: 'primitives' },
  { name: 'TrackerIcon', path: 'src/lib/components/tracker/TrackerIcon.svelte', category: 'primitives' },
  { name: 'Skeleton', path: 'src/lib/components/feedback/Skeleton.svelte', category: 'primitives' },
  { name: 'Spinner', path: 'src/lib/components/feedback/Spinner.svelte', category: 'primitives' },
  // Badges & attribution
  { name: 'DataSourceBadge', path: 'src/lib/components/data/DataSourceBadge.svelte', category: 'badges' },
  { name: 'Citation', path: 'src/lib/components/data/Citation.svelte', category: 'badges' },
  // Cards
  { name: 'EntityMicroCard', path: 'src/lib/components/cards/EntityMicroCard.svelte', category: 'cards' },
  { name: 'AssetMicroCard', path: 'src/lib/components/cards/AssetMicroCard.svelte', category: 'cards' },
  { name: 'ProjectCard', path: 'src/lib/components/cards/ProjectCard.svelte', category: 'cards' },
  { name: 'ProjectCardList', path: 'src/lib/components/cards/ProjectCardList.svelte', category: 'cards' },
  // Charts
  { name: 'MiniFlower', path: 'src/lib/components/charts/MiniFlower.svelte', category: 'charts' },
  { name: 'OwnershipPie', path: 'src/lib/components/charts/OwnershipPie.svelte', category: 'charts' },
  { name: 'Sparkline', path: 'src/lib/components/charts/Sparkline.svelte', category: 'charts' },
  { name: 'MiniBarChart', path: 'src/lib/components/charts/MiniBarChart.svelte', category: 'charts' },
  { name: 'MiniHistogram', path: 'src/lib/components/charts/MiniHistogram.svelte', category: 'charts' },
  { name: 'RadialBarChart', path: 'src/lib/components/charts/RadialBarChart.svelte', category: 'charts' },
  // Ownership visualizations
  { name: 'OwnershipTreeGraph', path: 'src/lib/components/ownership/OwnershipTreeGraph.svelte', category: 'ownership' },
  { name: 'AssetRingVisualization', path: 'src/lib/components/ownership/AssetRingVisualization.svelte', category: 'ownership' },
  { name: 'OwnershipMiniTree', path: 'src/lib/components/ownership/OwnershipMiniTree.svelte', category: 'ownership' },
  { name: 'AssetOwnershipTree', path: 'src/lib/components/ownership/AssetOwnershipTree.svelte', category: 'ownership' },
  { name: 'IntermediaryMiniGraph', path: 'src/lib/components/ownership/IntermediaryMiniGraph.svelte', category: 'ownership' },
  { name: 'EntityPortfolioHeader', path: 'src/lib/components/ownership/EntityPortfolioHeader.svelte', category: 'ownership' },
  { name: 'EntityPortfolioFilters', path: 'src/lib/components/ownership/EntityPortfolioFilters.svelte', category: 'ownership' },
  { name: 'OwnershipSummaryTables', path: 'src/lib/components/ownership/OwnershipSummaryTables.svelte', category: 'ownership' },
  // Network
  { name: 'OwnershipFlower', path: 'src/lib/components/network/OwnershipFlower.svelte', category: 'network' },
  { name: 'MiniNetworkGraph', path: 'src/lib/components/network/MiniNetworkGraph.svelte', category: 'network' },
  // Tables & filters
  { name: 'DataTable', path: 'src/lib/components/table/DataTable.svelte', category: 'tables' },
  { name: 'FacetedFilter', path: 'src/lib/components/table/FacetedFilter.svelte', category: 'tables' },
  { name: 'FilterBreadcrumbs', path: 'src/lib/components/table/FilterBreadcrumbs.svelte', category: 'tables' },
  { name: 'RangeSlider', path: 'src/lib/components/table/RangeSlider.svelte', category: 'inputs' },
  // Search & inputs
  { name: 'AssetSearchBar', path: 'src/lib/components/search/AssetSearchBar.svelte', category: 'inputs' },
  { name: 'CountryMultiSelect', path: 'src/lib/components/screener/CountryMultiSelect.svelte', category: 'inputs' },
  { name: 'CommandPalette', path: 'src/lib/components/search/CommandPalette.svelte', category: 'inputs' },
  // Navigation & layout
  { name: 'SiteNav', path: 'src/lib/components/nav/SiteNav.svelte', category: 'layout' },
  { name: 'SiteFooter', path: 'src/lib/components/nav/SiteFooter.svelte', category: 'layout' },
  { name: 'PageHeader', path: 'src/lib/components/nav/PageHeader.svelte', category: 'layout' },
  { name: 'SectionHeader', path: 'src/lib/components/nav/SectionHeader.svelte', category: 'layout' },
  { name: 'EmbedShell', path: 'src/lib/components/nav/EmbedShell.svelte', category: 'layout' },
  { name: 'ScreenerLayout', path: 'src/lib/components/nav/ScreenerLayout.svelte', category: 'layout' },
  { name: 'ScreenerStepNav', path: 'src/lib/components/nav/ScreenerStepNav.svelte', category: 'layout' },
  { name: 'AssetClassesPanel', path: 'src/lib/components/tracker/AssetClassesPanel.svelte', category: 'layout' },
  // States & feedback
  { name: 'LoadingWrapper', path: 'src/lib/components/feedback/LoadingWrapper.svelte', category: 'states' },
  { name: 'ReportLoadingTerminal', path: 'src/lib/components/feedback/ReportLoadingTerminal.svelte', category: 'states' },
  { name: 'DebugPanel', path: 'src/lib/components/feedback/DebugPanel.svelte', category: 'states' },
  // Buttons
  { name: 'AddToCartButton', path: 'src/lib/components/cart/AddToCartButton.svelte', category: 'buttons' },
  // Debug
  { name: 'ApiCallLog', path: 'src/lib/components/data/ApiCallLog.svelte', category: 'debug' },
  // Map
  { name: 'AssetMap', path: 'src/lib/components/map/AssetMap.svelte', category: 'map' },
  { name: 'EntityMap', path: 'src/lib/components/map/EntityMap.svelte', category: 'map' },
  { name: 'InvestigationMap', path: 'src/lib/components/map/InvestigationMap.svelte', category: 'map' },
  { name: 'ProjectCardMap', path: 'src/lib/components/map/ProjectCardMap.svelte', category: 'map' },
  // Tracker
  { name: 'UltimateOwners', path: 'src/lib/components/tracker/UltimateOwners.svelte', category: 'tracker' },
  { name: 'TrackerFactsheet', path: 'src/lib/components/tracker/TrackerFactsheet.svelte', category: 'tracker' },
  { name: 'TrackerGlobeGrid', path: 'src/lib/components/tracker/TrackerGlobeGrid.svelte', category: 'tracker' },
  { name: 'AssetClassExpansion', path: 'src/lib/components/tracker/AssetClassExpansion.svelte', category: 'tracker' },
  // Screener (page-level)
  { name: 'AssetScreener', path: 'src/lib/components/screener/AssetScreener.svelte', category: 'screener' },
  { name: 'AssetScreenerChart', path: 'src/lib/components/screener/AssetScreenerChart.svelte', category: 'screener' },
  { name: 'OwnerSearchPanel', path: 'src/lib/components/screener/OwnerSearchPanel.svelte', category: 'screener' },
  { name: 'OwnerResultsGroups', path: 'src/lib/components/screener/OwnerResultsGroups.svelte', category: 'screener' },
  { name: 'ScreenerOwnersResultsTable', path: 'src/lib/components/screener/ScreenerOwnersResultsTable.svelte', category: 'screener' },
  { name: 'SelectedOwnersFooter', path: 'src/lib/components/screener/SelectedOwnersFooter.svelte', category: 'screener' },
  { name: 'ScreenerExportPanel', path: 'src/lib/components/screener/ScreenerExportPanel.svelte', category: 'screener' },
  { name: 'GeoFenceInput', path: 'src/lib/components/screener/GeoFenceInput.svelte', category: 'screener' },
  // Compose (page-level)
  { name: 'ComposeFilterPanel', path: 'src/lib/components/compose/ComposeFilterPanel.svelte', category: 'compose' },
  { name: 'ComposeResultsHeader', path: 'src/lib/components/compose/ComposeResultsHeader.svelte', category: 'compose' },
  { name: 'ComposeVizDashboard', path: 'src/lib/components/compose/ComposeVizDashboard.svelte', category: 'compose' },
  { name: 'ComposeTableState', path: 'src/lib/components/compose/ComposeTableState.svelte', category: 'compose' },
  { name: 'ComposeAssetTooltip', path: 'src/lib/components/compose/ComposeAssetTooltip.svelte', category: 'compose' },
];
