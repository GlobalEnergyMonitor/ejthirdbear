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

  // Map URL slugs to tracker names
  const trackerMap: Record<string, string> = {
    'coal-mine': 'Coal Mine',
    'coal-plant': 'Coal Plant',
    'gas-plant': 'Gas Plant',
    'steel-plant': 'Steel Plant',
    'iron-mine': 'Iron Mine',
    'gas-pipeline': 'Gas Pipeline',
    'bioenergy': 'Bioenergy Power',
  };

  // Map tracker to metadata CSV file
  const metadataFiles: Record<string, string> = {
    'Coal Mine': `${base}/coal-mine-fields-metadata.csv`,
    // Add more as they become available
  };

  // Parse URL parameters
  const trackerSlug = $derived($page.url.searchParams.get('tracker') || '');
  const titleParam = $derived($page.url.searchParams.get('title'));
  const heightParam = $derived($page.url.searchParams.get('height'));

  const tracker = $derived(trackerMap[trackerSlug] || trackerSlug);
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

  // Load field metadata from CSV
  async function loadFieldsMetadata() {
    if (!metadataFile) {
      error = `No metadata available for tracker: ${tracker}`;
      loading = false;
      return;
    }

    try {
      const response = await fetch(metadataFile);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.status}`);
      }
      const text = await response.text();

      // Parse CSV manually (handles quoted values)
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

          return {
            columnName: values[0] || '',
            category: values[1] || '',
            definition: values[4] || '',
            fieldValue: values[3] || null,
            valueDefinition: values[3] ? values[4] : null,
          };
        });

      loading = false;
    } catch (err) {
      console.error('Failed to load field metadata:', err);
      error = err instanceof Error ? err.message : 'Failed to load metadata';
      loading = false;
    }
  }

  onMount(() => {
    if (tracker && trackerMap[trackerSlug]) {
      loadFieldsMetadata();
    } else if (!trackerSlug) {
      error = 'Missing required parameter: tracker';
      loading = false;
    } else {
      error = `Unknown tracker: ${trackerSlug}`;
      loading = false;
    }
  });

  const validTrackers = Object.keys(trackerMap);
</script>

<svelte:head>
  <title>{tracker} Factsheet | GEM Viz Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="factsheet-embed" style="--max-height: {maxHeight}px;">
  {#if loading}
    <div class="loading">Loading {tracker} metadata...</div>
  {:else if error}
    <div class="error">
      <p>{error}</p>
      {#if !trackerSlug}
        <p class="hint">Example: ?tracker=coal-mine</p>
        <p class="hint">Available trackers: {validTrackers.join(', ')}</p>
      {/if}
    </div>
  {:else if fieldsMetadata.length === 0}
    <div class="error">
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

  .loading {
    padding: var(--space-8);
    text-align: center;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .error {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  .error p {
    margin: 0 0 var(--space-2) 0;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
