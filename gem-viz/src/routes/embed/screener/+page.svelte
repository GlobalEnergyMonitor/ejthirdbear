<script lang="ts">
  /**
   * Embeddable Asset Class Screener
   *
   * State lives entirely in window.location.hash so it works inside Drupal iframes
   * without touching the parent page URL. hash is never sent to the server.
   *
   * Hash shape: #class=coal-plant&statuses=operating,planned&geo=China,India&sub=id1,id2
   *
   * Shareable URL = window.location.href (works standalone or as iframe src)
   */
  import { onMount, tick } from 'svelte';
  import Link from 'lucide-svelte/icons/link';
  import Check from 'lucide-svelte/icons/check';
  import { ALL_ASSET_CLASSES, getAssetClassById } from '$lib/data-config/asset-class-definitions';
  import { gemTrackerToUiTracker } from '$lib/data-config/screener-api';
  import { isValidTracker, STATUS_GROUPS, discoverStatusGroups } from '$lib/data-config/tracker-schema';
  import { resolveApiSlug, getAPIBase, fetchStatusFacets, fetchStatusTaxonomy } from '$lib/ownership-api';

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
    history.replaceState(null, '', hash ? '#' + hash : '#');
  }

  // ─── State ──────────────────────────────────────────────────────────

  let selectedClassId = $state<string | null>(null);
  let subClassChecks = $state<Record<string, boolean>>({});
  let groupOptionChecks = $state<Record<string, boolean>>({});
  let statusChecks = $state<Record<string, boolean>>({});
  let geoFilters = $state<string[]>([]);
  let dynamicStatusGroups = $state<any[] | null>(null);
  let copied = $state(false);
  let geoInput = $state('');

  const selectedClass = $derived(selectedClassId ? getAssetClassById(selectedClassId) : null);

  function isEnabled(ac: any) {
    return ac.trackers.length > 0 && ac.trackers.some((t: string) => isValidTracker(gemTrackerToUiTracker(t)));
  }

  const enabledClasses = $derived(ALL_ASSET_CLASSES.filter(isEnabled));

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

  // ─── Hash sync (write) ──────────────────────────────────────────────

  $effect(() => {
    if (!selectedClassId) {
      writeHash({});
      return;
    }
    const checkedSubs = Object.entries({ ...subClassChecks, ...groupOptionChecks })
      .filter(([, v]) => v)
      .map(([k]) => k);

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
    dynamicStatusGroups = null;

    // Init sub-class checks
    const sc: Record<string, boolean> = {};
    if (ac.subClasses) {
      for (const s of ac.subClasses) sc[s.id] = restore?.sub ? restore.sub.includes(s.id) : (s.defaultChecked ?? true);
    }
    subClassChecks = sc;

    const gc: Record<string, boolean> = {};
    if (ac.subClassGroups) {
      for (const group of ac.subClassGroups) {
        for (const opt of group.options) gc[opt.id] = restore?.sub ? restore.sub.includes(opt.id) : (opt.defaultChecked ?? true);
      }
    }
    groupOptionChecks = gc;

    // Init status checks (default: operating + planned)
    const stc: Record<string, boolean> = {};
    for (const sg of STATUS_GROUPS) {
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s}`;
        stc[key] = restore?.statuses ? restore.statuses.includes(s) : (sg.id === 'operating' || sg.id === 'planned');
      }
    }
    statusChecks = stc;

    // Fetch live status facets (non-blocking)
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
      for (const fm of facetResults) {
        for (const [status, count] of fm) merged.set(status, (merged.get(status) ?? 0) + count);
      }
      const groups = discoverStatusGroups(merged, taxonomyResult);
      dynamicStatusGroups = groups;
      const stc: Record<string, boolean> = {};
      for (const sg of groups) {
        for (const s of sg.statuses) {
          const key = `status-${sg.id}-${s.value}`;
          stc[key] = restoreStatuses ? restoreStatuses.includes(s.value) : (sg.id === 'operating' || sg.id === 'planned');
        }
      }
      statusChecks = stc;
    } catch {
      // fall back to hardcoded
    }
  }

  // ─── Results link (for opening full screener) ────────────────────────

  const resultsHref = $derived.by(() => {
    if (!selectedClass) return '';
    const classData = [{
      id: selectedClass.id,
      assetClassId: selectedClass.id,
      name: selectedClass.label,
      description: (selectedClass as any).description ?? '',
      tracker: gemTrackerToUiTracker(selectedClass.trackers[0]),
      filters: {
        geography: geoFilters.length ? geoFilters : undefined,
        statuses: selectedStatuses.length ? selectedStatuses : undefined,
      },
      selectedSubClasses: Object.entries({ ...subClassChecks, ...groupOptionChecks }).filter(([, v]) => v).map(([k]) => k),
      gemTrackers: selectedClass.trackers,
    }];
    return `/screener/results?classes=${encodeURIComponent(JSON.stringify(classData))}`;
  });

  // ─── Copy shareable link ─────────────────────────────────────────────

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  // ─── Geo input ───────────────────────────────────────────────────────

  function addGeo() {
    const v = geoInput.trim();
    if (v && !geoFilters.includes(v)) geoFilters = [...geoFilters, v];
    geoInput = '';
  }

  function removeGeo(g: string) {
    geoFilters = geoFilters.filter((x) => x !== g);
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

    // Listen for back/forward hash changes
    const onHashChange = () => {
      const h2 = readHash();
      if (!h2.class) { selectedClassId = null; return; }
      if (h2.class !== selectedClassId) {
        selectClass(h2.class, {
          statuses: h2.statuses ? h2.statuses.split(',') : undefined,
          geo: h2.geo ? h2.geo.split(',') : undefined,
          sub: h2.sub ? h2.sub.split(',') : undefined,
        });
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  // ─── Active status groups ─────────────────────────────────────────────

  const activeGroups = $derived(
    (dynamicStatusGroups ?? STATUS_GROUPS.map((sg) => ({
      id: sg.id,
      label: sg.id.charAt(0).toUpperCase() + sg.id.slice(1),
      statuses: sg.statuses.map((s) => ({ value: s, label: s })),
    }))) as Array<{ id: string; label: string; statuses: Array<{ value: string; label?: string }> }>
  );
</script>

<svelte:head>
  <title>Asset Class Screener — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="screener-embed">

  <!-- Header bar -->
  <div class="embed-header">
    <span class="embed-title">Asset Class Screener</span>
    <div class="embed-actions">
      <button class="copy-btn" class:ok={copied} onclick={copyLink} title="Copy shareable link">
        {#if copied}
          <Check size={12} /> Copied
        {:else}
          <Link size={12} /> Share
        {/if}
      </button>
      {#if resultsHref}
        <a class="results-link" href={resultsHref} target="_blank" rel="noopener">
          View full results ↗
        </a>
      {/if}
    </div>
  </div>

  <div class="embed-body">

    <!-- Left: class picker -->
    <div class="class-panel">
      <p class="panel-label">Asset Class</p>
      <div class="class-list">
        {#each enabledClasses as ac}
          <button
            class="class-btn"
            class:active={selectedClassId === ac.id}
            onclick={() => selectClass(ac.id)}
          >
            {ac.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Right: filters -->
    {#if selectedClass}
      <div class="filters-panel">

        <!-- Status -->
        <div class="filter-section">
          <p class="panel-label">Status</p>
          <div class="checkbox-group">
            {#each activeGroups as sg}
              {#each sg.statuses as s}
                {@const key = `status-${sg.id}-${s.value}`}
                <label class="check-row">
                  <input type="checkbox" bind:checked={statusChecks[key]} />
                  <span>{s.label ?? s.value}</span>
                </label>
              {/each}
            {/each}
          </div>
        </div>

        <!-- Sub-classes (if any) -->
        {#if selectedClass.subClasses?.length}
          <div class="filter-section">
            <p class="panel-label">Sub-classes</p>
            <div class="checkbox-group">
              {#each selectedClass.subClasses as sc}
                <label class="check-row">
                  <input type="checkbox" bind:checked={subClassChecks[sc.id]} />
                  <span>{sc.label}</span>
                </label>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Geography -->
        <div class="filter-section">
          <p class="panel-label">Geography</p>
          <div class="geo-tags">
            {#each geoFilters as g}
              <span class="geo-tag">
                {g}
                <button class="geo-remove" onclick={() => removeGeo(g)}>×</button>
              </span>
            {/each}
          </div>
          <div class="geo-input-row">
            <input
              class="geo-input"
              type="text"
              placeholder="Add country..."
              bind:value={geoInput}
              onkeydown={(e) => e.key === 'Enter' && addGeo()}
            />
            <button class="geo-add-btn" onclick={addGeo}>Add</button>
          </div>
        </div>

      </div>
    {:else}
      <div class="filters-placeholder">
        <span>Select an asset class to configure filters</span>
      </div>
    {/if}

  </div>
</div>

<style>
  .screener-embed {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 400px;
    font-family: var(--font-family);
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
  }

  /* Header */
  .embed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border);
    gap: var(--space-3);
    flex-shrink: 0;
  }

  .embed-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-secondary);
  }

  .embed-actions {
    display: flex;
    gap: var(--space-2);
    align-items: center;
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
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }

  .copy-btn:hover { color: var(--color-text-primary); }
  .copy-btn.ok { border-color: var(--gem-teal); color: var(--gem-teal); }

  .results-link {
    font-size: var(--font-size-xs);
    color: var(--gem-teal);
    text-decoration: none;
  }
  .results-link:hover { text-decoration: underline; }

  /* Body */
  .embed-body {
    display: grid;
    grid-template-columns: 220px 1fr;
    flex: 1;
    overflow: hidden;
  }

  /* Class panel */
  .class-panel {
    border-right: 1px solid var(--color-border);
    padding: var(--space-4);
    overflow-y: auto;
  }

  .panel-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }

  .class-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .class-btn {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    border-radius: var(--radius-sm);
    border: none;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.12s;
  }

  .class-btn:hover { background: var(--color-bg-secondary); color: var(--color-text-primary); }
  .class-btn.active {
    background: var(--gem-mint-10);
    color: var(--gem-teal);
    font-weight: var(--font-weight-semibold);
    border-left: 2px solid var(--gem-teal);
  }

  /* Filters panel */
  .filters-panel {
    padding: var(--space-4);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .filters-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-10);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
    font-style: italic;
  }

  .filter-section { display: flex; flex-direction: column; gap: var(--space-2); }

  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-4);
  }

  .check-row {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .check-row input { accent-color: var(--gem-teal); cursor: pointer; }

  /* Geo */
  .geo-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
  }

  .geo-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 2px var(--space-2);
    background: var(--gem-mint-10);
    border: 1px solid var(--gem-mint);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    color: var(--gem-teal);
  }

  .geo-remove {
    background: none;
    border: none;
    color: var(--gem-teal);
    cursor: pointer;
    font-size: var(--font-size-sm);
    line-height: 1;
    padding: 0;
  }

  .geo-input-row { display: flex; gap: var(--space-2); }

  .geo-input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
  }

  .geo-add-btn {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-secondary);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .geo-add-btn:hover { color: var(--color-text-primary); }

  @media (max-width: 600px) {
    .embed-body { grid-template-columns: 1fr; }
    .class-panel { border-right: none; border-bottom: 1px solid var(--color-border); }
  }
</style>
