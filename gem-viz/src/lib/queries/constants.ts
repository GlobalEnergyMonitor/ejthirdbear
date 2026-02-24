/**
 * DuckDB Query Constants
 *
 * SQL fragments for asset ID handling across different trackers.
 */

/**
 * SQL fragment to get the asset ID regardless of tracker type.
 * Use this in SELECT and GROUP BY clauses.
 *
 * NOTE: New MotherDuck schema (October 2025+) uses unified "Asset ID" column.
 */
export const ASSET_ID_COALESCE = `COALESCE("GEM unit ID", "GEM Mine ID", "Steel Plant ID", "GEM Asset ID", "ProjectID")`;

/**
 * Same as ASSET_ID_COALESCE but with 'o.' table prefix for JOIN queries.
 */
export const ASSET_ID_COALESCE_O = `COALESCE(o."GEM unit ID", o."GEM Mine ID", o."Steel Plant ID", o."GEM Asset ID", o."ProjectID")`;
