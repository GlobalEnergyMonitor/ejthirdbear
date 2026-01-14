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
  import { onMount } from 'svelte';
  import {
    fetchFieldStats,
    fetchRowCount,
    shorten,
    formatPercent,
    CATEGORIES_ORDERED,
    type FieldInfo,
  } from '$lib/factsheet';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';

  // Props
  let {
    tracker = 'Coal Mine' as string,
    fieldsMetadata = [] as FieldInfo[],
    title = 'Dataset Fields',
  } = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let rowCount = $state(0);
  let selectedField = $state<FieldInfo | null>(null);
  let fieldStats = $state<{ value: string | number | null; count: number }[]>([]);
  let statsLoading = $state(false);
  let expandedCategories = $state<Set<string>>(new Set());

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

  const nullPct = $derived(rowCount === 0 ? 0 : nullCount / rowCount);

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

    try {
      fieldStats = await fetchFieldStats(tracker, field.columnName);
    } catch (err) {
      console.error('Failed to load field stats:', err);
      fieldStats = [];
    } finally {
      statsLoading = false;
    }
  }

  onMount(async () => {
    loading = true;
    rowCount = await fetchRowCount(tracker);
    // Auto-select first field (Status)
    const statusField = fieldsMetadata.find((f) => f.columnName === 'Status' && !f.fieldValue);
    if (statusField) {
      await loadStats(statusField);
    }
    loading = false;
  });
</script>

<div class="factsheet">
  <div class="dataset-fields">
    <h3>{title}</h3>
    <LoadingWrapper
      {loading}
      {error}
      empty={fieldsMetadata.length === 0}
      loadingMessage="Loading fields..."
    >
      {#each CATEGORIES_ORDERED as category}
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
      <div class="field-definition">{selectedField.definition}</div>

      {#if statsLoading}
        <div class="loading-stats">Loading distribution...</div>
      {:else}
        {#if nullCount > 0}
          <div class="null-info">
            <span class="field-value">Null</span> in {nullCount} rows ({formatPercent(nullPct)})
          </div>
        {/if}

        <div class="unique-count">{uniqueCount} distinct values:</div>

        <div class="previewer-values-table">
          {#each fieldStats.filter((s) => s.value !== null && s.value !== '') as stat}
            <div class="value-row">
              <span class="field-value">{stat.value}</span>
              <span class="value-count">
                ({stat.count} rows; {formatPercent(stat.count / rowCount)})
              </span>
            </div>
          {/each}
        </div>

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
      <div class="placeholder">Click field-name bubbles to see details</div>
    {/if}
  </div>
</div>

<style>
  .factsheet {
    font-family: var(--gem-font, 'Plus Jakarta Sans', system-ui, sans-serif);
    display: flex;
    gap: 12px;
    background: var(--gem-white, #ffffff);
    border-radius: 0 14px 14px 14px;
    box-shadow: 0 8px 20px rgba(0, 36, 48, 0.08);
    overflow: hidden;
    border: 1px solid rgba(0, 74, 99, 0.1);
    margin-bottom: 1rem;
  }

  .factsheet h3 {
    color: var(--gem-navy);
    margin: 0 0 16px 0;
  }

  .dataset-fields {
    color: var(--gem-teal);
    max-width: 485px;
    min-width: 300px;
    max-height: 500px;
    overflow-y: auto;
    padding: 20px;
  }

  .dataset-previewer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--gem-navy);
    background-color: var(--gem-warm-white);
    border-left: 6px solid var(--gem-teal);
    padding: 20px;
    width: 400px;
    min-width: 300px;
    max-height: 500px;
    overflow-y: auto;
  }

  .dataset-previewer .previewer-values-table {
    margin-left: 12px;
  }

  .field-value {
    color: var(--gem-teal);
    font-weight: bold;
  }

  .dataset-fields h4,
  .dataset-previewer h4 {
    text-transform: uppercase;
    color: var(--gem-navy);
    margin-top: 20px;
    margin-bottom: 8px;
    font-size: 0.85rem;
  }

  .category-header {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    width: 100%;
    text-align: left;
  }

  .category-header h4::before {
    content: '+';
    color: #09d0d8;
    font-size: 1.2rem;
    margin-right: 5px;
  }

  .field-category-group.expanded .category-header h4::before {
    content: '-';
  }

  .category-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 8px;
  }

  .field-name {
    margin-bottom: 7px;
  }

  .field-bubble {
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    border: 1.6px solid var(--gem-mint);
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--gem-mint-bg);
    color: var(--gem-teal);
    cursor: pointer;
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
    vertical-align: top;
    transition: all 0.15s ease;
  }

  .field-bubble:hover {
    background: var(--gem-mint);
    color: var(--gem-midnight);
  }

  .field-bubble.active {
    background: var(--gem-teal);
    color: var(--gem-white);
    border-color: var(--gem-teal);
  }

  .field-category-group.expanded .field-bubble {
    white-space: initial;
    max-width: initial;
  }

  .field-name > span.definition {
    display: none;
  }

  .field-category-group.expanded .field-name > span.definition {
    display: block;
    margin-top: 2px;
    font-size: 0.8rem;
    color: var(--gem-navy);
  }

  .field-definition {
    font-size: 0.9rem;
    line-height: 1.4;
    color: var(--gem-midnight);
  }

  .null-info {
    font-size: 0.85rem;
    padding: 8px 12px;
    background: rgba(0, 74, 99, 0.05);
    border-radius: 4px;
  }

  .unique-count {
    font-size: 0.85rem;
    color: var(--gem-navy);
    margin-top: 8px;
  }

  .value-row {
    font-size: 0.85rem;
    padding: 4px 0;
    border-bottom: 1px solid rgba(0, 74, 99, 0.1);
  }

  .value-count {
    color: var(--gem-teal);
    font-size: 0.75rem;
  }

  .value-def-row {
    padding: 8px 0;
    border-bottom: 1px solid rgba(0, 74, 99, 0.1);
  }

  .value-definition {
    display: block;
    font-size: 0.8rem;
    color: var(--gem-midnight);
    margin-top: 4px;
  }

  .placeholder {
    color: var(--gem-teal);
    font-style: italic;
  }

  .loading-stats {
    color: var(--gem-teal);
    font-style: italic;
    padding: 20px;
  }
</style>
