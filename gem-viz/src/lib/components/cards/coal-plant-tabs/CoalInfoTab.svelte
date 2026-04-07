<script lang="ts">
  import { capitalize } from './coal-plant-utils';

  let {
    coalTypes,
    coalSources,
    chpValue,
    captiveValues,
  }: {
    coalTypes: string[];
    coalSources: string[];
    chpValue: string | null;
    captiveValues: string[];
  } = $props();
</script>

<div class="coal-grid">
  <div class="coal-section">
    <div class="field-label">Coal Type(s)</div>
    {#if coalTypes.length > 0}
      {#each coalTypes as type}
        <div class="field-value">{capitalize(type)}</div>
      {/each}
    {:else}
      <div class="field-value muted">Unknown</div>
    {/if}
    <div class="field-label" style="margin-top:1.5rem;">Coal Source</div>
    {#if coalSources.length > 0}
      {#each coalSources as source}
        <div class="field-value">{source}</div>
      {/each}
    {:else}
      <div class="field-value muted">Unknown</div>
    {/if}
  </div>

  <div class="coal-section">
    <div class="field-label">Unit used for heat and power?</div>
    <div class="field-value">{chpValue ?? '—'}</div>
  </div>

  <div class="coal-section">
    <div class="field-label">
      Captive
      <span
        class="info-dot"
        data-tip="A captive plant generates power primarily for a specific industrial user rather than the public grid."
        >i</span
      >
    </div>
    <div class="field-value">
      {captiveValues.length > 0 ? captiveValues.join(', ') : 'Unknown'}
    </div>
  </div>
</div>

<style>
  .field-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #111;
    margin-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .field-value {
    font-size: 0.9rem;
    color: #222;
  }
  .field-value.muted {
    color: #999;
  }

  .info-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: #111;
    color: #fff;
    border-radius: 50%;
    font-size: 0.6rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    font-style: normal;
    position: relative;
  }
  .info-dot::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #222;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.4;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    white-space: normal;
    width: max-content;
    max-width: 220px;
    text-align: left;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 100;
  }
  .info-dot:hover::after {
    opacity: 1;
  }

  .coal-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }

  @media (max-width: 768px) {
    .coal-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
