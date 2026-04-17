<script lang="ts">
  /**
   * ASSET-CLASS SCREENER - Step 2: Search Owners
   *
   * On mount: fetch full owner list from /owners endpoint for the selected
   * asset class. Use this list to:
   *   - Populate "View all owners" table
   *   - Draw "Try" examples (top 5 owners)
   *   - Cross-reference search results to classify entities as:
   *       Tier 1 – matched entity AND has assets in this class  → navigate to results
   *       Tier 2 – matched entity but NO assets in this class   → inline warning
   *       Tier 3 – term matched nothing in GEM at all           → count + "report missing"
   *
   * Navigation: after search, skip the selection/deduplication step and go
   * straight to results with owners param carrying the Tier 1 entity IDs.
   */

  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import OwnerSearchPanel from '$lib/components/screener/OwnerSearchPanel.svelte';
  import {
    searchEntities,
    searchEntitiesBulk,
    getOwnersByFilter,
    EXCLUDED_ENTITY_IDS,
    type ScreenerOwner,
    type EntitySearchResult,
  } from '$lib/data-config/screener-api';
  import { getExampleCompanies, type ExampleCompany } from '$lib/data-config/screener-config';
  import { buildScreenerUrl, parseJsonSearchParam } from '$lib/screener-url';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // ── URL params ──────────────────────────────────────────────────────────

  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const isEmbed = $derived($page.url.searchParams.get('embed') === 'true');

  const selectedClasses = $derived.by((): ScreenerSelectedClass[] => {
    if (!classesParam) return [];
    const parsed = parseJsonSearchParam<ScreenerSelectedClass[]>(classesParam);
    return Array.isArray(parsed) ? parsed : [];
  });

  const classList = $derived.by(() =>
    selectedClasses.map((item) => ({
      ...item,
      id: item.id || item.assetClassId || item.name || '',
      name: item.name || item.id || 'Unknown',
      tracker: item.tracker || '',
    }))
  );

  // ── URL helpers ─────────────────────────────────────────────────────────

  function buildResultsUrl(params: { owners?: string; noassets?: string; nomatch?: string }) {
    return buildScreenerUrl('screener/results', {
      classes: classesParam || undefined,
      owners: params.owners || undefined,
      noassets: params.noassets || undefined,
      nomatch: params.nomatch || undefined,
    });
  }

  function buildOwnersUrl(nextClassesParam: string) {
    return buildScreenerUrl('screener/owners', {
      classes: nextClassesParam || undefined,
    });
  }

  function removeClass(classToRemove: ScreenerSelectedClass) {
    const removeId = classToRemove?.id || classToRemove?.assetClassId || classToRemove?.name;
    const updated = classList.filter((c) => (c.id || c.assetClassId || c.name) !== removeId);
    goto(buildOwnersUrl(updated.length > 0 ? JSON.stringify(updated) : ''), { replaceState: true });
  }

  // ── All-owners list (loaded on mount) ───────────────────────────────────

  let allOwners = $state<ScreenerOwner[]>([]);
  let allOwnersLoading = $state(false);
  let allOwnersError = $state<string | null>(null);

  /** Map of entityId → ScreenerOwner for O(1) cross-reference during search */
  const ownersMap = $derived(new Map(allOwners.map((o) => [o.entityId, o])));

  /**
   * Top 5 owners used as "Try" examples.
   * Falls back to static screener-config examples while loading or if API returns no names.
   */
  const topExamples = $derived.by((): ExampleCompany[] => {
    const fromApi = allOwners
      .filter((o) => o.name)
      .slice(0, 5)
      .map((o) => ({ name: o.name, id: o.entityId }));
    if (fromApi.length > 0) return fromApi;
    const trackers = classList.map((c) => c.tracker).filter(Boolean);
    return getExampleCompanies(trackers);
  });

  // ── Search state ─────────────────────────────────────────────────────────

  let singleSearchQuery = $state('');
  let bulkSearchText = $state('');
  let searchLoading = $state(false);
  let searchError = $state<string | null>(null);

  // Debug tracking
  let debugApiCalls = $state<{ type: string; params: Record<string, unknown>; time: number }[]>([]);
  let debugLastSearchTime = $state<number | null>(null);

  /** sessionStorage key for passing bulk-match provenance to results page */
  const BULK_MATCH_KEY = '__gem_bulk_match__';
  /** sessionStorage key for passing pre-fetched filtered owner data to results page */
  const MATCHED_OWNERS_KEY = '__gem_matched_owners__';

  // ── Mount: prefetch owner list + handle ?q= prefill ─────────────────────

  onMount(async () => {
    // Prefill single search from URL
    const q = $page.url.searchParams.get('q') || '';
    if (q) {
      singleSearchQuery = q;
      void doSearchSingle();
    }

    if (selectedClasses.length === 0) return;
    const cls = selectedClasses[0];
    if (!cls?.tracker) return;

    allOwnersLoading = true;
    allOwnersError = null;

    try {
      const statuses: string[] =
        cls.filters?.statuses || (cls.filters?.status ? [cls.filters.status] : []);

      const countries = cls.filters?.geography
        ? Array.isArray(cls.filters.geography)
          ? cls.filters.geography
          : [cls.filters.geography]
        : undefined;

      const result = await getOwnersByFilter(
        {
          tracker: cls.tracker,
          assetClassId: cls.assetClassId || cls.id,
          status: statuses.length > 0 ? statuses : undefined,
          country: countries,
          catalogOwnersUrl: cls.catalogOwnersUrl || undefined,
        },
        { skipCache: false }
      );
      allOwners = result.owners;
    } catch (err) {
      allOwnersError = err instanceof Error ? err.message : 'Failed to load owners';
    } finally {
      allOwnersLoading = false;
    }
  });

  // ── Search helpers ───────────────────────────────────────────────────────

  /** True if the term looks like a structured ID rather than a company name. */
  function isIdSearch(term: string): boolean {
    return (
      /^E\d+$/i.test(term) || // GEM Entity ID: E123456
      /^[A-Z0-9]{20}$/.test(term) || // LEI: 20 uppercase alphanumeric chars
      /^\d{10}$/.test(term) // PermID: 10 digits
    );
  }

  /**
   * Fast local search against the pre-loaded owners list.
   * Returns matched ScreenerOwner[] without any API calls.
   *
   * Priority:
   *   1. Exact match (case-insensitive) against entity_id and any external_ids values.
   *      Returns immediately — ID matches are unambiguous.
   *   2. Case-insensitive substring match across all name fields
   *      (name, full_name, name_local, name_other, abbreviation).
   *      May return multiple results.
   */
  function findOwnersLocally(term: string): ScreenerOwner[] {
    if (!term || allOwners.length === 0) return [];
    const upper = term.toUpperCase();

    // 1. Exact ID match — entity_id or any external_ids value
    const idMatches = allOwners.filter(
      (o) =>
        o.entityId.toUpperCase() === upper ||
        o.externalIds?.some((id) => id.toUpperCase() === upper)
    );
    if (idMatches.length > 0) return idMatches;

    // 2. Substring match across all name fields
    const lower = term.toLowerCase();
    return allOwners.filter(
      (o) =>
        o.name.toLowerCase().includes(lower) ||
        o.altNames?.some((n) => n.toLowerCase().includes(lower))
    );
  }

  /**
   * Cross-reference a list of entity search results against the owners map.
   * Returns { withAssets, noAssets }.
   */
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

  async function doSearchSingle() {
    const term = singleSearchQuery.trim();
    if (!term) return;

    searchLoading = true;
    searchError = null;
    debugApiCalls = [{ type: 'searchEntities', params: { query: term }, time: Date.now() }];

    const startTime = performance.now();

    try {
      // Fast path: search pre-loaded owners list before making any API calls
      if (!allOwnersLoading && allOwners.length > 0) {
        const localMatches = findOwnersLocally(term);
        if (localMatches.length > 0) {
          storeMatchedOwners(localMatches.map((o) => o.entityId));
          goto(buildResultsUrl({ owners: localMatches.map((o) => o.entityId).join(',') }));
          return;
        }
      }

      // Fall back to entity API — needed to distinguish "not in GEM at all" from
      // "in GEM but owns no assets in this class"
      const results = await searchEntities(term, { limit: 20 });
      debugLastSearchTime = performance.now() - startTime;

      if (results.length === 0) {
        searchError = `No companies named "${term}" found in GEM.`;
        return;
      }

      // If owner list is still loading, skip cross-reference and go straight to results
      if (allOwnersLoading || allOwners.length === 0) {
        const ownerIds = results.map((r) => r.id).join(',');
        goto(buildResultsUrl({ owners: ownerIds }));
        return;
      }

      const { withAssets, noAssets } = crossRef(results);

      if (withAssets.length === 0) {
        const names = noAssets.map((e) => e.name).join(', ');
        const classLabel = selectedClasses[0]?.name || 'this asset class';
        searchError = `No ${classLabel} assets found for: ${names}`;
        return;
      }

      const ownerIds = withAssets.map((e) => e.id).join(',');
      const noAssetsParam = noAssets.length > 0 ? noAssets.map((e) => e.id).join(',') : undefined;
      storeMatchedOwners(withAssets.map((e) => e.id));
      goto(buildResultsUrl({ owners: ownerIds, noassets: noAssetsParam }));
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Search failed';
      debugLastSearchTime = performance.now() - startTime;
    } finally {
      searchLoading = false;
    }
  }

  async function doSearchBulk() {
    if (!bulkSearchText.trim()) return;

    searchLoading = true;
    searchError = null;
    debugApiCalls = [];

    try {
      // Parse: each line may be tab- or semicolon-delimited; each cell is a candidate.
      type Row = { idCells: string[]; nameCells: string[] };
      const rows: Row[] = bulkSearchText
        .split('\n')
        .map((line) => {
          const cells = line
            .split(/[\t;]/)
            .map((c) => c.trim())
            .filter((c) => c.length > 0);
          return {
            idCells: cells.filter((c) => isIdSearch(c)),
            nameCells: cells.filter((c) => !isIdSearch(c)),
          };
        })
        .filter((r) => r.idCells.length > 0 || r.nameCells.length > 0);

      if (rows.length === 0) return;

      // Build deduped entity map: id → EntitySearchResult
      const resolvedById = new Map<string, EntitySearchResult>();
      const matchedTerms = new Map<string, Set<string>>();

      const addMatch = (e: EntitySearchResult, term: string) => {
        if (!e.id || EXCLUDED_ENTITY_IDS.has(e.id)) return;
        resolvedById.set(e.id, e);
        if (!matchedTerms.has(e.id)) matchedTerms.set(e.id, new Set());
        matchedTerms.get(e.id)!.add(term);
      };

      // Per-row ID resolution flag — if a row's ID cell(s) match, its name cells are suppressed.
      const rowIdResolved = new Array(rows.length).fill(false);
      const locallyMatchedIdTerms = new Set<string>();
      const locallyMatchedNameTerms = new Set<string>();

      // ── Phase 1: Local ID cells only ──────────────────────────────────────
      // Name cells are deferred until after API ID resolution so a row whose ID
      // is found via API doesn't also return local name matches.
      if (!allOwnersLoading && allOwners.length > 0) {
        for (let i = 0; i < rows.length; i++) {
          for (const term of rows[i].idCells) {
            const localMatches = findOwnersLocally(term);
            if (localMatches.length > 0) {
              locallyMatchedIdTerms.add(term);
              rowIdResolved[i] = true;
              for (const o of localMatches) addMatch({ id: o.entityId, name: o.name }, term);
            }
          }
        }
      }

      // ── Phase 2: API ID terms for rows not yet locally resolved ───────────
      const emptyBulk = {
        results: {} as Record<string, EntitySearchResult[]>,
        queryTimeMs: 0,
        source: 'rest-api-sequential' as const,
        apiCallCount: 0,
      };

      const apiIdTerms = [...new Set(rows.flatMap((r, i) => (rowIdResolved[i] ? [] : r.idCells)))]
        .filter((t) => !locallyMatchedIdTerms.has(t))
        .slice(0, 200);

      const idBulkResult =
        apiIdTerms.length > 0
          ? await searchEntitiesBulk(apiIdTerms, { limitPerQuery: 5, maxConcurrent: 10 })
          : emptyBulk;

      for (const [term, entities] of Object.entries(idBulkResult.results)) {
        for (const e of entities) addMatch(e, term);
      }

      // Update rowIdResolved based on API ID results
      for (let i = 0; i < rows.length; i++) {
        if (rowIdResolved[i]) continue;
        if (
          rows[i].idCells.some((c) =>
            (idBulkResult.results[c] ?? []).some((e) => resolvedById.has(e.id))
          )
        ) {
          rowIdResolved[i] = true;
        }
      }

      // ── Phase 3: Local name cells — only for rows still without any ID match ──
      if (!allOwnersLoading && allOwners.length > 0) {
        for (let i = 0; i < rows.length; i++) {
          if (rowIdResolved[i]) continue;
          for (const term of rows[i].nameCells) {
            const localMatches = findOwnersLocally(term);
            if (localMatches.length > 0) {
              locallyMatchedNameTerms.add(term);
              for (const o of localMatches) addMatch({ id: o.entityId, name: o.name }, term);
            }
          }
        }
      }

      // ── Phase 4: API name terms for rows still unresolved ─────────────────
      const apiNameTerms = [
        ...new Set(rows.flatMap((r, i) => (rowIdResolved[i] ? [] : r.nameCells))),
      ]
        .filter((t) => !locallyMatchedNameTerms.has(t))
        .slice(0, 200);

      const nameBulkResult =
        apiNameTerms.length > 0
          ? await searchEntitiesBulk(apiNameTerms, { limitPerQuery: 10, maxConcurrent: 10 })
          : emptyBulk;

      debugLastSearchTime = Math.max(idBulkResult.queryTimeMs, nameBulkResult.queryTimeMs);
      debugApiCalls = [
        {
          type: 'searchEntitiesBulk',
          params: {
            idTerms: apiIdTerms.length,
            nameTerms: apiNameTerms.length,
            localHits: locallyMatchedIdTerms.size + locallyMatchedNameTerms.size,
          },
          time: Date.now(),
        },
      ];

      for (const [term, entities] of Object.entries(nameBulkResult.results)) {
        for (const e of entities) addMatch(e, term);
      }

      // Tier-3: a row is unmatched only if neither ID nor name cells resolved
      let tier3Count = 0;
      const unmatchedTerms: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowResolved =
          rowIdResolved[i] ||
          row.nameCells.some(
            (c) =>
              locallyMatchedNameTerms.has(c) ||
              (nameBulkResult.results[c] ?? []).some((e) => resolvedById.has(e.id))
          );
        if (!rowResolved) {
          tier3Count++;
          unmatchedTerms.push([...row.idCells, ...row.nameCells].join('\t'));
        }
      }

      const allMatched = [...resolvedById.values()];

      if (allMatched.length === 0) {
        searchError = `None of the ${rows.length} entries matched any GEM entity.`;
        return;
      }

      // Cross-reference against owners map (skip if still loading)
      let tier1Ids: string;
      let noAssetsParam: string | undefined;

      if (allOwnersLoading || allOwners.length === 0) {
        tier1Ids = allMatched.map((e) => e.id).join(',');
      } else {
        const { withAssets, noAssets } = crossRef(allMatched);
        if (withAssets.length === 0) {
          const classLabel = selectedClasses[0]?.name || 'this asset class';
          const sample = noAssets
            .slice(0, 3)
            .map((e) => e.name)
            .join(', ');
          const extra = noAssets.length > 3 ? ` and ${noAssets.length - 3} more` : '';
          searchError = `Found ${noAssets.length} matching compan${noAssets.length === 1 ? 'y' : 'ies'} (${sample}${extra}) but none own assets in ${classLabel}.`;
          return;
        }
        tier1Ids = withAssets.map((e) => e.id).join(',');
        noAssetsParam = noAssets.length > 0 ? noAssets.map((e) => e.id).join(',') : undefined;
      }

      // Persist matched-term provenance + unmatched terms for results-page display (best-effort)
      try {
        const provenance: Record<string, string[]> = {};
        for (const [id, terms] of matchedTerms) {
          provenance[id] = [...terms];
        }
        sessionStorage.setItem(BULK_MATCH_KEY, JSON.stringify(provenance));
        sessionStorage.setItem('__gem_unmatched__', JSON.stringify(unmatchedTerms));
      } catch {
        // sessionStorage unavailable — tooltips/unmatched list simply won't appear
      }

      storeMatchedOwners((tier1Ids || '').split(',').filter(Boolean));
      goto(
        buildResultsUrl({
          owners: tier1Ids || undefined,
          noassets: noAssetsParam,
          nomatch: tier3Count > 0 ? String(tier3Count) : undefined,
        })
      );
    } catch (err) {
      searchError = err instanceof Error ? err.message : 'Bulk search failed';
    } finally {
      searchLoading = false;
    }
  }

  async function handleCsvUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      // Auto-detect delimiter: prefer tab, fall back to comma
      const isTabDelimited = text.includes('\t');
      const allLines = text.split('\n');
      const dataLines = allLines.slice(1); // skip header row

      // Normalize to tab-delimited for preview so all columns are visible.
      // Strip surrounding quotes from comma-delimited cells.
      const previewLines: string[] = [];
      for (const line of dataLines) {
        const cells = isTabDelimited
          ? line.split('\t').map((c) => c.trim())
          : line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
        const nonEmpty = cells.filter((c) => c.length > 0);
        if (nonEmpty.length > 0) previewLines.push(nonEmpty.join('\t'));
      }
      // Show in textarea for user review — search runs when they click "Search All"
      bulkSearchText = previewLines.join('\n');
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      searchError = `Failed to parse file: ${reason}. Accepts tab-delimited or comma-delimited CSV (UTF-8).`;
    }
  }

  function useExample(example: { name: string; id?: string }) {
    // If we already know this entity is a valid owner (it came from the owners list),
    // navigate directly to results without going through the search/entity-lookup flow.
    if (example.id && ownersMap.has(example.id)) {
      const owner = ownersMap.get(example.id)!;
      storeMatchedOwners([example.id]);
      goto(buildResultsUrl({ owners: example.id }));
      return;
    }
    singleSearchQuery = example.name;
    doSearchSingle();
  }

  /** Store matched owner data in sessionStorage so results page can skip re-fetching */
  function storeMatchedOwners(entityIds: string[]) {
    try {
      const matched = entityIds
        .map((id) => ownersMap.get(id))
        .filter((o): o is ScreenerOwner => !!o);
      if (matched.length > 0) {
        sessionStorage.setItem(MATCHED_OWNERS_KEY, JSON.stringify(matched));
      }
    } catch {
      // sessionStorage unavailable — results page will fall back to re-fetching
    }
  }

  function showAllAssets() {
    goto(buildResultsUrl({}));
  }
</script>

<svelte:head>
  <title>Find Owners — Global Energy Monitor</title>
  <meta
    name="description"
    content="Search for companies by name, GEM Entity ID, LEI, or Perm ID to analyze their ownership of energy assets."
  />
  <SeoMeta
    title="Find Owners — Global Energy Monitor"
    description="Search for companies by name, GEM Entity ID, LEI, or Perm ID to analyze their ownership of energy assets."
    image="/og/screener.png"
  />
</svelte:head>

<ScreenerLayout
  currentStep={2}
  {isEmbed}
  subtitle="Search owners to see their stakes in selected assets."
  {classesParam}
>
  {#snippet headerRight()}
    <AssetClassesPanel {classesParam} onRemove={removeClass} />
  {/snippet}

  <!-- Search section -->
  <OwnerSearchPanel
    bind:singleSearchQuery
    bind:bulkSearchText
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

  <!-- Browse / View all owners -->
  <section class="show-all-section">
    <h2 class="show-all-title">Want all owners instead?</h2>

    <div class="show-all-actions">
      {#if allOwnersLoading}
        <button class="show-all-btn" onclick={showAllAssets} disabled>Loading owners…</button>
      {:else}
        {@const cls = selectedClasses[0]}
        {@const subLabels = cls?.selectedSubClassLabels ?? []}
        {@const statuses =
          cls?.filters?.statuses ?? (cls?.filters?.status ? [cls.filters.status] : [])}
        {@const geo = cls?.filters?.geography}
        {@const detailParts = [
          subLabels.length > 0 && subLabels.length <= 3
            ? `(${subLabels.join(', ')})`
            : subLabels.length > 3
              ? `(${subLabels.slice(0, 3).join(', ')}…)`
              : '',
          statuses.length > 0
            ? statuses.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
            : '',
          Array.isArray(geo) && geo.length === 1
            ? geo[0]
            : Array.isArray(geo) && geo.length > 1
              ? `${geo.length} countries`
              : typeof geo === 'string' && geo
                ? geo
                : '',
        ].filter(Boolean)}
        {@const detail = cls ? [cls.name, ...detailParts].join(' · ') : ''}
        <div class="show-all-btn-wrap">
          <button class="show-all-btn" onclick={showAllAssets}>
            View all {allOwners.length > 0 ? allOwners.length.toLocaleString() : ''} owners
          </button>
          {#if detail}
            <span class="show-all-detail">{detail}</span>
          {/if}
        </div>
      {/if}
    </div>

    {#if allOwnersError}
      <p class="owners-error">{allOwnersError}</p>
    {/if}
  </section>

  <!-- Debug panel -->
  {#if debugApiCalls.length > 0}
    <DebugPanel title="API Debug" time={debugLastSearchTime}>
      <div class="debug-meta">
        <span class="debug-label">API calls:</span>
        <span class="debug-value">{debugApiCalls.length}</span>
      </div>
      <div class="debug-calls">
        <span class="debug-label">Requests:</span>
        {#each debugApiCalls as call}
          <div class="debug-call">
            <span class="call-type">{call.type}</span>
            <code class="call-params">{JSON.stringify(call.params)}</code>
          </div>
        {/each}
      </div>
    </DebugPanel>
  {/if}
</ScreenerLayout>

<style>
  /* ── Browse all section ─────────────────────────────────────────────── */
  .show-all-section {
    padding-top: var(--space-6);
    margin-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }

  .show-all-title {
    margin: 0 0 var(--space-4) 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .show-all-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .show-all-btn-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .show-all-detail {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .show-all-btn {
    padding: var(--space-2) var(--space-5);
    font-size: var(--font-size-body);
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: var(--border-width) solid var(--color-gray-300);
    cursor: pointer;
    transition: border-color var(--transition-base);
  }

  .show-all-btn:hover:not(:disabled) {
    border-color: var(--color-text-secondary);
  }

  .show-all-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .owners-error {
    margin-top: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-error, #c0392b);
  }

  /* ── Debug ──────────────────────────────────────────────────────────── */
  .debug-meta {
    display: flex;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .debug-label {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .debug-value {
    font-family: var(--font-family-mono);
  }

  .debug-calls {
    margin-top: var(--space-4);
  }

  .debug-call {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: var(--space-2);
    margin-top: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .call-type {
    color: var(--gem-teal);
    font-family: var(--font-family-mono);
    font-weight: 500;
  }

  .call-params {
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: nowrap;
  }
</style>
