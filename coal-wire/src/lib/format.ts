/**
 * Format an ISO date string (YYYY-MM-DD) to a readable locale string.
 */
export function formatDate(d: string, style: 'short' | 'long' = 'short'): string {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
  });
}
