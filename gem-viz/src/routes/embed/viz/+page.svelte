<script lang="ts">
  /**
   * Generic Modular Embed
   * Renders a single visualization component by name with URL params.
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';

  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';
  import AssetScreener from '$lib/components/screener/AssetScreener.svelte';
  import AssetMap from '$lib/components/map/AssetMap.svelte';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import { OwnershipTreeGraph, AssetRingVisualization } from '$lib/components/ownership';

  import { getOwnershipGraph } from '$lib/ownership-api';
  import { loadEntityPortfolio, errorMessage, boolParam, intParam, readHash } from '../embed-utils';
  import { getFieldsForTracker } from '$lib/catalog-field-meta';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';

  // Hash overrides for Drupal deep-linking
  let hashParams = $state<Record<string, string>>({});

  onMount(() => {
    hashParams = readHash();
  });

  /** Read a param from hash first, then query string */
  function param(key: string): string | null {
    return hashParams[key] ?? $page.url.searchParams.get(key);
  }

  function paramList(key: string): string[] {
    const val = param(key);
    if (!val) return [];
    return val
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const vizName = $derived(
    hashParams['name'] ||
      hashParams['viz'] ||
      $page.url.searchParams.get('name') ||
      $page.url.searchParams.get('viz') ||
      ''
  );
  const searchKey = $derived($page.url.searchParams.toString() + JSON.stringify(hashParams));

  let component = $state<any>(null);
  let componentProps = $state<Record<string, any>>({});
  let loading = $state(true);
  let error = $state<string | null>(null);
  let emptyMessage = $state<string | null>(null);
  let maxHeight = $state(500);

  const supported = [
    'ownership-flower',
    'ownership-graph',
    'asset-ring',
    'asset-screener',
    'asset-map',
    'factsheet',
  ];

  // Field metadata is fetched from the API via catalog-field-meta.ts

  async function loadViz() {
    loading = true;
    error = null;
    emptyMessage = null;
    component = null;
    componentProps = {};

    if (!vizName) {
      error = 'Missing required parameter: name';
      loading = false;
      return;
    }

    if (!supported.includes(vizName)) {
      error = `Unknown viz: ${vizName}`;
      loading = false;
      return;
    }

    try {
      if (vizName === 'ownership-flower') {
        const ownerId = param('entityId') || param('ownerId');
        if (!ownerId) throw new Error('Missing required parameter: entityId');

        component = OwnershipFlower;
        componentProps = {
          ownerId,
          size: param('size') || 'medium',
          showLabels: boolParam(param('showLabels')),
          showTitle: boolParam(param('showTitle')),
          title: param('title') || '',
        };
        loading = false;
        return;
      }

      if (vizName === 'ownership-graph') {
        const entityId = param('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const direction = (param('direction') || 'down') as 'up' | 'down';
        const graphData = await getOwnershipGraph({ root: entityId, direction });

        if (!graphData?.nodes?.length || graphData.nodes.length <= 1) {
          emptyMessage = `No ${direction === 'down' ? 'downstream' : 'upstream'} ownership data found`;
          loading = false;
          return;
        }

        component = OwnershipTreeGraph;
        componentProps = {
          nodes: graphData.nodes,
          edges: graphData.edges,
          paths: graphData.paths,
          rootId: entityId,
        };
        loading = false;
        return;
      }

      if (vizName === 'asset-ring') {
        const entityId = param('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const maxAssets = intParam(param('maxAssets'), 150);
        const { portfolio } = await loadEntityPortfolio(entityId);
        const assets = (portfolio?.assets || []).slice(0, maxAssets);

        if (assets.length === 0) {
          emptyMessage = 'No assets found for this entity';
          loading = false;
          return;
        }

        component = AssetRingVisualization;
        componentProps = { assets };
        loading = false;
        return;
      }

      if (vizName === 'asset-screener') {
        const entityId = param('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const statuses = paramList('statuses');

        component = AssetScreener;
        componentProps = {
          entityId,
          assetClassName: param('assetClass') || 'assets',
          sortByOwnershipPct: boolParam(param('sortByOwnershipPct')),
          includeUnitNames: boolParam(param('includeUnitNames'), false),
          defaultStatuses: statuses.length ? statuses : ['operating', 'planned'],
        };
        loading = false;
        return;
      }

      if (vizName === 'asset-map') {
        const assetId = param('assetId') || param('id');
        if (!assetId) throw new Error('Missing required parameter: assetId');

        component = AssetMap;
        componentProps = { assetId };
        loading = false;
        return;
      }

      if (vizName === 'factsheet') {
        const trackerSlug = param('tracker') || '';
        if (!trackerSlug) throw new Error('Missing required parameter: tracker');

        const tracker = slugToTrackerName[trackerSlug] || trackerSlug;
        const metadata = trackerMetadata[trackerSlug] as TrackerMetadata | undefined;
        if (!metadata) throw new Error(`Unknown tracker: ${trackerSlug}`);

        const title = param('title') || `${tracker} Fields`;
        maxHeight = intParam(param('height'), 500);

        const fieldsMetadata = await getFieldsForTracker(trackerSlug, true);

        if (fieldsMetadata.length === 0) {
          emptyMessage = `No metadata found for ${tracker}`;
          loading = false;
          return;
        }

        component = DatasetFactsheet;
        componentProps = { tracker, fieldsMetadata, title };
        loading = false;
        return;
      }
    } catch (err) {
      error = errorMessage(err, 'Failed to load visualization');
      loading = false;
    }
  }

  $effect(() => {
    void searchKey;
    loadViz();
  });
</script>

<svelte:head>
  <title>{vizName ? `${vizName} — GEM Embed` : 'GEM Embed'}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div
  class="viz-embed"
  class:factsheet={vizName === 'factsheet'}
  style="--max-height: {maxHeight}px;"
>
  {#if loading}
    <div class="embed-loading">Loading visualization...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !vizName}
        <p class="embed-hint">Example: ?name=ownership-flower&entityId=E12345</p>
        <p class="embed-hint">Supported: {supported.join(', ')}</p>
      {/if}
    </div>
  {:else if emptyMessage}
    <div class="embed-empty">{emptyMessage}</div>
  {:else if component}
    {@const DynamicComponent = component}
    <DynamicComponent {...componentProps} />
  {/if}
</div>

<style>
  .viz-embed {
    width: 100%;
    min-height: 320px;
  }

  .viz-embed.factsheet :global(.factsheet) {
    max-height: var(--max-height);
  }

  .viz-embed.factsheet :global(.dataset-fields),
  .viz-embed.factsheet :global(.dataset-previewer) {
    max-height: calc(var(--max-height) - 40px);
  }

  @media (max-width: 768px) {
    .viz-embed.factsheet :global(.factsheet) {
      max-height: none;
    }

    .viz-embed.factsheet :global(.dataset-fields),
    .viz-embed.factsheet :global(.dataset-previewer) {
      max-height: none;
    }
  }
</style>
