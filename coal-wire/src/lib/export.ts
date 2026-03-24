import type { SearchResult } from './db';

/**
 * Export search results as CSV.
 */
export function resultsToCSV(results: SearchResult[]): string {
  const headers: (keyof SearchResult)[] = ['issue_number', 'date', 'section', 'title', 'url'];
  const rows = results.map((r) =>
    headers.map((h) => {
      const val = String(r[h] ?? '');
      return val.includes(',') || val.includes('"') || val.includes('\n')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Trigger a CSV download in the browser.
 */
export function downloadCSV(results: SearchResult[], filename = 'coalwire-results.csv') {
  const csv = resultsToCSV(results);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build a shareable URL from current search state.
 */
export function buildShareURL(base: string, params: Record<string, string>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

/**
 * Copy text to clipboard, returns true on success.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
