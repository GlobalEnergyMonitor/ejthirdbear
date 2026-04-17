<script>
  /**
   * ControlChainApp — shared search + results + modal logic.
   * Used by both /controlchain and /embed/controlchain.
   *
   * Props:
   *   initialQuery  - Starting search query
   *   initialType   - Starting search type; coerced to "assets"
   *   onStateChange - Called with (q, type) whenever search state changes
   *                   (caller uses this to update URL params or hash)
   */
  import { onMount, untrack } from 'svelte';
  import { listAssets, getAsset, getOwnershipGraphs } from '$lib/ownership-api';
  import { readHashParam, writeHash } from '$lib/utils/hash-state';
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import LocationOwnershipView from '$lib/components/ownership/LocationOwnershipView.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import { classifyOwnerType } from '$lib/components/ownership/ownership-tree-utils';
  import QuerySentenceBuilder from '$lib/components/filters/QuerySentenceBuilder.svelte';

  /**
   * Portal action: moves the node to a fresh shadow host under document.body
   * so `position: fixed` escapes any transformed ancestor in the host page
   * (common in Drupal/CMS themes, which break fixed positioning inside shadow DOM).
   * Copies the widget's adopted stylesheets so scoped styles still apply.
   * No-op when the component renders in a normal document (not shadow DOM).
   */
  function portalToBody(node) {
    const root = node.getRootNode();
    if (!(root instanceof ShadowRoot)) return { destroy: () => {} };

    const host = document.createElement('div');
    host.setAttribute('data-gem-portal', 'controlchain-modal');
    document.body.appendChild(host);
    const portalShadow = host.attachShadow({ mode: 'open' });

    if (root.adoptedStyleSheets?.length) {
      portalShadow.adoptedStyleSheets = [...root.adoptedStyleSheets];
    } else {
      root.querySelectorAll('style').forEach((s) => {
        portalShadow.appendChild(s.cloneNode(true));
      });
    }

    portalShadow.appendChild(node);

    return {
      destroy() {
        host.remove();
      },
    };
  }

  const PLACEHOLDER_ENTITY_IDS = new Set(['E100001015587', 'E100000123261', 'E100000132388']);

  /** @type {{ initialQuery?: string, initialType?: string, onStateChange?: (q: string, type: string) => void }} */
  let { initialQuery = '', initialType: _initialType = 'all', onStateChange } = $props();

  const modes = [
    {
      id: 'assets',
      label: 'Assets',
      placeholder: 'Search assets by name, ID, owner, or country...',
    },
  ];

  const examples = [
    { name: 'Abuja', kind: 'Gas Plant', q: 'Abuja' },
    { name: 'Amerisur Binational', kind: 'Oil Pipeline', q: 'Amerisur Binational' },
    { name: 'Cebu', kind: 'Coal Plant', q: 'Cebu Energy' },
    { name: 'ArcelorMittal', kind: 'Steel Plant', q: 'ArcelorMittal Bremen' },
    { name: 'Yala', kind: 'Bio. Plant', q: 'Yala power station' },
  ];

  let searchType = $state('assets');
  let query = $state(untrack(() => initialQuery));

  let results = $state(/** @type {any[]} */ ([]));
  let searching = $state(false);
  let searchError = $state('');
  let hasSearched = $state(false);

  let selected = $state(null);
  /** Location-level graph response; null while loading or before any selection. */
  let locationResponse = $state(
    /** @type {import('$lib/ownership-api').LocationOwnershipGraphResponse | null} */ (null)
  );
  let loadingTree = $state(false);
  let treeError = $state('');
  let modalOpen = $state(false);

  // ── Filter state ──────────────────────────────────────────────────────────
  let filterAssetTypes = $state(/** @type {string[]} */ ([]));
  let filterCountries = $state(/** @type {string[]} */ ([]));
  let filterStatuses = $state(/** @type {string[]} */ ([]));
  let openPicker = $state(/** @type {string|null} */ (null));
  let shownFields = $state(/** @type {string[]} */ (['asset_type']));
  let countryOptions = $state(/** @type {string[]} */ ([]));
  let countrySearch = $state('');

  /** Maps display labels → API slugs for asset_type */
  const ASSET_TYPE_SLUG = {
    'Coal Plant': 'coal-plant',
    'Oil & Gas Plant': 'oil-gas-plant',
    'Bioenergy Plant': 'bioenergy-plant',
    'Gas Pipeline': 'gas-pipeline',
    'Cement Plant': 'cement-plant',
    'Oil Pipeline': 'oil-pipeline',
    'Iron & Steel Plant': 'iron-steel-plant',
    'Iron Ore Mine': 'iron-ore-mine',
  };
  const ASSET_TYPE_LABELS = Object.keys(ASSET_TYPE_SLUG);

  const STATUS_OPTIONS = ['operating', 'planned', 'cancelled', 'retired'];

  const FILTER_FIELDS = [
    { key: 'asset_type', label: 'Asset type', phrase: 'of type' },
    { key: 'country', label: 'Country', phrase: 'in' },
    { key: 'status', label: 'Status', phrase: 'that are' },
  ];

  const sentenceFilters = $derived({
    asset_type: filterAssetTypes,
    country: filterCountries,
    status: filterStatuses,
  });
  const filtersDirty = $derived(
    filterAssetTypes.length > 0 || filterCountries.length > 0 || filterStatuses.length > 0
  );
  const filteredCountryOptions = $derived(
    countrySearch
      ? countryOptions.filter((c) => c.toLowerCase().includes(countrySearch.toLowerCase()))
      : countryOptions
  );

  // Reset country search when picker closes
  $effect(() => {
    if (openPicker !== 'country') countrySearch = '';
  });

  // Mobile summary: data-driven sentences derived from the first graph's data
  const mobileSummary = $derived.by(() => {
    if (!locationResponse || !selected) return null;
    const firstGraph = locationResponse.graphs[0];
    if (!firstGraph || firstGraph.nodes.length === 0) return null;

    const treeNodes = firstGraph.nodes;
    const treeEdges = firstGraph.edges;
    const treeRootId = firstGraph.root.asset_id;

    const filtered = treeNodes.filter((n) => !PLACEHOLDER_ENTITY_IDS.has(n.entity_id || n.id));
    const entities = filtered.filter((n) => n.type !== 'asset' && n.id !== treeRootId);
    if (entities.length === 0) return null;

    const assetNode = filtered.find((n) => n.type === 'asset' || n.id === treeRootId);
    const assetName = assetNode?.Name || selected.name || 'This asset';

    // Direct owners (ControlChain always fetches direction='up')
    const directEdges = treeEdges.filter((e) => e.target === treeRootId);
    const directIds = new Set(directEdges.map((e) => e.source));
    const directEntities = entities.filter((n) => directIds.has(n.id));

    // By type
    const byType = {};
    for (const n of entities) {
      const cat = classifyOwnerType(n);
      byType[cat] = (byType[cat] || 0) + 1;
    }

    // By country
    const byCountry = {};
    for (const n of entities) {
      const c = n.headquarters_country || 'Unknown';
      byCountry[c] = (byCountry[c] || 0) + 1;
    }
    const topCountries = Object.entries(byCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Top owners by direct edge value
    const topOwners = directEntities
      .map((n) => {
        const edge = directEdges.find((e) => e.source === n.id);
        return { name: n.Name || n.id, pct: edge?.value || 0 };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);

    // Build sentences
    const lines = [];
    lines.push(
      `${assetName} has ${directEntities.length} direct owner${directEntities.length !== 1 ? 's' : ''} and ${entities.length} entities in its ownership structure.`
    );

    if (locationResponse.distinct_graphs > 1) {
      lines.push(
        `This location has ${locationResponse.distinct_graphs} distinct ownership structures across ${locationResponse.unit_count} units.`
      );
    } else if (locationResponse.unit_count > 1) {
      lines.push(`All ${locationResponse.unit_count} units share identical ownership.`);
    }

    if (topOwners.length > 0) {
      const ownerStr = topOwners
        .map((o) => `${o.name}${o.pct > 0 ? ` (${o.pct.toFixed(1)}%)` : ''}`)
        .join(', ');
      lines.push(`Top owners: ${ownerStr}.`);
    }

    const typeStr = Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `${c} ${t}`)
      .join(', ');
    if (typeStr) lines.push(`By type: ${typeStr}.`);

    if (topCountries.length > 0) {
      const countryStr = topCountries.map(([c, n]) => `${c} (${n})`).join(', ');
      lines.push(`By headquarters: ${countryStr}.`);
    }

    return { lines, topOwners, byType, byCountry: topCountries, totalEntities: entities.length };
  });

  /** Vertical chain paths for mobile: owner → intermediaries → asset with pcts */
  const mobileChains = $derived.by(() => {
    if (!locationResponse || !selected) return [];
    const firstGraph = locationResponse.graphs[0];
    if (!firstGraph) return [];

    const { nodes, edges, paths } = firstGraph;
    if (!paths || Object.keys(paths).length === 0) return [];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(edges.map((e) => [`${e.source}->${e.target}`, e]));

    const chains = [];
    for (const [_ownerId, routes] of Object.entries(paths)) {
      for (const route of routes) {
        if (!route.route || route.route.length < 2) continue;
        const steps = route.route.map((id, i) => {
          const node = nodeMap.get(id);
          const name = node?.Name || id;
          const isAsset = node?.type === 'asset' || i === route.route.length - 1;
          const ownerType = !isAsset && node ? classifyOwnerType(node) : null;
          const country = node?.headquarters_country || node?.country || null;
          // Edge pct: from this node to next
          let edgePct = null;
          if (i < route.route.length - 1) {
            const nextId = route.route[i + 1];
            const edge = edgeMap.get(`${id}->${nextId}`);
            if (edge?.value != null) edgePct = edge.value;
          }
          return { id, name, isAsset, ownerType, country, edgePct };
        });
        chains.push({ steps, cumulativePct: route.cumulative_pct });
      }
    }
    // Sort by cumulative pct descending, limit to top 10
    chains.sort((a, b) => (b.cumulativePct ?? 0) - (a.cumulativePct ?? 0));
    return chains.slice(0, 10);
  });

  let debounceTimer;

  // Restore modal from hash deep-link (e.g. #asset=L100000401789)
  async function openFromHash() {
    const hashId = readHashParam('asset');
    if (hashId) {
      try {
        const locationId = getLocationId(hashId);
        const asset = await getAsset(locationId);
        if (asset) {
          selectResult({
            id: locationId,
            name: asset.name,
            status: asset.status,
            country: asset.country,
            facilityType: asset.facilityType,
            capacity: asset.capacity,
          });
        }
      } catch {
        // invalid deep-link, ignore
      }
    }
  }

  onMount(() => {
    openFromHash();
    // Re-open modal when hash changes (e.g. browser back/forward or programmatic nav)
    window.addEventListener('hashchange', openFromHash);
    // Fetch country options for the country picker
    listAssets({ limit: 1, facets: true })
      .then((res) => {
        if (res.facets?.country) {
          countryOptions = Object.keys(res.facets.country).sort();
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => window.removeEventListener('hashchange', openFromHash);
  });

  $effect(() => {
    const q = query;
    const type = searchType;
    // Spread all filter arrays unconditionally so every array is tracked as a
    // reactive dependency regardless of short-circuit evaluation order.
    const nTypes = filterAssetTypes.length;
    const nCountries = filterCountries.length;
    const nStatuses = filterStatuses.length;
    const hasFilters = nTypes > 0 || nCountries > 0 || nStatuses > 0;
    clearTimeout(debounceTimer);
    if ((!q || q.length < 2) && !hasFilters) {
      results = [];
      hasSearched = false;
      return;
    }
    debounceTimer = setTimeout(() => {
      doSearch(q, type);
      onStateChange?.(q, type);
    }, 300);
  });

  /**
   * Extract the location-level ID (L-prefix) from a unit-level asset ID.
   * e.g. "L100000401789_U100000140974" → "L100000401789"
   *      "L100000104107_G100000102961" → "L100000104107"
   *      "L100000401789"              → "L100000401789" (unchanged)
   */
  function getLocationId(assetId) {
    const sep = assetId.indexOf('_');
    return sep >= 0 ? assetId.slice(0, sep) : assetId;
  }

  async function doSearch(q, _type) {
    // Snapshot reactive arrays into plain arrays to avoid proxy issues in buildQuery
    const countries = Array.from(filterCountries);
    const types = Array.from(filterAssetTypes);
    const statuses = Array.from(filterStatuses);

    const hasFilters = types.length > 0 || countries.length > 0 || statuses.length > 0;
    if ((!q || q.length < 2) && !hasFilters) {
      results = [];
      hasSearched = false;
      return;
    }
    searching = true;
    searchError = '';
    hasSearched = true;
    try {
      // Collect unit-level results from the API, then deduplicate at the location level.
      // The graph endpoint works with L-prefix location IDs, so we strip the unit suffix.
      const merged = [];
      const seenLocationIds = new Set();
      const unitCounts = new Map(); // locationId → unit count seen in this search batch
      const typesToSearch = types.length > 0 ? types.map((l) => ASSET_TYPE_SLUG[l]) : [undefined];
      const statusesToSearch = statuses.length > 0 ? statuses : [undefined];
      const countryParam = countries.length > 0 ? countries : undefined;

      for (const assetType of typesToSearch) {
        for (const status of statusesToSearch) {
          const r = await listAssets({
            q: q || undefined,
            limit: 20,
            asset_type: assetType,
            status: status,
            country: countryParam,
          });
          for (const a of r.results) {
            const locationId = getLocationId(a.id);
            // Count every unit hit, even duplicates, to build a unit count per location
            unitCounts.set(locationId, (unitCounts.get(locationId) || 0) + 1);
            if (!seenLocationIds.has(locationId)) {
              seenLocationIds.add(locationId);
              merged.push({
                id: locationId,
                name: String(a.raw?.project_name || a.name),
                kind: 'asset',
                country: a.country,
                status: a.status,
                asset_type: a.facilityType,
                unit_count: 1,
              });
            }
          }
        }
      }
      // Attach unit counts (lower bound — capped by fetch limit)
      for (const item of merged) {
        item.unit_count = unitCounts.get(item.id) || 1;
      }
      results = merged.slice(0, 40);
    } catch (err) {
      searchError = err.message || 'Search failed';
      results = [];
    } finally {
      searching = false;
    }
  }

  function toggleAssetType(label) {
    query = '';
    filterAssetTypes = filterAssetTypes.includes(label)
      ? filterAssetTypes.filter((v) => v !== label)
      : [...filterAssetTypes, label];
  }

  function toggleCountry(country) {
    query = '';
    filterCountries = filterCountries.includes(country)
      ? filterCountries.filter((v) => v !== country)
      : [...filterCountries, country];
  }

  function toggleStatus(s) {
    query = '';
    filterStatuses = filterStatuses.includes(s)
      ? filterStatuses.filter((v) => v !== s)
      : [...filterStatuses, s];
  }

  function handleRemoveFilterValue(key, val) {
    if (key === 'asset_type') filterAssetTypes = filterAssetTypes.filter((v) => v !== val);
    else if (key === 'country') filterCountries = filterCountries.filter((v) => v !== val);
    else if (key === 'status') filterStatuses = filterStatuses.filter((v) => v !== val);
  }

  function handleRemoveFilterField(key) {
    if (key === 'asset_type') filterAssetTypes = [];
    else if (key === 'country') filterCountries = [];
    else if (key === 'status') filterStatuses = [];
  }

  function handleClearFilters() {
    filterAssetTypes = [];
    filterCountries = [];
    filterStatuses = [];
  }

  function handleSearch(q, mode) {
    query = q;
    searchType = mode || 'assets';
    clearTimeout(debounceTimer);
    onStateChange?.(q, searchType);
    // Let the $effect handle re-searching (it considers active filters too)
  }

  function handleClear() {
    query = '';
    results = [];
    hasSearched = false;
    selected = null;
    modalOpen = false;
    locationResponse = null;
    onStateChange?.('', searchType);
  }

  function closeModal() {
    modalOpen = false;
    selected = null;
    locationResponse = null;
    writeHash({ asset: null });
  }

  async function selectResult(item) {
    selected = item;
    modalOpen = true;
    writeHash({ asset: item.id });
    loadingTree = true;
    treeError = '';
    locationResponse = null;
    try {
      locationResponse = await getOwnershipGraphs({ root: item.id, direction: 'up' });
    } catch (err) {
      treeError = err.message || 'Failed to load ownership tree';
    } finally {
      loadingTree = false;
    }
  }

  function searchExample(ex) {
    query = ex.q;
    searchType = 'assets';
    doSearch(query, searchType);
    onStateChange?.(query, searchType);
  }

  // Run initial search if a query was provided
  {
    const q = untrack(() => initialQuery);
    if (q && q.length >= 2) {
      doSearch(q, 'assets');
    }
  }
</script>

<div class="cc-app">
  <div class="cc-search">
    <AssetSearchBar
      bind:value={query}
      bind:activeMode={searchType}
      {modes}
      label="Search assets"
      placeholder="Search by name..."
      showButton={false}
      onSearch={handleSearch}
      onClear={handleClear}
    />
  </div>

  <div class="cc-filters">
    <QuerySentenceBuilder
      startWord="Or: See"
      fields={FILTER_FIELDS}
      filters={sentenceFilters}
      isDirty={filtersDirty}
      bind:openPicker
      bind:shownFields
      panelTitles={{
        country: 'Select countries',
        asset_type: 'Select asset types',
        status: 'Select statuses',
      }}
      columnPickerKeys={['country']}
      onRemoveValue={handleRemoveFilterValue}
      onRemoveField={handleRemoveFilterField}
      onClearAll={handleClearFilters}
    >
      {#snippet subject()}
        <span class="cc-sentence-subject">assets</span>
      {/snippet}
      {#snippet picker(fieldKey)}
        {#if fieldKey === 'asset_type'}
          {#each ASSET_TYPE_LABELS as label}
            <button
              class="cc-filter-pill"
              class:active={filterAssetTypes.includes(label)}
              onclick={() => toggleAssetType(label)}>{label}</button
            >
          {/each}
        {:else if fieldKey === 'status'}
          {#each STATUS_OPTIONS as s}
            <button
              class="cc-filter-pill"
              class:active={filterStatuses.includes(s)}
              onclick={() => toggleStatus(s)}>{s}</button
            >
          {/each}
        {:else if fieldKey === 'country'}
          <input
            class="cc-country-search"
            type="text"
            placeholder="Search countries..."
            bind:value={countrySearch}
          />
          <div class="cc-country-list">
            {#each filteredCountryOptions as country}
              <label class="cc-country-item">
                <input
                  type="checkbox"
                  checked={filterCountries.includes(country)}
                  onchange={() => toggleCountry(country)}
                />
                {country}
              </label>
            {/each}
            {#if filteredCountryOptions.length === 0 && countryOptions.length > 0}
              <span class="cc-no-country">No countries match "{countrySearch}"</span>
            {/if}
            {#if countryOptions.length === 0}
              <span class="cc-no-country">Loading countries…</span>
            {/if}
          </div>
        {/if}
      {/snippet}
    </QuerySentenceBuilder>
  </div>

  {#if !hasSearched && !selected}
    <div class="cc-empty">
      <p class="cc-empty-prompt">Try searching for an asset, or explore an example:</p>
      <div class="cc-examples">
        {#each examples as ex}
          <button class="cc-chip" onclick={() => searchExample(ex)}>
            <span class="cc-kind asset">{ex.kind}</span>
            {ex.name}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if searchError}
    <p class="cc-error">{searchError}</p>
  {/if}

  {#if searching}
    <div class="cc-status">
      <div class="cc-spinner"></div>
      <span>Searching...</span>
    </div>
  {/if}

  {#if results.length > 0}
    <div class="cc-results-panel">
      <div class="cc-results-header">
        <span class="cc-results-count"
          >{results.length} result{results.length !== 1 ? 's' : ''}</span
        >
      </div>
      <ul class="cc-results-list">
        {#each results as item (item.id)}
          <li>
            <button
              class="cc-result"
              class:selected={selected?.id === item.id}
              onclick={() => selectResult(item)}
            >
              <div class="cc-result-info">
                <span class="cc-result-name">{item.name}</span>
                <span class="cc-result-meta">
                  {#if item.status}
                    <span class="cc-result-status">
                      <StatusIcon status={item.status} size={8} />
                      {item.status}
                    </span>
                  {/if}
                  {#if item.asset_type}<span class="cc-result-type">{item.asset_type}</span>{/if}
                  {#if item.country}<span class="cc-result-country">{item.country}</span>{/if}
                  {#if item.unit_count > 1}<span class="cc-result-units"
                      >{item.unit_count} units</span
                    >{/if}
                </span>
              </div>
              <svg class="cc-result-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 3l5 5-5 5"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {:else if !searching && hasSearched}
    <p class="cc-no-results">No results found for "{query}"</p>
  {/if}
</div>

<!-- Modal — position:fixed covers the viewport.
     Portaled to document.body so it escapes transformed ancestors in the host page
     (Drupal wrappers break fixed positioning otherwise). -->
{#if modalOpen && selected}
  <div
    use:portalToBody
    class="cc-modal-backdrop"
    onclick={closeModal}
    onkeydown={(ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') closeModal();
    }}
    role="button"
    tabindex="-1"
  >
    <div
      class="cc-modal"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <div class="cc-modal-header">
        <div>
          <h2>Owners of {selected.name}</h2>
        </div>
        <button class="cc-modal-close" onclick={closeModal} aria-label="Close">✕</button>
      </div>

      <div class="cc-modal-body">
        {#if loadingTree}
          <div class="cc-tree-loading">
            <div class="cc-spinner"></div>
            <span>Loading Asset Ownership Explorer...</span>
          </div>
        {:else if treeError}
          <div class="cc-tree-error">{treeError}</div>
        {:else if locationResponse}
          <!-- Desktop: full interactive graph(s) -->
          <div class="cc-tree-wrap cc-desktop-only">
            <LocationOwnershipView
              {locationResponse}
              direction="up"
              fullWidth={true}
              forceLabelsBelow={true}
            />
          </div>

          <!-- Mobile: vertical ownership chains -->
          {#if mobileChains.length > 0}
            <div class="cc-mobile-chains">
              {#if mobileSummary}
                <p class="cc-chains-intro">{mobileSummary.lines[0]}</p>
              {/if}
              {#each mobileChains as chain, ci}
                <div class="cc-chain" class:cc-chain-border={ci > 0}>
                  <div class="cc-chain-header">
                    <span class="cc-chain-label">Path {ci + 1}</span>
                    {#if chain.cumulativePct != null && chain.cumulativePct > 0}
                      <span class="cc-chain-total">{chain.cumulativePct.toFixed(1)}% effective</span
                      >
                    {/if}
                  </div>
                  <ol class="cc-chain-steps">
                    {#each chain.steps as step, si}
                      <li class="cc-step" class:cc-step-asset={step.isAsset}>
                        <div class="cc-step-connector">
                          <div class="cc-step-dot" class:cc-step-dot-asset={step.isAsset}></div>
                          {#if si < chain.steps.length - 1}
                            <div class="cc-step-line"></div>
                          {/if}
                        </div>
                        <div class="cc-step-content">
                          <span class="cc-step-name">{step.name}</span>
                          <span class="cc-step-meta">
                            {#if step.ownerType}<span class="cc-step-type">{step.ownerType}</span
                              >{/if}
                            {#if step.country}<span class="cc-step-country">{step.country}</span
                              >{/if}
                          </span>
                        </div>
                        {#if step.edgePct != null && step.edgePct > 0}
                          <span class="cc-step-pct">{step.edgePct.toFixed(1)}%</span>
                        {/if}
                      </li>
                    {/each}
                  </ol>
                </div>
              {/each}
            </div>
          {:else if mobileSummary}
            <div class="cc-mobile-summary">
              {#each mobileSummary.lines as line}
                <p class="cc-summary-line">{line}</p>
              {/each}
            </div>
          {/if}
        {:else}
          <div class="cc-tree-empty">No ownership data available for this asset.</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .cc-app {
    width: 100%;
    font-family: var(--font-family-sans);
  }

  .cc-search {
    margin-bottom: var(--space-3);
  }

  .cc-filters {
    margin-bottom: var(--space-5);
    --sentence-max-width: 100%;
  }

  .cc-sentence-subject {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .cc-filter-pill {
    all: unset;
    cursor: pointer;
    padding: var(--space-2) var(--space-4);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-full);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    background: var(--color-bg-primary);
    transition: all var(--duration-fast) var(--ease-out);
    white-space: nowrap;
  }

  .cc-filter-pill:focus-visible {
    outline: 2px solid var(--gem-teal);
    outline-offset: 2px;
  }

  .cc-filter-pill:hover {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
  }

  .cc-filter-pill.active {
    background: var(--gem-navy);
    color: var(--gem-white);
    border-color: var(--gem-navy);
  }

  .cc-country-search {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm);
    font-family: inherit;
    margin-bottom: var(--space-2);
    box-sizing: border-box;
  }

  .cc-country-list {
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cc-country-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    padding: 3px 0;
    min-height: 32px;
  }

  .cc-country-item input[type='checkbox'] {
    cursor: pointer;
    margin: 0;
  }

  .cc-no-country {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding: var(--space-2) 0;
  }

  /* Empty / examples */
  .cc-empty {
    text-align: center;
    padding: var(--space-10) var(--space-5);
  }
  .cc-empty-prompt {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .cc-examples {
    display: flex;
    gap: var(--space-2);
    justify-content: center;
    flex-wrap: wrap;
  }
  .cc-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-bg-primary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .cc-chip:hover {
    border-color: var(--gem-navy);
    box-shadow: var(--shadow-sm);
  }
  .cc-chip:focus-visible {
    outline: 2px solid var(--gem-teal);
    outline-offset: 2px;
  }
  .cc-kind {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-normal);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
  }
  .cc-kind.asset {
    background: var(--color-gray-300);
    color: var(--color-text-primary);
  }
  /* Error / status */
  .cc-error {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    margin: var(--space-2) 0;
  }
  .cc-status,
  .cc-tree-loading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-4) 0;
  }
  .cc-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--color-border);
    border-top-color: var(--gem-navy);
    border-radius: 50%;
    animation: cc-spin 0.6s linear infinite;
    flex-shrink: 0;
  }
  @keyframes cc-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .cc-no-results {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--space-8) 0;
  }

  /* Results */
  .cc-results-panel {
    min-width: 0;
  }
  .cc-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
  }
  .cc-results-count {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .cc-results-list {
    list-style: none;
    padding: 0;
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    max-height: 600px;
    overflow-y: auto;
  }
  .cc-results-list li + li {
    border-top: 1px solid var(--color-border-light, #eee);
  }
  .cc-result {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-primary);
    border: none;
    cursor: pointer;
    text-align: left;
    font-size: var(--font-size-sm);
    transition: background 0.1s;
  }
  .cc-result:hover {
    background: var(--color-bg-secondary);
  }
  .cc-result.selected {
    background: var(--gem-teal-10);
    border-left: 3px solid var(--gem-navy);
  }
  .cc-result-kind {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
  }
  .cc-result-kind.asset {
    background: var(--color-success-light);
    color: var(--color-success);
  }
  .cc-result-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cc-result-name {
    font-weight: 500;
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cc-result-meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .cc-result-status {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  .cc-result-type,
  .cc-result-country {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }
  .cc-result-units {
    font-size: 11px;
    color: var(--color-text-tertiary);
    font-style: italic;
  }
  .cc-result-arrow {
    color: var(--color-text-tertiary);
    flex-shrink: 0;
    transition: transform 0.1s;
  }
  .cc-result:hover .cc-result-arrow {
    transform: translateX(2px);
    color: var(--gem-navy);
  }

  /* Modal */
  .cc-modal-backdrop {
    position: fixed;
    inset: 0;
    width: 100vw;
    max-width: none;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 5vh 5vw;
  }
  .cc-modal {
    background: var(--color-bg-primary);
    border-radius: var(--radius-lg, 8px);
    width: 90vw;
    max-width: 90vw;
    max-height: 90vh;
    min-height: 80vh;
    overflow: auto;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);
  }
  .cc-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    background: var(--color-bg-primary);
    z-index: 1;
  }
  .cc-modal-header h2 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary);
    text-transform: none;
    letter-spacing: normal;
  }
  .cc-modal-close {
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    line-height: 1;
    flex-shrink: 0;
    transition: all 0.15s ease;
  }
  .cc-modal-close:hover {
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
  }

  /* Modal body padding so nothing hits edges */
  .cc-modal-body {
    padding: var(--space-4);
  }

  /* Tree inside modal: chart 70% | panel 30% */
  .cc-tree-wrap {
    width: 100%;
    min-width: 0;
  }

  .cc-tree-wrap :global(.ownership-tree),
  .cc-tree-wrap :global(.graph-area),
  .cc-tree-wrap :global(.graph-wrap) {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  .cc-tree-wrap :global(.container) {
    display: grid !important;
    grid-template-columns: 70% 30% !important;
    gap: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .cc-tree-wrap :global(.graph-wrap) {
    max-height: 70vh !important;
    overflow: auto !important;
  }
  .cc-tree-wrap :global(.graph-wrap svg) {
    width: 100% !important;
    max-width: none !important;
    height: 70vh !important;
    max-height: 70vh !important;
    min-height: 0 !important; /* override isLargeGraph inline min-height */
  }
  .cc-tree-wrap :global(.panel) {
    height: 70vh !important;
    overflow-y: auto !important;
    border-left: 1px solid var(--color-border) !important;
    padding: var(--space-4) !important;
    box-sizing: border-box !important;
  }

  .cc-tree-error {
    color: var(--color-error, #c00);
    font-size: var(--font-size-sm);
    padding: var(--space-6);
    text-align: center;
  }
  .cc-tree-empty {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    padding: var(--space-8);
    text-align: center;
  }

  /* Mobile: hide graph, show chains */
  .cc-mobile-chains,
  .cc-mobile-summary {
    display: none;
  }

  @media (max-width: 768px) {
    .cc-desktop-only {
      display: none;
    }
    .cc-mobile-chains,
    .cc-mobile-summary {
      display: block;
    }
    .cc-modal {
      width: 100vw;
      max-width: 100vw;
      max-height: 100vh;
      min-height: auto;
      border-radius: 0;
    }
    .cc-modal-backdrop {
      padding: 0;
    }
    .cc-filter-pill,
    .cc-chip {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
    }
    .cc-country-item {
      min-height: 44px;
      padding: 8px 0;
    }
    .cc-result {
      min-height: 44px;
    }
    .cc-modal-close {
      min-height: 44px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
  }

  /* Chain view */
  .cc-chains-intro {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
    line-height: 1.5;
  }

  .cc-chain {
    padding: var(--space-3) 0;
  }
  .cc-chain-border {
    border-top: 1px solid var(--color-border);
    margin-top: var(--space-2);
  }
  .cc-chain-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-2);
  }
  .cc-chain-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-tertiary);
  }
  .cc-chain-total {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--gem-navy);
    font-variant-numeric: tabular-nums;
  }

  .cc-chain-steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .cc-step {
    display: grid;
    grid-template-columns: 20px 1fr auto;
    gap: 0 var(--space-2);
    min-height: 40px;
    align-items: start;
  }
  .cc-step-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 100%;
    padding-top: 6px;
  }
  .cc-step-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-border);
    border: 2px solid var(--color-bg-primary);
    box-shadow: 0 0 0 1.5px var(--color-border);
    flex-shrink: 0;
  }
  .cc-step-dot-asset {
    background: var(--gem-navy);
    box-shadow: 0 0 0 1.5px var(--gem-navy);
  }
  .cc-step-line {
    width: 1.5px;
    flex: 1;
    background: var(--color-border);
    min-height: 16px;
  }
  .cc-step-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 2px 0 var(--space-2) 0;
  }
  .cc-step-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    line-height: 1.3;
  }
  .cc-step-asset .cc-step-name {
    font-weight: 600;
    color: var(--gem-navy);
  }
  .cc-step-meta {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .cc-step-type,
  .cc-step-country {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }
  .cc-step-pct {
    font-size: var(--font-size-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
    padding-top: 4px;
    white-space: nowrap;
  }

  .cc-summary-line {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    line-height: 1.5;
    margin: 0 0 var(--space-2) 0;
  }
</style>
