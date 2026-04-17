<script lang="ts">
  import type { FieldDef } from './card-types';

  let {
    title,
    fields,
  }: {
    title?: string;
    fields: FieldDef[];
  } = $props();

  /** A field has displayable content if its value is non-null, non-undefined, and non-empty-string. */
  function hasValue(f: FieldDef): boolean {
    return f.value !== null && f.value !== undefined && f.value !== '';
  }

  const visibleFields = $derived(fields.filter((f) => hasValue(f) || f.emptyBehavior === 'dash'));
</script>

{#if visibleFields.length > 0}
  <div class="card-section">
    {#if title}
      <div class="section-title">{title}</div>
    {/if}
    <dl class="field-list">
      {#each visibleFields as field}
        <div class="field-row">
          <dt
            class="field-label"
            class:has-tooltip={!!field.tooltip}
            data-tip={field.tooltip ?? null}
          >
            {field.label}
          </dt>
          <dd
            class="field-value"
            class:has-tooltip={!!field.valueTooltip}
            data-tip={field.valueTooltip ?? null}
          >
            {#if !hasValue(field)}
              <span class="field-empty">—</span>
            {:else if field.link}
              <a href={field.link} target="_blank" rel="noopener noreferrer"
                >{field.value}{field.unit ? ` ${field.unit}` : ''}</a
              >
            {:else}
              {field.value}{field.unit ? ` ${field.unit}` : ''}
            {/if}
          </dd>
        </div>
      {/each}
    </dl>
  </div>
{/if}

<style>
  .card-section {
    margin-bottom: 1.75rem;
  }
  .card-section:last-child {
    margin-bottom: 0;
  }

  .section-title {
    font-size: 0.72rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #888;
    margin-bottom: 0.75rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .field-list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }

  .field-row {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 0.5rem;
    align-items: baseline;
    font-size: 0.875rem;
  }

  .field-label {
    font-weight: 600;
    color: #444;
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .field-label.has-tooltip {
    cursor: help;
    text-decoration: underline dotted #aaa;
    text-underline-offset: 3px;
    position: relative;
  }

  .field-label.has-tooltip::after {
    content: attr(data-tip);
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: #222;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.4;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    white-space: normal;
    width: max-content;
    max-width: 240px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 100;
    font-style: normal;
    text-transform: none;
    letter-spacing: 0;
    text-decoration: none;
  }

  .field-label.has-tooltip:hover::after {
    opacity: 1;
  }

  .field-value {
    color: #1a1a1a;
    line-height: 1.5;
    margin: 0;
  }

  .field-value.has-tooltip {
    cursor: help;
    text-decoration: underline dotted #aaa;
    text-underline-offset: 3px;
    position: relative;
  }

  .field-value.has-tooltip::after {
    content: attr(data-tip);
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    background: #222;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.4;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    white-space: normal;
    width: max-content;
    max-width: 240px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 100;
  }

  .field-value.has-tooltip:hover::after {
    opacity: 1;
  }

  .field-value a {
    color: #1a6b7a;
    text-decoration: none;
  }
  .field-value a:hover {
    text-decoration: underline;
  }

  .field-empty {
    color: #bbb;
  }
</style>
