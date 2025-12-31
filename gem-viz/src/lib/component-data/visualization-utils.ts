/**
 * Shared visualization utilities for ownership visualization components
 * (AssetScreener, OwnershipFlower, etc.)
 */

import { regroupStatus } from '$lib/ownership-theme';

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

/**
 * Standard layout parameters for ownership visualization components.
 * Originally from GEM's Observable notebook.
 */
export const LAYOUT_PARAMS = {
  subsidX: 20,
  subsidiaryMarkHeight: 19,
  subsidiaryMinHeight: 90,
  yPadding: 50,
  assetsX: 500,
  assetSpacing: 8,
  assetMarkHeightSingle: 16,
  assetMarkHeightCombined: 26,
} as const;

/**
 * Standard SVG margin for charts
 */
export const SVG_MARGIN = {
  top: 70,
  right: 10,
  bottom: 30,
  left: 40,
} as const;

/**
 * Default SVG width for ownership charts
 */
export const SVG_WIDTH = 900;

// ============================================================================
// SCALE FUNCTIONS
// ============================================================================

/**
 * Scale radius for combined units based on unit count.
 * Used for visualizing multiple units at the same location.
 *
 * @param n - Number of units
 * @returns Scaled radius multiplier (0.5 to 1.5)
 */
export function scaleR(n: number): number {
  if (n <= 2) return 0.5;
  if (n <= 10) return 0.5 + (n - 2) * (0.5 / 8);
  if (n <= 20) return 1 + (n - 10) * (0.5 / 10);
  return 1.5;
}

// ============================================================================
// FREQUENCY CALCULATIONS
// ============================================================================

export interface FrequencyItem {
  count: number;
  percentage: number;
  xPercentage: number;
}

export interface TrackerFrequency extends FrequencyItem {
  tracker: string;
}

export interface StatusFrequency extends FrequencyItem {
  status: string;
}

export interface FrequencyTables {
  tracker: TrackerFrequency[];
  status: StatusFrequency[];
}

/**
 * Calculate frequency tables for mini bar charts.
 * Groups units by tracker type and status for stacked bar visualization.
 *
 * @param units - Array of unit objects with tracker and status properties
 * @returns Object with tracker and status frequency arrays
 */
export function calculateFrequencyTables(
  units: Array<{ tracker?: string; status?: string; Status?: string }>
): FrequencyTables {
  const total = units.length;
  if (total === 0) return { tracker: [], status: [] };

  // Tracker frequency
  const trackerMap = new Map<string, number>();
  units.forEach((u) => {
    const t = u.tracker || 'Unknown';
    trackerMap.set(t, (trackerMap.get(t) || 0) + 1);
  });
  const trackerData: TrackerFrequency[] = Array.from(trackerMap.entries())
    .map(([tracker, count]) => ({
      tracker,
      count,
      percentage: count / total,
      xPercentage: 0,
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate cumulative x positions for stacked bars
  let xTracker = 0;
  trackerData.forEach((d) => {
    d.xPercentage = xTracker;
    xTracker += d.percentage;
  });

  // Status frequency (grouped by regroupStatus)
  const statusMap = new Map<string, number>();
  units.forEach((u) => {
    const s = regroupStatus(u.status || u.Status || '');
    statusMap.set(s, (statusMap.get(s) || 0) + 1);
  });
  const statusOrder = ['proposed', 'operating', 'retired', 'cancelled'];
  const statusData: StatusFrequency[] = Array.from(statusMap.entries())
    .map(([status, count]) => ({
      status,
      count,
      percentage: count / total,
      xPercentage: 0,
    }))
    .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));

  // Calculate cumulative x positions
  let xStatus = 0;
  statusData.forEach((d) => {
    d.xPercentage = xStatus;
    xStatus += d.percentage;
  });

  return { tracker: trackerData, status: statusData };
}

// ============================================================================
// SVG PATH GENERATORS
// ============================================================================

/**
 * Generate SVG arc path for ownership percentage pie chart.
 * Creates a pie slice from 0 to the given percentage.
 *
 * @param value - Ownership percentage (0-100)
 * @param radius - Radius of the pie
 * @returns SVG path string
 */
export function arcPath(value: number | undefined, radius: number): string {
  const pct = (value || 100) / 100;
  const endAngle = 2 * Math.PI * pct;
  const largeArc = endAngle > Math.PI ? 1 : 0;
  const x1 = 0;
  const y1 = -radius;
  const x2 = radius * Math.sin(endAngle);
  const y2 = -radius * Math.cos(endAngle);

  // Full circle case
  if (pct >= 1) {
    return `M 0 ${-radius} A ${radius} ${radius} 0 1 1 0 ${radius} A ${radius} ${radius} 0 1 1 0 ${-radius}`;
  }

  return `M 0 0 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

/**
 * Generate SVG path for subsidiary connection from header to group.
 *
 * @param group - Subsidiary group with top/bottom positions
 * @param params - Layout parameters
 * @returns SVG path string
 */
export function subsidiaryPath(
  group: { top: number; bottom: number },
  params: typeof LAYOUT_PARAMS = LAYOUT_PARAMS
): string {
  const xS = 0;
  const yS = group.top;
  const xE = params.subsidX + params.assetsX - params.assetSpacing * 2;
  const yE = group.bottom;
  const radius = params.yPadding;
  const rC = radius * 0.3;

  return `
    M ${xS} ${yS - radius}
    C ${xS} ${yS - radius * 0.2}, ${xS + radius * 0.2} ${yS}, ${xS + radius} ${yS}
    L ${xE} ${yS}
    L ${xE} ${yE - rC}
    A ${rC} ${rC} 0 0 1 ${xE - rC} ${yE}
    L ${xS + rC} ${yE}
    A ${rC} ${rC} 0 0 1 ${xS} ${yE - rC}
    Z
  `;
}
