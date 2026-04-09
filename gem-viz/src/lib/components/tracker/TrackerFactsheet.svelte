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
  import { formatCompact, formatRatioAsPct } from '$lib/utils/format';
  import { colors } from '$lib/design-tokens';
  import FieldHistogram from '$lib/components/charts/FieldHistogram.svelte';

  // Props
  interface Props {
    tracker: string;
    trackerTitle?: string;
    trackerColor?: string;
    fieldsMetadata?: FieldInfo[];
    fetchDistribution?: (_field: string, _codeFriendlyName?: string) => Promise<FieldStatsResult>;
  }

  let {
    tracker,
    trackerTitle,
    trackerColor,
    fieldsMetadata = [],
    fetchDistribution,
  }: Props = $props();

  // Types
  interface FieldInfo {
    columnName: string;
    category: string;
    definition: string;
    dataType?: string;
    dataSubType?: string;
    unit?: string;
    codeFriendlyName?: string;
    histogramWeight?: number;
    fieldValue?: string | null;
    valueDefinition?: string | null;
    ownRow?: number;
  }

  interface FieldDistribution {
    value: string;
    count: number;
    percentage: number;
  }

  /** Full stats result from the API — replaces the old array-only return */
  interface FieldStatsResult {
    distribution: FieldDistribution[];
    totalRows: number;
    nullCount: number;
    nonNullCount: number;
    uniqueCount: number;
    dataType?: string;
    dataSubType?: string;
    unit?: string;
    sampleValues?: string[];
    /** Pre-sorted numeric values for histogram (only for numeric fields) */
    values?: number[];
  }

  type FieldType = 'numeric' | 'enum' | 'text';

  // State
  let expandedCategories = $state<Set<string>>(new Set());
  let selectedField = $state<FieldInfo | null>(null);
  let fieldStats = $state<FieldStatsResult | null>(null);
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
          definition: f.valueDefinition || f.definition || '',
        });
      }
    }
    return defs;
  });

  // Resolve field type from API metadata (data_type + data_sub_type)
  // Falls back to heuristic only when metadata is missing
  function resolveFieldType(field: FieldInfo, stats: FieldStatsResult | null): FieldType {
    // Prefer API data_type from stats response, then from field metadata
    const dt = stats?.dataType || field.dataType;
    const dst = stats?.dataSubType || field.dataSubType;
    if (dt === 'numeric') return 'numeric';
    if (dt === 'text' && (dst === 'categorical' || dst === 'ordinal' || dst === 'accuracy'))
      return 'enum';
    if (dt === 'boolean') return 'enum';
    // datetime/year with value_counts → show as enum bars
    if (dt === 'datetime' && stats?.distribution && stats.distribution.length > 0) return 'enum';
    if (dt === 'datetime') return 'text';
    if (dt === 'text') return 'text';
    // Fallback heuristic when API metadata is absent
    const cat = field.category?.toLowerCase() || '';
    if (cat === 'size' || cat === 'age') return 'numeric';
    if (cat === 'main' || cat === 'details') return 'enum';
    return 'text';
  }

  // Type icon characters (used in preview badge)
  const typeLabels: Record<FieldType, string> = { numeric: '#', enum: '\u2261', text: 'Aa' };

  // Type colors for dot indicators — from design-tokens
  const typeColors: Record<FieldType, string> = {
    numeric: colors.midnightGreen,
    enum: colors.orange,
    text: colors.navy,
  };

  // Convenience: shorthand for distribution array
  const fieldDistribution = $derived(fieldStats?.distribution ?? []);

  // Derived: field type from API metadata
  const detectedType = $derived(
    selectedField ? resolveFieldType(selectedField, fieldStats) : ('text' as FieldType)
  );

  // Derived: stats straight from API
  const totalRows = $derived(fieldStats?.totalRows ?? fieldDistribution.reduce((s, d) => s + d.count, 0));
  const nullCount = $derived(fieldStats?.nullCount ?? 0);
  const distinctCount = $derived(fieldStats?.uniqueCount ?? fieldDistribution.length);
  const nullPct = $derived(totalRows > 0 ? nullCount / totalRows : 0);
  const sampleValues = $derived(fieldStats?.sampleValues ?? []);

  // Data type label from API (e.g. "text - categorical", "numeric - measurement")
  const dataTypeLabel = $derived.by(() => {
    const dt = fieldStats?.dataType || selectedField?.dataType;
    const dst = fieldStats?.dataSubType || selectedField?.dataSubType;
    if (!dt) return '';
    return dst ? `${dt} - ${dst}` : dt;
  });

  // Unit from API metadata (e.g. "MW", "years")
  const fieldUnit = $derived(fieldStats?.unit || selectedField?.unit || '');

  // Derived: max count for bar scaling
  const maxCount = $derived(Math.max(...fieldDistribution.map((d) => d.count), 1));

  // Derived: pre-sorted numeric values for histogram — use API's values[] directly
  const histogramData = $derived(fieldStats?.values ?? []);

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

  // Select a field and load its stats
  async function selectField(field: FieldInfo) {
    selectedField = field;
    fieldStats = null;
    mobilePreviewOpen = true;

    if (fetchDistribution) {
      loadingDistribution = true;
      try {
        fieldStats = await fetchDistribution(field.columnName, field.codeFriendlyName);
      } catch (err) {
        if (import.meta.env.DEV) console.error('Failed to fetch distribution:', err);
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
    const statusField = fieldsMetadata.find((f) => f.columnName === 'Status' && !f.fieldValue);
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
            {@const fieldType = resolveFieldType(field, null)}
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
                <span class="field-type-dot" style="background:{typeColors[fieldType]}"></span>
                {shorten(field.columnName, 100)}
              </button>
              <span class="definition">{field.definition}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  <div
    class="dataset-previewer"
    class:mobile-open={mobilePreviewOpen}
    style:--bar-color={trackerColor || 'var(--teal)'}
  >
    <button class="mobile-preview-toggle" onclick={() => (mobilePreviewOpen = !mobilePreviewOpen)}>
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
      {:else if fieldStats}
        <!-- Null / coverage row (matches Observable notebook) -->
        {#if nullCount > 0}
          <div class="coverage-row">
            <span class="field-value">Null</span> in {formatCompact(nullCount)} rows ({formatRatioAsPct(nullPct)})
          </div>
        {:else if totalRows > 0}
          <div class="coverage-row full">
            <span class="field-value">100% coverage</span> (no missing values)
          </div>
        {/if}

        <!-- Summary stats row -->
        <div class="dist-summary">
          <span class="dist-stat">{formatCompact(totalRows)} rows</span>
          <span class="dist-stat">{distinctCount} distinct</span>
          <span class="dist-stat type-badge {detectedType}">
            <span class="type-icon">{typeLabels[detectedType]}</span>
            {#if dataTypeLabel}
              {dataTypeLabel}
            {:else}
              {detectedType === 'enum' ? 'Enum' : detectedType === 'numeric' ? 'Numeric' : 'Text'}
            {/if}
          </span>
        </div>

        <!-- Numeric: histogram from pre-sorted API values -->
        {#if detectedType === 'numeric' && histogramData.length > 0}
          <FieldHistogram
            values={histogramData}
            unit={fieldUnit}
            {nullCount}
            {totalRows}
          />
        {/if}

        <!-- Categorical / enum: distribution bars with counts -->
        {#if detectedType === 'enum' && fieldDistribution.length > 0}
          <div class="distinct-header">{distinctCount} distinct values:</div>
          <div class="dist-bars">
            {#each fieldDistribution.slice(0, MAX_VISIBLE_ITEMS) as item}
              {@const barWidth = (item.count / maxCount) * 100}
              <div class="dist-row">
                <span class="dist-label" title={item.value}>{shorten(item.value, 24)}</span>
                <div class="dist-bar-track">
                  <div class="dist-bar-fill" style="width:{barWidth}%"></div>
                </div>
                <span class="dist-count">{formatCompact(item.count)}</span>
                <span class="dist-pct">{formatRatioAsPct(item.percentage)}</span>
              </div>
            {/each}
            {#if fieldDistribution.length > MAX_VISIBLE_ITEMS}
              <div class="dist-overflow">
                and {fieldDistribution.length - MAX_VISIBLE_ITEMS} more values
              </div>
            {/if}
          </div>
        {/if}

        <!-- Text (unstructured): unique count + data type + sample values -->
        {#if detectedType === 'text'}
          <div class="text-summary">
            {distinctCount} unique values from {formatCompact(totalRows - nullCount)}
            {nullCount > 0 ? 'non-null' : ''} rows
          </div>
          {#if dataTypeLabel}
            <div class="text-summary">
              <span class="field-value">Data Type</span>: {dataTypeLabel}
            </div>
          {/if}
          {#if sampleValues.length > 0}
            <div class="sample-values">
              <span class="field-value">Sample Values</span>:<br />
              {sampleValues.join(' | ')}
            </div>
          {/if}
        {/if}
      {/if}

      {#if selectedFieldValueDefs.length > 0}
        <h4>{selectedField.columnName} definitions</h4>
        <div class="previewer-values-definitions">
          {#each selectedFieldValueDefs as { value, definition }}
            <div><span class="field-value">{value}</span> {definition}</div>
          {/each}
        </div>
      {:else if !loadingDistribution && !fieldStats}
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
    border-color: var(--mint);
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

  /* Field type dot indicator in pills */
  .field-type-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: middle;
    flex-shrink: 0;
    opacity: 0.85;
  }

  /* Type-colored pill styling */
  div.dataset-fields div.field-name > button.type-numeric {
    border-color: rgba(1, 107, 131, 0.4);
    background: rgba(1, 107, 131, 0.06);
  }
  div.dataset-fields div.field-name > button.type-enum {
    border-color: rgba(254, 79, 45, 0.3);
    background: rgba(254, 79, 45, 0.04);
  }
  div.dataset-fields div.field-name > button.type-text {
    border-color: rgba(0, 74, 99, 0.15);
    background: rgba(0, 74, 99, 0.02);
  }

  /* Override selected state (always teal bg, white dot) */
  div.dataset-fields div.field-name > button.selected.type-numeric,
  div.dataset-fields div.field-name > button.selected.type-enum,
  div.dataset-fields div.field-name > button.selected.type-text {
    border-color: var(--teal);
    background: var(--teal);
  }

  div.dataset-fields div.field-name > button.selected .field-type-dot {
    background: rgba(255, 255, 255, 0.8) !important;
  }

  .field-definition {
    font-size: 0.95rem;
    line-height: 1.5;
  }

  /* Coverage / null row */
  .coverage-row {
    font-size: 0.85rem;
    color: var(--navy);
    opacity: 0.8;
  }

  .coverage-row.full {
    color: var(--teal);
  }

  /* Text field summary and sample values */
  .text-summary {
    font-size: 0.85rem;
    color: var(--navy);
    opacity: 0.8;
  }

  .sample-values {
    font-size: 0.8rem;
    color: var(--navy);
    opacity: 0.8;
    line-height: 1.6;
    word-break: break-word;
  }

  /* Distinct values header (matches Observable notebook) */
  .distinct-header {
    font-size: 0.85rem;
    color: var(--navy);
    margin-top: 4px;
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
    background: rgba(254, 79, 45, 0.1);
    color: var(--orange);
  }

  .type-badge.text {
    background: rgba(0, 74, 99, 0.08);
    color: var(--navy);
  }

  .type-icon {
    font-family: 'Barlow Semi-Condensed', 'Arial Narrow', sans-serif;
    font-weight: 700;
    margin-right: 2px;
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
    text-transform: uppercase;
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
    div.dataset-previewer .coverage-row,
    div.dataset-previewer .dist-summary,
    div.dataset-previewer :global(.field-histogram),
    div.dataset-previewer .dist-bars,
    div.dataset-previewer .text-summary,
    div.dataset-previewer .sample-values,
    div.dataset-previewer .loading,
    div.dataset-previewer .no-enum,
    div.dataset-previewer .previewer-values-definitions,
    div.dataset-previewer h4:not(.preview-heading) {
      display: none;
    }

    div.dataset-previewer.mobile-open .preview-heading,
    div.dataset-previewer.mobile-open .field-definition,
    div.dataset-previewer.mobile-open .coverage-row,
    div.dataset-previewer.mobile-open .dist-summary,
    div.dataset-previewer.mobile-open :global(.field-histogram),
    div.dataset-previewer.mobile-open .dist-bars,
    div.dataset-previewer.mobile-open .text-summary,
    div.dataset-previewer.mobile-open .sample-values,
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

  @media (max-width: 640px) {
    .dist-row {
      grid-template-columns: 60px 1fr 32px;
    }

    .dist-pct {
      display: none;
    }
  }
</style>
