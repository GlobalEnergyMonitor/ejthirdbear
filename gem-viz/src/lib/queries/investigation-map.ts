/**
 * Investigation Map Queries
 *
 * REST API WISHLIST: POST /assets/locations { entityIds: [...], assetIds: [...] }
 * Returns locations for assets owned by entities or specific asset IDs
 */

import { unifiedQuery } from '$lib/data/unified-query';
import type { QueryResult } from '$lib/duckdb-utils';
import { ASSET_ID_COALESCE_O } from './constants';

export interface InvestigationLocation {
  asset_id: string;
  name: string;
  tracker: string;
  status: string;
  lat: number;
  lng: number;
  country: string;
  capacity: number | null;
  owner: string;
}

/**
 * Get asset locations for investigation map
 *
 * REST API equivalent needed:
 *   POST /assets/locations { entityIds: [...], assetIds: [...] }
 *
 * Used by InvestigationMap to show assets for selected entities
 */
export async function getInvestigationLocations(
  entityIds: string[],
  assetIds: string[]
): Promise<QueryResult<InvestigationLocation>> {
  if (entityIds.length === 0 && assetIds.length === 0) {
    return { success: true, data: [] };
  }

  const entityList =
    entityIds.length > 0 ? entityIds.map((id) => `'${id}'`).join(',') : "'__none__'";
  const assetList = assetIds.length > 0 ? assetIds.map((id) => `'${id}'`).join(',') : "'__none__'";

  const sql = `
    SELECT DISTINCT
      ${ASSET_ID_COALESCE_O} as asset_id,
      o."Project" as name,
      o."Asset Type" as tracker,
      o."Status" as status,
      l."Latitude" as lat,
      l."Longitude" as lng,
      l."Country.Area" as country,
      TRY_CAST(o."Capacity (MW)" AS DOUBLE) as capacity,
      o."Owner" as owner
    FROM ownership o
    LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
    WHERE (o."Owner GEM Entity ID" IN (${entityList})
       OR ${ASSET_ID_COALESCE_O} IN (${assetList}))
      AND l."Latitude" IS NOT NULL
      AND l."Longitude" IS NOT NULL
    LIMIT 500
  `;

  return unifiedQuery<InvestigationLocation>(sql);
}
