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

/**
 * @typedef {Object} FilterState
 * @property {string[]} trackers - Selected tracker types
 * @property {string[]} statuses - Selected statuses
 * @property {string[]} countries - Selected countries
 * @property {number|null} capacityMin - Minimum capacity (MW)
 * @property {number|null} capacityMax - Maximum capacity (MW)
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
    statuses: [],
    countries: [],
    capacityMin: null,
    capacityMax: null,
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

  if (filters.trackers?.length) {
    params.set('trackers', filters.trackers.join(','));
  }
  if (filters.statuses?.length) {
    params.set('statuses', filters.statuses.join(','));
  }
  if (filters.countries?.length) {
    params.set('countries', filters.countries.join(','));
  }
  if (filters.capacityMin != null) {
    params.set('capacityMin', String(filters.capacityMin));
  }
  if (filters.capacityMax != null) {
    params.set('capacityMax', String(filters.capacityMax));
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
    typeof searchParams === 'string'
      ? new URLSearchParams(searchParams)
      : searchParams;

  const filters = emptyFilterState();

  const trackers = params.get('trackers');
  if (trackers) {
    filters.trackers = trackers.split(',').filter(Boolean);
  }

  const statuses = params.get('statuses');
  if (statuses) {
    filters.statuses = statuses.split(',').filter(Boolean);
  }

  const countries = params.get('countries');
  if (countries) {
    filters.countries = countries.split(',').filter(Boolean);
  }

  const capacityMin = params.get('capacityMin');
  if (capacityMin) {
    filters.capacityMin = Number(capacityMin);
  }

  const capacityMax = params.get('capacityMax');
  if (capacityMax) {
    filters.capacityMax = Number(capacityMax);
  }

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
 * @param {string} baseUrl - Base URL (default: current page)
 * @returns {string} Full URL with filter params
 */
export function buildShareUrl(filters, baseUrl = '') {
  const encoded = encodeFilters(filters);
  if (!encoded) return baseUrl || '/compose';
  return `${baseUrl || '/compose'}?${encoded}`;
}

/**
 * Check if filter state has any active filters
 * @param {FilterState} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters) {
  return (
    filters.trackers?.length > 0 ||
    filters.statuses?.length > 0 ||
    filters.countries?.length > 0 ||
    filters.capacityMin != null ||
    filters.capacityMax != null ||
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
  if (filters.trackers?.length > 0) count++;
  if (filters.statuses?.length > 0) count++;
  if (filters.countries?.length > 0) count++;
  if (filters.capacityMin != null) count++;
  if (filters.capacityMax != null) count++;
  if (filters.search?.length > 0) count++;
  return count;
}

/**
 * Build SQL WHERE clause from filters
 * @param {FilterState} filters
 * @returns {string} SQL WHERE clause (without WHERE keyword)
 */
export function buildSqlWhere(filters) {
  const conditions = [];

  if (filters.trackers?.length) {
    const escaped = filters.trackers.map((t) => `'${t.replace(/'/g, "''")}'`);
    conditions.push(`"Tracker" IN (${escaped.join(', ')})`);
  }

  if (filters.statuses?.length) {
    const escaped = filters.statuses.map((s) => `'${s.replace(/'/g, "''")}'`);
    conditions.push(`"Status" IN (${escaped.join(', ')})`);
  }

  if (filters.countries?.length) {
    const escaped = filters.countries.map((c) => `'${c.replace(/'/g, "''")}'`);
    conditions.push(`"Country" IN (${escaped.join(', ')})`);
  }

  if (filters.capacityMin != null) {
    conditions.push(`CAST("Capacity (MW)" AS DOUBLE) >= ${filters.capacityMin}`);
  }

  if (filters.capacityMax != null) {
    conditions.push(`CAST("Capacity (MW)" AS DOUBLE) <= ${filters.capacityMax}`);
  }

  if (filters.search) {
    const escaped = filters.search.replace(/'/g, "''");
    conditions.push(`("Project" ILIKE '%${escaped}%' OR "Owner" ILIKE '%${escaped}%')`);
  }

  if (conditions.length === 0) return '1=1';

  const joiner = filters.logic === 'OR' ? ' OR ' : ' AND ';
  return conditions.join(joiner);
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
