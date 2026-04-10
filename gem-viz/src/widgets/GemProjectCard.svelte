<script lang="ts">
  /**
   * GemProjectCard — Shadow DOM widget for tabbed asset detail card.
   * Mirrors embed/project-card/+page.svelte.
   */
  import { onMount } from 'svelte';
  import { getAsset, resolveAssetId } from './widget-api';
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';
  import { errorMessage } from './widget-data';
  import type { Asset } from '$lib/factsheet/types';

  interface Props {
    assetId: string;
    theme?: 'light' | 'dark';
  }

  let { assetId, theme = 'light' }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let asset = $state<Asset | null>(null);

  function toStr(v: unknown): string | undefined {
    return v != null ? String(v) : undefined;
  }
  function toNum(v: unknown): number | undefined {
    const n = Number(v);
    return isFinite(n) ? n : undefined;
  }

  onMount(async () => {
    if (!assetId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }
    try {
      const resolvedId = await resolveAssetId(assetId);
      const data = await getAsset(resolvedId);
      const raw = data.raw || {};
      const primaryOwner = data.owners?.[0];
      asset = {
        id: data.id,
        name: data.name || assetId,
        locationId: data.locationId ?? undefined,
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
      } as Asset;
    } catch (err) {
      error = errorMessage(err, 'Failed to load asset');
    } finally {
      loading = false;
    }
  });
</script>

<div class="project-card-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading asset...</div>
  {:else if error}
    <div class="embed-error"><p>{error}</p></div>
  {:else if asset}
    <ProjectCard {asset} variant="full" open={true} showLink={true} />
  {:else}
    <div class="embed-error"><p>No data found</p></div>
  {/if}
</div>

<style>
  .project-card-embed {
    width: 100%;
    font-family: var(--font-family);
  }
</style>
