<script>
  /**
   * Downloads — centralized export hub for GEM data.
   * Three sections: Investigation Cart exports, Bulk dataset downloads, Filtered export links.
   */
  import { link } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';
  import {
    fetchCombinedCSV,
    fetchAssetsAsCSV,
    fetchEntityAssetsAsCSV,
    assetsToCSV,
    assetsToGeoJSON,
    downloadFile,
  } from '$lib/components/cart/export-panel-utils';
  import { paginateAssetsByType, getAssetTypeCounts, SLUG_TO_API_TYPE } from '$lib/ownership-api';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import {
    Download,
    Package,
    Filter,
    ArrowRight,
    FileSpreadsheet,
    MapPin,
    Braces,
  } from 'lucide-svelte';
  import { onMount } from 'svelte';

  // --- Investigation Cart ---
  const cartItems = $derived($investigationCart);
  const cartCount = $derived(cartItems.length);
  const assetIds = $derived(cartItems.filter((i) => i.type === 'asset').map((i) => i.id));
  const entityIds = $derived(cartItems.filter((i) => i.type === 'entity').map((i) => i.id));

  let cartExporting = $state('');
  let cartProgress = $state('');

  async function exportCart(mode) {
    cartExporting = mode;
    cartProgress = 'Starting...';
    try {
      let result;
      const onProgress = (msg) => (cartProgress = msg);
      if (mode === 'all') {
        result = await fetchCombinedCSV(assetIds, entityIds, onProgress);
      } else if (mode === 'assets') {
        result = await fetchAssetsAsCSV(assetIds, onProgress);
      } else if (mode === 'entities') {
        result = await fetchEntityAssetsAsCSV(entityIds, onProgress);
      }
      if (result) {
        const date = new Date().toISOString().split('T')[0];
        await downloadFile(result.csv, `gem-cart-${mode}-${date}.csv`, 'text/csv');
        cartProgress = `Done — ${result.rowCount.toLocaleString()} rows`;
      }
    } catch (e) {
      cartProgress = `Error: ${e.message}`;
    } finally {
      setTimeout(() => {
        cartExporting = '';
        cartProgress = '';
      }, 3000);
    }
  }

  // --- Bulk Downloads ---
  const TRACKER_SLUGS = [
    { slug: 'coal-plant', label: 'Coal Plant' },
    { slug: 'oil-gas-plant', label: 'Oil & Gas Plant' },
    { slug: 'bioenergy-plant', label: 'Bioenergy Plant' },
    { slug: 'gas-pipeline', label: 'Gas Pipeline' },
    { slug: 'cement-plant', label: 'Cement Plant' },
    { slug: 'oil-pipeline', label: 'Oil Pipeline' },
    { slug: 'iron-steel-plant', label: 'Iron & Steel Plant' },
    { slug: 'iron-ore-mine', label: 'Iron Ore Mine' },
  ];

  /** @type {Map<string, number>} */
  let assetCounts = $state(new Map());
  let countsLoading = $state(true);

  onMount(async () => {
    try {
      assetCounts = await getAssetTypeCounts();
    } catch {
      // counts stay empty
    } finally {
      countsLoading = false;
    }
  });

  function getCount(slug) {
    const apiType = SLUG_TO_API_TYPE[slug];
    if (!apiType) return null;
    return assetCounts.get(apiType) ?? null;
  }

  let dlSlug = $state('');
  let dlFormat = $state('');
  let dlProgress = $state('');

  async function bulkDownload(slug, format) {
    dlSlug = slug;
    dlFormat = format;
    dlProgress = 'Fetching...';
    try {
      const allAssets = [];
      const total = getCount(slug);

      for await (const batch of paginateAssetsByType(slug, { limit: 500 })) {
        allAssets.push(...batch);
        const totalStr = total ? ` / ${total.toLocaleString()}` : '';
        dlProgress = `${allAssets.length.toLocaleString()}${totalStr} assets`;
      }

      const date = new Date().toISOString().split('T')[0];
      if (format === 'csv') {
        const csv = assetsToCSV(allAssets);
        await downloadFile(csv, `gem-${slug}-${date}.csv`, 'text/csv');
      } else if (format === 'geojson') {
        const geojson = assetsToGeoJSON(allAssets);
        await downloadFile(geojson, `gem-${slug}-${date}.geojson`, 'application/geo+json');
      } else if (format === 'json') {
        const json = JSON.stringify(allAssets, null, 2);
        await downloadFile(json, `gem-${slug}-${date}.json`, 'application/json');
      }

      dlProgress = `Done — ${allAssets.length.toLocaleString()} assets`;
    } catch (e) {
      dlProgress = `Error: ${e.message}`;
    } finally {
      setTimeout(() => {
        dlSlug = '';
        dlFormat = '';
        dlProgress = '';
      }, 3000);
    }
  }
</script>

<svelte:head>
  <title>Downloads — GEM Viz</title>
  <meta
    name="description"
    content="Export ownership data as CSV, JSON, and GeoJSON across all GEM energy trackers."
  />
  <SeoMeta
    title="Downloads — Global Energy Monitor"
    description="Export ownership data as CSV, JSON, and GeoJSON across all GEM energy trackers."
    image="/og/downloads.png"
  />
</svelte:head>

<div class="page-container">
  <PageHeader
    breadcrumbs={[{ label: 'GEM Viz', href: link('index') }, { label: 'Downloads' }]}
    title="Downloads"
    lead="Export GEM data as CSV, GeoJSON, or JSON. Download full tracker datasets or export your report."
  />

  <!-- Section A: Investigation Cart -->
  <section class="section">
    <h2><Package size={18} /> Report</h2>
    {#if cartCount > 0}
      <p class="section-desc">
        {cartCount} item{cartCount !== 1 ? 's' : ''} in report ({assetIds.length} asset{assetIds.length !==
        1
          ? 's'
          : ''}, {entityIds.length} entit{entityIds.length !== 1 ? 'ies' : 'y'}).
        <a href={link('report')}>Manage report</a>
      </p>
      <div class="btn-row">
        <button
          class="btn btn--primary"
          onclick={() => exportCart('all')}
          disabled={!!cartExporting}
        >
          <Download size={14} />
          Export All CSV
        </button>
        {#if assetIds.length > 0}
          <button
            class="btn btn--secondary"
            onclick={() => exportCart('assets')}
            disabled={!!cartExporting}
          >
            Assets CSV
          </button>
        {/if}
        {#if entityIds.length > 0}
          <button
            class="btn btn--secondary"
            onclick={() => exportCart('entities')}
            disabled={!!cartExporting}
          >
            Entities CSV
          </button>
        {/if}
      </div>
      {#if cartExporting}
        <p class="progress">{cartProgress}</p>
      {/if}
    {:else}
      <p class="section-desc empty">
        Your report is empty. Add assets or entities from
        <a href={link('compose')}>Compose</a> or <a href={link('screener')}>Screener</a>, then
        return here to export.
      </p>
    {/if}
  </section>

  <!-- Section B: Bulk Dataset Downloads -->
  <section class="section">
    <h2><Download size={18} /> Bulk Dataset Downloads</h2>
    <p class="section-desc">
      Download complete tracker datasets. Large downloads (10k+ assets) may take a minute.
    </p>
    <div class="card-grid">
      {#each TRACKER_SLUGS as { slug, label }}
        <div class="tracker-card" class:downloading={dlSlug === slug}>
          <div class="tracker-info">
            <h3>{label}</h3>
            <span class="count">
              {#if countsLoading}
                ...
              {:else if getCount(slug) != null}
                {getCount(slug).toLocaleString()} assets
              {:else}
                —
              {/if}
            </span>
          </div>
          {#if dlSlug === slug}
            <p class="progress">{dlProgress}</p>
          {:else}
            <div class="format-btns">
              <button
                class="fmt-btn"
                onclick={() => bulkDownload(slug, 'csv')}
                disabled={!!dlSlug}
                title="Download CSV"
              >
                <FileSpreadsheet size={14} /> CSV
              </button>
              <button
                class="fmt-btn"
                onclick={() => bulkDownload(slug, 'geojson')}
                disabled={!!dlSlug}
                title="Download GeoJSON"
              >
                <MapPin size={14} /> GeoJSON
              </button>
              <button
                class="fmt-btn"
                onclick={() => bulkDownload(slug, 'json')}
                disabled={!!dlSlug}
                title="Download JSON"
              >
                <Braces size={14} /> JSON
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- Section C: Filtered Exports -->
  <section class="section">
    <h2><Filter size={18} /> Filtered Exports</h2>
    <p class="section-desc">Need specific subsets? Use these tools to filter, then export.</p>
    <div class="card-grid--wide card-grid">
      <a href={link('compose')} class="link-card">
        <div>
          <h3>Compose</h3>
          <p>Build custom filtered views by tracker, status, and country. Export as CSV or JSON.</p>
        </div>
        <ArrowRight size={18} />
      </a>
      <a href={link('screener')} class="link-card">
        <div>
          <h3>Screener</h3>
          <p>
            Analyze ownership patterns and export charts, tables, and data as CSV, GeoJSON, or SVG.
          </p>
        </div>
        <ArrowRight size={18} />
      </a>
    </div>
  </section>
</div>

<style>
  .section {
    margin-bottom: var(--space-10);
  }

  .section h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-bold);
    color: var(--gem-navy);
    margin: 0 0 var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-desc {
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4);
    line-height: var(--line-height-relaxed);
  }

  .section-desc a {
    color: var(--gem-navy);
    text-decoration: underline;
  }

  .section-desc.empty {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .btn-row {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .progress {
    font-size: var(--font-size-sm);
    color: var(--gem-navy);
    margin: var(--space-2) 0 0;
    font-variant-numeric: tabular-nums;
  }

  .tracker-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    transition: border-color 0.15s;
  }

  .tracker-card:hover {
    border-color: var(--gem-navy);
  }

  .tracker-card.downloading {
    border-color: var(--gem-navy);
    background: var(--gem-navy-10);
  }

  .tracker-info {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-3);
  }

  .tracker-info h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .count {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .format-btns {
    display: flex;
    gap: var(--space-2);
  }

  .fmt-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: all 0.15s;
  }

  .fmt-btn:hover {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
    background: var(--gem-navy-10);
  }

  .link-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-4) var(--space-5);
    text-decoration: none;
    transition: all 0.15s;
    color: var(--color-text-secondary);
  }

  .link-card:hover {
    border-color: var(--gem-navy);
    background: var(--gem-navy-10);
    color: var(--gem-navy);
  }

  .link-card h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-bold);
    color: var(--gem-navy);
    margin: 0 0 var(--space-1);
  }

  .link-card p {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: var(--line-height-normal);
  }

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
