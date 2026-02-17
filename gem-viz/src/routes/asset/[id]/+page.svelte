<script>
  // ============================================================================
  // ASSET DETAIL PAGE
  // Shows ownership records, visualizations, and metadata for a single asset
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { entityLink } from '$lib/links';
  import { colors, colorByStatus } from '$lib/design-tokens';
  import { fetchAssetData } from '$lib/asset-data';
  import { logApiFallback } from '$lib/api-fallback-log';

  // Components
  import AssetMap from '$lib/components/AssetMap.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';
  import RelationshipNetwork from '$lib/components/RelationshipNetwork.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';
  import { OwnershipTreeGraph, OwnershipSummaryTables } from '$lib/components/ownership';

  /**
   * @typedef {Object} AssetData
   * @property {string} id
   * @property {string} [name]
   * @property {string} [status]
   * @property {string} [tracker]
   * @property {string} [facilityType]
   * @property {string} [country]
   * @property {number} [lat]
   * @property {number} [lng]
   * @property {number} [latitude]
   * @property {number} [longitude]
   * @property {number} [capacity]
   * @property {Record<string, unknown>} [raw]
   */

  /**
   * @typedef {Object} GraphNode
   * @property {string} id
   * @property {string} [name]
   * @property {string} [Name]
   * @property {string} [type]
   */

  /**
   * @typedef {Object} GraphEdge
   * @property {string} source
   * @property {string} target
   * @property {number} [value]
   * @property {string} [type]
   * @property {number} [depth]
   */

  /**
   * @typedef {Object} GraphData
   * @property {GraphNode[]} nodes
   * @property {GraphEdge[]} edges
   * @property {Record<string, any[]>} [paths]
   */

  /**
   * @typedef {Object} PageData
   * @property {AssetData} [asset]
   * @property {GraphData} [graph]
   * @property {string} [assetId]
   * @property {boolean} [fromAPI]
   * @property {string} [apiError]
   */

  // --- PROPS (from +page.server.js) ---
  /** @type {{ data?: PageData }} */
  let { data } = $props();

  // --- STATE ---
  let loading = $state(!data?.asset);
  let error = $state(null);
  let mapHasLocation = $state(true);

  let asset = $state(data?.asset || null);
  let graph = $state(data?.graph || null);

  /** @type {'api' | 'motherduck' | 'local' | 'server' | null} */
  let dataSource = $state(data?.asset ? 'server' : null);

  const assetId = $derived(asset?.id || '');
  const assetName = $derived(asset?.name || assetId);

  // --- DATA TRANSFORMS ---
  const graphEdges = $derived(graph?.edges || []);
  const graphNodes = $derived(graph?.nodes || []);
  const graphPaths = $derived(graph?.paths || {});
  const nodeMap = $derived(new Map(graphNodes.map((n) => [n.id, n])));
  const ownerEdges = $derived(graphEdges.filter((e) => e.target === assetId));
  const ownerRows = $derived(
    ownerEdges.map((edge) => ({
      edge,
      owner: nodeMap.get(edge.source),
    }))
  );

  const statusColor = $derived(colorByStatus.get(asset?.status?.toLowerCase?.()) || colors.grey);

  const totalOwnership = $derived(
    ownerEdges.reduce((sum, edge) => sum + (Number(edge.value) || 0), 0)
  );

  const detailEntries = $derived(
    Object.entries(asset?.raw || {}).filter(([, value]) => value != null && value !== '')
  );

  // --- DATA FETCHING (client-side fallback) ---
  // Uses unified asset-data layer that handles both API and DuckDB sources
  onMount(async () => {
    const paramsId = $page?.params?.id || data?.assetId;

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

      // Use unified data layer - tries API first, falls back to DuckDB
      const result = await fetchAssetData(paramsId);

      if (result.source === 'none' || !result.asset) {
        throw new Error(result.error || `Asset '${paramsId}' not found`);
      }

      asset = result.asset;
      graph = result.graph;
      dataSource = result.source;
      console.log(`[${result.source.toUpperCase()}] Loaded asset ${paramsId}`);

      // Log fallback usage for API team reporting
      if (result.source === 'motherduck') {
        logApiFallback({
          assetId: paramsId,
          assetName: result.asset?.name || '',
          apiError: 'API returned 404 (ID format mismatch)',
          fallbackSource: 'motherduck',
          fallbackSuccess: true,
        });
      }
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
  <title>{assetName || assetId} — Global Energy Monitor</title>
  <meta
    name="description"
    content="Ownership details and corporate structure for {assetName ||
      assetId} from the Global Energy Monitor database."
  />
</svelte:head>

<main>
  {#if loading}
    <p class="loading">Fetching asset from Ownership API…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="asset-detail">
      <!-- Header -->
      <div class="header-row">
        <h1>{assetName || assetId}</h1>
        <DataSourceBadge source={dataSource} size="md" />
      </div>
      <p class="asset-id">GEM Unit ID: {assetId}</p>
      <div class="page-actions">
        <AddToCartButton
          id={assetId}
          name={assetName || assetId}
          type="asset"
          tracker={asset?.facilityType}
          metadata={{ country: asset?.country, status: asset?.status }}
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
          <div class="section-header-row">
            <h2>Ownership Structure</h2>
            <a
              href="/embed/ownership-graph?assetId={assetId}"
              class="embed-btn"
              target="_blank"
              rel="noopener"
              title="Embed this visualization">↗</a
            >
          </div>
          <div class="viz-tabs">
            <p class="viz-description">
              Interactive graph showing ownership hierarchy. Hover over nodes to highlight paths.
            </p>
            <OwnershipTreeGraph
              nodes={graphNodes}
              edges={graphEdges}
              paths={graphPaths}
              rootId={assetId}
              assetName={assetName}
            />
          </div>
        </section>

        <section class="viz-section">
          <h2>Ownership Summary</h2>
          <OwnershipSummaryTables nodes={graphNodes} edges={graphEdges} rootId={assetId} />
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
            >{ownerRows.length} records ({JSON.stringify({
              assetId,
              ownerRows,
            }).length.toLocaleString()} bytes)</summary
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
      <Citation
        variant="footer"
        trackers={asset?.facilityType ? [asset.facilityType] : []}
        {dataSource}
      />
    </article>
  {/if}

  <!-- Embed Link -->
  <a
    href="/embed/asset?id={assetId}"
    class="embed-link"
    target="_blank"
    rel="noopener"
    title="Open embeddable version"
  >
    Embed ↗
  </a>
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->

<style>
  /* Layout */
  main {
    width: 100%;
    max-width: 100%;
    padding: var(--space-10);
    overflow-x: hidden;
  }

  /* Loading/Error */
  .loading {
    padding: var(--space-8) 0;
    color: var(--color-gray-600);
  }
  .loading.error {
    color: var(--color-error);
  }

  /* Typography */
  .asset-detail {
    font-family: var(--font-family-serif);
  }
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  h1 {
    font-size: var(--font-size-3xl);
    font-weight: normal;
    margin: 0 0 var(--space-3) 0;
    line-height: var(--leading-tight);
  }
  h2 {
    font-size: var(--font-size-2xl);
    font-weight: normal;
    margin: var(--space-10) 0 var(--space-5) 0;
    border-bottom: var(--border-width) solid var(--color-border);
    padding-bottom: var(--space-3);
  }
  .asset-id {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
    margin-bottom: var(--space-3);
  }
  .page-actions {
    margin-bottom: var(--space-5);
  }

  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--space-5);
    padding: var(--space-5) 0;
    margin-bottom: var(--space-10);
    border-bottom: var(--border-width) solid var(--color-border);
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-tertiary);
    font-weight: bold;
  }
  .value {
    font-size: var(--font-size-lg);
    color: var(--color-black);
  }
  .status-badge {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: bold;
  }
  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--status-color, var(--color-gray-500));
  }
  .ownership-value {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* Owners Table */
  .owners-section {
    margin: var(--space-10) 0;
  }
  .owners-table-wrapper {
    overflow-x: auto;
  }
  .owners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-md);
  }
  .owners-table th,
  .owners-table td {
    padding: var(--space-3) var(--space-4);
    text-align: left;
    border-bottom: var(--border-width) solid var(--color-gray-100);
  }
  .owners-table th {
    font-size: var(--font-size-base);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-secondary);
    font-weight: bold;
    border-bottom: var(--border-width) solid var(--color-black);
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
    font-size: var(--font-size-base);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    margin-top: 2px;
  }
  .owner-share {
    white-space: nowrap;
  }
  .share-value {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  /* Viz Sections */
  .viz-section {
    margin: var(--space-10) 0;
  }
  .viz-section h2 {
    margin-top: 0;
  }
  .section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }
  .section-header-row h2 {
    margin: 0;
    border-bottom: none;
    padding-bottom: 0;
  }
  .embed-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--gem-mint, #97E6DE);
    color: var(--gem-navy, #1a3a4a);
    font-size: var(--font-size-sm);
    font-weight: 700;
    text-decoration: none;
    border-radius: 4px;
    opacity: 0.6;
    transition: all 0.15s ease;
  }
  .embed-btn:hover {
    opacity: 1;
    background: var(--gem-teal, #2a7f8f);
    color: white;
  }
  .viz-description {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }
  .viz-tabs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* Properties */
  .properties dl {
    display: grid;
    gap: var(--space-4);
    overflow: hidden;
  }
  .property {
    display: grid;
    grid-template-columns: minmax(120px, 200px) minmax(0, 1fr);
    gap: var(--space-5);
    padding: var(--space-3) 0;
    border-bottom: var(--border-width) solid var(--color-gray-100);
    max-width: 100%;
  }
  .property:last-child {
    border-bottom: none;
  }
  dt {
    font-size: var(--font-size-sm);
    font-weight: bold;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
  }
  dd {
    font-size: var(--font-size-md);
    color: var(--color-black);
    margin: 0;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  /* JSON Dump */
  .json-dump {
    margin-top: var(--space-16);
    padding-top: var(--space-10);
    border-top: 2px solid var(--color-black);
  }
  .json-dump h2 {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-lg);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .json-dump details {
    background: var(--color-gray-50);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .json-dump summary {
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-body);
    color: var(--color-gray-600);
    background: var(--color-gray-100);
  }
  .json-dump summary:hover {
    background: var(--color-gray-200);
  }
  .json-blob {
    margin: 0;
    padding: var(--space-5);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    line-height: var(--leading-relaxed);
    overflow: auto;
    background: var(--gem-midnight);
    color: var(--color-gray-200);
    max-height: 600px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .meta-grid {
      grid-template-columns: 1fr;
    }
    .property {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }

  /* Embed Link */
  .embed-link {
    position: fixed;
    bottom: var(--space-4);
    right: var(--space-4);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-decoration: none;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .embed-link:hover {
    opacity: 1;
    color: var(--color-black);
  }
</style>
