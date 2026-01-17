<script>
  /**
   * ASSET-CLASS SCREENER
   * Evaluate companies' ownership stakes in classes of fossil fuel assets.
   * Single-page layout with quick-add cards and custom query builder.
   */

  import { link } from '$lib/links';
  import { goto } from '$app/navigation';

  // Selected asset classes
  let selectedClasses = $state([]);
  let showSelectedPanel = $state(false);

  // Quick add asset class cards
  const quickAddClasses = [
    {
      id: 'captive-coal',
      name: 'Captive Coal',
      description: 'Coal plants/units whose power goes to a specific private user.',
      tracker: 'Coal Plant',
      filters: { field: 'Captive', operator: 'not_empty' },
    },
    {
      id: 'deep-water-oil',
      name: 'Deep Water Oil',
      description: 'Offshore oil-extraction in water depths of at least 200m.',
      tracker: 'Oil & NGL Pipeline',
      filters: { field: 'Water Depth (m)', operator: '>=', value: 200 },
    },
    {
      id: 'coal-steel-bf',
      name: 'Coal Base Steel',
      description: 'Blast furnace steel plants.',
      tracker: 'Steel Plant',
      filters: { field: 'Main production equipment', operator: 'contains', value: 'BF' },
    },
    {
      id: 'coal-steel-operating',
      name: 'Coal Base Steel',
      description: 'Operating blast furnace steel plants.',
      tracker: 'Steel Plant',
      filters: { field: 'Status', operator: '=', value: 'operating' },
      subLabel: 'operating',
    },
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

  // Tracker options
  const trackerOptions = [
    'Coal Plant',
    'Gas Plant',
    'Coal Mine',
    'Steel Plant',
    'Iron Mine',
    'Oil & NGL Pipeline',
    'Gas Pipeline',
    'Bioenergy Power',
  ];

  // Field options per tracker (simplified - real implementation would fetch from schema)
  const fieldsByTracker = {
    'Coal Plant': ['Capacity (MW)', 'Status', 'Captive', 'Start Year', 'Country'],
    'Gas Plant': ['Capacity (MW)', 'Status', 'Start Year', 'Country'],
    'Coal Mine': ['Capacity (Mtpa)', 'Status', 'Mine Type', 'Country'],
    'Steel Plant': ['Main production equipment', 'Status', 'Capacity (ttpa)', 'Country'],
    'Iron Mine': ['Capacity (Mt)', 'Status', 'Country'],
    'Oil & NGL Pipeline': ['Water Depth (m)', 'Status', 'Capacity', 'Country'],
    'Gas Pipeline': ['Status', 'Capacity (Bcm/y)', 'Country'],
    'Bioenergy Power': ['Capacity (MW)', 'Status', 'Feedstock', 'Country'],
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

  const statusOptions = [
    'operating',
    'construction',
    'permitted',
    'pre-permit',
    'announced',
    'retired',
    'cancelled',
    'shelved',
    'mothballed',
  ];

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

  // Toggle quick-add class
  function toggleQuickClass(classItem) {
    const exists = selectedClasses.find((c) => c.id === classItem.id);
    if (exists) {
      selectedClasses = selectedClasses.filter((c) => c.id !== classItem.id);
    } else {
      selectedClasses = [...selectedClasses, classItem];
    }
  }

  // Add custom class
  function addCustomClass() {
    if (!customTracker || !customField || !customOperator) return;

    const customClass = {
      id: `custom-${Date.now()}`,
      name: `${customTracker}`,
      description: `${customField} ${customOperator} ${customValue || '(any)'}`,
      tracker: customTracker,
      filters: {
        field: customField,
        operator: customOperator,
        value: customValue,
      },
      isCustom: true,
    };

    // Add geo/status filters if present
    if (customGeoFilter) {
      customClass.filters.geography = customGeoFilter;
      customClass.description += ` in ${customGeoFilter}`;
    }
    if (customStatusFilter) {
      customClass.filters.status = customStatusFilter;
      customClass.description += ` (${customStatusFilter})`;
    }

    selectedClasses = [...selectedClasses, customClass];

    // Reset form
    customTracker = '';
    customField = '';
    customOperator = '';
    customValue = '';
    customGeoFilter = '';
    customStatusFilter = '';
    showGeoFilter = false;
    showStatusFilter = false;
  }

  // Remove selected class
  function removeClass(classItem) {
    selectedClasses = selectedClasses.filter((c) => c.id !== classItem.id);
  }

  // Continue to owners step
  function continueToOwners() {
    // Pass full class data as JSON for the owners page to display
    const classData = selectedClasses.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      tracker: c.tracker,
      filters: c.filters,
    }));
    // Build URL without trailing slash to preserve query params
    const basePath = link('screener/owners').replace(/\/$/, '');
    goto(`${basePath}?classes=${encodeURIComponent(JSON.stringify(classData))}`);
  }

  // Check if class is selected
  function isSelected(classItem) {
    return selectedClasses.some((c) => c.id === classItem.id);
  }
</script>

<svelte:head>
  <title>Asset-Class Screener — GEM Viz</title>
</svelte:head>

<main>
  <div class="screener-layout">
    <!-- Step indicator -->
    <nav class="step-nav">
      <div class="step active">
        <span class="step-num">1</span>
        <span class="step-label">Asset Classes</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">2</span>
        <span class="step-label">Find Owners</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">3</span>
        <span class="step-label">Results</span>
      </div>
      <div class="step-line"></div>
      <div class="step">
        <span class="step-num">4</span>
        <span class="step-label">Visualize</span>
      </div>
    </nav>

    <!-- Header -->
    <header class="screener-header">
      <div class="header-content">
        <h1>Asset-Class Screener</h1>
        <p class="subtitle">
          Evaluate companies' ownership stakes in classes of fossil fuel assets. Start by selecting
          asset-classes below, or building your own query.
        </p>
      </div>

      <!-- Selected classes panel -->
      <div class="selected-panel" class:expanded={showSelectedPanel}>
        <button class="selected-toggle" onclick={() => (showSelectedPanel = !showSelectedPanel)}>
          <span class="toggle-icon">{showSelectedPanel ? '▼' : '▶'}</span>
          View selected asset-classes
        </button>
        <div class="selected-count">
          {#if selectedClasses.length === 0}
            None selected yet
          {:else}
            {selectedClasses.length} selected
          {/if}
        </div>

        {#if showSelectedPanel && selectedClasses.length > 0}
          <div class="selected-list">
            {#each selectedClasses as classItem}
              <div class="selected-item">
                <span class="selected-name">{classItem.name}</span>
                <span class="selected-desc">{classItem.description}</span>
                <button class="remove-btn" onclick={() => removeClass(classItem)}>×</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </header>

    <!-- Quick add section -->
    <section class="quick-add">
      <h2>
        Quick add classes of assets
        <span class="refine-hint">
          Refine by <strong>geography</strong> or <strong>status</strong> (operating, proposed, etc)
          after making selections
        </span>
      </h2>

      <div class="quick-cards">
        {#each quickAddClasses as card}
          <button
            class="quick-card"
            class:selected={isSelected(card)}
            onclick={() => toggleQuickClass(card)}
          >
            <div class="card-header">
              <span class="card-name">{card.name}</span>
              {#if card.subLabel}
                <span class="card-sublabel">{card.subLabel}</span>
              {/if}
            </div>
            <p class="card-description">{card.description}</p>
            {#if isSelected(card)}
              <div class="card-check">✓</div>
            {/if}
          </button>
        {/each}
      </div>
    </section>

    <!-- Custom query builder -->
    <section class="query-builder">
      <h2>Build your own asset-class query</h2>

      <div class="builder-form">
        <div class="form-row main-row">
          <label class="form-field">
            <span class="field-label">Asset Type:</span>
            <select
              bind:value={customTracker}
              onchange={() => {
                customField = '';
                customOperator = '';
              }}
            >
              <option value="">[tracker dropdown]</option>
              {#each trackerOptions as tracker}
                <option value={tracker}>{tracker}</option>
              {/each}
            </select>
          </label>

          {#if customTracker}
            <label class="form-field">
              <span class="field-label">With</span>
              <select bind:value={customField} onchange={() => (customOperator = '')}>
                <option value="">[field dropdown]</option>
                {#each availableFields as field}
                  <option value={field}>{field}</option>
                {/each}
              </select>
            </label>

            {#if customField}
              <label class="form-field operator-field">
                <select bind:value={customOperator}>
                  <option value="">...</option>
                  {#each currentOperators as op}
                    <option value={op.value}>{op.label}</option>
                  {/each}
                </select>
              </label>

              {#if customOperator && customOperator !== 'not_empty'}
                <label class="form-field value-field">
                  <input
                    type={isNumericField(customField) ? 'number' : 'text'}
                    bind:value={customValue}
                    placeholder="value"
                  />
                </label>
              {/if}
            {/if}
          {/if}
        </div>

        {#if customTracker}
          <div class="builder-note">
            Note: Pick a tracker to see fields available for querying. Pick a field to see filtering
            options (operator choices &lt;, &gt;, = for numeric field, or =, is one of a list, or
            contains for character fields)
          </div>
        {/if}

        <!-- Additional filters -->
        <div class="additional-filters">
          {#if !showGeoFilter}
            <button class="add-filter-btn" onclick={() => (showGeoFilter = true)}>
              + Filter by geography
            </button>
          {:else}
            <label class="form-field inline-field">
              <span class="field-label">Geography:</span>
              <input
                type="text"
                bind:value={customGeoFilter}
                placeholder="e.g., China, India, Southeast Asia"
              />
              <button
                class="remove-filter"
                onclick={() => {
                  showGeoFilter = false;
                  customGeoFilter = '';
                }}>×</button
              >
            </label>
          {/if}

          {#if !showStatusFilter}
            <button class="add-filter-btn" onclick={() => (showStatusFilter = true)}>
              + Filter by status
            </button>
          {:else}
            <label class="form-field inline-field">
              <span class="field-label">Status:</span>
              <select bind:value={customStatusFilter}>
                <option value="">Any status</option>
                {#each statusOptions as status}
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
            </label>
          {/if}
        </div>

        <button
          class="add-class-btn"
          onclick={addCustomClass}
          disabled={!customTracker || !customField || !customOperator}
        >
          Add asset class
        </button>
      </div>
    </section>

    <!-- Continue button -->
    <div class="continue-section">
      <button
        class="continue-btn"
        onclick={continueToOwners}
        disabled={selectedClasses.length === 0}
      >
        Continue to Owners
      </button>
    </div>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    background: #f8f9fa;
  }

  .screener-layout {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px;
  }

  /* Step navigation */
  .step-nav {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 32px;
    padding-bottom: 24px;
    border-bottom: 1px solid #e0e0e0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    opacity: 0.4;
  }

  .step.active {
    opacity: 1;
  }

  .step-num {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 2px solid #1a5f7a;
    border-radius: 50%;
    font-size: 13px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .step.active .step-num {
    background: #1a5f7a;
    color: white;
  }

  .step-label {
    font-size: 13px;
    font-weight: 500;
    color: #333;
  }

  .step-line {
    width: 40px;
    height: 2px;
    background: #ddd;
  }

  /* Header */
  .screener-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 32px;
  }

  .header-content {
    flex: 1;
  }

  h1 {
    font-size: 32px;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: #1a1a2e;
  }

  .subtitle {
    font-size: 15px;
    color: #666;
    margin: 0;
    line-height: 1.5;
  }

  /* Selected panel */
  .selected-panel {
    background: #e8f4f8;
    border: 1px solid #b8d4e3;
    border-radius: 8px;
    padding: 12px 16px;
    min-width: 260px;
  }

  .selected-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    font-size: 14px;
    font-weight: 600;
    color: #1a5f7a;
    cursor: pointer;
    padding: 0;
  }

  .toggle-icon {
    font-size: 10px;
  }

  .selected-count {
    font-size: 13px;
    color: #1a5f7a;
    margin-top: 4px;
    opacity: 0.8;
  }

  .selected-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .selected-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: white;
    border-radius: 4px;
    font-size: 12px;
  }

  .selected-name {
    font-weight: 600;
  }

  .selected-desc {
    flex: 1;
    color: #666;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .remove-btn {
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .remove-btn:hover {
    color: #c00;
  }

  /* Sections */
  section {
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  section h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 16px 0;
    color: #1a1a2e;
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .refine-hint {
    font-size: 13px;
    font-weight: 400;
    color: #666;
  }

  .refine-hint strong {
    color: #1a5f7a;
  }

  /* Quick add cards */
  .quick-cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .quick-card {
    position: relative;
    padding: 16px;
    background: white;
    border: 2px solid #e0e0e0;
    border-radius: 6px;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .quick-card:hover {
    border-color: #1a5f7a;
  }

  .quick-card.selected {
    border-color: #1a5f7a;
    background: #f0f7fa;
  }

  .card-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 6px;
  }

  .card-name {
    font-size: 15px;
    font-weight: 600;
    color: #1a5f7a;
  }

  .card-sublabel {
    font-size: 12px;
    color: #888;
  }

  .card-description {
    font-size: 13px;
    color: #555;
    margin: 0;
    line-height: 1.4;
  }

  .card-check {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    background: #1a5f7a;
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }

  /* Query builder */
  .builder-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-row {
    display: flex;
    align-items: flex-end;
    gap: 12px;
    flex-wrap: wrap;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .field-label {
    font-size: 13px;
    color: #555;
  }

  .form-field select,
  .form-field input {
    padding: 8px 12px;
    font-size: 14px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: white;
    min-width: 160px;
  }

  .form-field select:focus,
  .form-field input:focus {
    outline: none;
    border-color: #1a5f7a;
  }

  .operator-field select {
    min-width: 120px;
  }

  .value-field input {
    min-width: 100px;
  }

  .builder-note {
    font-size: 12px;
    color: #c44;
    font-style: italic;
    line-height: 1.4;
  }

  .additional-filters {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
  }

  .add-filter-btn {
    padding: 6px 12px;
    font-size: 13px;
    background: #f5f5f5;
    border: 1px dashed #ccc;
    border-radius: 4px;
    cursor: pointer;
    color: #555;
  }

  .add-filter-btn:hover {
    background: #eee;
    border-color: #999;
  }

  .inline-field {
    flex-direction: row;
    align-items: center;
    background: #f9f9f9;
    padding: 8px 12px;
    border-radius: 4px;
  }

  .inline-field select,
  .inline-field input {
    min-width: 180px;
  }

  .remove-filter {
    background: none;
    border: none;
    font-size: 18px;
    color: #999;
    cursor: pointer;
    padding: 0 4px;
    margin-left: 8px;
  }

  .remove-filter:hover {
    color: #c00;
  }

  .add-class-btn {
    align-self: flex-start;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 500;
    background: #1a5f7a;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .add-class-btn:hover:not(:disabled) {
    background: #145266;
  }

  .add-class-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  /* Continue section */
  .continue-section {
    display: flex;
    justify-content: center;
    padding: 24px 0;
  }

  .continue-btn {
    padding: 14px 32px;
    font-size: 16px;
    font-weight: 600;
    background: #1a5f7a;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .continue-btn:hover:not(:disabled) {
    background: #145266;
  }

  .continue-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 900px) {
    .quick-cards {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 640px) {
    .screener-header {
      flex-direction: column;
    }

    .selected-panel {
      width: 100%;
    }

    .quick-cards {
      grid-template-columns: 1fr;
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
