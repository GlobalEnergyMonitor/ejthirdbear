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
  import { formatRatioAsPct } from '$lib/format-utils';

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

  const hasOwnership = $derived(asset.owner || asset.parent);
  const hasCapacity = $derived(asset.capacity || asset.capacityFactor || percentiles);
  const hasAge = $derived(
    asset.startYear || asset.plannedRetirement || asset.remainingLifetime || asset.plantAge
  );
  const hasEmissions = $derived(asset.annualCO2 || asset.lifetimeCO2 || asset.heatRate);
  const hasDetails = $derived(
    asset.technology || asset.coalType || asset.mineType || asset.miningMethod
  );

  // Build location string from available fields
  const locationStr = $derived.by(() => {
    const parts: string[] = [];
    if (asset.location) parts.push(asset.location);
    if (asset.state && !parts.some((p) => p.includes(asset.state!))) parts.push(asset.state);
    if (asset.country && !parts.some((p) => p.includes(asset.country!))) parts.push(asset.country);
    return parts.join(', ') || undefined;
  });
</script>

<!-- Reusable snippets: detail row auto-hides when value is falsy, pctBar draws a percentile tick -->
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
      {#if hasOwnership}
        <div class="details-section">
          <div class="section-title">Ownership</div>
          {@render detail(
            'Owner',
            asset.owner && asset.ownershipShare
              ? `${asset.owner} (${asset.ownershipShare}%)`
              : asset.owner
          )}
          {@render detail('Parent', asset.parent)}
          {#if ownership}{@render ownership()}{/if}
        </div>
      {/if}

      {#if hasCapacity}
        <div class="details-section">
          <div class="section-title">{isMine ? 'Size & Production' : 'Capacity'}</div>
          {@render detail(
            'Capacity',
            asset.capacity && formatValueWithUnit(asset.capacity, asset.capacityUnit)
          )}
          {@render detail(
            'Production',
            asset.production && formatValueWithUnit(asset.production, asset.productionUnit)
          )}
          {@render detail(
            'Capacity factor',
            asset.capacityFactor && formatPct(asset.capacityFactor)
          )}
          {#if percentiles}
            <div class="detail percentile-block">
              <span class="detail-label">Capacity percentile</span>
              {@render pctBar('Global', percentiles.global)}
              {#if asset.country}
                {@render pctBar(asset.country, percentiles.country)}
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if hasAge}
        <div class="details-section">
          <div class="section-title">Age</div>
          {@render detail(isMine ? 'Opening year' : 'Start year', asset.startYear)}
          {@render detail(
            isMine ? 'Mine age' : 'Plant age',
            asset.plantAge && `${asset.plantAge} years`
          )}
          {@render detail('Planned retirement', asset.plannedRetirement)}
          {@render detail(
            'Remaining lifetime',
            asset.remainingLifetime && `${asset.remainingLifetime} years`
          )}
        </div>
      {/if}

      {#if hasEmissions && !isMine}
        <div class="details-section">
          <div class="section-title">Emissions</div>
          {@render detail('Annual CO₂', asset.annualCO2 && formatMtCO2(asset.annualCO2))}
          {@render detail('Lifetime CO₂', asset.lifetimeCO2 && formatMtCO2(asset.lifetimeCO2))}
          {@render detail('Heat rate', asset.heatRate && `${asset.heatRate.toFixed(0)} Btu/kWh`)}
        </div>
      {/if}

      {#if hasDetails}
        <div class="details-section">
          <div class="section-title">{isMine ? 'Mine details' : 'Plant details'}</div>
          {@render detail('Technology', asset.technology)}
          {@render detail('Coal type', asset.coalType)}
          {@render detail('Mine type', asset.mineType)}
          {@render detail('Mining method', asset.miningMethod)}
        </div>
      {/if}

      <div class="details-section">
        <div class="section-title">Additional information</div>
        {@render detail('Location', locationStr)}
        {#if map}{@render map()}{/if}
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
    --gem-navy: #004A63;
    --gem-mint: #9DF7E5;
    --gem-orange: #FE4F2D;
    --gem-teal: #016B83;
    --gem-midnight: #002430;
    --gem-warm-white: #F2F2EB;
    --gem-white: #FFFFFF;

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

    .badge {
      font-size: 0.6rem;
      padding: 0.25rem 0.5rem;
    }
  }
</style>
