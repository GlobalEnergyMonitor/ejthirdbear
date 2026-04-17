<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface FilterFieldDef {
    key: string;
    label: string;
    phrase: string;
  }

  export interface QuickStart {
    sentence: string;
    apply: () => void;
  }

  let {
    fields = [],
    filters = {},
    isDirty = false,
    quickStarts = [],
    openPicker = $bindable<string | null>(null),
    shownFields = $bindable<string[]>([]),
    panelTitles = {},
    columnPickerKeys = [],
    startWord = 'See',
    onRemoveValue,
    onRemoveField,
    onClearAll,
    subject,
    picker,
    fieldPickerSuffix,
  }: {
    fields?: FilterFieldDef[];
    filters?: Record<string, string[]>;
    isDirty?: boolean;
    quickStarts?: QuickStart[];
    openPicker?: string | null;
    shownFields?: string[];
    panelTitles?: Record<string, string>;
    columnPickerKeys?: string[];
    startWord?: string;
    onRemoveValue?: (key: string, val: string) => void;
    onRemoveField?: (key: string) => void;
    onClearAll?: () => void;
    subject?: Snippet;
    picker?: Snippet<[string]>;
    fieldPickerSuffix?: Snippet;
  } = $props();

  const panelTitle = $derived.by(() => {
    if (!openPicker) return '';
    if (openPicker === '__fields') return 'Add filter fields';
    if (panelTitles[openPicker]) return panelTitles[openPicker];
    return fields.find((f) => f.key === openPicker)?.label ?? openPicker;
  });

  function togglePicker(key: string) {
    openPicker = openPicker === key ? null : key;
  }

  function toggleFilterField(key: string) {
    if (shownFields.includes(key)) {
      shownFields = shownFields.filter((k) => k !== key);
      onRemoveField?.(key);
    } else {
      shownFields = [...shownFields, key];
      openPicker = key;
    }
  }

  // Track whether any quick start has been used — hides the grid until clearAll
  let quickStartUsed = $state(false);
  $effect(() => {
    if (!isDirty) quickStartUsed = false;
  });

  function closePicker() {
    if (openPicker && openPicker !== '__fields') {
      const vals = filters[openPicker] ?? [];
      if (vals.length === 0 && shownFields.includes(openPicker)) {
        shownFields = shownFields.filter((k) => k !== openPicker);
        onRemoveField?.(openPicker);
      }
    }
    openPicker = null;
  }
</script>

{#if !isDirty && !quickStartUsed && quickStarts.length > 0}
  <div class="quick-starts">
    <p class="qs-heading">What would you like to explore?</p>
    <div class="qs-grid">
      {#each quickStarts as qs}
        <button
          class="qs-item"
          onclick={() => {
            quickStartUsed = true;
            qs.apply();
          }}
        >
          {qs.sentence}
        </button>
      {/each}
    </div>
  </div>
{/if}

<div class="sentence">
  <span class="word">{startWord}</span>

  {@render subject?.()}

  {#each shownFields as fieldKey (fieldKey)}
    {@const def = fields.find((f) => f.key === fieldKey)}
    {#if def}
      <span class="word">{def.phrase}</span>
      {#each filters[fieldKey] ?? [] as v (v)}
        <span class="value-chip">
          {v}
          <button class="chip-x" onclick={() => onRemoveValue?.(fieldKey, v)}>×</button>
        </span>
      {/each}
      <button
        class="open-btn"
        class:open={openPicker === fieldKey}
        onclick={() => togglePicker(fieldKey)}
        aria-label="Add {def.label}">{openPicker === fieldKey ? '−' : '+'}</button
      >
    {/if}
  {/each}

  <button
    class="add-filter-btn"
    class:open={openPicker === '__fields'}
    onclick={() => togglePicker('__fields')}
    >{openPicker === '__fields' ? '− hide filters' : '+ add filter'}</button
  >

  <span class="sentence-end">.</span>

  {#if isDirty}
    <button class="clear-all-btn" onclick={onClearAll}>Clear all ×</button>
  {/if}
</div>

{#if openPicker}
  <div class="picker-panel">
    <div class="panel-header">
      <span class="panel-title">{panelTitle}</span>
      <button class="panel-close" onclick={closePicker}>Done</button>
    </div>
    <div
      class="panel-body"
      class:panel-body--column={openPicker !== null && columnPickerKeys.includes(openPicker)}
    >
      {#if openPicker === '__fields'}
        {#each fields as f}
          <button
            class="pill"
            class:active={shownFields.includes(f.key)}
            onclick={() => toggleFilterField(f.key)}>{f.label}</button
          >
        {/each}
        {@render fieldPickerSuffix?.()}
      {:else}
        {@render picker?.(openPicker)}
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Allow consumer to constrain width via --sentence-max-width */
  .quick-starts,
  .sentence,
  .picker-panel {
    max-width: var(--sentence-max-width, none);
    margin-left: auto;
    margin-right: auto;
  }

  .clear-all-btn {
    all: unset;
    cursor: pointer;
    font-size: var(--font-size-xs, 11px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--gem-orange, #fe4f2d);
    border: 1px solid currentColor;
    border-radius: 4px;
    padding: 0.15em 0.5em;
    white-space: nowrap;
    transition:
      background 0.12s,
      color 0.12s;
    flex-shrink: 0;
  }

  .clear-all-btn:hover {
    background: var(--gem-orange, #fe4f2d);
    color: #fff;
  }

  .quick-starts {
    margin-bottom: var(--space-8, 32px);
  }

  .qs-heading {
    font-size: var(--font-size-xs, 10px);
    font-weight: var(--font-weight-bold, 700);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest, 0.08em);
    color: var(--color-gray-400, #9eaaad);
    margin: 0 0 var(--space-3, 12px);
  }

  .qs-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-2, 8px);
  }

  .qs-item {
    all: unset;
    display: block;
    cursor: pointer;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    font-size: var(--font-size-sm, 13px);
    line-height: var(--line-height-relaxed, 1.5);
    color: var(--color-gray-600, #4c6267);
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 6px;
    background: #fff;
    transition:
      color 0.12s,
      border-color 0.12s,
      background 0.12s;
    text-align: left;
  }

  .qs-item:hover {
    color: var(--gem-primary-blue, #1d4961);
    border-color: var(--gem-primary-blue, #1d4961);
    background: var(--gem-navy-10, #e9eef1);
  }

  .sentence {
    font-size: var(--font-size-lg, 18px);
    line-height: 2.2;
    color: var(--gem-primary-blue, #1d4961);
    margin-bottom: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .word {
    color: var(--color-gray-600, #4c6267);
    white-space: nowrap;
  }

  .sentence-end {
    color: var(--color-gray-300, #becccf);
  }

  .value-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 4px;
    padding: 0.15em 0.5em;
    font-family: var(--font-family-data, 'Barlow Semi Condensed', sans-serif);
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--gem-primary-blue, #1d4961);
    white-space: nowrap;
  }

  .chip-x {
    all: unset;
    cursor: pointer;
    color: var(--color-gray-400, #9eaaad);
    font-size: var(--font-size-sm, 12px);
    line-height: 1;
    padding: 0 2px;
    transition: color 0.1s;
  }

  .chip-x:hover {
    color: var(--gem-primary-blue, #1d4961);
  }

  .open-btn {
    all: unset;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--color-gray-100, #eceae3);
    border: 1px solid var(--color-gray-200, #dce3e5);
    color: var(--color-gray-600, #4c6267);
    font-size: var(--font-size-sm, 12px);
    line-height: 1;
    flex-shrink: 0;
    transition:
      background 0.1s,
      color 0.1s,
      border-color 0.1s;
  }

  .open-btn:hover {
    background: var(--gem-navy-10, #e9eef1);
    border-color: var(--color-gray-300, #becccf);
    color: var(--gem-primary-blue, #1d4961);
  }

  .open-btn.open {
    background: var(--gem-primary-blue, #1d4961);
    border-color: var(--gem-primary-blue, #1d4961);
    color: #fff;
  }

  .add-filter-btn {
    all: unset;
    cursor: pointer;
    font-size: var(--font-size-sm, 12px);
    color: var(--color-gray-400, #9eaaad);
    border: 1px dashed var(--color-gray-300, #becccf);
    border-radius: 4px;
    padding: 0.2em 0.6em;
    white-space: nowrap;
    transition:
      color 0.1s,
      border-color 0.1s;
  }

  .add-filter-btn:hover,
  .add-filter-btn.open {
    color: var(--gem-primary-blue, #1d4961);
    border-color: var(--color-gray-400, #9eaaad);
  }

  .picker-panel {
    margin-top: var(--space-3, 12px);
    border: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 8px;
    background: var(--gem-warm-white, #fffffe);
    overflow: visible;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    background: #fff;
    border-bottom: 1px solid var(--color-gray-200, #dce3e5);
    border-radius: 8px 8px 0 0;
  }

  .panel-title {
    font-size: var(--font-size-xs, 10px);
    font-weight: var(--font-weight-bold, 700);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wider, 0.04em);
    color: var(--color-gray-600, #4c6267);
  }

  .panel-close {
    all: unset;
    cursor: pointer;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--gem-primary-blue, #1d4961);
    padding: var(--space-1, 4px) var(--space-3, 12px);
    border: 1px solid var(--color-gray-300, #becccf);
    border-radius: 4px;
    background: #fff;
    transition: background 0.1s;
  }

  .panel-close:hover {
    background: var(--gem-navy-10, #e9eef1);
  }

  .panel-body {
    padding: var(--space-4, 16px);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2, 8px);
    min-height: 48px;
  }

  .panel-body--column {
    flex-direction: column;
    flex-wrap: nowrap;
    padding: var(--space-3, 12px);
  }

  .pill {
    all: unset;
    cursor: pointer;
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border: 1.5px solid var(--color-gray-200, #dce3e5);
    border-radius: 20px;
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-medium, 500);
    color: var(--color-gray-600, #4c6267);
    background: #fff;
    transition: all 0.12s;
    white-space: nowrap;
  }

  .pill:hover {
    border-color: var(--gem-primary-blue, #1d4961);
    color: var(--gem-primary-blue, #1d4961);
  }

  .pill.active {
    background: var(--gem-primary-blue, #1d4961);
    color: #fff;
    border-color: var(--gem-primary-blue, #1d4961);
  }
</style>
