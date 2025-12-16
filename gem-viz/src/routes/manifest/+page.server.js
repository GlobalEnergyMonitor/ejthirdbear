/**
 * Manifest / Admin Index
 *
 * Shows all data sources, their schemas, and sample rows.
 * Built at build time from MotherDuck queries.
 */

import { query, close } from '$lib/motherduck-node';
import {
  TrackerDatasets,
  OwnershipTrackerDatasets,
  DerivedDatasets,
  dataVersionInfo,
} from '$lib/data-config/data-sources';
import { getAllTrackerNames, getTrackerConfig } from '$lib/data-config/tracker-config';

/**
 * Convert BigInt values to numbers for JSON serialization
 */
function sanitizeForJSON(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeForJSON);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeForJSON(value);
    }
    return result;
  }
  return obj;
}

/**
 * Get static configuration data (always available)
 */
function getStaticData() {
  const trackerNames = getAllTrackerNames();
  const trackerConfigs = trackerNames.map((name) => ({
    name,
    config: getTrackerConfig(name),
  }));

  const dataSources = {
    ownership: Object.entries(OwnershipTrackerDatasets).map(([key, value]) => ({
      key,
      ...value,
    })),
    trackers: Object.entries(TrackerDatasets).map(([key, value]) => ({ key, ...value })),
    derived: Object.entries(DerivedDatasets).map(([key, value]) => ({ key, ...value })),
  };

  const staticFiles = [
    { path: 'static/points.geojson', description: 'Asset locations GeoJSON' },
    { path: 'static/version.json', description: 'Build version metadata' },
  ];

  return { trackerConfigs, dataSources, staticFiles };
}

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  const startTime = Date.now();
  const staticData = getStaticData();
  let tableDetails = [];
  let dbError = null;

  try {
    // 1. Get all tables in the gem database
    const tablesResult = await query(`
      SELECT
        table_schema as schema_name,
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
      ORDER BY table_schema, table_name
    `);

    if (!tablesResult.success) {
      throw new Error(`Failed to fetch tables: ${tablesResult.error}`);
    }

    const tables = tablesResult.data;

    // 2. For each table, get schema and sample rows
    for (const table of tables) {
      const fullName = `${table.schema_name}.${table.table_name}`;

      // Get column info
      const columnsResult = await query(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = '${table.schema_name}'
          AND table_name = '${table.table_name}'
        ORDER BY ordinal_position
      `);

      // Get row count (cast to avoid BigInt)
      const countResult = await query(`
        SELECT COUNT(*)::INTEGER as row_count FROM ${fullName}
      `);

      // Get sample rows (first 4)
      const sampleResult = await query(`
        SELECT * FROM ${fullName} LIMIT 4
      `);

      // Sanitize sample rows to handle any BigInt values
      const sanitizedSamples = sampleResult.success ? sanitizeForJSON(sampleResult.data) : [];

      tableDetails.push({
        schema: table.schema_name,
        name: table.table_name,
        fullName,
        type: table.table_type,
        columns: columnsResult.success ? columnsResult.data : [],
        rowCount: countResult.success ? Number(countResult.data[0]?.row_count || 0) : null,
        sampleRows: sanitizedSamples,
        errors: [
          !columnsResult.success ? `Columns: ${columnsResult.error}` : null,
          !countResult.success ? `Count: ${countResult.error}` : null,
          !sampleResult.success ? `Sample: ${sampleResult.error}` : null,
        ].filter(Boolean),
      });
    }

    await close();
  } catch (error) {
    console.error('Manifest load error:', error);
    dbError = error instanceof Error ? error.message : String(error);
    try {
      await close();
    } catch {
      // Ignore close errors
    }
  }

  const loadTime = Date.now() - startTime;
  const totalRows = tableDetails.reduce((sum, t) => sum + (t.rowCount || 0), 0);

  return {
    tables: tableDetails,
    ...staticData,
    dataVersionInfo,
    meta: {
      loadTime,
      generatedAt: new Date().toISOString(),
      tableCount: tableDetails.length,
      totalRows,
      error: dbError,
    },
  };
}
