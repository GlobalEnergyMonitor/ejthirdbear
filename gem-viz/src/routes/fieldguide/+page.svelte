<script lang="ts">
  /**
   * Tracker FieldGuide Index
   * Card grid of all available trackers with descriptions and asset counts
   */
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import { getAssetTypeCounts, API_TYPE_TO_SLUG } from '$lib/ownership-api';
  import { trackerMetadata } from '$lib/data-config/tracker-metadata';
  import { CATALOG_SLUG_TO_URL_SLUG } from '$lib/data-config/tracker-schema';
  import { fetchCatalogIndex } from '$lib/api/catalog-api';
  import { getTrackerColor } from '$lib/design-tokens';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  let trackerCounts = $state<Map<string, number>>(new Map());
  // API-ordered list of URL slugs for trackers that have metadata.
  // Falls back to all hardcoded slugs if the API is unreachable.
  let availableTrackerSlugs = $state<string[]>(Object.keys(trackerMetadata));

  onMount(async () => {
    // Fetch ordered tracker list from API
    try {
      const index = await fetchCatalogIndex();
      if (index?.trackers?.length) {
        const apiSlugs = index.trackers
          .map((t) => CATALOG_SLUG_TO_URL_SLUG[t.slug])
          .filter((s): s is string => !!s && !!trackerMetadata[s]);
        if (apiSlugs.length) {
          // API-ordered trackers first, then remaining hardcoded trackers alphabetically
          const apiSet = new Set(apiSlugs);
          const remaining = Object.keys(trackerMetadata)
            .filter((s) => !apiSet.has(s))
            .sort((a, b) => trackerMetadata[a].name.localeCompare(trackerMetadata[b].name));
          availableTrackerSlugs = [...apiSlugs, ...remaining];
        }
      }
    } catch {
      // keep hardcoded fallback
    }

    // Fetch asset counts (optional)
    try {
      const apiCounts = await getAssetTypeCounts();
      const mapped = new Map<string, number>();
      for (const [apiType, count] of apiCounts) {
        const slug = API_TYPE_TO_SLUG[apiType];
        if (slug && trackerMetadata[slug]) {
          mapped.set(trackerMetadata[slug].name, count);
        }
      }
      trackerCounts = mapped;
    } catch {
      // counts are optional
    }
  });

  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }
</script>

<svelte:head>
  <title>Tracker FieldGuide — Global Energy Monitor</title>
  <SeoMeta
    title="Tracker FieldGuide — Global Energy Monitor"
    description="Explore field-level documentation, data distributions, and sample records for each GEM tracker dataset."
  />
</svelte:head>

<div class="page">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'Tracker FieldGuide' }]}
    title="Tracker FieldGuide"
    lead="Explore field-level documentation, data distributions, and sample records for each tracker dataset."
  />

  <div class="tracker-grid">
    {#each availableTrackerSlugs as slug}
      {@const meta = trackerMetadata[slug]}
      {@const count = trackerCounts.get(meta.name)}
      {@const color = getTrackerColor(meta.name)}
      <a href={link(`fieldguide/${slug}`)} class="tracker-card" style="--tracker-color: {color}">
        <div class="card-content">
          <h2>{meta.name}</h2>
          <p class="description">{meta.description}</p>
          {#if count && count > 0}
            <p class="asset-count">{formatNumber(count)} assets</p>
          {/if}
        </div>
        <div class="card-footer">
          <span class="view-link">View FieldGuide</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M6 3l5 5-5 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .page {
    width: 100%;
    max-width: var(--container-content);
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  .tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: var(--space-5);
  }

  .tracker-card {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-top: 4px solid var(--tracker-color);
    border-radius: var(--radius-md);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .tracker-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
  }

  .card-content {
    flex: 1;
    padding: var(--space-5) var(--space-5) var(--space-3);
  }

  .card-content h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2) 0;
    text-transform: none;
    letter-spacing: normal;
  }

  .description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0 0 var(--space-3) 0;
  }

  .asset-count {
    color: var(--tracker-color);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-5);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .view-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  .card-footer svg {
    color: var(--color-text-tertiary);
    transition: transform 0.15s ease;
  }

  .tracker-card:hover .view-link {
    color: var(--tracker-color);
  }

  .tracker-card:hover .card-footer svg {
    color: var(--tracker-color);
    transform: translateX(2px);
  }

  @media (max-width: 768px) {
    .tracker-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
