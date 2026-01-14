<script>
  /**
   * Pattern Insights Component
   *
   * Displays statistical analysis of ownership patterns.
   * All metrics use established, citable analytical methods.
   */

  import {
    calculateHHI,
    interpretHHI,
    calculateGini,
    interpretGini,
    calculateGeographicConcentration,
    analyzeCoInvestment,
    findOutliers,
  } from '$lib/analysis/patterns';

  // Props - data from the report queries
  let { entityPortfolios = [], sharedAssets = [], commonOwners = [], geoBreakdown = [] } = $props();

  // Calculate ownership concentration (HHI) for entities by capacity
  const ownershipConcentration = $derived.by(() => {
    if (!entityPortfolios || entityPortfolios.length < 2) return null;

    const capacities = entityPortfolios
      .map((e) => Number(e.total_capacity_mw) || 0)
      .filter((c) => c > 0);
    if (capacities.length < 2) return null;

    const hhi = calculateHHI(capacities);
    const interpretation = interpretHHI(hhi);

    return {
      hhi: Math.round(hhi),
      ...interpretation,
      entityCount: entityPortfolios.length,
    };
  });

  // Geographic concentration analysis
  const geoConcentration = $derived.by(() => {
    if (!geoBreakdown || geoBreakdown.length === 0) return null;

    const countryCounts = geoBreakdown.map((g) => ({
      country: g.country || 'Unknown',
      count: Number(g.asset_count) || 0,
    }));

    return calculateGeographicConcentration(countryCounts);
  });

  // Co-investment analysis
  const coInvestment = $derived.by(() => {
    if (!sharedAssets || sharedAssets.length === 0) return null;

    return analyzeCoInvestment(sharedAssets);
  });

  // Capacity outliers among common owners
  const capacityOutliers = $derived.by(() => {
    if (!commonOwners || commonOwners.length < 5) return [];

    return findOutliers(commonOwners, 'total_capacity_mw', 2.0).slice(0, 3);
  });

  // Ownership share outliers
  const shareOutliers = $derived.by(() => {
    if (!commonOwners || commonOwners.length < 5) return [];

    return findOutliers(commonOwners, 'avg_share_pct', 2.0).slice(0, 3);
  });

  // Calculate Gini for capacity distribution
  const capacityGini = $derived.by(() => {
    if (!entityPortfolios || entityPortfolios.length < 3) return null;

    const capacities = entityPortfolios
      .map((e) => Number(e.total_capacity_mw) || 0)
      .filter((c) => c > 0);
    if (capacities.length < 3) return null;

    const gini = calculateGini(capacities);
    const interpretation = interpretGini(gini);

    return {
      gini: gini.toFixed(2),
      ...interpretation,
    };
  });

  // Check if we have any insights to show
  const hasInsights = $derived(
    ownershipConcentration ||
      geoConcentration ||
      coInvestment ||
      capacityOutliers.length > 0 ||
      shareOutliers.length > 0 ||
      capacityGini
  );
</script>

{#if hasInsights}
  <section class="pattern-insights">
    <h2>Pattern Analysis</h2>
    <p class="section-intro">
      Statistical insights using established analytical methods.
      <span class="methodology-link"><a href="#methodology-notes">Methodology notes below</a></span>
    </p>

    <div class="insights-grid">
      <!-- Ownership Concentration -->
      {#if ownershipConcentration}
        <div class="insight-card">
          <h3>Ownership Concentration</h3>
          <div class="metric">
            <span class="metric-value">{ownershipConcentration.hhi.toLocaleString()}</span>
            <span class="metric-label">HHI</span>
          </div>
          <p class="metric-description">
            {ownershipConcentration.description}
          </p>
          <p class="metric-context">
            Based on capacity distribution across {ownershipConcentration.entityCount} entities
          </p>
        </div>
      {/if}

      <!-- Capacity Distribution -->
      {#if capacityGini}
        <div class="insight-card">
          <h3>Capacity Distribution</h3>
          <div class="metric">
            <span class="metric-value">{capacityGini.gini}</span>
            <span class="metric-label">Gini Coefficient</span>
          </div>
          <p class="metric-description">
            {capacityGini.description}
          </p>
        </div>
      {/if}

      <!-- Geographic Concentration -->
      {#if geoConcentration && geoConcentration.totalCountries > 0}
        <div class="insight-card">
          <h3>Geographic Spread</h3>
          <div class="metric">
            <span class="metric-value">{geoConcentration.totalCountries}</span>
            <span class="metric-label">Countries</span>
          </div>
          {#if geoConcentration.topCountry}
            <p class="metric-description">
              Top: {geoConcentration.topCountry.country} ({geoConcentration.topCountry.percentage.toFixed(
                0
              )}%)
            </p>
          {/if}
          <p class="metric-context">
            {geoConcentration.interpretation}
          </p>
        </div>
      {/if}

      <!-- Co-Investment Patterns -->
      {#if coInvestment && coInvestment.totalSharedAssets > 0}
        <div class="insight-card">
          <h3>Co-Investment</h3>
          <div class="metric">
            <span class="metric-value">{coInvestment.totalSharedAssets}</span>
            <span class="metric-label">Shared Assets</span>
          </div>
          <p class="metric-description">
            Average {coInvestment.averageCoOwners.toFixed(1)} co-owners per asset
          </p>
          {#if coInvestment.frequentPairs.length > 0}
            <p class="metric-context">
              Most frequent pair: {coInvestment.frequentPairs[0].pair} ({coInvestment
                .frequentPairs[0].count} assets)
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Outliers Section -->
    {#if capacityOutliers.length > 0 || shareOutliers.length > 0}
      <div class="outliers-section">
        <h3>Notable Outliers</h3>
        <p class="outliers-intro">
          Values more than 2 standard deviations from the mean (Z-score > 2)
        </p>

        <div class="outliers-grid">
          {#if capacityOutliers.length > 0}
            <div class="outlier-group">
              <h4>Capacity Outliers</h4>
              <ul>
                {#each capacityOutliers as outlier}
                  <li>
                    <span class="outlier-name"
                      >{outlier.item.entity_name || outlier.item.entity_id}</span
                    >
                    <span class="outlier-value"
                      >{Math.round(outlier.value).toLocaleString()} MW</span
                    >
                    <span class="outlier-zscore" class:high={outlier.direction === 'high'}>
                      Z={outlier.zScore.toFixed(1)}
                    </span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          {#if shareOutliers.length > 0}
            <div class="outlier-group">
              <h4>Ownership Share Outliers</h4>
              <ul>
                {#each shareOutliers as outlier}
                  <li>
                    <span class="outlier-name"
                      >{outlier.item.entity_name || outlier.item.entity_id}</span
                    >
                    <span class="outlier-value">{outlier.value.toFixed(1)}% avg</span>
                    <span class="outlier-zscore" class:high={outlier.direction === 'high'}>
                      Z={outlier.zScore.toFixed(1)}
                    </span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Methodology Notes -->
    <div class="methodology-notes" id="methodology-notes">
      <h4>Methodology</h4>
      <dl>
        <dt>HHI (Herfindahl-Hirschman Index)</dt>
        <dd>
          Sum of squared market shares. Used by U.S. DOJ/FTC for antitrust analysis. Scale:
          0-10,000. Under 1,500 = unconcentrated, 1,500-2,500 = moderate, over 2,500 = concentrated.
        </dd>

        <dt>Gini Coefficient</dt>
        <dd>
          Measures inequality of distribution (Gini, 1912). Range 0-1. 0 = perfect equality, 1 =
          maximum inequality.
        </dd>

        <dt>Z-Score Outliers</dt>
        <dd>
          Standard deviations from the mean. Values with |Z| > 2 are flagged as unusual (occurs in
          ~5% of a normal distribution).
        </dd>
      </dl>
    </div>
  </section>
{/if}

<style>
  .pattern-insights {
    margin: 40px 0;
    padding: 24px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-100);
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-intro {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin: 0 0 20px 0;
  }

  .methodology-link {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  .methodology-link a {
    color: var(--color-text-secondary);
  }

  .insights-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .insight-card {
    background: var(--color-white);
    padding: 16px;
    border-left: 3px solid var(--color-gray-700);
  }

  .insight-card h3 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    margin: 0 0 12px 0;
  }

  .metric {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 8px;
  }

  .metric-value {
    font-size: 24px;
    font-weight: bold;
    color: var(--color-black);
    font-family: monospace;
  }

  .metric-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }

  .metric-description {
    font-size: 12px;
    color: var(--color-gray-700);
    margin: 0 0 4px 0;
  }

  .metric-context {
    font-size: 11px;
    color: var(--color-gray-500);
    margin: 0;
  }

  /* Outliers */
  .outliers-section {
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--color-border);
  }

  .outliers-section h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 4px 0;
  }

  .outliers-intro {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin: 0 0 16px 0;
  }

  .outliers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }

  .outlier-group h4 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    color: var(--color-text-secondary);
    margin: 0 0 8px 0;
  }

  .outlier-group ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .outlier-group li {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 12px;
    border-bottom: 1px solid var(--color-gray-100);
  }

  .outlier-group li:last-child {
    border-bottom: none;
  }

  .outlier-name {
    flex: 1;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .outlier-value {
    font-family: monospace;
    color: var(--color-text-secondary);
  }

  .outlier-zscore {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--color-gray-100);
    border-radius: 2px;
    font-family: monospace;
  }

  .outlier-zscore.high {
    background: #fff3e0;
    color: #e65100;
  }

  /* Methodology */
  .methodology-notes {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .methodology-notes h4 {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin: 0 0 12px 0;
  }

  .methodology-notes dl {
    margin: 0;
  }

  .methodology-notes dt {
    font-weight: 600;
    color: var(--color-gray-700);
    margin-top: 8px;
  }

  .methodology-notes dt:first-of-type {
    margin-top: 0;
  }

  .methodology-notes dd {
    margin: 2px 0 0 0;
    line-height: 1.5;
  }

  /* Print */
  @media print {
    .pattern-insights {
      background: var(--color-white);
      border: 1pt solid var(--color-black);
    }

    .insight-card {
      border-left: 2pt solid var(--color-black);
    }
  }
</style>
