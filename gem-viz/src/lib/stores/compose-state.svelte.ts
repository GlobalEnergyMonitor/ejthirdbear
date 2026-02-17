/**
 * Compose Page State Management
 *
 * Extracted from compose/+page.svelte to reduce file size and improve organization.
 * Uses Svelte 5 runes with a class-based pattern.
 *
 * Usage in +page.svelte:
 *   const state = new ComposeState();
 *   onMount(() => state.init(urlFilters));
 */

import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { base } from '$app/paths';

import { assetLink } from '$lib/links';
import {
  emptyFilterState,
  encodeFilters,
  buildShareUrl,
  hasActiveFilters,
  buildSqlWhere,
  getPresets,
  savePreset,
  deletePreset,
  saveAssetClass,
} from '$lib/filter-state';
import { investigationCart } from '$lib/investigationCart';
import { buildExportPreset, importPreset } from '$lib/presets';
import {
  fetchOwnershipColumns,
  fetchCountries,
  fetchOwnerCountries,
  fetchOwners,
  fetchTrackers,
  fetchStatuses,
  fetchCapacityRange,
  fetchStartYearRange,
  fetchCapacityHistogram,
  fetchResults,
  fetchTrackerColumnInfo,
} from '$lib/compose-queries';
import { ASSET_ID_COALESCE_O } from '$lib/duckdb-queries';
import {
  mergeParametricCounts,
  calculateCapacityData,
  calculateStartYearData,
  calculateStatusDistribution,
  calculateCountryDistribution,
  calculateTrackerDistribution,
  copyToClipboard,
  downloadJson,
  LOCATIONS_DEDUP_SQL,
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
  baseOwnerCountries = $state<any[]>([]);
  baseOwners = $state<any[]>([]);
  baseTrackers = $state<any[]>([]);
  baseStatuses = $state<any[]>([]);

  // --- Parametric counts (update based on current filters, merged with base) ---
  countries = $state<any[]>([]);
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
      { key: 'tracker', label: 'Tracker', sortable: true, filterable: true },
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
  // Data Loading
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
      const whereClause = buildSqlWhere(this.filters, 'o', this.ownershipColumnNames);
      const data = await fetchResults(whereClause, this.ownershipColumnNames, this.pageSize, offset);

      this.results = data.results;
      this.totalCount = data.totalCount;
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
      const [
        cols,
        countryData,
        ownerCountryData,
        ownerData,
        trackerData,
        statusData,
        capRange,
        yearRange,
        capHist,
      ] = await Promise.all([
        fetchOwnershipColumns(),
        fetchCountries(),
        fetchOwnerCountries(),
        fetchOwners(),
        fetchTrackers(),
        fetchStatuses(),
        fetchCapacityRange(),
        fetchStartYearRange(),
        fetchCapacityHistogram(),
      ]);

      this.ownershipColumns = cols;

      // Store base options (all possible values)
      this.baseCountries = countryData;
      this.baseOwnerCountries = ownerCountryData;
      this.baseOwners = ownerData;
      this.baseTrackers = trackerData;
      this.baseStatuses = statusData;

      // Initialize display options with base data
      this.countries = countryData;
      this.ownerCountries = ownerCountryData;
      this.owners = ownerData;
      this.trackerOptions = trackerData;
      this.statusOptions = statusData;

      this.capacityRange = capRange;
      this.startYearRange = yearRange;
      this.capacityHistogram = capHist;

      this.loadTrackerColumns();
    } catch {
      // Silently handle reference data load failure
    } finally {
      this.loadingOptions = false;
    }
  };

  loadTrackerColumns = async () => {
    if (!browser) return;
    try {
      const trackers = this.trackerOptions.map((t: any) => t.value).filter(Boolean);
      this.trackerColumns = await fetchTrackerColumnInfo(trackers, this.ownershipColumnNames);
    } catch {
      // Silently handle - column info is optional
    }
  };

  updateParametricCounts = async () => {
    if (!browser) return;
    this.loadingCounts = true;

    try {
      const { widgetQuery } = await import('$lib/widgets/widget-utils');

      const whereClause = buildSqlWhere(this.filters, 'o', this.ownershipColumnNames);
      const hasActiveFilter = whereClause !== '1=1';

      if (!hasActiveFilter) {
        return;
      }

      const statusWhereClause = this._buildSqlWhereExcluding('statuses');
      const trackerWhereClause = this._buildSqlWhereExcluding('trackers');

      const [trackerResult, statusResult, countryResult, ownerCountryResult, ownerResult] =
        await Promise.all([
          widgetQuery(`
          SELECT o."Tracker" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${trackerWhereClause}
          GROUP BY o."Tracker"
          ORDER BY cnt DESC
        `),
          widgetQuery(`
          SELECT o."Status" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${statusWhereClause}
          GROUP BY o."Status"
          ORDER BY cnt DESC
        `),
          widgetQuery(`
          SELECT l."Country.Area" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${this._buildSqlWhereExcluding('countries')}
            AND l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
          GROUP BY l."Country.Area"
          ORDER BY cnt DESC
        `),
          widgetQuery(`
          SELECT o."Owner Headquarters Country" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${this._buildSqlWhereExcluding('ownerCountries')}
            AND o."Owner Headquarters Country" IS NOT NULL AND o."Owner Headquarters Country" != ''
          GROUP BY o."Owner Headquarters Country"
          ORDER BY cnt DESC
        `),
          widgetQuery(`
          SELECT o."Owner" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${this._buildSqlWhereExcluding('owners')}
            AND o."Owner" IS NOT NULL AND o."Owner" != ''
          GROUP BY o."Owner"
          ORDER BY cnt DESC
          LIMIT 1000
        `),
        ]);

      this.trackerOptions = mergeParametricCounts(this.baseTrackers, trackerResult.data || []);
      this.statusOptions = mergeParametricCounts(this.baseStatuses, statusResult.data || []);
      this.countries = mergeParametricCounts(this.baseCountries, countryResult.data || []);
      this.ownerCountries = mergeParametricCounts(
        this.baseOwnerCountries,
        ownerCountryResult.data || []
      );
      if (ownerResult.success) {
        this.owners = mergeParametricCounts(this.baseOwners, ownerResult.data || []);
      }
    } catch {
      // Silently handle - counts will remain unchanged
    } finally {
      this.loadingCounts = false;
    }
  };

  _buildSqlWhereExcluding = (excludeKey: string) => {
    return buildSqlWhere({ ...this.filters, [excludeKey]: [] }, 'o', this.ownershipColumnNames);
  };

  // =========================================================================
  // Filter Handlers
  // =========================================================================

  clearFilters = () => {
    this.filters = emptyFilterState();
    this.syncFiltersToUrl();
    this.loadResults();
    // Reset to base counts
    this.trackerOptions = this.baseTrackers;
    this.statusOptions = this.baseStatuses;
    this.countries = this.baseCountries;
    this.ownerCountries = this.baseOwnerCountries;
    this.owners = this.baseOwners;
  };

  removeFilter = (key: string, value?: string) => {
    const arrayKeys = ['trackers', 'statuses', 'countries', 'ownerCountries', 'owners'];
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
    saveAssetClass(this.newClassName.trim(), this.newClassDescription.trim(), { ...this.filters }, []);
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
      if (row.asset_id && this.cartAssetIds.has(row.asset_id)) investigationCart.remove(row.asset_id);
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
    const { widgetQuery } = await import('$lib/widgets/widget-utils');
    const whereClause = buildSqlWhere(this.filters, 'o', this.ownershipColumnNames);

    const result = await widgetQuery(`
      SELECT DISTINCT ${ASSET_ID_COALESCE_O} as asset_id, o."Project" as name
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
      LIMIT 10000
    `);

    if (result.success && result.data) {
      return result.data;
    }
    return [];
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

  fetchAllForExport = async () => {
    const { widgetQuery } = await import('$lib/widgets/widget-utils');
    const whereClause = buildSqlWhere(this.filters, 'o', this.ownershipColumnNames);

    const result = await widgetQuery(`
      SELECT DISTINCT
        ${ASSET_ID_COALESCE_O} as asset_id,
        o."Project" as name,
        o."Tracker" as tracker,
        o."Status" as status,
        l."Country.Area" as country,
        TRY_CAST(o."Capacity (MW)" AS DOUBLE) as capacity_mw,
        o."Owner" as owner,
        o."Owner GEM Entity ID" as owner_id
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP_SQL} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
      ORDER BY o."Project"
      LIMIT 50000
    `);

    return result.success ? result.data : [];
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

    // Load reference data first (needed for column names)
    await this.loadReferenceData();

    // Load results
    this.loadResults();

    // Update parametric counts if we have URL filters
    if (hasActiveFilters(urlFilters)) {
      await this.updateParametricCounts();
    }

    // Mark initial load as complete - $effect will now handle subsequent changes
    this.initialLoadComplete = true;
  };
}
