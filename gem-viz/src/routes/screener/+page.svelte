<script>
  /**
   * ASSET CLASS SCREENER - Step 1: Select Asset Class
   * Presets fill the query form. User can customize. One asset class at a time.
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';
  import { allAssetClasses } from '$lib/data-config/asset-classes';
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';

  // Track which preset is active (for highlighting)
  let activePresetId = $state(null);

  /**
   * @typedef {Object} QuickAddClass
   * @property {string} id
   * @property {string} name
   * @property {string} description
   * @property {string} tracker
   * @property {{field: string, operator: string, value?: string|number}} filters
   * @property {string} [subLabel]
   */

  /**
   * Transform asset class definitions into quick-add card format.
   * Uses the canonical definitions from asset-classes.ts plus some additional
   * status-specific variants for common use cases.
   * @type {QuickAddClass[]}
   */
  const quickAddClasses = [
    // Canonical asset classes from asset-classes.ts
    ...allAssetClasses.map((ac) => ({
      id: ac.name.toLowerCase().replace(/\s+/g, '-'),
      name: ac.name,
      description: ac.description,
      tracker: ac.applicableTrackers[0], // Primary tracker
      filters: {
        // Convert matcher logic to filter representation
        field: ac.relevantFields.identifyingFields[0],
        operator: ac.name.includes('Coal-Based')
          ? 'contains'
          : ac.name.includes('Captive')
            ? 'not_empty'
            : ac.name.includes('Deep')
              ? '>='
              : 'not_empty',
        value: ac.name.includes('Coal-Based') ? 'BF' : ac.name.includes('Deep') ? 200 : undefined,
      },
    })),
    // Additional status variants for common queries
    {
      id: 'retiring-coal',
      name: 'Retiring Coal',
      description: 'Coal plants announced for retirement.',
      tracker: 'Coal Plant',
      filters: { field: 'Status', operator: '=', value: 'retired' },
    },
    {
      id: 'pipeline-construction',
      name: 'Gas Pipeline',
      description: 'Gas pipelines under construction.',
      tracker: 'Gas Pipeline',
      filters: { field: 'Status', operator: '=', value: 'construction' },
      subLabel: 'construction',
    },
  ];

  // Custom query builder state
  let customTracker = $state('');
  let customField = $state('');
  let customOperator = $state('');
  let customValue = $state('');
  let customGeoFilter = $state('');
  let customStatusFilter = $state('');
  let showGeoFilter = $state(false);
  let showStatusFilter = $state(false);

  // Tracker options (from parquet data)
  const trackerOptions = [
    'Bioenergy Power',
    'Coal Mine',
    'Coal Plant',
    'Gas Pipeline',
    'Gas Plant',
    'Iron Mine',
    'Steel Plant',
  ];

  // Field options per tracker (based on actual parquet schema)
  const fieldsByTracker = {
    'Coal Plant': ['Capacity (MW)', 'Status', 'Owner Headquarters Country'],
    'Gas Plant': ['Capacity (MW)', 'Status', 'Owner Headquarters Country'],
    'Coal Mine': ['Capacity (Mtpa)', 'Status', 'Owner Headquarters Country'],
    'Steel Plant': ['Nominal crude steel capacity (ttpa)', 'Status', 'Owner Headquarters Country'],
    'Iron Mine': ['Nominal iron capacity (ttpa)', 'Status', 'Owner Headquarters Country'],
    'Gas Pipeline': ['CapacityBcm/y', 'Status', 'Owner Headquarters Country'],
    'Bioenergy Power': ['Capacity (MW)', 'Status', 'Owner Headquarters Country'],
  };

  // Operators by field type
  const numericOperators = [
    { value: '>', label: 'greater than' },
    { value: '<', label: 'less than' },
    { value: '>=', label: 'at least' },
    { value: '<=', label: 'at most' },
    { value: '=', label: 'equals' },
  ];

  const textOperators = [
    { value: '=', label: 'is exactly' },
    { value: 'contains', label: 'contains' },
    { value: 'in', label: 'is one of' },
    { value: 'not_empty', label: 'has a value' },
  ];

  // Status values (from parquet - normalized to lowercase)
  const statusOptions = [
    'announced',
    'cancelled',
    'construction',
    'idle',
    'mothballed',
    'operating',
    'permitted',
    'pre-construction',
    'pre-permit',
    'proposed',
    'retired',
    'shelved',
  ];

  // Countries (from parquet)
  const countryOptions = [
    'Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria',
    'Azerbaijan', 'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Bermuda',
    'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
    'Cambodia', 'Cameroon', 'Canada', 'Cayman Islands', 'Chile', 'China', 'Colombia', 'Congo',
    'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Dominican Republic',
    'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Finland', 'France', 'Gabon',
    'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala', 'Guinea', 'Honduras', 'Hong Kong',
    'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
    'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan',
    'Laos', 'Latvia', 'Lebanon', 'Liberia', 'Libya', 'Lithuania', 'Luxembourg', 'Macau',
    'Madagascar', 'Malawi', 'Malaysia', 'Mali', 'Malta', 'Mauritius', 'Mexico', 'Moldova',
    'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nepal',
    'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia',
    'Norway', 'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
    'Poland', 'Portugal', 'Puerto Rico', 'Qatar', 'Romania', 'Russia', 'Saudi Arabia', 'Senegal',
    'Serbia', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea',
    'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan',
    'Tanzania', 'Thailand', 'Timor-Leste', 'Trinidad and Tobago', 'Tunisia', 'Turkmenistan',
    'Türkiye', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
    'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
  ];

  // Check if field has enum values
  function isEnumField(field) {
    return field === 'Status' || field === 'Owner Headquarters Country';
  }

  // Get enum options for a field
  function getEnumOptions(field) {
    if (field === 'Status') return statusOptions;
    if (field === 'Owner Headquarters Country') return countryOptions;
    return [];
  }

  // Determine if field is numeric
  function isNumericField(field) {
    return (
      field.includes('(MW)') ||
      field.includes('(m)') ||
      field.includes('(Mt') ||
      field.includes('(Bcm') ||
      field.includes('(ttpa)') ||
      field.includes('Year')
    );
  }

  // Get operators for current field
  const currentOperators = $derived(
    customField ? (isNumericField(customField) ? numericOperators : textOperators) : []
  );

  // Get available fields for selected tracker
  const availableFields = $derived(customTracker ? fieldsByTracker[customTracker] || [] : []);

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
      const opLabel = [...numericOperators, ...textOperators].find(o => o.value === customOperator)?.label || customOperator;
      desc += ` where ${customField} ${opLabel}`;
      if (customValue && customOperator !== 'not_empty') desc += ` ${customValue}`;
    }
    if (customGeoFilter) desc += ` in ${customGeoFilter}`;
    if (customStatusFilter) desc += ` (${customStatusFilter})`;
    return desc;
  });

  // Continue to owners step with current form values
  function continueToOwners() {
    const classData = [{
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
    }];
    const basePath = link('screener/owners').replace(/\/$/, '');
    goto(`${basePath}?classes=${encodeURIComponent(JSON.stringify(classData))}`);
  }

  // Check if preset is active
  function isActivePreset(preset) {
    return activePresetId === preset.id;
  }
</script>

<svelte:head>
  <title>Asset Class Screener — GEM Viz</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <ScreenerStepNav currentStep={1} />

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Asset Class Screener</h1>
        <p class="subtitle">
          Choose a preset or build a custom query. Customize the filters below, then continue.
        </p>
      </div>

      <!-- Current selection summary -->
      {#if customTracker}
        <div class="current-config">
          <div class="config-label">Current selection</div>
          <div class="config-value">{currentConfigDescription()}</div>
          <button class="clear-btn" onclick={clearForm}>Clear</button>
        </div>
      {/if}
    </header>

    <!-- Presets section -->
    <section class="quick-add">
      <h2>
        Presets
        <span class="refine-hint">
          Click to load settings, then customize below
        </span>
      </h2>

      <div class="quick-cards">
        {#each quickAddClasses as card}
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
      <h2>Create Custom Asset Class</h2>

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
              {#each trackerOptions as tracker}
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
                      type={isNumericField(customField) ? 'number' : 'text'}
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
                    {#each countryOptions as country}
                      <option value={country}>{country}</option>
                    {/each}
                  </select>
                  <button
                    class="remove-filter"
                    onclick={() => {
                      showGeoFilter = false;
                      customGeoFilter = '';
                    }}>×</button>
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
                    {#each statusOptions as status}
                      <option value={status}>{status}</option>
                    {/each}
                  </select>
                  <button
                    class="remove-filter"
                    onclick={() => {
                      showStatusFilter = false;
                      customStatusFilter = '';
                    }}>×</button>
                </div>
              </label>
            {/if}
          </div>
        </div>

      </div>
    </section>

    <!-- Continue button -->
    <div class="continue-section">
      <button
        class="continue-btn"
        onclick={continueToOwners}
        disabled={!canContinue}
      >
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
    background: #fff;
  }

  .screener-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 32px 80px;
  }

  /* Header - typography hierarchy */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 48px;
    margin-bottom: 48px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: 28px;
    font-weight: 400;
    margin: 0 0 12px 0;
    color: #111;
    letter-spacing: -0.01em;
  }

  .subtitle {
    font-size: 14px;
    color: #666;
    margin: 0;
    line-height: 1.6;
    max-width: 480px;
  }

  /* Current config summary */
  .current-config {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 16px;
    background: #f8fafb;
    border-left: 2px solid #1a5f7a;
  }

  .config-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
  }

  .config-value {
    font-size: 14px;
    color: #333;
    flex: 1;
  }

  .clear-btn {
    font-size: 11px;
    color: #888;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
  }

  .clear-btn:hover {
    color: #333;
  }

  .selected-list {
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .selected-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-size: 13px;
    line-height: 1.4;
    padding-bottom: 8px;
    border-bottom: 1px solid #eee;
  }

  .selected-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  .selected-name {
    font-weight: 500;
    color: #111;
  }

  .selected-desc {
    flex: 1;
    color: #888;
    font-size: 12px;
  }

  .remove-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #ccc;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #999;
  }

  /* Sections - whitespace instead of boxes */
  section {
    margin-bottom: 48px;
    padding: 0;
  }

  section h2 {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin: 0 0 20px 0;
    color: #666;
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e5e5;
  }

  .refine-hint {
    font-size: 12px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #888;
  }

  .refine-hint strong {
    color: #555;
    font-weight: 500;
  }

  /* Quick add cards - minimal, typography-driven */
  .quick-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px 32px;
  }

  .quick-card {
    position: relative;
    padding: 0;
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
  }

  .quick-card:hover .card-name {
    color: #111;
  }

  /* Active preset state */
  .quick-card.active {
    background: #f0f7fa;
    border-left: 2px solid #1a5f7a;
    margin-left: -2px;
  }

  .quick-card.active .card-name {
    color: #1a5f7a;
  }

  .card-active-indicator {
    position: absolute;
    top: 4px;
    right: 8px;
    font-size: 8px;
    color: #1a5f7a;
  }

  .card-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }

  .card-name {
    font-size: 14px;
    font-weight: 500;
    color: #555;
    transition: color 0.1s;
  }

  .card-sublabel {
    font-size: 11px;
    color: #aaa;
    font-style: italic;
  }

  .card-description {
    font-size: 12px;
    color: #888;
    margin: 0;
    line-height: 1.5;
  }

  .card-check {
    position: absolute;
    top: 0;
    right: 0;
    font-size: 12px;
    color: #1a5f7a;
  }

  /* Query builder - clean form design */
  .builder-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .form-row {
    display: flex;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
    font-weight: 500;
  }

  .required {
    color: #c00;
  }

  .optional {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    color: #aaa;
  }

  .form-field select,
  .form-field input {
    padding: 8px 10px;
    font-size: 13px;
    border: none;
    border-bottom: 1px solid #ddd;
    border-radius: 0;
    background: transparent;
    min-width: 160px;
    color: #333;
  }

  .form-field select:focus,
  .form-field input:focus {
    outline: none;
    border-bottom-color: #333;
  }

  .form-field select {
    -webkit-appearance: none;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='4' viewBox='0 0 8 4'%3E%3Cpath fill='%23999' d='M0 0l4 4 4-4z'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 4px center;
    padding-right: 20px;
  }

  .operator-field select {
    min-width: 120px;
  }

  .value-field input {
    min-width: 100px;
  }

  .builder-hint {
    font-size: 12px;
    color: #888;
    line-height: 1.6;
    padding-left: 12px;
    border-left: 1px solid #ddd;
    margin-left: 4px;
  }

  .optional-filters {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 20px;
    border-top: 1px solid #eee;
    margin-top: 8px;
  }

  .optional-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #aaa;
    margin-bottom: -8px;
  }

  .filter-row {
    display: flex;
    align-items: flex-end;
  }

  .filter-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-filter-btn {
    padding: 0;
    font-size: 12px;
    background: none;
    border: none;
    cursor: pointer;
    color: #888;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .add-filter-btn:hover {
    color: #333;
  }

  .inline-field {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .inline-field select,
  .inline-field input {
    min-width: 160px;
  }

  .remove-filter {
    background: none;
    border: none;
    font-size: 14px;
    color: #ccc;
    cursor: pointer;
    padding: 0;
    margin-left: 4px;
  }

  .remove-filter:hover {
    color: #999;
  }

  .add-class-btn {
    align-self: flex-start;
    padding: 0;
    font-size: 13px;
    font-weight: 400;
    background: none;
    color: #333;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    margin-top: 8px;
  }

  .add-class-btn:hover:not(:disabled) {
    color: #000;
  }

  .add-class-btn:disabled {
    color: #ccc;
    cursor: not-allowed;
    text-decoration: none;
  }

  /* Continue section - prominent but simple */
  .continue-section {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding-top: 32px;
    border-top: 1px solid #e5e5e5;
  }

  .continue-hint {
    font-size: 12px;
    color: #999;
    margin: 0;
  }

  .continue-btn {
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 500;
    background: #333;
    color: #fff;
    border: none;
    cursor: pointer;
    letter-spacing: 0.02em;
  }

  .continue-btn:hover:not(:disabled) {
    background: #111;
  }

  .continue-btn:disabled {
    background: #e5e5e5;
    color: #999;
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
      padding: 32px 20px 60px;
    }

    .screener-header {
      flex-direction: column;
      gap: 32px;
    }

    .selected-panel {
      width: 100%;
    }

    .quick-cards {
      grid-template-columns: 1fr;
      gap: 16px;
    }

    .quick-card.selected::before {
      left: -8px;
    }

    .form-row {
      flex-direction: column;
      align-items: stretch;
    }

    .form-field select,
    .form-field input {
      width: 100%;
    }
  }
</style>
