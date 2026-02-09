/**
 * Widget Queries
 *
 * REST API WISHLIST: GET /stats/top-owners, GET /stats/status-distribution
 * These power dashboard widgets with aggregated statistics
 */

import { unifiedQuery } from '$lib/data/unified-query';
import type { QueryResult } from '$lib/duckdb-utils';
import { ASSET_ID_COALESCE, ASSET_ID_COALESCE_O } from './constants';

export interface TopOwnerResult {
  owner_name: string;
  entity_id: string;
  value: number;
  asset_count: number;
}

/**
 * Get top owners by asset count or capacity
 *
 * REST API equivalent needed:
 *   GET /stats/top-owners?metric=assets&limit=10
 *   GET /stats/top-owners?metric=capacity&tracker=Coal+Plant
 */
export async function getTopOwners(options: {
  limit?: number;
  metric?: 'assets' | 'capacity';
  tracker?: string | null;
}): Promise<QueryResult<TopOwnerResult>> {
  const { limit = 10, metric = 'assets', tracker = null } = options;
  const trackerFilter = tracker ? `AND "Asset Type" = '${tracker}'` : '';
  const capacityCol = metric === 'capacity' ? 'SUM(COALESCE("Capacity (MW)", 0))' : 'COUNT(*)';

  const sql = `
    SELECT
      "Owner" as owner_name,
      "Owner GEM Entity ID" as entity_id,
      ${capacityCol} as value,
      COUNT(DISTINCT ${ASSET_ID_COALESCE}) as asset_count
    FROM ownership
    WHERE "Owner" IS NOT NULL AND "Owner" != ''
    ${trackerFilter}
    GROUP BY "Owner", "Owner GEM Entity ID"
    ORDER BY value DESC
    LIMIT ${limit}
  `;

  return unifiedQuery<TopOwnerResult>(sql);
}

export interface StatusCount {
  status: string;
  count: number;
}

/**
 * Get status distribution (raw counts before regrouping)
 *
 * REST API equivalent needed:
 *   GET /stats/status-distribution
 *   GET /stats/status-distribution?tracker=Coal+Plant
 */
export async function getStatusDistribution(
  tracker?: string | null
): Promise<QueryResult<StatusCount>> {
  const trackerFilter = tracker ? `WHERE "Asset Type" = '${tracker}'` : '';

  const sql = `
    SELECT
      "Status" as status,
      COUNT(DISTINCT ${ASSET_ID_COALESCE}) as count
    FROM ownership
    ${trackerFilter}
    GROUP BY "Status"
    ORDER BY count DESC
  `;

  return unifiedQuery<StatusCount>(sql);
}

export interface CountryCount {
  country: string;
  asset_count: number;
  total_capacity: number;
}

/**
 * Get assets by country breakdown
 *
 * REST API equivalent needed:
 *   GET /stats/by-country?limit=15
 *   GET /stats/by-country?tracker=Coal+Plant
 */
export async function getCountryBreakdown(options: {
  limit?: number;
  tracker?: string | null;
}): Promise<QueryResult<CountryCount>> {
  const { limit = 15, tracker = null } = options;
  const trackerFilter = tracker ? `WHERE o."Asset Type" = '${tracker}'` : '';

  const sql = `
    SELECT
      COALESCE(l."Country.Area", 'Unknown') as country,
      COUNT(DISTINCT ${ASSET_ID_COALESCE_O}) as asset_count,
      SUM(COALESCE(o."Capacity (MW)", 0)) as total_capacity
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    ${trackerFilter}
    GROUP BY 1
    ORDER BY asset_count DESC
    LIMIT ${limit}
  `;

  return unifiedQuery<CountryCount>(sql);
}
