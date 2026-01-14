/**
 * @module analysis/patterns
 * @description Statistical analysis and pattern detection for ownership data.
 *
 * All methods are based on peer-reviewed or regulatory-standard approaches.
 *
 * **References:**
 * - HHI: U.S. Department of Justice Horizontal Merger Guidelines
 * - Gini: Corrado Gini (1912), "Variabilità e mutabilità"
 * - Z-scores: Standard statistical practice for outlier detection
 *
 * @example
 * import { calculateHHI, findOutliers, analyzePortfolio } from '$lib/analysis';
 *
 * const hhi = calculateHHI([50, 30, 20]); // 3800
 * const concentration = interpretHHI(hhi); // { level: 'concentrated', ... }
 */

// ============================================================================
// CONCENTRATION MEASURES
// ============================================================================

/**
 * Herfindahl-Hirschman Index (HHI)
 *
 * Measures market concentration. Used by DOJ/FTC for antitrust analysis.
 * Scale: 0-10,000 (sum of squared market share percentages)
 *
 * Interpretation (DOJ guidelines):
 * - < 1,500: Unconcentrated
 * - 1,500-2,500: Moderately concentrated
 * - > 2,500: Highly concentrated
 *
 * @param shares - Array of market/ownership shares (as percentages, 0-100)
 * @returns HHI value (0-10,000)
 */
export function calculateHHI(shares: number[]): number {
  if (!shares || shares.length === 0) return 0;

  const total = shares.reduce((sum, s) => sum + s, 0);
  if (total === 0) return 0;

  // Normalize to percentages of total
  const normalized = shares.map((s) => (s / total) * 100);

  // Sum of squared shares
  return normalized.reduce((sum, s) => sum + s * s, 0);
}

/**
 * Interpret HHI value using DOJ guidelines
 */
export function interpretHHI(hhi: number): {
  level: 'unconcentrated' | 'moderate' | 'concentrated';
  description: string;
} {
  if (hhi < 1500) {
    return {
      level: 'unconcentrated',
      description: 'Unconcentrated ownership (HHI < 1,500)',
    };
  } else if (hhi < 2500) {
    return {
      level: 'moderate',
      description: 'Moderately concentrated ownership (HHI 1,500-2,500)',
    };
  } else {
    return {
      level: 'concentrated',
      description: 'Highly concentrated ownership (HHI > 2,500)',
    };
  }
}

/**
 * Gini Coefficient
 *
 * Measures inequality of distribution. Range: 0 (perfect equality) to 1 (perfect inequality).
 * Commonly used for income inequality, applicable to ownership concentration.
 *
 * @param values - Array of values (e.g., capacity per owner)
 * @returns Gini coefficient (0-1)
 */
export function calculateGini(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, v) => sum + v, 0) / n;

  if (mean === 0) return 0;

  // Calculate Gini using the relative mean absolute difference formula
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }

  return sumDiff / (2 * n * n * mean);
}

/**
 * Interpret Gini coefficient
 */
export function interpretGini(gini: number): {
  level: 'equal' | 'moderate' | 'unequal' | 'highly_unequal';
  description: string;
} {
  if (gini < 0.2) {
    return { level: 'equal', description: 'Relatively equal distribution' };
  } else if (gini < 0.4) {
    return { level: 'moderate', description: 'Moderate inequality' };
  } else if (gini < 0.6) {
    return { level: 'unequal', description: 'Significant inequality' };
  } else {
    return { level: 'highly_unequal', description: 'Highly unequal distribution' };
  }
}

// ============================================================================
// OUTLIER DETECTION
// ============================================================================

/**
 * Calculate Z-score for a value relative to a dataset
 *
 * Z-score measures how many standard deviations a value is from the mean.
 * Common thresholds: |z| > 2 (unusual), |z| > 3 (outlier)
 *
 * @param value - The value to test
 * @param dataset - The comparison dataset
 * @returns Z-score, or null if calculation not possible
 */
export function calculateZScore(value: number, dataset: number[]): number | null {
  if (dataset.length < 2) return null;

  const mean = dataset.reduce((sum, v) => sum + v, 0) / dataset.length;
  const variance = dataset.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / dataset.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return null;

  return (value - mean) / stdDev;
}

/**
 * Find outliers in a dataset using Z-scores
 *
 * @param items - Array of objects with a numeric value
 * @param valueKey - Key to extract the numeric value
 * @param threshold - Z-score threshold (default 2.0)
 * @returns Array of outliers with their Z-scores
 */
export function findOutliers<T extends Record<string, unknown>>(
  items: T[],
  valueKey: string,
  threshold = 2.0
): Array<{ item: T; value: number; zScore: number; direction: 'high' | 'low' }> {
  const values = items.map((item) => Number(item[valueKey]) || 0).filter((v) => v > 0);

  if (values.length < 3) return [];

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return [];

  const outliers: Array<{ item: T; value: number; zScore: number; direction: 'high' | 'low' }> = [];

  for (const item of items) {
    const value = Number(item[valueKey]) || 0;
    if (value === 0) continue;

    const zScore = (value - mean) / stdDev;
    if (Math.abs(zScore) >= threshold) {
      outliers.push({
        item,
        value,
        zScore,
        direction: zScore > 0 ? 'high' : 'low',
      });
    }
  }

  return outliers.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

// ============================================================================
// GEOGRAPHIC CONCENTRATION
// ============================================================================

/**
 * Calculate geographic concentration metrics
 *
 * @param countryCounts - Map or array of country -> count
 * @returns Concentration metrics
 */
export function calculateGeographicConcentration(
  countryCounts: Array<{ country: string; count: number }>
): {
  totalCountries: number;
  topCountry: { country: string; count: number; percentage: number } | null;
  top3Percentage: number;
  hhi: number;
  interpretation: string;
} {
  if (!countryCounts || countryCounts.length === 0) {
    return {
      totalCountries: 0,
      topCountry: null,
      top3Percentage: 0,
      hhi: 0,
      interpretation: 'No geographic data',
    };
  }

  const sorted = [...countryCounts].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, c) => sum + c.count, 0);

  if (total === 0) {
    return {
      totalCountries: sorted.length,
      topCountry: null,
      top3Percentage: 0,
      hhi: 0,
      interpretation: 'No asset counts',
    };
  }

  const topCountry = sorted[0];
  const top3 = sorted.slice(0, 3);
  const top3Count = top3.reduce((sum, c) => sum + c.count, 0);
  const top3Percentage = (top3Count / total) * 100;

  const shares = sorted.map((c) => (c.count / total) * 100);
  const hhi = calculateHHI(shares);

  let interpretation = '';
  if (sorted.length === 1) {
    interpretation = `All assets in ${topCountry.country}`;
  } else if (top3Percentage > 80) {
    interpretation = `Highly concentrated: ${top3Percentage.toFixed(0)}% in top 3 countries`;
  } else if (top3Percentage > 50) {
    interpretation = `Moderately concentrated: ${top3Percentage.toFixed(0)}% in top 3 countries`;
  } else {
    interpretation = `Geographically diversified across ${sorted.length} countries`;
  }

  return {
    totalCountries: sorted.length,
    topCountry: {
      country: topCountry.country,
      count: topCountry.count,
      percentage: (topCountry.count / total) * 100,
    },
    top3Percentage,
    hhi,
    interpretation,
  };
}

// ============================================================================
// CO-INVESTMENT ANALYSIS
// ============================================================================

/**
 * Analyze co-investment patterns between entities
 *
 * @param sharedAssets - Array of assets with co-owner information
 * @returns Co-investment metrics
 */
export function analyzeCoInvestment(
  sharedAssets: Array<{
    asset_id: string;
    co_owner_count: number;
    co_owners?: string;
    co_owner_ids?: string;
  }>
): {
  totalSharedAssets: number;
  averageCoOwners: number;
  maxCoOwners: number;
  mostConnectedAsset: { asset_id: string; co_owner_count: number } | null;
  frequentPairs: Array<{ pair: string; count: number }>;
  interpretation: string;
} {
  if (!sharedAssets || sharedAssets.length === 0) {
    return {
      totalSharedAssets: 0,
      averageCoOwners: 0,
      maxCoOwners: 0,
      mostConnectedAsset: null,
      frequentPairs: [],
      interpretation: 'No co-owned assets found',
    };
  }

  const coOwnerCounts = sharedAssets.map((a) => a.co_owner_count || 0);
  const averageCoOwners = coOwnerCounts.reduce((sum, c) => sum + c, 0) / coOwnerCounts.length;
  const maxCoOwners = Math.max(...coOwnerCounts);

  const mostConnected = sharedAssets.reduce(
    (max, a) => ((a.co_owner_count || 0) > (max?.co_owner_count || 0) ? a : max),
    sharedAssets[0]
  );

  // Count entity pairs that co-invest
  const pairCounts = new Map<string, number>();
  for (const asset of sharedAssets) {
    const ids = (asset.co_owner_ids || '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    // Generate pairs
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const pair = [ids[i], ids[j]].sort().join(' & ');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  }

  const frequentPairs = Array.from(pairCounts.entries())
    .map(([pair, count]) => ({ pair, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let interpretation = '';
  if (sharedAssets.length === 0) {
    interpretation = 'These entities do not co-own any assets';
  } else if (averageCoOwners > 3) {
    interpretation = `Significant co-investment: average of ${averageCoOwners.toFixed(1)} co-owners per shared asset`;
  } else if (sharedAssets.length > 10) {
    interpretation = `Moderate co-investment: ${sharedAssets.length} shared assets found`;
  } else {
    interpretation = `Limited co-investment: ${sharedAssets.length} shared asset${sharedAssets.length === 1 ? '' : 's'}`;
  }

  return {
    totalSharedAssets: sharedAssets.length,
    averageCoOwners,
    maxCoOwners,
    mostConnectedAsset: mostConnected
      ? { asset_id: mostConnected.asset_id, co_owner_count: mostConnected.co_owner_count }
      : null,
    frequentPairs,
    interpretation,
  };
}

// ============================================================================
// PORTFOLIO ANALYSIS
// ============================================================================

/**
 * Analyze a portfolio for patterns and notable characteristics
 */
export function analyzePortfolio(portfolio: {
  assets: Array<{
    capacity_mw?: number;
    status?: string;
    tracker?: string;
    country?: string;
  }>;
  totalCapacity?: number;
}): {
  assetCount: number;
  capacityStats: {
    total: number;
    mean: number;
    median: number;
    max: number;
    min: number;
  };
  statusBreakdown: Array<{ status: string; count: number; percentage: number }>;
  trackerBreakdown: Array<{ tracker: string; count: number; percentage: number }>;
  geographicConcentration: ReturnType<typeof calculateGeographicConcentration>;
  capacityOutliers: Array<{ asset: unknown; value: number; zScore: number }>;
  insights: string[];
} {
  const assets = portfolio.assets || [];
  const capacities = assets.map((a) => Number(a.capacity_mw) || 0).filter((c) => c > 0);

  // Capacity statistics
  const sortedCapacities = [...capacities].sort((a, b) => a - b);
  const totalCapacity = capacities.reduce((sum, c) => sum + c, 0);
  const meanCapacity = capacities.length > 0 ? totalCapacity / capacities.length : 0;
  const medianCapacity =
    capacities.length > 0
      ? capacities.length % 2 === 0
        ? (sortedCapacities[capacities.length / 2 - 1] + sortedCapacities[capacities.length / 2]) /
          2
        : sortedCapacities[Math.floor(capacities.length / 2)]
      : 0;

  // Status breakdown
  const statusCounts = new Map<string, number>();
  for (const asset of assets) {
    const status = asset.status || 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
  }
  const statusBreakdown = Array.from(statusCounts.entries())
    .map(([status, count]) => ({
      status,
      count,
      percentage: (count / assets.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  // Tracker breakdown
  const trackerCounts = new Map<string, number>();
  for (const asset of assets) {
    const tracker = asset.tracker || 'Unknown';
    trackerCounts.set(tracker, (trackerCounts.get(tracker) || 0) + 1);
  }
  const trackerBreakdown = Array.from(trackerCounts.entries())
    .map(([tracker, count]) => ({
      tracker,
      count,
      percentage: (count / assets.length) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  // Geographic concentration
  const countryCounts = new Map<string, number>();
  for (const asset of assets) {
    const country = asset.country || 'Unknown';
    countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
  }
  const geographicConcentration = calculateGeographicConcentration(
    Array.from(countryCounts.entries()).map(([country, count]) => ({ country, count }))
  );

  // Capacity outliers
  const capacityOutliers = findOutliers(
    assets.filter((a) => a.capacity_mw && Number(a.capacity_mw) > 0),
    'capacity_mw',
    2.0
  ).slice(0, 5);

  // Generate insights
  const insights: string[] = [];

  if (statusBreakdown.length > 0 && statusBreakdown[0].status === 'proposed') {
    insights.push(
      `${statusBreakdown[0].percentage.toFixed(0)}% of portfolio is proposed/planned assets`
    );
  }

  if (geographicConcentration.topCountry && geographicConcentration.topCountry.percentage > 50) {
    insights.push(
      `Concentrated in ${geographicConcentration.topCountry.country} (${geographicConcentration.topCountry.percentage.toFixed(0)}% of assets)`
    );
  }

  if (capacityOutliers.length > 0) {
    insights.push(
      `${capacityOutliers.length} asset${capacityOutliers.length === 1 ? '' : 's'} with unusually ${capacityOutliers[0].zScore > 0 ? 'high' : 'low'} capacity`
    );
  }

  const operatingPct =
    statusBreakdown.find((s) => s.status.toLowerCase() === 'operating')?.percentage || 0;
  if (operatingPct > 80) {
    insights.push(`Mature portfolio: ${operatingPct.toFixed(0)}% operating assets`);
  }

  return {
    assetCount: assets.length,
    capacityStats: {
      total: totalCapacity,
      mean: meanCapacity,
      median: medianCapacity,
      max: sortedCapacities[sortedCapacities.length - 1] || 0,
      min: sortedCapacities[0] || 0,
    },
    statusBreakdown,
    trackerBreakdown,
    geographicConcentration,
    capacityOutliers: capacityOutliers.map((o) => ({
      asset: o.item,
      value: o.value,
      zScore: o.zScore,
    })),
    insights,
  };
}
