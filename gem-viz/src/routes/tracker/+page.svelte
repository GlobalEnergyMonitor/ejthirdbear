<script lang="ts">
  /**
   * TRACKER INDEX PAGE
   * Grid of all trackers with summary stats
   */
  import { onMount } from 'svelte';
  import { link } from '$lib/links';
  import { getAssetTypeCounts, API_TYPE_TO_SLUG } from '$lib/ownership-api';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import { trackerMetadata } from '$lib/data-config/tracker-metadata';
  import { fetchSegments, getSegmentApiUrl, type Segment } from '$lib/segments-api';

  // State
  let trackerCounts = $state<Map<string, number>>(new Map());
  let segments = $state<Segment[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Load data - show page fast, load data in background
  onMount(async () => {
    // Show page content immediately
    loading = false;

    // Try to load segments
    fetchSegments()
      .then((result) => {
        segments = result;
      })
      .catch((err) => { if (import.meta.env.DEV) console.warn('Segments fetch failed:', err); });

    // Fetch asset counts per tracker type from REST API (sampled + extrapolated)
    getAssetTypeCounts()
      .then((apiCounts) => {
        const mapped = new Map<string, number>();
        for (const [apiType, count] of apiCounts) {
          // Map API type name back to our tracker display name
          const slug = API_TYPE_TO_SLUG[apiType];
          if (slug && trackerMetadata[slug]) {
            mapped.set(trackerMetadata[slug].name, count);
          }
        }
        trackerCounts = mapped;
      })
      .catch((err) => { if (import.meta.env.DEV) console.warn('Tracker stats failed:', err); });
  });

  // Get all tracker slugs
  const allTrackerSlugs = Object.keys(trackerMetadata);

  // Format large numbers
  function formatNumber(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  }
</script>

<svelte:head>
  <title>Trackers — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse all Global Energy Monitor trackers: coal plants, gas plants, mines, pipelines, and more."
  />
</svelte:head>

<div class="page-container--wide">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'Trackers' }]}
    title="GEM Trackers"
    lead="Global Energy Monitor maintains comprehensive databases tracking energy infrastructure worldwide. Each tracker documents assets from announcement through operation and retirement."
  />

  {#if loading}
    <div class="loading">
      <Spinner />
      <p>Loading tracker data...</p>
    </div>
  {:else if error}
    <div class="error">
      <p>Error: {error}</p>
    </div>
  {:else}
    <div class="tracker-grid">
      {#each allTrackerSlugs as slug}
        {@const metadata = trackerMetadata[slug]}
        {@const assetCount = trackerCounts.get(metadata.name)}
        <a href={`/tracker/${slug}`} class="tracker-card" style="--tracker-color: {metadata.color}">
          <div class="card-header">
            <h2>{metadata.name}</h2>
          </div>
          <div class="card-body">
            <p class="description">{metadata.description}</p>
            {#if assetCount && assetCount > 0}
              <div class="stats">
                <div class="stat">
                  <span class="stat-value">{formatNumber(assetCount)}</span>
                  <span class="stat-label">Assets</span>
                </div>
              </div>
            {/if}
          </div>
          <div class="card-footer">
            <span class="view-link">View tracker details</span>
          </div>
        </a>
      {/each}
    </div>

    <!-- Asset Classes Section -->
    {#if segments.length > 0}
      <section class="segments-section">
        <h2>Asset Classes</h2>
        <p class="section-intro">Pre-defined segments for focused analysis across trackers</p>
        <div class="segments-grid">
          {#each segments as segment}
            <a href={getSegmentApiUrl(segment)} target="_blank" rel="noopener" class="segment-card">
              <div class="segment-header">
                <span class="segment-name">{segment.name}</span>
                <span class="segment-count">{formatNumber(segment.count)}</span>
              </div>
              <p class="segment-desc">{segment.description}</p>
              <span class="segment-type">{segment.asset_type}</span>
            </a>
          {/each}
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  .loading,
  .error {
    text-align: center;
    padding: var(--space-10);
    color: var(--color-text-secondary);
  }

  .loading p {
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .error {
    color: var(--color-error, #b91c1c);
  }

  .tracker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: var(--space-5);
    margin-bottom: var(--space-12);
  }

  .tracker-card {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--tracker-color, var(--color-accent));
    border-radius: var(--radius-md);
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease,
      border-color 0.15s ease;
  }

  .tracker-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    border-left-color: var(--tracker-color, var(--color-accent));
  }

  .card-header {
    padding: var(--space-4) var(--space-4) var(--space-2);
  }

  .card-header h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    text-transform: none;
    letter-spacing: normal;
  }

  .card-body {
    flex: 1;
    padding: 0 var(--space-4) var(--space-4);
  }

  .description {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
    line-height: 1.5;
  }

  .stats {
    display: flex;
    gap: var(--space-5);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-value {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--tracker-color, var(--color-accent));
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-footer {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .view-link {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-weight: 500;
    transition: color 0.15s ease;
  }

  .tracker-card:hover .view-link {
    color: var(--tracker-color, var(--color-accent));
  }

  /* Segments Section */
  .segments-section {
    margin-bottom: var(--space-10);
    padding-top: var(--space-8);
    border-top: 1px solid var(--color-border);
  }

  .segments-section h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2) 0;
  }

  .section-intro {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-5) 0;
  }

  .segments-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--space-4);
  }

  .segment-card {
    display: flex;
    flex-direction: column;
    padding: var(--space-4);
    background: var(--color-bg-primary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    text-decoration: none;
    color: inherit;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .segment-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  }

  .segment-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  .segment-name {
    font-weight: 500;
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    line-height: 1.3;
  }

  .segment-count {
    font-size: var(--font-size-body);
    font-weight: 600;
    color: var(--color-accent);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .segment-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
    flex: 1;
    line-height: 1.4;
  }

  .segment-type {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
