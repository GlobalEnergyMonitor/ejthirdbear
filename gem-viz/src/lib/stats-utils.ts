/**
 * Statistics Utilities
 * Optimized helper functions for data analysis and percentile calculations
 */

/**
 * Create a memoized sorted array for percentile calculations
 * Call once per dataset, then use the returned function for lookups
 */
export function createPercentileLookup(
  values: (number | null | undefined)[]
): (_value: number) => number {
  const sorted = values.filter((d): d is number => d != null).sort((a, b) => a - b);
  const len = sorted.length;

  return (value: number): number => {
    if (len === 0) return 0;

    // Binary search for efficiency on large arrays
    let lo = 0;
    let hi = len;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo === len) return 100;
    return Math.round((lo / len) * 100);
  };
}

/**
 * Calculate percentile rank of a value within a dataset
 * For single lookups - use createPercentileLookup for multiple lookups on same data
 */
export function percentileRank(value: number, values: (number | null | undefined)[]): number {
  const lookup = createPercentileLookup(values);
  return lookup(value);
}

/**
 * Calculate capacity percentiles for an asset
 */
export function capacityPercentiles(
  capacity: number,
  country: string,
  allAssets: Array<{ capacity?: number | null; country?: string }>
): { global: number; country: number } {
  const globalCaps = allAssets.map((d) => d.capacity);
  const countryCaps = allAssets.filter((d) => d.country === country).map((d) => d.capacity);

  return {
    global: percentileRank(capacity, globalCaps),
    country: countryCaps.length > 0 ? percentileRank(capacity, countryCaps) : 0,
  };
}

/**
 * Shorten a string with ellipsis
 */
export function shorten(str: string | null | undefined, maxLength: number): string {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '\u2026';
}

/**
 * Format a number as percentage
 */
export function formatPercent(value: number, decimals = 1): string {
  return (value * 100).toFixed(decimals) + '%';
}

/**
 * Format millions of tonnes CO2
 */
export function formatMtCO2(value: number | null | undefined): string {
  if (value == null) return '';
  return `${value.toFixed(2)} MtCO\u2082`;
}

/**
 * Format capacity with appropriate unit
 */
export function formatCapacity(value: number | null | undefined, unit = 'MW'): string {
  if (value == null) return '';
  return `${value.toLocaleString()} ${unit}`;
}
