<script>
  import { assetLink } from '$lib/links';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import {
    fetchAssetBasics,
    fetchSameOwnerAssets,
    fetchCoLocatedAssets,
    fetchOwnershipChain,
    fetchOwnerStats,
  } from '$lib/component-data/schema';

  let loading = $state(true);
  let error = $state<string | null>(null);
  let ownershipChain = $state([]);
  let sameOwnerAssets = $state([]);
  let coLocatedAssets = $state([]);
  let ownerStats = $state(null);
  let currentAsset = $state({});

  onMount(async () => {
    const params = get(page)?.params ?? {};
    const assetId = params.id || null;
    if (!assetId) {
      error = 'Missing asset ID';
      loading = false;
      return;
    }

    const basics = await fetchAssetBasics(assetId);
    if (!basics) {
      error = `Asset ${assetId} not found`;
      loading = false;
      return;
    }
    currentAsset = basics;

    const [chain, sameOwnerRes, coLocatedRes, stats] = await Promise.all([
      fetchOwnershipChain(assetId),
      basics.ownerEntityId
        ? fetchSameOwnerAssets(basics.ownerEntityId, assetId)
        : Promise.resolve({ success: true, data: [] }),
      basics.locationId
        ? fetchCoLocatedAssets(basics.locationId, assetId)
        : Promise.resolve({ success: true, data: [] }),
      basics.ownerEntityId ? fetchOwnerStats(basics.ownerEntityId) : Promise.resolve(null),
    ]);

    ownershipChain = chain || [];
    sameOwnerAssets = sameOwnerRes.success ? sameOwnerRes.data || [] : [];
    coLocatedAssets = coLocatedRes.success ? coLocatedRes.data || [] : [];
    ownerStats = stats;
    error = sameOwnerRes.success && coLocatedRes.success ? null : 'Failed to load relationships';
    loading = false;
  });

  // Format capacity with commas
  function formatCapacity(mw) {
    if (!mw) return 'N/A';
    return `${Math.round(mw).toLocaleString()} MW`;
  }

  // Status color coding
  function statusClass(status) {
    const s = status?.toLowerCase() || '';
    if (s.includes('operating')) return 'status-operating';
    if (s.includes('retired')) return 'status-retired';
    if (s.includes('construction')) return 'status-construction';
    if (s.includes('cancelled')) return 'status-cancelled';
    return 'status-other';
  }
</script>

{#if loading}
  <div class="loading">Loading relationships...</div>
{:else if error}
  <div class="error">{error}</div>
{:else}
  {#if ownershipChain && ownershipChain.length > 1}
    <section class="ownership-network">
      <h2>🏢 Ownership Network</h2>

      <div class="ownership-flow">
        {#each ownershipChain as node, i}
          <div class="chain-node" class:is-asset={i === ownershipChain.length - 1}>
            <div class="entity-name">{node.name}</div>
            {#if node.share !== null}
              <div class="ownership-share">{node.share}%</div>
            {/if}
          </div>

          {#if i < ownershipChain.length - 1}
            <div class="chain-arrow">
              <svg width="40" height="20" viewBox="0 0 40 20">
                <line x1="0" y1="10" x2="30" y2="10" stroke="#666" stroke-width="2" />
                <polygon points="30,5 40,10 30,15" fill="#666" />
              </svg>
            </div>
          {/if}
        {/each}
      </div>

      {#if ownerStats}
        <div class="portfolio-summary">
          <span class="stat">
            <strong>{ownerStats.total_assets?.toLocaleString()}</strong> total assets
          </span>
          {#if ownerStats.total_capacity_mw}
            <span class="stat">
              <strong>{formatCapacity(ownerStats.total_capacity_mw)}</strong> capacity
            </span>
          {/if}
          <span class="stat">
            <strong>{ownerStats.countries}</strong>
            {ownerStats.countries === 1 ? 'country' : 'countries'}
          </span>
        </div>
      {/if}
    </section>
  {/if}

  {#if sameOwnerAssets && sameOwnerAssets.length > 0}
    <section class="related-assets">
      <h2>🔗 Other Assets by {currentAsset.Owner || 'Same Owner'}</h2>

      <div class="asset-grid">
        {#each sameOwnerAssets as asset}
          <a href={assetLink(asset['GEM unit ID'])} class="asset-card">
            <div class="asset-header">
              <div class="asset-name">{asset.Project}</div>
              <div class="asset-status {statusClass(asset.Status)}">{asset.Status}</div>
            </div>
            <div class="asset-meta">
              {#if asset['Capacity (MW)']}
                <span class="capacity">{formatCapacity(asset['Capacity (MW)'])}</span>
              {/if}
              {#if asset.Tracker}
                <span class="tracker">{asset.Tracker}</span>
              {/if}
            </div>
          </a>
        {/each}
      </div>

      {#if ownerStats && ownerStats.total_assets > sameOwnerAssets.length}
        <div class="view-more">
          Showing {sameOwnerAssets.length} of {ownerStats.total_assets} assets
        </div>
      {/if}
    </section>
  {/if}

  {#if coLocatedAssets && coLocatedAssets.length > 0}
    <section class="co-located">
      <h2>📍 Co-Located Assets</h2>
      <p class="location-note">
        {coLocatedAssets.length + 1}
        {coLocatedAssets.length === 0 ? 'unit' : 'units'} at this location
        {#if coLocatedAssets.some((a) => a['Capacity (MW)'])}
          • Combined capacity: {formatCapacity(
            coLocatedAssets.reduce(
              (sum, a) => sum + (a['Capacity (MW)'] || 0),
              currentAsset.capacityMw || 0
            )
          )}
        {/if}
      </p>

      <div class="asset-list">
        {#each coLocatedAssets as asset}
          <a href={assetLink(asset['GEM unit ID'])} class="list-item">
            <span class="item-name">{asset.Project}</span>
            <span class="item-meta">
              {#if asset['Capacity (MW)']}
                <span class="capacity">{formatCapacity(asset['Capacity (MW)'])}</span>
              {/if}
              <span class="status {statusClass(asset.Status)}">{asset.Status}</span>
            </span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  /* Ownership Network */
  .ownership-network {
    margin: 40px 0;
    padding: 30px;
    background: #f8f8f8;
    border: 1px solid #ddd;
  }

  h2 {
    font-size: 16px;
    font-weight: bold;
    margin: 0 0 20px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ownership-flow {
    display: flex;
    align-items: center;
    gap: 0;
    overflow-x: auto;
    padding: 20px 0;
    margin-bottom: 20px;
  }

  .chain-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 15px 20px;
    background: white;
    border: 2px solid #000;
    min-width: 140px;
    min-height: 80px;
  }

  .chain-node.is-asset {
    background: #000;
    color: white;
  }

  .entity-name {
    font-size: 11px;
    font-weight: bold;
    text-align: center;
    line-height: 1.3;
  }

  .ownership-share {
    font-size: 14px;
    margin-top: 5px;
    color: #666;
  }

  .chain-node.is-asset .ownership-share {
    color: #ccc;
  }

  .chain-arrow {
    display: flex;
    align-items: center;
    padding: 0 5px;
  }

  .portfolio-summary {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    padding: 15px;
    background: white;
    border: 1px solid #ddd;
    font-size: 12px;
  }

  .stat {
    display: flex;
    gap: 5px;
  }

  /* Related Assets */
  .related-assets {
    margin: 40px 0;
  }

  .asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 15px;
    margin-top: 20px;
  }

  .asset-card {
    display: block;
    padding: 15px;
    background: white;
    border: 1px solid #ddd;
    text-decoration: none;
    color: inherit;
    transition: all 0.2s;
  }

  .asset-card:hover {
    border-color: #000;
    box-shadow: 2px 2px 0 #000;
    transform: translate(-1px, -1px);
  }

  .asset-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 10px;
    margin-bottom: 10px;
  }

  .asset-name {
    font-size: 13px;
    font-weight: bold;
    line-height: 1.3;
    flex: 1;
  }

  .asset-status {
    font-size: 9px;
    text-transform: uppercase;
    padding: 3px 6px;
    border-radius: 2px;
    font-weight: bold;
    white-space: nowrap;
  }

  .status-operating {
    background: #4caf50;
    color: white;
  }
  .status-retired {
    background: #999;
    color: white;
  }
  .status-construction {
    background: #ff9800;
    color: white;
  }
  .status-cancelled {
    background: #f44336;
    color: white;
  }
  .status-other {
    background: #2196f3;
    color: white;
  }

  .asset-meta {
    display: flex;
    gap: 10px;
    font-size: 11px;
    color: #666;
  }

  .capacity {
    font-weight: bold;
    color: #000;
  }

  .tracker {
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .view-more {
    margin-top: 15px;
    padding: 10px;
    text-align: center;
    font-size: 11px;
    color: #666;
    background: #f5f5f5;
    border: 1px solid #ddd;
  }

  /* Co-Located Assets */
  .co-located {
    margin: 40px 0;
  }

  .location-note {
    font-size: 12px;
    color: #666;
    margin: 10px 0 20px 0;
    padding: 10px;
    background: #f8f8f8;
    border-left: 3px solid #000;
  }

  .asset-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: #ddd;
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background: white;
    text-decoration: none;
    color: inherit;
    transition: background 0.2s;
  }

  .list-item:hover {
    background: #f5f5f5;
  }

  .item-name {
    font-size: 13px;
    font-weight: 500;
  }

  .item-meta {
    display: flex;
    gap: 15px;
    align-items: center;
    font-size: 11px;
  }

  .item-meta .status {
    padding: 3px 6px;
    border-radius: 2px;
    font-weight: bold;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .ownership-flow {
      flex-direction: column;
      align-items: stretch;
    }

    .chain-arrow {
      transform: rotate(90deg);
      padding: 10px 0;
    }

    .asset-grid {
      grid-template-columns: 1fr;
    }

    .list-item {
      flex-direction: column;
      align-items: start;
      gap: 10px;
    }
  }
</style>
