/**
 * Filter State Management
 *
 * Handles encoding/decoding filter state to/from URL parameters.
 * Enables shareable, bookmarkable filtered views.
 *
 * URL Format:
 *   ?trackers=Coal+Plant,Gas+Plant
 *   &statuses=operating,proposed
 *   &countries=China,United+States
 *   &capacityMin=100
 *   &capacityMax=10000
 *   &logic=AND
 *
 * @example
 * import { encodeFilters, decodeFilters, updateUrlWithFilters } from '$lib/filter-state';
 *
 * // Encode filters to URL
 * const url = encodeFilters({
 *   trackers: ['Coal Plant', 'Gas Plant'],
 *   statuses: ['operating'],
 *   capacityMin: 100,
 * });
 *
 * // Decode from URL
 * const filters = decodeFilters(window.location.search);
 */

import { base } from '$app/paths';

/**
 * @typedef {Object} FilterState
 * @property {string[]} trackers - Selected tracker types (OR)
 * @property {string[]} trackersAnd - Selected tracker types (AND)
 * @property {string[]} statuses - Selected statuses (OR)
 * @property {string[]} statusesAnd - Selected statuses (AND)
 * @property {string[]} countries - Selected countries (OR)
 * @property {string[]} countriesAnd - Selected countries (AND)
 * @property {string[]} ownerCountries - Selected owner headquarters countries (OR)
 * @property {string[]} ownerCountriesAnd - Selected owner headquarters countries (AND)
 * @property {string[]} owners - Selected owner names (OR)
 * @property {string[]} ownersAnd - Selected owner names (AND) - requires all owners
 * @property {number|null} capacityMin - Minimum capacity (MW)
 * @property {number|null} capacityMax - Maximum capacity (MW)
 * @property {number|null} shareMin - Minimum ownership share (%)
 * @property {number|null} shareMax - Maximum ownership share (%)
 * @property {number|null} startYearMin - Minimum start year
 * @property {number|null} startYearMax - Maximum start year
 * @property {string} logic - Filter logic: 'AND' or 'OR'
 * @property {string} search - Free text search
 */

/**
 * Default empty filter state
 * @returns {FilterState}
 */
export function emptyFilterState() {
  return {
    trackers: [],
    trackersAnd: [],
    statuses: [],
    statusesAnd: [],
    countries: [],
    countriesAnd: [],
    ownerCountries: [],
    ownerCountriesAnd: [],
    owners: [],
    ownersAnd: [],
    capacityMin: null,
    capacityMax: null,
    shareMin: null,
    shareMax: null,
    startYearMin: null,
    startYearMax: null,
    logic: 'AND',
    search: '',
  };
}

/**
 * Encode filter state to URL search params
 * @param {FilterState} filters
 * @returns {string} URL search string (without leading ?)
 */
export function encodeFilters(filters) {
  const params = new URLSearchParams();

  // Encode array values with URI encoding to handle commas in values
  const encodeArray = (arr) => arr.map((v) => encodeURIComponent(v)).join(',');

  if (filters.trackers?.length) {
    params.set('trackers', encodeArray(filters.trackers));
  }
  if (filters.trackersAnd?.length) {
    params.set('trackersAnd', encodeArray(filters.trackersAnd));
  }
  if (filters.statuses?.length) {
    params.set('statuses', encodeArray(filters.statuses));
  }
  if (filters.statusesAnd?.length) {
    params.set('statusesAnd', encodeArray(filters.statusesAnd));
  }
  if (filters.countries?.length) {
    params.set('countries', encodeArray(filters.countries));
  }
  if (filters.countriesAnd?.length) {
    params.set('countriesAnd', encodeArray(filters.countriesAnd));
  }
  if (filters.ownerCountries?.length) {
    params.set('ownerCountries', encodeArray(filters.ownerCountries));
  }
  if (filters.ownerCountriesAnd?.length) {
    params.set('ownerCountriesAnd', encodeArray(filters.ownerCountriesAnd));
  }
  if (filters.owners?.length) {
    params.set('owners', encodeArray(filters.owners));
  }
  if (filters.ownersAnd?.length) {
    params.set('ownersAnd', encodeArray(filters.ownersAnd));
  }
  if (filters.capacityMin != null) {
    params.set('capacityMin', String(filters.capacityMin));
  }
  if (filters.capacityMax != null) {
    params.set('capacityMax', String(filters.capacityMax));
  }
  if (filters.shareMin != null) {
    params.set('shareMin', String(filters.shareMin));
  }
  if (filters.shareMax != null) {
    params.set('shareMax', String(filters.shareMax));
  }
  if (filters.startYearMin != null) {
    params.set('startYearMin', String(filters.startYearMin));
  }
  if (filters.startYearMax != null) {
    params.set('startYearMax', String(filters.startYearMax));
  }
  if (filters.logic && filters.logic !== 'AND') {
    params.set('logic', filters.logic);
  }
  if (filters.search) {
    params.set('search', filters.search);
  }

  return params.toString();
}

/**
 * Decode filter state from URL search params
 * @param {string|URLSearchParams} searchParams - URL search string or URLSearchParams
 * @returns {FilterState}
 */
export function decodeFilters(searchParams) {
  const params =
    typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams;

  const filters = emptyFilterState();

  // Decode array values with URI decoding to handle commas in values
  const decodeArray = (str) =>
    str
      .split(',')
      .map((v) => {
        try {
          return decodeURIComponent(v);
        } catch {
          return v; // Return as-is if decoding fails
        }
      })
      .filter(Boolean);

  const trackers = params.get('trackers');
  if (trackers) {
    filters.trackers = decodeArray(trackers);
  }
  const trackersAnd = params.get('trackersAnd');
  if (trackersAnd) {
    filters.trackersAnd = decodeArray(trackersAnd);
  }

  const statuses = params.get('statuses');
  if (statuses) {
    filters.statuses = decodeArray(statuses);
  }
  const statusesAnd = params.get('statusesAnd');
  if (statusesAnd) {
    filters.statusesAnd = decodeArray(statusesAnd);
  }

  const countries = params.get('countries');
  if (countries) {
    filters.countries = decodeArray(countries);
  }
  const countriesAnd = params.get('countriesAnd');
  if (countriesAnd) {
    filters.countriesAnd = decodeArray(countriesAnd);
  }

  const ownerCountries = params.get('ownerCountries');
  if (ownerCountries) {
    filters.ownerCountries = decodeArray(ownerCountries);
  }
  const ownerCountriesAnd = params.get('ownerCountriesAnd');
  if (ownerCountriesAnd) {
    filters.ownerCountriesAnd = decodeArray(ownerCountriesAnd);
  }

  const owners = params.get('owners');
  if (owners) {
    filters.owners = decodeArray(owners);
  }
  const ownersAnd = params.get('ownersAnd');
  if (ownersAnd) {
    filters.ownersAnd = decodeArray(ownersAnd);
  }

  // Helper to parse numbers safely (returns null if invalid/NaN)
  const parseNum = (val) => {
    if (!val) return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  filters.capacityMin = parseNum(params.get('capacityMin'));
  filters.capacityMax = parseNum(params.get('capacityMax'));
  filters.shareMin = parseNum(params.get('shareMin'));
  filters.shareMax = parseNum(params.get('shareMax'));
  filters.startYearMin = parseNum(params.get('startYearMin'));
  filters.startYearMax = parseNum(params.get('startYearMax'));

  const logic = params.get('logic');
  if (logic === 'OR') {
    filters.logic = 'OR';
  }

  const search = params.get('search');
  if (search) {
    filters.search = search;
  }

  return filters;
}

/**
 * Build a shareable URL with filters
 * @param {FilterState} filters
 * @param {string} baseUrl - Base URL (default: compose page with base path)
 * @returns {string} Full URL with filter params
 */
export function buildShareUrl(filters, baseUrl = '') {
  const defaultUrl = `${base}/compose`;
  const encoded = encodeFilters(filters);
  if (!encoded) return baseUrl || defaultUrl;
  return `${baseUrl || defaultUrl}?${encoded}`;
}

/**
 * Check if filter state has any active filters
 * @param {FilterState} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters) {
  return (
    filters.trackers?.length > 0 ||
    filters.trackersAnd?.length > 0 ||
    filters.statuses?.length > 0 ||
    filters.statusesAnd?.length > 0 ||
    filters.countries?.length > 0 ||
    filters.countriesAnd?.length > 0 ||
    filters.ownerCountries?.length > 0 ||
    filters.ownerCountriesAnd?.length > 0 ||
    filters.owners?.length > 0 ||
    filters.ownersAnd?.length > 0 ||
    filters.capacityMin != null ||
    filters.capacityMax != null ||
    filters.shareMin != null ||
    filters.shareMax != null ||
    filters.startYearMin != null ||
    filters.startYearMax != null ||
    filters.search?.length > 0
  );
}

/**
 * Count active filter dimensions
 * @param {FilterState} filters
 * @returns {number}
 */
export function countActiveFilters(filters) {
  let count = 0;
  if (filters.trackers?.length > 0 || filters.trackersAnd?.length > 0) count++;
  if (filters.statuses?.length > 0 || filters.statusesAnd?.length > 0) count++;
  if (filters.countries?.length > 0 || filters.countriesAnd?.length > 0) count++;
  if (filters.ownerCountries?.length > 0 || filters.ownerCountriesAnd?.length > 0) count++;
  if (filters.owners?.length > 0 || filters.ownersAnd?.length > 0) count++;
  if (filters.capacityMin != null || filters.capacityMax != null) count++;
  if (filters.shareMin != null || filters.shareMax != null) count++;
  if (filters.startYearMin != null || filters.startYearMax != null) count++;
  if (filters.search?.length > 0) count++;
  return count;
}

// ============================================================================
// Saved Presets (localStorage)
// ============================================================================

const PRESETS_KEY = 'gem-filter-presets';

/**
 * @typedef {Object} FilterPreset
 * @property {string} id - Unique ID
 * @property {string} name - User-given name
 * @property {FilterState} filters - The filter state
 * @property {number} createdAt - Unix timestamp
 */

/**
 * Get all saved presets
 * @returns {FilterPreset[]}
 */
export function getPresets() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const json = localStorage.getItem(PRESETS_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new preset
 * @param {string} name
 * @param {FilterState} filters
 * @returns {FilterPreset}
 */
export function savePreset(name, filters) {
  const presets = getPresets();
  const preset = {
    id: `preset-${Date.now()}`,
    name,
    filters,
    createdAt: Date.now(),
  };
  presets.push(preset);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return preset;
}

/**
 * Add or replace a preset by ID.
 * @param {FilterPreset} preset
 * @returns {FilterPreset}
 */
export function upsertPreset(preset) {
  if (typeof localStorage === 'undefined') return preset;
  const presets = getPresets();
  const idx = presets.findIndex((p) => p.id === preset.id);
  if (idx >= 0) {
    presets[idx] = preset;
  } else {
    presets.push(preset);
  }
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  return preset;
}

/**
 * Delete a preset by ID
 * @param {string} id
 */
export function deletePreset(id) {
  const presets = getPresets().filter((p) => p.id !== id);
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

/**
 * Clear all presets
 */
export function clearPresets() {
  localStorage.removeItem(PRESETS_KEY);
}

// ============================================================================
// ASSET CLASSES
// User-created asset classes stored in localStorage
// ============================================================================

const ASSET_CLASSES_KEY = 'gem-viz-asset-classes';

/**
 * @typedef {Object} AssetClass
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {FilterState} filters
 * @property {string[]} tags
 * @property {number} createdAt
 */

/**
 * Get all user-created asset classes
 * @returns {AssetClass[]}
 */
export function getAssetClasses() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const json = localStorage.getItem(ASSET_CLASSES_KEY);
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

/**
 * Save a new asset class
 * @param {string} name
 * @param {string} description
 * @param {FilterState} filters
 * @param {string[]} tags
 * @returns {AssetClass}
 */
export function saveAssetClass(name, description, filters, tags = []) {
  const classes = getAssetClasses();
  const assetClass = {
    id: `class-${Date.now()}`,
    name,
    description,
    filters,
    tags,
    createdAt: Date.now(),
  };
  classes.push(assetClass);
  localStorage.setItem(ASSET_CLASSES_KEY, JSON.stringify(classes));
  return assetClass;
}

/**
 * Delete an asset class
 * @param {string} id
 */
export function deleteAssetClass(id) {
  const classes = getAssetClasses().filter((c) => c.id !== id);
  localStorage.setItem(ASSET_CLASSES_KEY, JSON.stringify(classes));
}

/**
 * Clear all user asset classes
 */
export function clearAssetClasses() {
  localStorage.removeItem(ASSET_CLASSES_KEY);
}
