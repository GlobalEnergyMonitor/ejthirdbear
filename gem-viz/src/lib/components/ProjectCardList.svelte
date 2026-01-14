<script lang="ts">
  /**
   * ProjectCardList Component
   * Shows a filtered collection of ProjectCards with a heading
   *
   * Performance optimizations:
   * - Cached queries with TTL
   * - Memoized percentile lookups
   * - Single effect for prop changes
   */
  import { onMount } from 'svelte';
  import {
    fetchAssets,
    fetchCapacities,
    createPercentileLookup,
    type Asset,
    type PercentileData,
  } from '$lib/factsheet';
  import ProjectCard from './ProjectCard.svelte';
  import LoadingWrapper from './LoadingWrapper.svelte';

  // Props
  let {
    title = 'Assets',
    description = '',
    tracker = null as string | null,
    statusFilter = null as string[] | null,
    sortBy = 'capacity' as 'capacity' | 'age' | 'name',
    sortOrder = 'desc' as 'asc' | 'desc',
    limit = 5,
    variant = 'compact' as 'compact' | 'full',
    showPercentiles = true,
  } = $props();

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let assets = $state<Asset[]>([]);

  // Memoized percentile lookups (created once per data load)
  let globalLookup = $state<((_v: number) => number) | null>(null);
  let countryLookups = $state<Map<string, (_v: number) => number>>(new Map());

  // Calculate percentiles using memoized lookups
  function getPercentiles(asset: Asset): PercentileData | null {
    if (!showPercentiles || !asset.capacity || !globalLookup) return null;

    const global = globalLookup(asset.capacity);
    const countryLookup = asset.country ? countryLookups.get(asset.country) : null;
    const country = countryLookup ? countryLookup(asset.capacity) : global;

    return { global, country };
  }

  // Load all data
  async function loadData() {
    loading = true;
    error = null;

    try {
      // Load capacities first for percentile calculations (if needed)
      if (showPercentiles) {
        const capacities = await fetchCapacities(tracker);
        globalLookup = createPercentileLookup(capacities.global);

        // Create lookup for each country
        const lookups = new Map<string, (_v: number) => number>();
        for (const [country, caps] of capacities.byCountry) {
          lookups.set(country, createPercentileLookup(caps));
        }
        countryLookups = lookups;
      }

      // Fetch assets
      const result = await fetchAssets({
        tracker,
        statusFilter,
        sortBy,
        sortOrder,
        limit,
      });

      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }

      assets = result.data;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      assets = [];
    } finally {
      loading = false;
    }
  }

  // Load on mount
  onMount(loadData);

  // Create a derived key from props to detect changes
  const propsKey = $derived(
    `${tracker}:${statusFilter?.join(',')}:${sortBy}:${sortOrder}:${limit}:${showPercentiles}`
  );

  // Reload when props change (after mount)
  let mounted = false;
  $effect(() => {
    void propsKey; // Track changes
    if (mounted) {
      loadData();
    }
    mounted = true;
  });
</script>

<section class="project-card-container">
  <h2>{title}</h2>
  {#if description}
    <p class="description">{description}</p>
  {/if}

  <LoadingWrapper {loading} {error} empty={assets.length === 0} loadingMessage="Loading assets...">
    <div class="project-cards">
      {#each assets as asset (asset.id)}
        <ProjectCard {asset} percentiles={getPercentiles(asset)} {variant} />
      {/each}
    </div>
  </LoadingWrapper>
</section>

<style>
  .project-card-container {
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }

  h2 {
    color: var(--gem-navy, #004a63);
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0 0 0.5rem 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .description {
    color: var(--gem-teal, #016b83);
    font-size: 0.875rem;
    margin: 0 0 1rem 0;
  }

  .project-cards {
    display: flex;
    flex-direction: column;
  }
</style>
