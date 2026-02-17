/**
 * Shared formatting utilities for the GEM Viz application.
 * Centralized from EntityMicroCard, AssetMicroCard, TrackerFactsheet, and ProjectCard.
 */

/**
 * Format capacity in MW with smart unit conversion.
 * Values >= 1000 MW display as GW; otherwise MW.
 * Returns null for falsy or zero values.
 */
export function formatCapacity(mw: number): string | null {
  if (!mw || mw === 0) return null;
  if (mw >= 1000) {
    return `${(mw / 1000).toFixed(1)} GW`;
  }
  return `${Math.round(mw).toLocaleString()} MW`;
}

/**
 * Format a number with locale-aware separators.
 */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Format a number in compact notation (1.2K, 3.4M).
 */
export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/**
 * Format a percentage value (0-100) with smart precision.
 * Values >= 10 are rounded to integers; smaller values show one decimal.
 */
export function formatPct(n: number): string {
  if (n >= 10) return `${Math.round(n)}%`;
  return `${n.toFixed(1)}%`;
}

/**
 * Format a ratio (0-1) as a percentage string with one decimal place.
 * Returns empty string for null/undefined values.
 */
export function formatRatioAsPct(v: number | undefined): string {
  if (v == null) return '';
  return `${(v * 100).toFixed(1)}%`;
}
