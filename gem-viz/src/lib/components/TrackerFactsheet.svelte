<script lang="ts">
  /**
   * TrackerFactsheet - Dataset Previewer Component
   * Based on Observable notebook: https://observablehq.com/d/33281bfae09ac36e
   *
   * Shows field metadata organized by category with value distributions.
   */
  import { onMount } from 'svelte';

  // Props
  interface Props {
    tracker: string;
    trackerTitle?: string;
    fieldsMetadata?: FieldInfo[];
    fetchDistribution?: (field: string) => Promise<FieldDistribution[]>;
  }

  let { tracker, trackerTitle, fieldsMetadata = [], fetchDistribution }: Props = $props();

  // Types
  interface FieldInfo {
    columnName: string;
    category: string;
    definition: string;
    fieldValue?: string | null;
    valueDefinition?: string | null;
    ownRow?: number;
  }

  interface FieldDistribution {
    value: string;
    count: number;
    percentage: number;
  }

  // State
  let expandedCategories = $state<Set<string>>(new Set());
  let selectedField = $state<FieldInfo | null>(null);
  let fieldDistribution = $state<FieldDistribution[]>([]);
  let loadingDistribution = $state(false);

  // Derived - organize fields by category
  const categories = $derived(() => {
    const cats = new Map<string, FieldInfo[]>();
    for (const field of fieldsMetadata.filter((f) => !f.fieldValue)) {
      const cat = field.category || 'Other';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(field);
    }
    return cats;
  });

  // Category order (matches Observable notebook)
  const categoryOrder = [
    'IDs',
    'Names',
    'Geography',
    'Main',
    'Size',
    'Age',
    'Details',
    'Reference',
    'Ownership',
    'End users',
    'Methane',
    'Other',
  ];

  const orderedCategories = $derived(() => {
    const cats = categories();
    return categoryOrder.filter((c) => cats.has(c));
  });

  // Get value definitions for selected field (reactive)
  const selectedFieldValueDefs = $derived.by(() => {
    if (!selectedField) return [];
    const defs: Array<{ value: string; definition: string }> = [];
    for (const f of fieldsMetadata) {
      if (f.columnName === selectedField.columnName && f.fieldValue) {
        defs.push({
          value: f.fieldValue,
          definition: f.valueDefinition || f.definition || ''
        });
      }
    }
    return defs;
  });

  // Toggle category expansion
  function toggleCategory(cat: string) {
    const newSet = new Set(expandedCategories);
    if (newSet.has(cat)) {
      newSet.delete(cat);
    } else {
      newSet.add(cat);
    }
    expandedCategories = newSet;
  }

  // Select a field and load its distribution
  async function selectField(field: FieldInfo) {
    selectedField = field;
    fieldDistribution = [];

    if (fetchDistribution) {
      loadingDistribution = true;
      try {
        fieldDistribution = await fetchDistribution(field.columnName);
      } catch (err) {
        console.error('Failed to fetch distribution:', err);
      } finally {
        loadingDistribution = false;
      }
    }
  }

  // Shorten text with ellipsis
  function shorten(str: string, n: number): string {
    if (str.length < n + 3) return str;
    return str.slice(0, n) + '...';
  }

  // Format number
  function formatNumber(n: number): string {
    return n.toLocaleString();
  }

  // Format percentage
  function formatPct(n: number): string {
    return `${n.toFixed(1)}%`;
  }

  // Select first field on mount
  onMount(() => {
    // Find "Status" field or first field
    const statusField = fieldsMetadata.find(
      (f) => f.columnName === 'Status' && !f.fieldValue
    );
    const firstField = fieldsMetadata.find((f) => !f.fieldValue);
    if (statusField) {
      selectField(statusField);
    } else if (firstField) {
      selectField(firstField);
    }
  });
</script>

<div class="factsheet">
  <div class="dataset-fields">
    <h3>{trackerTitle || tracker} Fields</h3>

    {#each orderedCategories() as category}
      {@const fields = categories().get(category) || []}
      <div class="category-section" class:expanded={expandedCategories.has(category)}>
        <button class="field-category" onclick={() => toggleCategory(category)}>
          {category}
        </button>
        <div class="category-fields">
          {#each fields as field}
            <div class="field-name">
              <a
                href="#"
                class:selected={selectedField?.columnName === field.columnName}
                onclick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectField(field);
                }}
              >
                {shorten(field.columnName, 100)}
              </a>
              <span class="definition">{field.definition}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="dataset-previewer">
    {#if selectedField}
      <h4>Field: {selectedField.columnName}</h4>
      <div class="field-definition">{selectedField.definition}</div>

      {#if loadingDistribution}
        <div class="loading">Loading distribution...</div>
      {:else if fieldDistribution.length > 0}
        <div class="distribution-header">{fieldDistribution.length} distinct values:</div>
        <div class="previewer-values-table">
          {#each fieldDistribution as item}
            <div><span class="field-value">{item.value}</span> ({formatNumber(item.count)} rows; {formatPct(item.percentage)})</div>
          {/each}
        </div>
      {/if}

      {#if selectedFieldValueDefs.length > 0}
        <h4>{selectedField.columnName} definitions</h4>
        <div class="previewer-values-definitions">
          {#each selectedFieldValueDefs as { value, definition }}
            <div><span class="field-value">{value}</span> {definition}</div>
          {/each}
        </div>
      {:else if !loadingDistribution && fieldDistribution.length === 0}
        <div class="no-enum">No enumerated values for this field.</div>
      {/if}
    {:else}
      <div>click field-name bubbles to see details</div>
    {/if}
  </div>
</div>

<style>
  div.factsheet {
    --navy: #004a63;
    --mint: #9df7e5;
    --mintBackground: #9df7e520;
    --orange: #fe4f2d;
    --teal: #016b83;
    --tealBackground: #016b83cc;
    --midnight: #002430;
    --warmWhite: #f2f2eb;
    --white: #ffffff;
    --deepRed: #7f142a;

    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    display: flex;
    gap: 12px;
    background: var(--white);
    border-radius: 0 14px 14px 14px;
    box-shadow: 0 8px 20px rgba(0, 36, 48, 0.08);
    overflow: hidden;
    border: 1px solid rgba(0, 74, 99, 0.1);
    margin-bottom: 1rem;
  }

  div.factsheet h3 {
    color: var(--navy);
    margin: 0 0 1rem 0;
  }

  div.dataset-fields {
    color: var(--teal);
    max-width: 485px;
    max-height: 500px;
    overflow-y: auto;
    padding: 20px;
  }

  div.dataset-previewer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--navy);
    background-color: var(--warmWhite);
    border-left: 6px solid var(--teal);
    padding: 20px;
    width: 400px;
    max-height: 500px;
    overflow-y: auto;
  }

  div.dataset-previewer h4 {
    text-transform: uppercase;
    color: var(--navy);
    margin-top: 20px;
    margin-bottom: 8px;
    font-size: 0.9rem;
  }

  div.dataset-previewer h4:first-child {
    margin-top: 0;
  }

  .category-section button.field-category {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    user-select: none;
    text-transform: uppercase;
    color: var(--navy);
    margin-top: 20px;
    margin-bottom: 8px;
    font-size: 0.9rem;
    font-weight: bold;
    font-family: inherit;
  }

  .category-section button.field-category::before {
    content: '+';
    color: #09d0d8;
    font-size: 1.2rem;
    margin-right: 8px;
  }

  .category-section.expanded button.field-category::before {
    content: '-';
  }

  div.category-fields {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  div.field-name {
    margin-bottom: 7px;
  }

  div.dataset-fields div.field-name > a {
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    border: 1.6px solid var(--mint);
    font-size: 0.85rem;
    font-weight: 600;
    background: var(--mintBackground);
    color: var(--teal);
    display: inline-block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
    vertical-align: top;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.15s;
  }

  div.dataset-fields div.field-name > a:hover {
    background: var(--mint);
    color: var(--navy);
  }

  div.dataset-fields div.field-name > a.selected {
    background: var(--teal);
    color: var(--white);
    border-color: var(--teal);
  }

  .category-section.expanded div.field-name > a {
    white-space: initial;
    max-width: initial;
  }

  div.dataset-fields div.field-name > span.definition {
    display: none;
  }

  .category-section.expanded div.field-name > span.definition {
    display: block;
    margin-top: 2px;
    font-size: 0.85rem;
    color: var(--navy);
    opacity: 0.8;
  }

  .field-definition {
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .distribution-header {
    font-weight: 600;
    margin-top: 8px;
  }

  div.previewer-values-table {
    margin-left: 12px;
  }

  div.previewer-values-table > div {
    margin: 4px 0;
  }

  span.field-value {
    color: var(--teal);
    font-weight: bold;
  }

  div.previewer-values-definitions {
    margin-left: 12px;
  }

  div.previewer-values-definitions > div {
    margin: 8px 0;
  }

  .loading,
  .no-enum {
    color: var(--navy);
    opacity: 0.6;
    font-style: italic;
  }
</style>
