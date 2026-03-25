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
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';
  import { getFieldsForTracker } from '$lib/catalog-field-meta';

  // Parse URL parameters
  const trackerSlug = $derived($page.url.searchParams.get('tracker') || '');
  const titleParam = $derived($page.url.searchParams.get('title'));
  const heightParam = $derived($page.url.searchParams.get('height'));

  const tracker = $derived(slugToTrackerName[trackerSlug] || trackerSlug);
  const metadata = $derived(trackerMetadata[trackerSlug] as TrackerMetadata | undefined);
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

  async function loadFieldsMetadata() {
    fieldsMetadata = await getFieldsForTracker(trackerSlug, true);
    loading = false;
  }

  onMount(() => {
    if (metadata) {
      loadFieldsMetadata();
    } else if (!trackerSlug) {
      error = 'Missing required parameter: tracker';
      loading = false;
    } else {
      error = `Unknown tracker: ${trackerSlug}`;
      loading = false;
    }
  });

  const validTrackers = Object.keys(slugToTrackerName);
</script>

<svelte:head>
  <title>{tracker} Factsheet — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="factsheet-embed" style="--max-height: {maxHeight}px;">
  {#if loading}
    <div class="embed-loading">Loading {tracker} metadata...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !trackerSlug}
        <p class="embed-hint">Example: ?tracker=coal-mine</p>
        <p class="embed-hint">Available trackers: {validTrackers.join(', ')}</p>
      {/if}
    </div>
  {:else if fieldsMetadata.length === 0}
    <div class="embed-error">
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

  /* loading/error/hint styles provided by embed layout */

  @media (max-width: 768px) {
    .factsheet-embed :global(.factsheet) {
      max-height: none;
    }

    .factsheet-embed :global(.dataset-fields),
    .factsheet-embed :global(.dataset-previewer) {
      max-height: none;
    }
  }
</style>
