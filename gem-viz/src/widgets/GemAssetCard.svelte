<script lang="ts">
  /**
   * GemAssetCard — Dynamic embed widget for asset profiles.
   * Mirrors embed/asset/+page.svelte but uses widget-api.
   */
  import { onMount } from 'svelte';
  import { entityLink, navigate as navTo } from './widget-links';
  import { getAsset, getOwnershipGraph, resolveAssetId } from './widget-api';
  import { errorMessage } from './widget-data';
  import { colorByStatus, colors } from '$lib/design-tokens';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import OwnershipPie from '$lib/components/charts/OwnershipPie.svelte';

  interface Props {
    assetId: string;
    showOwners?: boolean;
    showMap?: boolean;
    linkBase?: string;
    linkTarget?: string;
    theme?: 'light' | 'dark';
  }

  let { assetId, showOwners = true, showMap = false, linkBase = '', linkTarget = '', theme = 'light' }: Props = $props();

  let loading = $state(true);
  let error = $state<string | null>(null);
  let asset = $state<any>(null);
  let graph = $state<any>(null);
  let resolvedId = $state<string | null>(null);

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
    if (!assetId) {
      error = 'Missing required parameter: assetId';
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

<div class="asset-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading asset...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
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

    {#if showMap && asset?.latitude && asset?.longitude}
      <div class="map-section">
        <div class="map-placeholder" style="height: 200px; background: var(--color-bg-tertiary); display: flex; align-items: center; justify-content: center; font-size: var(--font-size-sm); color: var(--color-text-tertiary); border: var(--border-width) solid var(--color-border);">
          {asset.latitude.toFixed(4)}, {asset.longitude.toFixed(4)} — {asset.country || 'Unknown'}
        </div>
      </div>
    {/if}

    {#if showOwners && ownerRows.length > 0}
      <div class="owners-section">
        <h2>Owners ({ownerRows.length})</h2>
        <div class="owners-list">
          {#each ownerRows as row}
            <a href={entityLink(row.edge.source, linkBase)} class="owner-row" target="_blank" rel="noopener" onclick={(e) => { if (linkTarget) { e.preventDefault(); navTo(entityLink(row.edge.source, linkBase), linkTarget); } }}>
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
  {/if}
</div>

<style>
  .asset-embed {
    width: 100%;
    max-width: 500px;
    font-family: var(--font-family);
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
  .map-section {
    margin-bottom: var(--space-4);
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
</style>
