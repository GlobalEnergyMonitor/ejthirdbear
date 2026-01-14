/**
 * SQL utility functions for safe query construction
 */

/**
 * Escape a string for safe use in SQL queries (single quote escaping)
 */
export function escapeSQL(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/'/g, "''");
}

/**
 * Build a comma-separated list of escaped strings for SQL IN clauses
 * @example buildIdList(['a', 'b']) => "'a','b'"
 */
export function buildIdList(ids: string[]): string {
  if (!Array.isArray(ids)) return '';
  return ids.map((id) => `'${escapeSQL(String(id))}'`).join(',');
}
