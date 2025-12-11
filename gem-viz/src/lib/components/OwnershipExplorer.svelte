<script>
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { onMount } from 'svelte';
  import AssetScreener from '$lib/components/AssetScreener.svelte';
  import { fetchAssetBasics, fetchOwnerPortfolio } from '$lib/component-data/schema';
  import {
    colorByTracker,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
  } from '$lib/ownership-theme';

  let loading = $state(true);
  let error = $state(null);
  let portfolio = $state(null);

  // Legend data derived from loaded assets
  let legend = $derived(() => {
    if (!portfolio?.assets) return [];
    const trackers = new Set(portfolio.assets.map((a) => a.tracker).filter(Boolean));
    const statuses = new Set(
      portfolio.assets.map((a) => (a.status || '').toLowerCase()).filter(Boolean)
    );
    if (trackers.size > 1) {
      return Array.from(colorByTracker)
        .filter(([t]) => trackers.has(t))
        .map(([colorKey, color]) => ({ color, label: colorKey }));
    }
    const allProspective = Array.from(statuses).every((s) => prospectiveStatuses.includes(s));
    const sourceMap = allProspective ? statusColorsProspective : statusColors;
    return Array.from(sourceMap)
      .filter(([, { statuses: statusList }]) => statusList.some((s) => statuses.has(s)))
      .map(([col, { descript }]) => ({ color: col, label: descript }));
  });

  let subtitle = $derived(() => {
    if (!portfolio) return '';
    const subsidiaryCount = portfolio.subsidiariesMatched.size;
    return `${portfolio.assets.length} assets via ${subsidiaryCount} direct subsidiaries`;
  });

  let additionalInfo = $derived(() => {
    if (!portfolio) return '';
    return `${portfolio.spotlightOwner.Name} has stakes in additional assets identified in the Global Energy Ownership Trackers.`;
  });

  onMount(async () => {
    const pageData = get(page);
    const assetId = pageData.params?.id;
    const pathname = pageData.url?.pathname || '';

    try {
      loading = true;
      error = null;

      let ownerId = null;
      if (pathname.includes('/asset/')) {
        const basics = await fetchAssetBasics(assetId);
        if (basics?.ownerEntityId) {
          ownerId = basics.ownerEntityId;
        } else {
          throw new Error('Owner entity not found for asset');
        }
      } else if (pathname.includes('/entity/')) {
        ownerId = assetId;
      }

      if (!ownerId) {
        throw new Error('No owner ID available');
      }

      const result = await fetchOwnerPortfolio(ownerId);
      if (!result) {
        throw new Error('Failed to load owner portfolio');
      }

      portfolio = result;
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  });
</script>

<section class="sticky-section">
  <div id="chart-header" class="header-card">
    {#if loading}
      <p>Loading owner portfolio...</p>
    {:else if error}
      <p class="error">{error}</p>
    {:else if portfolio}
      <div class="name-wrapper">
        <p class="subtitle">Company</p>
        <h3 id="company-name">{portfolio.spotlightOwner.Name}</h3>
      </div>
      <div class="details-wrapper">
        <p class="subtitle">Details</p>
        <p id="company-details">{subtitle}</p>
      </div>
    {/if}
  </div>

  <div class="chart" id="chart-wrapper">
    {#if !loading && !error && portfolio}
      <AssetScreener
        spotlightOwner={portfolio.spotlightOwner}
        subsidiariesMatched={portfolio.subsidiariesMatched}
        directlyOwned={portfolio.directlyOwned}
        assets={portfolio.assets}
        entityMap={portfolio.entityMap}
        matchedEdges={portfolio.matchedEdges}
      />
    {/if}
  </div>

  <div id="additional-info">
    {#if !loading && !error && portfolio}
      <p><span>{additionalInfo}</span></p>
    {/if}
  </div>

  <div id="legend-container">
    <div id="legend">
      {#each legend as item}
        <div class="legend-item">
          <div class="legend-bubble" style="background-color: {item.color}"></div>
          <div>{item.label}</div>
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  .sticky-section {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0 16px 0;
  }

  #chart-header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: #f9f9f6;
    border: 1px solid #000;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .name-wrapper h3 {
    margin: 4px 0 0 0;
    font-size: 20px;
    letter-spacing: 0.4px;
  }

  .subtitle {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    margin: 0;
    color: #555;
  }

  .details-wrapper p {
    margin: 4px 0 0 0;
    font-size: 13px;
  }

  .chart {
    min-height: 420px;
    border: 1px solid #000;
    background: #fff;
    padding: 8px;
  }

  #additional-info {
    font-size: 12px;
    color: #444;
    padding: 4px 0 0 2px;
  }

  #legend-container {
    position: sticky;
    bottom: 0;
    z-index: 5;
    background: #fdfdfa;
    border: 1px solid #000;
    padding: 8px 12px;
  }

  #legend {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .legend-bubble {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid #000;
  }

  .header-card {
    background: #f9f9f6;
  }

  .error {
    color: #b10000;
    margin: 0;
  }

  @media (max-width: 900px) {
    #chart-header {
      grid-template-columns: 1fr;
    }
  }
</style>
