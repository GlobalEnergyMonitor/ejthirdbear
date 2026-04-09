<script lang="ts">
  /**
   * Embeddable Asset Card
   * Compact asset profile with status, metadata, and owners.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   id - Required. Asset ID (GEM unit ID)
   *   showOwners - Optional. Show owners table (default: true)
   *   showMap - Optional. Show location map (default: false)
   *
   * Hash params: id, showOwners, showMap
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { entityLink } from '$lib/links';
  import { colors, colorByStatus } from '$lib/design-tokens';
  import { getAsset, getOwnershipGraph, resolveAssetId } from '$lib/ownership-api';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import OwnershipPie from '$lib/components/charts/OwnershipPie.svelte';
  import AssetMap from '$lib/components/map/AssetMap.svelte';
  import { errorMessage, boolParam, readHash } from '../embed-utils';

  // URL params (converted to $state so hash can override on mount)
  let assetId = $state($page.url.searchParams.get('id'));
  let showOwners = $state(boolParam($page.url.searchParams.get('showOwners')));
  let showMap = $state(boolParam($page.url.searchParams.get('showMap'), false));

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let asset = $state<any>(null);
  let graph = $state<any>(null);
  let resolvedId = $state<string | null>(null);
  let mapHasLocation = $state(true);

  const assetName = $derived(asset?.name || assetId || '');
  const statusColor = $derived(colorByStatus.get(asset?.status?.toLowerCase?.()) || colors.grey);

  const graphEdges = $derived(graph?.edges || []);
  const graphNodes = $derived(graph?.nodes || []);
  const nodeMap = $derived(new Map(graphNodes.map((n: any) => [n.id, n])));
  const ownerEdges = $derived(graphEdges.filter((e: any) => e.target === (resolvedId || assetId)));
  const ownerRows = $derived(
    ownerEdges.map((edge: any) => ({
      edge,
      owner: nodeMap.get(edge.source),
    }))
  );

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.id) assetId = h.id;
    if (h.showOwners !== undefined) showOwners = boolParam(h.showOwners);
    if (h.showMap !== undefined) showMap = boolParam(h.showMap, false);

    if (!assetId) {
      error = 'Missing required parameter: id';
      loading = false;
      return;
    }

    try {
      resolvedId = await resolveAssetId(assetId);
      const [assetData, graphData] = await Promise.all([
        getAsset(resolvedId),
        getOwnershipGraph({ root: resolvedId, direction: 'up' }),
      ]);
      asset = assetData;
      graph = graphData;
    } catch (err) {
      error = errorMessage(err, 'Failed to load asset');
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{assetName} — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="asset-embed">
  {#if loading}
    <div class="embed-loading">Loading asset...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
      {#if !assetId}
        <p class="embed-hint">Example: ?id=G12345</p>
      {/if}
    </div>
  {:else}
    <header class="asset-header">
      <h1>{assetName}</h1>
      <p class="asset-id">{assetId}</p>
    </header>

    <div class="meta-row">
      {#if asset?.status}
        <span class="meta-chip status" style="--status-color: {statusColor}">
          <StatusIcon status={asset.status} size={12} />
          {asset.status}
        </span>
      {/if}
      {#if asset?.facilityType}
        <span class="meta-chip">{asset.facilityType}</span>
      {/if}
      {#if asset?.capacity}
        <span class="meta-chip">{Number(asset.capacity).toLocaleString()} MW</span>
      {/if}
      {#if asset?.country}
        <span class="meta-chip">{asset.country}</span>
      {/if}
    </div>

    {#if showOwners && ownerRows.length > 0}
      <div class="owners-section">
        <h2>Owners ({ownerRows.length})</h2>
        <div class="owners-list">
          {#each ownerRows as row}
            <a href={entityLink(row.edge.source)} class="owner-row" target="_blank" rel="noopener">
              <span class="owner-name">{row.owner?.Name || row.edge.source}</span>
              {#if row.edge.value != null}
                <span class="owner-share">
                  <OwnershipPie
                    percentage={Number(row.edge.value)}
                    size={16}
                    fillColor={colors.navy}
                  />
                  {Number(row.edge.value).toFixed(1)}%
                </span>
              {/if}
            </a>
          {/each}
        </div>
      </div>
    {/if}

    {#if showMap && mapHasLocation}
      <div class="map-section">
        <AssetMap {assetId} bind:hasLocation={mapHasLocation} />
      </div>
    {/if}
  {/if}
</div>

<style>
  .asset-embed {
    width: 100%;
    max-width: 500px;
    font-family: var(--font-family-sans);
  }

  .asset-header {
    margin-bottom: var(--space-3);
  }

  h1 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin: 0 0 var(--space-1) 0;
  }

  .asset-id {
    font-size: var(--font-size-sm);
    font-family: var(--font-family-mono);
    color: var(--color-text-tertiary);
    margin: 0;
  }

  .meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-4);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    font-size: var(--font-size-sm);
    background: var(--color-bg-tertiary);
    border: var(--border-width) solid var(--color-border);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .meta-chip.status {
    border-left: 3px solid var(--status-color);
  }

  h2 {
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }

  .owners-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .owner-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border-light);
    text-decoration: none;
    color: inherit;
    font-size: var(--font-size-body);
    transition: border-color var(--transition-fast);
  }

  .owner-row:hover {
    border-color: var(--color-border-dark);
  }

  .owner-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .owner-share {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .map-section {
    margin-top: var(--space-4);
    height: 200px;
  }

  @media (max-width: 640px) {
    .asset-embed {
      max-width: 100%;
      padding: 8px;
    }

    h1 {
      font-size: var(--font-size-lg);
    }

    .meta-row {
      flex-wrap: wrap;
    }

    .owner-row {
      flex-wrap: wrap;
      gap: var(--space-1);
    }
  }
</style>
