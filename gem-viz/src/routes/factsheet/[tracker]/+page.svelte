<script lang="ts">
  /**
   * FACTSHEET PAGE
   * Dataset previewer showing field metadata and distributions
   * Based on Observable notebook: https://observablehq.com/d/33281bfae09ac36e@280
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  import { widgetQuery } from '$lib/widgets/widget-utils';

  // Get tracker from URL param
  const trackerParam = $derived($page.params.tracker);

  // Map URL slugs to tracker names
  const trackerMap: Record<string, string> = {
    'coal-mine': 'Coal Mine',
    'coal-plant': 'Coal Plant',
    'gas-plant': 'Gas Plant',
    'steel-plant': 'Steel Plant',
    'iron-mine': 'Iron Mine',
    bioenergy: 'Bioenergy Power',
  };

  // Map tracker to metadata CSV file
  const metadataFiles: Record<string, string> = {
    'Coal Mine': '/coal-mine-fields-metadata.csv',
    // Add more as they become available
  };

  const tracker = $derived(trackerMap[trackerParam] || trackerParam);
  const metadataFile = $derived(metadataFiles[tracker] || null);

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
  let sampleAssets = $state<
    Array<{
      id: string;
      name: string;
      status: string;
      capacity?: number;
      capacityUnit?: string;
      country?: string;
      state?: string;
      owner?: string;
      tracker?: string;
    }>
  >([]);
  let _loading = $state(true);
  let embed = $state(false);

  // Check for embed mode from URL
  $effect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      embed = url.searchParams.get('embed') === 'true';
    }
  });

  // Load field metadata from CSV
  async function loadFieldsMetadata() {
    if (!metadataFile) return;

    try {
      const response = await fetch(metadataFile);
      const text = await response.text();

      // Parse CSV manually (simple parser for this structure)
      const lines = text.split('\n');
      const _headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

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
    } catch (err) {
      console.error('Failed to load field metadata:', err);
    }
  }

  // Load sample assets for project cards
  async function loadSampleAssets() {
    try {
      const result = await widgetQuery<{
        id: string;
        name: string;
        status: string;
        capacity: number;
        country: string;
        state: string;
        owner: string;
      }>(`
        SELECT DISTINCT
          "GEM unit ID" as id,
          "Project" as name,
          "Status" as status,
          "Capacity (Mtpa)" as capacity,
          "Country" as country,
          "State" as state,
          "Owner" as owner
        FROM ownership
        WHERE "Tracker" = '${tracker}'
        ORDER BY capacity DESC NULLS LAST
        LIMIT 5
      `);

      if (result.success && result.data) {
        sampleAssets = result.data.map((row) => ({
          ...row,
          capacityUnit: tracker.includes('Mine') ? 'Mtpa' : 'MW',
          tracker,
        }));
      }
    } catch (err) {
      console.error('Failed to load sample assets:', err);
    }
  }

  onMount(async () => {
    _loading = true;
    await Promise.all([loadFieldsMetadata(), loadSampleAssets()]);
    _loading = false;
  });

  // Tracker info
  const trackerInfo: Record<string, { title: string; description: string; citation: string }> = {
    'Coal Mine': {
      title: 'Global Coal Mine Tracker',
      description:
        'The Global Coal Mine Tracker (GCMT) provides a comprehensive database of coal mines and proposed coal mine projects worldwide.',
      citation:
        'Global Energy Monitor, Global Coal Mine Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    },
    'Coal Plant': {
      title: 'Global Coal Plant Tracker',
      description:
        'The Global Coal Plant Tracker (GCPT) provides a comprehensive database of coal-fired power plants worldwide.',
      citation:
        'Global Energy Monitor, Global Coal Plant Tracker, May 2025 release. Distributed under a Creative Commons Attribution 4.0 International License.',
    },
  };

  const info = $derived(
    trackerInfo[tracker] || {
      title: `${tracker} Tracker`,
      description: `Field metadata and distributions for the ${tracker} tracker.`,
      citation:
        'Global Energy Monitor. Distributed under a Creative Commons Attribution 4.0 International License.',
    }
  );
</script>

<svelte:head>
  <title>{info.title} Factsheet - GEM Viz</title>
</svelte:head>

{#if embed}
  <!-- Standalone embed mode - no chrome -->
  <div class="embed-container">
    <DatasetFactsheet {tracker} {fieldsMetadata} title="{info.title} Fields" />
  </div>
{:else}
  <!-- Full page mode -->
  <main>
    <header>
      <nav class="breadcrumb">
        <a href={link('index')}>Home</a> /
        <a href={link('explore')}>Explore</a> / Factsheet
      </nav>
      <h1>{info.title}</h1>
      <p class="lead">{info.description}</p>
    </header>

    <section class="factsheet-section">
      <DatasetFactsheet {tracker} {fieldsMetadata} title="{info.title} Fields" />
    </section>

    {#if sampleAssets.length > 0}
      <section class="sample-assets">
        <h2>Sample Assets</h2>
        <p class="section-desc">Largest assets by capacity in this tracker</p>
        <div class="cards-grid">
          {#each sampleAssets as asset}
            <ProjectCard {asset} />
          {/each}
        </div>
      </section>
    {/if}

    <section class="citation">
      <h3>Citation</h3>
      <p>{info.citation}</p>
    </section>

    <footer class="page-footer">
      <p>
        <a href="?embed=true" target="_blank" rel="noopener"> View embeddable version </a>
        &middot;
        <a href={link('explore')}>Back to Explore</a>
      </p>
    </footer>
  </main>
{/if}

<style>
  main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: 40px 20px;
    font-family: system-ui, sans-serif;
  }

  .embed-container {
    padding: 20px;
    max-width: 900px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 32px;
  }

  .breadcrumb {
    font-size: 12px;
    margin-bottom: 12px;
  }

  .breadcrumb a {
    color: #333;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: 32px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #004a63;
  }

  h2 {
    font-size: 20px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #004a63;
    margin: 0 0 8px 0;
  }

  h3 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #004a63;
    margin: 0 0 8px 0;
  }

  .lead {
    font-size: 14px;
    color: #666;
    margin: 0;
    max-width: 600px;
  }

  .factsheet-section {
    margin-bottom: 48px;
  }

  .sample-assets {
    margin-bottom: 48px;
  }

  .section-desc {
    font-size: 13px;
    color: #666;
    margin: 0 0 16px 0;
  }

  .cards-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .citation {
    background: #f2f2eb;
    padding: 20px;
    border-radius: 0 14px 14px 14px;
    margin-bottom: 32px;
  }

  .citation p {
    font-size: 13px;
    color: #333;
    margin: 0;
    line-height: 1.5;
  }

  .page-footer {
    border-top: 1px solid #ddd;
    padding-top: 20px;
    font-size: 12px;
    color: #666;
  }

  .page-footer a {
    color: #016b83;
  }
</style>
