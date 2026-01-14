/**
 * @module analysis
 *
 * Statistical analysis and pattern detection utilities.
 * Based on established methodologies (HHI, Gini, Z-scores).
 *
 * @example
 * import { calculateHHI, findOutliers, analyzePortfolio } from '$lib/analysis';
 */

export {
  // Concentration measures
  calculateHHI,
  interpretHHI,
  calculateGini,
  interpretGini,
  // Outlier detection
  calculateZScore,
  findOutliers,
  // Geographic analysis
  calculateGeographicConcentration,
  // Co-investment analysis
  analyzeCoInvestment,
  // Portfolio analysis
  analyzePortfolio,
} from './patterns';
