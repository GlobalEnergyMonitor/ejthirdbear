<script lang="ts">
  /**
   * Generic Modular Embed
   * Renders a single visualization component by name with URL params.
   */
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';
  import AssetScreener from '$lib/components/screener/AssetScreener.svelte';
  import AssetMap from '$lib/components/map/AssetMap.svelte';
  import DatasetFactsheet from '$lib/widgets/DatasetFactsheet.svelte';
  import { OwnershipTreeGraph, AssetRingVisualization } from '$lib/components/ownership';

  import { getEntityGraphUp, getEntityGraphDown } from '$lib/ownership-api';
  import { loadEntityPortfolio, errorMessage, boolParam, intParam } from '../embed-utils';
  import {
    slugToTrackerName,
    trackerMetadata,
    type TrackerMetadata,
  } from '$lib/data-config/tracker-metadata';

  const vizName = $derived(
    $page.url.searchParams.get('name') || $page.url.searchParams.get('viz') || ''
  );
  const searchKey = $derived($page.url.searchParams.toString());

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

  function generateSyntheticFields(meta: TrackerMetadata) {
    const fields: Array<{ columnName: string; category: string; definition: string }> = [];
    for (const fieldName of meta.keyFields) {
      const desc = fieldDescriptions[fieldName];
      fields.push({
        columnName: fieldName,
        category: desc?.category || 'Other',
        definition: desc?.definition || `${fieldName} field.`,
      });
    }
    const included = new Set(fields.map((f) => f.columnName));
    const extras = ['Country', 'Immediate Owner Entity Name', '% Share of Ownership'];
    for (const fieldName of extras) {
      if (!included.has(fieldName)) {
        const desc = fieldDescriptions[fieldName];
        if (desc) {
          fields.push({
            columnName: fieldName,
            category: desc.category,
            definition: desc.definition,
          });
        }
      }
    }
    return fields;
  }

  const metadataFiles: Record<string, string> = {
    'Coal Mine': `${base}/coal-mine-fields-metadata.csv`,
  };

  function parseList(value: string | null) {
    if (!value) return [];
    return value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

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

    const params = $page.url.searchParams;

    try {
      if (vizName === 'ownership-flower') {
        const ownerId = params.get('entityId') || params.get('ownerId');
        if (!ownerId) throw new Error('Missing required parameter: entityId');

        component = OwnershipFlower;
        componentProps = {
          ownerId,
          size: params.get('size') || 'medium',
          showLabels: boolParam(params.get('showLabels')),
          showTitle: boolParam(params.get('showTitle')),
          title: params.get('title') || '',
        };
        loading = false;
        return;
      }

      if (vizName === 'ownership-graph') {
        const entityId = params.get('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const direction = params.get('direction') || 'up';
        const fetchFn = direction === 'down' ? getEntityGraphDown : getEntityGraphUp;
        const graphData = await fetchFn(entityId);

        if (!graphData?.nodes?.length || graphData.nodes.length <= 1) {
          emptyMessage = `No ${direction === 'down' ? 'downstream' : 'upstream'} ownership data found`;
          loading = false;
          return;
        }

        component = OwnershipTreeGraph;
        componentProps = {
          nodes: graphData.nodes,
          edges: graphData.edges,
          paths: (graphData as any).paths || {},
          rootId: entityId,
        };
        loading = false;
        return;
      }

      if (vizName === 'asset-ring') {
        const entityId = params.get('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const maxAssets = intParam(params.get('maxAssets'), 150);
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
        const entityId = params.get('entityId');
        if (!entityId) throw new Error('Missing required parameter: entityId');

        const statuses = parseList(params.get('statuses'));

        component = AssetScreener;
        componentProps = {
          entityId,
          assetClassName: params.get('assetClass') || 'assets',
          sortByOwnershipPct: boolParam(params.get('sortByOwnershipPct')),
          includeUnitNames: boolParam(params.get('includeUnitNames'), false),
          defaultStatuses: statuses.length ? statuses : ['operating', 'planned'],
        };
        loading = false;
        return;
      }

      if (vizName === 'asset-map') {
        const assetId = params.get('assetId') || params.get('id');
        if (!assetId) throw new Error('Missing required parameter: assetId');

        component = AssetMap;
        componentProps = { assetId };
        loading = false;
        return;
      }

      if (vizName === 'factsheet') {
        const trackerSlug = params.get('tracker') || '';
        if (!trackerSlug) throw new Error('Missing required parameter: tracker');

        const tracker = slugToTrackerName[trackerSlug] || trackerSlug;
        const metadata = trackerMetadata[trackerSlug] as TrackerMetadata | undefined;
        if (!metadata) throw new Error(`Unknown tracker: ${trackerSlug}`);

        const metadataFile = metadataFiles[tracker] || null;
        const title = params.get('title') || `${tracker} Fields`;
        maxHeight = intParam(params.get('height'), 500);

        let fieldsMetadata: Array<{
          columnName: string;
          category: string;
          definition: string;
          fieldValue?: string | null;
          valueDefinition?: string | null;
        }> = [];

        if (metadataFile) {
          try {
            const response = await fetch(metadataFile);
            if (response.ok) {
              const text = await response.text();
              const lines = text.split('\n');
              fieldsMetadata = lines
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
          } catch (err) {
            if (import.meta.env.DEV)
              console.warn('CSV load failed, falling back to synthetic fields:', err);
          }
        }

        if (fieldsMetadata.length === 0) {
          fieldsMetadata = generateSyntheticFields(metadata);
        }

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
