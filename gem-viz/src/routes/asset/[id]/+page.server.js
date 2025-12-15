import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Only prerender in production builds - dev mode uses client-side fetching
export const prerender = process.env.NODE_ENV !== 'development';

/**
 * Tracker-specific ID field mapping
 * Each tracker uses a different primary ID field in the parquet
 * Source of truth: $lib/data-config/tracker-config.ts
 */
const TRACKER_ID_FIELDS = {
  'Coal Plant': 'GEM unit ID',
  'Gas Plant': 'GEM unit ID',
  'Bioenergy Power': 'GEM unit ID',
  'Coal Mine': 'GEM Mine ID',
  'Iron Mine': 'GEM Asset ID',
  'Gas Pipeline': 'ProjectID',
  'Steel Plant': 'Steel Plant ID',
  // Future trackers (not yet in parquet):
  // 'Oil & NGL Pipeline': 'ProjectID',
  // 'Cement and Concrete': 'GEM Plant ID',
};

/**
 * Get the asset ID from a row using tracker-specific ID field
 */
function getAssetIdFromRow(row) {
  const tracker = row['Tracker'];
  const idField = TRACKER_ID_FIELDS[tracker];

  if (idField && row[idField]) {
    return String(row[idField]);
  }

  // Fallback for unknown trackers: try common ID fields
  return (
    String(row['GEM unit ID'] || '') ||
    String(row['GEM Mine ID'] || '') ||
    String(row['GEM Asset ID'] || '') ||
    String(row['Steel Plant ID'] || '') ||
    String(row['ProjectID'] || '') ||
    null
  );
}

// Disk cache path (persists across worker processes)
// Use .svelte-kit for build-time cache (not cleaned up like build/)
const CACHE_FILE = join(process.cwd(), '.svelte-kit/.asset-cache.json');

// In-memory cache (loaded from disk)
const ASSET_CACHE = {
  assets: new Map(),
  metadata: null,
  initialized: false,
};

// This function tells SvelteKit which asset IDs to prerender at build time
export async function entries() {
  // Use Node DuckDB for build time
  const motherduck = (await import('$lib/motherduck-node')).default;
  const { getGeographyConfig, buildS2CellSQL, buildGeometrySQL } = await import(
    '$lib/geography-config'
  );

  try {
    console.log('🚀 BULK FETCH: Loading all assets into memory...');
    const startTime = Date.now();
    const geoConfig = getGeographyConfig();

    // Initialize motherduck with optional geography support
    await motherduck.init({ includeGeography: geoConfig.enabled });

    // Query the catalog to find actual data tables
    const catalogResult = await motherduck.query(`
      SELECT schema_name, table_name, row_count
      FROM catalog
      WHERE LOWER(table_name) NOT IN ('about', 'metadata', 'readme')
        AND row_count > 100
      ORDER BY row_count DESC
      LIMIT 1
    `);

    if (!catalogResult.success || catalogResult.data.length === 0) {
      console.warn('No tables found for prerendering');
      return [];
    }

    const { schema_name, table_name } = catalogResult.data[0];
    const fullTableName = `${schema_name}.${table_name}`;
    console.log(`  Table: ${fullTableName}`);

    // Get schema
    const schemaResult = await motherduck.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = '${schema_name}'
        AND table_name = '${table_name}'
    `);

    const columns = schemaResult.data.map((c) => c.column_name);

    // Find the GEM unit ID column (this is our primary key for assets)
    const unitIdCol = columns.find((c) => c.toLowerCase() === 'gem unit id');

    // Find owner ID column for ownership tables
    const ownerIdCol = columns.find(
      (c) => c.toLowerCase().includes('owner') && c.toLowerCase().includes('id')
    );

    // Fallback ID column if not an ownership table
    const idCol =
      unitIdCol ||
      columns.find((c) => {
        const lower = c.toLowerCase();
        return (
          lower === 'id' || lower === 'wiki page' || lower === 'project id' || lower.includes('_id')
        );
      }) ||
      columns[0];

    // BULK FETCH: Get ALL asset data in one query
    // Optionally enhance with geography fields (S2 cells, geometries)
    let selectClause = '*';
    if (geoConfig.enabled) {
      if (geoConfig.verbose) {
        console.log('  🌍 Geography enabled - computing spatial fields...');
      }
      // Check if table has latitude/longitude columns
      const hasLatLon = columns.some(
        (c) => c.toLowerCase() === 'latitude' || c.toLowerCase() === 'lat'
      );
      if (hasLatLon) {
        const latCol = columns.find((c) => c.toLowerCase() === 'latitude') || 'Latitude';
        const lonCol = columns.find((c) => c.toLowerCase() === 'longitude') || 'Longitude';

        let extraCols = '';
        if (geoConfig.computeS2Cells) {
          extraCols += buildS2CellSQL(latCol, lonCol, geoConfig.s2Levels);
        }
        if (geoConfig.computeGeometries) {
          extraCols += buildGeometrySQL(latCol, lonCol);
        }

        if (extraCols) {
          selectClause = `*, ${extraCols}`;
        }
      }
    }

    const assetsResult = await motherduck.query(`
      SELECT ${selectClause}
      FROM ${fullTableName}
    `);

    if (!assetsResult.success) {
      console.error('Failed to fetch assets for prerendering:', assetsResult.error);
      return [];
    }

    // Close DB connection immediately - we have all the data we need!
    await motherduck.close();
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Fetched ${assetsResult.data.length} ownership rows in ${fetchTime}s`);
    console.log(`  ✓ DB connection closed (total lifetime: ${fetchTime}s)`);

    // GROUP BY tracker-specific ID field - each asset gets an array of ownership records
    const assetsMap = {};
    let skippedRows = 0;
    for (const row of assetsResult.data) {
      const assetId = getAssetIdFromRow(row);
      if (!assetId) {
        skippedRows++;
        continue;
      }
      if (!assetsMap[assetId]) {
        assetsMap[assetId] = [];
      }
      assetsMap[assetId].push(row);
    }
    if (skippedRows > 0) {
      console.log(`  ⚠️  Skipped ${skippedRows} rows with no valid ID`);
    }

    // Store cache data (metadata + grouped assets)
    const cacheData = {
      tableName: fullTableName,
      columns,
      idCol,
      unitIdCol,
      ownerIdCol,
      assets: assetsMap,
    };

    // Write to disk (persists across worker processes)
    const cacheJSON = JSON.stringify(cacheData);
    const cacheSizeMB = (cacheJSON.length / 1024 / 1024).toFixed(2);

    // Ensure build directory exists
    const cacheDir = dirname(CACHE_FILE);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    writeFileSync(CACHE_FILE, cacheJSON);

    const uniqueAssets = Object.keys(assetsMap).length;
    const totalRows = assetsResult.data.length;
    console.log(`  ✓ Grouped ${totalRows} ownership rows into ${uniqueAssets} unique assets`);
    console.log(`  ✓ Wrote cache to disk (${cacheSizeMB} MB)`);

    // Return unique asset IDs for prerendering
    const allAssetIds = Object.keys(assetsMap);
    console.log(
      `  📋 Asset IDs to build: ${allAssetIds.slice(0, 3).join(', ')}${allAssetIds.length > 3 ? ` ... (${allAssetIds.length} total)` : ''}`
    );
    console.log(
      `  🔨 Building ${allAssetIds.length} pages (down from ${totalRows} ownership rows)`
    );
    console.log(`  💾 Cache file: ${CACHE_FILE}`);

    // Return array of { id } objects for SvelteKit to prerender
    return allAssetIds.map((id) => ({ id }));
  } catch (err) {
    console.error('Error in entries():', err);
    return [];
  }
}

// Helper to load cache from disk
function loadCacheFromDisk() {
  if (!ASSET_CACHE.initialized) {
    if (existsSync(CACHE_FILE)) {
      try {
        const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
        ASSET_CACHE.metadata = {
          tableName: cacheData.tableName,
          columns: cacheData.columns,
          idCol: cacheData.idCol,
          unitIdCol: cacheData.unitIdCol,
          ownerIdCol: cacheData.ownerIdCol,
        };
        ASSET_CACHE.assets = new Map(Object.entries(cacheData.assets));
        ASSET_CACHE.initialized = true;
        console.log(
          `  ✓ Loaded cache: ${ASSET_CACHE.assets.size} unique assets from ${CACHE_FILE}`
        );
      } catch (err) {
        console.error(`  ✗ Failed to load cache from ${CACHE_FILE}:`, err.message);
      }
    } else {
      console.warn(`  ⚠️  Cache file not found at ${CACHE_FILE}`);
    }
  }
}

// Load function runs at build time for prerendered pages
export async function load({ params }) {
  // Only runs at build time because prerender = true

  // Load cache from disk if not already loaded
  loadCacheFromDisk();

  // Try to serve from cache (fast path)
  if (ASSET_CACHE.initialized) {
    // Assets are now arrays of ownership records grouped by GEM unit ID
    const ownershipRecords = ASSET_CACHE.assets.get(params.id);

    if (ownershipRecords && ownershipRecords.length > 0) {
      const { tableName, columns, unitIdCol } = ASSET_CACHE.metadata;

      // Extract asset info from first record (asset properties are same across all)
      const firstRecord = ownershipRecords[0];

      return {
        // The asset ID (GEM unit ID)
        assetId: params.id,
        // Asset name from Project column
        assetName: firstRecord['Project'] || firstRecord['Unit Name'] || params.id,
        // All ownership records for this asset
        owners: ownershipRecords,
        // First record for backward compatibility & basic asset info
        asset: firstRecord,
        // Metadata
        tableName,
        columns,
        unitIdCol,
        svgs: { map: null, capacity: null, status: null },
      };
    }
  }

  // Cache miss - in dev mode, return empty data and let client-side hydration handle it
  // In build mode, this means the asset doesn't exist
  const isDev = process.env.NODE_ENV === 'development' || !ASSET_CACHE.initialized;

  if (isDev) {
    console.log(`  ℹ️  Dev mode: letting client-side fetch handle ${params.id}`);
    return {
      assetId: params.id,
      assetName: params.id,
      owners: [],
      asset: {},
      tableName: '',
      columns: [],
      unitIdCol: '',
      svgs: { map: null, capacity: null, status: null },
    };
  }

  // In production build, cache miss means asset doesn't exist
  console.warn(`⚠️  Cache miss for ${params.id} - skipping (DB already closed after bulk fetch)`);
  throw error(404, `Asset ${params.id} not found in cache`);
}
