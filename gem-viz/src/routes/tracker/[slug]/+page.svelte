<script lang="ts">
  /**
   * TRACKER DETAIL PAGE
   * Shows field metadata explorer (Observable notebook style)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import { getTrackerFieldValues } from '$lib/duckdb-queries';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';
  import TrackerFactsheet from '$lib/components/TrackerFactsheet.svelte';

  // Get slug from URL
  const slug = $derived($page.params.slug);
  const trackerName = $derived(slugToTrackerName[slug] || slug);
  const metadata = $derived(trackerMetadata[slug] as TrackerMetadata | undefined);

  // Types for field metadata
  interface FieldInfo {
    columnName: string;
    category: string;
    definition: string;
    fieldValue?: string | null;
    valueDefinition?: string | null;
  }

  // State
  let fieldsMetadata = $state<FieldInfo[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Map of metadata CSV files per tracker
  const metadataFiles: Record<string, string> = {
    'coal-mine': '/coal-mine-tracker-fields-info.csv',
    // Add more trackers as CSVs become available
  };

  // Field descriptions for generating synthetic metadata
  const fieldDescriptions: Record<string, { category: string; definition: string }> = {
    Status: { category: 'Main', definition: 'Current operating status of the asset.' },
    Country: { category: 'Geography', definition: 'Country where the asset is located.' },
    Owner: { category: 'Ownership', definition: 'Primary owner or operator.' },
    'Immediate Owner Entity Name': { category: 'Ownership', definition: 'Direct ownership entity name.' },
    'Start year': { category: 'Age', definition: 'Year the asset began or is planned to begin operation.' },
    'Capacity (MW)': { category: 'Size', definition: 'Generating capacity in megawatts.' },
    'Capacity (Mtpa)': { category: 'Size', definition: 'Production capacity in million tonnes per annum.' },
    'Nominal crude steel capacity (ttpa)': { category: 'Size', definition: 'Nominal crude steel production capacity in thousand tonnes per annum.' },
    'Nominal iron capacity (ttpa)': { category: 'Size', definition: 'Nominal iron production capacity in thousand tonnes per annum.' },
    'CapacityBcm/y': { category: 'Size', definition: 'Pipeline capacity in billion cubic meters per year.' },
    'Fuel type': { category: 'Details', definition: 'Type of fuel used by the plant.' },
    Technology: { category: 'Details', definition: 'Technology or process type used.' },
    'Mine type': { category: 'Details', definition: 'Type of mining operation (surface, underground, etc.).' },
    Feedstock: { category: 'Details', definition: 'Primary feedstock material for bioenergy.' },
    'Asset Name': { category: 'Names', definition: 'Name of the asset or project.' },
    'Asset Type': { category: 'Main', definition: 'Type of asset tracked.' },
    '% Share of Ownership': { category: 'Ownership', definition: 'Percentage ownership stake.' },
  };

  // Generate synthetic field metadata from tracker keyFields
  function generateSyntheticFields(meta: TrackerMetadata): FieldInfo[] {
    const fields: FieldInfo[] = [];
    // Start with the tracker's key fields
    for (const fieldName of meta.keyFields) {
      const desc = fieldDescriptions[fieldName];
      fields.push({
        columnName: fieldName,
        category: desc?.category || 'Other',
        definition: desc?.definition || `${fieldName} field.`,
      });
    }
    // Add common fields not already included
    const included = new Set(fields.map(f => f.columnName));
    const extras = ['Country', 'Immediate Owner Entity Name', '% Share of Ownership'];
    for (const fieldName of extras) {
      if (!included.has(fieldName)) {
        const desc = fieldDescriptions[fieldName];
        if (desc) {
          fields.push({
            columnName: fieldName,
            category: desc.category,
            definition: desc.definition,
          });
        }
      }
    }
    return fields;
  }

  // Fetch field distribution from DuckDB
  async function fetchFieldDistribution(
    fieldName: string
  ): Promise<Array<{ value: string; count: number; percentage: number }>> {
    try {
      const result = await getTrackerFieldValues(trackerName, fieldName, 50);
      if (result.success && result.data) {
        return result.data;
      }
    } catch (err) {
      console.warn(`Failed to fetch distribution for ${fieldName}:`, err);
    }
    return [];
  }

  // Load field metadata CSV
  async function loadFieldsMetadata() {
    const file = metadataFiles[slug];
    if (!file) {
      // No CSV — generate from keyFields instead
      if (metadata) {
        fieldsMetadata = generateSyntheticFields(metadata);
      }
      return;
    }

    try {
      const response = await fetch(file);
      if (!response.ok) {
        console.warn(`Failed to load ${file}: ${response.status}`);
        // Fall back to synthetic fields
        if (metadata) fieldsMetadata = generateSyntheticFields(metadata);
        return;
      }
      const text = await response.text();

      // Parse CSV
      const lines = text.split('\n');

      fieldsMetadata = lines
        .slice(1)
        .filter((line) => line.trim())
        .map((line) => {
          // Handle quoted CSV values
          const values: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          const fieldValue = values[3] || null;
          const result = {
            columnName: values[0] || '',
            category: values[1] || '',
            definition: values[4] || '',
            fieldValue,
            valueDefinition: fieldValue ? values[4] : null,
          };
          return result;
        });

    } catch (err) {
      console.error('Failed to load field metadata:', err);
      // Fall back to synthetic fields
      if (metadata) fieldsMetadata = generateSyntheticFields(metadata);
    }
  }

  // Load data - show page fast
  onMount(async () => {
    if (!metadata) {
      error = `Unknown tracker: ${slug}`;
      loading = false;
      return;
    }

    // Show page after short timeout no matter what
    setTimeout(() => {
      if (loading) {
        loading = false;
      }
    }, 300);

    // Load field metadata CSV (falls back to synthetic fields)
    await loadFieldsMetadata();
    loading = false;
  });
</script>

<svelte:head>
  <title>{metadata?.name || trackerName} — Global Energy Monitor</title>
  <meta name="description" content={metadata?.description || `Data overview for ${trackerName}`} />
</svelte:head>

<main>
  <header>
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> /
      <a href={link('tracker')}>Trackers</a> /
      {metadata?.name || trackerName}
    </nav>
    {#if metadata}
      <h1>{metadata.name}</h1>
      <p class="lead">{metadata.description}</p>
    {:else}
      <h1>{trackerName}</h1>
    {/if}
  </header>

  {#if loading}
    <div class="loading">
      <div class="spinner"></div>
      <p>Loading tracker data...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
      <a href={link('tracker')}>Back to all trackers</a>
    </div>
  {:else}
    <!-- Field Explorer (Observable notebook style) -->
    {#if fieldsMetadata.length > 0}
      <TrackerFactsheet
        tracker={trackerName}
        trackerTitle={metadata?.name}
        trackerColor={metadata?.color}
        {fieldsMetadata}
        fetchDistribution={fetchFieldDistribution}
      />
    {:else}
      <div class="no-metadata">
        <p>No field data available for {metadata?.name || trackerName}.</p>
        {#if metadata?.externalLinks?.gemPage}
          <p class="hint">
            <a href={metadata.externalLinks.gemPage} target="_blank" rel="noopener">
              Visit the GEM project page
            </a> for documentation.
          </p>
        {/if}
      </div>
    {/if}

    <!-- Citation -->
    {#if metadata?.citation}
      <footer class="citation">
        <h3>Citation</h3>
        <p>{metadata.citation}</p>
      </footer>
    {/if}
  {/if}
</main>

<style>
  main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-5);
    font-family: var(--font-family-sans);
  }

  header {
    margin-bottom: var(--space-6);
  }

  .breadcrumb {
    font-size: var(--font-size-body);
    margin-bottom: var(--space-3);
  }

  .breadcrumb a {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: var(--font-size-2xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-accent);
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 700px;
  }

  .loading,
  .error {
    text-align: center;
    padding: var(--space-12);
    color: var(--color-text-secondary);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto var(--space-4);
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .error {
    color: var(--color-error, #dc3545);
  }

  .error a {
    display: inline-block;
    margin-top: var(--space-4);
    color: var(--color-link);
  }

  .no-metadata {
    text-align: center;
    padding: var(--space-12);
    background: var(--color-bg-secondary);
    border-radius: var(--radius-lg);
  }

  .no-metadata p {
    margin: 0 0 var(--space-3) 0;
    color: var(--color-text-secondary);
  }

  .no-metadata .hint {
    font-size: var(--font-size-sm);
  }

  .no-metadata a {
    color: var(--color-link);
  }

  .citation {
    margin-top: var(--space-8);
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-border);
  }

  .citation h3 {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }

  .citation p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: var(--leading-relaxed);
  }
</style>
