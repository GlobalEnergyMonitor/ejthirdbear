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
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';
  import { listAssetsByType } from '$lib/ownership-api';
  import {
    trackerNameToSlug,
    trackerMetadata,
    slugToTrackerName,
  } from '$lib/data-config/tracker-metadata';
  import { URL_SLUG_TO_TRACKER } from '$lib/data-config/tracker-schema';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // Get tracker from URL param
  const trackerParam = $derived($page.params.tracker);

  // Map URL slugs to tracker names — from canonical tracker-schema.ts
  const trackerMap: Record<string, string> = URL_SLUG_TO_TRACKER;

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
      ownershipShare?: number;
      tracker?: string;
    }>
  >([]);
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
      if (import.meta.env.DEV) console.error('Failed to load field metadata:', err);
    }
  }

  // Load sample assets for project cards via REST API
  async function loadSampleAssets() {
    try {
      const slug = trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-');
      const assets = await listAssetsByType(slug, { limit: 50 });

      // Sort by capacity descending client-side, take top 5
      const sorted = assets
        .filter((a) => a.capacity != null)
        .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
        .slice(0, 5);

      const primaryOwner = (idx: number) => sorted[idx]?.owners?.[0];
      sampleAssets = sorted.map((a, i) => ({
        id: a.id,
        name: a.name,
        status: a.status || '',
        capacity: a.capacity ?? undefined,
        capacityUnit: a.capacityUnit || (tracker.includes('Mine') ? 'Mtpa' : 'MW'),
        country: a.country ?? undefined,
        state:
          (a.raw?.['Subnational unit (province, state)'] as string | undefined) ??
          (a.raw?.['State'] as string | undefined) ??
          undefined,
        owner: a.ownerName ?? primaryOwner(i)?.name ?? undefined,
        ownershipShare: primaryOwner(i)?.ownershipShare ?? undefined,
        tracker,
      }));
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load sample assets:', err);
    }
  }

  onMount(() => {
    Promise.all([loadFieldsMetadata(), loadSampleAssets()]);
  });

  // Tracker info — derived from tracker-metadata.ts (enriched by API at startup)
  const trackerSlug = $derived(trackerNameToSlug[tracker] || trackerParam);
  const meta = $derived(trackerMetadata[trackerSlug]);
  const info = $derived({
    title: meta ? `Global ${meta.name} Tracker` : `${tracker} Tracker`,
    description:
      meta?.description || `Field metadata and distributions for the ${tracker} tracker.`,
    citation:
      meta?.citation ||
      'Global Energy Monitor. Distributed under a Creative Commons Attribution 4.0 International License.',
  });
</script>

<svelte:head>
  <title>{info.title} Factsheet — Global Energy Monitor</title>
  <meta
    name="description"
    content="Field-level documentation and data distribution analysis for the {info.title} dataset from Global Energy Monitor."
  />
  <SeoMeta
    title="{info.title} Factsheet — Global Energy Monitor"
    description="Field-level documentation and data distribution analysis for the {info.title} dataset from Global Energy Monitor."
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
    <PageHeader
      breadcrumbs={[
        { label: 'Home', href: link('index') },
        { label: 'Explore', href: link('explore') },
        { label: 'Factsheet' },
      ]}
      title={info.title}
      lead={info.description}
    />

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

    <footer class="page-back-footer">
      <p>
        <a href="?embed=true" target="_blank" rel="noopener">View embeddable version</a>
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
</style>
