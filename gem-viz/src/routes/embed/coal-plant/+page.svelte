<script lang="ts">
  /**
   * Embeddable Coal Plant Card
   * Renders the full CoalPlantCard (6-tab detail view) in embed mode.
   *
   * URL params:
   *   id    - Required. Asset ID (G-prefix or compound L_G) OR location ID (L-prefix)
   *   tab   - Optional. Initial tab: overview, timeline, coal, emissions, ownership, details
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { fetchCoalPlantLocation, resolveAssetId } from '$lib/ownership-api';
  import type { CoalPlantUnit } from '$lib/components/cards/coal-plant-types';
  import CoalPlantCard from '$lib/components/cards/CoalPlantCard.svelte';
  import { errorMessage } from '../embed-utils';

  // URL params
  const assetId = $derived($page.url.searchParams.get('id'));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let units = $state<CoalPlantUnit[]>([]);
  let plantName = $state('');

  /**
   * Resolve any ID format to a location ID:
   *  - L-prefix: use directly (it's already a location ID)
   *  - G-prefix: resolve to compound L_G, extract L-prefix
   *  - Compound L_G: extract L-prefix
   */
  async function resolveLocationId(id: string): Promise<string> {
    // Already a location ID
    if (/^L\d+$/.test(id)) return id;

    // Compound format — extract location part
    if (/^L\d+_G\d+$/.test(id)) return id.split('_')[0];

    // G-prefix — resolve to compound, then extract
    if (/^G\d+$/.test(id)) {
      const resolved = await resolveAssetId(id);
      if (/^L\d+_G\d+$/.test(resolved)) return resolved.split('_')[0];
      throw new Error(`Could not resolve ${id} to a coal plant location`);
    }

    throw new Error(`Unrecognized ID format: ${id}`);
  }

  onMount(async () => {
    if (!assetId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      const locationId = await resolveLocationId(assetId);
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

<svelte:head>
  <title>{plantName || assetId || 'Coal Plant'} — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="embed-wrapper">
  {#if loading}
    <div class="embed-loading">Loading coal plant data…</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !assetId}
        <p class="embed-hint">Example: ?id=G100000102961 or ?id=L100000104107</p>
      {/if}
    </div>
  {:else if units.length > 0}
    <CoalPlantCard {units} open={true} />
  {/if}
</div>

<style>
  .embed-wrapper {
    width: 100%;
    max-width: 900px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }
</style>
