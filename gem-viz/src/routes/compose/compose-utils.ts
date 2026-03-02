/**
 * Compose page utility functions
 * Extracted to reduce +page.svelte file size
 */

import { browser } from '$app/environment';

/**
 * Merge parametric counts into base options
 * Keeps all base options, updates counts from parametric results, sets 0 for missing
 */
export function mergeParametricCounts(
  baseOptions: Array<{ value: string; count?: number }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parametricResults: Array<any>
): Array<{ value: string; count: number }> {
  const countMap = new Map<string, number>();
  for (const r of parametricResults) {
    const value = r.value as string;
    const cnt = r.count as number;
    if (value != null) {
      countMap.set(value, cnt ?? 0);
    }
  }
  return baseOptions.map((opt) => ({
    value: opt.value,
    count: countMap.get(opt.value) ?? 0,
  }));
}

/**
 * Calculate capacity distribution data for histogram
 */
export function calculateCapacityData(results: Array<{ capacity_mw?: number }>): number[] {
  return results.map((r) => r.capacity_mw).filter((c): c is number => c != null && !isNaN(c));
}

/**
 * Calculate start year distribution for sparkline (count by year)
 */
export function calculateStartYearData(
  results: Array<{ start_year?: number }>
): Array<{ x: number; y: number }> {
  const years = results
    .map((r) => r.start_year)
    .filter((y): y is number => y != null && !isNaN(y) && y > 1900 && y < 2100);

  if (!years.length) return [];

  // Count by year
  const counts: Record<number, number> = {};
  for (const y of years) {
    counts[y] = (counts[y] || 0) + 1;
  }

  // Convert to array sorted by year
  return Object.entries(counts)
    .map(([year, count]) => ({ x: Number(year), y: count }))
    .sort((a, b) => a.x - b.x);
}

/**
 * Calculate status distribution for bar chart
 */
export function calculateStatusDistribution(
  results: Array<{ status?: string }>
): Array<{ label: string; value: number }> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const status = r.status || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
  }
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

/**
 * Calculate country distribution for bar chart
 */
export function calculateCountryDistribution(
  results: Array<{ country?: string }>
): Array<{ label: string; value: number }> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const country = r.country || 'Unknown';
    counts[country] = (counts[country] || 0) + 1;
  }
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

/**
 * Calculate tracker distribution for bar chart
 */
export function calculateTrackerDistribution(
  results: Array<{ tracker?: string }>
): Array<{ label: string; value: number }> {
  const counts: Record<string, number> = {};
  for (const r of results) {
    const tracker = r.tracker || 'Unknown';
    counts[tracker] = (counts[tracker] || 0) + 1;
  }
  return Object.entries(counts).map(([label, value]) => ({ label, value }));
}

/**
 * Copy text to clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!browser) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: show URL in prompt if clipboard fails
    window.prompt('Copy this URL:', text);
    return false;
  }
}

/**
 * Download JSON data as a file
 */
export function downloadJson(data: unknown, filename: string): void {
  if (!browser) return;
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Read file as text (for import functionality)
 */
export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

/**
 * Generate pagination page numbers with ellipsis
 */
export function getPaginationPages(
  currentPage: number,
  totalPages: number
): Array<number | 'ellipsis'> {
  const pages: Array<number | 'ellipsis'> = [];

  if (totalPages <= 7) {
    // Show all pages if 7 or fewer
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('ellipsis');
    }

    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }
  }

  return pages;
}

export interface TooltipPosition {
  x: number;
  y: number;
}

/**
 * Calculate tooltip position from mouse event
 */
export function getTooltipPosition(event: MouseEvent): TooltipPosition {
  return { x: event.clientX, y: event.clientY };
}

/**
 * Format asset row for display
 */
export function formatAssetForTooltip(row: {
  asset_id?: string;
  name?: string;
  status?: string;
  tracker?: string;
  country?: string;
  capacity_mw?: number;
  owner?: string;
  start_year?: number;
}): {
  id: string;
  name: string;
  status: string;
  tracker: string;
  country: string;
  capacity: number | null;
  owner: string;
  startYear: number | null;
} | null {
  if (!row?.asset_id) return null;
  return {
    id: row.asset_id,
    name: row.name || row.asset_id,
    status: row.status || '',
    tracker: row.tracker || '',
    country: row.country || '',
    capacity: row.capacity_mw ?? null,
    owner: row.owner || '',
    startYear: row.start_year ?? null,
  };
}
