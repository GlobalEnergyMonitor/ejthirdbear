<script>
  /**
   * ScreenerExportPanel — inline multi-format export for the screener visualize page.
   * Exports collected asset data as CSV, GeoJSON, JSON, or SVG chart.
   * Includes insights strip, share/cite tools.
   */

  import {
    assetsToCSV,
    assetsToGeoJSON,
    serializeSVG,
    downloadFile,
    formatNumber,
    aggregateAssetStats,
    generateBriefing,
  } from '$lib/components/cart/export-panel-utils';
  import { statusColors } from '$lib/design-tokens';
  import { formatCapacity } from '$lib/format-utils';

  let {
    assets = [],
    owners = [],
    chartContainers = new Map(),
    assetClassName = '',
    loading = false,
    pageUrl = '',
  } = $props();

  // Aggregated stats
  const stats = $derived(aggregateAssetStats(assets));
  const countrySet = $derived(new Set(assets.map((a) => a.country).filter(Boolean)));
  const typeSet = $derived(new Set(assets.map((a) => a.facilityType).filter(Boolean)));
  const geoAssets = $derived(assets.filter((a) => a.latitude != null && a.longitude != null));
  const capacityStr = $derived(formatCapacity(stats.totalCapacity));

  const dateStr = $derived(new Date().toISOString().split('T')[0]);
  const slug = $derived(assetClassName?.toLowerCase().replace(/\s+/g, '-') || 'assets');

  // Clipboard flash state
  let copiedKey = $state('');

  async function copyToClipboard(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      copiedKey = key;
      setTimeout(() => {
        copiedKey = '';
      }, 2000);
    } catch {
      // Fallback: silently fail
    }
  }

  function copyLink() {
    copyToClipboard(pageUrl, 'link');
  }

  function copyEmbed() {
    const iframe = `<iframe src="${pageUrl}${pageUrl.includes('?') ? '&' : '?'}embed=true" width="100%" height="600" frameborder="0"></iframe>`;
    copyToClipboard(iframe, 'embed');
  }

  function copyBriefing() {
    const text = generateBriefing(assets, owners, assetClassName);
    copyToClipboard(text, 'briefing');
  }

  function exportCSV() {
    const csv = assetsToCSV(assets);
    downloadFile(csv, `gem-${slug}-assets-${dateStr}.csv`, 'text/csv;charset=utf-8');
  }

  function exportGeoJSON() {
    const geojson = assetsToGeoJSON(assets);
    downloadFile(geojson, `gem-${slug}-assets-${dateStr}.geojson`, 'application/geo+json');
  }

  function exportJSON() {
    const json = JSON.stringify(assets, null, 2);
    downloadFile(json, `gem-${slug}-assets-${dateStr}.json`, 'application/json;charset=utf-8');
  }

  function exportSVG() {
    const container = chartContainers.values().next().value;
    if (!container) return;
    const svgStr = serializeSVG(container);
    if (!svgStr) return;
    const ownerName = owners[0]?.name?.replace(/\s+/g, '-').toLowerCase() || 'chart';
    downloadFile(svgStr, `gem-${ownerName}-ownership-${dateStr}.svg`, 'image/svg+xml');
  }

  const csvRowCount = $derived(() => {
    let count = 0;
    for (const a of assets) {
      const ownerCount = a.owners?.length || 0;
      count += ownerCount > 0 ? ownerCount : 1;
    }
    return count;
  });

  const hasSVG = $derived(chartContainers.size > 0);
  const disabled = $derived(loading || assets.length === 0);
</script>

{#if assets.length > 0 || loading}
  <section class="export-panel">
    <!-- A. Insights strip -->
    <div class="insights-strip">
      {#if loading}
        <span class="summary-loading">Loading asset data...</span>
      {:else}
        <div class="insights-row">
          <span class="insight-stat">{formatNumber(assets.length)} assets</span>
          {#if capacityStr}
            <span class="dot">&middot;</span>
            <span class="insight-stat">{capacityStr}</span>
          {/if}
          <span class="dot">&middot;</span>
          <span class="insight-stat">{formatNumber(countrySet.size)} countries</span>
          <span class="dot">&middot;</span>
          <span class="insight-stat">{formatNumber(typeSet.size)} types</span>
        </div>

        {#if stats.statusBreakdown.length > 0}
          <div class="status-row">
            {#each stats.statusBreakdown as s, i}
              {#if i > 0}
                <span class="dot">&middot;</span>
              {/if}
              <span class="status-chip">
                <span
                  class="status-dot"
                  style="background: {statusColors[s.group] || statusColors.unknown}"
                ></span>
                {formatNumber(s.count)}
                {s.group}
              </span>
            {/each}
          </div>
        {/if}

        {#if stats.countryBreakdown.length > 0}
          <div class="country-row">
            {#each stats.countryBreakdown.slice(0, 3) as c, i}
              {#if i > 0}
                <span class="dot">&middot;</span>
              {/if}
              <span class="country-chip">{c.country} ({formatNumber(c.count)})</span>
            {/each}
            {#if stats.countryBreakdown.length > 3}
              <span class="dot">&middot;</span>
              <span class="country-chip muted">+{stats.countryBreakdown.length - 3} more</span>
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- B. Export row (existing) -->
    <div class="format-row">
      <span class="row-label">Export</span>
      <button class="format-btn" onclick={exportCSV} {disabled}>
        CSV
        {#if !disabled}
          <span class="count-hint">{formatNumber(csvRowCount())} rows</span>
        {/if}
      </button>
      <button class="format-btn" onclick={exportGeoJSON} {disabled}>
        GeoJSON
        {#if !disabled}
          <span class="count-hint">{formatNumber(geoAssets.length)} features</span>
        {/if}
      </button>
      <button class="format-btn" onclick={exportJSON} {disabled}>
        JSON
        {#if !disabled}
          <span class="count-hint">{formatNumber(assets.length)} records</span>
        {/if}
      </button>
      {#if hasSVG}
        <button class="format-btn" onclick={exportSVG} {disabled}>
          SVG
          <span class="count-hint">chart</span>
        </button>
      {/if}
    </div>

    <!-- C. Share & cite row -->
    {#if !loading && pageUrl}
      <div class="format-row">
        <span class="row-label">Share</span>
        <button class="format-btn" onclick={copyLink} disabled={!pageUrl}>
          {copiedKey === 'link' ? 'Copied!' : 'Copy link'}
        </button>
        <button class="format-btn" onclick={copyEmbed} disabled={!pageUrl}>
          {copiedKey === 'embed' ? 'Copied!' : 'Copy embed'}
        </button>
        <button class="format-btn" onclick={copyBriefing} {disabled}>
          {copiedKey === 'briefing' ? 'Copied!' : 'Copy briefing'}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .export-panel {
    padding: var(--space-5) 0;
    border-top: var(--border-width) solid var(--color-border);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .insights-strip {
    margin-bottom: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .insights-row,
  .status-row,
  .country-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .insight-stat {
    font-variant-numeric: tabular-nums;
  }

  .summary-loading {
    font-style: italic;
    color: var(--color-text-tertiary);
  }

  .dot {
    color: var(--color-text-tertiary);
  }

  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .country-chip {
    font-variant-numeric: tabular-nums;
  }

  .country-chip.muted {
    color: var(--color-text-tertiary);
  }

  .format-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .format-row + .format-row {
    margin-top: var(--space-2);
  }

  .row-label {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-tertiary);
    font-weight: 500;
  }

  .format-btn {
    background: none;
    border: none;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-body);
    color: var(--color-accent);
    cursor: pointer;
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-1);
  }

  .format-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .format-btn:disabled {
    color: var(--color-text-tertiary);
    cursor: default;
    opacity: 0.5;
  }

  .count-hint {
    font-size: var(--font-size-xs, 11px);
    color: var(--color-text-tertiary);
    font-weight: 400;
  }

  @media (max-width: 640px) {
    .format-row {
      gap: var(--space-2);
    }
  }
</style>
