<script lang="ts">
  /**
   * Embeddable Project Card
   * Renders a single ProjectCard in embed mode.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   id       - Required. Asset ID (GEM unit ID or G-prefix)
   *   showMap  - Optional. Show location map (default: true)
   *   showOwnership - Optional. Show ownership tree (default: true)
   *
   * Hash params: id, showMap, showOwnership
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getAsset, resolveAssetId } from '$lib/ownership-api';
  import type { Asset } from '$lib/factsheet';
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';
  import ProjectCardMap from '$lib/components/map/ProjectCardMap.svelte';
  import { AssetOwnershipTree } from '$lib/components/ownership';
  import { errorMessage, boolParam, readHash } from '../embed-utils';

  // URL params (converted to $state so hash can override on mount)
  let assetId = $state($page.url.searchParams.get('id'));
  let showMap = $state(boolParam($page.url.searchParams.get('showMap')));
  let showOwnership = $state(boolParam($page.url.searchParams.get('showOwnership')));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let asset = $state<Asset | null>(null);
  let resolvedId = $state<string | null>(null);

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.id) assetId = h.id;
    if (h.showMap !== undefined) showMap = boolParam(h.showMap);
    if (h.showOwnership !== undefined) showOwnership = boolParam(h.showOwnership);

    if (!assetId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      resolvedId = await resolveAssetId(assetId);
      const data = await getAsset(resolvedId);

      // Map API response to factsheet Asset type
      const raw = data.raw || {};
      const primaryOwner = data.owners?.[0];
      asset = {
        id: data.id,
        name: data.name || assetId,
        status: data.status || '',
        capacity: data.capacity ?? undefined,
        capacityUnit: data.capacityUnit ?? undefined,
        country: data.country ?? undefined,
        lat: data.latitude ?? undefined,
        lon: data.longitude ?? undefined,
        owner: data.ownerName ?? primaryOwner?.name ?? undefined,
        ownershipShare: primaryOwner?.ownershipShare ?? undefined,
        parent: data.parentName ?? undefined,
        tracker: data.facilityType ?? undefined,
        state: toStr(raw['Subnational unit (province, state)'] ?? raw['State'] ?? raw['state']),
        startYear: toNum(raw['Start year'] ?? raw['start_year']),
        technology: toStr(raw['Technology'] ?? raw['technology']),
        coalType: toStr(raw['Coal type'] ?? raw['coal_type']),
        mineType: toStr(raw['Mine type'] ?? raw['mine_type']),
        miningMethod: toStr(raw['Mining method'] ?? raw['mining_method']),
        wikiUrl: toStr(raw['Wiki URL'] ?? raw['wiki_url']),
        location: toStr(raw['Location'] ?? raw['location']),
        unitName: toStr(raw['Unit Name'] ?? raw['unit_name']),
        database: toStr(raw['Database'] ?? raw['database'] ?? raw['source_file']),
        plantAge: toNum(raw['Plant age (years)'] ?? raw['plant_age']),
        remainingLifetime: toNum(raw['Remaining lifetime (years)'] ?? raw['remaining_lifetime']),
        plannedRetirement: toNum(raw['Planned retirement'] ?? raw['planned_retirement']),
        capacityFactor: toNum(raw['Capacity factor'] ?? raw['capacity_factor']),
        annualCO2: toNum(raw['Annual CO2 (million tonnes / annum)'] ?? raw['annual_co2']),
        lifetimeCO2: toNum(raw['Lifetime CO2 (million tonnes)'] ?? raw['lifetime_co2']),
        heatRate: toNum(raw['Heat rate (Btu per kWh)'] ?? raw['heat_rate']),
        production: toNum(raw['Production'] ?? raw['production']),
        productionUnit: toStr(raw['Production unit'] ?? raw['production_unit']),
        raw,
      };
    } catch (err) {
      error = errorMessage(err, 'Failed to load asset');
    } finally {
      loading = false;
    }
  });

  function toStr(v: unknown): string | undefined {
    return v != null && v !== '' ? String(v) : undefined;
  }

  function toNum(v: unknown): number | undefined {
    if (v == null || v === '') return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  }
</script>

<svelte:head>
  <title>{asset?.name || assetId || 'Project Card'} — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="embed-wrapper">
  {#if loading}
    <div class="embed-loading">Loading asset...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !assetId}
        <p class="embed-hint">Example: ?id=G100001000201</p>
      {/if}
    </div>
  {:else if asset}
    <ProjectCard {asset} variant="full" open={true} showLink={true}>
      {#snippet ownership()}
        {#if showOwnership && resolvedId}
          <AssetOwnershipTree assetId={resolvedId} />
        {/if}
      {/snippet}
      {#snippet map()}
        {#if showMap && asset.lat != null && asset.lon != null}
          <ProjectCardMap lat={asset.lat} lon={asset.lon} name={asset.name} />
        {/if}
      {/snippet}
    </ProjectCard>
  {/if}
</div>

<style>
  .embed-wrapper {
    width: 100%;
    max-width: 600px;
  }

  /* loading/error/hint styles provided by EmbedShell */
</style>
