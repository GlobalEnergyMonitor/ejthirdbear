<script lang="ts">
  /**
   * Embeddable Asset Class Screener
   *
   * Uses the real screener components (AssetClassExpansion) with state stored
   * in window.location.hash so it works inside Drupal iframes without touching
   * the parent page URL. Hash is never sent to the server.
   *
   * Hash shape: #class=coal-plant&statuses=operating,planned&geo=China,India&sub=id1,id2
   *
   * Shareable URL = window.location.href (works standalone or as Drupal iframe src)
   */
  import { onMount } from 'svelte';
  import Link from 'lucide-svelte/icons/link';
  import Check from 'lucide-svelte/icons/check';
  import AssetClassExpansion from '$lib/components/tracker/AssetClassExpansion.svelte';
  import { ALL_ASSET_CLASSES, getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import { gemTrackerToUiTracker } from '$lib/data-config/screener-api';
  import { buildScreenerUrl } from '$lib/screener-url';
  import { isValidTracker, STATUS_GROUPS, discoverStatusGroups } from '$lib/data-config/tracker-schema';
  import { resolveApiSlug, fetchStatusFacets, fetchStatusTaxonomy } from '$lib/ownership-api';

  // ─── Hash state helpers ─────────────────────────────────────────────

  function readHash(): Record<string, string> {
    if (typeof window === 'undefined') return {};
    const raw = window.location.hash.slice(1);
    if (!raw) return {};
    return Object.fromEntries(new URLSearchParams(raw));
  }

  function writeHash(params: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') p.set(k, v);
    }
    const hash = p.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  // ─── State ──────────────────────────────────────────────────────────

  let selectedClassId = $state<string | null>(null);
  let subClassChecks = $state<Record<string, boolean>>({});
  let groupOptionChecks = $state<Record<string, boolean>>({});
  let statusChecks = $state<Record<string, boolean>>({});
  let geoFilters = $state<string[]>([]);
  let geofence = $state<number[][] | null>(null);
  let dynamicStatusGroups = $state<any[] | null>(null);
  let copied = $state(false);
  let searchQuery = $state('');

  const selectedClass = $derived(selectedClassId ? getAssetClassById(selectedClassId) : null);

  function isEnabled(ac: any) {
    return ac.trackers.length > 0 && ac.trackers.some((t: string) => isValidTracker(gemTrackerToUiTracker(t)));
  }

  // Category display config (same as real screener)
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

  const classesByCategory = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return CATEGORY_META.map((cat) => ({
      ...cat,
      classes: ALL_ASSET_CLASSES.filter((ac) => {
        if (ac.category !== cat.key || !isEnabled(ac)) return false;
        if (!q) return true;
        return ac.label.toLowerCase().includes(q) || (ac as any).description?.toLowerCase().includes(q);
      }),
    })).filter((cat) => cat.classes.length > 0);
  });

  // ─── Derived selected statuses ──────────────────────────────────────

  const selectedStatuses = $derived.by(() => {
    const groups = dynamicStatusGroups ?? STATUS_GROUPS.map((sg) => ({
      id: sg.id,
      statuses: sg.statuses.map((s) => ({ value: s })),
    }));
    const out: string[] = [];
    for (const sg of groups) {
      for (const s of sg.statuses) {
        if (statusChecks[`status-${sg.id}-${s.value}`]) out.push(s.value);
      }
    }
    return out;
  });

  // ─── Hash sync (write on every state change) ────────────────────────

  $effect(() => {
    if (!selectedClassId) { writeHash({}); return; }
    const checkedSubs = Object.entries({ ...subClassChecks, ...groupOptionChecks })
      .filter(([, v]) => v).map(([k]) => k);
    writeHash({
      class: selectedClassId,
      statuses: selectedStatuses.join(',') || undefined,
      geo: geoFilters.join(',') || undefined,
      sub: checkedSubs.join(',') || undefined,
    });
  });

  // ─── Class selection ────────────────────────────────────────────────

  function selectClass(classId: string, restore?: { statuses?: string[]; geo?: string[]; sub?: string[] }) {
    const ac = getAssetClassById(classId);
    if (!ac || !isEnabled(ac)) return;
    selectedClassId = ac.id;
    geoFilters = restore?.geo ?? [];
    geofence = null;
    dynamicStatusGroups = null;
    searchQuery = '';

    const sc: Record<string, boolean> = {};
    if ((ac as any).subClasses) {
      for (const s of (ac as any).subClasses)
        sc[s.id] = restore?.sub ? restore.sub.includes(s.id) : (s.defaultChecked ?? true);
    }
    subClassChecks = sc;

    const gc: Record<string, boolean> = {};
    if ((ac as any).subClassGroups) {
      for (const group of (ac as any).subClassGroups)
        for (const opt of group.options)
          gc[opt.id] = restore?.sub ? restore.sub.includes(opt.id) : (opt.defaultChecked ?? true);
    }
    groupOptionChecks = gc;

    const stc: Record<string, boolean> = {};
    for (const sg of STATUS_GROUPS)
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s}`;
        stc[key] = restore?.statuses ? restore.statuses.includes(s) : (sg.id === 'operating' || sg.id === 'planned');
      }
    statusChecks = stc;

    fetchStatusFacetsForClass(ac, restore?.statuses);
  }

  async function fetchStatusFacetsForClass(ac: any, restoreStatuses?: string[]) {
    try {
      const slugs = ac.trackers.map((t: string) => resolveApiSlug(gemTrackerToUiTracker(t))).filter(Boolean);
      if (!slugs.length) return;
      const [taxonomyResult, ...facetResults] = await Promise.all([
        fetchStatusTaxonomy().catch(() => null),
        ...slugs.map((slug: string) => fetchStatusFacets(slug)),
      ]);
      if (selectedClassId !== ac.id) return;
      const merged = new Map<string, number>();
      for (const fm of facetResults)
        for (const [status, count] of fm)
          merged.set(status, (merged.get(status) ?? 0) + count);
      const groups = discoverStatusGroups(merged, taxonomyResult);
      dynamicStatusGroups = groups;
      const stc: Record<string, boolean> = {};
      for (const sg of groups)
        for (const s of sg.statuses) {
          const key = `status-${sg.id}-${s.value}`;
          stc[key] = restoreStatuses ? restoreStatuses.includes(s.value) : (sg.id === 'operating' || sg.id === 'planned');
        }
      statusChecks = stc;
    } catch { /* fall back to hardcoded */ }
  }

  function clearSelection() {
    selectedClassId = null;
    subClassChecks = {};
    groupOptionChecks = {};
    statusChecks = {};
    geoFilters = [];
    geofence = null;
    dynamicStatusGroups = null;
  }

  // ─── Navigation: open results in new tab ────────────────────────────

  function buildClassData() {
    if (!selectedClass) return [];
    return [{
      id: selectedClass.id,
      assetClassId: selectedClass.id,
      name: selectedClass.label,
      description: (selectedClass as any).description ?? '',
      tracker: gemTrackerToUiTracker(selectedClass.trackers[0]),
      filters: {
        geography: geoFilters.length ? geoFilters : undefined,
        statuses: selectedStatuses.length ? selectedStatuses : undefined,
        geofence: geofence ?? undefined,
      },
      selectedSubClasses: Object.entries({ ...subClassChecks, ...groupOptionChecks }).filter(([, v]) => v).map(([k]) => k),
      gemTrackers: selectedClass.trackers,
    }];
  }

  function openResults() {
    const url = buildScreenerUrl('screener/results', { classes: JSON.stringify(buildClassData()) });
    window.open(url, '_blank');
  }

  function openOwners() {
    const url = buildScreenerUrl('screener/owners', { classes: JSON.stringify(buildClassData()) });
    window.open(url, '_blank');
  }

  // ─── Copy shareable link ─────────────────────────────────────────────

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  // ─── Mount: restore from hash ─────────────────────────────────────────

  onMount(() => {
    const h = readHash();
    if (h.class) {
      selectClass(h.class, {
        statuses: h.statuses ? h.statuses.split(',') : undefined,
        geo: h.geo ? h.geo.split(',') : undefined,
        sub: h.sub ? h.sub.split(',') : undefined,
      });
    }
    const onHashChange = () => {
      const h2 = readHash();
      if (!h2.class) { selectedClassId = null; return; }
      if (h2.class !== selectedClassId)
        selectClass(h2.class, {
          statuses: h2.statuses ? h2.statuses.split(',') : undefined,
          geo: h2.geo ? h2.geo.split(',') : undefined,
          sub: h2.sub ? h2.sub.split(',') : undefined,
        });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });
</script>

<svelte:head>
  <title>Asset Class Screener — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screener-embed">

  <!-- Thin share bar -->
  <div class="share-bar">
    <button class="copy-btn" class:ok={copied} onclick={copyLink}>
      {#if copied}
        <Check size={11} /> Link copied
      {:else}
        <Link size={11} /> Share this view
      {/if}
    </button>
  </div>

  <!-- Asset class tile picker -->
  <div class="picker-section">
    <input
      type="text"
      class="picker-search"
      placeholder="Search asset classes..."
      bind:value={searchQuery}
    />
    {#each classesByCategory as cat (cat.key)}
      <div class="picker-category">
        <span class="picker-category-label">{cat.label}</span>
        <div class="picker-grid">
          {#each cat.classes as ac (ac.id)}
            <button
              class="picker-tile"
              class:selected={selectedClassId === ac.id}
              aria-pressed={selectedClassId === ac.id}
              onclick={() => selectClass(ac.id)}
            >
              <span class="tile-label">{ac.label}</span>
              {#if ac.description}
                <span class="tile-desc">{(ac as any).description}</span>
              {/if}
              {#if ac.trackers.length > 1}
                <span class="tile-badge">{ac.trackers.length} trackers</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <!-- Filter panel (real AssetClassExpansion component) -->
  {#if selectedClass}
    <AssetClassExpansion
      assetClass={selectedClass}
      bind:subClassChecks
      bind:groupOptionChecks
      bind:statusChecks
      bind:geoFilters
      bind:geofence
      {dynamicStatusGroups}
      onShowAllOwners={openResults}
      onSearchSpecificOwners={openOwners}
      onClose={clearSelection}
    />
  {/if}

</div>

<style>
  .screener-embed {
    width: 100%;
    font-family: var(--font-family);
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
  }

  .share-bar {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }

  .copy-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all 0.15s;
  }
  .copy-btn:hover { color: var(--color-text-secondary); }
  .copy-btn.ok { border-color: var(--gem-teal); color: var(--gem-teal); }

  /* Picker — mirrors real screener styles */
  .picker-section {
    padding: var(--space-4) var(--space-5);
  }

  .picker-search {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
    margin-bottom: var(--space-4);
    box-sizing: border-box;
  }

  .picker-category {
    margin-bottom: var(--space-4);
  }

  .picker-category-label {
    display: block;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-2);
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-2);
  }

  .picker-tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-3);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    gap: var(--space-1);
  }
  .picker-tile:hover {
    border-color: var(--gem-teal);
    background: var(--gem-mint-10);
  }
  .picker-tile.selected {
    border-color: var(--gem-teal);
    background: var(--gem-mint-10);
  }

  .tile-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }
  .picker-tile.selected .tile-label { color: var(--gem-teal); }

  .tile-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    line-height: var(--leading-snug);
  }

  .tile-badge {
    font-size: var(--font-size-xs);
    color: var(--gem-teal);
    border: 1px solid var(--gem-mint);
    border-radius: var(--radius-full);
    padding: 0 var(--space-2);
  }
</style>
