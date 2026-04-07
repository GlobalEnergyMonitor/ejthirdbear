<script lang="ts">
  import { formatCO2 } from './coal-plant-utils';

  let {
    alignmentStatus,
    isInDevelopment,
    plannedRetirements,
    remainingLifetime,
    phaseout15C,
    phaseoutCommitment,
    netZeroCommitment,
    annualCO2,
    lifetimeCO2,
    unitEmissions,
    emissionFactor,
    capacityFactor,
  }: {
    alignmentStatus: 'aligned' | 'needs-acceleration' | 'not-aligned' | null;
    isInDevelopment: boolean;
    plannedRetirements: { name: string; year: string }[];
    remainingLifetime: number | null;
    phaseout15C: number;
    phaseoutCommitment: string | null;
    netZeroCommitment: string | null;
    annualCO2: number | null;
    lifetimeCO2: number | null;
    unitEmissions: { name: string; annual: number | null; lifetime: number | null; cls: string }[];
    emissionFactor: string | null;
    capacityFactor: number | null;
  } = $props();

  let emissionsExpanded = $state(false);
</script>

{#if alignmentStatus}
  <div class="alignment-banner alignment-{alignmentStatus}">
    {#if alignmentStatus === 'aligned'}
      ✅ Aligned with a 1.5°C pathway
    {:else if alignmentStatus === 'needs-acceleration'}
      ⏳ Closure commitment needs to accelerate
    {:else}
      ⚠️ Not aligned with 1.5°C pathway
    {/if}
  </div>
{/if}

<div class="emissions-grid">
  <div class="emissions-section">
    <div class="field-label">Planned retirement dates</div>
    {#if plannedRetirements.length > 0}
      {#each plannedRetirements as r}
        <div class="field-value">{r.name} – {r.year}</div>
      {/each}
    {:else}
      <div class="field-value muted">None on record</div>
    {/if}
    <div class="field-label" style="margin-top:1rem;">Estimated remaining lifetime</div>
    <div class="field-value">{remainingLifetime ? `${remainingLifetime} years` : '—'}</div>
  </div>

  <div class="emissions-section">
    <div class="field-label">Country 1.5°C phaseout date</div>
    <div class="field-value">{phaseout15C}</div>
    <div class="field-label" style="margin-top:1rem;">Country pledged phaseout date</div>
    <div class="field-value">{phaseoutCommitment ?? '—'}</div>
    <div class="field-label" style="margin-top:1rem;">Country pledged Net Zero date</div>
    <div class="field-value">{netZeroCommitment ?? '—'}</div>
  </div>

  <div class="emissions-section">
    <div class="field-label">
      {isInDevelopment ? 'Projected CO₂ emissions' : 'CO₂ emissions'}
      <span
        class="info-dot"
        data-tip="Estimated using capacity, capacity factor, heat rate, and emission factor. See gem.wiki for methodology."
        >i</span
      >
    </div>
    <div class="field-value">
      {#if annualCO2 || lifetimeCO2}
        {formatCO2(annualCO2) ?? '—'} per annum ({formatCO2(lifetimeCO2) ?? '—'} lifetime
        <span
          class="info-dot info-dot-inline"
          data-tip="Assumes a 35-year plant lifetime from commissioning. See gem.wiki for methodology."
          >i</span
        >)
        {#if unitEmissions.length > 1}
          <button
            class="emissions-expand-btn"
            onclick={() => (emissionsExpanded = !emissionsExpanded)}
            aria-expanded={emissionsExpanded}
            >{emissionsExpanded ? '▲ hide units' : '▼ by unit'}</button
          >
        {/if}
      {:else}
        —
      {/if}
    </div>
    {#if emissionsExpanded && unitEmissions.length > 1}
      <div class="unit-emissions-list">
        {#each unitEmissions as u}
          <div class="unit-emission-row">
            <span class="unit-emission-dot {u.cls}"></span>
            <span class="unit-emission-name">{u.name}</span>
            <span class="unit-emission-vals">
              {formatCO2(u.annual) ?? '—'}/yr · {formatCO2(u.lifetime) ?? '—'} lifetime
            </span>
          </div>
        {/each}
      </div>
    {/if}

    <div class="field-label" style="margin-top:1rem;">CO₂ emission factor</div>
    <div class="field-value">{emissionFactor ?? '—'}</div>

    {#if !isInDevelopment}
      <div class="field-label" style="margin-top:1rem;">
        Capacity factor
        <span
          class="info-dot"
          data-tip="Country coal fleet average, based on GEM and Ember data. See gem.wiki for methodology."
          >i</span
        >
      </div>
      <div class="field-value">
        {capacityFactor != null ? `${capacityFactor}% (country coal fleet average)` : '—'}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Shared field styles ──────────────────────────────── */
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
  .info-dot-inline {
    width: 12px;
    height: 12px;
    font-size: 0.55rem;
    vertical-align: middle;
    background: #888;
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

  /* ── Alignment banner ────────────────────────────────── */
  .alignment-banner {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
  }
  .alignment-aligned {
    background: #f0fdf4;
    color: #166534;
  }
  .alignment-needs-acceleration {
    background: #fffbeb;
    color: #92400e;
  }
  .alignment-not-aligned {
    background: #fff7ed;
    color: #9a3412;
  }

  /* ── Emissions grid ──────────────────────────────────── */
  .emissions-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2rem;
  }
  .emissions-section {
    display: flex;
    flex-direction: column;
  }

  .emissions-expand-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    color: #888;
    margin-left: 0.4rem;
    white-space: nowrap;
  }
  .emissions-expand-btn:hover {
    color: #333;
  }

  .unit-emissions-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.6rem;
  }
  .unit-emission-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #333;
  }
  .unit-emission-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .unit-emission-dot.chip-operating {
    background: #7f142a;
  }
  .unit-emission-dot.chip-planned {
    background: #ca4a50;
  }
  .unit-emission-dot.chip-retired,
  .unit-emission-dot.chip-cancelled,
  .unit-emission-dot.chip-mothballed {
    background: #bbb;
  }

  .unit-emission-name {
    font-weight: 600;
    min-width: 60px;
    white-space: nowrap;
  }
  .unit-emission-vals {
    color: #555;
  }

  @media (max-width: 768px) {
    .emissions-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
