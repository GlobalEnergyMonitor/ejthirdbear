<script>
  // ============================================================================
  // ASSET DETAIL PAGE
  // Shows ownership records, visualizations, and metadata for a single asset
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { entityLink } from '$lib/links';
  import { colors, colorByStatus } from '$lib/ownership-theme';
  import { getAsset, getOwnershipGraph } from '$lib/ownership-api';

  // Components
  import AssetMap from '$lib/components/AssetMap.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';
  import RelationshipNetwork from '$lib/components/RelationshipNetwork.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import ExternalLinks from '$lib/components/ExternalLinks.svelte';

  // --- PROPS (from +page.server.js) ---
  let { data } = $props();

  // --- STATE ---
  let loading = $state(!data?.asset);
  let error = $state(null);
  let mapHasLocation = $state(true);

  let asset = $state(data?.asset || null);
  let graph = $state(data?.graph || null);

  const assetId = $derived(asset?.id || '');
  const assetName = $derived(asset?.name || assetId);

  // --- DATA TRANSFORMS ---
  const graphEdges = $derived(graph?.edges || []);
  const graphNodes = $derived(graph?.nodes || []);
  const nodeMap = $derived(new Map(graphNodes.map((n) => [n.id, n])));
  const ownerEdges = $derived(graphEdges.filter((e) => e.target === assetId));
  const ownerRows = $derived(
    ownerEdges.map((edge) => ({
      edge,
      owner: nodeMap.get(edge.source),
    }))
  );

  const statusColor = $derived(
    colorByStatus.get(asset?.status?.toLowerCase?.()) || colors.grey
  );

  const totalOwnership = $derived(
    ownerEdges.reduce((sum, edge) => sum + (Number(edge.value) || 0), 0)
  );

  const detailEntries = $derived(
    Object.entries(asset?.raw || {}).filter(([, value]) => value != null && value !== '')
  );

  // --- DATA FETCHING (client-side fallback) ---
  onMount(async () => {
    const paramsId = get(page)?.params?.id;

    // Redirect E-prefix IDs to entity page
    if (paramsId?.match(/^E\d+$/)) {
      goto(entityLink(paramsId), { replaceState: true });
      return;
    }

    // Skip fetch if we have server data
    if (data?.asset && data?.graph) {
      loading = false;
      return;
    }

    try {
      loading = true;
      if (!paramsId) throw new Error('Missing asset ID');

      const [assetData, graphData] = await Promise.all([
        getAsset(paramsId),
        getOwnershipGraph({ root: paramsId, direction: 'up', max_depth: 12 }),
      ]);

      asset = assetData;
      graph = graphData;
      // assetId and assetName are $derived from asset, so they update automatically
    } catch (err) {
      error = err?.message || 'Failed to load asset';
    } finally {
      loading = false;
    }
  });
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>{assetName || assetId} — GEM Viz</title>
</svelte:head>

<main>
  {#if loading}
    <p class="loading">Fetching asset from Ownership API…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="asset-detail">
      <!-- Header -->
      <h1>{assetName || assetId}</h1>
      <p class="asset-id">GEM Unit ID: {assetId}</p>
      <div class="page-actions">
        <AddToCartButton
          id={assetId}
          name={assetName || assetId}
          type="asset"
          tracker={asset?.facilityType}
          metadata={{ country: asset?.country, status: asset?.status }}
        />
        <ExternalLinks
          type="asset"
          name={assetName}
          country={asset?.country}
          lat={asset?.latitude}
          lon={asset?.longitude}
        />
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        {#if asset?.status}
          <div class="meta-item">
            <span class="label">Status</span>
            <span class="value status-badge" style="--status-color: {statusColor}">
              <span class="status-dot"></span>
              {asset.status}
              <StatusIcon status={asset.status} size={12} />
            </span>
          </div>
        {/if}

        {#if asset?.facilityType}
          <div class="meta-item">
            <span class="label">Facility Type</span>
            <span class="value">{asset.facilityType}</span>
          </div>
        {/if}

        <div class="meta-item">
          <span class="label">Owners</span>
          <span class="value">{ownerEdges.length} record{ownerEdges.length !== 1 ? 's' : ''}</span>
        </div>

        {#if totalOwnership > 0}
          <div class="meta-item">
            <span class="label">Total Ownership</span>
            <span class="value ownership-value">
              <OwnershipPie
                percentage={Math.min(totalOwnership, 100)}
                size={24}
                fillColor={colors.navy}
              />
              <span>{totalOwnership.toFixed(1)}%</span>
            </span>
          </div>
        {/if}

        {#if asset?.country}
          <div class="meta-item">
            <span class="label">Country</span>
            <span class="value">{asset.country}</span>
          </div>
        {/if}

        {#if asset?.latitude && asset?.longitude}
          <div class="meta-item">
            <span class="label">Coordinates</span>
            <span class="value">{asset.latitude}, {asset.longitude}</span>
          </div>
        {/if}
      </div>

      <!-- Owners Table -->
      <section class="owners-section">
        <h2>Ownership ({ownerRows.length})</h2>
        <div class="owners-table-wrapper">
          <table class="owners-table">
            <thead>
              <tr>
                <th>Owner</th>
                <th>Share</th>
                <th>Depth</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {#each ownerRows as row}
                <tr>
                  <td class="owner-name">
                    <a href={entityLink(row.edge.source)} class="owner-link">
                      {row.owner?.Name || row.edge.source}
                      <span class="owner-id">{row.edge.source}</span>
                    </a>
                  </td>
                  <td class="owner-share">
                    {#if row.edge.value != null}
                      <span class="share-value">
                        <OwnershipPie
                          percentage={Number(row.edge.value)}
                          size={18}
                          fillColor={colors.navy}
                        />
                        {Number(row.edge.value).toFixed(1)}%
                      </span>
                    {:else}—{/if}
                  </td>
                  <td>{row.edge.depth ?? '—'}</td>
                  <td>{row.edge.type || '—'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Ownership Visualizations (only if we have edges) -->
      {#if graphEdges.length > 0}
        <section class="viz-section">
          <h2>Ownership Structure</h2>
          <MermaidOwnership
            edges={graphEdges}
            nodeMap={nodeMap}
            {assetId}
            {assetName}
            zoom={0.7}
            direction="TD"
          />
        </section>

        <section class="viz-section">
          <h2>Related Assets</h2>
          <RelationshipNetwork />
        </section>
      {/if}

      <!-- Location Map -->
      {#if mapHasLocation}
        <section class="viz-section">
          <h2>Location</h2>
          <AssetMap bind:hasLocation={mapHasLocation} />
        </section>
      {/if}

      <!-- Additional Details -->
      {#if detailEntries.length > 0}
        <section class="properties">
          <h2>Additional Details</h2>
          <dl>
            {#each detailEntries as entry}
              <div class="property">
                <dt>{entry[0]}</dt>
                <dd>{entry[1]}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/if}

      <!-- Source Data -->
      <section class="json-dump">
        <h2>Source Data</h2>
        <details>
          <summary
            >{ownerRows.length} records ({JSON.stringify({ assetId, ownerRows }).length.toLocaleString()} bytes)</summary
          >
          <pre class="json-blob">{JSON.stringify(
              {
                meta: { assetId, assetName },
                asset,
                graph,
              },
              null,
              2
            )}</pre>
        </details>
      </section>

      <!-- Citation -->
      <Citation variant="footer" trackers={asset?.facilityType ? [asset.facilityType] : []} />
    </article>
  {/if}
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->

<style>
  /* Layout */
  main {
    width: 100%;
    padding: 40px;
  }

  /* Loading/Error */
  .loading {
    padding: 30px 0;
    color: var(--color-gray-600);
  }
  .loading.error {
    color: var(--color-error);
  }

  /* Typography */
  .asset-detail {
    font-family: Georgia, serif;
  }
  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 10px 0;
    line-height: 1.2;
  }
  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 10px;
  }
  .asset-id {
    font-size: 12px;
    color: var(--color-text-secondary);
    font-family: monospace;
    margin-bottom: 12px;
  }
  .page-actions {
    margin-bottom: 20px;
  }

  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    padding: 20px 0;
    margin-bottom: 40px;
    border-bottom: 1px solid var(--color-border);
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-tertiary);
    font-weight: bold;
  }
  .value {
    font-size: 14px;
    color: var(--color-black);
  }
  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
  }
  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--status-color, #808080);
  }
  .ownership-value {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Owners Table */
  .owners-section {
    margin: 40px 0;
  }
  .owners-table-wrapper {
    overflow-x: auto;
  }
  .owners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .owners-table th,
  .owners-table td {
    padding: 12px 15px;
    text-align: left;
    border-bottom: 1px solid var(--color-gray-100);
  }
  .owners-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    font-weight: bold;
    border-bottom: 1px solid var(--color-black);
  }
  .owners-table tbody tr:hover {
    background: var(--color-gray-50);
  }
  .owner-name {
    font-weight: 500;
  }
  .owner-link {
    color: var(--color-black);
    text-decoration: underline;
  }
  .owner-link:hover {
    text-decoration: none;
  }
  .owner-id {
    display: block;
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-family: monospace;
    margin-top: 2px;
  }
  .owner-share {
    white-space: nowrap;
  }
  .share-value {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  /* Viz Sections */
  .viz-section {
    margin: 40px 0;
  }
  .viz-section h2 {
    margin-top: 0;
  }

  /* Properties */
  .properties dl {
    display: grid;
    gap: 15px;
  }
  .property {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: 20px;
    padding: 12px 0;
    border-bottom: 1px solid var(--color-gray-100);
  }
  .property:last-child {
    border-bottom: none;
  }
  dt {
    font-size: 11px;
    font-weight: bold;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  dd {
    font-size: 13px;
    color: var(--color-black);
    margin: 0;
  }

  /* JSON Dump */
  .json-dump {
    margin-top: 60px;
    padding-top: 40px;
    border-top: 2px solid var(--color-black);
  }
  .json-dump h2 {
    font-family: monospace;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .json-dump details {
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }
  .json-dump summary {
    padding: 12px 16px;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
    color: var(--color-gray-600);
    background: var(--color-gray-100);
  }
  .json-dump summary:hover {
    background: var(--color-gray-200);
  }
  .json-blob {
    margin: 0;
    padding: 20px;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    overflow: auto;
    background: var(--color-code-bg, #1e1e1e);
    color: var(--color-code-text, #d4d4d4);
    max-height: 600px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .meta-grid {
      grid-template-columns: 1fr;
    }
    .property {
      grid-template-columns: 1fr;
      gap: 5px;
    }
  }
</style>
