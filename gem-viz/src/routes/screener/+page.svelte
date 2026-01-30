<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   * Presets fill the query form. User can customize. One asset class at a time.
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';
  import {
    TRACKERS,
    SCREENER_PRESETS,
    STATUS_VALUES,
    COUNTRIES,
    NUMERIC_OPERATORS,
    TEXT_OPERATORS,
    getFieldsForTracker,
    getFieldConfig,
  } from '$lib/data-config/tracker-schema';

  // Track which preset is active (for highlighting)
  let activePresetId = $state(null);

  // Custom query builder state
  let customTracker = $state('');
  let customField = $state('');
  let customOperator = $state('');
  let customValue = $state('');
  let customGeoFilter = $state('');
  let customStatusFilter = $state('');
  let showGeoFilter = $state(false);
  let showStatusFilter = $state(false);

  // Get field config for current selection
  const fieldConfig = $derived(
    customTracker && customField ? getFieldConfig(customTracker, customField) : null
  );

  // Get operators for current field
  const currentOperators = $derived(
    fieldConfig ? (fieldConfig.type === 'numeric' ? NUMERIC_OPERATORS : TEXT_OPERATORS) : []
  );

  // Get available fields for selected tracker
  const availableFields = $derived(customTracker ? getFieldsForTracker(customTracker) : []);

  // Check if field has enum values
  function isEnumField(field) {
    return field === 'Status' || field === 'Owner Headquarters Country';
  }

  // Get enum options for a field
  function getEnumOptions(field) {
    if (field === 'Status') return STATUS_VALUES;
    if (field === 'Owner Headquarters Country') return COUNTRIES;
    return [];
  }

  // Apply preset to fill the form
  function applyPreset(preset) {
    activePresetId = preset.id;
    customTracker = preset.tracker || '';

    // Need to wait for availableFields to update, then set field
    // Use setTimeout to let reactive update happen
    setTimeout(() => {
      customField = preset.filters?.field || '';
      setTimeout(() => {
        customOperator = preset.filters?.operator || '';
        customValue = preset.filters?.value ?? '';
      }, 0);
    }, 0);
  }

  // Clear the form
  function clearForm() {
    activePresetId = null;
    customTracker = '';
    customField = '';
    customOperator = '';
    customValue = '';
    customGeoFilter = '';
    customStatusFilter = '';
    showGeoFilter = false;
    showStatusFilter = false;
  }

  // Check if form has enough to continue (just tracker is enough)
  const canContinue = $derived(customTracker !== '');

  // Build current configuration description
  const currentConfigDescription = $derived(() => {
    if (!customTracker) return '';
    let desc = customTracker;
    if (customField && customOperator) {
      const opLabel =
        [...NUMERIC_OPERATORS, ...TEXT_OPERATORS].find((o) => o.value === customOperator)?.label ||
        customOperator;
      desc += ` where ${customField} ${opLabel}`;
      if (customValue && customOperator !== 'not_empty') desc += ` ${customValue}`;
    }
    if (customGeoFilter) desc += ` in ${customGeoFilter}`;
    if (customStatusFilter) desc += ` (${customStatusFilter})`;
    return desc;
  });

  // Continue to owners step with current form values
  function continueToOwners() {
    const classData = [
      {
        id: activePresetId || `custom-${Date.now()}`,
        name: customTracker,
        description: currentConfigDescription(),
        tracker: customTracker,
        filters: {
          field: customField || undefined,
          operator: customOperator || undefined,
          value: customValue || undefined,
          geography: customGeoFilter || undefined,
          status: customStatusFilter || undefined,
        },
      },
    ];
    const url = new URL('/screener/results', $page.url.origin);
    url.searchParams.set('classes', JSON.stringify(classData));
    goto(url.pathname + url.search);
  }

  // Check if preset is active
  function isActivePreset(preset) {
    return activePresetId === preset.id;
  }
</script>

<svelte:head>
  <title>Asset Class Screener — Global Energy Monitor</title>
  <meta name="description" content="Screen and analyze corporate ownership exposure to specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities." />
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <ScreenerStepNav currentStep={1} />

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <p class="subtitle">
          Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting
          asset-classes below, or building your own query.
        </p>
      </div>

      <!-- Current selection summary -->
      <div class="selection-badge" class:has-selection={customTracker}>
        {#if customTracker}
          <span class="selection-text">{currentConfigDescription()}</span>
          <button class="clear-btn" onclick={clearForm}>×</button>
        {:else}
          <span class="selection-text">None selected yet</span>
        {/if}
      </div>
    </header>

    <!-- Presets section -->
    <section class="quick-add">
      <h2>
        Quick add classes of assets
        <span class="refine-hint"
          >Refine by <strong>geography</strong> or <strong>status</strong> (operating, proposed, etc)
          after making selections</span
        >
      </h2>

      <div class="quick-cards">
        {#each SCREENER_PRESETS as card}
          <button
            class="quick-card"
            class:active={isActivePreset(card)}
            onclick={() => applyPreset(card)}
          >
            <div class="card-header">
              <span class="card-name">{card.name}</span>
              {#if card.subLabel}
                <span class="card-sublabel">{card.subLabel}</span>
              {/if}
            </div>
            <p class="card-description">{card.description}</p>
            {#if isActivePreset(card)}
              <div class="card-active-indicator">●</div>
            {/if}
          </button>
        {/each}
      </div>
    </section>

    <!-- Custom query builder -->
    <section class="query-builder">
      <div class="builder-form">
        <div class="form-row main-row">
          <label class="form-field">
            <span class="field-label">Asset type <span class="required">*</span></span>
            <select
              bind:value={customTracker}
              onchange={() => {
                customField = '';
                customOperator = '';
              }}
            >
              <option value="">Select...</option>
              {#each TRACKERS as tracker}
                <option value={tracker}>{tracker}</option>
              {/each}
            </select>
          </label>

          {#if customTracker}
            <label class="form-field">
              <span class="field-label">Field <span class="required">*</span></span>
              <select bind:value={customField} onchange={() => (customOperator = '')}>
                <option value="">Select...</option>
                {#each availableFields as field}
                  <option value={field}>{field}</option>
                {/each}
              </select>
            </label>

            {#if customField}
              <label class="form-field operator-field">
                <span class="field-label">Condition <span class="required">*</span></span>
                <select bind:value={customOperator}>
                  <option value="">Select...</option>
                  {#each currentOperators as op}
                    <option value={op.value}>{op.label}</option>
                  {/each}
                </select>
              </label>

              {#if customOperator && customOperator !== 'not_empty'}
                <label class="form-field value-field">
                  <span class="field-label">Value <span class="required">*</span></span>
                  {#if isEnumField(customField)}
                    <select bind:value={customValue}>
                      <option value="">Select...</option>
                      {#each getEnumOptions(customField) as opt}
                        <option value={opt}>{opt}</option>
                      {/each}
                    </select>
                  {:else}
                    <input
                      type={fieldConfig?.type === 'numeric' ? 'number' : 'text'}
                      bind:value={customValue}
                      placeholder="Enter value"
                    />
                  {/if}
                </label>
              {/if}
            {/if}
          {/if}
        </div>

        {#if customTracker && !customField}
          <div class="builder-hint">
            Select a field to define your filter criteria. Numeric fields support comparison
            operators, while text fields support exact match or contains.
          </div>
        {/if}

        <!-- Optional filters - each on own line -->
        <div class="optional-filters">
          <div class="optional-label">Optional filters</div>

          <!-- Country filter row -->
          <div class="filter-row">
            {#if !showGeoFilter}
              <button class="add-filter-btn" onclick={() => (showGeoFilter = true)}>
                + Add country filter
              </button>
            {:else}
              <label class="form-field">
                <span class="field-label">Country <span class="optional">(optional)</span></span>
                <div class="filter-input-row">
                  <select bind:value={customGeoFilter}>
                    <option value="">All countries</option>
                    {#each COUNTRIES as country}
                      <option value={country}>{country}</option>
                    {/each}
                  </select>
                  <button
                    class="remove-filter"
                    onclick={() => {
                      showGeoFilter = false;
                      customGeoFilter = '';
                    }}>×</button
                  >
                </div>
              </label>
            {/if}
          </div>

          <!-- Status filter row -->
          <div class="filter-row">
            {#if !showStatusFilter}
              <button class="add-filter-btn" onclick={() => (showStatusFilter = true)}>
                + Add status filter
              </button>
            {:else}
              <label class="form-field">
                <span class="field-label">Status <span class="optional">(optional)</span></span>
                <div class="filter-input-row">
                  <select bind:value={customStatusFilter}>
                    <option value="">All statuses</option>
                    {#each STATUS_VALUES as status}
                      <option value={status}>{status}</option>
                    {/each}
                  </select>
                  <button
                    class="remove-filter"
                    onclick={() => {
                      showStatusFilter = false;
                      customStatusFilter = '';
                    }}>×</button
                  >
                </div>
              </label>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <!-- Continue button -->
    <div class="continue-section">
      <button class="continue-btn" onclick={continueToOwners} disabled={!canContinue}>
        Continue to Owner Analysis
      </button>
      {#if !canContinue}
        <p class="continue-hint">Select a preset or choose an asset type above</p>
      {/if}
    </div>
  </div>
</main>

<style>
  /* Tufte-inspired information design */
  main {
    min-height: 100vh;
    background: var(--color-bg-primary);
  }

  .screener-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-8) 80px;
  }

  /* Header - typography hierarchy */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-8);
    margin-bottom: var(--space-10);
  }

  .header-content {
    flex: 1;
  }

  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: var(--line-height-relaxed);
    max-width: 560px;
  }

  /* Selection badge */
  .selection-badge {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    background: var(--gem-teal);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-lg);
    white-space: nowrap;
    min-width: 200px;
  }

  .selection-badge.has-selection {
    background: var(--gem-primary-blue);
  }

  .selection-text {
    flex: 1;
  }

  .clear-btn {
    font-size: var(--font-size-xl);
    color: rgba(255, 255, 255, 0.7);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .clear-btn:hover {
    color: white;
  }

  /* Sections - whitespace instead of boxes */
  section {
    margin-bottom: var(--space-12);
    padding: 0;
  }

  section h2 {
    font-size: var(--font-size-md);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin: 0 0 var(--space-5) 0;
    color: var(--color-text-secondary);
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    flex-wrap: wrap;
    padding-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .refine-hint {
    font-size: var(--font-size-body);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-tertiary);
  }

  /* Quick add cards - minimal, typography-driven */
  .quick-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-6) var(--space-8);
  }

  .quick-card {
    position: relative;
    padding: var(--space-3) var(--space-4);
    margin: calc(-1 * var(--space-3)) calc(-1 * var(--space-4));
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
      background-color var(--duration-base) var(--ease-in-out-quad),
      transform var(--duration-base) var(--ease-out-back);
  }

  .quick-card:hover {
    background: var(--color-gray-50);
  }

  .quick-card:hover .card-name {
    color: var(--color-text-primary);
  }

  /* Active/selected state */
  .quick-card.active {
    background: var(--color-bg-secondary);
    border-left: 2px solid var(--color-accent);
    margin-left: calc(-2px - var(--space-4));
    padding-left: calc(var(--space-4) + 2px);
  }

  .quick-card.active .card-name {
    color: var(--color-text-primary);
  }

  .card-active-indicator {
    position: absolute;
    top: var(--space-1);
    right: var(--space-2);
    font-size: var(--font-size-xs);
    color: var(--color-accent);
  }

  .card-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-1);
  }

  .card-name {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-secondary);
    transition: color var(--transition-fast);
  }

  .card-sublabel {
    font-size: var(--font-size-md);
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .card-description {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin: 0;
    line-height: var(--line-height-normal);
  }

  /* Query builder - clean form design */
  .builder-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    align-items: end;
    gap: var(--space-4);
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .field-label {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
    font-weight: 500;
  }

  .required {
    color: var(--color-error);
  }

  .optional {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: var(--color-text-tertiary);
  }

  .form-field select,
  .form-field input {
    padding: var(--space-2) var(--space-2);
    font-size: var(--font-size-body);
    border: none;
    border-bottom: var(--border-width) solid var(--color-gray-300);
    border-radius: 0;
    background: transparent;
    width: 100%;
    color: var(--color-text-primary);
  }

  .form-field select:focus,
  .form-field input:focus {
    outline: none;
    border-bottom-color: var(--color-text-primary);
  }

  .form-field select {
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath fill='%23999' d='M0 0l4 4 4-4z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right var(--space-1) center;
    padding-right: var(--space-5);
  }

  .operator-field select {
    width: 100%;
  }

  .value-field input {
    width: 100%;
  }

  .builder-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    line-height: var(--line-height-relaxed);
    padding-left: var(--space-3);
    border-left: var(--border-width) solid var(--color-gray-300);
    margin-left: var(--space-1);
  }

  .optional-filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-top: var(--space-5);
    border-top: var(--border-width) solid var(--color-border-light);
    margin-top: var(--space-2);
  }

  .optional-label {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin-bottom: calc(-1 * var(--space-2));
  }

  .filter-row {
    display: grid;
    align-items: end;
  }

  .filter-input-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .add-filter-btn {
    padding: 0;
    font-size: var(--font-size-body);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-tertiary);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .add-filter-btn:hover {
    color: var(--color-text-primary);
  }

  .remove-filter {
    background: none;
    border: none;
    font-size: var(--font-size-lg);
    color: var(--color-gray-300);
    cursor: pointer;
    padding: 0;
    margin-left: var(--space-1);
  }

  .remove-filter:hover {
    color: var(--color-text-tertiary);
  }

  /* Continue section - prominent but simple */
  .continue-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding-top: var(--space-8);
    border-top: var(--border-width) solid var(--color-border);
  }

  .continue-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .continue-btn {
    padding: var(--space-3) var(--space-6);
    font-size: var(--font-size-lg);
    font-weight: 500;
    background: var(--color-text-primary);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    letter-spacing: var(--tracking-wide);
  }

  .continue-btn:hover:not(:disabled) {
    background: var(--color-black);
  }

  .continue-btn:disabled {
    background: var(--color-border);
    color: var(--color-text-tertiary);
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .quick-cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .screener-layout {
      padding: var(--space-8) var(--space-5) 60px;
    }

    .screener-header {
      gap: var(--space-8);
    }

    .quick-cards {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .form-field select,
    .form-field input {
      width: 100%;
    }
  }
</style>
