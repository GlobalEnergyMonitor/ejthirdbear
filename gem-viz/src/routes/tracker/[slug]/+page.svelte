<script lang="ts">
  /**
   * TRACKER DETAIL PAGE
   * Shows field metadata explorer (Observable notebook style)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import { listAssetsByType, type AssetSummary } from '$lib/ownership-api';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';
  import TrackerFactsheet from '$lib/components/tracker/TrackerFactsheet.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import { getFieldsForTracker } from '$lib/catalog-field-meta';

  // Cache for REST API asset data (avoids re-fetching for each field)
  let cachedAssets: AssetSummary[] | null = null;
  let cachedSlug: string | null = null;

  async function getAssetsForTracker(slug: string): Promise<AssetSummary[]> {
    if (cachedSlug === slug && cachedAssets) return cachedAssets;
    cachedAssets = await listAssetsByType(slug, { limit: 2000 });
    cachedSlug = slug;
    return cachedAssets;
  }

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

  // Field metadata is fetched from the API via catalog-field-meta.ts

  // Map human-readable field names to REST API keys + normalized AssetSummary keys
  const FIELD_TO_API_KEY: Record<string, string[]> = {
    Status: ['operating_status', 'status', 'Status'],
    Country: ['country', 'Country'],
    'Country / Area': ['country', 'Country'],
    Countries: ['country', 'Country'],
    'Capacity (MW)': ['capacity_value', 'capacity', 'Capacity (MW)'],
    'Capacity (Mtpa)': ['capacity_value', 'capacity', 'Capacity (Mtpa)'],
    'Nominal crude steel capacity (ttpa)': ['capacity_value', 'capacity'],
    'Nominal iron capacity (ttpa)': ['capacity_value', 'capacity'],
    'CapacityBcm/y': ['capacity_value', 'capacity'],
    'Design capacity (ttpa)': ['capacity_value', 'capacity'],
    'Asset Name': ['asset_name', 'name', 'Asset Name'],
    'Asset Type': ['asset_type', 'facilityType', 'Asset Type'],
    'Fuel type': ['fuel_type', 'Fuel type'],
    Technology: ['technology', 'Technology'],
    'Mine type': ['mine_type', 'Mine type'],
    Feedstock: ['feedstock', 'Feedstock'],
    'Start year': ['start_year', 'Start year'],
    'Immediate Owner Entity Name': ['owner_name', 'Immediate Owner Entity Name'],
    '% Share of Ownership': ['ownership_pct', '% Share of Ownership'],
  };

  // Fetch field distribution from REST API (client-side aggregation)
  async function fetchFieldDistribution(
    fieldName: string
  ): Promise<Array<{ value: string; count: number; percentage: number }>> {
    try {
      const assets = await getAssetsForTracker(slug);

      // Count occurrences of each value for this field
      const counts = new Map<string, number>();
      const apiKeys = FIELD_TO_API_KEY[fieldName] || [fieldName, fieldName.toLowerCase()];
      for (const asset of assets) {
        const raw = asset.raw || {};
        // Check raw API keys first, then normalized AssetSummary properties
        let value: unknown = null;
        for (const k of apiKeys) {
          const v = raw[k] ?? (asset as unknown as Record<string, unknown>)[k];
          if (v != null && v !== '') {
            value = v;
            break;
          }
        }
        const strValue = value != null && value !== '' ? String(value) : null;
        if (strValue) {
          counts.set(strValue, (counts.get(strValue) || 0) + 1);
        }
      }

      const total = Array.from(counts.values()).reduce((s, c) => s + c, 0);

      // Sort by count descending, take top 50
      return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([value, count]) => ({
          value,
          count,
          percentage: total > 0 ? count / total : 0,
        }));
    } catch (err) {
      if (import.meta.env.DEV) console.warn(`Failed to fetch distribution for ${fieldName}:`, err);
    }
    return [];
  }

  async function loadFieldsMetadata() {
    fieldsMetadata = await getFieldsForTracker(slug, true);
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
  <SeoMeta
    title="{metadata?.name || trackerName} — Global Energy Monitor"
    description={metadata?.description || `Data overview for ${trackerName}`}
  />
</svelte:head>

<div class="page-container--wide">
  <PageHeader
    breadcrumbs={[
      { label: 'Home', href: link('index') },
      { label: 'Trackers', href: link('tracker') },
      { label: metadata?.name || trackerName },
    ]}
    title={metadata?.name || trackerName}
    lead={metadata?.description || ''}
  />

  {#if loading}
    <div class="loading">
      <Spinner size={40} />
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
</div>

<style>
  .loading,
  .error {
    text-align: center;
    padding: var(--space-12);
    color: var(--color-text-secondary);
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
