<script lang="ts">
  /**
   * AssetClassExpansion — wizard modal for filtering a selected asset class.
   * Each filter category (subclass, status, geography) gets its own step.
   * Replaces the previous inline scroll-based expansion panel.
   */
  import {
    COUNTRIES,
    STATUS_GROUPS,
    fetchLiveCountries,
  } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import type { AssetClass, SubClassGroup } from '$lib/data-config/asset-class-definitions';
  import type { CatalogAssetClass, CatalogClassTree } from '$lib/api/catalog-api';
  import { getAllDescendantIds } from '$lib/api/catalog-api';
  import { ArrowRight, Search as SearchIcon, X } from 'lucide-svelte';
  import { track } from '$lib/analytics';
  import { onMount } from 'svelte';
  import { slide, fade } from 'svelte/transition';
  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';
  import GeoFenceInput from '$lib/components/screener/GeoFenceInput.svelte';
  import StatusFilter from '$lib/components/filters/StatusFilter.svelte';

  // Live countries from API facets, falls back to hardcoded COUNTRIES
  let countries = $state<readonly string[]>(COUNTRIES);
  onMount(async () => {
    const live = await fetchLiveCountries();
    if (live.length > 0) countries = live;
  });

  interface Props {
    assetClass: AssetClass;
    /** For flat subClasses: option ID -> checked */
    subClassChecks: Record<string, boolean>;
    /** For subClassGroups: option ID -> checked */
    groupOptionChecks: Record<string, boolean>;
    /** Status group option ID -> checked */
    statusChecks: Record<string, boolean>;
    geoFilters: string[];
    geofence: number[][] | null;
    onShowAllOwners: () => void;
    onSearchSpecificOwners: () => void;
    onClose: () => void;
    /** Data-driven status groups from API facets (overrides hardcoded STATUS_GROUPS) */
    dynamicStatusGroups?: DynamicStatusGroup[] | null;
    /** Direct children from /catalog/asset-classes — flat mode (when present, replaces static subClasses) */
    catalogChildren?: CatalogAssetClass[];
    /** Nested tree from /catalog/asset-classes — tree mode (feature-flagged) */
    catalogTree?: CatalogClassTree[];
    /** Checked state for catalog children/descendants: id -> boolean */
    catalogChildChecks?: Record<string, boolean>;
  }

  let {
    assetClass,
    subClassChecks = $bindable(),
    groupOptionChecks = $bindable(),
    statusChecks = $bindable(),
    geoFilters = $bindable(),
    geofence = $bindable(),
    onShowAllOwners,
    onSearchSpecificOwners,
    onClose,
    dynamicStatusGroups = null,
    catalogChildren = [],
    catalogTree = [],
    catalogChildChecks = $bindable({}),
  }: Props = $props();

  const hasCatalogTree = $derived(catalogTree.length > 0);
  const hasCatalogChildren = $derived(!hasCatalogTree && catalogChildren.length > 0);
  const hasSubClasses = $derived(
    !hasCatalogTree && !hasCatalogChildren && !!assetClass.subClasses?.length
  );
  const hasSubClassGroups = $derived(
    !hasCatalogTree && !hasCatalogChildren && !!assetClass.subClassGroups?.length
  );
  const hasStatusFilter = $derived(!!assetClass.availableFilters.status);
  const isMultiTracker = $derived(assetClass.trackers.length > 1);
  const selectedStatusCount = $derived(Object.values(statusChecks).filter(Boolean).length);

  // Catalog child helpers (flat mode)
  const catalogAllChecked = $derived(
    catalogChildren.length > 0 && catalogChildren.every((c) => catalogChildChecks[c.id] !== false)
  );
  function toggleAllCatalogChildren(checked: boolean) {
    const next: Record<string, boolean> = {};
    for (const c of catalogChildren) next[c.id] = checked;
    catalogChildChecks = next;
  }

  // ── Catalog tree helpers (tree mode) ──────────────────────────────
  function isTreeNodeChecked(node: CatalogClassTree): boolean {
    if (node.children.length === 0) return catalogChildChecks[node.entry.id] !== false;
    return node.children.every(isTreeNodeChecked);
  }

  function isTreeNodeIndeterminate(node: CatalogClassTree): boolean {
    if (node.children.length === 0) return false;
    const allChecked = node.children.every(isTreeNodeChecked);
    const noneChecked = node.children.every((c) => !isTreeNodeChecked(c));
    return !allChecked && !noneChecked;
  }

  function toggleTreeNode(node: CatalogClassTree, checked: boolean) {
    const next = { ...catalogChildChecks };
    for (const id of getAllDescendantIds(node)) {
      next[id] = checked;
    }
    catalogChildChecks = next;
  }

  function toggleAllTree(checked: boolean) {
    const next = { ...catalogChildChecks };
    for (const tree of catalogTree) {
      for (const id of getAllDescendantIds(tree)) {
        next[id] = checked;
      }
    }
    catalogChildChecks = next;
  }

  const catalogTreeAllChecked = $derived(
    catalogTree.length > 0 && catalogTree.every(isTreeNodeChecked)
  );

  // ── Wizard steps ───────────────────────────────────────────────────
  const steps = $derived.by(() => {
    const s: { id: string; label: string; optional?: boolean }[] = [];
    if (hasCatalogTree || hasCatalogChildren || hasSubClasses || hasSubClassGroups)
      s.push({ id: 'subclass', label: 'Subclass' });
    if (hasStatusFilter) s.push({ id: 'status', label: 'Status' });
    if (assetClass.availableFilters.geography)
      s.push({ id: 'geography', label: 'Geography', optional: true });
    return s;
  });
  let currentStep = $state(0);

  function goToStep(i: number) {
    currentStep = i;
  }

  // Clamp currentStep when steps change (e.g. asset class switch)
  $effect(() => {
    if (currentStep >= steps.length && steps.length > 0) {
      currentStep = 0;
    }
  });

  // ── REFINE expand/collapse state ───────────────────────────────────
  let expandedRefine: Record<string, boolean> = $state({});

  function toggleRefine(id: string) {
    expandedRefine = { ...expandedRefine, [id]: !expandedRefine[id] };
  }

  // ── SubClassGroup helpers ─────────────────────────────────────────

  function getGroupOptionIds(group: SubClassGroup): string[] {
    return group.options.map((o) => o.id);
  }

  function isGroupAllChecked(group: SubClassGroup): boolean {
    return getGroupOptionIds(group).every((id) => groupOptionChecks[id]);
  }

  function isGroupNoneChecked(group: SubClassGroup): boolean {
    return getGroupOptionIds(group).every((id) => !groupOptionChecks[id]);
  }

  function isGroupIndeterminate(group: SubClassGroup): boolean {
    return !isGroupAllChecked(group) && !isGroupNoneChecked(group);
  }

  function toggleGroup(group: SubClassGroup) {
    track('tracker', 'select-class', group.label);
    const wasAllChecked = isGroupAllChecked(group);
    const next = { ...groupOptionChecks };
    for (const id of getGroupOptionIds(group)) {
      next[id] = !wasAllChecked;
    }
    groupOptionChecks = next;
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

  // ── Modal helpers ─────────────────────────────────────────────────

  // Can the user finish right now? (not blocked by required steps ahead)
  const canFinishNow = $derived.by(() => {
    // Check if all remaining steps are optional
    for (let i = currentStep + 1; i < steps.length; i++) {
      if (!steps[i].optional) return false;
    }
    return true;
  });

  const isLastStep = $derived(currentStep >= steps.length - 1);
  const actionsDisabled = $derived(hasStatusFilter && selectedStatusCount === 0);

  function handleBackdropClick() {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Backdrop -->
<div class="modal-backdrop" onclick={handleBackdropClick} role="presentation"></div>

<!-- Modal -->
<div class="modal" role="dialog" aria-modal="true" aria-label="{assetClass.label} filters">
  <!-- Header -->
  <header class="modal-header">
    <div class="modal-title-row">
      <h4 class="modal-title">{assetClass.label}</h4>
      <button class="modal-close" onclick={onClose} aria-label="Close">
        <X size={18} />
      </button>
    </div>
    {#if assetClass.description}
      <p class="modal-description">{assetClass.description}</p>
    {/if}
    {#if isMultiTracker}
      <div class="multi-tracker-note">
        Spans {assetClass.trackers.length} trackers ({assetClass.trackers.join(', ')}). Current
        query uses <strong>{assetClass.trackers[0]}</strong> only.
      </div>
    {/if}
    <!-- Step tabs -->
    {#if steps.length > 1}
      <nav class="step-tabs">
        {#each steps as step, i}
          <button
            class="step-tab"
            class:active={i === currentStep}
            class:completed={i < currentStep}
            class:optional={step.optional}
            onclick={() => goToStep(i)}
          >
            {i + 1}. {step.label}
            {#if step.optional}<span class="optional-badge">optional</span>{/if}
          </button>
        {/each}
      </nav>
    {/if}
  </header>

  <!-- Body: all steps rendered, CSS transitions handle visibility -->
  <div class="modal-body">
    <div class="step-stage">
      {#each steps as step, i (step.id)}
        {@const isActive = i === currentStep}
        {@const offset = i - currentStep}
        <div
          class="step-pane"
          class:active={isActive}
          class:before={offset < 0}
          class:after={offset > 0}
          aria-hidden={!isActive}
          style="--offset: {offset};"
        >
          {#if step.id === 'subclass'}
            <!-- NARROW BY SUBCLASS: catalog tree (feature-flagged, hierarchical) -->
            {#if hasCatalogTree}
              <div class="filter-section">
                <span class="section-heading">Narrow by subclass</span>
                <div class="catalog-select-all">
                  <label class="group-checkbox">
                    <input
                      type="checkbox"
                      checked={catalogTreeAllChecked}
                      onchange={(e) =>
                        toggleAllTree((e.target as HTMLInputElement).checked)}
                    />
                    <span class="group-label">All subclasses</span>
                  </label>
                </div>
                <div class="group-row">
                  {#each catalogTree as treeNode (treeNode.entry.id)}
                    {@const hasKids = treeNode.children.length > 0}
                    <div class="group-item">
                      <label class="group-checkbox">
                        <input
                          type="checkbox"
                          checked={isTreeNodeChecked(treeNode)}
                          indeterminate={isTreeNodeIndeterminate(treeNode)}
                          onchange={(e) =>
                            toggleTreeNode(treeNode, (e.target as HTMLInputElement).checked)}
                        />
                        <span class="group-label">{treeNode.entry.label}</span>
                      </label>
                      {#if hasKids}
                        <button
                          class="refine-toggle"
                          onclick={() => toggleRefine(treeNode.entry.id)}
                        >
                          {expandedRefine[treeNode.entry.id] ? '\u25BC' : '\u25B6'} Refine
                        </button>
                      {/if}
                      {#if hasKids && expandedRefine[treeNode.entry.id]}
                        <div class="refine-panel" transition:slide={{ duration: 150 }}>
                          {#each treeNode.children as child (child.entry.id)}
                            {@const childHasKids = child.children.length > 0}
                            <label class="refine-option">
                              <input
                                type="checkbox"
                                checked={isTreeNodeChecked(child)}
                                indeterminate={isTreeNodeIndeterminate(child)}
                                onchange={(e) =>
                                  toggleTreeNode(child, (e.target as HTMLInputElement).checked)}
                              />
                              <span class="refine-label">{child.entry.label}</span>
                            </label>
                            {#if childHasKids}
                              <button
                                class="refine-toggle nested"
                                onclick={() => toggleRefine(child.entry.id)}
                              >
                                {expandedRefine[child.entry.id] ? '\u25BC' : '\u25B6'} Refine
                              </button>
                              {#if expandedRefine[child.entry.id]}
                                <div class="refine-panel nested" transition:slide={{ duration: 150 }}>
                                  {#each child.children as leaf (leaf.entry.id)}
                                    <label class="refine-option">
                                      <input
                                        type="checkbox"
                                        checked={catalogChildChecks[leaf.entry.id] !== false}
                                        onchange={(e) => {
                                          catalogChildChecks = {
                                            ...catalogChildChecks,
                                            [leaf.entry.id]: (e.target as HTMLInputElement).checked,
                                          };
                                        }}
                                      />
                                      <span class="refine-label">{leaf.entry.label}</span>
                                    </label>
                                  {/each}
                                </div>
                              {/if}
                            {/if}
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- NARROW BY SUBCLASS: catalog children (flat mode, server-side) -->
            {#if hasCatalogChildren}
              <div class="filter-section">
                <span class="section-heading">Narrow by subclass</span>
                <div class="catalog-select-all">
                  <label class="group-checkbox">
                    <input
                      type="checkbox"
                      checked={catalogAllChecked}
                      onchange={(e) =>
                        toggleAllCatalogChildren((e.target as HTMLInputElement).checked)}
                    />
                    <span class="group-label">All subclasses</span>
                  </label>
                </div>
                <div class="group-row">
                  {#each catalogChildren as child (child.id)}
                    <div class="group-item">
                      <label class="group-checkbox">
                        <input
                          type="checkbox"
                          checked={catalogChildChecks[child.id] !== false}
                          onchange={(e) => {
                            catalogChildChecks = {
                              ...catalogChildChecks,
                              [child.id]: (e.target as HTMLInputElement).checked,
                            };
                          }}
                        />
                        <span class="group-label">{child.label}</span>
                      </label>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- NARROW BY SUBCLASS: grouped (subClassGroups) — static fallback -->
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
                              <input type="checkbox" bind:checked={groupOptionChecks[opt.id]} />
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
                        <input type="checkbox" bind:checked={subClassChecks[sc.id]} />
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
          {:else if step.id === 'status'}
            <StatusFilter bind:statusChecks statusGroups={resolvedStatusGroups} />
          {:else if step.id === 'geography'}
            <!-- GEOGRAPHY (optional) -->
            <div class="filter-section">
              <span class="section-heading"
                >Geography <span class="optional-inline">optional</span></span
              >
              <p class="step-hint">
                Leave empty to include all countries. You can proceed without filtering.
              </p>
              <CountryMultiSelect bind:selected={geoFilters} {countries} />
              <GeoFenceInput bind:geofence />
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Footer -->
  <footer class="modal-footer">
    <button
      class="footer-btn back"
      disabled={currentStep === 0}
      onclick={() => goToStep(currentStep - 1)}
    >
      Back
    </button>
    <div class="footer-right">
      {#key isLastStep || canFinishNow}
        <div
          class="footer-actions"
          in:fade={{ duration: 180, delay: 60 }}
          out:fade={{ duration: 120 }}
        >
          {#if isLastStep || canFinishNow}
            <button
              class="footer-btn search-owners-cta"
              onclick={onSearchSpecificOwners}
              disabled={actionsDisabled}
            >
              <SearchIcon size={16} />
              Search Specific Owners
            </button>
            <div class="footer-secondary-row">
              {#if !isLastStep}
                <button class="footer-btn geo-opt-in" onclick={() => goToStep(currentStep + 1)}>
                  or narrow by country
                </button>
              {/if}
              <button class="footer-btn secondary" onclick={onShowAllOwners} disabled={actionsDisabled}>
                <ArrowRight size={14} />
                All owners of this asset type
              </button>
            </div>
          {:else}
            <button class="footer-btn primary" onclick={() => goToStep(currentStep + 1)}>
              Next <ArrowRight size={14} />
            </button>
          {/if}
        </div>
      {/key}
    </div>
  </footer>
</div>

<style>
  /* ── Modal chrome ─────────────────────────────────────────────────── */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: color-mix(in srgb, var(--color-white, #fff) 90%, transparent);
    z-index: 9998;
    backdrop-filter: blur(2px);
    animation: backdropIn 0.2s ease-out;
  }

  @keyframes backdropIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(780px, 90vw);
    max-height: 80vh;
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-black, #000);
    z-index: 9999;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: Georgia, serif;
    animation: modalIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
    }
  }

  /* ── Header ───────────────────────────────────────────────────────── */
  .modal-header {
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--color-gray-100, #f1f5f9);
  }

  .modal-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
  }

  .modal-title {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    margin: 0;
    color: var(--color-text-primary);
  }

  .modal-close {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    padding: 4px;
    line-height: 1;
    border-radius: 2px;
  }

  .modal-close:hover {
    color: var(--color-text-primary);
    background: var(--color-gray-100, #f1f5f9);
  }

  .modal-description {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
    margin: 4px 0 0 0;
  }

  .multi-tracker-note {
    padding: var(--space-2, 8px) var(--space-3, 12px);
    background: var(--gem-teal-10);
    border: 1px solid var(--gem-teal-25);
    border-radius: var(--radius-sm, 4px);
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-secondary);
    margin-top: 8px;
  }

  /* ── Step tabs ────────────────────────────────────────────────────── */
  .step-tabs {
    display: flex;
    gap: 4px;
    margin-top: 12px;
  }

  .step-tab {
    flex: 1;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--color-gray-50, #f8fafc);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    color: var(--color-text-tertiary);
    transition: all 120ms ease;
    text-align: center;
    font-family: inherit;
  }

  .step-tab:hover {
    border-color: var(--color-gray-400, #9ca3af);
    color: var(--color-text-secondary);
  }

  .step-tab.active {
    background: var(--gem-teal);
    border-color: var(--gem-teal);
    color: #fff;
  }

  .step-tab.completed {
    background: var(--gem-teal-10);
    border-color: var(--gem-teal);
    color: var(--gem-teal);
  }

  .step-tab.optional {
    border-style: dashed;
  }

  .optional-badge {
    font-size: 9px;
    font-weight: 400;
    text-transform: lowercase;
    letter-spacing: 0;
    opacity: 0.7;
    margin-left: 2px;
  }

  .step-tab.active .optional-badge {
    opacity: 0.8;
  }

  /* ── Body ─────────────────────────────────────────────────────────── */
  .modal-body {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* Grid stacking: all panes occupy same cell, only active one is visible */
  .step-stage {
    display: grid;
    grid-template: 1fr / 1fr;
    min-height: 180px;
  }

  .step-pane {
    grid-area: 1 / 1;
    padding: 16px 20px;
    overflow-y: auto;
    max-height: calc(80vh - 200px);

    /* Default: hidden, shifted, not interactive */
    visibility: hidden;
    opacity: 0;
    transform: translateX(calc(var(--offset, 0) * 40px));
    pointer-events: none;

    transition:
      opacity 260ms cubic-bezier(0.4, 0, 0.2, 1),
      transform 300ms cubic-bezier(0.16, 1, 0.3, 1),
      visibility 0ms 260ms; /* delay visibility:hidden until fade completes */
  }

  .step-pane.active {
    visibility: visible;
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
    transition:
      opacity 260ms cubic-bezier(0.4, 0, 0.2, 1) 40ms,
      /* slight delay for crossfade feel */ transform 300ms cubic-bezier(0.16, 1, 0.3, 1) 40ms,
      visibility 0ms 0ms; /* immediately visible */
  }

  /* ── Footer ───────────────────────────────────────────────────────── */
  .modal-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--color-gray-100, #f1f5f9);
    gap: 8px;
  }

  .footer-right {
    display: flex;
    gap: 8px;
    position: relative;
  }

  .footer-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
  }

  .footer-secondary-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .footer-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 500;
    border-radius: var(--radius-sm, 4px);
    cursor: pointer;
    transition: all 120ms ease;
    font-family: inherit;
  }

  .footer-btn.back {
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    color: var(--color-text-secondary);
  }

  .footer-btn.back:hover:not(:disabled) {
    border-color: var(--color-gray-400, #9ca3af);
    color: var(--color-text-primary);
  }

  .footer-btn.primary {
    background: var(--gem-teal);
    border: 1px solid var(--gem-teal);
    color: #fff;
  }

  .footer-btn.primary:hover:not(:disabled) {
    background: var(--gem-primary-blue, #153444);
    border-color: var(--gem-primary-blue, #153444);
  }

  .footer-btn.search-owners-cta {
    width: 100%;
    justify-content: center;
    padding: 10px 16px;
    font-size: 14px;
    font-weight: 600;
    background: var(--gem-teal);
    border: 1px solid var(--gem-teal);
    color: #fff;
  }

  .footer-btn.search-owners-cta:hover:not(:disabled) {
    background: var(--gem-primary-blue, #153444);
    border-color: var(--gem-primary-blue, #153444);
  }

  .footer-btn.secondary {
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    color: var(--color-text-primary);
  }

  .footer-btn.secondary:hover:not(:disabled) {
    border-color: var(--gem-teal);
  }

  .footer-btn.geo-opt-in {
    background: none;
    border: 1px dashed var(--color-gray-300, #d1d5db);
    color: var(--color-text-tertiary);
    font-size: 12px;
    font-weight: 400;
    font-style: italic;
    padding: 6px 12px;
  }

  .footer-btn.geo-opt-in:hover {
    border-color: var(--gem-teal);
    color: var(--gem-teal);
  }

  .footer-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Filter sections (shared across steps) ────────────────────────── */
  .filter-section {
    margin-bottom: var(--space-4, 16px);
  }

  .section-heading {
    display: block;
    font-size: var(--font-size-sm, 13px);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3, 12px);
  }

  .optional-inline {
    font-size: 10px;
    font-weight: 400;
    text-transform: lowercase;
    letter-spacing: 0;
    color: var(--color-text-tertiary);
    opacity: 0.7;
    margin-left: 4px;
  }

  .step-hint {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
    font-style: italic;
    margin: 0 0 var(--space-3, 12px) 0;
  }

  .group-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3, 12px);
    align-items: start;
  }

  .group-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    min-width: 0;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-primary, #fff);
  }

  .group-checkbox {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-body, 15px);
  }

  .group-checkbox input[type='checkbox'] {
    margin: 0;
    margin-top: 4px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .group-label {
    font-weight: 500;
    color: var(--color-text-primary);
    line-height: 1.25;
  }

  .group-desc {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
  }

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
    font-family: inherit;
  }

  .refine-toggle:hover {
    color: var(--gem-teal);
  }

  .refine-toggle.nested {
    margin-left: var(--space-4, 16px);
    font-size: 10px;
  }

  .refine-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px) 0 var(--space-2, 8px) var(--space-4, 16px);
    border-left: 2px solid var(--color-border, #e5e7eb);
    margin-top: var(--space-1, 4px);
  }

  .refine-panel.nested {
    margin-left: var(--space-4, 16px);
    border-left-color: var(--color-gray-300, #d1d5db);
  }

  .refine-option {
    display: flex;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-secondary);
  }

  .refine-option input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .refine-label {
    text-transform: capitalize;
    flex: 1;
    min-width: 0;
  }

  /* ── Responsive ───────────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .modal {
      width: 95vw;
      max-height: 90vh;
    }

    .group-row {
      grid-template-columns: 1fr;
    }

    .step-tabs {
      flex-wrap: wrap;
    }

    .modal-footer {
      flex-wrap: wrap;
    }

    .footer-right {
      flex-wrap: wrap;
    }
  }
</style>
