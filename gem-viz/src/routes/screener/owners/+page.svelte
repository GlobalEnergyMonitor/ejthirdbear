<script lang="ts">
  /**
   * ASSET-CLASS SCREENER - Step 2: Search Owners
   * Search for companies by name, GEM Entity ID, LEI, or Perm ID.
   * Matches mockup layout with asset classes panel + owner search.
   */

  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ScreenerLayout from '$lib/components/nav/ScreenerLayout.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import SectionHeader from '$lib/components/nav/SectionHeader.svelte';
  import OwnerSearchPanel from '$lib/components/screener/OwnerSearchPanel.svelte';
  import OwnerResultsGroups from '$lib/components/screener/OwnerResultsGroups.svelte';
  import SelectedOwnersFooter from '$lib/components/screener/SelectedOwnersFooter.svelte';
  import { getExampleCompanies, type ExampleCompany } from '$lib/data-config/screener-config';
  import {
    searchEntities,
    searchEntitiesBulk,
    getOwnersByAssetType,
    type ScreenerFilters,
  } from '$lib/data-config/screener-api';
  import { buildScreenerUrl, parseJsonSearchParam } from '$lib/screener-url';
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // Get selected classes from URL params
  const classesParam = $derived($page.url.searchParams.get('classes') || '');
  const isEmbed = $derived($page.url.searchParams.get('embed') === 'true');

  // Parse selected classes for example companies feature
  const selectedClasses = $derived.by((): ScreenerSelectedClass[] => {
    if (!classesParam) return [];
    const parsed = parseJsonSearchParam<ScreenerSelectedClass[]>(classesParam);
    return Array.isArray(parsed) ? parsed : [];
  });

  function buildResultsUrl(params: { owners?: string }) {
    return buildScreenerUrl('screener/results', {
      classes: classesParam || undefined,
      owners: params.owners || undefined,
    });
  }

  function buildOwnersUrl(nextClassesParam: string) {
    return buildScreenerUrl('screener/owners', {
      classes: nextClassesParam || undefined,
    });
  }

  // Parsed class list with stable IDs for remove/update actions
  const classList = $derived.by(() => {
    return selectedClasses.map((item) => ({
      ...item,
      id: item.id || item.assetClassId || item.name || '',
      name: item.name || item.id || 'Unknown',
      tracker: item.tracker || '',
    }));
  });

  function removeClass(classToRemove: ScreenerSelectedClass) {
    const removeId = classToRemove?.id || classToRemove?.assetClassId || classToRemove?.name;
    const updated = classList.filter((c) => (c.id || c.assetClassId || c.name) !== removeId);
    goto(buildOwnersUrl(updated.length > 0 ? JSON.stringify(updated) : ''), { replaceState: true });
  }

  // Get relevant example companies: fetch top 4 owners for selected asset class,
  // fall back to static examples while loading or if no classes selected
  let topOwners = $state<{ name: string; id: string }[]>([]);

  const exampleCompanies = $derived.by(() => {
    if (topOwners.length > 0) return topOwners;
    const trackers = classList.map((c) => c.tracker).filter(Boolean);
    return getExampleCompanies(trackers);
  });

  // Fetch top 4 owners for the first selected asset class + prefill from URL
  onMount(async () => {
    // Prefill search from URL query param
    const q = $page.url.searchParams.get('q') || '';
    if (q) {
      singleSearchQuery = q;
      void searchSingle();
    }

    if (selectedClasses.length === 0) return;
    const cls = selectedClasses[0];
    if (!cls?.tracker) return;

    try {
      const filters: ScreenerFilters = {
        tracker: cls.tracker || '',
        assetClassId: cls.assetClassId || cls.id,
      };
      const result = await getOwnersByAssetType(filters, { limit: 4 });
      if (result.owners.length > 0) {
        topOwners = result.owners.slice(0, 4).map((o) => ({
          name: o.name,
          id: o.entityId,
        }));
      }
    } catch {
      // Silently fall back to static examples
    }
  });

  // Show all companies with ownership in selected asset classes
  function showAllAssets() {
    goto(buildResultsUrl({}));
  }

  // Navigation
  function continueToResults() {
    const ownerIds = selectedOwners.map((o) => o.id).join(',');
    goto(buildResultsUrl({ owners: ownerIds }));
  }

  // Use an example company
  function useExample(example: ExampleCompany) {
    singleSearchQuery = example.name;
    searchSingle();
  }

  /**
   * Toggle or add owner selection (O(1) with Map).
   * @param toggle - If true (default), deselects the owner if already selected.
   *                 If false, only adds — useful for "select all" flows.
   */
  function selectOwner(owner: { id: string; name: string }, toggle = true) {
    const newMap = new Map(selectedOwnerMap);
    if (toggle && newMap.has(owner.id)) {
      newMap.delete(owner.id);
    } else {
      newMap.set(owner.id, owner);
    }
    selectedOwnerMap = newMap;
  }

  /**
   * Search for a single entity using centralized screener API.
   * The API handles ID detection (GEM Entity ID, LEI, etc.) internally.
   */
  async function searchSingleEntity(input: string) {
    debugApiCalls = [
      ...debugApiCalls,
      { type: 'searchEntities', params: { query: input }, time: Date.now() },
    ];
    const results = await searchEntities(input, { limit: 20 });
    return results;
  }

  // Search for single owner
  async function searchSingle() {
    const term = singleSearchQuery.trim();
    if (!term) return;

    searchLoading = true;
    searchError = null;
    searchResultGroups = [];
    debugApiCalls = [];
    const startTime = performance.now();

    try {
      const results = await searchSingleEntity(term);
      searchResultGroups = [{ term, results, matchCount: results.length }];
      debugLastSearchTime = performance.now() - startTime;
    } catch (err) {
      searchError = err?.message || 'Search failed';
      debugLastSearchTime = performance.now() - startTime;
    } finally {
      searchLoading = false;
    }
  }

  // Bulk search for multiple owners using centralized API
  // Currently fires parallel requests, will use batch endpoint when available
  async function searchBulk() {
    if (!bulkSearchText.trim()) return;

    searchLoading = true;
    searchError = null;
    searchResultGroups = [];
    debugApiCalls = [];

    try {
      // Parse lines - handle both newlines and commas
      const inputs = bulkSearchText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 30); // Limit to 30 terms

      debugApiCalls = [
        { type: 'searchEntitiesBulk', params: { queryCount: inputs.length }, time: Date.now() },
      ];

      // Use centralized bulk search (will switch to batch API when available)
      const bulkResult = await searchEntitiesBulk(inputs, {
        limitPerQuery: 10,
        maxConcurrent: 10,
      });

      debugLastSearchTime = bulkResult.queryTimeMs;

      // Convert to search result groups format
      const groups = Object.entries(bulkResult.results).map(([term, results]) => ({
        term,
        results,
        matchCount: results.length,
      }));

      // Filter out groups with no results
      searchResultGroups = groups.filter((g) => g.results.length > 0);

      // Track terms with no matches
      const noMatches = groups.filter((g) => g.results.length === 0);
      if (noMatches.length > 0) {
        const noMatchTerms = noMatches.map((g) => g.term).join(', ');
        searchError = `No matches found for: ${noMatchTerms}`;
      }

      if (import.meta.env.DEV)
        console.log(
          `Bulk search: ${bulkResult.apiCallCount} API calls, ${bulkResult.queryTimeMs.toFixed(0)}ms`
        );
    } catch (err) {
      searchError = err?.message || 'Bulk search failed';
      if (import.meta.env.DEV) console.error('Bulk search failed:', err);
    } finally {
      searchLoading = false;
    }
  }

  // Handle CSV upload
  async function handleCsvUpload(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      // Parse CSV - assume first column is company name or ID
      const lines = text.split('\n').slice(1); // Skip header
      const values = lines
        .map((line) => {
          const cols = line.split(',');
          return cols[0]?.trim().replace(/^["']|["']$/g, ''); // Remove quotes
        })
        .filter((v) => v && v.length > 0);

      bulkSearchText = values.join('\n');
      await searchBulk();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown error';
      searchError = `Failed to parse CSV: ${reason}. Ensure the file is UTF-8 encoded with company names in the first column.`;
    }
  }

  // Search state
  let singleSearchQuery = $state('');
  let bulkSearchText = $state('');
  let searchLoading = $state(false);
  let searchError = $state(null);

  // Search results with disambiguation tracking
  // Each entry: { term: string, results: Entity[], matchCount: number }
  let searchResultGroups = $state([]);

  // Debug: track API calls
  let debugApiCalls = $state([]);
  let debugLastSearchTime = $state(null);

  // Selected owners (use Map for O(1) lookup by ID)
  let selectedOwnerMap = $state(new Map());
  const selectedOwners = $derived([...selectedOwnerMap.values()]);

  // Check if owner is selected (O(1))
  const isSelected = (owner) => selectedOwnerMap.has(owner.id);
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

  <!-- Search owners section -->
  <OwnerSearchPanel
    bind:singleSearchQuery
    bind:bulkSearchText
    {searchLoading}
    {searchError}
    {exampleCompanies}
    onSearchSingle={searchSingle}
    onSearchBulk={searchBulk}
    onUseExample={useExample}
    onCsvUpload={handleCsvUpload}
  />

  <OwnerResultsGroups
    {searchLoading}
    groups={searchResultGroups}
    {isSelected}
    onSelectOwner={selectOwner}
  />

  <!-- Browse all companies section -->
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
    <button class="show-all-btn" onclick={showAllAssets}> All owners of this asset type </button>
  </section>

  <!-- Debug panel -->
  {#if debugApiCalls.length > 0}
    <DebugPanel title="API Debug" time={debugLastSearchTime}>
      <div class="debug-meta">
        <span class="debug-label">API calls:</span>
        <span class="debug-value">{debugApiCalls.length}</span>
      </div>
      <div class="debug-meta">
        <span class="debug-label">Results:</span>
        <span class="debug-value"
          >{searchResultGroups.reduce((sum, g) => sum + g.results.length, 0)} entities</span
        >
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

  <!-- Selected owners footer -->
  {#snippet footer()}
    <SelectedOwnersFooter {selectedOwners} onContinue={continueToResults} />
  {/snippet}
</ScreenerLayout>

<style>
  /* Browse all section */
  .show-all-section {
    padding-top: var(--space-10);
    margin-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border);
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

  /* Page-specific debug styles */
  .debug-calls {
    margin-top: var(--space-4);
  }

  .debug-call {
    display: grid;
    grid-template-columns: 100px 1fr;
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
