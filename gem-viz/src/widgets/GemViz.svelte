<script lang="ts">
  /**
   * GemViz — Shadow DOM dispatcher widget.
   * Routes to the appropriate widget based on `name` prop.
   * Mirrors embed/viz/+page.svelte (simplified for Shadow DOM).
   */
  import GemOwnershipFlower from './GemOwnershipFlower.svelte';
  import GemOwnershipGraph from './GemOwnershipGraph.svelte';
  import GemAssetRing from './GemAssetRing.svelte';
  import GemTrackerFactsheet from './GemTrackerFactsheet.svelte';
  import GemAssetSearch from './GemAssetSearch.svelte';

  interface Props {
    name: string;
    [key: string]: unknown;
  }

  let { name, ...rest }: Props = $props();

  const WIDGETS: Record<string, any> = {
    'ownership-flower': GemOwnershipFlower,
    'ownership-graph': GemOwnershipGraph,
    'asset-ring': GemAssetRing,
    'factsheet': GemTrackerFactsheet,
    'tracker-factsheet': GemTrackerFactsheet,
    'asset-search': GemAssetSearch,
  };

  const widget = $derived(WIDGETS[name]);
</script>

{#if widget}
  <svelte:component this={widget} {...rest} />
{:else}
  <div class="embed-error">
    <p>Unknown visualization: <code>{name}</code></p>
    <p style="font-size: 12px; opacity: 0.7;">Available: {Object.keys(WIDGETS).join(', ')}</p>
  </div>
{/if}
