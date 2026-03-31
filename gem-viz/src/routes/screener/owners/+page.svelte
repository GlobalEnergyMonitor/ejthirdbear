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
  import { onMount, tick } from 'svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import SectionHeader from '$lib/components/nav/SectionHeader.svelte';
  import OwnerSearchPanel from '$lib/components/screener/OwnerSearchPanel.svelte';
  import {
    searchEntities,
    searchEntitiesBulk,
    getOwnersByFilter,
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

  function buildResultsUrl(params: {
    owners?: string;
    noassets?: string;
    nomatch?: string;
  }) {
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
  let showAllOwnersTable = $state(false);

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

  /**
   * After a single search: entities that matched GEM but have no assets
   * in the selected class. Shown as inline warning instead of navigating.
   */

  // Debug tracking
  let debugApiCalls = $state<{ type: string; params: Record<string, unknown>; time: number }[]>([]);
  let debugLastSearchTime = $state<number | null>(null);

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
        cls.filters?.statuses ||
        (cls.filters?.status ? [cls.filters.status] : []);

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
        },
        { limit: 500 }
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
      /^E\d+$/i.test(term) ||           // GEM Entity ID: E123456
      /^[A-Z0-9]{20}$/.test(term) ||    // LEI: 20 uppercase alphanumeric chars
      /^\d{10}$/.test(term)              // PermID: 10 digits
    );
  }

  /**
   * Filter entity search results to only those whose name actually contains
   * the search term (case-insensitive substring). Skip this for ID searches
   * since the name won't match an ID string.
   *
   * This prevents the API's fuzzy/semantic matching from returning unrelated
   * companies that happen to score well against a query like "Shell".
   */
  function filterByName(results: EntitySearchResult[], term: string): EntitySearchResult[] {
    if (isIdSearch(term)) return results;
    const lower = term.toLowerCase();
    return results.filter((e) => e.name.toLowerCase().includes(lower));
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
      const rawResults = await searchEntities(term, { limit: 20 });
      debugLastSearchTime = performance.now() - startTime;

      // Post-filter to entities whose name actually contains the search term,
      // unless the term looks like a structured ID (GEM Entity ID, LEI, PermID).
      const results = filterByName(rawResults, term);

      if (results.length === 0) {
        if (rawResults.length > 0) {
          searchError = `No companies with "${term}" in their name found in GEM. Try a broader term.`;
        } else {
          searchError = `No companies named "${term}" found in GEM.`;
        }
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
      const noAssetsParam =
        noAssets.length > 0 ? noAssets.map((e) => e.id).join(',') : undefined;
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
      const inputs = bulkSearchText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 30);

      debugApiCalls = [
        { type: 'searchEntitiesBulk', params: { queryCount: inputs.length }, time: Date.now() },
      ];

      const bulkResult = await searchEntitiesBulk(inputs, {
        limitPerQuery: 10,
        maxConcurrent: 10,
      });
      debugLastSearchTime = bulkResult.queryTimeMs;

      // Apply name filter per term — count terms where all API results were filtered out
      // as Tier 3 (no match), same as terms that returned nothing at all.
      let tier3Count = 0;
      const filteredResults: Record<string, EntitySearchResult[]> = {};
      for (const [term, entities] of Object.entries(bulkResult.results)) {
        if (entities.length === 0) {
          tier3Count++;
        } else {
          const filtered = filterByName(entities, term);
          if (filtered.length === 0) {
            tier3Count++;
          } else {
            filteredResults[term] = filtered;
          }
        }
      }

      const allMatched: EntitySearchResult[] = Object.values(filteredResults).flat();

      if (allMatched.length === 0) {
        searchError = `None of the ${inputs.length} terms matched any GEM entity by name.`;
        return;
      }

      // Cross-reference against owners map (skip if still loading)
      let tier1Ids: string;
      let noAssetsParam: string | undefined;

      if (allOwnersLoading || allOwners.length === 0) {
        tier1Ids = allMatched.map((e) => e.id).join(',');
      } else {
        const { withAssets, noAssets } = crossRef(allMatched);
        tier1Ids = withAssets.map((e) => e.id).join(',');
        noAssetsParam = noAssets.length > 0 ? noAssets.map((e) => e.id).join(',') : undefined;
      }

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
      const lines = text.split('\n').slice(1);
      const values = lines
        .map((line) => {
          const cols = line.split(',');
          return cols[0]?.trim().replace(/^["']|["']$/g, '');
        })
        .filter((v): v is string => !!v && v.length > 0);
      bulkSearchText = values.join('\n');
      await doSearchBulk();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      searchError = `Failed to parse CSV: ${reason}. Ensure the file is UTF-8 encoded with company names in the first column.`;
    }
  }

  function useExample(example: { name: string; id?: string }) {
    singleSearchQuery = example.name;
    doSearchSingle();
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
  subtitle="Search for a company to see their ownership stakes, assets, and corporate network."
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
    onSearchSingle={doSearchSingle}
    onSearchBulk={doSearchBulk}
    onUseExample={useExample}
    onCsvUpload={handleCsvUpload}
  />

  <!-- Browse / View all owners -->
  <section class="show-all-section">
    <SectionHeader title="Want every asset instead?">
      {#if selectedClasses.length > 0}
        Show every <strong
          >{selectedClasses.length > 1
            ? selectedClasses.map((c) => c.name).join(' & ')
            : selectedClasses[0]?.name}</strong
        > asset worldwide — no ownership filter.
      {:else}
        Show every asset in the database — no ownership filter.
      {/if}
    </SectionHeader>

    <div class="show-all-actions">
      <button class="show-all-btn" onclick={showAllAssets}>All owners of this asset type</button>

      {#if allOwners.length > 0}
        <button
          class="show-all-btn show-all-btn--secondary"
          onclick={() => (showAllOwnersTable = !showAllOwnersTable)}
        >
          {showAllOwnersTable ? 'Hide' : 'View'} all owners ({allOwners.length})
        </button>
      {:else if allOwnersLoading}
        <span class="owners-loading">Loading owner list…</span>
      {/if}
    </div>

    {#if showAllOwnersTable && allOwners.length > 0}
      <div class="all-owners-table-wrap">
        <table class="all-owners-table">
          <thead>
            <tr>
              <th>Company</th>
              <th class="num-col">Assets</th>
            </tr>
          </thead>
          <tbody>
            {#each allOwners as owner}
              <tr>
                <td>{owner.name}</td>
                <td class="num-col">{owner.filteredAssets || owner.totalAssets}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

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
    padding-top: var(--space-10);
    margin-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
  }

  .show-all-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
    align-items: center;
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

  .show-all-btn--secondary {
    color: var(--color-text-secondary);
  }

  .owners-loading {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .owners-error {
    margin-top: var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-error, #c0392b);
  }

  /* ── All owners table ───────────────────────────────────────────────── */
  .all-owners-table-wrap {
    margin-top: var(--space-4);
    max-height: 480px;
    overflow-y: auto;
    border: var(--border-width) solid var(--color-border);
  }

  .all-owners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .all-owners-table thead th {
    position: sticky;
    top: 0;
    background: var(--color-bg-secondary, #f8f8f8);
    padding: var(--space-2) var(--space-3);
    text-align: left;
    font-weight: 600;
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .all-owners-table tbody tr:nth-child(even) {
    background: var(--color-bg-secondary, #f8f8f8);
  }

  .all-owners-table tbody tr:hover {
    background: var(--color-bg-hover, #f0f4f8);
  }

  .all-owners-table td {
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .num-col {
    text-align: right;
    width: 80px;
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
