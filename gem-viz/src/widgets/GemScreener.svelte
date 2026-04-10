<script lang="ts">
  /**
   * GEM Screener Widget — Shadow DOM version of the 4-step Asset Class Screener.
   *
   * Self-contained: no SvelteKit routing. All step transitions are internal state.
   * Imports existing sub-components from $lib/components/.
   *
   * Props:
   *   classes  — JSON string of pre-selected asset classes (skips to step 2)
   *   owners   — CSV of pre-selected owner IDs (skips to step 3)
   *   step     — initial step (1-4), auto-detected from classes/owners if omitted
   */
  import { onMount } from 'svelte';

  // Step 1 components & data
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import { ALL_ASSET_CLASSES, getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import { gemTrackerToUiTracker } from '$lib/data-config/screener-api';
  import {
    isValidTracker,
    STATUS_GROUPS,
    discoverStatusGroups,
  } from '$lib/data-config/tracker-schema';
  import {
    resolveApiSlug,
    fetchStatusFacets,
    fetchStatusTaxonomy,
  } from './widget-api';
  import {
    fetchAssetClasses,
    buildCatalogUrl,
    buildCatalogTree,
    findSubtree,
    getAllDescendantIds,
  } from '$lib/api/catalog-api';

  // Step 2 components & data
  import OwnerSearchPanel from '$lib/components/screener/OwnerSearchPanel.svelte';
  import {
    searchEntities,
    searchEntitiesBulk,
    getOwnersByFilter,
    EXCLUDED_ENTITY_IDS,
    type ScreenerOwner,
    type EntitySearchResult,
  } from '$lib/data-config/screener-api';
  import { getExampleCompanies } from '$lib/data-config/screener-config';

  // Step 3 components
  import ScreenerOwnersResultsTable from '$lib/components/screener/ScreenerOwnersResultsTable.svelte';
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';

  // Step 4 components
  import ScreenerExportPanel from '$lib/components/screener/ScreenerExportPanel.svelte';

  // Shared
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import ScreenerStepNav from '$lib/components/nav/ScreenerStepNav.svelte';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import { getEntity } from './widget-api';

  // ============================================================================
  // PROPS
  // ============================================================================
  let {
    classes: classesProp = '',
    owners: ownersProp = '',
    step: stepProp = 0,
    linkBase = '',
    linkTarget = '',
  }: {
    classes?: string;
    owners?: string;
    step?: number;
    linkBase?: string;
    linkTarget?: string;
  } = $props();

  // ============================================================================
  // STEP STATE
  // ============================================================================
  let currentStep = $state(1);

  // ============================================================================
  // CATEGORY CONFIG (Step 1)
  // ============================================================================
  const CATEGORY_META = [
    { key: 'multi-tracker', label: 'Multi-Tracker Classes' },
    { key: 'coal-plant', label: 'Coal Plant' },
    { key: 'coal-mine', label: 'Coal Mine' },
    { key: 'oil-gas', label: 'Oil & Gas' },
    { key: 'steel-iron', label: 'Steel & Iron' },
    { key: 'bioenergy', label: 'Bioenergy' },
    { key: 'chemical', label: 'Chemical' },
    { key: 'cement', label: 'Cement' },
  ];

  // ============================================================================
  // STEP 1 STATE — Asset Class Selection
  // ============================================================================
  let catalogClasses = $state<any[]>([]);
  let searchQuery = $state('');
  let selectedClassId = $state<string | null>(null);
  let catalogChildChecks = $state<Record<string, boolean>>({});
  let subClassChecks = $state<Record<string, boolean>>({});
  let groupOptionChecks = $state<Record<string, boolean>>({});
  let statusChecks = $state<Record<string, boolean>>({});
  let geoFilters = $state<string[]>([]);
  let geofence = $state<number[][] | null>(null);
  let dynamicStatusGroups = $state<DynamicStatusGroup[] | null>(null);

  const catalogIdSet = $derived(new Set(catalogClasses.map((c: any) => c.id)));
  const catalogForest = $derived(catalogClasses.length > 0 ? buildCatalogTree(catalogClasses) : []);

  const classesByCategory = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    if (catalogClasses.length > 0) {
      return CATEGORY_META.map((cat) => ({
        ...cat,
        classes: catalogClasses.filter((ac: any) => {
          if (ac.category !== cat.key) return false;
          if (!ac.url) return false;
          if (ac.parent && catalogIdSet.has(ac.parent)) return false;
          if (!q) return true;
          return ac.label.toLowerCase().includes(q);
        }),
      })).filter((cat) => cat.classes.length > 0);
    }
    return CATEGORY_META.map((cat) => ({
      ...cat,
      classes: ALL_ASSET_CLASSES.filter((ac) => {
        if (ac.category !== cat.key || !isEnabled(ac)) return false;
        if (!q) return true;
        return ac.label.toLowerCase().includes(q) || ac.description.toLowerCase().includes(q);
      }),
    })).filter((cat) => cat.classes.length > 0);
  });

  const catalogChildren = $derived(
    selectedClassId
      ? catalogClasses.filter((c: any) => c.parent === selectedClassId)
      : []
  );

  const selectedSubtree = $derived(
    selectedClassId ? findSubtree(catalogForest, selectedClassId) : undefined
  );

  const selectedClass = $derived(selectedClassId ? getAssetClassById(selectedClassId) : null);

  function isEnabled(ac: any) {
    if (ac.trackers.length === 0) return false;
    return ac.trackers.some((t: string) => isValidTracker(gemTrackerToUiTracker(t)));
  }

  const selectedStatuses = $derived.by(() => {
    const statuses: string[] = [];
    const groups =
      dynamicStatusGroups ??
      STATUS_GROUPS.map((sg) => ({
        id: sg.id,
        statuses: sg.statuses.map((s) => ({ value: s })),
      }));
    for (const sg of groups) {
      for (const s of sg.statuses) {
        if (statusChecks[`status-${sg.id}-${(s as any).value ?? s}`]) {
          statuses.push((s as any).value ?? s);
        }
      }
    }
    return statuses;
  });

  function selectClass(classId: string) {
    const catalogEntry = catalogClasses.find((c: any) => c.id === classId);
    const ac = getAssetClassById(classId);
    if (!catalogEntry?.url && !ac) return;
    if (!catalogEntry?.url && ac && !isEnabled(ac)) return;

    selectedClassId = classId;
    searchQuery = '';
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;

    // Init catalog child checks
    const initialCatalogChecks: Record<string, boolean> = {};
    const subtree = findSubtree(catalogForest, classId);
    if (subtree) {
      for (const id of getAllDescendantIds(subtree)) {
        if (id !== classId) initialCatalogChecks[id] = true;
      }
    }
    catalogChildChecks = initialCatalogChecks;

    // Init sub-class checks
    const initialSubClassChecks: Record<string, boolean> = {};
    if (ac?.subClasses) {
      for (const sc of ac.subClasses) {
        initialSubClassChecks[sc.id] = sc.defaultChecked ?? true;
      }
    }
    subClassChecks = initialSubClassChecks;

    // Init group option checks
    const initialGroupChecks: Record<string, boolean> = {};
    if (ac?.subClassGroups) {
      for (const group of ac.subClassGroups) {
        for (const opt of group.options) {
          initialGroupChecks[opt.id] = opt.defaultChecked ?? true;
        }
      }
    }
    groupOptionChecks = initialGroupChecks;

    // Init status checks
    const initialStatusChecks: Record<string, boolean> = {};
    for (const sg of STATUS_GROUPS) {
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s}`;
        initialStatusChecks[key] = sg.id === 'operating' || sg.id === 'planned';
      }
    }
    statusChecks = initialStatusChecks;

    fetchStatusFacetsForClass(ac, catalogEntry, classId);
  }

  async function fetchStatusFacetsForClass(ac: any, catalogEntry: any, classId: string) {
    try {
      let slugs: string[] = [];
      if (ac?.trackers?.length) {
        slugs = ac.trackers.map((t: string) => resolveApiSlug(gemTrackerToUiTracker(t))).filter(Boolean);
      } else if (catalogEntry?.url) {
        const params = new URLSearchParams(catalogEntry.url.split('?')[1] ?? '');
        const types = params.getAll('asset_type');
        slugs = types.map((t: string) => resolveApiSlug(t) ?? t).filter(Boolean);
      }
      if (slugs.length === 0) return;

      const [taxonomyResult, ...facetResults] = await Promise.all([
        fetchStatusTaxonomy().catch(() => null),
        ...slugs.map((slug: string) => fetchStatusFacets(slug)),
      ]);

      const mergedFacets = new Map();
      for (const facetMap of facetResults) {
        for (const [status, count] of facetMap) {
          mergedFacets.set(status, (mergedFacets.get(status) ?? 0) + count);
        }
      }

      if (selectedClassId !== classId) return;

      const groups = discoverStatusGroups(mergedFacets, taxonomyResult);
      dynamicStatusGroups = groups;

      const discoveredStatusChecks: Record<string, boolean> = {};
      for (const sg of groups) {
        for (const s of sg.statuses) {
          discoveredStatusChecks[`status-${sg.id}-${s.value}`] = sg.id === 'operating' || sg.id === 'planned';
        }
      }
      statusChecks = discoveredStatusChecks;
    } catch {
      // Fall back to hardcoded groups
    }
  }

  function clearSelection() {
    selectedClassId = null;
    subClassChecks = {};
    groupOptionChecks = {};
    catalogChildChecks = {};
    statusChecks = {};
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
  }

  function buildClassData(): ScreenerSelectedClass[] {
    if (!selectedClassId) return [];
    const catalogEntry = catalogClasses.find((c: any) => c.id === selectedClassId);
    const ac = getAssetClassById(selectedClassId);
    const label = catalogEntry?.label ?? ac?.label ?? selectedClassId;
    const trackers = ac?.trackers ?? [];
    const tracker = trackers.length > 0 ? gemTrackerToUiTracker(trackers[0]) : '';

    const selectedSubClassIds = [
      ...Object.entries(subClassChecks).filter(([, v]) => v).map(([k]) => k),
      ...Object.entries(groupOptionChecks).filter(([, v]) => v).map(([k]) => k),
    ];

    let catalogUrl: string | undefined;
    if (catalogEntry?.url) {
      const selectedChildUrls = catalogChildren
        .filter((c: any) => catalogChildChecks[c.id] !== false && c.url)
        .map((c: any) => c.url);
      catalogUrl = buildCatalogUrl(catalogEntry.url, selectedChildUrls, { statusValues: selectedStatuses, substatusValues: [] }, geoFilters);
    }

    return [{
      id: selectedClassId,
      name: label,
      description: ac?.description ?? '',
      tracker,
      filters: {
        geography: geoFilters.length > 0 ? geoFilters : undefined,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      },
      assetClassId: selectedClassId,
      selectedSubClasses: selectedSubClassIds,
      gemTrackers: trackers,
      catalogUrl,
    }] as any;
  }

  // ============================================================================
  // STEP 2 STATE — Owner Search
  // ============================================================================
  let singleSearchQuery = $state('');
  let bulkSearchText = $state('');
  let strictMatchOnly = $state(false);
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);
  let allOwners = $state<ScreenerOwner[]>([]);
  let allOwnersLoading = $state(false);
  let allOwnersError = $state<string | null>(null);

  const ownersMap = $derived(new Map(allOwners.map((o) => [o.entityId, o])));

  const topExamples = $derived.by(() => {
    const fromApi = allOwners
      .filter((o) => o.name)
      .slice(0, 5)
      .map((o) => ({ name: o.name, id: o.entityId }));
    if (fromApi.length > 0) return fromApi;
    const trackers = selectedClasses.map((c: any) => c.tracker).filter(Boolean);
    return getExampleCompanies(trackers);
  });

  // Shared state: the serialized classes param (used across steps 2-4)
  let classesParam = $state('');
  let selectedClasses = $state<ScreenerSelectedClass[]>([]);

  // Selected owner IDs (from step 2 search or step 3 selection)
  let selectedOwnerIds = $state<string[]>([]);

  function isIdSearch(term: string): boolean {
    return (
      /^E\d+$/i.test(term) ||
      /^[A-Z0-9]{20}$/.test(term) ||
      /^\d{10}$/.test(term)
    );
  }

  function filterByName(results: EntitySearchResult[], term: string): EntitySearchResult[] {
    if (isIdSearch(term)) return results;
    const lower = term.toLowerCase();
    if (strictMatchOnly) {
      return results.filter((e) => e.name.toLowerCase() === lower);
    }
    return results.filter((e) => e.name.toLowerCase().includes(lower));
  }

  function crossRef(entities: EntitySearchResult[]) {
    const withAssets: EntitySearchResult[] = [];
    const noAssets: EntitySearchResult[] = [];
    for (const e of entities) {
      if (ownersMap.has(e.id)) {
        withAssets.push(e);
      } else {
        noAssets.push(e);
      }
    }
    return { withAssets, noAssets };
  }

  async function loadOwnersForClass() {
    if (selectedClasses.length === 0) return;
    const cls = selectedClasses[0];
    if (!cls?.tracker) return;

    allOwnersLoading = true;
    allOwnersError = null;
    try {
      const statuses: string[] =
        cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);
      const countries = cls.filters?.geography
        ? Array.isArray(cls.filters.geography) ? cls.filters.geography : [cls.filters.geography]
        : undefined;

      const result = await getOwnersByFilter({
        tracker: cls.tracker,
        assetClassId: cls.assetClassId || cls.id,
        status: statuses.length > 0 ? statuses : undefined,
        country: countries,
      }, { limit: 500 });
      allOwners = result.owners;
    } catch (err) {
      allOwnersError = err instanceof Error ? err.message : 'Failed to load owners';
    } finally {
      allOwnersLoading = false;
    }
  }

  async function doSearchSingle() {
    const term = singleSearchQuery.trim();
    if (!term) return;
    searchLoading = true;
    searchError = null;
    try {
      const rawResults = await searchEntities(term, { limit: 20 });
      const results = filterByName(rawResults, term);
      if (results.length === 0) {
        searchError = rawResults.length > 0
          ? `No companies with "${term}" in their name found in GEM.`
          : `No companies named "${term}" found in GEM.`;
        return;
      }
      if (allOwnersLoading || allOwners.length === 0) {
        selectedOwnerIds = results.map((r) => r.id);
        goToStep(3);
        return;
      }
      const { withAssets, noAssets } = crossRef(results);
      if (withAssets.length === 0) {
        const classLabel = selectedClasses[0]?.name || 'this asset class';
        searchError = `No ${classLabel} assets found for: ${noAssets.map(e => e.name).join(', ')}`;
        return;
      }
      selectedOwnerIds = withAssets.map((e) => e.id);
      noAssetEntities = noAssets.map(e => ({ id: e.id, name: e.name, country: e.headquartersCountry || null }));
      goToStep(3);
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Search failed';
    } finally {
      searchLoading = false;
    }
  }

  async function doSearchBulk() {
    if (!bulkSearchText.trim()) return;
    searchLoading = true;
    searchError = null;
    try {
      type Row = { idCells: string[]; nameCells: string[] };
      const rows: Row[] = bulkSearchText
        .split('\n')
        .map((line) => {
          const cells = line.split('\t').map((c) => c.trim()).filter((c) => c.length > 0);
          return {
            idCells: cells.filter((c) => isIdSearch(c)),
            nameCells: cells.filter((c) => !isIdSearch(c)),
          };
        })
        .filter((r) => r.idCells.length > 0 || r.nameCells.length > 0);

      if (rows.length === 0) return;

      const allIdTerms = [...new Set(rows.flatMap((r) => r.idCells))].slice(0, 200);
      const allNameTerms = [...new Set(rows.flatMap((r) => r.nameCells))].slice(0, 200);

      const emptyResult = { results: {} as Record<string, EntitySearchResult[]>, queryTimeMs: 0, source: 'rest-api-sequential' as const, apiCallCount: 0 };
      const [idBulkResult, nameBulkResult] = await Promise.all([
        allIdTerms.length > 0 ? searchEntitiesBulk(allIdTerms, { limitPerQuery: 5, maxConcurrent: 10 }) : Promise.resolve(emptyResult),
        allNameTerms.length > 0 ? searchEntitiesBulk(allNameTerms, { limitPerQuery: 10, maxConcurrent: 10 }) : Promise.resolve(emptyResult),
      ]);

      const resolvedById = new Map<string, EntitySearchResult>();
      const matchedTerms = new Map<string, Set<string>>();
      const addMatch = (e: EntitySearchResult, term: string) => {
        if (!e.id || EXCLUDED_ENTITY_IDS.has(e.id)) return;
        resolvedById.set(e.id, e);
        if (!matchedTerms.has(e.id)) matchedTerms.set(e.id, new Set());
        matchedTerms.get(e.id)!.add(term);
      };

      for (const [term, entities] of Object.entries(idBulkResult.results)) {
        for (const e of entities) addMatch(e, term);
      }
      for (const [term, entities] of Object.entries(nameBulkResult.results)) {
        const filtered = filterByName(entities, term);
        for (const e of filtered) addMatch(e, term);
      }

      const allMatched = [...resolvedById.values()];
      if (allMatched.length === 0) {
        searchError = `None of the ${rows.length} entries matched any GEM entity.`;
        return;
      }

      if (allOwnersLoading || allOwners.length === 0) {
        selectedOwnerIds = allMatched.map((e) => e.id);
      } else {
        const { withAssets, noAssets } = crossRef(allMatched);
        if (withAssets.length === 0) {
          const classLabel = selectedClasses[0]?.name || 'this asset class';
          searchError = `Found matching companies but none own assets in ${classLabel}.`;
          return;
        }
        selectedOwnerIds = withAssets.map((e) => e.id);
      }

      // Store provenance for results display
      const provenance: Record<string, string[]> = {};
      for (const [id, terms] of matchedTerms) {
        provenance[id] = [...terms];
      }
      bulkMatchProvenance = provenance;

      goToStep(3);
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Bulk search failed';
    } finally {
      searchLoading = false;
    }
  }

  function handleCsvUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    file.text().then((text) => {
      const isTabDelimited = text.includes('\t');
      const dataLines = text.split('\n').slice(1);
      const previewLines: string[] = [];
      for (const line of dataLines) {
        const cells = isTabDelimited
          ? line.split('\t').map((c) => c.trim())
          : line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
        const nonEmpty = cells.filter((c) => c.length > 0);
        if (nonEmpty.length > 0) previewLines.push(nonEmpty.join('\t'));
      }
      bulkSearchText = previewLines.join('\n');
    });
  }

  function useExample(example: { name: string; id?: string }) {
    singleSearchQuery = example.name;
    doSearchSingle();
  }

  // ============================================================================
  // STEP 3 STATE — Results
  // ============================================================================
  let resultsLoading = $state(true);
  let resultsError = $state<string | null>(null);
  let owners = $state<ScreenerOwner[]>([]);
  let noAssetEntities = $state<{ id: string; name: string; country?: string | null }[]>([]);
  let bulkMatchProvenance = $state<Record<string, string[]>>({});
  let resultsSearchQuery = $state('');
  let chartModalOwner = $state<{ entityId: string; name: string } | null>(null);
  const PAGE_SIZE = 100;
  let currentPage = $state(0);

  const classDescription = $derived.by(() => {
    if (selectedClasses.length === 0) return 'selected assets';
    const cls = selectedClasses[0];
    const trackerName = cls.tracker || cls.name || 'assets';
    const parts: string[] = [];
    const statuses: string[] = cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);
    if (statuses.length === 1) parts.push(statuses[0]);
    else if (statuses.length > 1 && statuses.length <= 3) parts.push(statuses.join('/'));
    parts.push(trackerName);
    if (cls.filters?.geography) {
      const geo = cls.filters.geography;
      if (Array.isArray(geo)) {
        if (geo.length === 1) parts.push(`in ${geo[0]}`);
        else if (geo.length > 1) parts.push(`in ${geo.length} countries`);
      } else parts.push(`in ${geo}`);
    }
    return parts.join(' ');
  });

  const viewMode = $derived(selectedOwnerIds.length > 0 ? 'filtered' : 'all');

  const filteredOwners = $derived.by(() => {
    let list = owners;
    if (selectedOwnerIds.length > 0) {
      const idSet = new Set(selectedOwnerIds);
      list = list.filter((o) => idSet.has(o.entityId));
    }
    if (resultsSearchQuery.trim()) {
      const q = resultsSearchQuery.trim().toLowerCase();
      list = list.filter((o) => o.name?.toLowerCase().includes(q));
    }
    return list;
  });

  const totalPages = $derived(Math.ceil(filteredOwners.length / PAGE_SIZE));
  const pagedOwners = $derived(filteredOwners.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE));

  async function loadResults() {
    if (selectedClasses.length === 0) return;
    resultsLoading = true;
    resultsError = null;
    try {
      const cls = selectedClasses[0];
      const statuses: string[] = cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);
      const countries = cls.filters?.geography
        ? Array.isArray(cls.filters.geography) ? cls.filters.geography : [cls.filters.geography]
        : undefined;

      const result = await getOwnersByFilter({
        tracker: cls.tracker,
        assetClassId: cls.assetClassId || cls.id,
        status: statuses.length > 0 ? statuses : undefined,
        country: countries,
      }, { limit: 500 });
      owners = result.owners;
    } catch (err) {
      resultsError = err instanceof Error ? err.message : 'Failed to load results';
    } finally {
      resultsLoading = false;
    }
  }

  function openChartModal(entityId: string) {
    const owner = owners.find((o) => o.entityId === entityId);
    if (!owner) return;
    chartModalOwner = owner;
  }

  function closeChartModal() {
    chartModalOwner = null;
  }

  // ============================================================================
  // STEP 4 STATE — Visualize
  // ============================================================================
  let vizOwners = $state<{ entityId: string; name: string }[]>([]);
  let vizLoading = $state(true);
  let assetsByOwner = $state(new Map());

  const chartAssetClassName = $derived(selectedClasses.length > 0 ? selectedClasses[0]?.tracker || selectedClasses[0]?.name || '' : '');
  const chartTrackerSlug = $derived(selectedClasses.length > 0 ? selectedClasses[0]?.id || '' : '');

  async function loadVisualization() {
    if (selectedOwnerIds.length === 0) return;
    vizLoading = true;
    try {
      const results = await Promise.all(
        selectedOwnerIds.slice(0, 20).map(async (id) => {
          try {
            const entity = await getEntity(id);
            return { entityId: id, name: entity?.name || entity?.fullName || id };
          } catch {
            return { entityId: id, name: id };
          }
        })
      );
      vizOwners = results;
    } finally {
      vizLoading = false;
    }
  }

  function handleDataLoaded(data: { entityId: string; assets: any[] }) {
    const next = new Map(assetsByOwner);
    next.set(data.entityId, data.assets);
    assetsByOwner = next;
  }

  // ============================================================================
  // STEP NAVIGATION
  // ============================================================================
  function goToStep(step: number) {
    currentStep = step;

    if (step === 2) {
      loadOwnersForClass();
    } else if (step === 3) {
      loadResults();
    } else if (step === 4) {
      loadVisualization();
    }
  }

  /** Step 1 → Step 2/3: finalize class selection and advance */
  function onShowAllOwners() {
    const classData = buildClassData();
    if (classData.length === 0) return;
    classesParam = JSON.stringify(classData);
    selectedClasses = classData;
    selectedOwnerIds = [];
    goToStep(3);
  }

  function onSearchSpecificOwners() {
    const classData = buildClassData();
    if (classData.length === 0) return;
    classesParam = JSON.stringify(classData);
    selectedClasses = classData;
    goToStep(2);
  }

  function goToVisualize() {
    if (selectedOwnerIds.length === 0) {
      // Use all visible owners
      selectedOwnerIds = filteredOwners.slice(0, 20).map((o) => o.entityId);
    }
    goToStep(4);
  }

  function goBack() {
    if (currentStep > 1) {
      currentStep = currentStep - 1;
    }
  }

  // ============================================================================
  // ============================================================================
  // INIT
  // ============================================================================
  onMount(() => {
    // Fetch catalog classes
    fetchAssetClasses().then((classes) => {
      if (classes.length > 0) catalogClasses = classes;
    });

    // Parse initial props
    if (classesProp) {
      try {
        const parsed = JSON.parse(classesProp);
        if (Array.isArray(parsed) && parsed.length > 0) {
          classesParam = classesProp;
          selectedClasses = parsed;
          if (ownersProp) {
            selectedOwnerIds = ownersProp.split(',').filter((id) => id.trim());
            currentStep = stepProp || 3;
            loadResults();
          } else {
            currentStep = stepProp || 2;
            loadOwnersForClass();
          }
          return;
        }
      } catch { /* ignore */ }
    }
    currentStep = stepProp || 1;
  });
</script>

<div class="gem-screener">
  <!-- Step Nav — reuses ScreenerStepNav from $lib -->
  <ScreenerStepNav currentStep={currentStep} isEmbed={true} onStepClick={(n) => { currentStep = n; }} />

  <div class="step-content">
    <!-- ════════════════════════════════════════════════════════════════ -->
    <!-- STEP 1: Asset Class Selection -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    {#if currentStep === 1}
      <div class="step-header">
        <h2>Select an Asset Class</h2>
        <p class="step-subtitle">Evaluate companies' ownership stakes in classes of fossil fuel assets.</p>
      </div>

      <div class="picker-section">
        <div class="picker-search">
          <input
            type="text"
            class="picker-search-input"
            placeholder="Search asset classes..."
            bind:value={searchQuery}
          />
        </div>
        {#each classesByCategory as cat (cat.key)}
          <div class="picker-category">
            <span class="picker-category-label">{cat.label}</span>
            <div class="picker-grid">
              {#each cat.classes as ac (ac.id)}
                {@const staticAc = getAssetClassById(ac.id)}
                <button
                  class="picker-tile"
                  class:selected={selectedClassId === ac.id}
                  onclick={() => selectClass(ac.id)}
                >
                  <span class="tile-label">{ac.label}</span>
                  {#if ac.description || staticAc?.description}
                    <span class="tile-desc">{ac.description ?? staticAc?.description}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>

      {#if selectedClassId}
        {@const staticAc = getAssetClassById(selectedClassId)}
        {@const catalogEntry = catalogClasses.find((c) => c.id === selectedClassId)}
        {@const expansionClass = staticAc ?? {
          id: selectedClassId,
          label: catalogEntry?.label ?? selectedClassId,
          description: '',
          category: catalogEntry?.category ?? '',
          trackers: [],
          availableFilters: { status: true, geography: true },
        }}
        <AssetClassExpansion
          assetClass={expansionClass}
          bind:subClassChecks
          bind:groupOptionChecks
          bind:statusChecks
          bind:geoFilters
          bind:geofence
          {dynamicStatusGroups}
          catalogChildren={catalogChildren}
          catalogTree={selectedSubtree ? selectedSubtree.children : []}
          bind:catalogChildChecks
          onShowAllOwners={onShowAllOwners}
          onSearchSpecificOwners={onSearchSpecificOwners}
          onClose={clearSelection}
        />
      {/if}

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!-- STEP 2: Owner Search -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    {:else if currentStep === 2}
      <div class="step-header">
        <div class="step-header-row">
          <div>
            <h2>Search Owners</h2>
            <p class="step-subtitle">Search by company name, GEM Entity ID, or LEI.</p>
          </div>
          {#if classesParam}
            <AssetClassesPanel {classesParam} variant="badge" />
          {/if}
        </div>
      </div>

      <OwnerSearchPanel
        bind:singleSearchQuery
        bind:bulkSearchText
        bind:strictMatchOnly
        {searchLoading}
        {searchError}
        exampleCompanies={topExamples.length > 0 ? topExamples : []}
        ownerCount={allOwners.length > 0 ? allOwners.length : null}
        ownerCountLoading={allOwnersLoading}
        onSearchSingle={doSearchSingle}
        onSearchBulk={doSearchBulk}
        onUseExample={useExample}
        onCsvUpload={handleCsvUpload}
      />

      <section class="show-all-section">
        <button class="show-all-btn" onclick={() => { selectedOwnerIds = []; goToStep(3); }}>
          View all {allOwners.length > 0 ? allOwners.length.toLocaleString() : ''} owners
        </button>
      </section>

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!-- STEP 3: Results -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    {:else if currentStep === 3}
      <div class="step-header">
        <div class="step-header-row">
          <div>
            <h2>
              {filteredOwners.length}
              {viewMode === 'filtered' ? 'selected' : ''}
              owners
            </h2>
          </div>
          <div class="step-actions">
            {#if selectedOwnerIds.length > 0}
              <button class="action-btn" onclick={goToVisualize}>
                Visualize {selectedOwnerIds.length} owners →
              </button>
            {:else}
              <button class="action-btn" onclick={goToVisualize}>
                Visualize top owners →
              </button>
            {/if}
          </div>
        </div>
      </div>

      {#if resultsLoading}
        <div class="loading">Loading owners…</div>
      {:else if resultsError}
        <div class="error">{resultsError}</div>
      {:else}
        <div class="results-search">
          <input
            type="text"
            placeholder="Filter owners..."
            bind:value={resultsSearchQuery}
            class="picker-search-input"
          />
        </div>

        <ScreenerOwnersResultsTable
          filteredOwners={pagedOwners}
          {classDescription}
          searchQuery={resultsSearchQuery}
          {viewMode}
          selectedOwnerCount={selectedOwnerIds.length}
          {bulkMatchProvenance}
          {linkBase}
          {linkTarget}
          onToggleExpanded={openChartModal}
          onClearSearch={() => { resultsSearchQuery = ''; }}
        />

        {#if totalPages > 1}
          <div class="pagination">
            <button class="page-btn" onclick={() => (currentPage -= 1)} disabled={currentPage === 0}>← Prev</button>
            <span class="page-info">{currentPage + 1} / {totalPages}</span>
            <button class="page-btn" onclick={() => (currentPage += 1)} disabled={currentPage >= totalPages - 1}>Next →</button>
          </div>
        {/if}

        {#if noAssetEntities.length > 0}
          <section class="tier2-section">
            <h3>Matched {noAssetEntities.length} companies with no {selectedClasses[0]?.name || 'assets'} in GEM</h3>
            <ul class="tier2-list">
              {#each noAssetEntities as entity}
                <li>{entity.name} {#if entity.country}<span class="tier2-country">({entity.country})</span>{/if}</li>
              {/each}
            </ul>
          </section>
        {/if}
      {/if}

      <!-- Chart modal -->
      {#if chartModalOwner}
        <div class="chart-modal-backdrop" onclick={closeChartModal} role="presentation"></div>
        <div class="chart-modal" role="dialog" aria-modal="true">
          <header class="chart-modal-header">
            <h3>{chartModalOwner.name}</h3>
            <button class="chart-modal-close" onclick={closeChartModal}>✕</button>
          </header>
          <div class="chart-modal-body">
            <AssetScreenerChart
              entityId={chartModalOwner.entityId}
              entityName={chartModalOwner.name}
              assetClassName={chartAssetClassName}
              trackerSlug={chartTrackerSlug}
              fillHeight={true}
            />
          </div>
        </div>
      {/if}

    <!-- ════════════════════════════════════════════════════════════════ -->
    <!-- STEP 4: Visualize -->
    <!-- ════════════════════════════════════════════════════════════════ -->
    {:else if currentStep === 4}
      <div class="step-header">
        <h2>Ownership Visualization</h2>
        <p class="step-subtitle">{vizOwners.length} owners in {chartAssetClassName || 'selected class'}</p>
      </div>

      {#if vizLoading}
        <div class="loading">Loading owner data…</div>
      {:else}
        <div class="viz-grid">
          {#each vizOwners as owner (owner.entityId)}
            <div class="viz-card">
              <h3 class="viz-card-name">{owner.name}</h3>
              <AssetScreenerChart
                entityId={owner.entityId}
                entityName={owner.name}
                assetClassName={chartAssetClassName}
                trackerSlug={chartTrackerSlug}
                onDataLoaded={handleDataLoaded}
              />
            </div>
          {/each}
        </div>

        <ScreenerExportPanel
          assets={[...assetsByOwner.values()].flat()}
          owners={vizOwners}
          assetClassName={chartAssetClassName}
        />
      {/if}
    {/if}
  </div>
</div>

<style>
  .gem-screener {
    font-family: var(--font-family, 'Plus Jakarta Sans', sans-serif);
    color: var(--color-text-primary, #1a2332);
    max-width: var(--container-content);
    margin: 0 auto;
  }

  /* Step Header */
  .step-header {
    margin-bottom: var(--space-5, 1.25rem);
  }

  .step-header h2 {
    margin: 0;
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 700;
    color: var(--color-text-primary, #1a2332);
  }

  .step-subtitle {
    margin: var(--space-1, 0.25rem) 0 0;
    color: var(--color-text-secondary, #64748b);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .step-header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-4, 1rem);
    flex-wrap: wrap;
  }

  .step-actions {
    display: flex;
    gap: var(--space-2, 0.5rem);
  }

  /* Action buttons */
  .action-btn {
    padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    background: var(--gem-teal, #1d4961);
    color: white;
    border: none;
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .action-btn:hover {
    filter: brightness(0.95);
  }

  /* Picker */
  .picker-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-6, 1.5rem);
    margin-bottom: var(--space-6, 1.5rem);
  }

  .picker-search-input {
    width: 100%;
    padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
    font-size: var(--font-size-body, 1rem);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-primary);
    outline: none;
    box-sizing: border-box;
  }

  .picker-search-input:focus {
    border-color: var(--gem-teal, #1d4961);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--gem-teal, #1d4961) 15%, transparent);
  }

  .picker-category-label {
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary, #94a3b8);
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-3, 0.75rem);
  }

  .picker-tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 0.25rem);
    padding: var(--space-4, 1rem) var(--space-5, 1.25rem);
    background: var(--color-bg-primary, #fff);
    border: 2px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    text-align: left;
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .picker-tile:hover {
    border-color: var(--color-gray-400, #9ca3af);
    box-shadow: var(--shadow-md, 0 2px 8px rgba(0, 0, 0, 0.08));
  }

  .picker-tile.selected {
    border-color: var(--gem-teal, #1d4961);
    background: var(--gem-teal-10, #e9eef1);
  }

  .tile-label {
    font-size: var(--font-size-body, 1rem);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .tile-desc {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--color-text-tertiary, #94a3b8);
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Show all */
  .show-all-section {
    margin-top: var(--space-5, 1.25rem);
    padding: var(--space-4, 1rem);
    border-top: 1px solid var(--color-gray-200, #e5e7eb);
  }

  .show-all-btn {
    padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
    background: var(--color-bg-secondary, #f8fafc);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--color-text-primary);
  }

  .show-all-btn:hover {
    border-color: var(--gem-teal, #1d4961);
  }

  /* Results search */
  .results-search {
    margin-bottom: var(--space-4, 1rem);
  }

  /* Loading / Error */
  .loading {
    padding: var(--space-6, 1.5rem);
    text-align: center;
    color: var(--color-text-tertiary, #94a3b8);
    font-size: var(--font-size-sm, 0.875rem);
  }

  .error {
    padding: var(--space-4, 1rem);
    color: var(--color-error, #dc2626);
    background: color-mix(in srgb, var(--color-error, #dc2626) 5%, transparent);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 0.875rem);
  }

  /* Pagination */
  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3, 0.75rem);
    margin-top: var(--space-4, 1rem);
    padding: var(--space-3, 0.75rem) 0;
  }

  .page-btn {
    padding: var(--space-1, 0.25rem) var(--space-3, 0.75rem);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-primary, #fff);
    cursor: pointer;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .page-info {
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--color-text-secondary, #64748b);
  }

  /* Tier 2 */
  .tier2-section {
    margin-top: var(--space-5, 1.25rem);
    padding: var(--space-4, 1rem);
    background: var(--color-bg-secondary, #f8fafc);
    border-radius: var(--radius-sm, 4px);
  }

  .tier2-section h3 {
    margin: 0 0 var(--space-2, 0.5rem);
    font-size: var(--font-size-sm, 0.875rem);
    color: var(--color-text-secondary, #64748b);
  }

  .tier2-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .tier2-list li {
    padding: var(--space-1, 0.25rem) 0;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .tier2-country {
    color: var(--color-text-tertiary, #94a3b8);
  }

  /* Chart modal */
  .chart-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    z-index: 100;
  }

  .chart-modal {
    position: fixed;
    inset: 3vh 3vw;
    background: var(--color-bg-primary, #fff);
    border-radius: 8px;
    z-index: 101;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .chart-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    flex-shrink: 0;
  }

  .chart-modal-header h3 {
    margin: 0;
    font-size: var(--font-size-md, 1rem);
    font-weight: 500;
    color: var(--color-text-secondary, #64748b);
    font-family: Georgia, serif;
  }

  .chart-modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary, #94a3b8);
    font-size: var(--font-size-lg, 1.125rem);
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


  /* Viz grid */
  .viz-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
    gap: var(--space-5, 1.25rem);
    margin-bottom: var(--space-5, 1.25rem);
  }

  .viz-card {
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    overflow: hidden;
  }

  .viz-card-name {
    margin: 0;
    padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
    font-size: var(--font-size-body, 1rem);
    font-weight: 600;
    border-bottom: 1px solid var(--color-gray-200, #e5e7eb);
    background: var(--color-bg-secondary, #f8fafc);
  }

  @media (max-width: 640px) {
    .viz-grid {
      grid-template-columns: 1fr;
    }
    .picker-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
