<script>
  /**
   * FILTER COMPOSER PAGE
   *
   * Build custom filtered views of the GEM ownership data.
   * Filters are encoded in the URL for easy sharing.
   *
   * URL Format:
   *   /compose?trackers=Coal+Plant,Gas+Plant&statuses=operating&capacityMin=100
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { browser } from '$app/environment';

  import { assetLink } from '$lib/links';
  import { formatCount, formatCompact } from '$lib/format';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import MiniHistogram from '$lib/components/MiniHistogram.svelte';
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MiniBarChart from '$lib/components/MiniBarChart.svelte';
  import DataTable from '$lib/components/DataTable.svelte';

  import {
    emptyFilterState,
    decodeFilters,
    encodeFilters,
    buildShareUrl,
    hasActiveFilters,
    countActiveFilters,
    buildSqlWhere,
    getPresets,
    savePreset,
    deletePreset,
  } from '$lib/filter-state';

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  let filters = $state(emptyFilterState());
  let results = $state([]);
  let totalCount = $state(0);
  let loading = $state(false);
  let loadingOptions = $state(true);
  let error = $state(null);

  // Reference data populated from parquet (static lists) - reserved for future use
  let _allCountries = $state([]);
  let _allOwnerCountries = $state([]);
  let _allOwners = $state([]);

  // Parametric counts (update based on current filters)
  let countries = $state([]);
  let ownerCountries = $state([]);
  let owners = $state([]);
  let trackerOptions = $state([]);
  let statusOptions = $state([]);
  let schema = $state([]);
  let ownershipColumns = $state([]);

  // Tracker-specific column availability
  // Maps tracker name -> { hasCapacity, hasStartYear, hasShare }
  let trackerColumns = $state({});

  let presets = $state([]);
  let showPresets = $state(false);
  let newPresetName = $state('');
  let copied = $state(false);
  let queryTime = $state(0);

  // Owner search
  let ownerSearch = $state('');

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const shareUrl = $derived(buildShareUrl(filters));
  const activeFilterCount = $derived(countActiveFilters(filters));
  const hasFilters = $derived(hasActiveFilters(filters));
  const filteredOwners = $derived(
    ownerSearch.length < 2
      ? owners.slice(0, 50)
      : owners.filter((o) => o.toLowerCase().includes(ownerSearch.toLowerCase())).slice(0, 100)
  );

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

  const tableColumns = $derived.by(() => {
    const baseColumns = [
      { key: 'name', label: 'Asset', sortable: true, filterable: true },
      { key: 'asset_id', label: 'Asset ID', sortable: true, filterable: true },
      { key: 'tracker', label: 'Tracker', sortable: true, filterable: true },
      { key: 'status', label: 'Status', sortable: true, filterable: true },
      { key: 'country', label: 'Country', sortable: true, filterable: true },
    ];

    if (availableColumns.hasCapacity) {
      baseColumns.push({
        key: 'capacity_mw',
        label: 'Capacity (MW)',
        sortable: true,
        filterable: true,
        type: 'number',
      });
    }

    baseColumns.push(
      { key: 'owner', label: 'Owner', sortable: true, filterable: true },
      { key: 'owner_id', label: 'Owner ID', sortable: true, filterable: true }
    );

    return baseColumns;
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
  const statusColors = {
    operating: '#22c55e',
    proposed: '#3b82f6',
    construction: '#f59e0b',
    retired: '#6b7280',
    cancelled: '#ef4444',
    shelved: '#8b5cf6',
    mothballed: '#64748b',
  };

  // ---------------------------------------------------------------------------
  // URL Sync
  // ---------------------------------------------------------------------------
  function syncFiltersToUrl() {
    if (!browser) return;
    const encoded = encodeFilters(filters);
    const newUrl = encoded ? `/compose?${encoded}` : '/compose';
    // Use replaceState to avoid polluting history
    goto(newUrl, { replaceState: true, keepFocus: true });
  }

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  async function ensureOwnershipColumns() {
    if (!browser || ownershipColumns.length > 0) return;

    try {
      const { widgetQuery, initWidgetDB } = await import('$lib/widgets/widget-utils');
      await initWidgetDB();

      const schemaResult = await widgetQuery(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'ownership'
        ORDER BY ordinal_position
      `);

      ownershipColumns = (schemaResult.data || []).map((r) => r.column_name).filter(Boolean);
    } catch (err) {
      console.error('[Compose] Failed to load ownership column list:', err);
    }
  }

  async function loadResults() {
    if (!browser) return;

    loading = true;
    error = null;
    const startTime = Date.now();

    try {
      const { widgetQuery, initWidgetDB } = await import('$lib/widgets/widget-utils');
      await initWidgetDB();

      await ensureOwnershipColumns();
      const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);
      console.log('[Compose] Running query with WHERE:', whereClause);

      // Get total count (join with locations for country filtering)
      const countResult = await widgetQuery(`
        SELECT COUNT(*) as cnt
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
      `);

      if (!countResult.success) {
        throw new Error(countResult.error || 'Count query failed');
      }
      totalCount = Number(countResult.data?.[0]?.cnt || 0);
      console.log('[Compose] Total count:', totalCount);

      // Get paginated results (join with locations for country)
      const capacitySelect = ownershipColumnNames.capacity
        ? `CAST(o."${ownershipColumnNames.capacity}" AS DOUBLE) as capacity_mw`
        : 'NULL::DOUBLE as capacity_mw';
      const startYearSelect = ownershipColumnNames.startYear
        ? `CAST(o."${ownershipColumnNames.startYear}" AS INTEGER) as start_year`
        : 'NULL::INTEGER as start_year';

      const dataResult = await widgetQuery(`
        SELECT DISTINCT
          o."GEM unit ID" as asset_id,
          o."Project" as name,
          o."Tracker" as tracker,
          o."Status" as status,
          l."Country.Area" as country,
          ${capacitySelect},
          ${startYearSelect},
          o."Owner" as owner,
          o."Owner GEM Entity ID" as owner_id
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE ${whereClause}
        ORDER BY capacity_mw DESC NULLS LAST
        LIMIT 500
      `);

      if (!dataResult.success) {
        throw new Error(dataResult.error || 'Data query failed');
      }

      results = dataResult.data || [];
      queryTime = Date.now() - startTime;
      console.log('[Compose] Loaded', results.length, 'results in', queryTime, 'ms');
    } catch (err) {
      console.error('[Compose] Query error:', err);
      error = err.message;
      results = [];
      totalCount = 0;
    } finally {
      loading = false;
    }
  }

  async function loadReferenceData() {
    if (!browser) return;
    loadingOptions = true;

    try {
      const { widgetQuery, initWidgetDB } = await import('$lib/widgets/widget-utils');
      await initWidgetDB();

      // Load all reference data in parallel
      const [
        countryResult,
        ownerCountryResult,
        ownerResult,
        trackerResult,
        statusResult,
        schemaResult,
      ] = await Promise.all([
        // Asset countries (from locations table)
        widgetQuery(`
          SELECT l."Country.Area" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
          GROUP BY l."Country.Area"
          ORDER BY cnt DESC
        `),
        // Owner HQ countries
        widgetQuery(`
          SELECT DISTINCT "Owner Headquarters Country" as value, COUNT(*) as cnt
          FROM ownership
          WHERE "Owner Headquarters Country" IS NOT NULL AND "Owner Headquarters Country" != ''
          GROUP BY "Owner Headquarters Country"
          ORDER BY cnt DESC
        `),
        // Owners (top 1000 by asset count)
        widgetQuery(`
          SELECT DISTINCT "Owner" as value, COUNT(*) as cnt
          FROM ownership
          WHERE "Owner" IS NOT NULL AND "Owner" != ''
          GROUP BY "Owner"
          ORDER BY cnt DESC
          LIMIT 1000
        `),
        // Trackers
        widgetQuery(`
          SELECT DISTINCT "Tracker" as value, COUNT(*) as cnt
          FROM ownership
          WHERE "Tracker" IS NOT NULL
          GROUP BY "Tracker"
          ORDER BY cnt DESC
        `),
        // Statuses
        widgetQuery(`
          SELECT DISTINCT "Status" as value, COUNT(*) as cnt
          FROM ownership
          WHERE "Status" IS NOT NULL
          GROUP BY "Status"
          ORDER BY cnt DESC
        `),
        // Schema
        widgetQuery(`
          SELECT column_name, data_type
          FROM information_schema.columns
          WHERE table_name = 'ownership'
          ORDER BY ordinal_position
        `),
      ]);

      countries = (countryResult.data || []).map((r) => r.value).filter(Boolean);
      ownerCountries = (ownerCountryResult.data || []).map((r) => r.value).filter(Boolean);
      owners = (ownerResult.data || []).map((r) => r.value).filter(Boolean);
      trackerOptions = (trackerResult.data || []).map((r) => ({ value: r.value, count: r.cnt }));
      statusOptions = (statusResult.data || []).map((r) => ({ value: r.value, count: r.cnt }));
      schema = schemaResult.data || [];
      ownershipColumns = (schemaResult.data || []).map((r) => r.column_name).filter(Boolean);

      // Store static lists for reference
      _allCountries = [...countries];
      _allOwnerCountries = [...ownerCountries];
      _allOwners = [...owners];

      console.log('[Compose] Loaded reference data:', {
        countries: countries.length,
        ownerCountries: ownerCountries.length,
        owners: owners.length,
        trackers: trackerOptions.length,
        statuses: statusOptions.length,
        schema: schema.length,
      });

      // Load tracker-specific column availability in background
      loadTrackerColumns();
    } catch (err) {
      console.error('[Compose] Failed to load reference data:', err);
    } finally {
      loadingOptions = false;
    }
  }

  // Load tracker-specific column availability (which columns have data per tracker)
  async function loadTrackerColumns() {
    if (!browser) return;

    try {
      const { widgetQuery } = await import('$lib/widgets/widget-utils');
      await ensureOwnershipColumns();
      const columnNames = ownershipColumnNames;

      // Get all unique trackers
      const trackers = trackerOptions.map((t) => t.value).filter(Boolean);

      // Query column availability for each tracker
      const columnInfo = {};

      for (const tracker of trackers) {
        const escapedTracker = tracker.replace(/'/g, "''");
        const capacitySelect = columnNames.capacity
          ? `COUNT(CASE WHEN o."${columnNames.capacity}" IS NOT NULL AND o."${columnNames.capacity}" != '' THEN 1 END) as has_capacity`
          : '0 as has_capacity';
        const startYearSelect = columnNames.startYear
          ? `COUNT(CASE WHEN o."${columnNames.startYear}" IS NOT NULL AND o."${columnNames.startYear}" != '' THEN 1 END) as has_start_year`
          : '0 as has_start_year';
        const shareSelect = columnNames.share
          ? `COUNT(CASE WHEN o."${columnNames.share}" IS NOT NULL THEN 1 END) as has_share`
          : '0 as has_share';

        // Check which columns have non-null data for this tracker
        const result = await widgetQuery(`
          SELECT
            ${capacitySelect},
            ${startYearSelect},
            ${shareSelect}
          FROM ownership o
          WHERE o."Tracker" = '${escapedTracker}'
        `);

        if (result.success && result.data?.[0]) {
          const row = result.data[0];
          columnInfo[tracker] = {
            hasCapacity: Number(row.has_capacity) > 0,
            hasStartYear: Number(row.has_start_year) > 0,
            hasShare: Number(row.has_share) > 0,
          };
        }
      }

      trackerColumns = columnInfo;
      console.log('[Compose] Loaded tracker column info:', trackerColumns);
    } catch (err) {
      console.error('[Compose] Failed to load tracker columns:', err);
    }
  }

  // Update parametric counts based on current filter selection
  async function updateParametricCounts() {
    if (!browser) return;

    try {
      const { widgetQuery } = await import('$lib/widgets/widget-utils');

      // Build base WHERE clause from current filters
      const whereClause = buildSqlWhere(filters, 'o', ownershipColumnNames);
      const hasActiveFilter = whereClause !== '1=1';

      // If no filters, use the original counts
      if (!hasActiveFilter) {
        console.log('[Compose] No active filters, skipping parametric count update');
        return;
      }

      console.log('[Compose] Updating parametric counts...');

      // Run parametric count queries in parallel (all need locations join for country filtering)
      const [trackerResult, statusResult, countryResult, ownerCountryResult] = await Promise.all([
        // Trackers - exclude tracker filter from count
        widgetQuery(`
          SELECT o."Tracker" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'trackers', 'o')}
          GROUP BY o."Tracker"
          ORDER BY cnt DESC
        `),
        // Statuses - exclude status filter from count
        widgetQuery(`
          SELECT o."Status" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'statuses', 'o')}
          GROUP BY o."Status"
          ORDER BY cnt DESC
        `),
        // Countries - exclude country filter from count
        widgetQuery(`
          SELECT l."Country.Area" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'countries', 'o')}
            AND l."Country.Area" IS NOT NULL AND l."Country.Area" != ''
          GROUP BY l."Country.Area"
          ORDER BY cnt DESC
        `),
        // Owner countries - exclude owner country filter from count
        widgetQuery(`
          SELECT o."Owner Headquarters Country" as value, COUNT(*) as cnt
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE ${buildSqlWhereExcluding(filters, 'ownerCountries', 'o')}
            AND o."Owner Headquarters Country" IS NOT NULL AND o."Owner Headquarters Country" != ''
          GROUP BY o."Owner Headquarters Country"
          ORDER BY cnt DESC
        `),
      ]);

      // Check for query errors
      if (!trackerResult.success)
        console.warn('[Compose] Tracker count query failed:', trackerResult.error);
      if (!statusResult.success)
        console.warn('[Compose] Status count query failed:', statusResult.error);
      if (!countryResult.success)
        console.warn('[Compose] Country count query failed:', countryResult.error);
      if (!ownerCountryResult.success)
        console.warn('[Compose] Owner country count query failed:', ownerCountryResult.error);

      trackerOptions = (trackerResult.data || []).map((r) => ({ value: r.value, count: r.cnt }));
      statusOptions = (statusResult.data || []).map((r) => ({ value: r.value, count: r.cnt }));
      countries = (countryResult.data || []).map((r) => r.value).filter(Boolean);
      ownerCountries = (ownerCountryResult.data || []).map((r) => r.value).filter(Boolean);

      console.log('[Compose] Parametric counts updated:', {
        trackers: trackerOptions.length,
        statuses: statusOptions.length,
        countries: countries.length,
        ownerCountries: ownerCountries.length,
      });
    } catch (err) {
      console.error('[Compose] Failed to update parametric counts:', err);
    }
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
  function toggleTracker(tracker) {
    const idx = filters.trackers.indexOf(tracker);
    if (idx >= 0) {
      filters.trackers = filters.trackers.filter((t) => t !== tracker);
    } else {
      filters.trackers = [...filters.trackers, tracker];
    }
  }

  function toggleStatus(status) {
    const idx = filters.statuses.indexOf(status);
    if (idx >= 0) {
      filters.statuses = filters.statuses.filter((s) => s !== status);
    } else {
      filters.statuses = [...filters.statuses, status];
    }
  }

  // Reserved for future chip-style country filter
  function _toggleCountry(country) {
    const idx = filters.countries.indexOf(country);
    if (idx >= 0) {
      filters.countries = filters.countries.filter((c) => c !== country);
    } else {
      filters.countries = [...filters.countries, country];
    }
  }

  function clearFilters() {
    filters = emptyFilterState();
    syncFiltersToUrl();
    loadResults();
    // Reload original counts
    loadReferenceData();
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
    } catch (err) {
      console.error('[Compose] Failed to copy to clipboard:', err);
      // Fallback: show URL in prompt
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

  function handleLoadPreset(preset) {
    filters = { ...emptyFilterState(), ...preset.filters };
    showPresets = false;
    applyFilters();
  }

  function handleDeletePreset(id) {
    deletePreset(id);
    presets = getPresets();
  }

  function handleRowClick(row) {
    if (!row?.asset_id) return;
    goto(assetLink(row.asset_id));
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------
  onMount(() => {
    // Parse filters from URL
    const urlFilters = decodeFilters($page.url.searchParams);
    filters = urlFilters;

    // Load presets
    presets = getPresets();

    // Load reference data and results
    loadReferenceData();
    loadResults();
  });

  // Watch for filter changes and update results + counts in real-time.
  // Using a debounce to avoid too many queries.
  $effect(() => {
    // Track filter changes by serializing filter state (triggers effect on any change)
    const _filterKey = JSON.stringify({
      trackers: filters.trackers,
      statuses: filters.statuses,
      countries: filters.countries,
      ownerCountries: filters.ownerCountries,
      owners: filters.owners,
      capacityMin: filters.capacityMin,
      capacityMax: filters.capacityMax,
      shareMin: filters.shareMin,
      shareMax: filters.shareMax,
      startYearMin: filters.startYearMin,
      startYearMax: filters.startYearMax,
      search: filters.search,
    });

    // Debounce the update
    const timeout = setTimeout(() => {
      syncFiltersToUrl();
      loadResults();
      updateParametricCounts();
    }, 150);

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

      {#if loadingOptions}
        <div class="loading-options">Loading filter options...</div>
      {:else}
        <!-- Trackers (auto-populated) -->
        <section class="filter-section">
          <h3>Tracker Type <span class="count">({trackerOptions.length})</span></h3>
          <div class="chip-group">
            {#each trackerOptions as opt}
              <button
                class="chip"
                class:active={filters.trackers.includes(opt.value)}
                onclick={() => toggleTracker(opt.value)}
              >
                <TrackerIcon tracker={opt.value} size={12} />
                {opt.value}
                <span class="chip-count">{formatCompact(opt.count)}</span>
              </button>
            {/each}
          </div>
        </section>

        <!-- Status (auto-populated) -->
        <section class="filter-section">
          <h3>Status <span class="count">({statusOptions.length})</span></h3>
          <div class="chip-group">
            {#each statusOptions as opt}
              <button
                class="chip"
                class:active={filters.statuses.includes(opt.value)}
                onclick={() => toggleStatus(opt.value)}
              >
                <StatusIcon status={opt.value} size={10} />
                {opt.value}
                <span class="chip-count">{formatCompact(opt.count)}</span>
              </button>
            {/each}
          </div>
        </section>

        <!-- Asset Country -->
        <section class="filter-section">
          <h3>Asset Country <span class="count">({countries.length})</span></h3>
          <select
            multiple
            size="6"
            onchange={(e) => {
              const target = /** @type {HTMLSelectElement} */ (e.target);
              const selected = Array.from(target.selectedOptions, (o) => o.value);
              filters.countries = selected;
            }}
          >
            {#each countries as country}
              <option value={country} selected={filters.countries.includes(country)}>
                {country}
              </option>
            {/each}
          </select>
          {#if filters.countries.length > 0}
            <div class="selected-values">
              {filters.countries.join(', ')}
              <button class="clear-inline" onclick={() => (filters.countries = [])}>×</button>
            </div>
          {/if}
        </section>

        <!-- Owner HQ Country -->
        <section class="filter-section">
          <h3>Owner HQ Country <span class="count">({ownerCountries.length})</span></h3>
          <select
            multiple
            size="6"
            onchange={(e) => {
              const target = /** @type {HTMLSelectElement} */ (e.target);
              const selected = Array.from(target.selectedOptions, (o) => o.value);
              filters.ownerCountries = selected;
            }}
          >
            {#each ownerCountries as country}
              <option value={country} selected={filters.ownerCountries.includes(country)}>
                {country}
              </option>
            {/each}
          </select>
          {#if filters.ownerCountries.length > 0}
            <div class="selected-values">
              {filters.ownerCountries.join(', ')}
              <button class="clear-inline" onclick={() => (filters.ownerCountries = [])}>×</button>
            </div>
          {/if}
        </section>

        <!-- Owner Search -->
        <section class="filter-section">
          <h3>Owner <span class="count">({owners.length} available)</span></h3>
          <input
            type="text"
            placeholder="Search owners..."
            bind:value={ownerSearch}
            class="owner-search"
          />
          <select
            multiple
            size="6"
            onchange={(e) => {
              const target = /** @type {HTMLSelectElement} */ (e.target);
              const selected = Array.from(target.selectedOptions, (o) => o.value);
              filters.owners = [...new Set([...filters.owners, ...selected])];
            }}
          >
            {#each filteredOwners as owner}
              <option value={owner} selected={filters.owners.includes(owner)}>
                {owner}
              </option>
            {/each}
          </select>
          {#if filters.owners.length > 0}
            <div class="selected-values">
              {filters.owners.slice(0, 3).join(', ')}{filters.owners.length > 3
                ? ` +${filters.owners.length - 3} more`
                : ''}
              <button class="clear-inline" onclick={() => (filters.owners = [])}>×</button>
            </div>
          {/if}
        </section>

        <!-- Capacity Range (only show if tracker has capacity data) -->
        {#if availableColumns.hasCapacity}
          <section class="filter-section">
            <h3>Capacity (MW)</h3>
            <div class="range-inputs">
              <input type="number" placeholder="Min" bind:value={filters.capacityMin} min="0" />
              <span>to</span>
              <input type="number" placeholder="Max" bind:value={filters.capacityMax} min="0" />
            </div>
          </section>
        {/if}

        <!-- Share Range (only show if tracker has share data) -->
        {#if availableColumns.hasShare}
          <section class="filter-section">
            <h3>Ownership Share (%)</h3>
            <div class="range-inputs">
              <input
                type="number"
                placeholder="Min"
                bind:value={filters.shareMin}
                min="0"
                max="100"
              />
              <span>to</span>
              <input
                type="number"
                placeholder="Max"
                bind:value={filters.shareMax}
                min="0"
                max="100"
              />
            </div>
          </section>
        {/if}

        <!-- Start Year Range (only show if tracker has start year data) -->
        {#if availableColumns.hasStartYear}
          <section class="filter-section">
            <h3>Start Year</h3>
            <div class="range-inputs">
              <input
                type="number"
                placeholder="From"
                bind:value={filters.startYearMin}
                min="1900"
                max="2100"
              />
              <span>to</span>
              <input
                type="number"
                placeholder="To"
                bind:value={filters.startYearMax}
                min="1900"
                max="2100"
              />
            </div>
          </section>
        {/if}

        <!-- Search -->
        <section class="filter-section">
          <h3>Text Search</h3>
          <input type="text" placeholder="Project or Owner name..." bind:value={filters.search} />
        </section>

        <!-- Logic -->
        <section class="filter-section">
          <h3>Filter Logic</h3>
          <div class="logic-toggle">
            <button class:active={filters.logic === 'AND'} onclick={() => (filters.logic = 'AND')}>
              AND (all match)
            </button>
            <button class:active={filters.logic === 'OR'} onclick={() => (filters.logic = 'OR')}>
              OR (any match)
            </button>
          </div>
        </section>

        <!-- Schema Info -->
        {#if schema.length > 0}
          <details class="schema-info">
            <summary>Available Columns ({schema.length})</summary>
            <ul>
              {#each schema as col}
                <li><code>{col.column_name}</code> <span class="type">{col.data_type}</span></li>
              {/each}
            </ul>
          </details>
        {/if}
      {/if}

      <!-- Apply Button -->
      <div class="apply-section">
        <button class="apply-btn" onclick={applyFilters}>
          Refresh Results
          {#if activeFilterCount > 0}
            <span class="filter-count">{activeFilterCount}</span>
          {/if}
        </button>
      </div>

      <!-- Share & Presets -->
      <div class="share-section">
        <button class="share-btn" onclick={copyShareUrl}>
          {copied ? 'Copied!' : 'Copy Share Link'}
        </button>
        <button class="preset-btn" onclick={() => (showPresets = !showPresets)}>
          {showPresets ? 'Hide Presets' : 'Presets'}
        </button>
      </div>

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
        </div>
      {/if}
    </aside>

    <!-- Main: Results -->
    <section class="results-panel">
      <div class="results-header">
        <h1>Filtered Assets</h1>
        <div class="results-meta">
          {#if loading}
            <span class="loading-text">Loading...</span>
          {:else}
            <span class="result-count">{formatCount(totalCount)} results</span>
            <span class="query-time">{queryTime}ms</span>
          {/if}
        </div>
      </div>

      {#if error}
        <div class="error-message">{error}</div>
      {/if}

      {#if !loading && results.length > 0}
        <!-- Visualization Dashboard (compact) -->
        <div class="viz-dashboard">
          <div class="viz-row">
            <!-- Status Distribution -->
            <div class="viz-card">
              <MiniBarChart
                data={statusDistribution}
                label="Status"
                maxItems={4}
                width={100}
                barHeight={10}
                gap={2}
                colorMap={statusColors}
                compact
              />
            </div>

            <!-- Tracker Distribution -->
            <div class="viz-card">
              <MiniBarChart
                data={trackerDistribution}
                label="Tracker"
                maxItems={4}
                width={100}
                barHeight={10}
                gap={2}
                compact
              />
            </div>

            <!-- Country Distribution -->
            <div class="viz-card">
              <MiniBarChart
                data={countryDistribution}
                label="Countries"
                maxItems={4}
                width={100}
                barHeight={10}
                gap={2}
                compact
              />
            </div>

            <!-- Capacity Histogram -->
            {#if capacityData.length > 0}
              <div class="viz-card">
                <MiniHistogram
                  data={capacityData}
                  label="Capacity"
                  unit="MW"
                  bins={8}
                  width={100}
                  height={36}
                  showAxis={false}
                  compact
                />
              </div>
            {/if}

            <!-- Start Year Sparkline -->
            {#if startYearData.length > 1}
              <div class="viz-card">
                <Sparkline
                  data={startYearData}
                  label="Start Year"
                  width={100}
                  height={32}
                  compact
                />
              </div>
            {/if}
          </div>
        </div>

        <DataTable
          columns={tableColumns}
          data={tableRows}
          pageSize={50}
          showGlobalSearch={true}
          showColumnFilters={true}
          showPagination={true}
          showExport={true}
          showColumnToggle={true}
          stickyHeader={true}
          striped={true}
          onRowClick={handleRowClick}
        />

        {#if results.length >= 500}
          <p class="limit-notice">
            Showing first 500 results. Refine your filters to see more specific data.
          </p>
        {/if}
      {:else if !loading}
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
</main>

<style>
  main {
    width: 100%;
    padding: 40px;
    min-height: 100vh;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }

  .page-type {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Layout */
  .composer-layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); /* 40% filters, 60% results */
    gap: 32px;
  }

  @media (max-width: 900px) {
    .composer-layout {
      grid-template-columns: 1fr;
    }

    /* On mobile, show results first, then filters */
    .filter-panel {
      order: 2;
    }

    .results-panel {
      order: 1;
    }
  }

  /* Filter Panel */
  .filter-panel {
    background: #fafafa;
    padding: 20px;
    height: fit-content;
    position: sticky;
    top: 20px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 1px solid #ddd;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .clear-btn {
    font-size: 11px;
    color: #666;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .filter-section {
    margin-bottom: 20px;
  }

  .filter-section h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0 0 8px 0;
  }

  /* Chip Group */
  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .chip:hover {
    border-color: #000;
  }

  .chip.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Country Select */
  .filter-section select {
    width: 100%;
    padding: 6px;
    font-size: 12px;
    border: 1px solid #ddd;
  }

  .selected-countries {
    margin-top: 6px;
    font-size: 11px;
    color: #666;
  }

  .selected-values {
    margin-top: 6px;
    font-size: 11px;
    color: #666;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .clear-inline {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    font-size: 14px;
    padding: 0;
  }

  .clear-inline:hover {
    color: #000;
  }

  .loading-options {
    padding: 20px;
    text-align: center;
    color: #666;
    font-size: 12px;
  }

  .filter-section h3 .count {
    font-weight: 400;
    color: #999;
  }

  .chip-count {
    font-size: 9px;
    color: #999;
    margin-left: 2px;
  }

  .chip.active .chip-count {
    color: rgba(255, 255, 255, 0.7);
  }

  .owner-search {
    margin-bottom: 6px;
  }

  .schema-info {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .schema-info summary {
    font-size: 11px;
    color: #666;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .schema-info ul {
    margin: 10px 0 0 0;
    padding: 0;
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
  }

  .schema-info li {
    font-size: 11px;
    padding: 2px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .schema-info code {
    font-family: monospace;
    background: #f5f5f5;
    padding: 1px 4px;
  }

  .schema-info .type {
    color: #999;
    font-size: 10px;
    margin-left: 8px;
  }

  /* Range Inputs */
  .range-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .range-inputs input {
    flex: 1;
    padding: 6px 8px;
    font-size: 12px;
    border: 1px solid #ddd;
    width: 80px;
  }

  .range-inputs span {
    color: #666;
    font-size: 12px;
  }

  /* Search */
  .filter-section input[type='text'] {
    width: 100%;
    padding: 8px;
    font-size: 12px;
    border: 1px solid #ddd;
  }

  /* Logic Toggle */
  .logic-toggle {
    display: flex;
    gap: 0;
  }

  .logic-toggle button {
    flex: 1;
    padding: 6px 10px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .logic-toggle button:first-child {
    border-right: none;
  }

  .logic-toggle button.active {
    background: #000;
    color: white;
    border-color: #000;
  }

  /* Apply Section */
  .apply-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ddd;
  }

  .apply-btn {
    width: 100%;
    padding: 12px;
    font-size: 13px;
    font-weight: 600;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .apply-btn:hover {
    background: #333;
  }

  .filter-count {
    background: white;
    color: #000;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
  }

  /* Share Section */
  .share-section {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .share-btn,
  .preset-btn {
    flex: 1;
    padding: 8px;
    font-size: 11px;
    background: white;
    border: 1px solid #ddd;
    cursor: pointer;
  }

  .share-btn:hover,
  .preset-btn:hover {
    border-color: #000;
  }

  /* Presets Panel */
  .presets-panel {
    margin-top: 12px;
    padding: 12px;
    background: white;
    border: 1px solid #ddd;
  }

  .presets-panel h4 {
    margin: 0 0 10px 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .no-presets {
    font-size: 11px;
    color: #666;
    margin: 0;
  }

  .preset-list {
    list-style: none;
    margin: 0 0 12px 0;
    padding: 0;
  }

  .preset-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid #eee;
  }

  .preset-name {
    background: none;
    border: none;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    text-decoration: underline;
    text-decoration-color: transparent;
  }

  .preset-name:hover {
    text-decoration-color: currentColor;
  }

  .preset-delete {
    background: none;
    border: none;
    font-size: 14px;
    color: #999;
    cursor: pointer;
  }

  .preset-delete:hover {
    color: #b10000;
  }

  .save-preset {
    display: flex;
    gap: 6px;
  }

  .save-preset input {
    flex: 1;
    padding: 6px;
    font-size: 11px;
    border: 1px solid #ddd;
  }

  .save-preset button {
    padding: 6px 12px;
    font-size: 11px;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
  }

  /* Results Panel */
  .results-panel {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0;
  }

  .results-header h1 {
    margin: 0;
    font-size: 24px;
    font-weight: normal;
    font-family: Georgia, serif;
  }

  .results-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #666;
  }

  .loading-text {
    color: #999;
  }

  .query-time {
    color: #999;
  }

  .error-message {
    padding: 20px;
    background: #fee;
    color: #b10000;
    margin-bottom: 20px;
  }

  .limit-notice {
    text-align: center;
    font-size: 11px;
    color: #666;
    margin-top: 12px;
  }

  /* No Results */
  .no-results {
    text-align: center;
    padding: 60px 20px;
    color: #666;
  }

  .no-results p {
    margin: 0 0 16px 0;
  }

  .no-results button {
    padding: 8px 16px;
    font-size: 12px;
    background: #000;
    color: white;
    border: none;
    cursor: pointer;
  }

  /* Visualization Dashboard - Compact */
  .viz-dashboard {
    margin-bottom: 12px;
    padding: 8px;
    background: #f8f8f8;
    border: 1px solid #eee;
  }

  .viz-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }

  .viz-card {
    flex: 0 0 auto;
    padding: 6px 8px;
    background: white;
    border: 1px solid #eee;
  }

  @media (max-width: 768px) {
    .viz-row {
      flex-direction: column;
    }

    .viz-card {
      width: 100%;
    }
  }

  /* DataTable compact overrides */
  .results-panel :global(.data-table) {
    font-size: 11px;
  }

  .results-panel :global(.data-table th),
  .results-panel :global(.data-table td) {
    padding: 4px 8px;
  }

  .results-panel :global(.data-table th) {
    font-size: 10px;
  }

  .results-panel :global(.data-table-controls) {
    padding: 8px;
    gap: 8px;
  }

  .results-panel :global(.data-table-controls input) {
    padding: 6px 10px;
    font-size: 11px;
  }

  .results-panel :global(.data-table-controls button) {
    padding: 4px 10px;
    font-size: 10px;
  }
</style>
