<script lang="ts">
  /**
   * GemTrackerFactsheet — Shadow DOM widget for tracker field metadata explorer.
   * Mirrors embed/tracker-factsheet/+page.svelte.
   */
  import { onMount } from 'svelte';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import { slugToTrackerName } from '$lib/data-config/tracker-metadata';
  import { getTrackerFieldData } from '$lib/catalog-field-meta';
  import { URL_SLUG_TO_CATALOG_SLUG } from '$lib/data-config/tracker-schema';
  import { errorMessage } from './widget-data';

  interface Props {
    tracker: string;
    title?: string;
    field?: string;
    height?: number;
    theme?: 'light' | 'dark';
  }

  let { tracker = '', title: titleProp, field = '', height = 500, theme = 'light' }: Props = $props();

  const trackerName = $derived(slugToTrackerName[tracker] || tracker);
  const displayTitle = $derived(titleProp || `${trackerName} Fields`);
  const catalogSlug = $derived(URL_SLUG_TO_CATALOG_SLUG[tracker] ?? '');

  let fieldsMetadata = $state<any[]>([]);
  let categoriesOrdered = $state<string[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedField = $state(field);

  onMount(async () => {
    if (!tracker) {
      error = 'Missing required parameter: tracker';
      loading = false;
      return;
    }
    try {
      const { fields, categoriesOrdered: cats } = await getTrackerFieldData(tracker);
      fieldsMetadata = fields;
      if (cats.length) categoriesOrdered = cats;
    } catch (err) {
      error = errorMessage(err, 'Failed to load tracker metadata');
    } finally {
      loading = false;
    }
  });
</script>

<div class="factsheet-embed" class:dark={theme === 'dark'} style="--max-height: {height}px;">
  {#if loading}
    <div class="embed-loading">Loading {trackerName} metadata...</div>
  {:else if error}
    <div class="embed-error"><p>{error}</p></div>
  {:else}
    <DatasetFactsheet
      tracker={trackerName}
      {fieldsMetadata}
      {categoriesOrdered}
      {catalogSlug}
      title={displayTitle}
      initialField={selectedField}
      onFieldSelect={(f) => { selectedField = f; }}
    />
  {/if}
</div>

<style>
  .factsheet-embed {
    width: 100%;
    font-family: var(--font-family);
  }
  .factsheet-embed :global(.factsheet) {
    max-height: var(--max-height);
  }
  .factsheet-embed :global(.dataset-fields),
  .factsheet-embed :global(.dataset-previewer) {
    max-height: calc(var(--max-height) - 40px);
  }
</style>
