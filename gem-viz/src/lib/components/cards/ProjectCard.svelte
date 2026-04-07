<script lang="ts">
  import type { Snippet } from 'svelte';
  import { assetLink } from '$lib/links';
  import {
    getStatusGroup,
    isMineAsset,
    formatMtCO2,
    formatValueWithUnit,
    type Asset,
    type PercentileData,
  } from '$lib/factsheet';
  import { formatRatioAsPct } from '$lib/utils/format';
  import {
    getTrackerCardConfig,
    getConfiguredKeys,
    resolveFieldValue,
    type CardField,
  } from '$lib/factsheet/tracker-card-config';

  let {
    asset,
    percentiles = null as PercentileData | null,
    open = false,
    variant = 'full' as 'compact' | 'full',
    showLink = true,
    ownership,
    map,
  } = $props<{
    asset: Asset;
    percentiles?: PercentileData | null;
    open?: boolean;
    variant?: 'compact' | 'full';
    showLink?: boolean;
    ownership?: Snippet;
    map?: Snippet;
  }>();

  const statusGroup = $derived(getStatusGroup(asset.status));
  const isMine = $derived(isMineAsset(asset));
  const formatPct = formatRatioAsPct;

  // --- Tabbed layout state ---
  const cardConfig = $derived(getTrackerCardConfig(asset.tracker));

  // Filter to only tabs that have at least one populated field
  const visibleTabs = $derived.by(() => {
    return cardConfig.tabs.filter((tab) =>
      tab.fields.some((f) => {
        const val = resolveFieldValue(asset, f.key);
        return val != null && val !== '';
      })
    );
  });

  let activeTabIndex = $state(0);
  // Reset tab when asset changes
  $effect(() => {
    // Reference asset.id to create dependency
    void asset.id;
    activeTabIndex = 0;
  });

  const activeTab = $derived(visibleTabs[activeTabIndex] ?? visibleTabs[0]);

  // Collect extra raw fields not in any tab config
  const extraFields = $derived.by(() => {
    if (!asset.raw) return [];
    const configuredKeys = getConfiguredKeys(cardConfig);
    // Also skip keys that map to typed Asset props we already show
    const skipRawKeys = new Set([
      'id',
      'name',
      'status',
      'capacity',
      'country',
      'latitude',
      'longitude',
      'owners',
      'ownerName',
      'parentName',
      'facilityType',
      'capacityUnit',
    ]);
    const extras: { label: string; value: string }[] = [];
    for (const [k, v] of Object.entries(asset.raw)) {
      if (v == null || v === '') continue;
      if (skipRawKeys.has(k)) continue;
      // Skip if any config field references this raw key
      if (configuredKeys.has(`raw.${k}`)) continue;
      // Skip nested objects/arrays — they clutter the raw dump
      if (typeof v === 'object') continue;
      extras.push({ label: k, value: String(v) });
    }
    return extras;
  });

  // --- Format a field value for display ---
  function formatField(field: CardField, asset: Asset): string | undefined {
    const val = resolveFieldValue(asset, field.key);
    if (val == null || val === '') return undefined;

    switch (field.format) {
      case 'capacity':
        return formatValueWithUnit(Number(val), asset.capacityUnit);
      case 'pct':
        return typeof val === 'number' ? formatPct(val) : `${val}%`;
      case 'co2':
        return formatMtCO2(Number(val));
      case 'heatRate':
        return `${Number(val).toFixed(0)} Btu/kWh`;
      case 'years':
        return `${val} years`;
      case 'coords':
        return asset.lat != null && asset.lon != null
          ? `${asset.lat.toFixed(4)}, ${asset.lon.toFixed(4)}`
          : undefined;
      default:
        return String(val);
    }
  }

  // Build location string from available fields (used in compact mode)
  const locationStr = $derived.by(() => {
    const parts: string[] = [];
    if (asset.location) parts.push(asset.location);
    if (asset.state && !parts.some((p) => p.includes(asset.state!))) parts.push(asset.state);
    if (asset.country && !parts.some((p) => p.includes(asset.country!))) parts.push(asset.country);
    return parts.join(', ') || undefined;
  });
</script>

<!-- Reusable snippets -->
{#snippet detail(label, value)}
  {#if value}
    <div class="detail">
      <span class="detail-label">{label}</span>
      <span>{value}</span>
    </div>
  {/if}
{/snippet}

{#snippet pctBar(label, value)}
  <div class="percentile-row">
    <div class="percentile-label">{label}</div>
    <div class="percentile-track">
      <div class="percentile-tick" style="left:{value}%"></div>
    </div>
    <div class="percentile-value">{value}th</div>
  </div>
{/snippet}

<!-- Field cell for tabbed view: shows "NA" for empty configured fields -->
{#snippet fieldCell(field)}
  {@const val = formatField(field, asset)}
  <div class="detail">
    <span class="detail-label">{field.label}</span>
    <span class:na={!val}>{val || 'NA'}</span>
  </div>
{/snippet}

<details class="project-card" class:compact={variant === 'compact'} {open}>
  <summary>
    <div class="summary-left">
      <h3 class="project-title">{asset.name}</h3>
      <div class="project-subtitle">
        {#if asset.unitName}{asset.unitName} &middot;
        {/if}
        {#if asset.state}{asset.state},
        {/if}
        {asset.country || ''}
      </div>
    </div>
    <div class="summary-right">
      <span class="badge status-{statusGroup}">{asset.status}</span>
      {#if asset.capacity}
        <span class="metric">
          <strong>{asset.capacity.toLocaleString()}</strong>
          <small>{asset.capacityUnit || (isMine ? 'Mtpa' : 'MW')}</small>
        </span>
      {/if}
    </div>
  </summary>

  <div class="project-details">
    {#if variant === 'compact'}
      <!-- Compact mode: unchanged from original -->
      <div class="details-section">
        <div class="section-title">Details</div>
        {@render detail(
          'Owner',
          asset.owner && asset.ownershipShare
            ? `${asset.owner} (${asset.ownershipShare}%)`
            : asset.owner
        )}
        {@render detail(
          isMine ? 'Production capacity' : 'Capacity',
          asset.capacity && formatValueWithUnit(asset.capacity, asset.capacityUnit)
        )}
        {#if percentiles}
          <div class="detail percentile-block">
            <span class="detail-label">Percentile</span>
            {@render pctBar('Global', percentiles.global)}
          </div>
        {/if}
        {@render detail(isMine ? 'Opening year' : 'Start year', asset.startYear)}
        {@render detail('Location', locationStr)}
      </div>
      {#if ownership}
        <div class="snippet-section">
          {@render ownership()}
        </div>
      {/if}
      {#if map}
        <div class="snippet-section">
          {@render map()}
        </div>
      {/if}
    {:else}
      <!-- Full mode: tabbed layout -->
      <div class="divider"></div>

      {#if visibleTabs.length > 1}
        <div class="tab-bar" role="tablist">
          {#each visibleTabs as tab, i}
            <button
              class="tab-btn"
              class:active={i === activeTabIndex}
              role="tab"
              aria-selected={i === activeTabIndex}
              onclick={() => (activeTabIndex = i)}
            >
              {tab.name}
            </button>
          {/each}
        </div>
      {/if}

      {#if activeTab}
        <div class="tab-content" role="tabpanel">
          <div class="field-grid">
            {#each activeTab.fields as field (field.key)}
              {@render fieldCell(field)}
            {/each}
          </div>

          <!-- Show extra raw fields on Overview tab -->
          {#if activeTab.name === 'Overview' && extraFields.length > 0}
            <div class="extra-fields">
              <div class="section-title">More fields</div>
              <div class="field-grid">
                {#each extraFields as ef}
                  <div class="detail">
                    <span class="detail-label">{ef.label}</span>
                    <span>{ef.value}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Ownership snippet in Ownership tab -->
          {#if activeTab.name === 'Ownership' && ownership}
            <div class="snippet-section">
              {@render ownership()}
            </div>
          {/if}

          <!-- Map in Overview tab -->
          {#if activeTab.name === 'Overview' && map}
            <div class="snippet-section">
              {@render map()}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Footer: links -->
      <div class="card-footer">
        <div class="detail links-row">
          {#if asset.wikiUrl}
            <a class="gem-link" href={asset.wikiUrl} target="_blank" rel="noopener">GEM Wiki</a>
          {/if}
          {#if showLink}
            <a class="gem-link secondary" href={assetLink(asset.id)}>View details</a>
          {/if}
        </div>
      </div>
    {/if}

    <div class="meta">
      {#if asset.tracker}<span>Tracker: {asset.tracker}</span>{/if}
      {#if asset.database}<span>Database: {asset.database}</span>{/if}
      <span>GEM ID: {asset.id}</span>
    </div>
  </div>
</details>

<style>
  .project-card {
    /* Observable-accurate color overrides (scoped to card only) */
    --gem-navy: #004a63;
    --gem-mint: #9df7e5;
    --gem-orange: #fe4f2d;
    --gem-teal: #016b83;
    --gem-midnight: #002430;
    --gem-warm-white: #f2f2eb;
    --gem-white: #ffffff;

    font-family: var(--gem-font, 'Plus Jakarta Sans', system-ui, sans-serif);
    background: var(--gem-white);
    border-radius: 0px 14px 14px 14px;
    box-shadow: 0 8px 20px rgba(0, 36, 48, 0.08);
    overflow: hidden;
    border: 1px solid rgba(0, 74, 99, 0.1);
    margin-bottom: 1rem;
  }

  .project-card summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem 1.5rem;
    cursor: pointer;
    list-style: none;
  }
  .project-card summary::-webkit-details-marker {
    display: none;
  }

  .summary-left {
    max-width: 60%;
  }

  .project-title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--gem-navy);
  }

  .project-subtitle {
    margin-top: 0.25rem;
    font-size: 0.8rem;
    color: var(--gem-teal);
  }

  .summary-right {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .badge {
    padding: 0.35rem 0.65rem;
    border-radius: 999px;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    background: var(--gem-mint);
    color: var(--gem-midnight);
  }
  .status-operating {
    background: var(--gem-navy);
    color: var(--gem-mint);
  }
  .status-cancelled {
    background: var(--color-gray-200, #dce3e5);
    color: var(--gem-navy);
  }
  .status-retired {
    background: #6e8c91;
    color: white;
  }
  .status-unknown {
    background: var(--color-gray-200, #ddd);
    color: var(--color-text-secondary, #666);
  }

  .metric strong {
    font-size: 1.1rem;
    color: var(--gem-navy);
  }
  .metric small {
    display: block;
    font-size: 0.65rem;
    color: var(--gem-teal);
  }

  .project-details {
    background: var(--gem-warm-white);
    padding: 1.25rem 1.5rem;
  }

  /* Divider between header and tabs */
  .divider {
    height: 1px;
    background: rgba(0, 74, 99, 0.12);
    margin-bottom: 0.75rem;
  }

  /* Tab bar */
  .tab-bar {
    display: flex;
    gap: 0;
    border-bottom: 1px solid rgba(0, 74, 99, 0.12);
    margin-bottom: 1rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    all: unset;
    cursor: pointer;
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--gem-teal);
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition:
      color 0.15s ease,
      border-color 0.15s ease;
  }
  .tab-btn:hover {
    color: var(--gem-navy);
  }
  .tab-btn.active {
    color: var(--gem-navy);
    border-bottom-color: var(--gem-orange);
  }

  /* Tab content area */
  .tab-content {
    min-height: 4rem;
  }

  /* Field grid: 4 columns on desktop */
  .field-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.8rem 1rem;
  }

  .extra-fields {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px dashed rgba(0, 74, 99, 0.15);
  }

  .card-footer {
    margin-top: 1rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 74, 99, 0.1);
  }

  /* Legacy details-section for compact mode */
  .details-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.8rem 1rem;
    margin-bottom: 1.25rem;
  }
  .details-section:last-of-type {
    margin-bottom: 0;
  }

  .section-title {
    grid-column: 1 / -1;
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gem-navy);
    opacity: 0.85;
    margin-bottom: 0.3rem;
  }

  .detail {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .detail-label {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--gem-teal);
  }

  .detail span,
  .detail a {
    font-size: 0.85rem;
    color: var(--gem-midnight);
    text-decoration: none;
  }

  .detail span.na {
    color: rgba(0, 36, 48, 0.3);
    font-style: italic;
  }

  .links-row {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    grid-column: 1 / -1;
  }

  a.gem-link {
    display: inline-flex;
    align-self: start;
    align-items: center;
    gap: 6px;
    padding: 0.4rem 0.65rem;
    background: var(--gem-navy);
    color: var(--gem-white);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }
  a.gem-link:hover {
    background: var(--gem-orange);
    transform: translateY(-1px);
  }
  a.gem-link::after {
    content: '\2197';
    font-size: 0.7rem;
  }
  a.gem-link.secondary {
    background: var(--gem-teal);
  }
  a.gem-link.secondary::after {
    content: '\2192';
  }

  .percentile-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .percentile-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.3rem;
    max-width: 200px;
  }
  .percentile-label {
    font-size: 0.7rem;
    color: var(--gem-midnight);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .percentile-track {
    position: relative;
    height: 5px;
    width: 100%;
    min-width: 40px;
    background: rgba(0, 74, 99, 0.18);
    border-radius: 999px;
  }
  .percentile-tick {
    position: absolute;
    top: -3px;
    width: 2px;
    height: 11px;
    background: var(--gem-orange);
    border-radius: 1px;
  }
  .percentile-value {
    font-size: 0.65rem;
    color: var(--gem-teal);
    text-align: left;
  }

  .meta {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px dashed rgba(0, 74, 99, 0.2);
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
    font-size: 0.65rem;
    color: var(--gem-teal);
  }

  .snippet-section {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 74, 99, 0.08);
    max-height: 280px;
    overflow: auto;
  }

  .project-card.compact .details-section {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
  .project-card.compact .project-details {
    padding: 1rem 1.25rem;
  }

  /* =============================================
     RESPONSIVE: Mobile layout
     ============================================= */
  @media (max-width: 600px) {
    .project-card {
      border-radius: 0 10px 10px 10px;
    }

    .project-card summary {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 1rem;
    }

    .summary-left {
      max-width: 100%;
    }

    .summary-right {
      width: 100%;
      justify-content: flex-start;
      gap: 0.5rem;
    }

    .project-title {
      font-size: 0.95rem;
    }

    .project-details {
      padding: 1rem;
    }

    .details-section {
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.6rem 0.75rem;
    }

    .field-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 0.6rem 0.75rem;
    }

    .tab-btn {
      font-size: 0.7rem;
      padding: 0.4rem 0.75rem;
    }

    .percentile-row {
      max-width: 160px;
    }

    a.gem-link {
      font-size: 0.7rem;
      padding: 0.35rem 0.55rem;
    }

    .meta {
      gap: 0.5rem;
    }

    .project-card.compact .project-details {
      padding: 0.75rem 1rem;
    }
  }

  @media (max-width: 380px) {
    .details-section {
      grid-template-columns: 1fr;
    }

    .field-grid {
      grid-template-columns: 1fr;
    }

    .badge {
      font-size: 0.6rem;
      padding: 0.25rem 0.5rem;
    }
  }
</style>
