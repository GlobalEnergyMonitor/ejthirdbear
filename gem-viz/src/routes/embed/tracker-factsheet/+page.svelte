<script lang="ts">
  /**
   * Embeddable Tracker Factsheet
   * Two-column metadata explorer for GEM tracker datasets
   *
   * URL params:
   *   tracker - Required. Tracker slug (coal-mine, coal-plant, gas-plant, etc.)
   *   title - Optional. Custom title override
   *   height - Optional. Max height in pixels (default: 500)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';

  // Field descriptions for generating synthetic metadata
  const fieldDescriptions: Record<string, { category: string; definition: string }> = {
    Status: { category: 'Main', definition: 'Current operating status of the asset.' },
    Country: { category: 'Geography', definition: 'Country where the asset is located.' },
    Countries: { category: 'Geography', definition: 'Countries the pipeline passes through.' },
    Owner: { category: 'Ownership', definition: 'Primary owner or operator.' },
    'Immediate Owner Entity Name': {
      category: 'Ownership',
      definition: 'Direct ownership entity name.',
    },
    'Start year': {
      category: 'Age',
      definition: 'Year the asset began or is planned to begin operation.',
    },
    'Capacity (MW)': { category: 'Size', definition: 'Generating capacity in megawatts.' },
    'Capacity (Mtpa)': {
      category: 'Size',
      definition: 'Production capacity in million tonnes per annum.',
    },
    'Design capacity (ttpa)': {
      category: 'Size',
      definition: 'Design production capacity in thousand tonnes per annum.',
    },
    'Nominal crude steel capacity (ttpa)': {
      category: 'Size',
      definition: 'Nominal crude steel production capacity in thousand tonnes per annum.',
    },
    'CapacityBcm/y': {
      category: 'Size',
      definition: 'Pipeline capacity in billion cubic meters per year.',
    },
    'Fuel type': { category: 'Details', definition: 'Type of fuel used by the plant.' },
    Technology: { category: 'Details', definition: 'Technology or process type used.' },
    'Mine type': {
      category: 'Details',
      definition: 'Type of mining operation (surface, underground, etc.).',
    },
    Feedstock: { category: 'Details', definition: 'Primary feedstock material for bioenergy.' },
    'Asset Name': { category: 'Names', definition: 'Name of the asset or project.' },
    '% Share of Ownership': { category: 'Ownership', definition: 'Percentage ownership stake.' },
  };

  // Generate synthetic field metadata from tracker keyFields
  function generateSyntheticFields(meta: TrackerMetadata) {
    const fields: Array<{ columnName: string; category: string; definition: string }> = [];
    for (const fieldName of meta.keyFields) {
      const desc = fieldDescriptions[fieldName];
      fields.push({
        columnName: fieldName,
        category: desc?.category || 'Other',
        definition: desc?.definition || `${fieldName} field.`,
      });
    }
    // Add common fields not already included
    const included = new Set(fields.map((f) => f.columnName));
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

  // Map tracker to metadata CSV file
  const metadataFiles: Record<string, string> = {
    'Coal Mine': `${base}/coal-mine-fields-metadata.csv`,
  };

  // Parse URL parameters
  const trackerSlug = $derived($page.url.searchParams.get('tracker') || '');
  const titleParam = $derived($page.url.searchParams.get('title'));
  const heightParam = $derived($page.url.searchParams.get('height'));

  const tracker = $derived(slugToTrackerName[trackerSlug] || trackerSlug);
  const metadata = $derived(trackerMetadata[trackerSlug] as TrackerMetadata | undefined);
  const metadataFile = $derived(metadataFiles[tracker] || null);
  const maxHeight = $derived(heightParam ? parseInt(heightParam, 10) : 500);
  const title = $derived(titleParam || `${tracker} Fields`);

  // State
  let fieldsMetadata = $state<
    Array<{
      columnName: string;
      category: string;
      definition: string;
      fieldValue?: string | null;
      valueDefinition?: string | null;
    }>
  >([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Load field metadata from CSV, falling back to synthetic fields
  async function loadFieldsMetadata() {
    // If we have a CSV, try to load it
    if (metadataFile) {
      try {
        const response = await fetch(metadataFile);
        if (response.ok) {
          const text = await response.text();
          const lines = text.split('\n');

          fieldsMetadata = lines
            .slice(1)
            .filter((line) => line.trim())
            .map((line) => {
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

              return {
                columnName: values[0] || '',
                category: values[1] || '',
                definition: values[4] || '',
                fieldValue: values[3] || null,
                valueDefinition: values[3] ? values[4] : null,
              };
            });

          loading = false;
          return;
        }
      } catch (err) {
        if (import.meta.env.DEV)
          console.warn('CSV load failed, falling back to synthetic fields:', err);
      }
    }

    // Fall back to synthetic fields from tracker metadata
    if (metadata) {
      fieldsMetadata = generateSyntheticFields(metadata);
    }
    loading = false;
  }

  onMount(() => {
    if (metadata) {
      loadFieldsMetadata();
    } else if (!trackerSlug) {
      error = 'Missing required parameter: tracker';
      loading = false;
    } else {
      error = `Unknown tracker: ${trackerSlug}`;
      loading = false;
    }
  });

  const validTrackers = Object.keys(slugToTrackerName);
</script>

<svelte:head>
  <title>{tracker} Factsheet — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="factsheet-embed" style="--max-height: {maxHeight}px;">
  {#if loading}
    <div class="embed-loading">Loading {tracker} metadata...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !trackerSlug}
        <p class="embed-hint">Example: ?tracker=coal-mine</p>
        <p class="embed-hint">Available trackers: {validTrackers.join(', ')}</p>
      {/if}
    </div>
  {:else if fieldsMetadata.length === 0}
    <div class="embed-error">
      <p>No metadata found for {tracker}</p>
    </div>
  {:else}
    <DatasetFactsheet {tracker} {fieldsMetadata} {title} />
  {/if}
</div>

<style>
  .factsheet-embed {
    width: 100%;
    max-width: 900px;
  }

  .factsheet-embed :global(.factsheet) {
    max-height: var(--max-height);
  }

  .factsheet-embed :global(.dataset-fields),
  .factsheet-embed :global(.dataset-previewer) {
    max-height: calc(var(--max-height) - 40px);
  }

  /* loading/error/hint styles provided by embed layout */

  @media (max-width: 768px) {
    .factsheet-embed :global(.factsheet) {
      max-height: none;
    }

    .factsheet-embed :global(.dataset-fields),
    .factsheet-embed :global(.dataset-previewer) {
      max-height: none;
    }
  }
</style>
