/**
 * Compose Page State Management
 *
 * Extracted from compose/+page.svelte to reduce file size and improve organization.
 * Uses Svelte 5 runes with a class-based pattern.
 *
 * Data source: REST API (gem-api.thirdbear.net)
 * - Fast path: tracker/status/country filters → single API call
 * - Slow path: owner/capacity/share filters → progressive fetch + client-side filter
 *
 * Usage in +page.svelte:
 *   const state = new ComposeState();
 *   onMount(() => state.init(urlFilters));
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { base } from '$app/paths';

import { assetLink } from '$lib/links';
import {
  emptyFilterState,
  encodeFilters,
  buildShareUrl,
  hasActiveFilters,
  getPresets,
  savePreset,
  deletePreset,
  saveAssetClass,
} from '$lib/filter-state';
import { investigationCart } from '$lib/investigationCart';
import { buildExportPreset, importPreset } from '$lib/presets';
import {
  fetchApiFacets,
  fetchApiResults,
  paginateAllMatching,
  clientSideFilter,
  deriveOwnerFacets,
  deriveOwnerCountryFacets,
  deriveStateProvinceFacets,
  deriveCapacityRange,
  deriveAllParametricFacets,
  hasClientSideFilters,
  getServerCacheKey,
  STATIC_COLUMNS,
  STATIC_TRACKER_COLUMNS,
  type ComposeRow,
} from '$lib/compose-api';
import type { AssetSummary } from '$lib/ownership-api';
import { trackerColors } from '$lib/design-tokens';
import {
  mergeParametricCounts,
  calculateCapacityData,
  calculateStartYearData,
  calculateStatusDistribution,
  calculateCountryDistribution,
  calculateTrackerDistribution,
  copyToClipboard,
  downloadJson,
} from '../../routes/compose/compose-utils';
import { statusColorsGranular } from '$lib/design-tokens';

// ---------------------------------------------------------------------------
// State Class
// ---------------------------------------------------------------------------

export class ComposeState {
  // =========================================================================
  // Mutable State ($state)
  // =========================================================================

  // --- Core filter/results ---
  filters = $state(emptyFilterState());
  results = $state<any[]>([]);
  totalCount = $state(0);
  loading = $state(false);
  loadingOptions = $state(true);
  loadingCounts = $state(false);
  error = $state<string | null>(null);
  initialLoadComplete = $state(false);

  // --- Pagination ---
  currentPage = $state(1);
  pageSize = 50;

  // --- Asset preview panel ---
  selectedAsset = $state<any>(null);
  tooltipPos = $state({ x: 0, y: 0 });

  // --- Row selection for bulk cart actions ---
  selectedRows = $state<any[]>([]);
  allMatchingSelected = $state(false);
  allMatchingIds = $state<any[]>([]);

  // --- Base reference data (all possible options, never filtered) ---
  baseCountries = $state<any[]>([]);
  baseStateProvinces = $state<any[]>([]);
  baseOwnerCountries = $state<any[]>([]);
  baseOwners = $state<any[]>([]);
  baseTrackers = $state<any[]>([]);
  baseStatuses = $state<any[]>([]);

  // --- Parametric counts (update based on current filters, merged with base) ---
  countries = $state<any[]>([]);
  stateProvinces = $state<any[]>([]);
  ownerCountries = $state<any[]>([]);
  owners = $state<any[]>([]);
  trackerOptions = $state<any[]>([]);
  statusOptions = $state<any[]>([]);
  ownershipColumns = $state<string[]>([]);

  // --- Tracker-specific column availability ---
  trackerColumns = $state<Record<string, any>>({});

  // --- Presets ---
  presets = $state<any[]>([]);
  showPresets = $state(false);
  newPresetName = $state('');
  importError = $state('');
  copied = $state(false);
  queryTime = $state(0);

  // --- Asset class save modal ---
  showSaveAssetClass = $state(false);
  newClassName = $state('');
  newClassDescription = $state('');
  assetClassSaved = $state(false);

  // --- Data ranges for numeric filters ---
  capacityRange = $state({ min: 0, max: 10000 });
  startYearRange = $state({ min: 1950, max: 2035 });
  capacityHistogram = $state<any[]>([]);

  // --- Export ---
  exporting = $state(false);

  // --- Cart bridge (synced from Svelte writable store) ---
  _cartItems = $state<any[]>([]);

  // --- Client-side cache for progressive fetch ---
  _cachedAssets = $state<AssetSummary[] | null>(null);
  _cacheKey = $state<string | null>(null);
  _fetchProgress = $state<{ fetched: number; total: number } | null>(null);

  // =========================================================================
  // Derived Values ($derived)
  // =========================================================================

  shareUrl = $derived(buildShareUrl(this.filters));
  hasFilters = $derived(hasActiveFilters(this.filters));
  totalPages = $derived(Math.ceil(this.totalCount / this.pageSize));

  cartAssetIds = $derived(new Set(this._cartItems.map((item: any) => item.id)));

  ownershipColumnNames = $derived.by(() => {
    const columnSet = new Set(this.ownershipColumns);
    const startYearColumn = columnSet.has('Start Year')
      ? 'Start Year'
      : columnSet.has('Start year')
        ? 'Start year'
        : null;

    return {
      tracker: columnSet.has('Tracker') ? 'Tracker' : null,
      status: columnSet.has('Status') ? 'Status' : null,
      country: null,
      ownerCountry: columnSet.has('Owner Headquarters Country')
        ? 'Owner Headquarters Country'
        : null,
      owner: columnSet.has('Owner') ? 'Owner' : null,
      project: columnSet.has('Project') ? 'Project' : null,
      capacity: columnSet.has('Capacity (MW)') ? 'Capacity (MW)' : null,
      share: columnSet.has('Share') ? 'Share' : null,
      startYear: startYearColumn,
    };
  });

  availableColumns = $derived.by(() => {
    const selectedTrackers = this.filters.trackers;
    const hasCapacityGlobal = Boolean(this.ownershipColumnNames.capacity);
    const hasShareGlobal = Boolean(this.ownershipColumnNames.share);
    const hasStartYearGlobal = Boolean(this.ownershipColumnNames.startYear);

    if (!selectedTrackers.length) {
      return {
        hasCapacity: hasCapacityGlobal,
        hasShare: hasShareGlobal,
        hasStartYear: hasStartYearGlobal,
      };
    }

    let hasCapacity = false;
    let hasShare = false;
    let hasStartYear = false;

    for (const tracker of selectedTrackers) {
      const cols = this.trackerColumns[tracker];
      if (cols) {
        if (cols.hasCapacity) hasCapacity = true;
        if (cols.hasShare) hasShare = true;
        if (cols.hasStartYear) hasStartYear = true;
      } else {
        hasCapacity = hasCapacityGlobal;
        hasShare = hasShareGlobal;
        hasStartYear = hasStartYearGlobal;
      }
    }

    return { hasCapacity, hasShare, hasStartYear };
  });

  /**
   * @typedef {Object} TableColumn
   * @property {string} key
   * @property {string} label
   * @property {boolean} [sortable]
   * @property {boolean} [filterable]
   * @property {'string' | 'number' | 'date'} [type]
   * @property {string} [width]
   */
  tableColumns = $derived.by(() => {
    /** @type {any[]} */
    const allColumns = [
      { key: 'name', label: 'Asset', sortable: true, filterable: true },
      { key: 'asset_id', label: 'Asset ID', sortable: true, filterable: true },
      { key: 'tracker', label: 'Tracker', sortable: true, filterable: true, colorMap: trackerColors },
      { key: 'status', label: 'Status', sortable: true, filterable: true },
      { key: 'country', label: 'Country', sortable: true, filterable: true },
      ...(this.availableColumns.hasCapacity
        ? [
            {
              key: 'capacity_mw',
              label: 'Capacity (MW)',
              sortable: true,
              filterable: true,
              type: 'number' as const,
            },
          ]
        : []),
      { key: 'owner', label: 'Owner', sortable: true, filterable: true },
      { key: 'owner_id', label: 'Owner ID', sortable: true, filterable: true },
    ];

    const activeFilterColumns = new Set<string>();
    if (this.filters.trackers?.length) activeFilterColumns.add('tracker');
    if (this.filters.statuses?.length) activeFilterColumns.add('status');
    if (this.filters.countries?.length) activeFilterColumns.add('country');
    if (this.filters.owners?.length) activeFilterColumns.add('owner');

    const nameCol = allColumns.find((c: any) => c.key === 'name');
    const filteredCols = allColumns.filter(
      (c: any) => c.key !== 'name' && activeFilterColumns.has(c.key)
    );
    const otherCols = allColumns.filter(
      (c: any) => c.key !== 'name' && !activeFilterColumns.has(c.key)
    );

    return [nameCol, ...filteredCols, ...otherCols];
  });

  tableRows = $derived(
    this.results.map((row: any) => ({
      ...row,
      name: row.name || row.asset_id,
    }))
  );

  // --- Visualization data (derived from results) ---
  capacityData = $derived(calculateCapacityData(this.results));
  startYearData = $derived(calculateStartYearData(this.results));
  statusDistribution = $derived(calculateStatusDistribution(this.results));
  countryDistribution = $derived(calculateCountryDistribution(this.results));
  trackerDistribution = $derived(calculateTrackerDistribution(this.results));

  // --- Base (full dataset) distributions for comparison ---
  baseStatusDistribution = $derived(
    this.baseStatuses.map((f: any) => ({ label: f.value, value: f.count }))
  );
  baseTrackerDistribution = $derived(
    this.baseTrackers.map((f: any) => ({ label: f.value, value: f.count }))
  );
  baseCountryDistribution = $derived(
    this.baseCountries.map((f: any) => ({ label: f.value, value: f.count }))
  );

  // --- Status color map ---
  statusColors = statusColorsGranular;

  // --- Cart counting ---
  selectedInCart = $derived(
    this.selectedRows.filter((r: any) => r.asset_id && this.cartAssetIds.has(r.asset_id)).length
  );
  selectedNotInCart = $derived(this.selectedRows.length - this.selectedInCart);
  pageInCart = $derived(
    this.results.filter((r: any) => r.asset_id && this.cartAssetIds.has(r.asset_id)).length
  );
  allPageSelected = $derived(
    this.results.length > 0 && this.selectedRows.length === this.results.length
  );
  allMatchingInCart = $derived(
    this.allMatchingSelected
      ? this.allMatchingIds.filter((r: any) => r.asset_id && this.cartAssetIds.has(r.asset_id))
          .length
      : 0
  );
  allMatchingNotInCart = $derived(
    this.allMatchingSelected ? this.allMatchingIds.length - this.allMatchingInCart : 0
  );

  // =========================================================================
  // Constructor (sets up effects)
  // =========================================================================

  constructor() {
    // Bridge Svelte 4 writable store into reactive $state
    $effect(() => {
      const unsub = investigationCart.subscribe((items: any[]) => {
        this._cartItems = items;
      });
      return unsub;
    });

    // Watch for filter changes and update results + counts (debounced)
    $effect(() => {
      // Track filter changes by serializing (triggers effect on any change)
      const _filterKey = JSON.stringify({
        trackers: this.filters.trackers,
        trackersAnd: this.filters.trackersAnd,
        statuses: this.filters.statuses,
        statusesAnd: this.filters.statusesAnd,
        countries: this.filters.countries,
        countriesAnd: this.filters.countriesAnd,
        ownerCountries: this.filters.ownerCountries,
        ownerCountriesAnd: this.filters.ownerCountriesAnd,
        owners: this.filters.owners,
        ownersAnd: this.filters.ownersAnd,
        capacityMin: this.filters.capacityMin,
        capacityMax: this.filters.capacityMax,
        shareMin: this.filters.shareMin,
        shareMax: this.filters.shareMax,
        startYearMin: this.filters.startYearMin,
        startYearMax: this.filters.startYearMax,
        search: this.filters.search,
      });

      // Skip during initial load (init() handles that)
      if (!this.initialLoadComplete) {
        return;
      }

      const timeout = setTimeout(() => {
        this.syncFiltersToUrl();
        this.loadResults();
        this.updateParametricCounts();
      }, 600);

      return () => clearTimeout(timeout);
    });
  }

  // =========================================================================
  // URL Sync
  // =========================================================================

  syncFiltersToUrl = () => {
    if (!browser) return;
    const encoded = encodeFilters(this.filters);
    const newUrl = encoded ? `${base}/compose?${encoded}` : `${base}/compose`;
    goto(newUrl, { replaceState: true, keepFocus: true });
  };

  // =========================================================================
  // Data Loading (REST API)
  // =========================================================================

  loadResults = async (resetPage = true) => {
    if (!browser) return;

    if (resetPage) {
      this.currentPage = 1;
    }

    this.loading = true;
    this.error = null;
    const startTime = Date.now();
    const offset = (this.currentPage - 1) * this.pageSize;

    try {
      if (!hasClientSideFilters(this.filters)) {
        // Fast path: API handles all filters directly
        const data = await fetchApiResults(this.filters, this.pageSize, offset);
        this.results = data.results;
        this.totalCount = data.totalCount;
      } else {
        // Slow path: ensure cache, then filter client-side
        await this._ensureCache();
        const filtered = clientSideFilter(this._cachedAssets!, this.filters);
        this.totalCount = filtered.length;

        // Map to ComposeRow and paginate
        const page = filtered.slice(offset, offset + this.pageSize);
        this.results = page.map((asset) => {
          const firstOwner = asset.owners?.[0];
          return {
            asset_id: asset.id,
            name: asset.name,
            tracker: asset.facilityType || '',
            status: asset.status || '',
            country: asset.country || '',
            state_province: (asset as any).stateProvince || '',
            capacity_mw: asset.capacity ?? null,
            owner: firstOwner?.name || asset.ownerName || '',
            owner_id: firstOwner?.entityId || asset.ownerEntityId || '',
          } as ComposeRow;
        });
      }
      this.queryTime = Date.now() - startTime;
    } catch (err: any) {
      this.error = err.message;
      this.results = [];
      this.totalCount = 0;
    } finally {
      this.loading = false;
    }
  };

  goToPage = (page: number) => {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.currentPage = page;
    this.loadResults(false);
  };

  loadReferenceData = async () => {
    if (!browser) return;
    this.loadingOptions = true;

    try {
      // Single API call for base facets (no filters = all options)
      const facets = await fetchApiFacets({});

      // Set static columns (schema is stable)
      this.ownershipColumns = STATIC_COLUMNS;

      // Store base options from API facets
      this.baseTrackers = facets.trackers;
      this.baseStatuses = facets.statuses;
      this.baseCountries = facets.countries;

      // Owner + owner country: empty initially, populated from cache
      this.baseOwnerCountries = [];
      this.baseOwners = [];

      // Initialize display options with base data
      this.trackerOptions = facets.trackers;
      this.statusOptions = facets.statuses;
      this.countries = facets.countries;
      this.ownerCountries = [];
      this.owners = [];

      // Capacity range: hardcoded defaults (refined from cache later)
      this.capacityRange = { min: 0, max: 10000 };
      this.startYearRange = { min: 1950, max: 2035 };
      this.capacityHistogram = [];

      // Static tracker column info
      this.trackerColumns = STATIC_TRACKER_COLUMNS;
    } catch (err: any) {
      this.error = 'Failed to load filter options. Check your connection.';
      if (import.meta.env.DEV) console.warn('[compose] loadReferenceData failed:', err);
    } finally {
      this.loadingOptions = false;
    }
  };

  updateParametricCounts = async () => {
    if (!browser) return;
    this.loadingCounts = true;

    try {
      if (!hasActiveFilters(this.filters)) {
        this.loadingCounts = false;
        return;
      }

      // If cache exists, derive ALL facet counts from cache with proper parametric exclusion.
      // This ensures owner/capacity/share filters affect tracker/status/country counts (and vice versa).
      if (this._cachedAssets) {
        const facets = deriveAllParametricFacets(this._cachedAssets, this.filters);

        this.trackerOptions = mergeParametricCounts(
          this.baseTrackers,
          facets.trackers.map((f) => ({ value: f.value, count: f.count }))
        );
        this.statusOptions = mergeParametricCounts(
          this.baseStatuses,
          facets.statuses.map((f) => ({ value: f.value, count: f.count }))
        );
        this.countries = mergeParametricCounts(
          this.baseCountries,
          facets.countries.map((f) => ({ value: f.value, count: f.count }))
        );
        this.stateProvinces = mergeParametricCounts(
          this.baseStateProvinces,
          facets.stateProvinces.map((f) => ({ value: f.value, count: f.count }))
        );
        this.owners = mergeParametricCounts(
          this.baseOwners,
          facets.owners.map((f) => ({ value: f.value, count: f.count }))
        );
        this.ownerCountries = mergeParametricCounts(
          this.baseOwnerCountries,
          facets.ownerCountries.map((f) => ({ value: f.value, count: f.count }))
        );
        return;
      }

      // No cache: use API facets (accurate for tracker/status/country-only filters)
      const facets = await fetchApiFacets(this.filters);

      this.trackerOptions = mergeParametricCounts(
        this.baseTrackers,
        facets.trackers.map((f) => ({ value: f.value, count: f.count }))
      );
      this.statusOptions = mergeParametricCounts(
        this.baseStatuses,
        facets.statuses.map((f) => ({ value: f.value, count: f.count }))
      );
      this.countries = mergeParametricCounts(
        this.baseCountries,
        facets.countries.map((f) => ({ value: f.value, count: f.count }))
      );
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[compose] parametric count update failed:', err);
    } finally {
      this.loadingCounts = false;
    }
  };

  /**
   * Ensure the client-side cache is populated for the current server-side filter params.
   * If the cache key doesn't match, performs a progressive fetch.
   */
  _ensureCache = async () => {
    const key = getServerCacheKey(this.filters);

    if (this._cacheKey === key && this._cachedAssets) {
      return; // Cache is current
    }

    this._fetchProgress = { fetched: 0, total: 0 };

    const assets = await paginateAllMatching(this.filters, (fetched, total) => {
      this._fetchProgress = { fetched, total };
    });

    this._cachedAssets = assets;
    this._cacheKey = key;
    this._fetchProgress = null;

    // Derive owner/ownerCountry base facets + capacity range from fetched data
    this.baseOwners = deriveOwnerFacets(assets);
    this.baseOwnerCountries = deriveOwnerCountryFacets(assets);
    this.baseStateProvinces = deriveStateProvinceFacets(assets);
    this.owners = this.baseOwners;
    this.ownerCountries = this.baseOwnerCountries;
    this.stateProvinces = this.baseStateProvinces;

    const capRange = deriveCapacityRange(assets);
    this.capacityRange = capRange;
  };

  // =========================================================================
  // Filter Handlers
  // =========================================================================

  clearFilters = () => {
    this.filters = emptyFilterState();
    this._cachedAssets = null;
    this._cacheKey = null;
    this.syncFiltersToUrl();
    this.loadResults();
    // Reset to base counts
    this.trackerOptions = this.baseTrackers;
    this.statusOptions = this.baseStatuses;
    this.countries = this.baseCountries;
    this.stateProvinces = this.baseStateProvinces;
    this.ownerCountries = this.baseOwnerCountries;
    this.owners = this.baseOwners;
  };

  removeFilter = (key: string, value?: string) => {
    const arrayKeys = ['trackers', 'statuses', 'countries', 'stateProvinces', 'ownerCountries', 'owners'];
    if (arrayKeys.includes(key)) {
      (this.filters as any)[key] = value
        ? (this.filters as any)[key].filter((v: string) => v !== value)
        : [];
    } else if (key === 'capacity') {
      this.filters.capacityMin = this.filters.capacityMax = null;
    } else if (key === 'share') {
      this.filters.shareMin = this.filters.shareMax = null;
    } else if (key === 'startYear') {
      this.filters.startYearMin = this.filters.startYearMax = null;
    } else if (key === 'search') {
      this.filters.search = '';
    }
  };

  applyFilters = () => {
    this.syncFiltersToUrl();
    this.loadResults();
    this.updateParametricCounts();
  };

  // =========================================================================
  // Share / Presets / Asset Class Handlers
  // =========================================================================

  copyShareUrl = async () => {
    if (!browser) return;
    const fullUrl = window.location.origin + this.shareUrl;
    const success = await copyToClipboard(fullUrl);
    if (success) {
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    }
  };

  handleSavePreset = () => {
    if (!this.newPresetName.trim()) return;
    savePreset(this.newPresetName.trim(), { ...this.filters });
    this.presets = getPresets();
    this.newPresetName = '';
    this.showPresets = false;
  };

  handleSaveAssetClass = () => {
    if (!this.newClassName.trim()) return;
    saveAssetClass(
      this.newClassName.trim(),
      this.newClassDescription.trim(),
      { ...this.filters },
      []
    );
    this.assetClassSaved = true;
    setTimeout(() => {
      this.showSaveAssetClass = false;
      this.newClassName = '';
      this.newClassDescription = '';
      this.assetClassSaved = false;
    }, 1500);
  };

  handleLoadPreset = (preset: any) => {
    this.filters = { ...emptyFilterState(), ...preset.filters };
    this.showPresets = false;
    this.applyFilters();
  };

  handleDeletePreset = (id: string) => {
    deletePreset(id);
    this.presets = getPresets();
  };

  downloadPresetFile = (preset: any) => {
    const exportPreset = buildExportPreset(preset);
    downloadJson(exportPreset, `${exportPreset.id}.json`);
  };

  handleImportPreset = async (event: Event) => {
    if (!browser) return;
    this.importError = '';
    const target = /** @type {HTMLInputElement} */ event.currentTarget as HTMLInputElement;
    const file = target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importPreset(data);
      this.presets = getPresets();
    } catch {
      this.importError = 'Failed to import preset JSON.';
    } finally {
      target.value = '';
    }
  };

  // =========================================================================
  // Row Interaction Handlers
  // =========================================================================

  handleRowClick = (row: any) => {
    if (!row?.asset_id) return;
    goto(assetLink(row.asset_id));
  };

  handleRowHover = (row: any, event: MouseEvent) => {
    if (!row?.asset_id) {
      this.selectedAsset = null;
      return;
    }
    this.tooltipPos = { x: event.clientX, y: event.clientY };
    this.selectedAsset = {
      id: row.asset_id,
      name: row.name || row.asset_id,
      status: row.status,
      tracker: row.tracker,
      country: row.country,
      capacity: row.capacity_mw,
      owner: row.owner,
      startYear: row.start_year,
    };
  };

  handleRowLeave = () => {
    this.selectedAsset = null;
  };

  isRowInCart = (row: any) => {
    return row?.asset_id && this.cartAssetIds.has(row.asset_id);
  };

  // =========================================================================
  // Cart Operations
  // =========================================================================

  addToCart = (items: any[]) => {
    for (const row of items) {
      if (row.asset_id && !this.cartAssetIds.has(row.asset_id)) {
        investigationCart.add({ id: row.asset_id, name: row.name || row.asset_id, type: 'asset' });
      }
    }
  };

  removeFromCart = (items: any[]) => {
    for (const row of items) {
      if (row.asset_id && this.cartAssetIds.has(row.asset_id))
        investigationCart.remove(row.asset_id);
    }
  };

  addSelectedToCart = () => {
    if (this.selectedRows.length) {
      this.addToCart(this.selectedRows);
      this.selectedRows = [];
    }
  };

  removeSelectedFromCart = () => {
    if (this.selectedRows.length) {
      this.removeFromCart(this.selectedRows);
      this.selectedRows = [];
    }
  };

  addPageToCart = () => {
    this.addToCart(this.results);
  };

  removePageFromCart = () => {
    this.removeFromCart(this.results);
  };

  fetchAllMatchingIds = async () => {
    try {
      // If cache exists, filter from it
      if (this._cachedAssets) {
        const filtered = clientSideFilter(this._cachedAssets, this.filters);
        return filtered.slice(0, 10000).map((a) => ({
          asset_id: a.id,
          name: a.name,
        }));
      }

      // Otherwise progressive fetch from API
      const assets = await paginateAllMatching(this.filters);
      const filtered = hasClientSideFilters(this.filters)
        ? clientSideFilter(assets, this.filters)
        : assets;
      return filtered.slice(0, 10000).map((a) => ({
        asset_id: a.id,
        name: a.name,
      }));
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[compose] fetchAllMatchingIds failed:', err);
      return [];
    }
  };

  selectAllMatching = async () => {
    this.loading = true;
    const allMatching = await this.fetchAllMatchingIds();
    this.allMatchingIds = allMatching as any[];
    this.allMatchingSelected = true;
    this.loading = false;
  };

  clearAllMatchingSelection = () => {
    this.allMatchingSelected = false;
    this.allMatchingIds = [];
    this.selectedRows = [];
  };

  addAllMatchingToCart = () => {
    if (this.allMatchingSelected && this.allMatchingIds.length) {
      this.addToCart(this.allMatchingIds);
      this.clearAllMatchingSelection();
    }
  };

  removeAllMatchingFromCart = () => {
    if (this.allMatchingSelected && this.allMatchingIds.length) {
      this.removeFromCart(this.allMatchingIds);
      this.clearAllMatchingSelection();
    }
  };

  // =========================================================================
  // Export Functions (fetch ALL matching, not just current page)
  // =========================================================================

  fetchAllForExport = async (): Promise<ComposeRow[]> => {
    try {
      // If cache exists, use it
      if (this._cachedAssets) {
        const filtered = clientSideFilter(this._cachedAssets, this.filters);
        return filtered.slice(0, 50000).map((asset) => {
          const firstOwner = asset.owners?.[0];
          return {
            asset_id: asset.id,
            name: asset.name,
            tracker: asset.facilityType || '',
            status: asset.status || '',
            country: asset.country || '',
            state_province: (asset as any).stateProvince || '',
            capacity_mw: asset.capacity ?? null,
            owner: firstOwner?.name || asset.ownerName || '',
            owner_id: firstOwner?.entityId || asset.ownerEntityId || '',
          };
        });
      }

      // Otherwise progressive fetch from API
      const assets = await paginateAllMatching(this.filters, (fetched, total) => {
        this._fetchProgress = { fetched, total };
      });
      this._fetchProgress = null;

      const filtered = hasClientSideFilters(this.filters)
        ? clientSideFilter(assets, this.filters)
        : assets;

      return filtered.slice(0, 50000).map((asset) => {
        const firstOwner = asset.owners?.[0];
        return {
          asset_id: asset.id,
          name: asset.name,
          tracker: asset.facilityType || '',
          status: asset.status || '',
          country: asset.country || '',
          state_province: (asset as any).stateProvince || '',
          capacity_mw: asset.capacity ?? null,
          owner: firstOwner?.name || asset.ownerName || '',
          owner_id: firstOwner?.entityId || asset.ownerEntityId || '',
        };
      });
    } catch (err: any) {
      this._fetchProgress = null;
      this.error = err?.message || 'Export failed. Please try again.';
      return [];
    }
  };

  exportCSV = async () => {
    this.exporting = true;
    try {
      const data = await this.fetchAllForExport();
      if (!data || data.length === 0) return;

      const headers = [
        'asset_id',
        'name',
        'tracker',
        'status',
        'country',
        'capacity_mw',
        'owner',
        'owner_id',
      ];
      const csvRows = [headers.join(',')];

      for (const row of data) {
        const values = headers.map((h) => {
          const val = (row as any)[h];
          if (val == null) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        });
        csvRows.push(values.join(','));
      }

      this._downloadFile(csvRows.join('\n'), `gem-export-${Date.now()}.csv`, 'text/csv');
    } finally {
      this.exporting = false;
    }
  };

  exportJSON = async () => {
    this.exporting = true;
    try {
      const data = await this.fetchAllForExport();
      if (!data || data.length === 0) return;
      this._downloadFile(
        JSON.stringify(data, null, 2),
        `gem-export-${Date.now()}.json`,
        'application/json'
      );
    } finally {
      this.exporting = false;
    }
  };

  _downloadFile = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // =========================================================================
  // Initialization (called from onMount in the page component)
  // =========================================================================

  init = async (urlFilters: any) => {
    // Apply filters from URL
    this.filters = urlFilters;

    // Load presets from localStorage
    this.presets = getPresets();

    // Load reference data first (single API call)
    await this.loadReferenceData();

    // Load results (await to avoid race with parametric counts)
    await this.loadResults();

    // Update parametric counts if we have URL filters
    if (hasActiveFilters(urlFilters)) {
      await this.updateParametricCounts();
    }

    // Mark initial load as complete - $effect will now handle subsequent changes
    this.initialLoadComplete = true;
  };
}
