/**
 * Number Formatting Utilities
 *
 * Consistent D3-based formatting for numbers, capacities, percentages, etc.
 */

import { format as d3Format } from 'd3';

// ---------------------------------------------------------------------------
// Core Formatters
// ---------------------------------------------------------------------------

/** Thousands separator: 1,234,567 */
export const formatComma = d3Format(',');

/** SI prefix (compact): 1.2M, 3.4k */
export const formatSI = d3Format('.2s');

/** SI prefix with more precision: 1.23M */
export const formatSIPrecise = d3Format('.3s');

/** Integer with commas: 1,234 */
export const formatInt = d3Format(',.0f');

/** One decimal with commas: 1,234.5 */
export const formatDecimal = d3Format(',.1f');

/** Two decimals with commas: 1,234.56 */
export const formatDecimal2 = d3Format(',.2f');

/** Percentage (0-1 input): 12.3% */
export const formatPercent = d3Format('.1%');

/** Percentage (0-100 input): 12.3% */
export const formatPercentRaw = (v) => d3Format('.1f')(v) + '%';

/** Year: 2024 */
export const formatYear = d3Format('d');

// ---------------------------------------------------------------------------
// Domain-Specific Formatters
// ---------------------------------------------------------------------------

/**
 * Format capacity in MW with appropriate scale
 * - < 1: "0.5 MW"
 * - < 1000: "123 MW"
 * - >= 1000: "1.2 GW"
 * - >= 1000000: "1.2 TW"
 */
export function formatCapacity(mw) {
  if (mw == null || isNaN(mw)) return '—';
  if (mw < 1) return d3Format('.2f')(mw) + ' MW';
  if (mw < 1000) return d3Format(',.0f')(mw) + ' MW';
  if (mw < 1000000) return d3Format('.2f')(mw / 1000) + ' GW';
  return d3Format('.2f')(mw / 1000000) + ' TW';
}

/**
 * Format capacity compactly for small spaces
 * - < 1000: "123"
 * - >= 1000: "1.2k"
 * - >= 1000000: "1.2M"
 */
export function formatCapacityCompact(mw) {
  if (mw == null || isNaN(mw)) return '—';
  return formatSI(mw);
}

/**
 * Format count with appropriate scale
 * - < 1000: "123"
 * - >= 1000: "1.2k"
 * - >= 1000000: "1.2M"
 */
export function formatCount(n) {
  if (n == null || isNaN(n)) return '—';
  if (n < 1000) return formatInt(n);
  return formatSI(n);
}

/**
 * Format large numbers compactly
 * Always uses SI prefix
 */
export function formatCompact(n) {
  if (n == null || isNaN(n)) return '—';
  return formatSI(n);
}

/**
 * Format ownership share percentage
 */
export function formatShare(pct) {
  if (pct == null || isNaN(pct)) return '—';
  if (pct === 100) return '100%';
  if (pct < 1) return d3Format('.2f')(pct) + '%';
  return d3Format('.1f')(pct) + '%';
}

/**
 * Format money (USD)
 */
export function formatMoney(usd) {
  if (usd == null || isNaN(usd)) return '—';
  if (usd < 1000) return '$' + formatInt(usd);
  if (usd < 1000000) return '$' + d3Format('.1f')(usd / 1000) + 'k';
  if (usd < 1000000000) return '$' + d3Format('.1f')(usd / 1000000) + 'M';
  return '$' + d3Format('.1f')(usd / 1000000000) + 'B';
}

/**
 * Format range (e.g., capacity range, year range)
 */
export function formatRange(min, max, formatter = formatComma) {
  if (min == null && max == null) return '—';
  if (min == null) return `≤ ${formatter(max)}`;
  if (max == null) return `≥ ${formatter(min)}`;
  if (min === max) return formatter(min);
  return `${formatter(min)} – ${formatter(max)}`;
}
