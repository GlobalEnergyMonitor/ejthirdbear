<script lang="ts">
  import { browser } from '$app/environment';
  import CoalDataWizard from '$lib/components/coal/CoalDataWizard.svelte';
  import { WIZARD_PRESETS, type WizardPreset } from '$lib/data-config/coal-wizard-presets';

  let wizardRef = $state<{ loadPreset: (p: WizardPreset) => void } | null>(null);
  let showQuickstart = $state(false);

  function applyPreset(preset: WizardPreset) {
    showQuickstart = false;
    wizardRef?.loadPreset(preset);
  }

  const MODE_LABEL: Record<string, string> = {
    records: 'Records',
    summary: 'Summary',
  };
  const TRACKER_LABEL: Record<string, string> = {
    plants: 'Plants',
    mines: 'Mines',
    both: 'Both',
  };
</script>

<svelte:head>
  <title>Coal Data — Global Energy Monitor</title>
  <meta
    name="description"
    content="Explore GEM coal plant and mine data. Browse individual records or calculate summary statistics, filtered by country, status, and more."
  />
</svelte:head>

<div class="page-wrap">
  <div class="page-header">
    <h1>Coal Data</h1>
    <p class="page-desc">
      Access individual records or calculate summary statistics across GEM's coal plant and mine trackers.
      <button class="qs-trigger" onclick={() => (showQuickstart = true)}>
        Quick-start examples →
      </button>
    </p>
  </div>

  {#if browser}
    <CoalDataWizard bind:this={wizardRef} />
  {/if}
</div>

<!-- Quick-start modal -->
{#if showQuickstart}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="qs-backdrop" onclick={() => (showQuickstart = false)} role="button" tabindex="-1">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="qs-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label="Quick-start examples"
      tabindex="-1"
    >
      <div class="qs-modal-header">
        <div>
          <h2 class="qs-modal-title">Quick-start examples</h2>
          <p class="qs-modal-desc">Select an example to pre-fill the form.</p>
        </div>
        <button class="qs-close" onclick={() => (showQuickstart = false)} aria-label="Close">✕</button>
      </div>
      <div class="qs-grid">
        {#each WIZARD_PRESETS as preset (preset.id)}
          <button class="qs-card" onclick={() => applyPreset(preset)}>
            <span class="qs-card-label">{preset.label}</span>
            <span class="qs-card-desc">{preset.description}</span>
            <span class="qs-card-tags">
              <span class="qs-tag">{MODE_LABEL[preset.outputMode]}</span>
              <span class="qs-tag">{TRACKER_LABEL[preset.trackerMode]}</span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .page-wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-5);
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .page-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 56ch;
  }

  .qs-trigger {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--gem-navy);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    text-decoration: underline;
    text-decoration-color: var(--gem-teal-25);
    text-underline-offset: 3px;
    transition: text-decoration-color var(--transition-fast);
  }

  .qs-trigger:hover {
    text-decoration-color: var(--gem-navy);
  }

  /* ── Quick-start modal ── */
  .qs-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-6) var(--space-4);
  }

  .qs-modal {
    background: var(--color-bg-primary);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-width: 660px;
    max-height: 80vh;
    overflow-y: auto;
    padding: var(--space-6);
  }

  .qs-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: var(--space-5);
  }

  .qs-modal-title {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
  }

  .qs-modal-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .qs-close {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: var(--color-bg-tertiary);
    color: var(--color-text-secondary);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .qs-close:hover {
    background: var(--color-border);
  }

  .qs-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  @media (max-width: 520px) {
    .qs-grid { grid-template-columns: 1fr; }
  }

  .qs-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-4);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-bg-secondary);
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }

  .qs-card:hover {
    border-color: var(--gem-navy);
    background: var(--color-bg-primary);
  }

  .qs-card-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .qs-card-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .qs-card-tags {
    display: flex;
    gap: var(--space-1);
    margin-top: auto;
  }

  .qs-tag {
    font-size: 11px;
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-secondary);
    background: var(--color-bg-tertiary);
    padding: 1px 6px;
    border-radius: var(--radius-full);
  }
</style>
