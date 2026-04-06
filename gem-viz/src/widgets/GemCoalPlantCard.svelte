<script lang="ts">
  /**
   * GemCoalPlantCard — Dynamic embed widget for the coal plant detail card.
   * Mirrors embed/coal-plant/+page.svelte but uses widget-api and shared card code.
   */
  import { onMount } from 'svelte';
  import CoalPlantCard from '$lib/components/cards/CoalPlantCard.svelte';
  import type { CoalPlantUnit } from '$lib/components/cards/coal-plant-types';
  import {
    fetchCoalPlantLocation,
    getOwnershipGraph,
    resolveAssetId,
  } from './widget-api';
  import { errorMessage } from './widget-data';

  interface Props {
    id?: string;
    assetId?: string;
    tab?: string;
    theme?: 'light' | 'dark';
  }

  let { id, assetId, tab, theme = 'light' }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let units = $state<CoalPlantUnit[]>([]);
  let plantName = $state('');

  const sourceId = $derived((id || assetId || '').trim());

  async function resolveLocationId(inputId: string): Promise<string> {
    if (/^L\d+$/.test(inputId)) return inputId;
    if (/^L\d+_G\d+$/.test(inputId)) return inputId.split('_')[0];

    if (/^G\d+$/.test(inputId)) {
      const resolved = await resolveAssetId(inputId);
      if (/^L\d+_G\d+$/.test(resolved)) return resolved.split('_')[0];
      throw new Error(`Could not resolve ${inputId} to a coal plant location`);
    }

    throw new Error(`Unrecognized ID format: ${inputId}`);
  }

  onMount(async () => {
    if (!sourceId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      const locationId = await resolveLocationId(sourceId);
      const location = await fetchCoalPlantLocation(locationId);

      if (!location?.units?.length) {
        throw new Error(`No units found for location ${locationId}`);
      }

      units = location.units;
      plantName = location.asset_name || locationId;
    } catch (err) {
      error = errorMessage(err, 'Failed to load coal plant data');
    } finally {
      loading = false;
    }
  });
</script>

<div class="coal-plant-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading coal plant data...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
    </div>
  {:else if units.length > 0}
    <CoalPlantCard units={units} open={true} {tab} ownershipLoader={getOwnershipGraph} />
  {:else}
    <div class="embed-error">
      <p>No coal plant data available.</p>
    </div>
  {/if}
</div>

<style>
  .coal-plant-embed {
    width: 100%;
    max-width: 900px;
    font-family: var(--font-family);
  }

  .embed-loading,
  .embed-error {
    padding: var(--space-4);
    font-size: var(--font-size-body);
  }

  .embed-error {
    color: var(--color-error);
  }
</style>
