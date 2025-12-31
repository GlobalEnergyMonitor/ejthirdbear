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
  import { getTables } from '$lib/component-data/schema';
  import { parseOwnershipPaths } from '$lib/component-data/ownership-parser';
  import { SCHEMA_SQL, ASSET_SQL, escapeValue } from '$lib/component-data/sql-helpers';
  import { findIdColumn, findUnitIdColumn, extractAssetName } from '$lib/component-data/id-helpers';

  // Components
  import AssetMap from '$lib/components/AssetMap.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';
  import OwnershipHierarchy from '$lib/components/OwnershipHierarchy.svelte';
  // import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte'; // Replaced with AssetScreener
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import RelationshipNetwork from '$lib/components/RelationshipNetwork.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';

  // --- PROPS (from +page.server.js) ---
  let { data } = $props();

  // --- STATE ---
  let loading = $state(!data?.owners?.length);
  let error = $state(null);
  let mapHasLocation = $state(true);

  let assetId = $state(data?.assetId || '');
  let assetName = $state(data?.assetName || '');
  let owners = $state(data?.owners || []);
  let asset = $state(data?.asset || {});
  let tableName = $state(data?.tableName || '');
  let columns = $state(data?.columns || []);

  // --- COLUMN FINDERS (find columns by name pattern) ---
  const findCol = (pattern) => columns.find((c) => pattern.test(c.toLowerCase()));

  const statusCol = $derived(findCol(/^status$/));
  const countryCol = $derived(findCol(/^country$/));
  const trackerCol = $derived(findCol(/^tracker$/));
  const latCol = $derived(findCol(/^lat(itude)?$/));
  const lonCol = $derived(findCol(/^lon(gitude)?$/));
  const ownerCol = $derived(findCol(/^(owner|parent)$/));
  const ownershipPctCol = $derived(findCol(/share/));
  const ownerEntityIdCol = $derived(findCol(/owner gem entity id/));

  // --- DATA TRANSFORMS ---

  // Parse ownership paths into graph structure
  const ownershipGraph = $derived.by(() => {
    const parsed = parseOwnershipPaths(owners, assetId, assetName);
    return { ...parsed, nodeMap: new Map(parsed.nodes.map((n) => [n.id, n])) };
  });

  // Primary owner - no longer used after switching to AssetScreener
  // const primaryOwnerEntityId = $derived(
  //   ownerEntityIdCol && owners[0]?.[ownerEntityIdCol] ? owners[0][ownerEntityIdCol] : null
  // );

  // Status color for header styling
  const statusColor = $derived(colorByStatus.get(asset[statusCol]?.toLowerCase?.()) || colors.grey);

  // Total ownership percentage
  const totalOwnership = $derived(
    owners.reduce((sum, o) => sum + (Number(o[ownershipPctCol]) || 0), 0)
  );

  // Columns to show in "All Properties" section
  const hiddenCols = $derived(
    [
      'Status',
      'Country',
      'Tracker',
      'Latitude',
      'Longitude',
      'Parent',
      'Ownership Path',
      'Owner',
      ownershipPctCol,
      ownerEntityIdCol,
      'Immediate Project Owner',
      'Immediate Project Owner GEM Entity ID',
    ].filter(Boolean)
  );
  const otherCols = $derived(columns.filter((c) => !hiddenCols.includes(c)));

  // --- DATA FETCHING (client-side for dev mode) ---
  onMount(async () => {
    const paramsId = get(page)?.params?.id;

    // Redirect E-prefix IDs to entity page
    if (paramsId?.match(/^E\d+$/)) {
      goto(entityLink(paramsId), { replaceState: true });
      return;
    }

    // Skip fetch if we have server data
    if (data?.owners?.length) {
      loading = false;
      return;
    }

    // Dev mode: fetch from MotherDuck
    try {
      loading = true;
      if (!paramsId) throw new Error('Missing asset ID');
      assetId = paramsId;

      const md = await import('$lib/motherduck-wasm');
      const { assetTable } = await getTables();
      tableName = assetTable;

      const [schemaName, rawTable] = assetTable.split('.');
      const schemaResult = await md.default.query(SCHEMA_SQL(schemaName, rawTable));
      columns = schemaResult.data?.map((c) => c.column_name) ?? [];

      const idColumn = findUnitIdColumn(columns) || findIdColumn(columns) || columns[0];
      const dataResult = await md.default.query(
        ASSET_SQL(assetTable, idColumn, escapeValue(assetId))
      );

      if (!dataResult.success || !dataResult.data?.length)
        throw new Error(`Asset ${assetId} not found`);

      owners = dataResult.data;
      asset = dataResult.data[0] || {};
      assetName = extractAssetName(asset, assetId);
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
  <header>
    <span class="table-name">{tableName}</span>
  </header>

  {#if loading}
    <p class="loading">Fetching asset from MotherDuck…</p>
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
          tracker={asset[trackerCol]}
          metadata={{ country: asset[countryCol], status: asset[statusCol] }}
        />
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        {#if asset[statusCol]}
          <div class="meta-item">
            <span class="label">Status</span>
            <span class="value status-badge" style="--status-color: {statusColor}">
              <span class="status-dot"></span>
              {asset[statusCol]}
              <StatusIcon status={asset[statusCol]} size={12} />
            </span>
          </div>
        {/if}

        {#if asset[trackerCol]}
          <div class="meta-item">
            <span class="label">Tracker</span>
            <span class="value">
              <TrackerIcon tracker={asset[trackerCol]} size={14} showLabel variant="pill" />
            </span>
          </div>
        {/if}

        <div class="meta-item">
          <span class="label">Owners</span>
          <span class="value">{owners.length} record{owners.length !== 1 ? 's' : ''}</span>
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

        {#if asset[countryCol]}
          <div class="meta-item">
            <span class="label">Country</span>
            <span class="value">{asset[countryCol]}</span>
          </div>
        {/if}

        {#if asset[latCol] && asset[lonCol]}
          <div class="meta-item">
            <span class="label">Coordinates</span>
            <span class="value">{asset[latCol]}, {asset[lonCol]}</span>
          </div>
        {/if}
      </div>

      <!-- Owners Table -->
      <section class="owners-section">
        <h2>Ownership ({owners.length})</h2>
        <div class="owners-table-wrapper">
          <table class="owners-table">
            <thead>
              <tr>
                <th>Owner (Parent)</th>
                <th>Share</th>
                <th>Ownership Path</th>
                <th>Country</th>
              </tr>
            </thead>
            <tbody>
              {#each owners as owner}
                <tr>
                  <td class="owner-name">
                    <StatusIcon status={owner['Status']} size={10} />
                    {#if owner[ownerEntityIdCol]}
                      <a href={entityLink(owner[ownerEntityIdCol])} class="owner-link">
                        {owner['Parent'] || owner[ownerCol] || '—'}
                        <span class="owner-id">{owner[ownerEntityIdCol]}</span>
                      </a>
                    {:else}
                      {owner['Parent'] || owner[ownerCol] || '—'}
                    {/if}
                  </td>
                  <td class="owner-share">
                    {#if owner[ownershipPctCol]}
                      <span class="share-value">
                        <OwnershipPie
                          percentage={Number(owner[ownershipPctCol])}
                          size={18}
                          fillColor={colors.navy}
                        />
                        {Number(owner[ownershipPctCol]).toFixed(1)}%
                      </span>
                    {:else}—{/if}
                  </td>
                  <td class="ownership-path">{owner['Ownership Path'] || '—'}</td>
                  <td
                    >{owner['Parent Headquarters Country'] ||
                      owner['Parent Registration Country'] ||
                      '—'}</td
                  >
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Ownership Visualizations (only if we have edges) -->
      {#if ownershipGraph.edges.length > 0}
        <section class="viz-section">
          <h2>Ownership Structure</h2>
          <p class="viz-subtitle">Interactive flowchart showing ownership paths</p>
          <MermaidOwnership
            edges={ownershipGraph.edges}
            nodeMap={ownershipGraph.nodeMap}
            {assetId}
            {assetName}
            zoom={0.7}
            direction="TD"
          />
        </section>

        <section class="viz-section">
          <h2>Ownership Network</h2>
          <p class="viz-subtitle">Force-directed graph of entity relationships</p>
          <OwnershipHierarchy
            {assetId}
            {assetName}
            edges={ownershipGraph.edges}
            nodes={ownershipGraph.nodes}
            width={800}
            height={350}
          />
        </section>

        <section class="viz-section">
          <h2>Owner Portfolio</h2>
          <AssetScreener prebakedPortfolio={data?.ownerExplorerData} />
        </section>

        <section class="viz-section">
          <h2>Related Assets</h2>
          <p class="viz-subtitle">Same-owner assets and co-located units</p>
          <RelationshipNetwork prebakedData={data?.relationshipData} />
        </section>
      {/if}

      <!-- Location Map -->
      {#if mapHasLocation}
        <section class="viz-section">
          <h2>Location</h2>
          <AssetMap bind:hasLocation={mapHasLocation} />
        </section>
      {/if}

      <!-- All Properties -->
      {#if otherCols.length > 0}
        <section class="properties">
          <h2>All Properties</h2>
          <dl>
            {#each otherCols as col}
              {#if asset[col] != null && asset[col] !== ''}
                <div class="property">
                  <dt>{col}</dt>
                  <dd>{asset[col]}</dd>
                </div>
              {/if}
            {/each}
          </dl>
        </section>
      {/if}

      <!-- Raw JSON -->
      <section class="json-dump">
        <h2>Raw Data</h2>
        <details>
          <summary
            >{owners.length} records ({JSON.stringify({ assetId, owners }).length.toLocaleString()} bytes)</summary
          >
          <pre class="json-blob">{JSON.stringify(
              {
                meta: { assetId, assetName, tableName },
                asset,
                owners,
                ownershipGraph: { nodes: ownershipGraph.nodes, edges: ownershipGraph.edges },
              },
              null,
              2
            )}</pre>
        </details>
      </section>
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
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
  }
  .back-link {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .back-link:hover {
    text-decoration: none;
  }
  .table-name {
    font-size: 10px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Loading/Error */
  .loading {
    padding: 30px 0;
    color: #555;
  }
  .loading.error {
    color: #b10000;
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
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }
  .asset-id {
    font-size: 12px;
    color: #666;
    font-family: monospace;
    margin-bottom: 12px;
  }
  .page-actions {
    margin-bottom: 20px;
  }
  .viz-subtitle {
    font-size: 12px;
    color: #666;
    margin: -10px 0 15px 0;
    font-style: italic;
  }

  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    padding: 20px 0;
    margin-bottom: 40px;
    border-bottom: 1px solid #ddd;
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
    color: #999;
    font-weight: bold;
  }
  .value {
    font-size: 14px;
    color: #000;
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
    border-bottom: 1px solid #eee;
  }
  .owners-table th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: bold;
    border-bottom: 1px solid #000;
  }
  .owners-table tbody tr:hover {
    background: #fafafa;
  }
  .owner-name {
    font-weight: 500;
  }
  .owner-link {
    color: #000;
    text-decoration: underline;
  }
  .owner-link:hover {
    text-decoration: none;
  }
  .owner-id {
    display: block;
    font-size: 10px;
    color: #999;
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
  .ownership-path {
    font-size: 12px;
    color: #666;
    max-width: 300px;
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
    border-bottom: 1px solid #f0f0f0;
  }
  .property:last-child {
    border-bottom: none;
  }
  dt {
    font-size: 11px;
    font-weight: bold;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  dd {
    font-size: 13px;
    color: #000;
    margin: 0;
  }

  /* JSON Dump */
  .json-dump {
    margin-top: 60px;
    padding-top: 40px;
    border-top: 2px solid #000;
  }
  .json-dump h2 {
    font-family: monospace;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .json-dump details {
    background: #f8f8f8;
    border: 1px solid #ddd;
    border-radius: 4px;
  }
  .json-dump summary {
    padding: 12px 16px;
    cursor: pointer;
    font-family: monospace;
    font-size: 12px;
    color: #444;
    background: #f0f0f0;
  }
  .json-dump summary:hover {
    background: #e8e8e8;
  }
  .json-blob {
    margin: 0;
    padding: 20px;
    font-family: 'SFMono-Regular', Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    overflow: auto;
    background: #1e1e1e;
    color: #d4d4d4;
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
