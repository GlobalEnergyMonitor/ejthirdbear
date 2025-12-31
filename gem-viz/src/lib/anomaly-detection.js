/**
 * Anomaly Detection
 *
 * Automatically identifies interesting patterns in ownership data.
 * These are the kinds of things a forensic analyst would flag.
 */

/**
 * @typedef {Object} Anomaly
 * @property {string} type - Anomaly type identifier
 * @property {string} severity - 'info' | 'warning' | 'critical'
 * @property {string} title - Short description
 * @property {string} detail - Longer explanation
 * @property {any} data - Supporting data
 */

/**
 * Detect anomalies in asset ownership data
 * @param {Object} params
 * @param {Array} params.owners - Ownership records for an asset
 * @param {Object} params.asset - Asset metadata
 * @param {Array} params.ownershipChain - Parsed ownership chain
 * @returns {Anomaly[]}
 */
export function detectAssetAnomalies({ owners = [], asset = {}, ownershipChain = [] }) {
  const anomalies = [];

  // 1. Ownership doesn't sum to ~100%
  const totalOwnership = owners.reduce((sum, o) => {
    const pct = parseFloat(o['% Share of Ownership'] || o['Share'] || 0);
    return sum + (isNaN(pct) ? 0 : pct);
  }, 0);

  if (totalOwnership > 0 && totalOwnership < 95) {
    anomalies.push({
      type: 'incomplete_ownership',
      severity: 'warning',
      title: 'Incomplete ownership data',
      detail: `Known ownership sums to ${totalOwnership.toFixed(1)}%. The remaining ${(100 - totalOwnership).toFixed(1)}% is unattributed.`,
      data: { totalOwnership },
    });
  }

  if (totalOwnership > 105) {
    anomalies.push({
      type: 'overlapping_ownership',
      severity: 'warning',
      title: 'Overlapping ownership claims',
      detail: `Ownership sums to ${totalOwnership.toFixed(1)}%, suggesting overlapping or double-counted stakes.`,
      data: { totalOwnership },
    });
  }

  // 2. Deep ownership chain (5+ levels)
  const maxDepth = Math.max(0, ...ownershipChain.map((c) => c.depth || 0));
  if (maxDepth >= 5) {
    anomalies.push({
      type: 'deep_chain',
      severity: 'info',
      title: 'Complex ownership structure',
      detail: `Ownership chain has ${maxDepth} levels between ultimate parent and asset.`,
      data: { depth: maxDepth },
    });
  }

  // 3. Multiple ultimate parents (fragmented ownership)
  const ultimateParents = ownershipChain.filter((c) => c.depth === maxDepth);
  if (ultimateParents.length > 3) {
    anomalies.push({
      type: 'fragmented_ownership',
      severity: 'info',
      title: 'Highly fragmented ownership',
      detail: `${ultimateParents.length} distinct ultimate parents identified.`,
      data: { parentCount: ultimateParents.length, parents: ultimateParents.slice(0, 5) },
    });
  }

  // 4. Imputed ownership values
  const imputedCount = owners.filter(
    (o) => o['Share Imputed?'] === true || o['Share Imputed?'] === 'true'
  ).length;
  if (imputedCount > 0) {
    anomalies.push({
      type: 'imputed_values',
      severity: 'info',
      title: 'Estimated ownership values',
      detail: `${imputedCount} of ${owners.length} ownership records have imputed (estimated) values.`,
      data: { imputedCount, totalCount: owners.length },
    });
  }

  // 5. Missing critical data
  const missingFields = [];
  if (!asset.Status) missingFields.push('Status');
  if (!asset['Capacity (MW)'] && !asset.Capacity) missingFields.push('Capacity');
  if (!asset.Country) missingFields.push('Country');

  if (missingFields.length > 0) {
    anomalies.push({
      type: 'missing_data',
      severity: missingFields.length > 1 ? 'warning' : 'info',
      title: 'Incomplete asset data',
      detail: `Missing: ${missingFields.join(', ')}`,
      data: { missingFields },
    });
  }

  // 6. Unusual status
  const status = (asset.Status || '').toLowerCase();
  if (status.includes('shelved') || status.includes('mothballed')) {
    anomalies.push({
      type: 'unusual_status',
      severity: 'info',
      title: 'Asset in limbo',
      detail: `Status "${asset.Status}" indicates uncertain operational future.`,
      data: { status: asset.Status },
    });
  }

  return anomalies;
}

/**
 * Detect anomalies in entity portfolio data
 * @param {Object} params
 * @param {Object} params.entity - Entity metadata
 * @param {Array} params.assets - Portfolio assets
 * @param {Object} params.stats - Aggregated stats
 * @returns {Anomaly[]}
 */
export function detectEntityAnomalies({ entity = {}, assets = [], stats = {} }) {
  const anomalies = [];

  // 1. High concentration in single tracker
  if (entity.trackers?.length === 1 && assets.length > 10) {
    anomalies.push({
      type: 'single_sector',
      severity: 'info',
      title: 'Single-sector focus',
      detail: `All ${assets.length} assets are ${entity.trackers[0]}. No diversification.`,
      data: { tracker: entity.trackers[0], assetCount: assets.length },
    });
  }

  // 2. Predominantly retired/cancelled portfolio
  const retiredCount = assets.filter((a) => {
    const s = (a.status || '').toLowerCase();
    return s.includes('retired') || s.includes('cancelled');
  }).length;

  if (retiredCount > assets.length * 0.5 && assets.length > 5) {
    const pct = ((retiredCount / assets.length) * 100).toFixed(0);
    anomalies.push({
      type: 'legacy_portfolio',
      severity: 'info',
      title: 'Legacy-heavy portfolio',
      detail: `${pct}% of assets are retired or cancelled (${retiredCount} of ${assets.length}).`,
      data: { retiredCount, totalCount: assets.length, percentage: pct },
    });
  }

  // 3. Geographic concentration
  const countryCounts = {};
  assets.forEach((a) => {
    const country = a.country || a.Country || 'Unknown';
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  });

  const topCountry = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0];
  if (topCountry && topCountry[1] > assets.length * 0.8 && assets.length > 10) {
    anomalies.push({
      type: 'geographic_concentration',
      severity: 'info',
      title: 'Geographic concentration',
      detail: `${((topCountry[1] / assets.length) * 100).toFixed(0)}% of assets in ${topCountry[0]}.`,
      data: { country: topCountry[0], count: topCountry[1], total: assets.length },
    });
  }

  // 4. Large capacity with few assets (mega-projects)
  if (stats.total_capacity_mw > 10000 && assets.length < 5) {
    const avgCapacity = stats.total_capacity_mw / assets.length;
    anomalies.push({
      type: 'mega_assets',
      severity: 'info',
      title: 'Concentrated in mega-assets',
      detail: `${assets.length} assets averaging ${Math.round(avgCapacity).toLocaleString()} MW each.`,
      data: { avgCapacity, assetCount: assets.length },
    });
  }

  // 5. All imputed ownership
  const imputedCount = assets.filter((a) => a.shareImputed).length;
  if (imputedCount === assets.length && assets.length > 0) {
    anomalies.push({
      type: 'all_imputed',
      severity: 'warning',
      title: 'All ownership estimated',
      detail: 'Every ownership stake in this portfolio is an estimated value.',
      data: { count: imputedCount },
    });
  }

  return anomalies;
}

/**
 * Get severity weight for sorting
 * @param {string} severity
 * @returns {number}
 */
export function severityWeight(severity) {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    case 'info':
      return 1;
    default:
      return 0;
  }
}

/**
 * Sort anomalies by severity
 * @param {Anomaly[]} anomalies
 * @returns {Anomaly[]}
 */
export function sortBySeverity(anomalies) {
  return [...anomalies].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
}
