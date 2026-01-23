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
  import { colors, colorByStatus } from '$lib/design-tokens';
  import { getAsset, getOwnershipGraph } from '$lib/ownership-api';
  import { widgetQuery } from '$lib/widgets/widget-utils';
  import { logApiFallback } from '$lib/api-fallback-log';

  // Components
  import AssetMap from '$lib/components/AssetMap.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';
  import RelationshipNetwork from '$lib/components/RelationshipNetwork.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import Citation from '$lib/components/Citation.svelte';

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

  const statusColor = $derived(colorByStatus.get(asset?.status?.toLowerCase?.()) || colors.grey);

  const totalOwnership = $derived(
    ownerEdges.reduce((sum, edge) => sum + (Number(edge.value) || 0), 0)
  );

  const detailEntries = $derived(
    Object.entries(asset?.raw || {}).filter(([, value]) => value != null && value !== '')
  );

  // --- DUCKDB FALLBACK ---
  /**
   * Load asset data from local DuckDB/parquet when API fails
   * @param {string} assetId
   * @returns {Promise<{asset: AssetData, graph: GraphData}>}
   */
  async function loadFromDuckDB(assetId) {
    // Query local parquet data for this asset
    const assetSql = `
      SELECT DISTINCT
        "GEM unit ID" as id,
        "Project" as name,
        "Tracker" as tracker,
        "Status" as status,
        "Capacity (MW)" as capacity,
        "Owner" as owner
      FROM ownership
      WHERE "GEM unit ID" = '${assetId}'
      LIMIT 1
    `;

    const ownersSql = `
      SELECT
        "Owner" as ownerName,
        "Owner GEM Entity ID" as ownerEntityId,
        "Share" as share,
        "Ownership Path" as ownershipPath
      FROM ownership
      WHERE "GEM unit ID" = '${assetId}'
        AND "Owner" IS NOT NULL
    `;

    const locationSql = `
      SELECT
        l."Latitude" as latitude,
        l."Longitude" as longitude,
        l."Country.Area" as country
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      WHERE o."GEM unit ID" = '${assetId}'
        AND l."Latitude" IS NOT NULL
      LIMIT 1
    `;

    const [assetResult, ownersResult, locationResult] = await Promise.all([
      widgetQuery(assetSql),
      widgetQuery(ownersSql),
      widgetQuery(locationSql),
    ]);

    if (!assetResult.success || !assetResult.data?.length) {
      throw new Error(`Asset '${assetId}' not found in local data`);
    }

    const assetRow = assetResult.data[0];
    const location = locationResult.data?.[0] || {};
    const owners = ownersResult.data || [];

    // Build asset object
    /** @type {AssetData} */
    const assetData = {
      id: String(assetRow.id || ''),
      name: String(assetRow.name || ''),
      facilityType: String(assetRow.tracker || ''),
      status: String(assetRow.status || ''),
      capacity: assetRow.capacity != null ? Number(assetRow.capacity) : undefined,
      country: location.country ? String(location.country) : undefined,
      latitude: location.latitude != null ? Number(location.latitude) : undefined,
      longitude: location.longitude != null ? Number(location.longitude) : undefined,
      raw: assetRow,
    };

    // Build simple graph with owners
    /** @type {GraphNode[]} */
    const nodes = [
      { id: String(assetId), Name: String(assetRow.name || ''), type: 'asset' },
      ...owners.map((o) => ({
        id: String(o.ownerEntityId || `owner-${o.ownerName}`),
        Name: String(o.ownerName || ''),
        type: 'entity',
      })),
    ];

    /** @type {GraphEdge[]} */
    const edges = owners.map((o) => ({
      source: String(o.ownerEntityId || `owner-${o.ownerName}`),
      target: String(assetId),
      value: Number(o.share) || 0,
    }));

    /** @type {{ asset: AssetData, graph: GraphData }} */
    const result = { asset: assetData, graph: { nodes, edges } };
    return result;
  }

  // --- DATA FETCHING (client-side fallback) ---
  onMount(async () => {
    const paramsId = get(page)?.params?.id || data?.assetId;

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

      // Try API first
      try {
        const [assetData, graphData] = await Promise.all([
          getAsset(paramsId),
          getOwnershipGraph({ root: paramsId, direction: 'up', max_depth: 12 }),
        ]);

        asset = assetData;
        graph = graphData;
        console.log(`[API] Loaded asset ${paramsId} from API`);
      } catch (apiError) {
        // API failed - try DuckDB fallback
        let fallbackSuccess = false;
        let assetName = '';

        try {
          const duckdbData = await loadFromDuckDB(paramsId);
          asset = duckdbData.asset;
          graph = duckdbData.graph;
          assetName = duckdbData.asset?.name || '';
          fallbackSuccess = true;
          console.log(`[DuckDB] Loaded asset ${paramsId} from local parquet`);
        } catch (duckdbError) {
          // Both failed
          console.error(`[FALLBACK FAILED] Asset ${paramsId} not found in API or DuckDB`);

          // Log the complete failure
          logApiFallback({
            assetId: paramsId,
            apiError: apiError?.message || 'API returned 404',
            fallbackSource: 'none',
            fallbackSuccess: false,
          });

          throw duckdbError;
        }

        // Log successful fallback for API team reporting
        logApiFallback({
          assetId: paramsId,
          assetName,
          apiError: apiError?.message || 'API returned 404 (ID format mismatch)',
          fallbackSource: 'duckdb',
          fallbackSuccess,
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
            {nodeMap}
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
    padding: var(--space-10);
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

  /* Properties */
  .properties dl {
    display: grid;
    gap: var(--space-4);
  }
  .property {
    display: grid;
    grid-template-columns: 250px 1fr;
    gap: var(--space-5);
    padding: var(--space-3) 0;
    border-bottom: var(--border-width) solid var(--color-gray-100);
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
      gap: var(--space-1);
    }
  }
</style>
