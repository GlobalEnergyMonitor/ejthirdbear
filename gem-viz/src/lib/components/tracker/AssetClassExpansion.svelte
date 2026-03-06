<script lang="ts">
  /**
   * AssetClassExpansion — wizard modal for filtering a selected asset class.
   * Each filter category (subclass, status, geography) gets its own step.
   * Replaces the previous inline scroll-based expansion panel.
   */
  import { COUNTRIES, STATUS_GROUPS } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import type { AssetClass, SubClassGroup } from '$lib/data-config/asset-class-definitions';
  import { ArrowRight, Search as SearchIcon, X } from 'lucide-svelte';
  import { track } from '$lib/analytics';
  import { slide, fade } from 'svelte/transition';
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
    onClose: () => void;
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
    onClose,
    dynamicStatusGroups = null,
  }: Props = $props();

  const hasSubClasses = $derived(!!assetClass.subClasses?.length);
  const hasSubClassGroups = $derived(!!assetClass.subClassGroups?.length);
  const hasStatusFilter = $derived(!!assetClass.availableFilters.status);
  const isMultiTracker = $derived(assetClass.trackers.length > 1);
  const selectedStatusCount = $derived(Object.values(checkedStatuses).filter(Boolean).length);

  // ── Wizard steps ───────────────────────────────────────────────────
  const steps = $derived.by(() => {
    const s: { id: string; label: string; optional?: boolean }[] = [];
    if (hasSubClasses || hasSubClassGroups) s.push({ id: 'subclass', label: 'Subclass' });
    if (hasStatusFilter) s.push({ id: 'status', label: 'Status' });
    if (assetClass.availableFilters.geography) s.push({ id: 'geography', label: 'Geography', optional: true });
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

  // ── Modal helpers ─────────────────────────────────────────────────

  // Is the next step optional? (i.e. geography)
  const nextStepIsOptional = $derived(
    currentStep < steps.length - 1 && steps[currentStep + 1]?.optional === true
  );

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
        Spans {assetClass.trackers.length} trackers ({assetClass.trackers.join(', ')}). Current query
        uses <strong>{assetClass.trackers[0]}</strong> only.
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

          {:else if step.id === 'status'}
            <!-- OPERATING STATUS -->
            <div class="filter-section">
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

          {:else if step.id === 'geography'}
            <!-- GEOGRAPHY (optional) -->
            <div class="filter-section">
              <span class="section-heading">Geography <span class="optional-inline">optional</span></span>
              <p class="step-hint">Leave empty to include all countries. You can proceed without filtering.</p>
              <CountryMultiSelect bind:selected={geoFilters} countries={COUNTRIES} />
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
        <div class="footer-actions" in:fade={{ duration: 180, delay: 60 }} out:fade={{ duration: 120 }}>
          {#if isLastStep || canFinishNow}
            {#if !isLastStep}
              <button class="footer-btn geo-opt-in" onclick={() => goToStep(currentStep + 1)}>
                or narrow by country
              </button>
            {/if}
            <button
              class="footer-btn secondary"
              onclick={onSearchSpecificOwners}
              disabled={actionsDisabled}
            >
              <SearchIcon size={14} />
              Search Specific Owners
            </button>
            <button
              class="footer-btn primary"
              onclick={onShowAllOwners}
              disabled={actionsDisabled}
            >
              <ArrowRight size={14} />
              Show All Owners
            </button>
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
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, 90vw);
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
    background: rgba(42, 127, 143, 0.08);
    border: 1px solid rgba(42, 127, 143, 0.2);
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
    background: var(--gem-teal, #2a7f8f);
    border-color: var(--gem-teal, #2a7f8f);
    color: #fff;
  }

  .step-tab.completed {
    background: rgba(42, 127, 143, 0.08);
    border-color: var(--gem-teal, #2a7f8f);
    color: var(--gem-teal, #2a7f8f);
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
      opacity 260ms cubic-bezier(0.4, 0, 0.2, 1) 40ms, /* slight delay for crossfade feel */
      transform 300ms cubic-bezier(0.16, 1, 0.3, 1) 40ms,
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
    background: var(--gem-teal, #2a7f8f);
    border: 1px solid var(--gem-teal, #2a7f8f);
    color: #fff;
  }

  .footer-btn.primary:hover:not(:disabled) {
    background: var(--gem-primary-blue, #153444);
    border-color: var(--gem-primary-blue, #153444);
  }

  .footer-btn.secondary {
    background: var(--color-bg-primary, #fff);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    color: var(--color-text-primary);
  }

  .footer-btn.secondary:hover:not(:disabled) {
    border-color: var(--gem-teal, #2a7f8f);
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
    border-color: var(--gem-teal, #2a7f8f);
    color: var(--gem-teal, #2a7f8f);
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
    align-items: center;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-body, 15px);
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
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
  }

  .status-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-3, 12px);
    flex-wrap: wrap;
  }

  .status-presets {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
  }

  .preset-btn {
    font-size: var(--font-size-sm, 13px);
    border: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm, 4px);
    padding: 2px var(--space-2, 8px);
    cursor: pointer;
    font-family: inherit;
  }

  .preset-btn:hover {
    border-color: var(--gem-teal, #2a7f8f);
    color: var(--color-text-primary);
  }

  .status-count {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
  }

  .status-warning {
    margin: var(--space-2, 8px) 0 0 0;
    font-size: var(--font-size-sm, 13px);
    color: #b45309;
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
    color: var(--gem-teal, #2a7f8f);
  }

  .refine-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px) 0 var(--space-2, 8px) var(--space-4, 16px);
    border-left: 2px solid var(--color-border, #e5e7eb);
    margin-top: var(--space-1, 4px);
  }

  .refine-option {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-sm, 13px);
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
