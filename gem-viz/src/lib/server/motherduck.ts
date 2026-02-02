/**
 * Server-side MotherDuck queries using native DuckDB
 *
 * Schema (gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership):
 * - "Asset Type" (tracker)
 * - "Asset ID"
 * - "Asset Unit ID"
 * - "Asset Name"
 * - "Immediate Owner Entity ID"
 * - "Immediate Owner Entity Name"
 * - "% Share of Ownership"
 */

import { MOTHERDUCK_JWT } from '$env/static/private';
import duckdbModule from 'duckdb';

const { Database } = duckdbModule;

// MotherDuck table path
const OWNERSHIP_TABLE = 'gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership';

/**
 * Execute a query against MotherDuck
 */
async function serverQuery<T = Record<string, unknown>>(
  sql: string
): Promise<{ success: boolean; data: T[]; error?: string }> {
  return new Promise((resolve) => {
    try {
      const db = new Database(':memory:');
      const conn = db.connect();

      conn.run('INSTALL motherduck; LOAD motherduck;', (err1) => {
        if (err1) {
          db.close();
          resolve({ success: false, data: [], error: `Extension: ${err1.message}` });
          return;
        }

        conn.run(`SET motherduck_token='${MOTHERDUCK_JWT}';`, (err2) => {
          if (err2) {
            db.close();
            resolve({ success: false, data: [], error: `Token: ${err2.message}` });
            return;
          }

          conn.run(`ATTACH 'md:gem_data';`, (err3) => {
            if (err3) {
              db.close();
              resolve({ success: false, data: [], error: `Attach: ${err3.message}` });
              return;
            }

            // Replace table alias and execute
            const adaptedSql = sql.replace(/\bownership\b/gi, OWNERSHIP_TABLE);

            conn.all(adaptedSql, (err4: Error | null, rows: T[]) => {
              db.close();
              if (err4) {
                resolve({ success: false, data: [], error: `Query: ${err4.message}` });
              } else {
                // Convert BigInt to Number for JSON serialization
                const converted = (rows || []).map(row => {
                  const newRow: Record<string, unknown> = {};
                  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
                    newRow[key] = typeof value === 'bigint' ? Number(value) : value;
                  }
                  return newRow as T;
                });
                resolve({ success: true, data: converted });
              }
            });
          });
        });
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      resolve({ success: false, data: [], error: message });
    }
  });
}

/**
 * Get top owners by asset count
 */
export async function getTopOwnersServer(options: {
  limit?: number;
  metric?: 'assets' | 'capacity';
  tracker?: string | null;
}): Promise<{ success: boolean; data: Array<{ owner_name: string; entity_id: string; value: number; asset_count: number }>; error?: string }> {
  const { limit = 10, tracker = null } = options;
  const trackerFilter = tracker ? `AND "Asset Type" = '${tracker}'` : '';

  // Note: This schema doesn't have capacity, so we always count assets
  const sql = `
    SELECT
      "Immediate Owner Entity Name" as owner_name,
      "Immediate Owner Entity ID" as entity_id,
      COUNT(DISTINCT "Asset ID") as value,
      COUNT(DISTINCT "Asset ID") as asset_count
    FROM ownership
    WHERE "Immediate Owner Entity Name" IS NOT NULL
      AND "Immediate Owner Entity Name" != ''
      ${trackerFilter}
    GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
    ORDER BY value DESC
    LIMIT ${limit}
  `;

  return serverQuery(sql);
}

/**
 * Get status distribution - NOT AVAILABLE in this schema
 * Returns empty result since schema doesn't have status
 */
export async function getStatusDistributionServer(
  _tracker?: string | null
): Promise<{ success: boolean; data: Array<{ status: string; count: number }>; error?: string }> {
  return {
    success: true,
    data: [],
    error: 'Status data not available in server-side dataset'
  };
}

/**
 * Get country breakdown - NOT AVAILABLE in this schema
 * Returns empty result since schema doesn't have country
 */
export async function getCountryBreakdownServer(_options: {
  limit?: number;
  tracker?: string | null;
}): Promise<{ success: boolean; data: Array<{ country: string; asset_count: number; total_capacity: number }>; error?: string }> {
  return {
    success: true,
    data: [],
    error: 'Country data not available in server-side dataset'
  };
}

/**
 * Get tracker summary stats
 */
export async function getTrackerStatsServer(): Promise<{ success: boolean; data: Array<{ tracker: string; assetCount: number; totalCapacity: number; operatingCount: number; proposedCount: number }>; error?: string }> {
  const sql = `
    SELECT
      "Asset Type" as tracker,
      COUNT(DISTINCT "Asset ID") as assetCount,
      0 as totalCapacity,
      0 as operatingCount,
      0 as proposedCount
    FROM ownership
    WHERE "Asset Type" IS NOT NULL
    GROUP BY "Asset Type"
    ORDER BY assetCount DESC
  `;

  return serverQuery(sql);
}

/**
 * Get owner's asset type breakdown (since we don't have country)
 */
export async function getOwnerCountryBreakdownServer(
  ownerEntityId: string
): Promise<{ success: boolean; data: Array<{ value: string; count: number }>; error?: string }> {
  const sql = `
    SELECT
      "Asset Type" as value,
      COUNT(DISTINCT "Asset ID") as count
    FROM ownership
    WHERE "Immediate Owner Entity ID" = '${ownerEntityId}'
    GROUP BY "Asset Type"
    ORDER BY count DESC
  `;

  return serverQuery(sql);
}
