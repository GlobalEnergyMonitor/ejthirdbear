import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { extractOwnershipChainWithIds } from '$lib/component-data/ownership-parser.js';

// Only prerender in production builds - dev mode uses client-side fetching
export const prerender = process.env.NODE_ENV !== 'development';

/**
 * Columns to include in the minimal "owners" array sent to the page.
 * The page only uses these columns in the ownership table - no need for 50+ fields.
 * This reduces per-page size from ~300KB to ~30KB.
 */
const MINIMAL_OWNER_COLS = [
  'Status',
  'Owner GEM Entity ID',
  'Parent',
  'Owner',
  'Share',
  'Ownership Path',
  'Parent Headquarters Country',
  'Parent Registration Country',
  'Immediate Project Owner',
  'Immediate Project Owner GEM Entity ID',
  'Tracker',
];

/**
 * Create a minimal owner record with only the columns needed for display.
 */
function minimalOwner(record) {
  const minimal = {};
  for (const col of MINIMAL_OWNER_COLS) {
    if (record[col] !== undefined) {
      minimal[col] = record[col];
    }
  }
  return minimal;
}

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
  // FAST PATH: Reuse existing cache if SKIP_CACHE is set and cache exists
  // This saves ~30s by avoiding MotherDuck fetch
  if (process.env.SKIP_CACHE === 'true' && existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      const assetIds = Object.keys(cacheData.assets);
      console.log(`CACHE REUSE: Using existing cache with ${assetIds.length} assets`);
      console.log(`  (set SKIP_CACHE=false to refresh from MotherDuck)`);
      return assetIds.map((id) => ({ id }));
    } catch (err) {
      console.warn('Cache reuse failed, falling back to fresh fetch:', err.message);
    }
  }

  // Use Node DuckDB for build time
  const motherduck = (await import('$lib/motherduck-node')).default;
  const { getGeographyConfig, buildS2CellSQL, buildGeometrySQL } = await import(
    '$lib/geography-config'
  );

  try {
    console.log('BULK FETCH: Loading all assets into memory...');
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
        console.log('  Geography enabled - computing spatial fields...');
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
    console.log(`  [OK] Fetched ${assetsResult.data.length} ownership rows in ${fetchTime}s`);
    console.log(`  [OK] DB connection closed (total lifetime: ${fetchTime}s)`);

    // GROUP BY tracker-specific ID field - each asset gets an array of ownership records
    // Also build indices for fast lookups during page rendering
    const assetsMap = {};
    const ownerIndex = {};  // ownerEntityId -> [assetId, ...] for O(1) lookups
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

      // Build owner index for fast portfolio lookups
      const ownerEntityId = row['Owner GEM Entity ID'] || row['Immediate Project Owner GEM Entity ID'];
      if (ownerEntityId) {
        if (!ownerIndex[ownerEntityId]) {
          ownerIndex[ownerEntityId] = new Set();
        }
        ownerIndex[ownerEntityId].add(assetId);
      }
    }
    if (skippedRows > 0) {
      console.log(`  WARNING: Skipped ${skippedRows} rows with no valid ID`);
    }

    // Convert Set to Array for JSON serialization
    const ownerIndexSerialized = {};
    for (const [ownerId, assetSet] of Object.entries(ownerIndex)) {
      ownerIndexSerialized[ownerId] = Array.from(assetSet);
    }
    console.log(`  [OK] Built owner index with ${Object.keys(ownerIndexSerialized).length} owners`);

    // Store cache data (metadata + grouped assets + indices)
    const cacheData = {
      tableName: fullTableName,
      columns,
      idCol,
      unitIdCol,
      ownerIdCol,
      assets: assetsMap,
      ownerIndex: ownerIndexSerialized,  // NEW: O(1) owner->assets lookup
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
    console.log(`  [OK] Grouped ${totalRows} ownership rows into ${uniqueAssets} unique assets`);
    console.log(`  [OK] Wrote cache to disk (${cacheSizeMB} MB)`);

    // Return unique asset IDs for prerendering
    const allAssetIds = Object.keys(assetsMap);
    console.log(
      `  Asset IDs to build: ${allAssetIds.slice(0, 3).join(', ')}${allAssetIds.length > 3 ? ` ... (${allAssetIds.length} total)` : ''}`
    );
    console.log(`  Building ${allAssetIds.length} pages (down from ${totalRows} ownership rows)`);
    console.log(`  Cache file: ${CACHE_FILE}`);

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
        // Load owner index for O(1) portfolio lookups (NEW)
        ASSET_CACHE.ownerIndex = cacheData.ownerIndex || {};
        ASSET_CACHE.initialized = true;
        console.log(
          `  [OK] Loaded cache: ${ASSET_CACHE.assets.size} unique assets from ${CACHE_FILE}`
        );
      } catch (err) {
        console.error(`  [ERROR] Failed to load cache from ${CACHE_FILE}:`, err.message);
      }
    } else {
      console.warn(`  WARNING: Cache file not found at ${CACHE_FILE}`);
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

      // Extract owner entity ID for pre-baking portfolio data
      const ownerEntityId =
        firstRecord['Owner GEM Entity ID'] || firstRecord['Immediate Project Owner GEM Entity ID'];
      const locationId = firstRecord['GEM location ID'];
      const ownerName = firstRecord['Parent'] || firstRecord['Immediate Project Owner'];

      // Pre-bake owner portfolio data for AssetScreener
      // PERF: Cap assets aggressively for asset pages to reduce build size
      // Entity pages have their own larger limits - asset pages just need a summary view
      const MAX_ASSETS_PER_PAGE = 12;       // Down from 50 - just show top assets
      const MAX_ASSETS_PER_SUBSIDIARY = 6;  // Down from 20 - summary only

      let ownerExplorerData = null;
      if (ownerEntityId) {
        // OPTIMIZED: Use owner index for O(1) lookup instead of O(n) iteration
        const ownedAssetIds = ASSET_CACHE.ownerIndex[ownerEntityId] || [];

        // Skip ownerExplorerData for massive portfolios (>200 assets)
        // These would just bloat the page - user can click to entity page for full view
        if (ownedAssetIds.length > 200) {
          ownerExplorerData = {
            spotlightOwner: { id: ownerEntityId, Name: ownerName || ownerEntityId },
            totalAssetCount: ownedAssetIds.length,
            truncated: true, // Signal to component to show "view full portfolio" link
          };
        } else {
          // Normal flow for smaller portfolios
          const entityAssets = [];
          const subsidiaries = {}; // immediate_owner_id -> { name, share, assets[] }
          const directlyOwned = [];
          let totalAssetCount = ownedAssetIds.length;

          for (const assetId of ownedAssetIds) {
            const records = ASSET_CACHE.assets.get(assetId);
            if (!records || records.length === 0) continue;
            const record = records[0];

            const asset = {
              id: assetId,
              name: record['Project'] || record['Unit Name'] || assetId,
              tracker: record['Tracker'],
              status: record['Status'],
              locationId: record['GEM location ID'],
              capacityMw: Number(record['Capacity (MW)'] || 0),
            };
            entityAssets.push(asset);

            // Group by immediate owner (subsidiary) vs directly owned
            const immediateOwnerId = record['Immediate Project Owner GEM Entity ID'];
            if (immediateOwnerId && immediateOwnerId !== ownerEntityId) {
              if (!subsidiaries[immediateOwnerId]) {
                subsidiaries[immediateOwnerId] = {
                  name: record['Immediate Project Owner'] || immediateOwnerId,
                  share: Number(record['Share'] || 0),
                  assets: [],
                };
              }
              subsidiaries[immediateOwnerId].assets.push(asset);
            } else {
              directlyOwned.push(asset);
            }
          }

          // Sort by capacity and cap to avoid bloat
          entityAssets.sort((a, b) => (b.capacityMw || 0) - (a.capacityMw || 0));
          const cappedAssets = entityAssets.slice(0, MAX_ASSETS_PER_PAGE);
          const cappedDirectlyOwned = directlyOwned
            .sort((a, b) => (b.capacityMw || 0) - (a.capacityMw || 0))
            .slice(0, MAX_ASSETS_PER_SUBSIDIARY);

          // Convert to the format AssetScreener expects (with capped subsidiary assets)
          const subsidiariesMatched = Object.entries(subsidiaries).map(([subId, data]) => [
            subId,
            data.assets
              .sort((a, b) => (b.capacityMw || 0) - (a.capacityMw || 0))
              .slice(0, MAX_ASSETS_PER_SUBSIDIARY),
          ]);
          const matchedEdges = Object.entries(subsidiaries).map(([subId, data]) => [
            subId,
            { value: data.share },
          ]);
          const entityMap = Object.entries(subsidiaries).map(([subId, data]) => [
            subId,
            { id: subId, Name: data.name, type: 'entity' },
          ]);

          ownerExplorerData = {
            spotlightOwner: { id: ownerEntityId, Name: ownerName || ownerEntityId },
            subsidiariesMatched,
            directlyOwned: cappedDirectlyOwned,
            matchedEdges,
            entityMap,
            assets: cappedAssets,
            totalAssetCount, // Full count for "see all X assets" link
          };
        }
      }

      // Pre-bake relationship data for RelationshipNetwork
      let relationshipData = null;
      const sameOwnerAssets = [];
      const coLocatedAssets = [];

      // Find same-owner assets (limit to 8 for size reduction)
      if (ownerEntityId) {
        let count = 0;
        for (const [assetId, records] of ASSET_CACHE.assets.entries()) {
          if (assetId === params.id) continue;
          const record = records[0];
          if (record['Owner GEM Entity ID'] === ownerEntityId && count < 8) {
            sameOwnerAssets.push({
              'GEM unit ID': assetId,
              Project: record['Project'] || record['Unit Name'],
              Status: record['Status'],
              Tracker: record['Tracker'],
              'Capacity (MW)': record['Capacity (MW)'],
            });
            count++;
          }
        }
        // Sort by capacity descending
        sameOwnerAssets.sort(
          (a, b) => (Number(b['Capacity (MW)']) || 0) - (Number(a['Capacity (MW)']) || 0)
        );
      }

      // Find co-located assets
      if (locationId) {
        for (const [assetId, records] of ASSET_CACHE.assets.entries()) {
          if (assetId === params.id) continue;
          const record = records[0];
          if (record['GEM location ID'] === locationId) {
            coLocatedAssets.push({
              'GEM unit ID': assetId,
              Project: record['Project'] || record['Unit Name'],
              Status: record['Status'],
              Tracker: record['Tracker'],
              'Capacity (MW)': record['Capacity (MW)'],
            });
          }
        }
      }

      // Parse ownership chain from ownership paths (using consolidated parser)
      const ownershipChain = extractOwnershipChainWithIds(ownershipRecords);

      // Owner stats (skip if truncated portfolio with no asset data)
      let ownerStats = null;
      if (ownerEntityId && ownerExplorerData && ownerExplorerData.assets) {
        const countries = new Set();
        let totalCapacity = 0;
        for (const asset of ownerExplorerData.assets) {
          totalCapacity += asset.capacityMw || 0;
        }
        // Count countries from cache
        for (const [, records] of ASSET_CACHE.assets.entries()) {
          const record = records[0];
          if (record['Owner GEM Entity ID'] === ownerEntityId) {
            const country = record['Parent Headquarters Country'];
            if (country) countries.add(country);
          }
        }
        ownerStats = {
          total_assets: ownerExplorerData.assets.length,
          total_capacity_mw: totalCapacity,
          countries: countries.size,
        };
      }

      relationshipData = {
        sameOwnerAssets,
        coLocatedAssets,
        ownershipChain,
        ownerStats,
        currentAsset: {
          id: params.id,
          name: firstRecord['Project'] || firstRecord['Unit Name'] || params.id,
          Owner: ownerName,
          capacityMw: Number(firstRecord['Capacity (MW)'] || 0),
        },
      };

      // Create minimal owners array (only columns needed for the table display)
      // This reduces page size from ~300KB to ~30KB per page
      const minimalOwners = ownershipRecords.map(minimalOwner);

      return {
        // The asset ID (GEM unit ID)
        assetId: params.id,
        // Asset name from Project column
        assetName: firstRecord['Project'] || firstRecord['Unit Name'] || params.id,
        // MINIMAL ownership records (only columns used in the table)
        owners: minimalOwners,
        // First record for backward compatibility & basic asset info
        asset: firstRecord,
        // Metadata
        tableName,
        columns,
        unitIdCol,
        svgs: { map: null, capacity: null, status: null },
        // Pre-baked data for components
        ownerExplorerData,
        relationshipData,
      };
    }
  }

  // Cache miss - in dev mode, return empty data and let client-side hydration handle it
  // In build mode, this means the asset doesn't exist
  const isDev = process.env.NODE_ENV === 'development' || !ASSET_CACHE.initialized;

  if (isDev) {
    console.log(`  [INFO] Dev mode: letting client-side fetch handle ${params.id}`);
    return {
      assetId: params.id,
      assetName: params.id,
      owners: [],
      asset: {},
      tableName: '',
      columns: [],
      unitIdCol: '',
      svgs: { map: null, capacity: null, status: null },
      ownerExplorerData: null, // Let client fetch via MotherDuck WASM
      relationshipData: null, // Let client fetch via MotherDuck WASM
    };
  }

  // In production build, cache miss means asset doesn't exist
  console.warn(
    `WARNING: Cache miss for ${params.id} - skipping (DB already closed after bulk fetch)`
  );
  throw error(404, `Asset ${params.id} not found in cache`);
}
