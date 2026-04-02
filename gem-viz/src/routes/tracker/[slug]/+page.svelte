<script lang="ts">
  /**
   * TRACKER DETAIL PAGE
   * Shows field metadata explorer (Observable notebook style)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import { listAssets, listAssetsByType, resolveApiSlug, type AssetSummary } from '$lib/ownership-api';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';
  import { URL_SLUG_TO_CATALOG_SLUG } from '$lib/data-config/tracker-schema';
  import { fetchFieldStats } from '$lib/api/catalog-api';
  import TrackerFactsheet from '$lib/components/tracker/TrackerFactsheet.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import { getFieldsForTracker, getFacetKeyForField } from '$lib/catalog-field-meta';

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

  // FieldStatsResult matches what TrackerFactsheet expects
  interface FieldStatsResult {
    distribution: Array<{ value: string; count: number; percentage: number }>;
    totalRows: number;
    nullCount: number;
    nonNullCount: number;
    uniqueCount: number;
    dataType?: string;
    dataSubType?: string;
    unit?: string;
    sampleValues?: string[];
    values?: number[];
  }

  // Map human-readable field names to API code_friendly_name keys
  const FIELD_TO_API_KEY: Record<string, string[]> = {
    Status: ['operating_status', 'status', 'Status'],
    Country: ['country', 'Country'],
    'Country / Area': ['country_area', 'country', 'Country'],
    Countries: ['country', 'Country'],
    'Capacity (MW)': ['capacity_mw', 'capacity_value', 'capacity'],
    'Capacity (Mtpa)': ['capacity_mtpa', 'capacity_value', 'capacity'],
    'Nominal crude steel capacity (ttpa)': ['capacity_value', 'capacity'],
    'Nominal iron capacity (ttpa)': ['capacity_value', 'capacity'],
    'CapacityBcm/y': ['capacity_value', 'capacity'],
    'Design capacity (ttpa)': ['capacity_value', 'capacity'],
    'Asset Name': ['asset_name', 'name'],
    'Asset Type': ['asset_type', 'facilityType'],
    'Fuel type': ['fuel_type'],
    Technology: ['technology'],
    'Mine type': ['mine_type'],
    Feedstock: ['feedstock'],
    'Start year': ['start_year'],
    'Immediate Owner Entity Name': ['owner_name'],
    '% Share of Ownership': ['ownership_pct'],
  };

  // Fetch field stats from the API — returns full metadata + distribution
  async function fetchFieldDistribution(fieldName: string, codeFriendlyName?: string): Promise<FieldStatsResult> {
    const empty: FieldStatsResult = {
      distribution: [], totalRows: 0, nullCount: 0, nonNullCount: 0, uniqueCount: 0,
    };

    try {
      const catalogSlug = URL_SLUG_TO_CATALOG_SLUG[slug];
      if (catalogSlug) {
        // Prefer code_friendly_name from field metadata, then fall back to hardcoded map
        const apiKeys = codeFriendlyName
          ? [codeFriendlyName, ...(FIELD_TO_API_KEY[fieldName] || []), fieldName.toLowerCase()]
          : (FIELD_TO_API_KEY[fieldName] || [fieldName, fieldName.toLowerCase()]);
        for (const apiKey of apiKeys) {
          const stats = await fetchFieldStats(catalogSlug, apiKey);
          if (!stats) continue;

          // Build distribution from value_counts (categorical) or values (numeric)
          let distribution: FieldStatsResult['distribution'] = [];

          if (stats.value_counts && stats.value_counts.length > 0) {
            // Use total_rows (incl nulls) as denominator to match Observable notebook
            const denom = stats.total_rows || stats.value_counts.reduce((s, v) => s + v.count, 0);
            distribution = stats.value_counts.slice(0, 50).map((v) => ({
              value: String(v.value),
              count: v.count,
              percentage: denom > 0 ? v.count / denom : 0,
            }));
          } else if (stats.values && stats.values.length > 0) {
            const counts = new Map<string, number>();
            for (const v of stats.values) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
            const denom = stats.total_rows || stats.values.length;
            distribution = Array.from(counts.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 50)
              .map(([value, count]) => ({
                value, count, percentage: denom > 0 ? count / denom : 0,
              }));
          }

          return {
            distribution,
            totalRows: stats.total_rows,
            nullCount: stats.null_count,
            nonNullCount: stats.non_null_count,
            uniqueCount: stats.unique_count,
            dataType: stats.data_type,
            dataSubType: stats.data_sub_type,
            unit: stats.unit_name_short,
            sampleValues: stats.sample_values,
            values: stats.values,
          };
        }
      }

      // Tier 2: facets API — fast single-request distribution for Status/Country/etc.
      const facetKey = getFacetKeyForField(fieldName);
      if (facetKey) {
        const apiSlug = resolveApiSlug(slug);
        if (apiSlug) {
          const page = await listAssets({ asset_type: apiSlug, limit: 1, facets: true });
          const facetData = page.facets?.[facetKey];
          if (facetData && Object.keys(facetData).length > 0) {
            const totalAssets = page.total ?? Object.values(facetData).reduce((s, c) => s + c, 0);
            const entries = Object.entries(facetData).sort((a, b) => b[1] - a[1]);
            const nonNull = entries.reduce((s, [, c]) => s + c, 0);
            return {
              distribution: entries.slice(0, 50).map(([value, count]) => ({
                value,
                count,
                percentage: totalAssets > 0 ? count / totalAssets : 0,
              })),
              totalRows: totalAssets,
              nullCount: totalAssets - nonNull,
              nonNullCount: nonNull,
              uniqueCount: entries.length,
              dataType: 'text',
              dataSubType: 'categorical',
            };
          }
        }
      }

      // Tier 3: client-side aggregation from cached assets
      const assets = await getAssetsForTracker(slug);
      const counts = new Map<string, number>();
      const apiKeys = codeFriendlyName
        ? [codeFriendlyName, ...(FIELD_TO_API_KEY[fieldName] || []), fieldName.toLowerCase()]
        : (FIELD_TO_API_KEY[fieldName] || [fieldName, fieldName.toLowerCase()]);
      for (const asset of assets) {
        const raw = asset.raw || {};
        let value: unknown = null;
        for (const k of apiKeys) {
          const v = raw[k] ?? (asset as unknown as Record<string, unknown>)[k];
          if (v != null && v !== '') { value = v; break; }
        }
        if (value != null && value !== '') {
          const sv = String(value);
          counts.set(sv, (counts.get(sv) || 0) + 1);
        }
      }
      const total = Array.from(counts.values()).reduce((s, c) => s + c, 0);
      return {
        distribution: Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 50)
          .map(([value, count]) => ({ value, count, percentage: total > 0 ? count / total : 0 })),
        totalRows: assets.length,
        nullCount: assets.length - total,
        nonNullCount: total,
        uniqueCount: counts.size,
      };
    } catch (err) {
      if (import.meta.env.DEV) console.warn(`Failed to fetch distribution for ${fieldName}:`, err);
    }
    return empty;
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
