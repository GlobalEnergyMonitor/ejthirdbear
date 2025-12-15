<script>
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { link, entityLink } from '$lib/links';

  // Check if this looks like an entity ID (starts with E) instead of asset ID (starts with G)
  function isLikelyEntityId(id) {
    return id && /^E\d+$/.test(id);
  }
  import AssetMap from '$lib/components/AssetMap.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';
  import MermaidOwnership from '$lib/components/MermaidOwnership.svelte';
  import OwnershipHierarchy from '$lib/components/OwnershipHierarchy.svelte';
  import OwnershipExplorerD3 from '$lib/components/OwnershipExplorerD3.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import { getTables } from '$lib/component-data/schema';
  import { parseOwnershipPaths } from '$lib/component-data/ownership-parser';
  import { SCHEMA_SQL, ASSET_SQL, escapeValue } from '$lib/component-data/sql-helpers';
  import { findIdColumn, findUnitIdColumn, extractAssetName } from '$lib/component-data/id-helpers';
  import { colors, colorByStatus, colorByTracker } from '$lib/ownership-theme';

  // Server data from +page.server.js (prerendered)
  let { data } = $props();

  // Initialize from server data if available
  let loading = $state(!data?.owners?.length);
  let error = $state(null);

  let assetId = $state(data?.assetId || '');
  let assetName = $state(data?.assetName || '');
  let owners = $state(data?.owners || []);
  let asset = $state(data?.asset || {});
  let tableName = $state(data?.tableName || '');
  let columns = $state(data?.columns || []);
  let svgs = $state(data?.svgs || { map: null, capacity: null, status: null });
  let mapHasLocation = $state(true);

  // Use shared ownership parser and add nodeMap for component compatibility
  const ownershipGraph = $derived.by(() => {
    const parsed = parseOwnershipPaths(owners, assetId, assetName);
    return {
      ...parsed,
      nodeMap: new Map(parsed.nodes.map((n) => [n.id, n])),
    };
  });

  const nameCol = $derived(
    columns.find((c) => {
      const lower = c.toLowerCase();
      return (
        lower === 'mine' ||
        lower === 'plant' ||
        lower === 'project' ||
        lower === 'facility' ||
        lower === 'mine name' ||
        lower === 'plant name' ||
        lower === 'project name'
      );
    })
  );
  const statusCol = $derived(columns.find((c) => c.toLowerCase() === 'status'));
  const ownerCol = $derived(
    columns.find((c) => c.toLowerCase() === 'owner' || c.toLowerCase() === 'parent')
  );
  const countryCol = $derived(columns.find((c) => c.toLowerCase() === 'country'));
  const latCol = $derived(
    columns.find((c) => c.toLowerCase() === 'latitude' || c.toLowerCase() === 'lat')
  );
  const lonCol = $derived(
    columns.find((c) => c.toLowerCase() === 'longitude' || c.toLowerCase() === 'lon')
  );
  const gemLocationIdCol = $derived(
    columns.find((c) => c.toLowerCase() === 'gem location id')
  );
  const ownershipPctCol = $derived(columns.find((c) => c.toLowerCase().includes('share')));
  const trackerCol = $derived(columns.find((c) => c.toLowerCase() === 'tracker'));
  const ownerEntityIdCol = $derived(
    columns.find((c) => c.toLowerCase() === 'owner gem entity id')
  );

  // Get primary owner entity ID for OwnershipExplorerD3
  const primaryOwnerEntityId = $derived(
    ownerEntityIdCol && owners[0]?.[ownerEntityIdCol] ? owners[0][ownerEntityIdCol] : null
  );

  const statusValue = $derived(
    statusCol && asset[statusCol] ? String(asset[statusCol]).toLowerCase() : null
  );
  const statusColor = $derived(
    statusValue ? colorByStatus.get(statusValue) || colors.grey : colors.grey
  );

  const trackerValue = $derived(trackerCol && asset[trackerCol] ? asset[trackerCol] : null);
  const trackerColor = $derived(
    trackerValue ? colorByTracker.get(trackerValue) || colors.orange : colors.orange
  );

  const totalOwnership = $derived(
    owners.reduce((sum, o) => {
      const share = ownershipPctCol && o[ownershipPctCol] ? Number(o[ownershipPctCol]) : 0;
      return sum + share;
    }, 0)
  );

  const ownerSpecificCols = $derived(
    [
      ownerCol,
      ownershipPctCol,
      ownerEntityIdCol,
      'Ownership Path',
      'Immediate Project Owner',
      'Immediate Project Owner GEM Entity ID',
    ].filter(Boolean)
  );
  const specialCols = $derived(
    [nameCol, statusCol, countryCol, latCol, lonCol, ...ownerSpecificCols].filter(Boolean)
  );
  const otherCols = $derived(columns.filter((c) => !specialCols.includes(c)));

  onMount(async () => {
    const paramsId = get(page)?.params?.id;

    // Redirect if this looks like an entity ID instead of asset ID
    if (isLikelyEntityId(paramsId)) {
      console.log(`[Asset] Redirecting ${paramsId} to entity page (E-prefix = entity ID)`);
      goto(entityLink(paramsId), { replaceState: true });
      return;
    }

    // If we have server data, skip client-side fetch
    if (data?.owners?.length) {
      loading = false;
      return;
    }

    // Dev mode or missing data - fetch from MotherDuck client-side
    try {
      loading = true;
      error = null;

      if (!paramsId) throw new Error('Missing asset ID');
      assetId = paramsId;

      // Dynamic import to avoid SSR Worker error
      const md = await import('$lib/motherduck-wasm');
      const motherduck = md.default;

      const { assetTable } = await getTables();
      tableName = assetTable;
      const [schemaName, rawTable] = assetTable.split('.');

      const schemaResult = await motherduck.query(SCHEMA_SQL(schemaName, rawTable));
      columns = schemaResult.data?.map((c) => c.column_name) ?? [];

      // Use centralized ID column finder
      const idColumn = findUnitIdColumn(columns) || findIdColumn(columns) || columns[0];

      const dataResult = await motherduck.query(
        ASSET_SQL(assetTable, idColumn, escapeValue(assetId))
      );

      if (!dataResult.success || !dataResult.data?.length) {
        throw new Error(`Asset ${assetId} not found`);
      }

      owners = dataResult.data;
      asset = dataResult.data[0] || {};
      assetName = extractAssetName(asset, assetId);
    } catch (err) {
      console.error('Asset detail load error:', err);
      error = err?.message || 'Failed to load asset';
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>{assetName || assetId} — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href={link('asset')} class="back-link">← All Assets</a>
    <span class="table-name">{tableName}</span>
  </header>

  {#if loading}
    <p class="loading">Fetching asset directly from MotherDuck…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="asset-detail">
      <h1>{assetName || assetId}</h1>
      <p class="asset-id">GEM Unit ID: {assetId}</p>

      <div class="meta-grid">
        {#if statusCol && asset[statusCol]}
          <div class="meta-item">
            <span class="label">Status</span>
            <span class="value status-badge" style="--status-color: {statusColor}">
              <span class="status-dot"></span>
              {asset[statusCol]}
              <StatusIcon status={asset[statusCol]} size={12} />
            </span>
          </div>
        {/if}

        {#if trackerCol && asset[trackerCol]}
          <div class="meta-item">
            <span class="label">Tracker</span>
            <span class="value">
              <TrackerIcon tracker={asset[trackerCol]} size={14} showLabel variant="pill" />
            </span>
          </div>
        {/if}

        <div class="meta-item">
          <span class="label">Owners</span>
          <span class="value">{owners.length} ownership record{owners.length !== 1 ? 's' : ''}</span
          >
        </div>

        {#if totalOwnership > 0}
          <div class="meta-item">
            <span class="label">Total Tracked Ownership</span>
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

        {#if countryCol && asset[countryCol]}
          <div class="meta-item">
            <span class="label">Country</span>
            <span class="value">{asset[countryCol]}</span>
          </div>
        {/if}

        {#if latCol && lonCol && asset[latCol] && asset[lonCol]}
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
                    {#if ownerEntityIdCol && owner[ownerEntityIdCol]}
                      <a href={entityLink(owner[ownerEntityIdCol])} class="owner-link">
                        {owner['Parent'] || owner[ownerCol] || '—'}
                        <span class="owner-id">{owner[ownerEntityIdCol]}</span>
                      </a>
                    {:else}
                      {owner['Parent'] || owner[ownerCol] || '—'}
                    {/if}
                  </td>
                  <td class="owner-share">
                    {#if ownershipPctCol && owner[ownershipPctCol]}
                      <span class="share-value">
                        <OwnershipPie
                          percentage={Number(owner[ownershipPctCol])}
                          size={18}
                          fillColor={colors.navy}
                        />
                        {Number(owner[ownershipPctCol]).toFixed(1)}%
                      </span>
                    {:else}
                      —
                    {/if}
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

      <!-- Ownership Visualization: Mermaid Flowchart -->
      {#if ownershipGraph.edges.length > 0}
        <section class="ownership-viz-section">
          <h2>Ownership Structure</h2>
          <p class="viz-subtitle">Interactive flowchart showing ownership paths to this asset</p>
          <MermaidOwnership
            edges={ownershipGraph.edges}
            nodeMap={ownershipGraph.nodeMap}
            {assetId}
            {assetName}
            zoom={0.7}
            direction="TD"
          />
        </section>

        <!-- Ownership Visualization: Force-directed Hierarchy -->
        <section class="ownership-viz-section">
          <h2>Ownership Network</h2>
          <p class="viz-subtitle">Force-directed graph showing entity relationships</p>
          <OwnershipHierarchy
            {assetId}
            {assetName}
            edges={ownershipGraph.edges}
            nodes={ownershipGraph.nodes}
            width={800}
            height={350}
          />
        </section>

        <section class="ownership-explorer">
          <h2>Owner Explorer</h2>
          <OwnershipExplorerD3 ownerEntityId={primaryOwnerEntityId} />
        </section>
      {/if}

      <!-- Interactive location map - hidden entirely if no location found -->
      <!-- AssetMap fetches its own data from URL params and GeoJSON -->
      {#if mapHasLocation}
        <section class="map-section">
          <h2>Location</h2>
          <AssetMap bind:hasLocation={mapHasLocation} />
        </section>
      {/if}

      <!-- Pre-baked server-side SVGs - zero client overhead! -->
      {#if svgs && (svgs.map || svgs.capacity || svgs.status)}
        <section class="viz-section">
          <h2>Visualizations</h2>
          <div class="viz-grid">
            {#if svgs.map}
              <div class="viz-item">
                <h3>Location Map</h3>
                {@html svgs.map}
              </div>
            {/if}

            {#if svgs.status}
              <div class="viz-item inline-badge">
                <h3>Status</h3>
                {@html svgs.status}
              </div>
            {/if}

            {#if svgs.capacity}
              <div class="viz-item">
                <h3>Capacity</h3>
                {@html svgs.capacity}
              </div>
            {/if}
          </div>
        </section>
      {/if}

      {#if otherCols.length > 0}
        <section class="properties">
          <h2>All Properties</h2>
          <dl>
            {#each otherCols as col}
              {#if asset[col] !== null && asset[col] !== undefined && asset[col] !== ''}
                <div class="property">
                  <dt>{col}</dt>
                  <dd>{asset[col]}</dd>
                </div>
              {/if}
            {/each}
          </dl>
        </section>
      {/if}

      <!-- Raw JSON Data Dump -->
      <section class="json-dump">
        <h2>Raw Data (JSON)</h2>
        <p class="json-subtitle">Complete asset data for developers, debugging, and data nerds</p>
        <details>
          <summary
            >Show {owners.length} ownership record{owners.length !== 1 ? 's' : ''} as JSON ({JSON.stringify(
              { assetId, assetName, tableName, owners }
            ).length.toLocaleString()} bytes)</summary
          >
          <pre class="json-blob">{JSON.stringify(
              {
                meta: {
                  assetId,
                  assetName,
                  tableName,
                  totalOwners: owners.length,
                  columns,
                },
                asset,
                owners,
                ownershipGraph: {
                  nodes: ownershipGraph.nodes,
                  edges: ownershipGraph.edges,
                },
              },
              null,
              2
            )}</pre>
        </details>
      </section>
    </article>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 40px;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
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

  .loading {
    padding: 30px 0 10px 0;
    color: #555;
  }

  .loading.error {
    color: #b10000;
  }

  .asset-detail {
    font-family: Georgia, serif;
  }

  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 30px 0;
    line-height: 1.2;
  }

  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
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

  .value.status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: bold;
  }

  .status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--status-color, #808080);
    flex-shrink: 0;
  }

  .tracker-badge {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tracker-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--tracker-color, #fe4f2d);
    flex-shrink: 0;
  }

  .ownership-value {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .properties dl {
    display: grid;
    grid-template-columns: 1fr;
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

  .map-section {
    margin: 40px 0;
  }

  .map-section h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 0 0 20px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .viz-section {
    margin: 40px 0;
    padding: 20px;
    background: #fafafa;
    border: 1px solid #ddd;
  }

  :global(.resolved-id) {
    font-size: 11px;
    color: #555;
    margin-top: -20px;
    margin-bottom: 20px;
  }

  .viz-section h2 {
    margin-top: 0;
  }

  .viz-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 30px;
    margin-top: 20px;
  }

  .viz-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .viz-item.inline-badge {
    align-items: flex-start;
  }

  .viz-item h3 {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    margin: 0;
  }

  .viz-item :global(svg) {
    max-width: 100%;
    height: auto;
  }

  :global(.ownership-section) {
    margin: 40px 0;
    border: 1px solid #000;
  }

  :global(.ownership-header) {
    padding: 20px;
    background: #fafafa;
    border-bottom: 1px solid #ddd;
  }

  :global(.ownership-header h2) {
    margin: 0 0 4px 0;
    font-size: 18px;
    font-weight: normal;
    border: none;
    padding: 0;
  }

  :global(.ownership-subtitle) {
    font-size: 12px;
    color: #666;
  }

  :global(.ownership-content) {
    padding: 20px;
  }

  :global(.ownership-loading),
  :global(.ownership-error) {
    padding: 40px;
    text-align: center;
    color: #666;
  }

  :global(.ownership-error) {
    color: red;
  }

  :global(.ownership-stats) {
    display: flex;
    gap: 30px;
    margin-bottom: 20px;
    padding: 15px;
    background: #f5f5f5;
    font-size: 13px;
  }

  :global(.ownership-stats strong) {
    font-size: 18px;
    display: block;
  }

  :global(.ownership-chart-wrapper) {
    overflow-x: auto;
    padding: 10px 0;
  }

  .asset-id {
    font-size: 12px;
    color: #666;
    font-family: monospace;
    margin-bottom: 20px;
  }

  .owners-section {
    margin: 40px 0;
  }

  .owners-table-wrapper {
    overflow-x: auto;
    border: 1px solid #ddd;
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
    background: #fafafa;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
    font-weight: bold;
    border-bottom: 1px solid #ddd;
  }

  .owners-table tbody tr:hover {
    background: #f9f9f9;
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

  .ownership-viz-section {
    margin: 40px 0;
  }

  .ownership-viz-section h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 0 0 10px 0;
    border-bottom: 1px solid #ddd;
    padding-bottom: 10px;
  }

  .viz-subtitle {
    font-size: 12px;
    color: #666;
    margin: 0 0 15px 0;
    font-style: italic;
  }

  /* Status icon styles ported from Observable */
  :global(.status-icon) {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  :global(.status-icon-proposed) {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #eeb100;
  }

  :global(.status-icon-cancelled),
  :global(.status-icon-retired) {
    width: 8px;
    height: 8px;
    position: relative;
  }

  :global(.status-icon-cancelled::before),
  :global(.status-icon-cancelled::after),
  :global(.status-icon-retired::before),
  :global(.status-icon-retired::after) {
    content: '';
    position: absolute;
    width: 8px;
    height: 1.5px;
    background-color: #808080;
    top: 50%;
    left: 0;
    transform: translateY(-50%) rotate(45deg);
  }

  :global(.status-icon-cancelled::after),
  :global(.status-icon-retired::after) {
    transform: translateY(-50%) rotate(-45deg);
  }

  :global(.status-icon-retired::before),
  :global(.status-icon-retired::after) {
    background-color: #483c5a;
  }

  /* JSON Data Dump Styles */
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
    margin-bottom: 8px;
  }

  .json-subtitle {
    font-size: 12px;
    color: #666;
    margin-bottom: 15px;
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
    user-select: none;
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
  }

  .json-dump summary:hover {
    background: #e8e8e8;
  }

  .json-dump details[open] summary {
    border-bottom: 1px solid #ddd;
  }

  .json-blob {
    margin: 0;
    padding: 20px;
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    font-size: 11px;
    line-height: 1.5;
    overflow-x: auto;
    background: #1e1e1e;
    color: #d4d4d4;
    white-space: pre;
    max-height: 600px;
    overflow-y: auto;
  }

  .ownership-explorer {
    margin-top: 32px;
  }

  @media (max-width: 768px) {
    .property {
      grid-template-columns: 1fr;
      gap: 5px;
    }

    .meta-grid {
      grid-template-columns: 1fr;
    }

    .viz-grid {
      grid-template-columns: 1fr;
    }

    :global(.ownership-stats) {
      flex-direction: column;
      gap: 10px;
    }
  }
</style>
