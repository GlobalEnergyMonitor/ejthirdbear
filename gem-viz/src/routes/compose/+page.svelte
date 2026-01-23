<script>
  /**
   * FILTER COMPOSER PAGE
   * Build custom filtered views of the GEM ownership data.
   * Filters are encoded in the URL for easy sharing.
   *
   * See: docs/compose-api-spec.md for API migration notes
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';
  import { base } from '$app/paths';

  import { assetLink, link } from '$lib/links';
  import { formatCount } from '$lib/format';
  import MiniHistogram from '$lib/components/MiniHistogram.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MiniBarChart from '$lib/components/MiniBarChart.svelte';
  import DataTable from '$lib/components/DataTable.svelte';
  import FacetedFilter from '$lib/components/FacetedFilter.svelte';
  import RangeSlider from '$lib/components/RangeSlider.svelte';
  import FilterBreadcrumbs from '$lib/components/FilterBreadcrumbs.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { statusColorsGranular } from '$lib/design-tokens';

  import {
    emptyFilterState,
    decodeFilters,
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

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let filters = $state(emptyFilterState());
  let results = $state([]);
  let totalCount = $state(0);
  let loading = $state(false);
  let loadingOptions = $state(true);
  let loadingCounts = $state(false);
  let error = $state(null);
  let initialLoadComplete = $state(false);

  // Pagination
  let currentPage = $state(1);
  const pageSize = 50;
  const totalPages = $derived(Math.ceil(totalCount / pageSize));

  // Asset preview panel
  let selectedAsset = $state(null);

  // Row selection for bulk cart actions
  let selectedRows = $state([]);
  let allMatchingSelected = $state(false); // Gmail-style "select all X matching"
  let allMatchingIds = $state([]); // IDs of all matching assets (when selecting all)

  // Base reference data (all possible options - never filtered)
  let baseCountries = $state([]);
  let baseOwnerCountries = $state([]);
  let baseOwners = $state([]);
  let baseTrackers = $state([]);
  let baseStatuses = $state([]);

  // Parametric counts (update based on current filters - merged with base)
  let countries = $state([]);
  let ownerCountries = $state([]);
  let owners = $state([]);
  let trackerOptions = $state([]);
  let statusOptions = $state([]);
  let ownershipColumns = $state([]);

  // Tracker-specific column availability
  // Maps tracker name -> { hasCapacity, hasStartYear, hasShare }
  let trackerColumns = $state({});

  let presets = $state([]);
  let showPresets = $state(false);
  let newPresetName = $state('');
  let importError = $state('');
  let copied = $state(false);
  let queryTime = $state(0);

  // Asset class save modal
  let showSaveAssetClass = $state(false);
  let newClassName = $state('');
  let newClassDescription = $state('');
  let assetClassSaved = $state(false);

  // Data ranges for numeric filters
  let capacityRange = $state({ min: 0, max: 10000 });
  let startYearRange = $state({ min: 1950, max: 2035 });
  let capacityHistogram = $state([]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const shareUrl = $derived(buildShareUrl(filters));
  const hasFilters = $derived(hasActiveFilters(filters));

  // Investigation cart - track which assets are in the user's investigation
  const cartAssetIds = $derived(new Set($investigationCart.map((item) => item.id)));

  const ownershipColumnNames = $derived.by(() => {
    const columnSet = new Set(ownershipColumns);
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

  // Determine which columns are available based on selected trackers
  const availableColumns = $derived.by(() => {
    const selectedTrackers = filters.trackers;
    const hasCapacityGlobal = Boolean(ownershipColumnNames.capacity);
    const hasShareGlobal = Boolean(ownershipColumnNames.share);
    const hasStartYearGlobal = Boolean(ownershipColumnNames.startYear);

    // If no trackers selected, show all possible columns
    if (!selectedTrackers.length) {
      return {
        hasCapacity: hasCapacityGlobal,
        hasShare: hasShareGlobal,
        hasStartYear: hasStartYearGlobal,
      };
    }

    // Check if any selected tracker has these columns
    let hasCapacity = false;
    let hasShare = false;
    let hasStartYear = false;

    for (const tracker of selectedTrackers) {
      const cols = trackerColumns[tracker];
      if (cols) {
        if (cols.hasCapacity) hasCapacity = true;
        if (cols.hasShare) hasShare = true;
        if (cols.hasStartYear) hasStartYear = true;
      } else {
        // If we don't have info, assume it might have the columns
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

  const tableColumns = $derived.by(() => {
    // All possible columns
    /** @type {TableColumn[]} */
    const allColumns = [
      { key: 'name', label: 'Asset', sortable: true, filterable: true },
      { key: 'asset_id', label: 'Asset ID', sortable: true, filterable: true },
      { key: 'tracker', label: 'Tracker', sortable: true, filterable: true },
      { key: 'status', label: 'Status', sortable: true, filterable: true },
      { key: 'country', label: 'Country', sortable: true, filterable: true },
      ...(availableColumns.hasCapacity
        ? [
            {
              key: 'capacity_mw',
              label: 'Capacity (MW)',
              sortable: true,
              filterable: true,
              type: /** @type {const} */ ('number'),
            },
          ]
        : []),
      { key: 'owner', label: 'Owner', sortable: true, filterable: true },
      { key: 'owner_id', label: 'Owner ID', sortable: true, filterable: true },
    ];

    // Find which columns have active filters
    const activeFilterColumns = new Set();
    if (filters.trackers?.length) activeFilterColumns.add('tracker');
    if (filters.statuses?.length) activeFilterColumns.add('status');
    if (filters.countries?.length) activeFilterColumns.add('country');
    if (filters.owners?.length) activeFilterColumns.add('owner');

    // Reorder: name first, then filtered columns, then the rest
    const nameCol = allColumns.find((c) => c.key === 'name');
    const filteredCols = allColumns.filter(
      (c) => c.key !== 'name' && activeFilterColumns.has(c.key)
    );
    const otherCols = allColumns.filter((c) => c.key !== 'name' && !activeFilterColumns.has(c.key));

    return [nameCol, ...filteredCols, ...otherCols];
  });

  const tableRows = $derived(
    results.map((row) => ({
      ...row,
      name: row.name || row.asset_id,
    }))
  );

  // ---------------------------------------------------------------------------
  // Visualization Data (derived from results)
  // ---------------------------------------------------------------------------

  // Capacity distribution for histogram
  const capacityData = $derived(
    results.map((r) => r.capacity_mw).filter((c) => c != null && !isNaN(c))
  );

  // Start year data for sparkline (count by year)
  const startYearData = $derived.by(() => {
    const years = results
      .map((r) => r.start_year)
      .filter((y) => y != null && !isNaN(y) && y > 1900 && y < 2100);

    if (!years.length) return [];

    // Count by year
    const counts = {};
    for (const y of years) {
      counts[y] = (counts[y] || 0) + 1;
    }

    // Convert to array sorted by year
    return Object.entries(counts)
      .map(([year, count]) => ({ x: Number(year), y: count }))
      .sort((a, b) => a.x - b.x);
  });

  // Status distribution for bar chart
  const statusDistribution = $derived.by(() => {
    const counts = {};
    for (const r of results) {
      const status = r.status || 'Unknown';
      counts[status] = (counts[status] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  // Country distribution for bar chart
  const countryDistribution = $derived.by(() => {
    const counts = {};
    for (const r of results) {
      const country = r.country || 'Unknown';
      counts[country] = (counts[country] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  // Tracker distribution for bar chart
  const trackerDistribution = $derived.by(() => {
    const counts = {};
    for (const r of results) {
      const tracker = r.tracker || 'Unknown';
      counts[tracker] = (counts[tracker] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  });

  // Status color map
  const statusColors = statusColorsGranular;

  // ---------------------------------------------------------------------------
  // URL Sync
  // ---------------------------------------------------------------------------
  function syncFiltersToUrl() {
    if (!browser) return;
    const encoded = encodeFilters(filters);
    const newUrl = encoded ? `${base}/compose?${encoded}` : `${base}/compose`;
    // Use replaceState to avoid polluting history
    goto(newUrl, { replaceState: true, keepFocus: true });
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  async function loadResults(resetPage = true) {
    if (!browser) return;

    // Reset to page 1 when filters change
    if (resetPage) {
      currentPage = 1;
    }

    loading = true;
    error = null;
    const startTime = Date.now();
    const offset = (currentPage - 1) * pageSize;

    try {
      const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);
      const data = await fetchResults(whereClause, ownershipColumnNames, pageSize, offset);

      results = data.results;
      totalCount = data.totalCount;
      queryTime = Date.now() - startTime;
    } catch (err) {
      error = err.message;
      results = [];
      totalCount = 0;
    } finally {
      loading = false;
    }
  }

  function goToPage(page) {
    if (page < 1 || page > totalPages || page === currentPage) return;
    currentPage = page;
    loadResults(false); // Don't reset page since we're setting it explicitly
  }

  async function loadReferenceData() {
    if (!browser) return;
    loadingOptions = true;

    try {
      // Load all reference data in parallel using extracted functions
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

      ownershipColumns = cols;

      // Store base options (all possible values)
      baseCountries = countryData;
      baseOwnerCountries = ownerCountryData;
      baseOwners = ownerData;
      baseTrackers = trackerData;
      baseStatuses = statusData;

      // Initialize display options with base data
      countries = countryData;
      ownerCountries = ownerCountryData;
      owners = ownerData;
      trackerOptions = trackerData;
      statusOptions = statusData;

      capacityRange = capRange;
      startYearRange = yearRange;
      capacityHistogram = capHist;

      loadTrackerColumns();
    } catch {
      // Silently handle reference data load failure - UI will show empty options
    } finally {
      loadingOptions = false;
    }
  }

  async function loadTrackerColumns() {
    if (!browser) return;
    try {
      const trackers = trackerOptions.map((t) => t.value).filter(Boolean);
      trackerColumns = await fetchTrackerColumnInfo(trackers, ownershipColumnNames);
    } catch {
      // Silently handle - column info is optional
    }
  }

  // Update parametric counts based on current filter selection
  async function updateParametricCounts() {
    if (!browser) return;
    loadingCounts = true;

    try {
      const { widgetQuery } = await import('$lib/widgets/widget-utils');

      // Build base WHERE clause from current filters
      const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);
      const hasActiveFilter = whereClause !== '1=1';

      // If no filters, use the original counts
      if (!hasActiveFilter) {
        return;
      }

      // Run parametric count queries in parallel (all need locations join for country filtering)
      // Always update ALL facet counts when any filter is active

      // Deduplicated locations subquery - locations table has duplicate GEM.location.ID values
      // which causes JOIN multiplication. Use this subquery to get one row per location ID.
      const LOCATIONS_DEDUP = `(
        SELECT * FROM locations
        QUALIFY ROW_NUMBER() OVER (PARTITION BY "GEM.location.ID" ORDER BY "GEM.location.ID") = 1
      )`;

      const statusWhereClause = buildSqlWhereExcluding(filters, 'statuses', 'o');
      const trackerWhereClause = buildSqlWhereExcluding(filters, 'trackers', 'o');

      const [trackerResult, statusResult, countryResult, ownerCountryResult, ownerResult] =
        await Promise.all([
          // Trackers - exclude tracker filter from count
          widgetQuery(`
          SELECT o."Tracker" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${trackerWhereClause}
          GROUP BY o."Tracker"
          ORDER BY cnt DESC
        `),
          // Statuses - exclude status filter from count
          widgetQuery(`
          SELECT o."Status" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${statusWhereClause}
          GROUP BY o."Status"
          ORDER BY cnt DESC
        `),
          // Countries - exclude country filter from count
          widgetQuery(`
          SELECT l."Country.Area" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'countries', 'o')}
            AND l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
          GROUP BY l."Country.Area"
          ORDER BY cnt DESC
        `),
          // Owner countries - exclude owner country filter from count
          widgetQuery(`
          SELECT o."Owner Headquarters Country" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'ownerCountries', 'o')}
            AND o."Owner Headquarters Country" IS NOT NULL AND o."Owner Headquarters Country" != ''
          GROUP BY o."Owner Headquarters Country"
          ORDER BY cnt DESC
        `),
          // Owners - always update when any filter is active
          widgetQuery(`
          SELECT o."Owner" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'owners', 'o')}
            AND o."Owner" IS NOT NULL AND o."Owner" != ''
          GROUP BY o."Owner"
          ORDER BY cnt DESC
          LIMIT 1000
        `),
        ]);

      // Merge parametric counts into base options (keeps all options, updates counts)
      // Query failures are handled gracefully - missing data shows as 0 counts
      trackerOptions = mergeParametricCounts(baseTrackers, trackerResult.data || []);
      statusOptions = mergeParametricCounts(baseStatuses, statusResult.data || []);
      countries = mergeParametricCounts(baseCountries, countryResult.data || []);
      ownerCountries = mergeParametricCounts(baseOwnerCountries, ownerCountryResult.data || []);
      if (ownerResult.success) {
        owners = mergeParametricCounts(baseOwners, ownerResult.data || []);
      }
    } catch {
      // Silently handle - counts will remain unchanged
    } finally {
      loadingCounts = false;
    }
  }

  // Merge parametric counts into base options
  // Keeps all base options, updates counts from parametric results, sets 0 for missing
  function mergeParametricCounts(baseOptions, parametricResults) {
    const countMap = new Map();
    for (const r of parametricResults) {
      countMap.set(r.value, r.cnt);
    }
    return baseOptions.map((opt) => ({
      value: opt.value,
      count: countMap.get(opt.value) ?? 0,
    }));
  }

  // Build WHERE clause excluding a specific filter (for parametric counts)
  function buildSqlWhereExcluding(filters, excludeKey, tableAlias = '') {
    const tempFilters = { ...filters };

    // Clear the excluded filter
    if (excludeKey === 'trackers') tempFilters.trackers = [];
    else if (excludeKey === 'statuses') tempFilters.statuses = [];
    else if (excludeKey === 'countries') tempFilters.countries = [];
    else if (excludeKey === 'ownerCountries') tempFilters.ownerCountries = [];
    else if (excludeKey === 'owners') tempFilters.owners = [];

    return buildSqlWhere(tempFilters, tableAlias, ownershipColumnNames);
  }

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function clearFilters() {
    filters = emptyFilterState();
    syncFiltersToUrl();
    loadResults();
    // Reset to base counts (no need to refetch)
    trackerOptions = baseTrackers;
    statusOptions = baseStatuses;
    countries = baseCountries;
    ownerCountries = baseOwnerCountries;
    owners = baseOwners;
  }

  function removeFilter(key, value) {
    // Handle array filters (remove single value or entire array)
    if (key === 'trackers') {
      filters.trackers = value ? filters.trackers.filter((v) => v !== value) : [];
    } else if (key === 'statuses') {
      filters.statuses = value ? filters.statuses.filter((v) => v !== value) : [];
    } else if (key === 'countries') {
      filters.countries = value ? filters.countries.filter((v) => v !== value) : [];
    } else if (key === 'ownerCountries') {
      filters.ownerCountries = value ? filters.ownerCountries.filter((v) => v !== value) : [];
    } else if (key === 'owners') {
      filters.owners = value ? filters.owners.filter((v) => v !== value) : [];
    }
    // Handle range filters (clear both min and max)
    else if (key === 'capacity') {
      filters.capacityMin = null;
      filters.capacityMax = null;
    } else if (key === 'share') {
      filters.shareMin = null;
      filters.shareMax = null;
    } else if (key === 'startYear') {
      filters.startYearMin = null;
      filters.startYearMax = null;
    }
    // Handle search
    else if (key === 'search') {
      filters.search = '';
    }
  }

  function applyFilters() {
    syncFiltersToUrl();
    loadResults();
    updateParametricCounts();
  }

  async function copyShareUrl() {
    if (!browser) return;
    try {
      const fullUrl = window.location.origin + shareUrl;
      await navigator.clipboard.writeText(fullUrl);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      // Fallback: show URL in prompt if clipboard fails
      window.prompt('Copy this URL:', window.location.origin + shareUrl);
    }
  }

  function handleSavePreset() {
    if (!newPresetName.trim()) return;
    savePreset(newPresetName.trim(), { ...filters });
    presets = getPresets();
    newPresetName = '';
    showPresets = false;
  }

  function handleSaveAssetClass() {
    if (!newClassName.trim()) return;
    saveAssetClass(
      newClassName.trim(),
      newClassDescription.trim(),
      { ...filters },
      [] // tags - could add UI for this later
    );
    assetClassSaved = true;
    setTimeout(() => {
      showSaveAssetClass = false;
      newClassName = '';
      newClassDescription = '';
      assetClassSaved = false;
    }, 1500);
  }

  function handleLoadPreset(preset) {
    filters = { ...emptyFilterState(), ...preset.filters };
    showPresets = false;
    applyFilters();
  }

  function handleDeletePreset(id) {
    deletePreset(id);
    presets = getPresets();
  }

  function downloadPresetFile(preset) {
    if (!browser) return;
    const exportPreset = buildExportPreset(preset);
    const json = JSON.stringify(exportPreset, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${exportPreset.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportPreset(event) {
    if (!browser) return;
    importError = '';
    const target = /** @type {HTMLInputElement} */ (event.currentTarget);
    const file = target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      importPreset(data);
      presets = getPresets();
    } catch {
      importError = 'Failed to import preset JSON.';
    } finally {
      target.value = '';
    }
  }

  function handleRowClick(row) {
    if (!row?.asset_id) return;
    // Navigate on click
    goto(assetLink(row.asset_id));
  }

  // Tooltip state
  let tooltipPos = $state({ x: 0, y: 0 });

  function handleRowHover(row, event) {
    if (!row?.asset_id) {
      selectedAsset = null;
      return;
    }
    tooltipPos = { x: event.clientX, y: event.clientY };
    selectedAsset = {
      id: row.asset_id,
      name: row.name || row.asset_id,
      status: row.status,
      tracker: row.tracker,
      country: row.country,
      capacity: row.capacity_mw,
      owner: row.owner,
      startYear: row.start_year,
    };
  }

  function handleRowLeave() {
    selectedAsset = null;
  }

  function isRowInCart(row) {
    return row?.asset_id && cartAssetIds.has(row.asset_id);
  }

  // Add selected rows to investigation cart
  function addSelectedToCart() {
    if (selectedRows.length === 0) return;
    for (const row of selectedRows) {
      if (row.asset_id && !cartAssetIds.has(row.asset_id)) {
        investigationCart.add({
          id: row.asset_id,
          name: row.name || row.asset_id,
          type: 'asset',
        });
      }
    }
    selectedRows = [];
  }

  // Remove selected rows from investigation cart
  function removeSelectedFromCart() {
    if (selectedRows.length === 0) return;
    for (const row of selectedRows) {
      if (row.asset_id && cartAssetIds.has(row.asset_id)) {
        investigationCart.remove(row.asset_id);
      }
    }
    selectedRows = [];
  }

  // Add all results on current page to cart
  function addPageToCart() {
    for (const row of results) {
      if (row.asset_id && !cartAssetIds.has(row.asset_id)) {
        investigationCart.add({
          id: row.asset_id,
          name: row.name || row.asset_id,
          type: 'asset',
        });
      }
    }
  }

  // Remove all results on current page from cart
  function removePageFromCart() {
    for (const row of results) {
      if (row.asset_id && cartAssetIds.has(row.asset_id)) {
        investigationCart.remove(row.asset_id);
      }
    }
  }

  // Count how many selected/page items are in cart
  const selectedInCart = $derived(
    selectedRows.filter((r) => r.asset_id && cartAssetIds.has(r.asset_id)).length
  );
  const selectedNotInCart = $derived(selectedRows.length - selectedInCart);
  const pageInCart = $derived(
    results.filter((r) => r.asset_id && cartAssetIds.has(r.asset_id)).length
  );

  // Check if all rows on page are selected (to show "select all matching" option)
  const allPageSelected = $derived(results.length > 0 && selectedRows.length === results.length);

  // Fetch all matching asset IDs for "select all matching" feature
  async function fetchAllMatchingIds() {
    const { widgetQuery } = await import('$lib/widgets/widget-utils');
    const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);

    // Deduplicated locations subquery
    const LOCATIONS_DEDUP = `(
      SELECT * FROM locations
      QUALIFY ROW_NUMBER() OVER (PARTITION BY "GEM.location.ID" ORDER BY "GEM.location.ID") = 1
    )`;

    const result = await widgetQuery(`
      SELECT DISTINCT o."GEM unit ID" as asset_id, o."Project" as name
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
      LIMIT 10000
    `);

    if (result.success && result.data) {
      return result.data;
    }
    return [];
  }

  // Select all matching (Gmail-style)
  async function selectAllMatching() {
    loading = true;
    const allMatching = await fetchAllMatchingIds();
    allMatchingIds = allMatching;
    allMatchingSelected = true;
    loading = false;
  }

  // Clear "select all matching" mode
  function clearAllMatchingSelection() {
    allMatchingSelected = false;
    allMatchingIds = [];
    selectedRows = [];
  }

  // Add all matching to cart
  async function addAllMatchingToCart() {
    if (!allMatchingSelected || allMatchingIds.length === 0) return;
    for (const item of allMatchingIds) {
      if (item.asset_id && !cartAssetIds.has(item.asset_id)) {
        investigationCart.add({
          id: item.asset_id,
          name: item.name || item.asset_id,
          type: 'asset',
        });
      }
    }
    clearAllMatchingSelection();
  }

  // Remove all matching from cart
  async function removeAllMatchingFromCart() {
    if (!allMatchingSelected || allMatchingIds.length === 0) return;
    for (const item of allMatchingIds) {
      if (item.asset_id && cartAssetIds.has(item.asset_id)) {
        investigationCart.remove(item.asset_id);
      }
    }
    clearAllMatchingSelection();
  }

  // Count matching items in cart (when all matching selected)
  const allMatchingInCart = $derived(
    allMatchingSelected
      ? allMatchingIds.filter((r) => r.asset_id && cartAssetIds.has(r.asset_id)).length
      : 0
  );
  const allMatchingNotInCart = $derived(
    allMatchingSelected ? allMatchingIds.length - allMatchingInCart : 0
  );

  // ---------------------------------------------------------------------------
  // Export Functions (fetch ALL matching, not just current page)
  // ---------------------------------------------------------------------------
  let exporting = $state(false);

  async function fetchAllForExport() {
    const { widgetQuery } = await import('$lib/widgets/widget-utils');
    const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);

    const LOCATIONS_DEDUP = `(
      SELECT * FROM locations
      QUALIFY ROW_NUMBER() OVER (PARTITION BY "GEM.location.ID" ORDER BY "GEM.location.ID") = 1
    )`;

    const result = await widgetQuery(`
      SELECT DISTINCT
        o."GEM unit ID" as asset_id,
        o."Project" as name,
        o."Tracker" as tracker,
        o."Status" as status,
        l."Country.Area" as country,
        TRY_CAST(o."Capacity (MW)" AS DOUBLE) as capacity_mw,
        o."Owner" as owner,
        o."Owner GEM Entity ID" as owner_id
      FROM ownership o
      LEFT JOIN ${LOCATIONS_DEDUP} l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE ${whereClause}
      ORDER BY o."Project"
      LIMIT 50000
    `);

    return result.success ? result.data : [];
  }

  async function exportCSV() {
    exporting = true;
    try {
      const data = await fetchAllForExport();
      if (data.length === 0) return;

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
          const val = row[h];
          if (val == null) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        });
        csvRows.push(values.join(','));
      }

      downloadFile(csvRows.join('\n'), `gem-export-${Date.now()}.csv`, 'text/csv');
    } finally {
      exporting = false;
    }
  }

  async function exportJSON() {
    exporting = true;
    try {
      const data = await fetchAllForExport();
      if (data.length === 0) return;
      downloadFile(
        JSON.stringify(data, null, 2),
        `gem-export-${Date.now()}.json`,
        'application/json'
      );
    } finally {
      exporting = false;
    }
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  onMount(async () => {
    // Parse filters from URL
    const urlFilters = decodeFilters($page.url.searchParams);
    filters = urlFilters;

    // Load presets
    presets = getPresets();

    // Load reference data first (needed for column names)
    await loadReferenceData();

    // Load results
    loadResults();

    // Update parametric counts if we have URL filters
    // (Must happen AFTER loadReferenceData so ownershipColumnNames is populated)
    if (hasActiveFilters(urlFilters)) {
      await updateParametricCounts();
    }

    // Mark initial load as complete - $effect will now handle subsequent changes
    initialLoadComplete = true;
  });

  // Watch for filter changes and update results + counts in real-time.
  // Using a debounce to avoid too many queries.
  $effect(() => {
    // Track filter changes by serializing filter state (triggers effect on any change)
    // IMPORTANT: Include both OR and AND filter arrays for proper reactivity
    const _filterKey = JSON.stringify({
      trackers: filters.trackers,
      trackersAnd: filters.trackersAnd,
      statuses: filters.statuses,
      statusesAnd: filters.statusesAnd,
      countries: filters.countries,
      countriesAnd: filters.countriesAnd,
      ownerCountries: filters.ownerCountries,
      ownerCountriesAnd: filters.ownerCountriesAnd,
      owners: filters.owners,
      ownersAnd: filters.ownersAnd,
      capacityMin: filters.capacityMin,
      capacityMax: filters.capacityMax,
      shareMin: filters.shareMin,
      shareMax: filters.shareMax,
      startYearMin: filters.startYearMin,
      startYearMax: filters.startYearMax,
      search: filters.search,
    });

    // Skip effect during initial load (onMount handles that)
    if (!initialLoadComplete) {
      return;
    }

    // Debounce the update
    const timeout = setTimeout(() => {
      syncFiltersToUrl();
      loadResults();
      updateParametricCounts();
    }, 600);

    // Cleanup function to prevent memory leaks
    return () => clearTimeout(timeout);
  });
</script>

<svelte:head>
  <title>Filter Composer — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <span class="page-type">Tool</span>
  </header>

  <div class="composer-layout">
    <!-- Sidebar: Filter Controls -->
    <aside class="filter-panel">
      <div class="panel-header">
        <h2>Filters</h2>
        {#if hasFilters}
          <button class="clear-btn" onclick={clearFilters}>Clear all</button>
        {/if}
      </div>

      <a href="{base}/coal-tracker" class="asset-classes-link"> Browse Coal Tracker queries → </a>

      {#if loadingOptions}
        <div class="loading-options">Loading filter options...</div>
      {:else}
        <div class="filter-logic-hint">
          Within each filter: <strong>any</strong> match
          <span class="hint-example">(Coal OR Gas)</span><br />
          Across filters: <strong>all</strong> must match
          <span class="hint-example">(Coal plants IN China)</span>
        </div>

        <!-- Trackers -->
        <FacetedFilter
          options={trackerOptions}
          bind:selected={filters.trackers}
          bind:selectedAnd={filters.trackersAnd}
          label="Tracker Type"
          initialVisible={10}
          loading={loadingCounts}
        />

        <!-- Status -->
        <FacetedFilter
          options={statusOptions}
          bind:selected={filters.statuses}
          bind:selectedAnd={filters.statusesAnd}
          label="Status"
          initialVisible={10}
          loading={loadingCounts}
        />

        <!-- Asset Country -->
        <FacetedFilter
          options={countries}
          bind:selected={filters.countries}
          bind:selectedAnd={filters.countriesAnd}
          label="Asset Country"
          initialVisible={5}
          searchThreshold={10}
          loading={loadingCounts}
        />

        <!-- Owner HQ Country -->
        <FacetedFilter
          options={ownerCountries}
          bind:selected={filters.ownerCountries}
          bind:selectedAnd={filters.ownerCountriesAnd}
          label="Owner Home Country"
          initialVisible={5}
          searchThreshold={10}
          loading={loadingCounts}
        />

        <!-- Owner -->
        <FacetedFilter
          options={owners}
          bind:selected={filters.owners}
          bind:selectedAnd={filters.ownersAnd}
          label="Owner"
          initialVisible={5}
          searchThreshold={10}
          loading={loadingCounts}
        />

        <!-- Capacity Range (only show if tracker has capacity data) -->
        {#if availableColumns.hasCapacity}
          <RangeSlider
            label="Capacity"
            bind:min={filters.capacityMin}
            bind:max={filters.capacityMax}
            dataMin={capacityRange.min}
            dataMax={capacityRange.max}
            step={10}
            unit=" MW"
            histogram={capacityHistogram}
          />
        {/if}

        <!-- Start Year Range (only show if tracker has start year data) -->
        {#if availableColumns.hasStartYear}
          <RangeSlider
            label="Start Year"
            bind:min={filters.startYearMin}
            bind:max={filters.startYearMax}
            dataMin={startYearRange.min}
            dataMax={startYearRange.max}
            step={1}
          />
        {/if}

        <!-- Search -->
        <section class="filter-section">
          <h3>Text Search</h3>
          <input type="text" placeholder="Project or Owner name..." bind:value={filters.search} />
        </section>
      {/if}

      <!-- Share & Presets -->
      <div class="share-section">
        <button class="share-btn" onclick={copyShareUrl}>
          {copied ? 'Copied!' : 'Copy Share Link'}
        </button>
        <button class="preset-btn" onclick={() => (showPresets = !showPresets)}>
          {showPresets ? 'Hide Presets' : 'Presets'}
        </button>
        {#if hasFilters}
          <button class="save-class-btn" onclick={() => (showSaveAssetClass = !showSaveAssetClass)}>
            Save as Asset Class
          </button>
        {/if}
      </div>

      {#if showSaveAssetClass}
        <div class="save-class-panel">
          {#if assetClassSaved}
            <p class="save-success">
              Saved! View in <a href="{base}/coal-tracker">Coal Tracker</a>
            </p>
          {:else}
            <input
              type="text"
              placeholder="Class name (e.g., South Asian Coal)"
              bind:value={newClassName}
            />
            <input
              type="text"
              placeholder="Description (optional)"
              bind:value={newClassDescription}
            />
            <button onclick={handleSaveAssetClass} disabled={!newClassName.trim()}>
              Save Asset Class
            </button>
          {/if}
        </div>
      {/if}

      {#if showPresets}
        <div class="presets-panel">
          <h4>Saved Presets</h4>
          {#if presets.length === 0}
            <p class="no-presets">No saved presets</p>
          {:else}
            <ul class="preset-list">
              {#each presets as preset}
                <li>
                  <button class="preset-name" onclick={() => handleLoadPreset(preset)}>
                    {preset.name}
                  </button>
                  <button class="preset-export" onclick={() => downloadPresetFile(preset)}>
                    Export
                  </button>
                  <button class="preset-delete" onclick={() => handleDeletePreset(preset.id)}>
                    ×
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="save-preset">
            <input
              type="text"
              placeholder="Preset name..."
              bind:value={newPresetName}
              onkeydown={(e) => e.key === 'Enter' && handleSavePreset()}
            />
            <button onclick={handleSavePreset}>Save</button>
          </div>
          <div class="preset-io">
            <label class="import-btn">
              Import JSON
              <input type="file" accept="application/json" onchange={handleImportPreset} />
            </label>
            <a class="preset-link" href={link('presets')}>View featured presets</a>
          </div>
          {#if importError}
            <p class="import-error">{importError}</p>
          {/if}
        </div>
      {/if}
    </aside>

    <!-- Main: Results -->
    <section class="results-panel">
      <div class="results-header">
        <h1>Filtered Assets</h1>
        <div class="results-actions">
          {#if allMatchingSelected}
            <!-- All matching selected mode -->
            <span class="selection-count">{allMatchingIds.length.toLocaleString()} selected</span>
            {#if allMatchingNotInCart > 0}
              <button class="cart-btn add" onclick={addAllMatchingToCart}>
                Add all to investigation
              </button>
            {/if}
            {#if allMatchingInCart > 0}
              <button class="cart-btn remove" onclick={removeAllMatchingFromCart}>
                Remove {allMatchingInCart.toLocaleString()} from investigation
              </button>
            {/if}
            <button class="cart-btn text" onclick={clearAllMatchingSelection}> Cancel </button>
          {:else if selectedRows.length > 0}
            <span class="selection-count">{selectedRows.length} selected</span>
            {#if selectedNotInCart > 0}
              <button class="cart-btn add" onclick={addSelectedToCart}>
                Add to investigation
              </button>
            {/if}
            {#if selectedInCart > 0}
              <button class="cart-btn remove" onclick={removeSelectedFromCart}>
                Remove from investigation
              </button>
            {/if}
          {:else if results.length > 0 && !loading}
            <span class="selection-hint">Select rows or:</span>
            <button
              class="cart-btn secondary"
              onclick={addPageToCart}
              disabled={pageInCart === results.length}
            >
              Add this page ({results.length - pageInCart} new)
            </button>
            {#if pageInCart > 0}
              <button class="cart-btn text remove" onclick={removePageFromCart}>
                Remove {pageInCart} in investigation
              </button>
            {/if}
          {/if}
        </div>
        <div class="results-meta">
          {#if loading}
            <span class="loading-text">Loading...</span>
          {:else}
            <span class="result-count">{formatCount(totalCount)} results</span>
            <span class="query-time">{queryTime}ms</span>
          {/if}
        </div>
        <div class="export-actions">
          <span class="export-label">Export all {formatCount(totalCount)}:</span>
          <button class="export-btn" onclick={exportCSV} disabled={exporting || totalCount === 0}>
            {exporting ? 'Exporting...' : 'CSV'}
          </button>
          <button class="export-btn" onclick={exportJSON} disabled={exporting || totalCount === 0}>
            JSON
          </button>
        </div>
      </div>

      {#if hasFilters}
        <FilterBreadcrumbs {filters} onRemove={removeFilter} />
      {/if}

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      <!-- Visualization Dashboard (compact) - always visible with skeleton states -->
      <div class="viz-dashboard" class:loading>
        <div class="viz-row">
          <!-- Status Distribution -->
          <div class="viz-card">
            {#if loading || !initialLoadComplete || results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 80%"></div>
                  <div class="skeleton-bar" style="width: 60%"></div>
                  <div class="skeleton-bar" style="width: 40%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={statusDistribution}
                label="Status"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                colorMap={statusColors}
                compact
              />
            {/if}
          </div>

          <!-- Tracker Distribution -->
          <div class="viz-card">
            {#if loading || !initialLoadComplete || results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 90%"></div>
                  <div class="skeleton-bar" style="width: 50%"></div>
                  <div class="skeleton-bar" style="width: 30%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={trackerDistribution}
                label="Tracker"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                compact
              />
            {/if}
          </div>

          <!-- Country Distribution -->
          <div class="viz-card">
            {#if loading || !initialLoadComplete || results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-bars">
                  <div class="skeleton-bar" style="width: 70%"></div>
                  <div class="skeleton-bar" style="width: 55%"></div>
                  <div class="skeleton-bar" style="width: 45%"></div>
                </div>
              </div>
            {:else}
              <MiniBarChart
                data={countryDistribution}
                label="Countries"
                maxItems={4}
                width={120}
                barHeight={10}
                gap={2}
                compact
              />
            {/if}
          </div>

          <!-- Capacity Histogram -->
          <div class="viz-card">
            {#if loading || !initialLoadComplete || results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-histogram">
                  <div class="skeleton-hist-bar" style="height: 40%"></div>
                  <div class="skeleton-hist-bar" style="height: 70%"></div>
                  <div class="skeleton-hist-bar" style="height: 100%"></div>
                  <div class="skeleton-hist-bar" style="height: 80%"></div>
                  <div class="skeleton-hist-bar" style="height: 50%"></div>
                  <div class="skeleton-hist-bar" style="height: 30%"></div>
                </div>
              </div>
            {:else if capacityData.length > 0}
              <MiniHistogram
                data={capacityData}
                label="Capacity"
                unit="MW"
                bins={8}
                width={120}
                height={36}
                showAxis={false}
                compact
              />
            {/if}
          </div>

          <!-- Start Year Sparkline -->
          <div class="viz-card">
            {#if loading || !initialLoadComplete || results.length === 0}
              <div class="skeleton-chart">
                <div class="skeleton-label"></div>
                <div class="skeleton-sparkline"></div>
              </div>
            {:else if startYearData.length > 1}
              <Sparkline data={startYearData} label="Start Year" width={120} height={32} compact />
            {/if}
          </div>
        </div>
      </div>

      <!-- Table with skeleton loading state -->
      {#if loading || !initialLoadComplete}
        <div class="skeleton-table">
          <div class="skeleton-table-header">
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
            <div class="skeleton-th"></div>
          </div>
          {#each Array(8) as _, i}
            <div class="skeleton-table-row" style="animation-delay: {i * 0.05}s">
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
              <div class="skeleton-td"></div>
            </div>
          {/each}
        </div>
      {:else if results.length > 0}
        <!-- Gmail-style "select all matching" banner -->
        {#if allPageSelected && !allMatchingSelected && totalCount > results.length}
          <div class="select-all-banner">
            All {results.length} assets on this page selected.
            <button onclick={selectAllMatching}>
              Select all {totalCount.toLocaleString()} that match your filters?
            </button>
          </div>
        {/if}
        {#if allMatchingSelected}
          <div class="select-all-banner selected">
            <strong>{allMatchingIds.length.toLocaleString()} assets</strong> matching your filters
            are selected.
            <button onclick={clearAllMatchingSelection}>Clear</button>
          </div>
        {/if}

        <DataTable
          columns={tableColumns}
          data={tableRows}
          {pageSize}
          showGlobalSearch={true}
          showColumnFilters={true}
          showPagination={false}
          showExport={false}
          showColumnToggle={true}
          showSelection={true}
          bind:selectedRows
          stickyHeader={true}
          striped={true}
          onRowClick={handleRowClick}
          onRowHover={handleRowHover}
          onRowLeave={handleRowLeave}
          highlightRow={isRowInCart}
        />

        <!-- Server-side pagination -->
        <div class="pagination">
          <div class="pagination-info">
            Showing {((currentPage - 1) * pageSize + 1).toLocaleString()}–{Math.min(
              currentPage * pageSize,
              totalCount
            ).toLocaleString()} of {totalCount.toLocaleString()} results
          </div>
          <div class="pagination-controls">
            <button
              class="page-btn"
              disabled={currentPage === 1 || loading}
              onclick={() => goToPage(1)}
              title="First page"
            >
              ««
            </button>
            <button
              class="page-btn"
              disabled={currentPage === 1 || loading}
              onclick={() => goToPage(currentPage - 1)}
              title="Previous page"
            >
              «
            </button>
            <span class="page-indicator">
              Page {currentPage} of {totalPages.toLocaleString()}
            </span>
            <button
              class="page-btn"
              disabled={currentPage >= totalPages || loading}
              onclick={() => goToPage(currentPage + 1)}
              title="Next page"
            >
              »
            </button>
            <button
              class="page-btn"
              disabled={currentPage >= totalPages || loading}
              onclick={() => goToPage(totalPages)}
              title="Last page"
            >
              »»
            </button>
          </div>
        </div>
      {:else}
        <div class="no-results">
          {#if hasFilters}
            <p>No assets match your filters.</p>
            <button onclick={clearFilters}>Clear filters</button>
          {:else}
            <p>Select filters to search assets.</p>
          {/if}
        </div>
      {/if}
    </section>
  </div>

  <!-- Asset Tooltip -->
  {#if selectedAsset}
    <div
      class="asset-tooltip"
      style="left: {Math.min(tooltipPos.x + 12, window.innerWidth - 340)}px; top: {Math.min(
        tooltipPos.y - 10,
        window.innerHeight - 200
      )}px;"
    >
      {#if cartAssetIds.has(selectedAsset.id)}
        <div class="tooltip-header">
          <span class="in-cart-badge" title="In your investigation">In Cart</span>
        </div>
      {/if}
      <ProjectCard
        asset={{
          id: selectedAsset.id,
          name: selectedAsset.name,
          status: selectedAsset.status,
          country: selectedAsset.country,
          capacity: selectedAsset.capacity,
          owner: selectedAsset.owner,
          startYear: selectedAsset.startYear,
          tracker: selectedAsset.tracker,
        }}
        variant="compact"
        open={true}
        showLink={false}
      />
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-2) var(--space-4);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .page-type {
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  /* Layout - App-style with fixed sidebar */
  .composer-layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 768px) {
    .composer-layout {
      grid-template-columns: 1fr;
    }

    .filter-panel {
      order: 1;
      max-height: none;
      border-right: none;
      border-bottom: var(--border-width) solid var(--color-border);
    }

    .results-panel {
      order: 2;
    }
  }

  /* Filter Panel - Fixed sidebar */
  .filter-panel {
    padding: var(--space-2) var(--space-2);
    height: calc(100vh - 45px);
    overflow-y: auto;
    position: sticky;
    top: 45px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
    padding-bottom: var(--space-1);
  }

  .panel-header h2 {
    margin: 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .clear-btn {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  .clear-btn:hover {
    text-decoration: underline;
  }

  .asset-classes-link {
    display: block;
    font-size: 11px;
    color: var(--color-gray-600);
    text-decoration: none;
    padding: 8px 10px;
    margin-bottom: 12px;
    background: var(--color-gray-50);
    border: 1px dashed var(--color-border);
  }

  .asset-classes-link:hover {
    background: var(--color-gray-100);
    border-style: solid;
  }

  .filter-logic-hint {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    padding: var(--space-2) var(--space-2);
    margin-bottom: var(--space-3);
    background: var(--color-gray-50);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
    line-height: var(--leading-normal);
  }

  .hint-example {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .filter-logic-hint strong {
    color: var(--color-text-primary);
    font-weight: 600;
  }

  .filter-section {
    margin-bottom: var(--space-2);
  }

  .filter-section h3 {
    font-size: var(--font-size-base);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-1) 0;
  }

  .loading-options {
    padding: var(--space-4);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  /* Search */
  .filter-section input[type='text'] {
    width: 100%;
    padding: var(--space-1);
    font-size: var(--font-size-sm);
    border: var(--border-width) solid var(--color-border);
  }

  /* Share Section */
  .share-section {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .share-btn,
  .preset-btn {
    flex: 1;
    padding: var(--space-1);
    font-size: var(--font-size-base);
    background: transparent;
    border: var(--border-width) solid transparent;
    cursor: pointer;
  }

  .share-btn:hover,
  .preset-btn:hover {
    text-decoration: underline;
  }

  .save-class-btn {
    flex: 1;
    padding: var(--space-1);
    font-size: var(--font-size-base);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  .save-class-btn:hover {
    opacity: 0.85;
  }

  /* Save Asset Class Panel */
  .save-class-panel {
    margin-top: var(--space-2);
    padding: var(--space-3);
    background: var(--color-gray-50);
    border: var(--border-width) solid var(--color-border);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .save-class-panel input {
    padding: var(--space-2);
    font-size: var(--font-size-body);
    border: var(--border-width) solid var(--color-border);
  }

  .save-class-panel button {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .save-class-panel button:disabled {
    background: var(--color-gray-300);
    cursor: not-allowed;
  }

  .save-success {
    font-size: var(--font-size-body);
    color: var(--color-success);
    margin: 0;
  }

  .save-success a {
    color: inherit;
    font-weight: 600;
  }

  /* Presets Panel */
  .presets-panel {
    margin-top: var(--space-2);
    padding: var(--space-2);
  }

  .presets-panel h4 {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    text-transform: uppercase;
  }

  .no-presets {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .preset-list {
    list-style: none;
    margin: 0 0 var(--space-3) 0;
    padding: 0;
  }

  .preset-list li {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) 0;
  }

  .preset-name {
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
    flex: 1;
    text-decoration: underline;
    text-decoration-color: transparent;
  }

  .preset-name:hover {
    text-decoration-color: currentColor;
  }

  .preset-export {
    font-size: var(--font-size-base);
    padding: 3px 5px;
    border: var(--border-width) solid transparent;
    background: transparent;
    cursor: pointer;
  }

  .preset-export:hover {
    text-decoration: underline;
  }

  .preset-delete {
    background: none;
    border: none;
    font-size: var(--font-size-lg);
    color: var(--color-text-tertiary);
    cursor: pointer;
  }

  .preset-delete:hover {
    color: var(--color-error);
  }

  .save-preset {
    display: flex;
    gap: var(--space-1);
  }

  .save-preset input {
    flex: 1;
    padding: 5px;
    font-size: var(--font-size-base);
    border: var(--border-width) solid var(--color-border);
  }

  .save-preset button {
    padding: 5px var(--space-2);
    font-size: var(--font-size-base);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  .preset-io {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .import-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-base);
    border: var(--border-width) solid transparent;
    padding: 5px var(--space-2);
    cursor: pointer;
    background: transparent;
  }

  .import-btn input {
    display: none;
  }

  .preset-link {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    text-decoration: underline;
  }

  .import-error {
    margin-top: var(--space-1);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  /* Results Panel */
  .results-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2);
    overflow-y: auto;
    height: calc(100vh - 45px);
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0;
  }

  .results-header h1 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  .results-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
  }

  .selection-count {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-black);
    background: var(--color-info-bg);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }

  .selection-hint {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }

  .cart-btn {
    padding: 5px var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    background: transparent;
    color: var(--color-black);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .cart-btn:hover:not(:disabled) {
    border-color: var(--color-black);
  }

  .cart-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cart-btn.add {
    background: var(--color-black);
    color: var(--color-white);
    border-color: var(--color-black);
  }

  .cart-btn.add:hover {
    background: var(--color-gray-800);
  }

  .cart-btn.secondary {
    background: transparent;
    color: var(--color-black);
  }

  .cart-btn.secondary:hover:not(:disabled) {
    background: var(--color-gray-100);
  }

  .cart-btn.text {
    background: transparent;
    border-color: transparent;
    padding: 5px var(--space-2);
  }

  .cart-btn.text:hover {
    text-decoration: underline;
    border-color: transparent;
  }

  .cart-btn.remove {
    color: var(--color-error);
    border-color: var(--color-error);
    background: transparent;
  }

  .cart-btn.remove:hover {
    background: var(--color-error-bg);
  }

  .cart-btn.text.remove {
    border-color: transparent;
  }

  /* Gmail-style select all banner */
  .select-all-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-warning-bg);
    border: var(--border-width) solid var(--color-warning);
    font-size: var(--font-size-sm);
    color: var(--color-warning-text);
  }

  .select-all-banner.selected {
    background: var(--color-info-bg);
    border-color: var(--color-info);
    color: var(--color-info-text);
  }

  .select-all-banner button {
    background: none;
    border: none;
    color: var(--color-link);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .select-all-banner button:hover {
    color: var(--color-link-hover);
  }

  .export-actions {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }

  .export-label {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }

  .export-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-base);
    background: transparent;
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: var(--transition-fast);
  }

  .export-btn:hover:not(:disabled) {
    background: var(--color-gray-100);
  }

  .export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .results-meta {
    display: flex;
    gap: var(--space-1);
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }

  .loading-text {
    color: var(--color-text-tertiary);
  }

  .query-time {
    color: var(--color-text-tertiary);
  }

  .error-message {
    padding: var(--space-2);
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-2);
    font-size: var(--font-size-sm);
  }

  .pagination-info {
    color: var(--color-text-secondary);
  }

  .pagination-controls {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .page-btn {
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
    background: transparent;
    border: var(--border-width) solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-family: inherit;
  }

  .page-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-indicator {
    padding: 0 var(--space-2);
    color: var(--color-text-primary);
    font-variant-numeric: tabular-nums;
  }

  /* No Results */
  .no-results {
    text-align: center;
    padding: var(--space-10) var(--space-5);
    color: var(--color-text-secondary);
  }

  .no-results p {
    margin: 0 0 var(--space-3) 0;
    font-size: var(--font-size-body);
  }

  .no-results button {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    background: var(--color-black);
    color: var(--color-white);
    border: none;
    cursor: pointer;
  }

  /* Visualization Dashboard - Compact */
  .viz-dashboard {
    margin-bottom: 6px;
    padding: 4px;
    transition: opacity 0.2s ease;
  }

  .viz-dashboard.loading {
    opacity: 0.7;
  }

  .viz-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: stretch;
  }

  .viz-card {
    flex: 1 1 140px;
    min-width: 140px;
    max-width: 180px;
    padding: 6px 8px;
    transition: opacity 0.15s ease;
  }

  /* Skeleton loading styles */
  .skeleton-chart {
    min-height: 50px;
  }

  .skeleton-label {
    width: 50px;
    height: var(--space-2);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-2);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bars {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .skeleton-bar {
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: 1px;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-bar:nth-child(2) {
    animation-delay: 0.1s;
  }
  .skeleton-bar:nth-child(3) {
    animation-delay: 0.2s;
  }

  .skeleton-histogram {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: var(--space-9);
  }

  .skeleton-hist-bar {
    flex: 1;
    background: var(--color-gray-100);
    border-radius: 1px 1px 0 0;
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-hist-bar:nth-child(2) {
    animation-delay: 0.05s;
  }
  .skeleton-hist-bar:nth-child(3) {
    animation-delay: 0.1s;
  }
  .skeleton-hist-bar:nth-child(4) {
    animation-delay: 0.15s;
  }
  .skeleton-hist-bar:nth-child(5) {
    animation-delay: 0.2s;
  }
  .skeleton-hist-bar:nth-child(6) {
    animation-delay: 0.25s;
  }

  .skeleton-sparkline {
    height: var(--space-8);
    background: linear-gradient(
      90deg,
      var(--color-gray-100) 0%,
      var(--color-gray-50) 50%,
      var(--color-gray-100) 100%
    );
    background-size: 200% 100%;
    border-radius: var(--radius-sm);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes skeleton-shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  /* Skeleton Table */
  .skeleton-table-header {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
  }

  .skeleton-th {
    flex: 1;
    height: var(--space-3);
    background: var(--color-gray-200);
    border-radius: var(--radius-sm);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-th:nth-child(1) {
    flex: 2;
  }
  .skeleton-th:nth-child(2) {
    flex: 1.5;
  }

  .skeleton-table-row {
    display: flex;
    gap: 1px;
    padding: var(--space-2) var(--space-3);
    animation: skeleton-pulse 1.2s ease-in-out infinite;
  }

  .skeleton-table-row:nth-child(even) {
    background: transparent;
  }

  .skeleton-td {
    flex: 1;
    height: var(--space-2);
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
  }

  .skeleton-td:nth-child(1) {
    flex: 2;
  }
  .skeleton-td:nth-child(2) {
    flex: 1.5;
  }

  @media (max-width: 768px) {
    .viz-row {
      flex-direction: column;
    }

    .viz-card {
      max-width: none;
      width: 100%;
    }
  }

  /* DataTable compact overrides - even tighter */
  .results-panel :global(.data-table-container) {
    border: 0;
  }

  .results-panel :global(.data-table) {
    font-size: 11px;
    table-layout: fixed;
  }

  .results-panel :global(.data-table th),
  .results-panel :global(.data-table td) {
    padding: 4px 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
    line-height: 1.3;
  }

  .results-panel :global(.data-table th) {
    font-size: 9px;
  }

  .results-panel :global(.data-table td:first-child) {
    max-width: 280px;
    font-weight: 500;
  }

  .results-panel :global(.data-table tr) {
    height: 28px;
  }

  .results-panel :global(.data-table-controls) {
    padding: 4px 6px;
    gap: 4px;
  }

  .results-panel :global(.data-table-controls input) {
    padding: 4px 6px;
    font-size: 10px;
  }

  .results-panel :global(.data-table-controls button) {
    padding: 3px 8px;
    font-size: 9px;
  }

  /* Asset Tooltip */
  .asset-tooltip {
    position: fixed;
    z-index: 1000;
    max-width: 320px;
    pointer-events: none;
    animation: tooltipFadeIn 0.15s ease-out;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 12px;
    padding: 4px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.6);
  }

  .asset-tooltip :global(.project-card) {
    background: transparent;
    border: none;
    box-shadow: none;
  }

  .asset-tooltip :global(.project-card summary) {
    background: transparent;
  }

  .asset-tooltip :global(.details-section) {
    background: transparent;
  }

  @keyframes tooltipFadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 4px;
    gap: 8px;
  }

  .in-cart-badge {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    padding: 3px var(--space-1);
    background: linear-gradient(90deg, var(--color-warning) 0%, var(--color-warning-light) 100%);
    color: var(--color-black);
    border-radius: var(--radius-sm);
  }
</style>
