<script lang="ts">
  /**
   * AssetClassExpansion — inline expansion panel for a selected asset class.
   * Shows sub-class checkboxes, geo/status filters, multi-tracker banner,
   * and continue buttons.
   */
  import { slide } from 'svelte/transition';
  import { STATUS_VALUES, COUNTRIES } from '$lib/data-config/tracker-schema';
  import type { AssetClass } from '$lib/data-config/asset-class-definitions';

  interface Props {
    assetClass: AssetClass;
    checkedSubClasses: Record<string, boolean>;
    geoFilter: string;
    statusFilter: string;
    onShowAllOwners: () => void;
    onSearchSpecificOwners: () => void;
  }

  let {
    assetClass,
    checkedSubClasses = $bindable(),
    geoFilter = $bindable(),
    statusFilter = $bindable(),
    onShowAllOwners,
    onSearchSpecificOwners,
  }: Props = $props();

  const hasSubClasses = $derived(!!assetClass.subClasses?.length);
  const isMultiTracker = $derived(assetClass.trackers.length > 1);
  const checkedCount = $derived(Object.values(checkedSubClasses).filter(Boolean).length);
  const totalSubClasses = $derived(assetClass.subClasses?.length ?? 0);
  const subClassesNarrowed = $derived(hasSubClasses && checkedCount > 0 && checkedCount < totalSubClasses);

  /** Filter preview tags — only non-default values */
  const previewTags = $derived.by(() => {
    const tags: { label: string; color: string }[] = [];
    if (statusFilter || geoFilter || subClassesNarrowed) {
      tags.push({ label: assetClass.label, color: 'var(--gem-teal, #2a7f8f)' });
    }
    if (statusFilter) tags.push({ label: statusFilter, color: 'var(--color-accent, #e67e22)' });
    if (geoFilter) tags.push({ label: geoFilter, color: '#6b7280' });
    if (subClassesNarrowed) tags.push({ label: `${checkedCount}/${totalSubClasses} sub-classes`, color: 'var(--color-gray-400, #9ca3af)' });
    return tags;
  });
</script>

<div class="expansion-panel" transition:slide={{ duration: 200 }}>
  <div class="expansion-header">
    <h4 class="expansion-title">{assetClass.label}</h4>
    <p class="expansion-description">{assetClass.description}</p>
  </div>

  {#if isMultiTracker}
    <div class="multi-tracker-note">
      Spans {assetClass.trackers.length} trackers ({assetClass.trackers.join(', ')}).
      Current query uses <strong>{assetClass.trackers[0]}</strong> only.
    </div>
  {/if}

  {#if hasSubClasses}
    <div class="subclass-section">
      <span class="subclass-heading">
        Narrow by sub-class
        {#if totalSubClasses > 0}
          <span class="subclass-count">({checkedCount}/{totalSubClasses} selected)</span>
        {/if}
      </span>
      <div class="subclass-checkboxes">
        {#each assetClass.subClasses ?? [] as sc (sc.id)}
          <label class="subclass-option">
            <input
              type="checkbox"
              bind:checked={checkedSubClasses[sc.id]}
            />
            <span class="subclass-label">{sc.label}</span>
            {#if sc.description}
              <span class="subclass-desc">{sc.description}</span>
            {/if}
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <div class="filter-row">
    {#if assetClass.availableFilters.geography}
      <label class="inline-filter">
        <span class="inline-filter-label">Geography</span>
        <select bind:value={geoFilter}>
          <option value="">All countries</option>
          {#each COUNTRIES as country}
            <option value={country}>{country}</option>
          {/each}
        </select>
      </label>
    {/if}
    {#if assetClass.availableFilters.status}
      <label class="inline-filter">
        <span class="inline-filter-label">Status</span>
        <select bind:value={statusFilter}>
          <option value="">All statuses</option>
          {#each STATUS_VALUES as status}
            <option value={status}>{status}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if previewTags.length > 0}
    <div class="filter-preview">
      {#each previewTags as tag}
        <span class="filter-preview-tag" style:border-color={tag.color} style:color={tag.color}>{tag.label}</span>
      {/each}
    </div>
  {/if}

  <div class="step-divider">Step 2: Choose how to find owners</div>

  <div class="continue-options">
    <button class="continue-btn primary" onclick={onShowAllOwners}>
      <span class="btn-icon">→</span>
      Show All Owners
      <span class="btn-sublabel">See every company with stakes</span>
    </button>
    <button class="continue-btn secondary" onclick={onSearchSpecificOwners}>
      <span class="btn-icon">⌕</span>
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
    margin-bottom: var(--space-4);
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
    margin-bottom: var(--space-4);
  }

  .subclass-section {
    margin-bottom: var(--space-5);
  }

  .subclass-heading {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  .subclass-count {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .subclass-checkboxes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .subclass-option {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    gap: 0 var(--space-2);
    align-items: baseline;
    cursor: pointer;
    padding: var(--space-1) 0;
  }

  .subclass-option input[type='checkbox'] {
    grid-row: 1;
    margin-top: 2px;
  }

  .subclass-label {
    grid-row: 1;
    grid-column: 2;
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .subclass-desc {
    grid-row: 2;
    grid-column: 2;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    line-height: var(--line-height-normal, 1.5);
  }

  .filter-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
  }

  .inline-filter {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .inline-filter-label {
    font-size: var(--font-size-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
  }

  .inline-filter select {
    padding: var(--space-2);
    font-size: var(--font-size-body);
    border: none;
    border-bottom: var(--border-width, 1px) solid var(--color-gray-300, #d1d5db);
    border-radius: 0;
    background: transparent;
    color: var(--color-text-primary);
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath fill='%23999' d='M0 0l4 4 4-4z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-1, 4px) center;
    padding-right: var(--space-5, 20px);
    cursor: pointer;
  }

  .inline-filter select:focus {
    outline: none;
    border-bottom-color: var(--gem-teal, #2a7f8f);
  }

  .filter-preview {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }

  .filter-preview-tag {
    padding: 2px 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    border-radius: 999px;
    background: white;
    border: 1px solid;
  }

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
    max-width: 500px;
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
    .filter-row {
      grid-template-columns: 1fr;
    }

    .continue-options {
      grid-template-columns: 1fr;
      max-width: 100%;
    }
  }
</style>
