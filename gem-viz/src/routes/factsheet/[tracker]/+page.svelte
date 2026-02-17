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
  import { listAssetsByType } from '$lib/ownership-api';
  import { trackerNameToSlug } from '$lib/data-config/tracker-metadata';

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

  // Load sample assets for project cards via REST API
  async function loadSampleAssets() {
    try {
      const slug = trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-');
      const assets = await listAssetsByType(slug, { limit: 50 });

      // Sort by capacity descending client-side, take top 5
      const sorted = assets
        .filter(a => a.capacity != null)
        .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
        .slice(0, 5);

      sampleAssets = sorted.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status || '',
        capacity: a.capacity ?? undefined,
        capacityUnit: a.capacityUnit || (tracker.includes('Mine') ? 'Mtpa' : 'MW'),
        country: a.country ?? undefined,
        owner: a.ownerName ?? undefined,
        tracker,
      }));
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
  <title>{info.title} Factsheet — Global Energy Monitor</title>
  <meta
    name="description"
    content="Field-level documentation and data distribution analysis for the {info.title} dataset from Global Energy Monitor."
  />
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
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  .embed-container {
    padding: var(--space-5);
    max-width: 900px;
    margin: 0 auto;
  }

  header {
    margin-bottom: var(--space-8);
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
    font-size: var(--font-size-3xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-accent);
  }

  h2 {
    font-size: var(--font-size-2xl);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-accent);
    margin: 0 0 var(--space-2) 0;
  }

  h3 {
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-accent);
    margin: 0 0 var(--space-2) 0;
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 600px;
  }

  .factsheet-section {
    margin-bottom: var(--space-12);
  }

  .sample-assets {
    margin-bottom: var(--space-12);
  }

  .section-desc {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }

  .cards-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .citation {
    background: var(--color-bg-secondary);
    padding: var(--space-5);
    border-radius: 0 var(--radius-xl) var(--radius-xl) var(--radius-xl);
    margin-bottom: var(--space-8);
  }

  .citation p {
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
    margin: 0;
    line-height: var(--leading-relaxed);
  }

  .page-footer {
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-5);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .page-footer a {
    color: var(--color-link);
  }
</style>
