<script lang="ts">
  /**
   * ProjectCard Component
   * Expandable card showing asset/project details
   * Based on Observable notebook: https://observablehq.com/d/b73714688f61ab19
   *
   * Features:
   * - Expandable/collapsible card
   * - Status-based color coding
   * - Capacity percentile bars (global & country)
   * - Grouped sections (Ownership, Capacity, Age, Emissions, etc.)
   * - Slots for map widget and ownership tree
   */
  import { assetLink } from '$lib/links';
  import {
    getStatusGroup,
    isMineAsset,
    formatMtCO2,
    formatValueWithUnit,
    type Asset,
    type PercentileData,
  } from '$lib/factsheet';

  // Props
  let {
    asset,
    percentiles = null as PercentileData | null,
    open = false,
    variant = 'full' as 'compact' | 'full',
    showLink = true,
  } = $props<{
    asset: Asset;
    percentiles?: PercentileData | null;
    open?: boolean;
    variant?: 'compact' | 'full';
    showLink?: boolean;
  }>();

  // Get status group for styling
  const statusGroup = $derived(getStatusGroup(asset.status));

  // Determine if this is a mine or plant
  const isMine = $derived(isMineAsset(asset));

  // Format percentage
  function formatPct(value: number | undefined): string {
    if (value == null) return '';
    return `${(value * 100).toFixed(1)}%`;
  }

  // Check if we have ownership info
  const hasOwnership = $derived(asset.owner || asset.parent);

  // Check if we have capacity/size info
  const hasCapacity = $derived(asset.capacity || asset.capacityFactor || percentiles);

  // Check if we have age info
  const hasAge = $derived(
    asset.startYear || asset.plannedRetirement || asset.remainingLifetime || asset.plantAge
  );

  // Check if we have emissions info
  const hasEmissions = $derived(asset.annualCO2 || asset.lifetimeCO2 || asset.heatRate);

  // Check if we have plant/mine details
  const hasDetails = $derived(
    asset.technology || asset.coalType || asset.mineType || asset.miningMethod
  );
</script>

<details class="project-card" class:compact={variant === 'compact'} {open}>
  <summary>
    <div class="summary-left">
      <h3 class="project-title">{asset.name}</h3>
      <div class="project-subtitle">
        {#if asset.unitName}
          {asset.unitName} &middot;
        {/if}
        {#if asset.state}
          {asset.state},
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
      <!-- Compact: single section with key fields -->
      <div class="details-section">
        <div class="section-title">Details</div>

        {#if asset.owner}
          <div class="detail">
            <span class="detail-label">Owner</span>
            <span>{asset.owner}</span>
          </div>
        {/if}

        {#if asset.capacity}
          <div class="detail">
            <span class="detail-label">{isMine ? 'Production capacity' : 'Capacity'}</span>
            <span>{formatValueWithUnit(asset.capacity, asset.capacityUnit)}</span>
          </div>
        {/if}

        {#if percentiles}
          <div class="detail percentile-block">
            <span class="detail-label">Percentile</span>
            <div class="percentile-row">
              <div class="percentile-label">Global</div>
              <div class="percentile-track">
                <div class="percentile-tick" style="left:{percentiles.global}%"></div>
              </div>
              <div class="percentile-value">{percentiles.global}th</div>
            </div>
          </div>
        {/if}

        {#if asset.startYear}
          <div class="detail">
            <span class="detail-label">{isMine ? 'Opening year' : 'Start year'}</span>
            <span>{asset.startYear}</span>
          </div>
        {/if}

        {#if asset.location}
          <div class="detail">
            <span class="detail-label">Location</span>
            <span>{asset.location}</span>
          </div>
        {/if}
      </div>
    {:else}
      <!-- Full: organized sections -->

      <!-- OWNERSHIP -->
      {#if hasOwnership}
        <div class="details-section">
          <div class="section-title">Ownership</div>
          {#if asset.owner}
            <div class="detail">
              <span class="detail-label">Owner</span>
              <span>{asset.owner}</span>
            </div>
          {/if}
          {#if asset.parent}
            <div class="detail">
              <span class="detail-label">Parent</span>
              <span>{asset.parent}</span>
            </div>
          {/if}
          <!-- Slot for ownership tree snippet -->
          <slot name="ownership" />
        </div>
      {/if}

      <!-- CAPACITY / SIZE -->
      {#if hasCapacity}
        <div class="details-section">
          <div class="section-title">{isMine ? 'Size & Production' : 'Capacity'}</div>
          {#if asset.capacity}
            <div class="detail">
              <span class="detail-label">{isMine ? 'Capacity' : 'Capacity'}</span>
              <span>{formatValueWithUnit(asset.capacity, asset.capacityUnit)}</span>
            </div>
          {/if}
          {#if asset.production}
            <div class="detail">
              <span class="detail-label">Production</span>
              <span>{formatValueWithUnit(asset.production, asset.productionUnit)}</span>
            </div>
          {/if}
          {#if asset.capacityFactor}
            <div class="detail">
              <span class="detail-label">Capacity factor</span>
              <span>{formatPct(asset.capacityFactor)}</span>
            </div>
          {/if}
          {#if percentiles}
            <div class="detail percentile-block">
              <span class="detail-label">Capacity percentile</span>
              <div class="percentile-row">
                <div class="percentile-label">Global</div>
                <div class="percentile-track">
                  <div class="percentile-tick" style="left:{percentiles.global}%"></div>
                </div>
                <div class="percentile-value">{percentiles.global}th</div>
              </div>
              {#if asset.country}
                <div class="percentile-row">
                  <div class="percentile-label">{asset.country}</div>
                  <div class="percentile-track">
                    <div class="percentile-tick" style="left:{percentiles.country}%"></div>
                  </div>
                  <div class="percentile-value">{percentiles.country}th</div>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- AGE -->
      {#if hasAge}
        <div class="details-section">
          <div class="section-title">Age</div>
          {#if asset.startYear}
            <div class="detail">
              <span class="detail-label">{isMine ? 'Opening year' : 'Start year'}</span>
              <span>{asset.startYear}</span>
            </div>
          {/if}
          {#if asset.plantAge}
            <div class="detail">
              <span class="detail-label">{isMine ? 'Mine age' : 'Plant age'}</span>
              <span>{asset.plantAge} years</span>
            </div>
          {/if}
          {#if asset.plannedRetirement}
            <div class="detail">
              <span class="detail-label">Planned retirement</span>
              <span>{asset.plannedRetirement}</span>
            </div>
          {/if}
          {#if asset.remainingLifetime}
            <div class="detail">
              <span class="detail-label">Remaining lifetime</span>
              <span>{asset.remainingLifetime} years</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- EMISSIONS (plants only) -->
      {#if hasEmissions && !isMine}
        <div class="details-section">
          <div class="section-title">Emissions</div>
          {#if asset.annualCO2}
            <div class="detail">
              <span class="detail-label">Annual CO₂</span>
              <span>{formatMtCO2(asset.annualCO2)}</span>
            </div>
          {/if}
          {#if asset.lifetimeCO2}
            <div class="detail">
              <span class="detail-label">Lifetime CO₂</span>
              <span>{formatMtCO2(asset.lifetimeCO2)}</span>
            </div>
          {/if}
          {#if asset.heatRate}
            <div class="detail">
              <span class="detail-label">Heat rate</span>
              <span>{asset.heatRate.toFixed(0)} Btu/kWh</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- PLANT/MINE DETAILS -->
      {#if hasDetails}
        <div class="details-section">
          <div class="section-title">{isMine ? 'Mine details' : 'Plant details'}</div>
          {#if asset.technology}
            <div class="detail">
              <span class="detail-label">Technology</span>
              <span>{asset.technology}</span>
            </div>
          {/if}
          {#if asset.coalType}
            <div class="detail">
              <span class="detail-label">Coal type</span>
              <span>{asset.coalType}</span>
            </div>
          {/if}
          {#if asset.mineType}
            <div class="detail">
              <span class="detail-label">Mine type</span>
              <span>{asset.mineType}</span>
            </div>
          {/if}
          {#if asset.miningMethod}
            <div class="detail">
              <span class="detail-label">Mining method</span>
              <span>{asset.miningMethod}</span>
            </div>
          {/if}
        </div>
      {/if}

      <!-- LOCATION & LINKS -->
      <div class="details-section">
        <div class="section-title">Additional information</div>
        {#if asset.location}
          <div class="detail">
            <span class="detail-label">Location</span>
            <span>
              {asset.location}
              {#if asset.state}, {asset.state}{/if}
            </span>
          </div>
        {/if}

        <!-- Slot for mini map -->
        <slot name="map" />

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

    <!-- META ROW -->
    <div class="meta">
      {#if asset.tracker}
        <span>Tracker: {asset.tracker}</span>
      {/if}
      {#if asset.database}
        <span>Database: {asset.database}</span>
      {/if}
      <span>GEM ID: {asset.id}</span>
    </div>
  </div>
</details>

<style>
  /* Uses shared theme variables from factsheet/theme.css */
  .project-card {
    font-family: var(--gem-font, 'Plus Jakarta Sans', system-ui, sans-serif);
    background: var(--gem-white);
    border-radius: 0px 14px 14px 14px;
    box-shadow: 0 8px 20px rgba(0, 36, 48, 0.08);
    overflow: hidden;
    border: 1px solid rgba(0, 74, 99, 0.1);
    margin-bottom: 1rem;
  }

  /* Summary (collapsed view) */
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

  .status-planned {
    background: var(--gem-mint);
    color: var(--gem-midnight);
  }

  .status-operating {
    background: var(--gem-navy);
    color: var(--gem-mint);
  }

  .status-cancelled {
    background: #dce3e5;
    color: var(--gem-navy);
  }

  .status-retired {
    background: #6e8c91;
    color: white;
  }

  .status-unknown {
    background: #ddd;
    color: #666;
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

  /* Expanded content */
  .project-details {
    background: var(--gem-warm-white);
    padding: 1.25rem 1.5rem;
  }

  /* Sections */
  .details-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.8rem 1rem;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(0, 74, 99, 0.1);
  }

  .details-section:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
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

  /* Individual details */
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

  /* Links row */
  .links-row {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 0.5rem;
    grid-column: 1 / -1;
  }

  /* GEM Wiki link */
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

  /* Percentile bars */
  .percentile-block {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .percentile-row {
    display: grid;
    grid-template-columns: 70px 90px 36px;
    align-items: center;
    gap: 0.3rem;
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
    width: 90px;
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

  /* Meta row */
  .meta {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px dashed rgba(0, 74, 99, 0.2);
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    font-size: 0.65rem;
    color: var(--gem-teal);
  }

  /* Compact variant adjustments */
  .project-card.compact .details-section {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .project-card.compact .project-details {
    padding: 1rem 1.25rem;
  }
</style>
