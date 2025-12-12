/**
 * Shared SQL helpers for MotherDuck queries
 *
 * ID/column helpers have moved to id-helpers.ts
 * Re-exported here for backwards compatibility
 */

// Re-export ID helpers for backwards compatibility
export {
  findIdColumn,
  findNameColumn,
  extractAssetName,
  findUnitIdColumn,
  findCommonColumns,
  getAssetId,
} from './id-helpers';

/** Escape single quotes for SQL string literals */
export function escapeValue(val: unknown): string {
  return String(val ?? '').replace(/'/g, "''");
}

/** Get column names from information_schema */
export const SCHEMA_SQL = (schema: string, table: string) => `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = '${schema}'
    AND table_name = '${table}'
  ORDER BY ordinal_position
`;

/** Select all columns for a row by ID */
export const ASSET_SQL = (fullTableName: string, idColumn: string, id: string) => `
  SELECT *
  FROM ${fullTableName}
  WHERE "${idColumn}" = '${escapeValue(id)}'
`;
