<script lang="ts">
  /**
   * DatasetFactsheet Widget
   * Two-panel layout: field categories (left) + field detail previewer (right)
   * Converted from Observable notebook: https://observablehq.com/d/33281bfae09ac36e@280
   *
   * Performance optimizations:
   * - Cached queries with TTL
   * - Shared types and utilities
   */
  import {
    fetchFieldStats,
    fetchRowCount,
    shorten,
    formatPercent,
    type FieldInfo,
  } from '$lib/factsheet';
  import { readHashParam, writeHash } from '$lib/utils/hash-state';
  import {
    fetchFieldStats as fetchCatalogFieldStats,
    type FieldStats as CatalogFieldStats,
  } from '$lib/api/catalog-api';
  import FieldHistogram from '$lib/components/charts/FieldHistogram.svelte';
  import DataTypeIcon from '$lib/components/tracker/DataTypeIcon.svelte';
  import LoadingWrapper from '$lib/components/feedback/LoadingWrapper.svelte';

  // Props
  let {
    tracker = 'Coal Mine' as string,
    fieldsMetadata = [] as FieldInfo[],
    categoriesOrdered = [] as string[],
    catalogSlug = '' as string,
    title = 'Dataset Fields',
    initialField = '' as string,
    onFieldSelect = undefined as ((_name: string) => void) | undefined,
  } = $props();

  function linkifyDefinition(text: string): string {
    if (!text) return '';
    return text.replace(
      /(https?:\/\/[^\s"<>]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  // Use API-provided category order when available, fall back to order-of-appearance from fields
  const effectiveCategories = $derived(
    categoriesOrdered.length > 0
      ? categoriesOrdered
      : [...new Set(fieldsMetadata.filter((f) => !f.fieldValue).map((f) => f.category))]
  );

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let rowCount = $state(0);
  let selectedField = $state<FieldInfo | null>(null);
  let fieldStats = $state<{ value: string | number | null; count: number }[]>([]);
  let numericStats = $state<CatalogFieldStats | null>(null);
  let sampleValues = $state<string[]>([]);
  let catalogUniqueCount = $state<number | null>(null);
  let statsLoading = $state(false);

  const isNumericField = $derived((selectedField as any)?.dataType === 'numeric');
  let expandedCategories = $state<Set<string>>(new Set());
  let modalOpen = $state(false);

  // Derived: fields grouped by category (excluding value definitions)
  const fieldsByCategory = $derived.by(() => {
    const grouped: Record<string, FieldInfo[]> = {};
    for (const field of fieldsMetadata) {
      if (field.fieldValue) continue; // Skip value definitions
      const cat = field.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(field);
    }
    return grouped;
  });

  // Derived: value definitions for selected field
  const valueDefinitions = $derived.by(() => {
    if (!selectedField) return [];
    return fieldsMetadata.filter((f) => f.columnName === selectedField.columnName && f.fieldValue);
  });

  // Null stats derived from fieldStats
  const nullCount = $derived.by(() => {
    const nullRow = fieldStats.find((s) => s.value === null || s.value === '');
    return nullRow?.count || 0;
  });

  // Use sample total (sum of all stat counts) for accurate percentages
  const sampleTotal = $derived(fieldStats.reduce((sum, s) => sum + s.count, 0));
  const pctBase = $derived(sampleTotal > 0 ? sampleTotal : rowCount);

  const nullPct = $derived(pctBase === 0 ? 0 : nullCount / pctBase);

  const uniqueCount = $derived(fieldStats.filter((s) => s.value !== null && s.value !== '').length);

  // Get fields for a category
  function fieldsFromCategory(category: string): FieldInfo[] {
    return fieldsByCategory[category] || [];
  }

  // Toggle category expansion
  function toggleCategory(category: string) {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    expandedCategories = newExpanded;
  }

  // Load stats for a specific field (uses cached query)
  async function loadStats(field: FieldInfo) {
    selectedField = field;
    statsLoading = true;
    modalOpen = true;
    numericStats = null;
    fieldStats = [];
    sampleValues = [];
    catalogUniqueCount = null;

    onFieldSelect?.(field.columnName);
    writeHash({ field: field.columnName });

    const codeFriendlyName = (field as unknown as Record<string, unknown>).codeFriendlyName as string | undefined;
    const dataType = (field as unknown as Record<string, unknown>).dataType as string | undefined;
    if (import.meta.env.DEV) console.log('[DatasetFactsheet] loadStats', field.columnName, { codeFriendlyName, dataType, catalogSlug });

    try {
      // Try catalog API first (works for all field types when available)
      if (catalogSlug && codeFriendlyName) {
        const catalogStats = await fetchCatalogFieldStats(catalogSlug, codeFriendlyName);
        if (catalogStats) {
          if (dataType === 'numeric' && catalogStats.values?.length) {
            numericStats = catalogStats;
          } else if (catalogStats.value_counts?.length) {
            // Categorical: convert catalog value_counts to fieldStats format
            fieldStats = catalogStats.value_counts.map((v) => ({
              value: v.value,
              count: v.count,
            }));
            // Inject null_count so the null display logic picks it up
            if (catalogStats.null_count > 0) {
              fieldStats.push({ value: null, count: catalogStats.null_count });
            }
            rowCount = catalogStats.total_rows;
            catalogUniqueCount = catalogStats.unique_count;
          } else if (catalogStats.sample_values?.length) {
            // High-cardinality text: show sample values
            sampleValues = catalogStats.sample_values;
            catalogUniqueCount = catalogStats.unique_count;
            rowCount = catalogStats.total_rows;
            // Inject null_count for text fields too
            if (catalogStats.null_count > 0) {
              fieldStats = [{ value: null, count: catalogStats.null_count }];
            }
          }
          // If catalog returned something, we're done
          if (numericStats || fieldStats.length || sampleValues.length) {
            return;
          }
        }
      }

      // Fallback: client-side aggregation
      fieldStats = await fetchFieldStats(tracker, field.columnName);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load field stats:', err);
    } finally {
      statsLoading = false;
    }
  }

  function closeModal() {
    modalOpen = false;
  }

  // Auto-select initial field when fieldsMetadata arrives.
  // On first mount, fieldsMetadata may be empty (parent is still fetching),
  // so we watch for it to become populated rather than relying on onMount alone.
  let hasAutoSelected = false;

  async function initializeView() {
    loading = true;
    rowCount = await fetchRowCount(tracker);
    const hashField = readHashParam('field');
    const targetName = hashField || initialField || 'Status';
    const targetField = fieldsMetadata.find((f) => f.columnName === targetName && !f.fieldValue);
    // On mobile, don't auto-select — wait for user to tap a bubble
    if (targetField && window.innerWidth >= 768) {
      await loadStats(targetField);
    }
    loading = false;
  }

  /** Strip spurious ".0" from whole-number floats (e.g. year fields stored as 2020.0) */
  function formatStatValue(v: string | number | null): string {
    if (v == null) return '';
    const s = String(v);
    return /^\d+\.0$/.test(s) ? s.slice(0, -2) : s;
  }

  $effect(() => {
    // Subscribe to fieldsMetadata changes — client-only to avoid SSR fetch
    const fieldCount = fieldsMetadata.length;
    if (typeof window === 'undefined' || fieldCount === 0 || hasAutoSelected) return;
    hasAutoSelected = true;
    initializeView();
  });
</script>

<!-- Mobile modal overlay -->
{#if modalOpen && selectedField}
  <div
    class="mobile-modal-backdrop"
    onclick={closeModal}
    onkeydown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') closeModal(); }}
    role="button"
    tabindex="-1"
    aria-label="Close field detail"
  ></div>
  <div
    class="mobile-modal"
    role="dialog"
    aria-modal="true"
    aria-label="Field detail: {selectedField.columnName}"
  >
    <div class="mobile-modal-header">
      <h4>Field: {selectedField.columnName}</h4>
      <button type="button" class="modal-close" onclick={closeModal} aria-label="Close">✕</button>
    </div>
    <div class="mobile-modal-body">
      <div class="field-definition">{@html linkifyDefinition(selectedField.definition)}</div>

      {#if statsLoading}
        <div class="loading-stats">Loading distribution...</div>
      {:else if isNumericField && numericStats}
        <FieldHistogram
          values={numericStats.values}

          unit={(selectedField as any).unit ?? ''}
          nullCount={numericStats.null_count}
          totalRows={numericStats.total_rows}
        />
      {:else}
        {#if uniqueCount > 0 || (catalogUniqueCount != null && catalogUniqueCount > 0)}
          {#if nullCount > 0}
            <div class="null-info">
              <span class="field-value">Null</span> in {nullCount} rows ({formatPercent(nullPct)})
            </div>
          {/if}
          <div class="unique-count">{catalogUniqueCount ?? uniqueCount} distinct values:</div>
          {#if fieldStats.filter((s) => s.value !== null && s.value !== '').length > 0}
            <div class="previewer-values-table">
              {#each fieldStats.filter((s) => s.value !== null && s.value !== '') as stat}
                {@const barPct = pctBase > 0 ? (stat.count / pctBase) * 100 : 0}
                <div class="value-row">
                  <span class="field-value">{formatStatValue(stat.value)}</span>
                  <span class="value-bar-wrap">
                    <span class="value-bar" style="width: {barPct.toFixed(1)}%"></span>
                  </span>
                  <span class="value-count">
                    {stat.count}{pctBase > 0 ? ` (${formatPercent(stat.count / pctBase)})` : ''}
                  </span>
                </div>
              {/each}
            </div>
          {:else if sampleValues.length > 0}
            <div class="sample-values">
              <div class="sample-label">Sample values:</div>
              {#each sampleValues as sv}
                <span class="sample-value">{shorten(sv, 60)}</span>
              {/each}
            </div>
          {/if}
        {/if}

        {#if valueDefinitions.length > 0}
          <h4>{selectedField.columnName} definitions</h4>
          <div class="previewer-values-definitions">
            {#each valueDefinitions as vd}
              <div class="value-def-row">
                <span class="field-value">{vd.fieldValue}</span>
                <span class="value-definition">{vd.valueDefinition}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<div class="factsheet">
  <div class="dataset-fields">
    <h3>{title}</h3>
    <LoadingWrapper
      {loading}
      {error}
      empty={fieldsMetadata.length === 0}
      loadingMessage="Loading fields..."
    >
      {#each effectiveCategories as category}
        {#if fieldsFromCategory(category).length > 0}
          <div class="field-category-group" class:expanded={expandedCategories.has(category)}>
            <button type="button" class="category-header" onclick={() => toggleCategory(category)}>
              <h4 class="field-category">{category}</h4>
            </button>
            <div class="category-fields">
              {#each fieldsFromCategory(category) as field}
                <div class="field-name">
                  <button
                    type="button"
                    class="field-bubble"
                    class:active={selectedField?.columnName === field.columnName}
                    onclick={(e) => {
                      e.stopPropagation();
                      loadStats(field);
                    }}
                  >
                    <DataTypeIcon
                      dataType={(field as any).dataType ?? ''}
                      dataSubType={(field as any).dataSubType ?? ''}
                      size={9}
                    />
                    {shorten(field.columnName, 100)}
                  </button>
                  {#if expandedCategories.has(category)}
                    <span class="definition">{field.definition}</span>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </LoadingWrapper>
  </div>

  <div class="dataset-previewer">
    {#if selectedField}
      <h4>Field: {selectedField.columnName}</h4>
      <div class="field-definition">{@html linkifyDefinition(selectedField.definition)}</div>

      {#if statsLoading}
        <div class="loading-stats">Loading distribution...</div>
      {:else if isNumericField && numericStats}
        <!-- Numeric field: interactive histogram -->
        <FieldHistogram
          values={numericStats.values}

          unit={(selectedField as any).unit ?? ''}
          nullCount={numericStats.null_count}
          totalRows={numericStats.total_rows}
        />
      {:else}
        <!-- Categorical/text field: value count list -->
        {#if uniqueCount > 0 || (catalogUniqueCount != null && catalogUniqueCount > 0)}
          {#if nullCount > 0}
            <div class="null-info">
              <span class="field-value">Null</span> in {nullCount} rows ({formatPercent(nullPct)})
            </div>
          {/if}

          <div class="unique-count">{catalogUniqueCount ?? uniqueCount} distinct values:</div>

          {#if fieldStats.filter((s) => s.value !== null && s.value !== '').length > 0}
            <div class="previewer-values-table">
              {#each fieldStats.filter((s) => s.value !== null && s.value !== '') as stat}
                {@const barPct = pctBase > 0 ? (stat.count / pctBase) * 100 : 0}
                <div class="value-row">
                  <span class="field-value">{formatStatValue(stat.value)}</span>
                  <span class="value-bar-wrap">
                    <span class="value-bar" style="width: {barPct.toFixed(1)}%"></span>
                  </span>
                  <span class="value-count">
                    {stat.count}{pctBase > 0 ? ` (${formatPercent(stat.count / pctBase)})` : ''}
                  </span>
                </div>
              {/each}
            </div>
          {:else if sampleValues.length > 0}
            <div class="sample-values">
              <div class="sample-label">Sample values:</div>
              {#each sampleValues as sv}
                <span class="sample-value">{shorten(sv, 60)}</span>
              {/each}
            </div>
          {/if}
        {/if}

        {#if valueDefinitions.length > 0}
          <h4>{selectedField.columnName} definitions</h4>
          <div class="previewer-values-definitions">
            {#each valueDefinitions as vd}
              <div class="value-def-row">
                <span class="field-value">{vd.fieldValue}</span>
                <span class="value-definition">{vd.valueDefinition}</span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    {:else}
      <p class="placeholder">Click field-name bubbles to see details</p>
    {/if}
  </div>
</div>

<style>
  .factsheet {
    font-family: var(--font-family);
    display: flex;
    gap: var(--space-3);
    background: var(--color-bg-primary);
    border-radius: 0 var(--radius-card) var(--radius-card) var(--radius-card);
    box-shadow: var(--shadow-md, 0 8px 20px rgba(0, 36, 48, 0.08));
    overflow: hidden;
    border: 1px solid var(--color-border);
    margin-bottom: var(--space-4);
  }

  .factsheet h3 {
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4) 0;
  }

  .dataset-fields {
    color: var(--gem-teal);
    flex: 1;
    min-width: 0;
    max-height: 500px;
    overflow-y: auto;
    padding: var(--space-5);
  }

  .dataset-previewer {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    color: var(--color-text-primary);
    background-color: var(--color-bg-secondary);
    border-left: var(--space-1) solid var(--gem-teal);
    padding: var(--space-5);
    flex: 1;
    min-width: 0;
    max-height: 500px;
    overflow-y: auto;
  }

  .dataset-previewer .previewer-values-table {
    margin-left: 0;
  }

  .field-value {
    color: var(--gem-teal);
    font-weight: var(--font-weight-bold);
  }

  .dataset-fields h4,
  .dataset-previewer h4 {
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider);
    color: var(--color-text-primary);
    margin-top: var(--space-5);
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    width: 100%;
    text-align: left;
  }

  .category-header:focus-visible {
    outline: 2px solid var(--gem-teal);
    outline-offset: 2px;
    border-radius: var(--radius-sm, 4px);
  }

  .category-header h4::before {
    content: '+';
    color: var(--gem-teal);
    font-size: var(--font-size-md);
    margin-right: var(--space-1);
  }

  .field-category-group.expanded .category-header h4::before {
    content: '-';
  }

  .category-fields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .field-category-group.expanded .category-fields {
    flex-direction: column;
    flex-wrap: nowrap;
  }

  .field-name {
    margin-bottom: var(--space-2);
  }

  .field-bubble {
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-full);
    border: 1.6px solid var(--gem-mint);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    background: var(--gem-mint-10);
    color: var(--gem-teal);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    vertical-align: top;
    transition: all var(--transition-base, 0.15s ease);
  }

  .field-bubble:hover {
    background: var(--gem-mint);
    color: var(--color-text-primary);
  }

  .field-bubble.active {
    background: var(--gem-teal);
    color: var(--gem-white);
    border-color: var(--gem-teal);
  }


  .field-name > span.definition {
    display: none;
  }

  .field-category-group.expanded .field-name > span.definition {
    display: block;
    margin-top: var(--space-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .field-definition {
    font-size: var(--font-size-base);
    line-height: var(--line-height-normal);
    color: var(--color-text-primary);
  }

  .field-definition :global(a) {
    color: var(--gem-teal);
    word-break: break-all;
  }

  .null-info {
    font-size: var(--font-size-sm);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-md);
  }

  .unique-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--space-2);
  }

  .sample-values {
    margin-top: var(--space-2);
  }

  .sample-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--space-2);
  }

  .sample-value {
    display: inline-block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    background: var(--color-bg-secondary);
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    margin: 0 var(--space-1) var(--space-1) 0;
  }

  .value-row {
    display: grid;
    grid-template-columns: minmax(80px, 180px) 1fr auto;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--color-border);
  }
  .value-row .field-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .value-bar-wrap {
    height: 8px;
    background: var(--color-bg-secondary);
    border-radius: var(--radius-full);
    overflow: hidden;
  }

  .value-bar {
    display: block;
    height: 100%;
    background: var(--gem-teal);
    border-radius: var(--radius-full);
    min-width: 2px;
    transition: width 0.2s ease;
  }

  .value-count {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    text-align: right;
  }

  .value-def-row {
    padding: var(--space-2) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .value-definition {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  .placeholder {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .loading-stats {
    color: var(--color-text-tertiary);
    font-style: italic;
    padding: var(--space-5);
  }


  /* Mobile: hide right panel, show modal instead */
  @media (max-width: 768px) {
    .factsheet {
      flex-direction: column;
    }

    .dataset-fields {
      max-width: 100%;
      min-width: 0;
      max-height: none;
    }

    .dataset-previewer {
      display: none;
    }

    .field-bubble {
      min-height: 44px;
      padding: var(--space-2) var(--space-3);
      display: inline-flex;
      align-items: center;
    }

    .category-header {
      min-height: 44px;
      padding: var(--space-2) 0;
    }

    /* Modal */
    .mobile-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 100;
    }

    .mobile-modal {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 101;
      background: var(--color-bg-primary);
      border-top: var(--space-1) solid var(--gem-teal);
      border-radius: var(--radius-card) var(--radius-card) 0 0;
      max-height: 75vh;
      display: flex;
      flex-direction: column;
    }

    .mobile-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-4) var(--space-5) var(--space-3);
      border-bottom: 1px solid var(--color-border);
    }

    .mobile-modal-header h4 {
      margin: 0;
      font-size: var(--font-size-sm);
      text-transform: uppercase;
      letter-spacing: var(--tracking-wider);
      color: var(--color-text-primary);
    }

    .modal-close {
      background: none;
      border: none;
      font-size: var(--font-size-md);
      color: var(--gem-teal);
      cursor: pointer;
      padding: var(--space-2) var(--space-3);
      min-height: 44px;
      min-width: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
    }

    .mobile-modal-body {
      padding: var(--space-4) var(--space-5) var(--space-6);
      overflow-y: auto;
      overscroll-behavior: contain;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      color: var(--color-text-primary);
    }
  }

  /* Hide modal elements on desktop */
  @media (min-width: 768px) {
    .mobile-modal-backdrop,
    .mobile-modal {
      display: none;
    }
  }
</style>
