<script lang="ts">
  /**
   * ASSET-CLASS SCREENER - Results
   *
   * Shows OWNERS who have ownership stakes in selected asset classes.
   * Search/filter to find specific companies from your watchlist.
   */

  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import LoadingWrapper from '$lib/components/feedback/LoadingWrapper.svelte';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import ScreenerOwnersResultsTable from '$lib/components/screener/ScreenerOwnersResultsTable.svelte';

  import {
    getAssetTypeForTracker,
    STATUS_GROUPS,
    discoverStatusGroups,
  } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import {
    getOwnersByAssetType,
    getAssetTypeCounts,
    gemTrackerToUiTracker,
    type ScreenerFilters,
    type ScreenerOwner,
  } from '$lib/data-config/screener-api';
  import {
    buildScreenerUrl,
    parseJsonSearchParam,
    type ScreenerRoutePath,
  } from '$lib/screener-url';
  import { resolveApiSlug, getAPIBase, fetchStatusFacets } from '$lib/ownership-api';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import { getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import type { AssetClass } from '$lib/data-config/asset-class-definitions';

  // URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');

  // Parse selected owner IDs (comma-separated entity IDs)
  const selectedOwnerIds = $derived.by(() => {
    if (!ownersParam) return [];
    return ownersParam.split(',').filter((id) => id.trim());
  });

  // Mode: 'all' = show all owners, 'filtered' = show only selected owners
  const viewMode = $derived(selectedOwnerIds.length > 0 ? 'filtered' : 'all');

  // Parse selected classes
  const selectedClasses = $derived.by((): ScreenerSelectedClass[] => {
    if (!classesParam) return [];
    try {
      const parsed = parseJsonSearchParam<ScreenerSelectedClass[]>(classesParam);
      return parsed || [];
    } catch {
      return [];
    }
  });

  // Derive chart props from selected class
  const chartAssetClassName = $derived(
    selectedClasses.length > 0 ? selectedClasses[0]?.tracker || selectedClasses[0]?.name || '' : ''
  );
  const chartTrackerSlug = $derived(selectedClasses.length > 0 ? selectedClasses[0]?.id || '' : '');

  // Show parse error when classesParam exists but selectedClasses is empty
  const parseError = $derived(
    classesParam && selectedClasses.length === 0
      ? 'Could not read asset class from URL. Please go back and re-select.'
      : null
  );

  // Build human-readable description of selected class
  const classDescription = $derived.by(() => {
    if (selectedClasses.length === 0) return 'selected assets';

    const cls = selectedClasses[0];
    const trackerName = cls.tracker || cls.name || 'assets';
    const parts: string[] = [];

    // Only show status prefix when a small number are selected (1-3)
    const statuses: string[] =
      cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);
    if (statuses.length === 1) {
      parts.push(statuses[0]);
    } else if (statuses.length > 1 && statuses.length <= 3) {
      parts.push(statuses.join('/'));
    }
    // 4+ statuses: skip status prefix (too noisy in "Ownership in N ..." text)

    parts.push(trackerName);

    if (cls.filters?.geography) {
      const geo = cls.filters.geography;
      if (Array.isArray(geo)) {
        if (geo.length === 1) parts.push(`in ${geo[0]}`);
        else if (geo.length > 1) parts.push(`in ${geo.length} countries`);
      } else {
        parts.push(`in ${geo}`);
      }
    }

    if (cls.filters?.geofence) {
      parts.push('in custom region');
    }

    return parts.join(' ');
  });

  // State
  let loading = $state(true);
  let error: string | null = $state(null);
  let owners: ScreenerOwner[] = $state([]);

  // Data source tracking
  let dataSource = $state<'local' | 'api'>('api');
  let queryTime: number | null = $state(null);
  let executedQuery = $state('');
  let availableAssetTypes: { asset_type: string; cnt: number }[] = $state([]);

  // Search/filter for journalists with watchlists
  let searchQuery = $state('');
  // Expanded row state - tracks which owner's ownership tree is visible
  let expandedOwnerId = $state<string | null>(null);
  let resultsSectionEl: HTMLElement | undefined = $state();

  // ── Edit modal state ──────────────────────────────────
  let showEditModal = $state(false);
  let editAssetClass: AssetClass | null = $state(null);
  let editSubClassChecks: Record<string, boolean> = $state({});
  let editGroupOptionChecks: Record<string, boolean> = $state({});
  let editStatusChecks: Record<string, boolean> = $state({});
  let editGeoFilters: string[] = $state([]);
  let editGeofence: number[][] | null = $state(null);
  let editDynamicStatusGroups: DynamicStatusGroup[] | null = $state(null);

  // Scroll results table into view when data finishes loading
  $effect(() => {
    if (owners.length > 0 && resultsSectionEl) {
      const rect = resultsSectionEl.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.5) {
        resultsSectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  function toggleExpanded(ownerId: string) {
    expandedOwnerId = expandedOwnerId === ownerId ? null : ownerId;
  }

  // Owners to pass into Step 4
  const visualizeOwnerIds = $derived.by(() => {
    if (selectedOwnerIds.length > 0) return selectedOwnerIds;
    return [];
  });

  const visualizeUrl = $derived.by(() =>
    buildScreenerUrl('screener/visualize', {
      classes: classesParam || undefined,
      owners: visualizeOwnerIds.length > 0 ? visualizeOwnerIds.join(',') : undefined,
    })
  );

  // Filtered owners based on search
  const filteredOwners = $derived.by(() => {
    let result = owners;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((o) => o.name.toLowerCase().includes(query));
    }

    return result;
  });

  function handleOwnerSearch(query: string) {
    searchQuery = query;
    const trimmed = query.trim();
    goto(
      buildScreenerUrl('screener/results', {
        classes: classesParam || undefined,
        owners: ownersParam || undefined,
        q: trimmed || undefined,
      }),
      { replaceState: true, noScroll: true, keepFocus: true }
    );
  }

  // Load owners data using centralized screener API
  onMount(async () => {
    // Init search from URL
    searchQuery = $page.url.searchParams.get('q') || '';

    try {
      const classes = selectedClasses;
      if (classes.length === 0) {
        error = 'No asset class selected. Go back and select one.';
        loading = false;
        return;
      }

      const cls = classes[0];

      // Build filters for the screener API
      // Prefer statuses[] array for multi-status filtering; fall back to singular status
      const statusesArray: string[] | undefined = cls?.filters?.statuses;
      // Normalize geography: could be string (legacy) or string[] (multi-select)
      const geoRaw = cls?.filters?.geography;
      const countryFilter: string | string[] | undefined = Array.isArray(geoRaw)
        ? geoRaw.length > 0
          ? geoRaw
          : undefined
        : geoRaw || undefined;

      const geofenceRaw = cls?.filters?.geofence;
      const geofence =
        Array.isArray(geofenceRaw) && geofenceRaw.length >= 3 ? geofenceRaw : undefined;

      const filters: ScreenerFilters = {
        tracker: cls?.tracker || '',
        status: cls?.filters?.status,
        statuses: statusesArray && statusesArray.length > 0 ? statusesArray : undefined,
        country: countryFilter,
        ownerIds: selectedOwnerIds.length > 0 ? selectedOwnerIds : undefined,
        assetClassId: cls?.assetClassId || cls?.id,
        selectedSubClasses: Array.isArray(cls?.selectedSubClasses)
          ? cls.selectedSubClasses
          : undefined,
        geofence,
      };

      // Fetch asset type counts via REST API (cached, for debug panel)
      getAssetTypeCounts().then((counts) => {
        availableAssetTypes = Object.entries(counts).map(([asset_type, cnt]) => ({
          asset_type,
          cnt,
        }));
      });

      // Main query: get owners by asset type
      const result = await getOwnersByAssetType(filters, { limit: 200 });

      queryTime = result.queryTimeMs;
      dataSource =
        result.source === 'rest-api' ? 'api' : result.source === 'cache' ? 'local' : 'api';
      const slug = resolveApiSlug(filters.tracker || '');
      const restBase = getAPIBase();
      const restParams = new URLSearchParams({
        asset_type: slug || filters.tracker || '',
        format: 'json',
        limit: '500',
      });
      if (filters.country) restParams.set('country', String(filters.country));
      executedQuery = `GET ${restBase}/assets?${restParams.toString()}\n\nsource=${result.source}, filters=${JSON.stringify(filters, null, 2)}`;

      owners = result.owners.map((o) => ({
        name: o.name,
        entityId: o.entityId,
        totalAssets: o.totalAssets,
        filteredAssets: o.filteredAssets,
      }));

      loading = false;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load owners:', err);
      error = err?.message || 'Failed to load data';
      loading = false;
    }
  });

  function removeAssetClass(index: number) {
    if (index < 0) return;
    const classes = selectedClasses.filter((_, i) => i !== index);
    if (classes.length === 0) {
      goto(buildScreenerUrl('screener'));
    } else {
      goto(buildScreenerUrl('screener/results', { classes: JSON.stringify(classes) }));
    }
  }

  // ── Edit modal ──────────────────────────────────────────
  function openEditModal() {
    if (selectedClasses.length === 0) return;
    const cls = selectedClasses[0];
    const ac = getAssetClassById(cls.assetClassId || cls.id || '');
    if (!ac) {
      history.back();
      return;
    }

    editAssetClass = ac;
    editDynamicStatusGroups = null;

    // Hydrate subclass/group checks from URL params
    const subs = new Set(cls.selectedSubClasses || []);
    editSubClassChecks = Object.fromEntries(
      (ac.subClasses || []).map((sc) => [
        sc.id,
        subs.size > 0 ? subs.has(sc.id) : (sc.defaultChecked ?? true),
      ])
    );
    editGroupOptionChecks = Object.fromEntries(
      (ac.subClassGroups || []).flatMap((g) =>
        g.options.map((o) => [o.id, subs.size > 0 ? subs.has(o.id) : (o.defaultChecked ?? true)])
      )
    );

    // Hydrate status checks
    const selStatuses = new Set(
      cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : [])
    );
    const sc: Record<string, boolean> = {};
    for (const sg of STATUS_GROUPS) {
      for (const s of sg.statuses) {
        sc[`status-${sg.id}-${s}`] =
          selStatuses.size > 0 ? selStatuses.has(s) : sg.id === 'operating' || sg.id === 'planned';
      }
    }
    editStatusChecks = sc;

    // Hydrate geography
    const geoRaw = cls.filters?.geography;
    editGeoFilters = Array.isArray(geoRaw) ? [...geoRaw] : geoRaw ? [geoRaw] : [];
    editGeofence = cls.filters?.geofence || null;

    showEditModal = true;

    // Fetch dynamic status facets (non-blocking)
    const slugs = ac.trackers
      .map((t: string) => resolveApiSlug(gemTrackerToUiTracker(t)))
      .filter(Boolean);
    if (slugs.length > 0) {
      Promise.all(slugs.map((slug: string) => fetchStatusFacets(slug)))
        .then((results) => {
          if (!showEditModal) return;
          const merged = new Map<string, number>();
          for (const fm of results)
            for (const [k, v] of fm) merged.set(k, (merged.get(k) ?? 0) + v);
          const groups = discoverStatusGroups(merged);
          editDynamicStatusGroups = groups;
          // Re-map status checks to discovered groups
          const next: Record<string, boolean> = {};
          for (const sg of groups) {
            for (const s of sg.statuses) {
              next[`status-${sg.id}-${s.value}`] =
                selStatuses.size > 0
                  ? selStatuses.has(s.value)
                  : sg.id === 'operating' || sg.id === 'planned';
            }
          }
          editStatusChecks = next;
        })
        .catch(() => {});
    }
  }

  function handleEditDone(path: ScreenerRoutePath) {
    if (!editAssetClass) return;

    // Derive selected statuses
    const statuses: string[] = [];
    const groups =
      editDynamicStatusGroups ??
      STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        statuses: sg.statuses.map((s) => ({ value: s })),
      }));
    for (const sg of groups)
      for (const s of sg.statuses)
        if (editStatusChecks[`status-${sg.id}-${s.value}`]) statuses.push(s.value);

    // Derive selected sub-classes
    const selectedSubClassIds = [
      ...Object.entries(editSubClassChecks)
        .filter(([, v]) => v)
        .map(([k]) => k),
      ...Object.entries(editGroupOptionChecks)
        .filter(([, v]) => v)
        .map(([k]) => k),
    ];

    const classData = [
      {
        id: editAssetClass.id,
        name: editAssetClass.label,
        description: editAssetClass.description,
        tracker: gemTrackerToUiTracker(editAssetClass.trackers[0]),
        filters: {
          geography: editGeoFilters.length > 0 ? editGeoFilters : undefined,
          status: statuses.length === 1 ? statuses[0] : undefined,
          statuses: statuses.length > 0 ? statuses : undefined,
          geofence: editGeofence || undefined,
        },
        assetClassId: editAssetClass.id,
        selectedSubClasses: selectedSubClassIds,
        gemTrackers: editAssetClass.trackers,
      },
    ];

    showEditModal = false;
    editAssetClass = null;

    // Navigate with updated params — full reload since onMount fetches data
    const url = buildScreenerUrl(path, {
      classes: JSON.stringify(classData),
    });
    window.location.href = url;
  }
</script>

<svelte:head>
  <title>Screener Results — Global Energy Monitor</title>
  <meta
    name="description"
    content="View companies with ownership stakes in selected asset classes and add them to your investigation."
  />
</svelte:head>

<ScreenerLayout
  currentStep={3}
  subtitle={viewMode === 'filtered'
    ? `Showing ${selectedOwnerIds.length} selected companies and their ownership in ${classDescription}.`
    : `Showing all companies with ownership stakes in ${classDescription}.`}
  {classesParam}
  {ownersParam}
  maxWidth="wide"
>
  {#snippet headerRight()}
    <AssetClassesPanel
      {classesParam}
      onRemove={(cls) =>
        removeAssetClass(
          selectedClasses.findIndex(
            (c) => (c.id || c.assetClassId || c.name) === (cls.id || cls.assetClassId || cls.name)
          )
        )}
      onEdit={openEditModal}
    />
  {/snippet}

  <!-- Compact filter breadcrumb -->
  <div class="filter-bar">
    <span class="filter-crumbs">
      {#each selectedClasses as cls}
        <span class="crumb">{cls.tracker || cls.name}</span>
        {#if cls.filters?.statuses?.length > 0}
          <span class="crumb-sep">/</span>
          <span class="crumb">
            {cls.filters.statuses.length <= 3
              ? cls.filters.statuses.join(', ')
              : `${cls.filters.statuses.length} statuses`}
          </span>
        {:else if cls.filters?.status}
          <span class="crumb-sep">/</span>
          <span class="crumb">{cls.filters.status}</span>
        {/if}
        {#if cls.filters?.geography}
          {@const geo = cls.filters.geography}
          <span class="crumb-sep">/</span>
          <span class="crumb">
            {Array.isArray(geo)
              ? geo.length <= 3
                ? geo.join(', ')
                : `${geo.length} countries`
              : geo}
          </span>
        {/if}
        {#if cls.filters?.geofence}
          <span class="crumb-sep">/</span>
          <span class="crumb">custom region</span>
        {/if}
      {/each}
    </span>
    <button class="edit-link" onclick={openEditModal}>Edit filters</button>
  </div>

  {#if parseError}
    <div class="parse-error">
      <p>{parseError}</p>
      <a href="/screener/">← Start over</a>
    </div>
  {/if}

  <LoadingWrapper {loading} {error} loadingMessage="Finding owners...">
    <section class="results-section" bind:this={resultsSectionEl}>
      <div class="results-header">
        <div class="results-title-row">
          <h2>
            {filteredOwners.length}
            {viewMode === 'filtered' ? 'selected' : ''}
            owners
          </h2>
          <DataSourceBadge source={dataSource} {queryTime} />
        </div>
      </div>

      <div class="search-bar">
        <AssetSearchBar
          bind:value={searchQuery}
          activeMode="owner"
          modes={[
            {
              id: 'owner',
              label: 'Owners',
              placeholder: 'Filter owners...',
            },
          ]}
          showButton={false}
          compact={true}
          onSearch={handleOwnerSearch}
        />
      </div>

      <ScreenerOwnersResultsTable
        {filteredOwners}
        {classDescription}
        {searchQuery}
        {viewMode}
        selectedOwnerCount={selectedOwnerIds.length}
        {expandedOwnerId}
        assetClassName={chartAssetClassName}
        trackerSlug={chartTrackerSlug}
        onToggleExpanded={toggleExpanded}
        onClearSearch={() => handleOwnerSearch('')}
      />
    </section>
  </LoadingWrapper>

  <!-- Debug panel -->
  {#if executedQuery}
    <DebugPanel title="Query Debug" time={queryTime}>
      <div class="debug-meta">
        <span class="debug-label">View mode:</span>
        <span class="debug-value">
          {viewMode} ({viewMode === 'filtered'
            ? selectedOwnerIds.length + ' owners selected'
            : 'showing all'})
        </span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Asset Type:</span>
        <span class="debug-value">
          {selectedClasses[0]?.tracker || 'none'} → {getAssetTypeForTracker(
            selectedClasses[0]?.tracker
          ) || 'none'}
        </span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Statuses:</span>
        <span class="debug-value">
          {selectedClasses[0]?.filters?.statuses?.join(', ') ||
            selectedClasses[0]?.filters?.status ||
            'all'}
        </span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Data source:</span>
        <span class="debug-value">{dataSource}</span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Results:</span>
        <span class="debug-value">{owners.length} owners returned</span>
      </div>
      {#if availableAssetTypes.length > 0}
        <div class="debug-asset-types">
          <span class="debug-label">Available in DB:</span>
          <div class="asset-type-list">
            {#each availableAssetTypes as at}
              <span
                class="asset-type-item"
                class:match={at.asset_type === getAssetTypeForTracker(selectedClasses[0]?.tracker)}
              >
                {at.asset_type || '(empty)'} ({at.cnt})
              </span>
            {/each}
          </div>
        </div>
      {/if}
      <div class="debug-sql">
        <div class="debug-sql-header">
          <span class="debug-label">API Query:</span>
          <button class="copy-btn" onclick={() => navigator.clipboard.writeText(executedQuery)}
            >Copy</button
          >
        </div>
        <pre class="debug-code">{executedQuery}</pre>
      </div>
    </DebugPanel>
  {/if}

  {#if showEditModal && editAssetClass}
    <AssetClassExpansion
      assetClass={editAssetClass}
      bind:subClassChecks={editSubClassChecks}
      bind:groupOptionChecks={editGroupOptionChecks}
      bind:statusChecks={editStatusChecks}
      bind:geoFilters={editGeoFilters}
      bind:geofence={editGeofence}
      dynamicStatusGroups={editDynamicStatusGroups}
      onShowAllOwners={() => handleEditDone('/screener/results')}
      onSearchSpecificOwners={() => handleEditDone('/screener/owners')}
      onClose={() => (showEditModal = false)}
    />
  {/if}
</ScreenerLayout>

<style>
  /* ── Parse error ────────────────────────────── */
  .parse-error {
    margin-bottom: var(--space-4);
    color: var(--color-text-secondary);
  }

  .parse-error p {
    margin: 0 0 var(--space-2) 0;
    font-weight: 500;
  }

  .parse-error a {
    color: var(--gem-teal, #2a7f8f);
    font-size: var(--font-size-sm);
  }

  /* ── Filter breadcrumb bar ──────────────────── */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 8px 12px;
    margin-bottom: var(--space-4);
    background: var(--color-gray-50, #f8fafc);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 2px;
    font-size: 13px;
  }

  .filter-crumbs {
    color: var(--color-text-secondary);
  }

  .crumb {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .crumb-sep {
    margin: 0 6px;
    color: var(--color-text-tertiary);
  }

  .edit-link {
    background: none;
    border: none;
    font: inherit;
    font-size: 12px;
    color: var(--color-text-tertiary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    white-space: nowrap;
    padding: 0;
  }

  .edit-link:hover {
    color: var(--gem-teal, #2a7f8f);
  }

  /* ── Results section ────────────────────────── */
  .results-section {
    margin-top: var(--space-4);
  }

  .results-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: var(--space-3);
  }

  .results-title-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .results-title-row :global(.badge) {
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--color-text-tertiary);
    font-size: 10px;
  }

  .results-title-row :global(.badge .label) {
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  h2 {
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
    font-family: Georgia, serif;
  }

  .search-bar {
    margin-bottom: var(--space-3);
  }

  /* Page-specific debug styles */
  .debug-sql {
    margin-top: var(--space-4);
  }

  .debug-sql-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }

  .debug-asset-types {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .asset-type-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .asset-type-item {
    display: inline-block;
    padding: var(--space-1) var(--space-2);
    background: var(--color-gray-100);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    color: var(--color-text-secondary);
  }

  .asset-type-item.match {
    background: var(--gem-teal);
    color: white;
    font-weight: 600;
  }
</style>
