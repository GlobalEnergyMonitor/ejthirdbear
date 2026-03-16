<script lang="ts">
  /**
   * TRACKER FIELDGUIDE PAGE
   * Field-level documentation and data distribution explorer per tracker.
   * Rebranded from "Factsheet" — fully native Svelte, no Observable dependency.
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';
  import { listAssetsByType } from '$lib/ownership-api';
  import {
    slugToTrackerName,
    trackerNameToSlug,
    trackerMetadata,
  } from '$lib/data-config/tracker-metadata';
  import { getTrackerColor } from '$lib/design-tokens';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // URL param
  const trackerParam = $derived($page.params.tracker);

  // Resolve tracker name from slug
  const tracker = $derived(slugToTrackerName[trackerParam] || trackerParam);
  const meta = $derived(trackerMetadata[trackerParam]);
  const color = $derived(getTrackerColor(tracker));

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

  // Generate field metadata from tracker keyFields config
  function generateFieldsMetadata() {
    if (!meta) return [];
    const fields: Array<{ columnName: string; category: string; definition: string }> = [];
    for (const fieldName of meta.keyFields) {
      const desc = fieldDescriptions[fieldName];
      fields.push({
        columnName: fieldName,
        category: desc?.category || 'Other',
        definition: desc?.definition || `${fieldName} field.`,
      });
    }
    // Add common fields
    const included = new Set(fields.map((f) => f.columnName));
    for (const fieldName of ['Country', 'Immediate Owner Entity Name', '% Share of Ownership']) {
      if (!included.has(fieldName)) {
        const desc = fieldDescriptions[fieldName];
        if (desc) fields.push({ columnName: fieldName, category: desc.category, definition: desc.definition });
      }
    }
    return fields;
  }

  // API metadata slug mapping (app slug → API catalog slug)
  const apiMetadataSlugs: Record<string, string> = {
    'coal-mine': 'coal-mines',
    'coal-plant': 'coal-plants',
  };

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

  // Parse CSV (for Coal Mine)
  function parseCsv(text: string) {
    const lines = text.split('\n');
    return lines
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
  }

  async function loadFieldsMetadata() {
    // Try API catalog metadata first
    const apiSlug = apiMetadataSlugs[trackerParam];
    if (apiSlug) {
      try {
        const response = await fetch(
          `https://gem-api.thirdbear.net/catalog/metadata/${apiSlug}?format=json`
        );
        if (response.ok) {
          const data = await response.json();
          const fields = data.fieldsDetail || [];
          if (fields.length > 0) {
            fieldsMetadata = fields.map((f: { name: string; category?: string; definition?: string; allowed_values?: Array<{ value: string; definition?: string }> }) => ({
              columnName: f.name,
              category: f.category || 'Other',
              definition: f.definition || `${f.name} field.`,
              fieldValue: null,
              valueDefinition: null,
            }));
            // Expand allowed_values into separate rows for enum definitions
            const expanded: typeof fieldsMetadata = [];
            for (const f of fields) {
              expanded.push({
                columnName: f.name,
                category: f.category || 'Other',
                definition: f.definition || `${f.name} field.`,
                fieldValue: null,
                valueDefinition: null,
              });
              if (f.allowed_values?.length) {
                for (const v of f.allowed_values) {
                  if (v.definition) {
                    expanded.push({
                      columnName: f.name,
                      category: f.category || 'Other',
                      definition: f.definition || '',
                      fieldValue: v.value,
                      valueDefinition: v.definition,
                    });
                  }
                }
              }
            }
            fieldsMetadata = expanded;
            return;
          }
        }
      } catch {
        // fall through to synthetic
      }
    }
    fieldsMetadata = generateFieldsMetadata();
  }

  async function loadSampleAssets() {
    try {
      const slug = trackerNameToSlug[tracker] || tracker.toLowerCase().replace(/\s+/g, '-');
      const assets = await listAssetsByType(slug, { limit: 50 });

      const sorted = assets
        .filter((a) => a.capacity != null)
        .sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
        .slice(0, 6);

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
    } catch {
      // sample assets are optional
    }
  }

  onMount(() => {
    Promise.all([loadFieldsMetadata(), loadSampleAssets()]);
  });

  // Tracker nav (for switching between trackers)
  const allSlugs = Object.keys(trackerMetadata);

  const info = $derived(
    meta
      ? {
          title: `${meta.name} Tracker`,
          description: meta.description,
          citation: meta.citation,
        }
      : {
          title: `${tracker} Tracker`,
          description: `Field metadata and distributions for the ${tracker} tracker.`,
          citation: 'Global Energy Monitor. CC BY 4.0.',
        }
  );
</script>

<svelte:head>
  <title>{info.title} FieldGuide — Global Energy Monitor</title>
  <SeoMeta
    title="{info.title} FieldGuide — Global Energy Monitor"
    description="Field-level documentation and data distribution analysis for the {info.title} dataset."
  />
</svelte:head>

<main>
  <PageHeader
    breadcrumbs={[
      { label: 'Home', href: link('index') },
      { label: 'Tracker FieldGuide', href: link('fieldguide') },
      { label: tracker },
    ]}
    title="{info.title} FieldGuide"
    lead={info.description}
  />

  <!-- Tracker switcher tabs -->
  <nav class="tracker-tabs" aria-label="Switch tracker">
    {#each allSlugs as slug}
      {@const m = trackerMetadata[slug]}
      <a
        href={link(`fieldguide/${slug}`)}
        class="tracker-tab"
        class:active={slug === trackerParam}
        style="--tab-color: {getTrackerColor(m.name)}"
      >
        {m.name}
      </a>
    {/each}
  </nav>

  <!-- Main content: field explorer -->
  <section class="fieldguide-content" style="--accent: {color}">
    <DatasetFactsheet {tracker} {fieldsMetadata} title="{info.title} Fields" />
  </section>

  <!-- Sample assets -->
  {#if sampleAssets.length > 0}
    <section class="sample-assets">
      <h2>Largest Assets</h2>
      <p class="section-desc">Top assets by capacity in this tracker</p>
      <div class="cards-grid">
        {#each sampleAssets as asset}
          <ProjectCard {asset} />
        {/each}
      </div>
    </section>
  {/if}

  <!-- Citation & links -->
  <section class="footer-section">
    <div class="citation-block">
      <h3>Citation</h3>
      <p>{info.citation}</p>
    </div>
    {#if meta?.externalLinks?.gemPage}
      <div class="external-links">
        <a href={meta.externalLinks.gemPage} target="_blank" rel="noopener">
          View on globalenergymonitor.org
        </a>
      </div>
    {/if}
  </section>

  <footer class="page-footer">
    <a href={link('fieldguide')}>All Trackers</a>
    <span class="sep">&middot;</span>
    <a href="?embed=true" target="_blank" rel="noopener">Embeddable version</a>
    <span class="sep">&middot;</span>
    <a href={link('explore')}>Explore Data</a>
  </footer>
</main>

<style>
  main {
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  /* Tracker tabs */
  .tracker-tabs {
    display: flex;
    gap: var(--space-1);
    margin-bottom: var(--space-6);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    padding-bottom: 2px;
  }

  .tracker-tabs::-webkit-scrollbar {
    display: none;
  }

  .tracker-tab {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    border-radius: var(--radius-md);
    white-space: nowrap;
    transition: all 0.15s ease;
    border-bottom: 2px solid transparent;
  }

  .tracker-tab:hover {
    color: var(--color-text-primary);
    background: rgba(29, 73, 97, 0.05);
  }

  .tracker-tab.active {
    color: var(--tab-color, var(--color-accent));
    font-weight: 600;
    border-bottom-color: var(--tab-color, var(--color-accent));
    background: rgba(29, 73, 97, 0.06);
  }

  /* Content */
  .fieldguide-content {
    margin-bottom: var(--space-12);
  }

  /* Sample assets */
  .sample-assets {
    margin-bottom: var(--space-12);
  }

  h2 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  h3 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .section-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-3);
  }

  /* Footer section */
  .footer-section {
    display: flex;
    gap: var(--space-6);
    align-items: flex-start;
    flex-wrap: wrap;
    margin-bottom: var(--space-8);
  }

  .citation-block {
    flex: 1;
    min-width: 280px;
    background: var(--color-bg-secondary);
    padding: var(--space-5);
    border-radius: 0 var(--radius-xl) var(--radius-xl) var(--radius-xl);
  }

  .citation-block p {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    margin: 0;
    line-height: var(--leading-relaxed);
  }

  .external-links {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-3);
  }

  .external-links a {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    text-decoration: underline;
  }

  .external-links a:hover {
    color: var(--color-text-primary);
  }

  .page-footer {
    display: flex;
    gap: var(--space-3);
    align-items: center;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding-top: var(--space-6);
    border-top: 1px solid var(--color-border);
  }

  .page-footer a {
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .page-footer a:hover {
    text-decoration: underline;
  }

  .sep {
    color: var(--color-border);
  }

  @media (max-width: 720px) {
    .cards-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
