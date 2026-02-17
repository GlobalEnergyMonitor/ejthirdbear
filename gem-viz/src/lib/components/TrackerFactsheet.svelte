<script lang="ts">
  /**
   * TrackerFactsheet - Dataset Previewer Component
   * Based on Observable notebook: https://observablehq.com/d/33281bfae09ac36e
   *
   * Shows field metadata organized by category with visual distribution previews.
   * Detects field types (numeric, enum, text) and renders appropriate visualizations:
   * - Horizontal bar charts for categorical/enum distributions
   * - Range summaries with histogram-style bars for numeric fields
   * - Top-N with overflow count for high-cardinality fields
   */
  import { onMount } from 'svelte';
  import { formatNumber, formatCompact, formatPct } from '$lib/format-utils';
  import MiniHistogram from '$lib/components/MiniHistogram.svelte';

  // Props
  interface Props {
    tracker: string;
    trackerTitle?: string;
    trackerColor?: string;
    fieldsMetadata?: FieldInfo[];
    fetchDistribution?: (field: string) => Promise<FieldDistribution[]>;
  }

  let { tracker, trackerTitle, trackerColor, fieldsMetadata = [], fetchDistribution }: Props = $props();

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

  type FieldType = 'numeric' | 'enum' | 'text';

  // State
  let expandedCategories = $state<Set<string>>(new Set());
  let selectedField = $state<FieldInfo | null>(null);
  let fieldDistribution = $state<FieldDistribution[]>([]);
  let loadingDistribution = $state(false);
  let mobilePreviewOpen = $state(false);

  // Max items to show in distribution before "and N more"
  const MAX_VISIBLE_ITEMS = 15;

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

  // Quick field type guess from category/name alone (no distribution data needed)
  function guessFieldType(field: FieldInfo): FieldType {
    const cat = field.category?.toLowerCase() || '';
    const name = field.columnName.toLowerCase();
    if (cat === 'size' || cat === 'age') return 'numeric';
    if (name.includes('capacity') || name.includes('year') || name.includes('age') ||
        name.includes('mw') || name.includes('mtpa') || name.includes('ttpa') ||
        name.includes('co2') || name.includes('latitude') || name.includes('longitude')) {
      return 'numeric';
    }
    if (cat === 'main' || cat === 'details') return 'enum';
    if (cat === 'ids' || cat === 'names' || cat === 'reference' || cat === 'geography') return 'text';
    return 'text';
  }

  // Type icon characters
  const typeIcons: Record<FieldType, string> = { numeric: '#', enum: '\u2261', text: 'Aa' };

  // Detect field type from category, name, and distribution data
  function detectFieldType(field: FieldInfo, distribution: FieldDistribution[]): FieldType {
    const cat = field.category?.toLowerCase() || '';
    const name = field.columnName.toLowerCase();

    // Size/Age categories are numeric
    if (cat === 'size' || cat === 'age') return 'numeric';

    // Fields with known numeric patterns
    if (name.includes('capacity') || name.includes('year') || name.includes('age') ||
        name.includes('mw') || name.includes('mtpa') || name.includes('ttpa') ||
        name.includes('co2') || name.includes('latitude') || name.includes('longitude')) {
      return 'numeric';
    }

    // Check if distribution values are mostly numeric
    if (distribution.length > 0) {
      const numericCount = distribution.filter(d => !isNaN(Number(d.value)) && d.value.trim() !== '').length;
      if (numericCount > distribution.length * 0.7) return 'numeric';
    }

    // Fields with enum definitions are enum
    if (selectedFieldValueDefs.length > 0) return 'enum';

    // Main category often has enums (Status, etc.)
    if (cat === 'main' || cat === 'details') return 'enum';

    return 'text';
  }

  // Compute numeric stats from distribution
  function computeNumericStats(distribution: FieldDistribution[]): {
    min: number; max: number; mean: number; total: number; numericValues: number[];
  } | null {
    const numericValues: number[] = [];
    let weightedSum = 0;
    let totalCount = 0;

    for (const d of distribution) {
      const n = Number(d.value);
      if (!isNaN(n)) {
        numericValues.push(n);
        weightedSum += n * d.count;
        totalCount += d.count;
      }
    }

    if (numericValues.length === 0) return null;

    numericValues.sort((a, b) => a - b);
    return {
      min: numericValues[0],
      max: numericValues[numericValues.length - 1],
      mean: totalCount > 0 ? weightedSum / totalCount : 0,
      total: totalCount,
      numericValues,
    };
  }

  // Derived: detected field type
  const detectedType = $derived(
    selectedField ? detectFieldType(selectedField, fieldDistribution) : 'text' as FieldType
  );

  // Derived: numeric stats (only computed for numeric fields)
  const numericStats = $derived(
    detectedType === 'numeric' ? computeNumericStats(fieldDistribution) : null
  );

  // Derived: total row count from distribution
  const totalRows = $derived(
    fieldDistribution.reduce((sum, d) => sum + d.count, 0)
  );

  // Derived: max count for bar scaling
  const maxCount = $derived(
    Math.max(...fieldDistribution.map(d => d.count), 1)
  );

  // Derived: expand aggregated distribution back into raw values for histogram
  const histogramData = $derived.by(() => {
    if (detectedType !== 'numeric' || !numericStats) return [];
    const values: number[] = [];
    for (const d of fieldDistribution) {
      const n = Number(d.value);
      if (!isNaN(n)) {
        for (let i = 0; i < d.count; i++) values.push(n);
      }
    }
    return values;
  });

  // Extract unit from field name for histogram label
  function inferUnit(fieldName: string): string {
    if (fieldName.includes('(MW)')) return 'MW';
    if (fieldName.includes('(Mtpa)')) return 'Mtpa';
    if (fieldName.includes('(ttpa)') || fieldName.includes('ttpa')) return 'ttpa';
    if (fieldName.includes('Bcm/y')) return 'Bcm/y';
    if (fieldName.toLowerCase().includes('year')) return '';
    return '';
  }

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
    mobilePreviewOpen = true;

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
            {@const fieldType = guessFieldType(field)}
            <div class="field-name">
              <button
                type="button"
                class:selected={selectedField?.columnName === field.columnName}
                class:type-numeric={fieldType === 'numeric'}
                class:type-enum={fieldType === 'enum'}
                class:type-text={fieldType === 'text'}
                onclick={(e) => {
                  e.stopPropagation();
                  selectField(field);
                }}
              >
                <span class="field-type-icon">{typeIcons[fieldType]}</span>
                {shorten(field.columnName, 100)}
              </button>
              <span class="definition">{field.definition}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div class="dataset-previewer" class:mobile-open={mobilePreviewOpen} style:--bar-color={trackerColor || 'var(--teal)'}>
    <button class="mobile-preview-toggle" onclick={() => mobilePreviewOpen = !mobilePreviewOpen}>
      {#if selectedField}
        {mobilePreviewOpen ? 'Hide' : 'Show'} preview: {selectedField.columnName}
      {:else}
        Field preview
      {/if}
      <span class="toggle-chevron" class:open={mobilePreviewOpen}>&#9662;</span>
    </button>
    {#if selectedField}
      <h4 class="preview-heading">Field: {selectedField.columnName}</h4>
      <div class="field-definition">{selectedField.definition}</div>

      {#if loadingDistribution}
        <div class="loading">Loading distribution...</div>
      {:else if fieldDistribution.length > 0}
        <!-- Summary stats row -->
        <div class="dist-summary">
          <span class="dist-stat">{formatCompact(totalRows)} rows</span>
          <span class="dist-stat">{fieldDistribution.length} distinct</span>
          {#if detectedType === 'numeric' && numericStats}
            <span class="dist-stat type-badge numeric"><span class="type-icon">{typeIcons.numeric}</span> Numeric</span>
          {:else if detectedType === 'enum'}
            <span class="dist-stat type-badge enum"><span class="type-icon">{typeIcons.enum}</span> Enum</span>
          {:else}
            <span class="dist-stat type-badge text"><span class="type-icon">{typeIcons.text}</span> Text</span>
          {/if}
        </div>

        <!-- Numeric range summary + histogram -->
        {#if detectedType === 'numeric' && numericStats}
          {@const range = numericStats.max - numericStats.min || 1}
          {@const meanPct = ((numericStats.mean - numericStats.min) / range) * 100}

          {#if histogramData.length > 0}
            <div class="histogram-container">
              <MiniHistogram
                data={histogramData}
                bins={Math.min(20, Math.max(8, Math.ceil(Math.sqrt(histogramData.length))))}
                width={300}
                height={80}
                color={trackerColor || 'var(--teal)'}
                unit={selectedField ? inferUnit(selectedField.columnName) : ''}
                showAxis={true}
              />
            </div>
          {/if}

          <div class="numeric-range">
            <div class="range-labels">
              <span>{formatCompact(numericStats.min)}</span>
              <span class="range-mean">avg {formatCompact(Math.round(numericStats.mean))}</span>
              <span>{formatCompact(numericStats.max)}</span>
            </div>
            <div class="range-track">
              <div class="range-fill"></div>
              <div class="range-mean-tick" style="left:{meanPct}%"></div>
            </div>
          </div>
        {/if}

        <!-- Distribution bars (hidden for numeric fields with histogram) -->
        {#if !(detectedType === 'numeric' && histogramData.length > 0)}
          <div class="dist-bars">
            {#each fieldDistribution.slice(0, MAX_VISIBLE_ITEMS) as item}
              {@const barWidth = (item.count / maxCount) * 100}
              <div class="dist-row">
                <span class="dist-label" title={item.value}>{shorten(item.value, 24)}</span>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width:{barWidth}%"></div>
                </div>
                <span class="dist-count">{formatCompact(item.count)}</span>
                <span class="dist-pct">{formatPct(item.percentage)}</span>
              </div>
            {/each}
            {#if fieldDistribution.length > MAX_VISIBLE_ITEMS}
              <div class="dist-overflow">
                and {fieldDistribution.length - MAX_VISIBLE_ITEMS} more values
              </div>
            {/if}
          </div>
        {/if}
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
    flex: 1;
    min-width: 340px;
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

  div.dataset-fields div.field-name > button {
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    border: 1.6px solid var(--mint);
    font-size: 0.85rem;
    font-weight: 600;
    font-family: inherit;
    line-height: inherit;
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

  div.dataset-fields div.field-name > button:hover {
    background: var(--mint);
    color: var(--navy);
  }

  div.dataset-fields div.field-name > button.selected {
    background: var(--teal);
    color: var(--white);
    border-color: var(--teal);
  }

  .category-section.expanded div.field-name > button {
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

  /* Field type icon in pills */
  .field-type-icon {
    font-size: 0.65rem;
    font-weight: 700;
    opacity: 0.5;
    margin-right: 2px;
    font-family: 'Roboto Condensed', monospace;
  }

  /* Type-colored pill borders */
  div.dataset-fields div.field-name > button.type-numeric {
    border-color: rgba(1, 107, 131, 0.4);
  }
  div.dataset-fields div.field-name > button.type-enum {
    border-color: rgba(157, 247, 229, 0.8);
  }
  div.dataset-fields div.field-name > button.type-text {
    border-color: rgba(0, 74, 99, 0.15);
  }

  /* Override selected state (always teal) */
  div.dataset-fields div.field-name > button.selected.type-numeric,
  div.dataset-fields div.field-name > button.selected.type-enum,
  div.dataset-fields div.field-name > button.selected.type-text {
    border-color: var(--teal);
  }

  .field-definition {
    font-size: 0.95rem;
    line-height: 1.5;
  }

  /* Summary stats row */
  .dist-summary {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .dist-stat {
    font-size: 0.75rem;
    color: var(--navy);
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .type-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 600;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 1;
  }

  .type-badge.numeric {
    background: rgba(1, 107, 131, 0.12);
    color: var(--teal);
  }

  .type-badge.enum {
    background: rgba(157, 247, 229, 0.3);
    color: var(--navy);
  }

  .type-badge.text {
    background: rgba(0, 74, 99, 0.08);
    color: var(--navy);
  }

  .type-icon {
    font-family: 'Roboto Condensed', monospace;
    font-weight: 700;
    margin-right: 2px;
  }

  /* Histogram container */
  .histogram-container {
    margin: 8px 0;
    padding: 4px 0;
  }

  .histogram-container :global(.mini-histogram) {
    width: 100% !important;
  }

  .histogram-container :global(svg) {
    width: 100%;
  }

  /* Numeric range display */
  .numeric-range {
    margin: 8px 0 4px;
  }

  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    color: var(--navy);
    font-variant-numeric: tabular-nums;
    margin-bottom: 3px;
  }

  .range-mean {
    opacity: 0.6;
    font-style: italic;
  }

  .range-track {
    position: relative;
    height: 6px;
    background: rgba(0, 74, 99, 0.1);
    border-radius: 3px;
    overflow: visible;
  }

  .range-fill {
    height: 100%;
    width: 100%;
    background: linear-gradient(90deg, var(--bar-color, var(--teal)) 0%, rgba(1, 107, 131, 0.2) 100%);
    border-radius: 3px;
    opacity: 0.4;
  }

  .range-mean-tick {
    position: absolute;
    top: -2px;
    width: 2px;
    height: 10px;
    background: var(--orange);
    border-radius: 1px;
    transform: translateX(-1px);
  }

  /* Distribution bar chart */
  .dist-bars {
    display: flex;
    flex-direction: column;
    gap: 3px;
    margin-top: 6px;
  }

  .dist-row {
    display: grid;
    grid-template-columns: 100px 1fr 42px 38px;
    gap: 6px;
    align-items: center;
    font-size: 0.75rem;
    line-height: 1;
  }

  .dist-label {
    color: var(--navy);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 0.72rem;
  }

  .dist-bar-track {
    height: 14px;
    background: rgba(0, 74, 99, 0.06);
    border-radius: 2px;
    overflow: hidden;
  }

  .dist-bar-fill {
    height: 100%;
    background: var(--bar-color, var(--teal));
    border-radius: 2px;
    opacity: 0.55;
    transition: width 0.3s ease;
  }

  .dist-count {
    text-align: right;
    color: var(--navy);
    font-variant-numeric: tabular-nums;
    font-size: 0.68rem;
    opacity: 0.7;
  }

  .dist-pct {
    text-align: right;
    color: var(--teal);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 0.68rem;
  }

  .dist-overflow {
    font-size: 0.72rem;
    color: var(--navy);
    opacity: 0.5;
    font-style: italic;
    padding-top: 4px;
    text-align: center;
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

  /* Mobile preview toggle - hidden on desktop */
  .mobile-preview-toggle {
    display: none;
  }

  /* =============================================
     RESPONSIVE: Mobile layout
     ============================================= */
  @media (max-width: 768px) {
    div.factsheet {
      flex-direction: column;
      border-radius: 8px;
    }

    div.dataset-fields {
      max-width: none;
      max-height: none;
      padding: 16px;
    }

    div.dataset-previewer {
      min-width: 0;
      max-height: none;
      border-left: none;
      border-top: 6px solid var(--teal);
      padding: 0;
      overflow: hidden;
    }

    /* Mobile toggle button */
    .mobile-preview-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      padding: 12px 16px;
      background: var(--warmWhite);
      border: none;
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--teal);
      cursor: pointer;
      text-align: left;
    }

    .toggle-chevron {
      transition: transform 0.2s ease;
      font-size: 0.75rem;
    }

    .toggle-chevron.open {
      transform: rotate(180deg);
    }

    /* Hide preview content on mobile unless open */
    div.dataset-previewer .preview-heading,
    div.dataset-previewer .field-definition,
    div.dataset-previewer .dist-summary,
    div.dataset-previewer .numeric-range,
    div.dataset-previewer .histogram-container,
    div.dataset-previewer .dist-bars,
    div.dataset-previewer .loading,
    div.dataset-previewer .no-enum,
    div.dataset-previewer .previewer-values-definitions,
    div.dataset-previewer h4:not(.preview-heading) {
      display: none;
    }

    div.dataset-previewer.mobile-open .preview-heading,
    div.dataset-previewer.mobile-open .field-definition,
    div.dataset-previewer.mobile-open .dist-summary,
    div.dataset-previewer.mobile-open .numeric-range,
    div.dataset-previewer.mobile-open .histogram-container,
    div.dataset-previewer.mobile-open .dist-bars,
    div.dataset-previewer.mobile-open .loading,
    div.dataset-previewer.mobile-open .no-enum,
    div.dataset-previewer.mobile-open .previewer-values-definitions,
    div.dataset-previewer.mobile-open h4:not(.preview-heading) {
      display: revert;
    }

    div.dataset-previewer.mobile-open {
      padding: 0 16px 16px;
    }

    /* Tighter distribution grid on mobile */
    .dist-row {
      grid-template-columns: 80px 1fr 36px 34px;
      gap: 4px;
      font-size: 0.7rem;
    }

    .dist-label {
      font-size: 0.68rem;
    }

    /* Field pills wrap more tightly */
    div.dataset-fields div.field-name > button {
      max-width: 140px;
      font-size: 0.78rem;
      padding: 0.2rem 0.45rem;
    }
  }

  /* Extra small screens */
  @media (max-width: 400px) {
    .dist-row {
      grid-template-columns: 60px 1fr 32px;
    }

    .dist-pct {
      display: none;
    }
  }
</style>
