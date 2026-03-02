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

// Component registry with file paths
export const componentIndex = [
  { name: 'StatusIcon', path: 'src/lib/components/StatusIcon.svelte', category: 'primitives' },
  { name: 'TrackerIcon', path: 'src/lib/components/TrackerIcon.svelte', category: 'primitives' },
  { name: 'Skeleton', path: 'src/lib/components/Skeleton.svelte', category: 'primitives' },
  {
    name: 'DataSourceBadge',
    path: 'src/lib/components/DataSourceBadge.svelte',
    category: 'badges',
  },
  { name: 'Citation', path: 'src/lib/components/Citation.svelte', category: 'badges' },
  { name: 'EntityMicroCard', path: 'src/lib/components/EntityMicroCard.svelte', category: 'cards' },
  { name: 'AssetMicroCard', path: 'src/lib/components/AssetMicroCard.svelte', category: 'cards' },
  { name: 'MiniFlower', path: 'src/lib/components/MiniFlower.svelte', category: 'charts' },
  { name: 'Sparkline', path: 'src/lib/components/Sparkline.svelte', category: 'charts' },
  { name: 'MiniBarChart', path: 'src/lib/components/MiniBarChart.svelte', category: 'charts' },
  { name: 'MiniHistogram', path: 'src/lib/components/MiniHistogram.svelte', category: 'charts' },
  { name: 'OwnershipPie', path: 'src/lib/components/OwnershipPie.svelte', category: 'charts' },
  { name: 'ScreenerStepNav', path: 'src/lib/components/ScreenerStepNav.svelte', category: 'nav' },
  {
    name: 'FilterBreadcrumbs',
    path: 'src/lib/components/FilterBreadcrumbs.svelte',
    category: 'nav',
  },
  {
    name: 'AssetClassesPanel',
    path: 'src/lib/components/AssetClassesPanel.svelte',
    category: 'nav',
  },
  { name: 'RangeSlider', path: 'src/lib/components/RangeSlider.svelte', category: 'inputs' },
  {
    name: 'AddToCartButton',
    path: 'src/lib/components/AddToCartButton.svelte',
    category: 'buttons',
  },
  { name: 'LoadingWrapper', path: 'src/lib/components/LoadingWrapper.svelte', category: 'states' },
  { name: 'ScreenerLayout', path: 'src/lib/components/ScreenerLayout.svelte', category: 'layouts' },
];
