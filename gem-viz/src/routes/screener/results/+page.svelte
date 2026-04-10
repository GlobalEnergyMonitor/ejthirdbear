<script lang="ts">
  /**
   * ASSET-CLASS SCREENER - Results
   *
   * Shows OWNERS who have ownership stakes in selected asset classes.
   * Search/filter to find specific companies from your watchlist.
   */

  import { page } from '$app/stores';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { animate } from 'animejs';
  import LoadingWrapper from '$lib/components/feedback/LoadingWrapper.svelte';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import ScreenerOwnersResultsTable from '$lib/components/screener/ScreenerOwnersResultsTable.svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';

  import {
    getAssetTypeForTracker,
    STATUS_GROUPS,
    discoverStatusGroups,
  } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import {
    getOwnersByFilter,
    getAssetTypeCounts,
    gemTrackerToUiTracker,
    type ScreenerOwner,
  } from '$lib/data-config/screener-api';
  import {
    buildScreenerUrl,
    writeScreenerHash,
    parseJsonSearchParam,
    type ScreenerRoutePath,
  } from '$lib/screener-url';
  import {
    resolveApiSlug,
    getAPIBase,
    getEntity,
    fetchStatusFacets,
    fetchStatusTaxonomy,
  } from '$lib/ownership-api';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import { getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import type { AssetClass } from '$lib/data-config/asset-class-definitions';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // Embed mode: ?embed=true hides page chrome; state mirrored to hash for shareability
  const isEmbed = $derived($page.url.searchParams.get('embed') === 'true');

  // URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const ownersParam = $derived($page.url.searchParams.get('owners') || '');
  const noassetsParam = $derived($page.url.searchParams.get('noassets') || '');
  const nomatchParam = $derived($page.url.searchParams.get('nomatch') || '');

  // Keep hash in sync with query params when embedded
  $effect(() => {
    if (!isEmbed) return;
    writeScreenerHash({ classes: classesParam || undefined, owners: ownersParam || undefined });
  });

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
    selectedClasses.length > 0 ? selectedClasses[0]?.name || selectedClasses[0]?.tracker || '' : ''
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
    const trackerName = cls.name || cls.tracker || 'assets';
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

  // Tier 2: entities that matched search but have no assets in this class
  // Populated progressively via individual /entities/{id} lookups
  let noAssetEntities = $state<{ id: string; name: string; country?: string | null }[]>([]);
  let noAssetLoading = $state(false);
  const nomatchCount = $derived(nomatchParam ? parseInt(nomatchParam, 10) || 0 : 0);

  /** Provenance map: entityId → search terms that matched it (from bulk search via sessionStorage) */
  let bulkMatchProvenance = $state<Record<string, string[]>>({});
  /** Unmatched bulk search terms (from sessionStorage) */
  let unmatchedTerms = $state<string[]>([]);
  let showUnmatched = $state(false);

  // Data source tracking
  let dataSource = $state<'local' | 'api'>('api');
  let queryTime: number | null = $state(null);
  let executedQuery = $state('');
  let availableAssetTypes: { asset_type: string; cnt: number }[] = $state([]);

  // Search/filter for journalists with watchlists
  let searchQuery = $state('');
  const PAGE_SIZE = 100;
  let currentPage = $state(0);
  // Modal state for ownership chart
  let chartModalOwner: { entityId: string; name: string; filteredAssets?: number } | null =
    $state(null);
  let modalOriginRect: DOMRect | null = $state(null);
  let modalNameEl: HTMLElement | undefined = $state();
  let modalEl: HTMLElement | undefined = $state();
  let backdropEl: HTMLElement | undefined = $state();
  let isModalClosing = $state(false);
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
      if (rect.top > window.innerHeight * 0.6) {
        resultsSectionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  });

  function openChartModal(entityId: string, event?: MouseEvent) {
    const owner = owners.find((o) => o.entityId === entityId);
    if (!owner || isModalClosing) return;

    // Capture source rect for FLIP animation
    if (event) {
      const row = event.currentTarget as HTMLElement;
      const nameEl = row?.querySelector('.owner-name');
      if (nameEl) modalOriginRect = nameEl.getBoundingClientRect();
    }

    chartModalOwner = owner;

    // Animate entrance after DOM renders
    tick().then(() => {
      const hasFlip = !!(modalOriginRect && modalNameEl);

      // Backdrop fades in immediately
      if (backdropEl) {
        animate(backdropEl, {
          opacity: [0, 1],
          duration: 600,
          ease: 'out(2)',
        });
      }

      // Modal shell appears but body stays invisible until name lands
      if (modalEl) {
        // Show just the header frame first
        modalEl.style.opacity = '1';
        modalEl.style.transform = 'none';
      }

      // Hide the chart body — it fades in after the name flight
      const bodyEl = modalEl?.querySelector('.chart-modal-body') as HTMLElement | null;
      if (bodyEl) bodyEl.style.opacity = '0';

      const revealBody = () => {
        if (bodyEl) {
          animate(bodyEl, {
            opacity: [0, 1],
            translateY: [12, 0],
            duration: 500,
            ease: 'out(3)',
          });
        }
      };

      // FLIP: fly the company name from table to modal header
      if (hasFlip && modalOriginRect && modalNameEl) {
        const destRect = modalNameEl.getBoundingClientRect();
        const clone = document.createElement('span');
        clone.textContent = owner.name;
        Object.assign(clone.style, {
          position: 'fixed',
          left: `${modalOriginRect.left}px`,
          top: `${modalOriginRect.top}px`,
          fontSize: getComputedStyle(modalNameEl).fontSize,
          fontWeight: '500',
          fontFamily: 'Georgia, serif',
          color: 'var(--color-text-primary, #1e293b)',
          zIndex: '10001',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        });
        document.body.appendChild(clone);
        modalNameEl.style.opacity = '0';
        const destEl = modalNameEl;

        animate(clone, {
          left: [modalOriginRect.left, destRect.left],
          top: [modalOriginRect.top, destRect.top],
          duration: 600,
          ease: 'out(2)',
          onComplete: () => {
            clone.remove();
            if (destEl) destEl.style.opacity = '1';
            revealBody();
          },
        });
      } else {
        // No FLIP source — just fade everything in together
        revealBody();
      }

      modalOriginRect = null;
    });
  }

  function closeChartModal() {
    if (!chartModalOwner || isModalClosing) return;
    isModalClosing = true;

    const done = () => {
      chartModalOwner = null;
      isModalClosing = false;
    };

    // Animate modal out — gently sinks and fades
    if (modalEl) {
      animate(modalEl, {
        opacity: [1, 0],
        scale: [1, 0.96],
        translateY: [0, 40],
        duration: 400,
        ease: 'in(2)',
      });
    }

    // Backdrop fade out, then clear state
    if (backdropEl) {
      animate(backdropEl, {
        opacity: [1, 0],
        duration: 450,
        ease: 'in(2)',
        onComplete: done,
      });
    } else {
      setTimeout(done, 450);
    }
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

  const totalPages = $derived(Math.ceil(filteredOwners.length / PAGE_SIZE));
  const pagedOwners = $derived(filteredOwners.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE));

  function handleOwnerSearch(query: string) {
    searchQuery = query;
    currentPage = 0;
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

  // Load owners data using the /owners REST endpoint
  onMount(async () => {
    // Init search from URL
    searchQuery = $page.url.searchParams.get('q') || '';

    // Read bulk-search provenance + unmatched terms from sessionStorage
    try {
      const raw = sessionStorage.getItem('__gem_bulk_match__');
      if (raw) bulkMatchProvenance = JSON.parse(raw);
      const rawUnmatched = sessionStorage.getItem('__gem_unmatched__');
      if (rawUnmatched) unmatchedTerms = JSON.parse(rawUnmatched);
    } catch {
      // ignore — tooltips/unmatched list simply won't appear
    }

    // ── Tier 2: kick off entity lookups immediately, populate as they arrive ──
    const noassetIds = noassetsParam ? noassetsParam.split(',').filter(Boolean) : [];
    if (noassetIds.length > 0) {
      noAssetLoading = true;
      // Fire all lookups in parallel; append each result as it resolves
      Promise.allSettled(
        noassetIds.map((id) =>
          getEntity(id).then((e) => {
            if (e) {
              noAssetEntities = [
                ...noAssetEntities,
                { id: e.id, name: e.name, country: e.headquartersCountry },
              ];
            }
          })
        )
      ).finally(() => {
        noAssetLoading = false;
      });
    }

    // ── Tier 1: load owners ───────────────────────────────────────────────────
    try {
      const classes = selectedClasses;
      if (classes.length === 0) {
        error = 'No asset class selected. Go back and select one.';
        loading = false;
        return;
      }

      const cls = classes[0];

      // Fetch asset type counts in parallel (cached, for debug panel)
      getAssetTypeCounts().then((counts) => {
        availableAssetTypes = Object.entries(counts).map(([asset_type, cnt]) => ({
          asset_type,
          cnt,
        }));
      });

      // When specific owners were selected on the previous page, use pre-fetched
      // data from sessionStorage to avoid a redundant full-owner API call.
      if (selectedOwnerIds.length > 0) {
        try {
          const raw = sessionStorage.getItem('__gem_matched_owners__');
          if (raw) {
            const cached: ScreenerOwner[] = JSON.parse(raw);
            sessionStorage.removeItem('__gem_matched_owners__');
            const idSet = new Set(selectedOwnerIds);
            const matched = cached.filter((o) => idSet.has(o.entityId));
            if (matched.length > 0) {
              owners = matched;
              loading = false;
              return;
            }
          }
        } catch {
          // sessionStorage unavailable — fall through to API fetch
        }
      }

      const statusesArray: string[] | undefined =
        cls?.filters?.statuses && cls.filters.statuses.length > 0
          ? cls.filters.statuses
          : cls?.filters?.status
            ? [cls.filters.status]
            : undefined;

      const geoRaw = cls?.filters?.geography;
      const countryFilter: string | string[] | undefined = Array.isArray(geoRaw)
        ? geoRaw.length > 0 ? geoRaw : undefined
        : geoRaw || undefined;

      const result = await getOwnersByFilter(
        {
          tracker: cls?.tracker || '',
          assetClassId: cls?.assetClassId || cls?.id,
          status: statusesArray,
          country: countryFilter,
          catalogOwnersUrl: cls?.catalogOwnersUrl || undefined,
        },
        { limit: 500 }
      );

      queryTime = result.queryTimeMs;
      dataSource =
        result.source === 'rest-api' ? 'api' : result.source === 'cache' ? 'local' : 'api';

      const slug = resolveApiSlug(cls?.tracker || '');
      const restBase = getAPIBase();
      executedQuery = `GET ${restBase}/owners?asset_type=${slug}\n\nsource=${result.source}`;

      // If specific owners were requested, filter to just those
      const ownerIdSet = selectedOwnerIds.length > 0 ? new Set(selectedOwnerIds) : null;
      owners = result.owners
        .filter((o) => !ownerIdSet || ownerIdSet.has(o.entityId))
        .map((o) => ({
          name: o.name,
          entityId: o.entityId,
          totalAssets: o.totalAssets,
          filteredAssets: o.filteredAssets,
        }));

      loading = false;
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load owners:', err);
      error = (err as Error)?.message || 'Failed to load data';
      loading = false;
    }
  });

  function removeAssetClass(index: number) {
    if (index < 0) return;
    const classes = selectedClasses.filter((_, i) => i !== index);
    const embedSuffix = isEmbed ? (classes.length === 0 ? '?embed=true' : '&embed=true') : '';
    if (classes.length === 0) {
      goto(buildScreenerUrl('screener') + embedSuffix);
    } else {
      goto(
        buildScreenerUrl('screener/results', { classes: JSON.stringify(classes) }) + embedSuffix
      );
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
      Promise.all([
        fetchStatusTaxonomy().catch(() => null),
        ...slugs.map((slug: string) => fetchStatusFacets(slug)),
      ])
        .then(([taxonomy, ...results]) => {
          if (!showEditModal) return;
          const merged = new Map<string, number>();
          for (const fm of results)
            for (const [k, v] of fm) merged.set(k, (merged.get(k) ?? 0) + v);
          const groups = discoverStatusGroups(merged, taxonomy);
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

<svelte:window
  onkeydown={(e) => {
    if (e.key === 'Escape' && chartModalOwner) closeChartModal();
  }}
/>

<svelte:head>
  <title>Screener Results — Global Energy Monitor</title>
  <meta
    name="description"
    content="View companies with ownership stakes in selected asset classes and add them to your investigation."
  />
  <SeoMeta
    title="Screener Results — Global Energy Monitor"
    description="View companies with ownership stakes in selected asset classes and add them to your investigation."
    image="/og/screener.png"
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
  {isEmbed}
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
        <span class="crumb">{cls.name || cls.tracker}</span>
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
        filteredOwners={pagedOwners}
        {classDescription}
        {searchQuery}
        {viewMode}
        selectedOwnerCount={selectedOwnerIds.length}
        {bulkMatchProvenance}
        onToggleExpanded={openChartModal}
        onClearSearch={() => handleOwnerSearch('')}
      />

      {#if totalPages > 1}
        <div class="pagination">
          <button
            class="page-btn"
            onclick={() => (currentPage -= 1)}
            disabled={currentPage === 0}
          >← Prev</button>
          <span class="page-info">
            {currentPage + 1} / {totalPages}
            <span class="page-count">({filteredOwners.length.toLocaleString()} owners)</span>
          </span>
          <button
            class="page-btn"
            onclick={() => (currentPage += 1)}
            disabled={currentPage >= totalPages - 1}
          >Next →</button>
        </div>
      {/if}
    </section>
  </LoadingWrapper>

  <!-- Tier 2: matched entities with no assets in this class -->
  {#if noAssetEntities.length > 0 || noAssetLoading}
    <section class="tier2-section">
      <h3 class="tier2-title">
        Matched {noAssetEntities.length + (noAssetLoading ? '…' : '')}
        {noAssetEntities.length === 1 ? 'company' : 'companies'} with no {selectedClasses[0]?.name || 'assets'} in GEM
      </h3>
      <p class="tier2-desc">
        These companies were found in GEM's entity database but have no recorded ownership
        of {selectedClasses[0]?.name || 'assets in this class'}.
      </p>
      <ul class="tier2-list">
        {#each noAssetEntities as entity}
          <li class="tier2-item">
            <span class="tier2-name">{entity.name}</span>
            {#if entity.country}
              <span class="tier2-country">{entity.country}</span>
            {/if}
          </li>
        {/each}
        {#if noAssetLoading}
          <li class="tier2-item tier2-item--loading">Loading…</li>
        {/if}
      </ul>
    </section>
  {/if}

  <!-- Tier 3: search terms that matched nothing in GEM -->
  {#if nomatchCount > 0}
    <section class="tier3-section">
      <div class="tier3-header">
        <p class="tier3-text">
          <strong>{nomatchCount} {nomatchCount === 1 ? 'term' : 'terms'}</strong> from your search didn't match any company in GEM's database.
        </p>
        {#if unmatchedTerms.length > 0}
          <button class="tier3-toggle" onclick={() => (showUnmatched = !showUnmatched)}>
            {showUnmatched ? 'Hide' : 'Show'} unmatched terms
          </button>
        {/if}
      </div>

      {#if showUnmatched && unmatchedTerms.length > 0}
        <table class="unmatched-table">
          <tbody>
            {#each unmatchedTerms as term}
              <tr>
                <td class="unmatched-term">{term}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </section>
  {/if}

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

  <!-- Fullscreen chart modal -->
  {#if chartModalOwner}
    <div
      class="chart-modal-backdrop"
      bind:this={backdropEl}
      onclick={closeChartModal}
      role="presentation"
    ></div>
    <div
      class="chart-modal"
      bind:this={modalEl}
      role="dialog"
      aria-modal="true"
      aria-label="{chartModalOwner.name} ownership chart"
    >
      <header class="chart-modal-header">
        <div class="chart-modal-title">
          <h3 bind:this={modalNameEl}>{chartModalOwner.name}</h3>
        </div>
        <button class="chart-modal-close" onclick={closeChartModal}>✕</button>
      </header>
      <div class="chart-modal-body">
        <AssetScreenerChart
          entityId={chartModalOwner.entityId}
          entityName={chartModalOwner.name}
          assetClassName={chartAssetClassName}
          trackerSlug={chartTrackerSlug}
          filteredAssetCount={chartModalOwner.filteredAssets}
          statusFilter={selectedClasses[0]?.filters?.statuses}
          trackerFilter={selectedClasses[0]?.gemTrackers}
          fillHeight={true}
        />
      </div>
    </div>
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
      onShowAllOwners={() => handleEditDone('screener/results')}
      onSearchSpecificOwners={() => handleEditDone('screener/owners')}
      onClose={() => (showEditModal = false)}
    />
  {/if}

  {#snippet footer()}
    {#if visualizeOwnerIds.length > 0 && !loading}
      <div class="visualize-footer">
        <span class="footer-summary">
          {visualizeOwnerIds.length}
          {visualizeOwnerIds.length === 1 ? 'company' : 'companies'} selected
        </span>
        <a href={visualizeUrl} class="btn-visualize">Continue to Visualize</a>
      </div>
    {/if}
  {/snippet}
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
    color: var(--gem-teal);
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
    font-size: var(--font-size-sm);
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
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    white-space: nowrap;
    padding: 0;
  }

  .edit-link:hover {
    color: var(--gem-teal);
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
    font-size: var(--font-size-xs);
  }

  .results-title-row :global(.badge .label) {
    font-weight: 500;
    letter-spacing: 0;
    text-transform: none;
  }

  h2 {
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin: 0;
    font-family: Georgia, serif;
  }

  .search-bar {
    margin-bottom: var(--space-3);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-4) 0 var(--space-2);
  }

  .page-btn {
    padding: var(--space-1) var(--space-4);
    font-size: var(--font-size-sm);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .page-btn:hover:not(:disabled) {
    border-color: var(--color-text-secondary);
  }

  .page-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .page-info {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .page-count {
    color: var(--color-text-tertiary);
    margin-left: var(--space-1);
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

  /* ── Visualize footer ────────────────────────── */
  .visualize-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    max-width: var(--container-xl);
    margin: 0 auto;
  }

  .footer-summary {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
  }

  .btn-visualize {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 10px 24px;
    background: var(--gem-primary-blue);
    color: var(--color-white);
    font-size: var(--font-size-base);
    font-weight: 600;
    border: none;
    border-radius: 4px;
    text-decoration: none;
    cursor: pointer;
    transition: background 120ms ease;
  }

  .btn-visualize:hover {
    background: var(--gem-teal);
  }

  /* ── Fullscreen chart modal ──────────────────── */
  .chart-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 9998;
    opacity: 0; /* anime.js controls entrance */
  }

  .chart-modal {
    position: fixed;
    inset: 3vh 3vw;
    background: var(--color-bg-primary, #fff);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 8px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    opacity: 0; /* anime.js controls entrance */
    will-change: transform, opacity;
  }

  .chart-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .chart-modal-title h3 {
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: 500;
    color: var(--color-text-secondary);
    font-family: Georgia, serif;
  }

  .chart-modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-lg);
    padding: 4px 8px;
    line-height: 1;
  }

  .chart-modal-close:hover {
    color: var(--color-text-primary);
  }

  .chart-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 0;
    min-height: 0;
  }


  /* ── Tier 2: matched entities with no assets ───────────────────────────── */
  .tier2-section {
    margin-top: var(--space-8);
    padding: var(--space-5) var(--space-6);
    background: #fffbeb;
    border: 1px solid #f0c040;
    border-radius: var(--radius-sm);
  }

  .tier2-title {
    font-size: var(--font-size-body);
    font-weight: 600;
    margin: 0 0 var(--space-2);
    color: var(--color-text-primary);
  }

  .tier2-desc {
    margin: 0 0 var(--space-4);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .tier2-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .tier2-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--font-size-sm);
  }

  .tier2-item--loading {
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .tier2-name {
    font-weight: 500;
  }

  .tier2-country {
    color: var(--color-text-secondary);
  }

  /* ── Tier 3: unmatched terms ───────────────────────────────────────────── */
  .tier3-section {
    margin-top: var(--space-4);
    padding: var(--space-4) var(--space-6);
    background: var(--color-bg-secondary, #f8f8f8);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .tier3-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    flex-wrap: wrap;
  }

  .tier3-text {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .tier3-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-sm);
    color: var(--gem-primary-blue, #1d4961);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  .tier3-toggle:hover {
    color: var(--color-text-primary);
  }

  .unmatched-table {
    margin-top: var(--space-3);
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .unmatched-term {
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--color-border-light);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono, monospace);
  }

  .unmatched-table tr:last-child .unmatched-term {
    border-bottom: none;
  }
</style>
