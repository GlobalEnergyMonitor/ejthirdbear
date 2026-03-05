<script lang="ts">
  /**
   * AssetClassExpansion — filter panel for a selected asset class.
   * Shows sub-class groups with REFINE pattern, status buckets with REFINE,
   * geography dropdown, and continue buttons.
   */
  import { slide } from 'svelte/transition';
  import { COUNTRIES, STATUS_GROUPS } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import type { AssetClass, SubClassGroup } from '$lib/data-config/asset-class-definitions';
  import { ArrowRight, Search as SearchIcon } from 'lucide-svelte';
  import { track } from '$lib/analytics';
  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';
  import GeoFenceInput from '$lib/components/screener/GeoFenceInput.svelte';

  interface Props {
    assetClass: AssetClass;
    /** For flat subClasses: option ID -> checked */
    checkedSubClasses: Record<string, boolean>;
    /** For subClassGroups: option ID -> checked */
    checkedGroupOptions: Record<string, boolean>;
    /** Status group option ID -> checked */
    checkedStatuses: Record<string, boolean>;
    geoFilters: string[];
    geofence: number[][] | null;
    onShowAllOwners: () => void;
    onSearchSpecificOwners: () => void;
    /** Data-driven status groups from API facets (overrides hardcoded STATUS_GROUPS) */
    dynamicStatusGroups?: DynamicStatusGroup[] | null;
  }

  let {
    assetClass,
    checkedSubClasses = $bindable(),
    checkedGroupOptions = $bindable(),
    checkedStatuses = $bindable(),
    geoFilters = $bindable(),
    geofence = $bindable(),
    onShowAllOwners,
    onSearchSpecificOwners,
    dynamicStatusGroups = null,
  }: Props = $props();

  const hasSubClasses = $derived(!!assetClass.subClasses?.length);
  const hasSubClassGroups = $derived(!!assetClass.subClassGroups?.length);
  const hasStatusFilter = $derived(!!assetClass.availableFilters.status);
  const isMultiTracker = $derived(assetClass.trackers.length > 1);
  const selectedStatusCount = $derived(Object.values(checkedStatuses).filter(Boolean).length);

  // REFINE expand/collapse state
  let expandedRefine: Record<string, boolean> = $state({});

  function toggleRefine(id: string) {
    expandedRefine = { ...expandedRefine, [id]: !expandedRefine[id] };
  }

  // ── SubClassGroup helpers ─────────────────────────────────────────

  function getGroupOptionIds(group: SubClassGroup): string[] {
    return group.options.map((o) => o.id);
  }

  function isGroupAllChecked(group: SubClassGroup): boolean {
    return getGroupOptionIds(group).every((id) => checkedGroupOptions[id]);
  }

  function isGroupNoneChecked(group: SubClassGroup): boolean {
    return getGroupOptionIds(group).every((id) => !checkedGroupOptions[id]);
  }

  function isGroupIndeterminate(group: SubClassGroup): boolean {
    return !isGroupAllChecked(group) && !isGroupNoneChecked(group);
  }

  function toggleGroup(group: SubClassGroup) {
    track('tracker', 'select-class', group.label);
    const allChecked = isGroupAllChecked(group);
    const next = { ...checkedGroupOptions };
    for (const id of getGroupOptionIds(group)) {
      next[id] = !allChecked;
    }
    checkedGroupOptions = next;
  }

  // ── Resolved status groups (dynamic or hardcoded fallback) ───────

  /** Adapt hardcoded STATUS_GROUPS into DynamicStatusGroup shape for uniform rendering */
  const resolvedStatusGroups = $derived.by((): DynamicStatusGroup[] => {
    if (dynamicStatusGroups && dynamicStatusGroups.length > 0) return dynamicStatusGroups;
    return STATUS_GROUPS.map((sg) => ({
      id: sg.id,
      label: sg.label,
      statuses: sg.statuses.map((s) => ({ value: s, count: -1 })),
      totalCount: -1,
    }));
  });

  // ── Status group helpers ──────────────────────────────────────────

  function getStatusIds(groupId: string): string[] {
    const g = resolvedStatusGroups.find((sg) => sg.id === groupId);
    return g ? g.statuses.map((s) => `status-${groupId}-${s.value}`) : [];
  }

  function isStatusGroupAllChecked(groupId: string): boolean {
    return getStatusIds(groupId).every((id) => checkedStatuses[id]);
  }

  function isStatusGroupNoneChecked(groupId: string): boolean {
    return getStatusIds(groupId).every((id) => !checkedStatuses[id]);
  }

  function isStatusGroupIndeterminate(groupId: string): boolean {
    return !isStatusGroupAllChecked(groupId) && !isStatusGroupNoneChecked(groupId);
  }

  function toggleStatusGroup(groupId: string) {
    const allChecked = isStatusGroupAllChecked(groupId);
    const next = { ...checkedStatuses };
    for (const id of getStatusIds(groupId)) {
      next[id] = !allChecked;
    }
    checkedStatuses = next;
  }

  function setStatusPreset(preset: 'default' | 'all' | 'none') {
    const next: Record<string, boolean> = {};
    for (const sg of resolvedStatusGroups) {
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s.value}`;
        if (preset === 'all') {
          next[key] = true;
        } else if (preset === 'none') {
          next[key] = false;
        } else {
          next[key] = sg.id === 'operating' || sg.id === 'planned';
        }
      }
    }
    checkedStatuses = next;
  }

  // ── Auto-scroll to next section on interaction ──────────────────
  let statusSectionEl: HTMLElement | undefined = $state();
  let geoSectionEl: HTMLElement | undefined = $state();
  let step2El: HTMLElement | undefined = $state();

  /** Quad ease-out: fast start, gentle deceleration */
  function easeOutQuad(t: number): number {
    return t * (2 - t);
  }

  /** Scroll just enough to bring `el` into the lower third of the viewport */
  function smoothScrollTo(el: HTMLElement, duration = 300) {
    const rect = el.getBoundingClientRect();
    const viewH = window.innerHeight;
    // If already visible in the lower two-thirds, don't scroll
    if (rect.top >= 0 && rect.top < viewH * 0.65) return;
    // Target: place element at ~60% down the viewport
    const desired = viewH * 0.6;
    const distance = rect.top - desired;
    if (Math.abs(distance) < 10) return;

    const start = window.scrollY;
    const startTime = performance.now();

    function step(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      window.scrollTo(0, start + distance * easeOutQuad(t));
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // Track whether each section has had its first interaction (avoid re-scrolling on every change)
  let hasScrolledToStatus = false;
  let hasScrolledToGeo = false;
  let hasScrolledToStep2 = false;

  // Subclass change → scroll to status (if it exists) or geo
  const anySubClassChecked = $derived(
    Object.values(checkedSubClasses).some(Boolean) ||
      Object.values(checkedGroupOptions).some(Boolean)
  );
  $effect(() => {
    if (!anySubClassChecked || hasScrolledToStatus) return;
    hasScrolledToStatus = true;
    const target = statusSectionEl ?? geoSectionEl ?? step2El;
    if (target) setTimeout(() => smoothScrollTo(target), 50);
  });

  // Status change → scroll to geography (if it exists) or step 2
  $effect(() => {
    if (selectedStatusCount === 0 || hasScrolledToGeo) return;
    hasScrolledToGeo = true;
    const target = geoSectionEl ?? step2El;
    if (target) setTimeout(() => smoothScrollTo(target), 50);
  });

  // Geography change → scroll to step 2 buttons
  $effect(() => {
    if (geoFilters.length === 0 || hasScrolledToStep2) return;
    hasScrolledToStep2 = true;
    if (step2El) setTimeout(() => smoothScrollTo(step2El!), 50);
  });
</script>

<div class="expansion-panel" transition:slide={{ duration: 200 }}>
  <div class="expansion-header">
    <h4 class="expansion-title">{assetClass.label}</h4>
    <p class="expansion-description">{assetClass.description}</p>
  </div>

  {#if isMultiTracker}
    <div class="multi-tracker-note">
      Spans {assetClass.trackers.length} trackers ({assetClass.trackers.join(', ')}). Current query
      uses <strong>{assetClass.trackers[0]}</strong> only.
    </div>
  {/if}

  <!-- NARROW BY SUBCLASS: grouped (subClassGroups) -->
  {#if hasSubClassGroups}
    <div class="filter-section">
      <span class="section-heading">Narrow by subclass</span>
      <div class="group-row">
        {#each assetClass.subClassGroups ?? [] as group (group.id)}
          {@const hasRefine = group.options.length > 1}
          <div class="group-item">
            <label class="group-checkbox">
              <input
                type="checkbox"
                checked={isGroupAllChecked(group)}
                indeterminate={isGroupIndeterminate(group)}
                onchange={() => toggleGroup(group)}
              />
              <span class="group-label">{group.label}</span>
            </label>
            {#if hasRefine}
              <button class="refine-toggle" onclick={() => toggleRefine(group.id)}>
                {expandedRefine[group.id] ? '\u25BC' : '\u25B6'} Refine
              </button>
            {/if}
            {#if hasRefine && expandedRefine[group.id]}
              <div class="refine-panel" transition:slide={{ duration: 150 }}>
                {#each group.options as opt (opt.id)}
                  <label class="refine-option">
                    <input type="checkbox" bind:checked={checkedGroupOptions[opt.id]} />
                    <span>{opt.label}</span>
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- NARROW BY SUBCLASS: flat (subClasses) -->
  {#if hasSubClasses && !hasSubClassGroups}
    <div class="filter-section">
      <span class="section-heading">Narrow by subclass</span>
      <div class="group-row">
        {#each assetClass.subClasses ?? [] as sc (sc.id)}
          <div class="group-item">
            <label class="group-checkbox">
              <input type="checkbox" bind:checked={checkedSubClasses[sc.id]} />
              <span class="group-label">{sc.label}</span>
            </label>
            {#if sc.description}
              <span class="group-desc">{sc.description}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- OPERATING STATUS -->
  {#if hasStatusFilter}
    <div class="filter-section" bind:this={statusSectionEl}>
      <span class="section-heading">Operating status</span>
      <div class="status-toolbar">
        <div class="status-presets" role="group" aria-label="Status presets">
          <button type="button" class="preset-btn" onclick={() => setStatusPreset('default')}>
            Operating + planned
          </button>
          <button type="button" class="preset-btn" onclick={() => setStatusPreset('all')}>
            All statuses
          </button>
          <button type="button" class="preset-btn" onclick={() => setStatusPreset('none')}>
            Clear
          </button>
        </div>
        <span class="status-count">{selectedStatusCount} selected</span>
      </div>
      <div class="group-row">
        {#each resolvedStatusGroups as sg (sg.id)}
          {@const hasRefine = sg.statuses.length > 1}
          <div class="group-item">
            <label class="group-checkbox">
              <input
                type="checkbox"
                checked={isStatusGroupAllChecked(sg.id)}
                indeterminate={isStatusGroupIndeterminate(sg.id)}
                onchange={() => toggleStatusGroup(sg.id)}
              />
              <span class="group-label">{sg.label}</span>
              {#if sg.totalCount > 0}
                <span class="count-badge">{sg.totalCount.toLocaleString()}</span>
              {/if}
            </label>
            {#if hasRefine}
              <button class="refine-toggle" onclick={() => toggleRefine(`status-${sg.id}`)}>
                {expandedRefine[`status-${sg.id}`] ? '\u25BC' : '\u25B6'} Refine
              </button>
            {/if}
            {#if hasRefine && expandedRefine[`status-${sg.id}`]}
              <div class="refine-panel" transition:slide={{ duration: 150 }}>
                {#each sg.statuses as statusItem}
                  <label class="refine-option">
                    <input
                      type="checkbox"
                      bind:checked={checkedStatuses[`status-${sg.id}-${statusItem.value}`]}
                    />
                    <span>{statusItem.value}</span>
                    {#if statusItem.count > 0}
                      <span class="count-badge small">{statusItem.count.toLocaleString()}</span>
                    {/if}
                  </label>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      {#if selectedStatusCount === 0}
        <p class="status-warning">Select at least one status to continue.</p>
      {/if}
    </div>
  {/if}

  <!-- GEOGRAPHY -->
  {#if assetClass.availableFilters.geography}
    <div class="filter-section" bind:this={geoSectionEl}>
      <span class="section-heading">Geography</span>
      <CountryMultiSelect bind:selected={geoFilters} countries={COUNTRIES} />
      <GeoFenceInput bind:geofence />
    </div>
  {/if}

  <div class="step-divider" bind:this={step2El}>Step 2: Choose how to find owners</div>

  <div class="continue-options">
    <button
      class="continue-btn primary"
      onclick={onShowAllOwners}
      disabled={hasStatusFilter && selectedStatusCount === 0}
    >
      <span class="btn-icon"><ArrowRight size={18} /></span>
      Show All Owners
      <span class="btn-sublabel">See every company with stakes</span>
    </button>
    <button
      class="continue-btn secondary"
      onclick={onSearchSpecificOwners}
      disabled={hasStatusFilter && selectedStatusCount === 0}
    >
      <span class="btn-icon"><SearchIcon size={18} /></span>
      Search Specific Owners
      <span class="btn-sublabel">Find companies from a list</span>
    </button>
  </div>
</div>

<style>
  .expansion-panel {
    padding: var(--space-6);
    background: var(--color-bg-secondary, #f9fafb);
    border-left: 3px solid var(--gem-teal, #2a7f8f);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    margin-top: var(--space-4);
  }

  .expansion-header {
    margin-bottom: var(--space-5);
  }

  .expansion-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0 0 var(--space-1) 0;
    color: var(--color-text-primary);
  }

  .expansion-description {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .multi-tracker-note {
    padding: var(--space-3) var(--space-4);
    background: rgba(42, 127, 143, 0.08);
    border: 1px solid rgba(42, 127, 143, 0.2);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-5);
  }

  /* Filter sections */
  .filter-section {
    margin-bottom: var(--space-5);
  }

  .section-heading {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  /* Group row — uniform grid with aligned baselines */
  .group-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3);
    align-items: start;
  }

  .group-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary, #fff);
  }

  .group-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--font-size-body);
  }

  .group-checkbox input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .group-label {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .group-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .status-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }

  .status-presets {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .preset-btn {
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-2);
    cursor: pointer;
  }

  .preset-btn:hover {
    border-color: var(--gem-teal, #2a7f8f);
    color: var(--color-text-primary);
  }

  .status-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .status-warning {
    margin: var(--space-2) 0 0 0;
    font-size: var(--font-size-sm);
    color: #b45309;
  }

  /* REFINE toggle */
  .refine-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .refine-toggle:hover {
    color: var(--gem-teal, #2a7f8f);
  }

  /* REFINE sub-panel */
  .refine-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) 0 var(--space-2) var(--space-4);
    border-left: 2px solid var(--color-border, #e5e7eb);
    margin-top: var(--space-1);
  }

  .refine-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .refine-option input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .count-badge {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-tertiary);
    background: var(--color-gray-100, #f1f5f9);
    padding: 1px 6px;
    border-radius: 9999px;
    margin-left: auto;
  }

  .count-badge.small {
    font-size: 10px;
    padding: 0 4px;
  }

  /* Step divider + continue */
  .step-divider {
    margin-bottom: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border, #e5e7eb);
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
  }

  .continue-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }

  .continue-btn {
    display: grid;
    grid-template-rows: auto auto auto;
    gap: var(--space-1);
    align-content: start;
    padding: var(--space-5) var(--space-6);
    font-size: var(--font-size-lg);
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--duration-base, 150ms) var(--ease-in-out-quad, ease);
    text-align: left;
  }

  .continue-btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .btn-icon {
    font-size: var(--font-size-xl);
    line-height: 1;
    margin-bottom: var(--space-1);
  }

  .btn-sublabel {
    font-size: var(--font-size-body);
    font-weight: 400;
    opacity: 0.8;
  }

  .continue-btn.primary {
    background: var(--gem-teal, #1d4961);
    color: var(--color-white, #fff);
    border: none;
  }

  .continue-btn.primary:hover {
    background: var(--gem-primary-blue, #153444);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(29, 73, 97, 0.3);
  }

  .continue-btn.secondary {
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-primary);
    border: 2px solid var(--color-gray-200, #e5e7eb);
  }

  .continue-btn.secondary:hover {
    border-color: var(--gem-teal, #1d4961);
    transform: translateY(-2px);
  }

  @media (max-width: 640px) {
    .group-row {
      grid-template-columns: 1fr;
    }

    .continue-options {
      grid-template-columns: 1fr;
    }
  }
</style>
