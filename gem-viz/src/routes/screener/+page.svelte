<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   * Presets fill the query form. User can customize. One asset class at a time.
   */

  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import ScreenerLayout from '$lib/components/ScreenerLayout.svelte';
  import DebugPanel from '$lib/components/DebugPanel.svelte';
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
  async function applyPreset(preset) {
    activePresetId = preset.id;
    customTracker = preset.tracker || '';

    // Wait for reactive updates (availableFields depends on customTracker)
    await tick();

    customField = preset.filters?.field || '';
    customOperator = preset.filters?.operator || '';
    customValue = preset.filters?.value ?? '';
    // Also apply status and geography filters from preset
    customStatusFilter = preset.filters?.status || '';
    customGeoFilter = preset.filters?.geography || '';
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

  // Build class data from current form values
  function buildClassData() {
    return [
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
  }

  // Show all owners with stakes in selected asset class
  function showAllOwners() {
    const classData = buildClassData();
    const url = new URL('/screener/results', $page.url.origin);
    url.searchParams.set('classes', JSON.stringify(classData));
    goto(url.pathname + url.search);
  }

  // Search for specific owners
  function searchSpecificOwners() {
    const classData = buildClassData();
    const url = new URL('/screener/owners', $page.url.origin);
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
  <meta
    name="description"
    content="Screen and analyze corporate ownership in specific classes of energy assets such as coal plants, gas infrastructure, and steel facilities."
  />
</svelte:head>

<ScreenerLayout
  currentStep={1}
  subtitle="Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting asset-classes below, or building your own query."
>
  {#snippet headerRight()}
    <!-- Current selection summary -->
    <div class="selection-badge" class:has-selection={customTracker}>
      {#if customTracker}
        <span class="selection-text">{currentConfigDescription()}</span>
        <button class="clear-btn" onclick={clearForm}>×</button>
      {:else}
        <span class="selection-text">None selected yet</span>
      {/if}
    </div>
  {/snippet}

  <!-- Presets section -->
  <section class="quick-add">
    <h2>
      Quick add classes of assets
      <span class="refine-hint"
        >Click a preset to populate the query builder below. Badges show included filters.</span
      >
    </h2>

    <div class="quick-cards">
      {#each SCREENER_PRESETS as card}
        <button
          class="quick-card"
          class:active={isActivePreset(card)}
          class:has-filters={card.filters?.status || card.filters?.geography}
          onclick={() => applyPreset(card)}
        >
          <div class="card-header">
            <span class="card-name">{card.name}</span>
            {#if card.subLabel}
              <span class="card-sublabel">{card.subLabel}</span>
            {/if}
          </div>
          <p class="card-description">{card.description}</p>
          {#if card.filters?.status || card.filters?.geography}
            <div class="filter-badges">
              {#if card.filters.status}
                <span class="filter-badge status">{card.filters.status}</span>
              {/if}
              {#if card.filters.geography}
                <span class="filter-badge geo">{card.filters.geography}</span>
              {/if}
            </div>
          {/if}
          {#if isActivePreset(card)}
            <div class="card-active-indicator">●</div>
          {/if}
        </button>
      {/each}
    </div>
  </section>

  <!-- Filter Selection - Wizard-style steps -->
  <section class="filter-section">
    <h2>Build Your Query</h2>

    <!-- Live summary that builds as they select -->
    <div class="query-summary" class:has-selection={customTracker}>
      <span class="summary-label">You're looking for:</span>
      <span class="summary-text">
        {#if !customTracker}
          <span class="placeholder">Select an asset type to get started...</span>
        {:else}
          <strong>{customStatusFilter || 'All'}</strong>
          <strong>{customTracker}</strong>
          {#if customGeoFilter}
            in <strong>{customGeoFilter}</strong>
          {:else}
            <span class="muted">worldwide</span>
          {/if}
        {/if}
      </span>
    </div>

    <div class="filter-grid">
      <!-- Step 1: Asset Type -->
      <div class="filter-step" class:completed={customTracker}>
        <div class="step-number">1</div>
        <label class="filter-field">
          <span class="filter-label">What type of asset?</span>
          <span class="filter-hint">Choose the category of energy infrastructure</span>
          <select
            bind:value={customTracker}
            class="filter-select"
            onchange={() => {
              customField = '';
              customOperator = '';
            }}
          >
            <option value="">Select asset type...</option>
            {#each TRACKERS as tracker}
              <option value={tracker}>{tracker}</option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Step 2: Country -->
      <div class="filter-step" class:completed={customGeoFilter} class:disabled={!customTracker}>
        <div class="step-number">2</div>
        <label class="filter-field">
          <span class="filter-label">Where in the world?</span>
          <span class="filter-hint">Narrow down by country, or leave blank for worldwide</span>
          <select bind:value={customGeoFilter} class="filter-select" disabled={!customTracker}>
            <option value="">All countries (worldwide)</option>
            {#each COUNTRIES as country}
              <option value={country}>{country}</option>
            {/each}
          </select>
        </label>
      </div>

      <!-- Step 3: Status -->
      <div class="filter-step" class:completed={customStatusFilter} class:disabled={!customTracker}>
        <div class="step-number">3</div>
        <label class="filter-field">
          <span class="filter-label">What's the project status?</span>
          <span class="filter-hint">Filter by operating, proposed, under construction, etc.</span>
          <select bind:value={customStatusFilter} class="filter-select" disabled={!customTracker}>
            <option value="">All statuses</option>
            {#each STATUS_VALUES as status}
              <option value={status}>{status}</option>
            {/each}
          </select>
        </label>
      </div>
    </div>

    <!-- Advanced field filter (shown when tracker selected) -->
    {#if customTracker}
      <details class="advanced-filter">
        <summary>Advanced: Filter by specific field</summary>
        <div class="advanced-content">
          <div class="form-row">
            <label class="form-field">
              <span class="field-label">Field</span>
              <select bind:value={customField} onchange={() => (customOperator = '')}>
                <option value="">Select field...</option>
                {#each availableFields as field}
                  <option value={field}>{field}</option>
                {/each}
              </select>
            </label>

            {#if customField}
              <label class="form-field">
                <span class="field-label">Condition</span>
                <select bind:value={customOperator}>
                  <option value="">Select...</option>
                  {#each currentOperators as op}
                    <option value={op.value}>{op.label}</option>
                  {/each}
                </select>
              </label>

              {#if customOperator && customOperator !== 'not_empty'}
                <label class="form-field">
                  <span class="field-label">Value</span>
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
          </div>
        </div>
      </details>
    {/if}
  </section>

  <!-- Step 4: Continue -->
  <section class="filter-section continue-step">
    <div class="filter-step" class:completed={canContinue} class:disabled={!canContinue}>
      <div class="step-number">4</div>
      <div class="continue-content">
        <span class="filter-label">Ready to explore?</span>
        {#if !canContinue}
          <span class="filter-hint">Complete the steps above to continue</span>
        {:else}
          <span class="filter-hint"
            >Choose how you want to view ownership data for {customTracker}</span
          >
        {/if}

        <div class="continue-options">
          <button class="continue-btn primary" onclick={showAllOwners} disabled={!canContinue}>
            <span class="btn-icon">→</span>
            Show All Owners
            <span class="btn-sublabel">See every company with stakes</span>
          </button>
          <button
            class="continue-btn secondary"
            onclick={searchSpecificOwners}
            disabled={!canContinue}
          >
            <span class="btn-icon">⌕</span>
            Search Specific Owners
            <span class="btn-sublabel">Find companies from a list</span>
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- Debug panel -->
  {#if customTracker}
    <DebugPanel title="Query Config">
      <div class="debug-meta">
        <span class="debug-label">Tracker:</span>
        <span class="debug-value">{customTracker}</span>
      </div>
      {#if customGeoFilter}
        <div class="debug-meta">
          <span class="debug-label">Geography:</span>
          <span class="debug-value">{customGeoFilter}</span>
        </div>
      {/if}
      {#if customStatusFilter}
        <div class="debug-meta">
          <span class="debug-label">Status:</span>
          <span class="debug-value">{customStatusFilter}</span>
        </div>
      {/if}
      {#if customField && customOperator}
        <div class="debug-meta">
          <span class="debug-label">Filter:</span>
          <span class="debug-value">{customField} {customOperator} {customValue || '(any)'}</span>
        </div>
      {/if}
      <div class="debug-json">
        <span class="debug-label">Class Data JSON:</span>
        <button class="copy-btn" onclick={() => navigator.clipboard.writeText(JSON.stringify(buildClassData(), null, 2))}>
          Copy
        </button>
        <pre class="debug-code">{JSON.stringify(buildClassData(), null, 2)}</pre>
      </div>
    </DebugPanel>
  {/if}
</ScreenerLayout>

<style>
  /* Selection badge - grid for no overlap */
  .selection-badge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-4) var(--space-6);
    background: var(--gem-teal);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-lg);
    min-width: 180px;
    max-width: 340px;
  }

  .selection-badge.has-selection {
    background: var(--gem-primary-blue);
  }

  .selection-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* Quick add cards - explicit 3-column grid */
  .quick-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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

  /* Filter badges - show when preset has built-in filters */
  .filter-badges {
    display: flex;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .filter-badge {
    display: inline-block;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    border-radius: 3px;
    background: var(--color-gray-100);
    color: var(--color-text-tertiary);
  }

  .filter-badge.status {
    background: rgba(29, 73, 97, 0.1);
    color: var(--gem-primary-blue, #1d4961);
  }

  .filter-badge.geo {
    background: rgba(107, 114, 128, 0.1);
    color: #4b5563;
  }

  .quick-card.has-filters:not(.active) {
    border-left: 2px solid var(--gem-teal, #2a7f8f);
    margin-left: calc(-2px - var(--space-4));
    padding-left: calc(var(--space-4) + 2px);
  }

  /* Query builder - clean form design */
  .form-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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

  /* Filter section - wizard-style */
  .filter-section {
    margin-bottom: var(--space-10);
  }

  .filter-section h2 {
    font-size: var(--font-size-md);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin: 0 0 var(--space-6) 0;
    color: var(--color-text-secondary);
    padding-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  /* Live query summary */
  .query-summary {
    padding: var(--space-4) var(--space-5);
    background: var(--color-gray-50);
    margin-bottom: var(--space-8);
    border-left: 3px solid var(--color-gray-200);
    transition: all var(--duration-base) var(--ease-in-out-quad);
  }

  .query-summary.has-selection {
    background: var(--gem-teal-light, #e8f4f4);
    border-left-color: var(--gem-teal, #1d4961);
  }

  .summary-label {
    display: block;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-1);
  }

  .summary-text {
    font-size: var(--font-size-xl);
    color: var(--color-text-primary);
    line-height: var(--line-height-relaxed);
  }

  .summary-text .placeholder {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .summary-text .muted {
    color: var(--color-text-tertiary);
  }

  .summary-text strong {
    font-weight: 600;
    color: var(--gem-primary-blue, #1d4961);
  }

  /* Filter steps */
  .filter-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    margin-bottom: var(--space-6);
  }

  .filter-step {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: var(--space-5);
    align-items: start;
    padding: var(--space-4) 0;
    border-bottom: var(--border-width) solid var(--color-border-light);
    transition: opacity var(--duration-base) var(--ease-in-out-quad);
  }

  .filter-step:last-child {
    border-bottom: none;
  }

  .filter-step.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .filter-step.completed .step-number {
    background: var(--gem-teal, #1d4961);
    color: white;
  }

  .step-number {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--color-gray-100);
    color: var(--color-text-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-body);
    font-weight: 600;
    flex-shrink: 0;
    transition: all var(--duration-base) var(--ease-in-out-quad);
  }

  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .filter-label {
    font-size: var(--font-size-lg);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .filter-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-2);
  }

  .filter-select {
    padding: var(--space-3) 0;
    font-size: var(--font-size-xl);
    border: none;
    border-bottom: 2px solid var(--color-gray-300);
    border-radius: 0;
    background: transparent;
    color: var(--color-text-primary);
    width: 100%;
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='6' viewBox='0 0 12 6'%3E%3Cpath fill='%23999' d='M0 0l6 6 6-6z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0 center;
    padding-right: var(--space-6);
    cursor: pointer;
    transition: border-color var(--duration-base) var(--ease-in-out-quad);
  }

  .filter-select:hover:not(:disabled) {
    border-bottom-color: var(--color-text-tertiary);
  }

  .filter-select:focus {
    outline: none;
    border-bottom-color: var(--gem-teal, #1d4961);
  }

  .filter-select:disabled {
    cursor: not-allowed;
    color: var(--color-text-tertiary);
  }

  /* Advanced filter section */
  .advanced-filter {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: var(--border-width) solid var(--color-border-light);
  }

  .advanced-filter summary {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    cursor: pointer;
    padding: var(--space-2) 0;
    list-style: none;
  }

  .advanced-filter summary::-webkit-details-marker {
    display: none;
  }

  .advanced-filter summary::before {
    content: '+ ';
    font-weight: 500;
  }

  .advanced-filter[open] summary::before {
    content: '− ';
  }

  .advanced-filter summary:hover {
    color: var(--color-text-secondary);
  }

  .advanced-content {
    padding-top: var(--space-4);
  }

  /* Continue step (Step 4) */
  .continue-step {
    margin-top: var(--space-4);
  }

  .continue-step .filter-step {
    border-bottom: none;
    padding-bottom: 0;
  }

  .continue-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .continue-options {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
    margin-top: var(--space-4);
    max-width: 500px;
  }

  .continue-btn {
    display: grid;
    grid-template-rows: auto auto auto;
    gap: var(--space-1);
    align-content: start;
    padding: var(--space-5) var(--space-6);
    font-size: var(--font-size-lg);
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition: all var(--duration-base) var(--ease-in-out-quad);
    min-width: 0; /* Allow shrinking in grid */
    text-align: left;
  }

  .btn-icon {
    font-size: var(--font-size-xl);
    line-height: 1;
    margin-bottom: var(--space-1);
  }

  .btn-sublabel {
    font-size: var(--font-size-body);
    font-weight: 400;
    opacity: 0.8;
  }

  .continue-btn.primary {
    background: var(--gem-teal, #1d4961);
    color: var(--color-white);
    border: none;
  }

  .continue-btn.primary:hover:not(:disabled) {
    background: var(--gem-primary-blue, #153444);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(29, 73, 97, 0.3);
  }

  .continue-btn.secondary {
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    border: 2px solid var(--color-gray-200);
  }

  .continue-btn.secondary:hover:not(:disabled) {
    border-color: var(--gem-teal, #1d4961);
    transform: translateY(-2px);
  }

  .continue-btn:disabled {
    background: var(--color-gray-100);
    color: var(--color-text-tertiary);
    border-color: var(--color-border);
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .continue-btn:disabled .btn-icon {
    opacity: 0.4;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .quick-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .filter-step {
      grid-template-columns: 32px minmax(0, 1fr);
      gap: var(--space-3);
    }
  }

  @media (max-width: 640px) {
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

    .continue-options {
      grid-template-columns: 1fr;
      max-width: 100%;
    }

    .selection-badge {
      max-width: 100%;
    }
  }

  /* Page-specific debug styles */
  .debug-json {
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
