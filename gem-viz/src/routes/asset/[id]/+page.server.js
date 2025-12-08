import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export const prerender = true;

// Disk cache path (persists across worker processes)
const CACHE_FILE = join(process.cwd(), 'build/.asset-cache.json');

// In-memory cache (loaded from disk)
const ASSET_CACHE = {
  assets: new Map(),
  metadata: null,
  initialized: false
};

// This function tells SvelteKit which asset IDs to prerender at build time
export async function entries() {
  // Use Node DuckDB for build time
  const motherduck = (await import('$lib/motherduck-node')).default;

  try {
    console.log('🚀 BULK FETCH: Loading all assets into memory...');
    const startTime = Date.now();

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

    const columns = schemaResult.data.map(c => c.column_name);
    const countryCol = columns.find(c => c.toLowerCase() === 'country');

    // For ownership tables, we need composite IDs since both owner and unit can have duplicates
    const ownerIdCol = columns.find(c => c.toLowerCase().includes('owner') && c.toLowerCase().includes('id'));
    const unitIdCol = columns.find(c => c.toLowerCase() === 'gem unit id');
    const useCompositeId = ownerIdCol && unitIdCol;

    // Fallback to single column ID if not an ownership table
    const idCol = columns.find(c => c.toLowerCase() === 'gem unit id')
      || columns.find(c => {
        const lower = c.toLowerCase();
        return lower === 'id' || lower === 'wiki page' || lower === 'project id' || lower.includes('_id');
      })
      || columns[0];

    let whereClause = '';
    if (countryCol) {
      whereClause = `WHERE "${countryCol}" = 'United States'`;
    }

    // BULK FETCH: Get ALL asset data in one query (not just IDs!)
    const assetsResult = await motherduck.query(`
      SELECT *
      FROM ${fullTableName}
      ${whereClause}
    `);

    if (!assetsResult.success) {
      console.error('Failed to fetch assets for prerendering:', assetsResult.error);
      return [];
    }

    // Close DB connection immediately - we have all the data we need!
    await motherduck.close();
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Fetched ${assetsResult.data.length} assets in ${fetchTime}s`);
    console.log(`  ✓ DB connection closed (total lifetime: ${fetchTime}s)`);

    // Convert assets to Map for fast lookup
    // For ownership tables, use composite IDs to ensure uniqueness per row
    const assetsMap = {};
    for (const asset of assetsResult.data) {
      let assetId;
      if (useCompositeId) {
        // Create composite ID: owner_unit (e.g., "E100000000014_G100000106283")
        assetId = `${String(asset[ownerIdCol])}_${String(asset[unitIdCol])}`;
      } else {
        assetId = String(asset[idCol]);
      }
      assetsMap[assetId] = asset;
    }

    // Store cache data (metadata + assets)
    const cacheData = {
      tableName: fullTableName,
      columns,
      idCol,
      useCompositeId,
      ownerIdCol,
      unitIdCol,
      assets: assetsMap
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
    console.log(`  ✓ Wrote ${Object.keys(assetsMap).length} assets to disk cache (${cacheSizeMB} MB)`);

    // Limit prerendering to prevent "too many open files" error
    // SvelteKit/Vite can't handle writing 62k+ pages' file I/O simultaneously
    const allAssetIds = Object.keys(assetsMap);
    const MAX_PRERENDER = 5000; // Limit: render top 5000 assets
    const assetsToRender = allAssetIds.slice(0, MAX_PRERENDER);

    const unbuildAssets = assetsToRender.filter(id => {
      const pagePath = join(process.cwd(), 'build', 'asset', id, 'index.html');
      return !existsSync(pagePath);
    });

    const alreadyBuilt = assetsToRender.length - unbuildAssets.length;
    const skippedAssets = allAssetIds.length - assetsToRender.length;

    if (alreadyBuilt > 0) {
      console.log(`  📦 Skipping ${alreadyBuilt} already-built pages`);
    }
    if (skippedAssets > 0) {
      console.log(`  ⏭️  Skipping ${skippedAssets} assets (prerender limit: ${MAX_PRERENDER})`);
    }
    console.log(`  🔨 Building ${unbuildAssets.length} remaining pages out of ${assetsToRender.length} total`);

    // Return array of { id } objects for SvelteKit to prerender
    return unbuildAssets.map(id => ({ id }));
  } catch (err) {
    console.error('Error in entries():', err);
    return [];
  }
}

// Helper to load cache from disk
function loadCacheFromDisk() {
  if (!ASSET_CACHE.initialized && existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      ASSET_CACHE.metadata = {
        tableName: cacheData.tableName,
        columns: cacheData.columns,
        idCol: cacheData.idCol,
        useCompositeId: cacheData.useCompositeId,
        ownerIdCol: cacheData.ownerIdCol,
        unitIdCol: cacheData.unitIdCol
      };
      ASSET_CACHE.assets = new Map(Object.entries(cacheData.assets));
      ASSET_CACHE.initialized = true;
    } catch (err) {
      console.error('Failed to load cache from disk:', err);
    }
  }
}

// Load function runs at build time for prerendered pages
export async function load({ params }) {
  // Only runs at build time because prerender = true

  // Load cache from disk if not already loaded
  loadCacheFromDisk();

  // Try to serve from cache first (fast path)
  if (ASSET_CACHE.initialized) {
    const asset = ASSET_CACHE.assets.get(params.id);

    if (asset) {
      const { tableName, columns } = ASSET_CACHE.metadata;
      return {
        asset,
        tableName,
        columns,
        svgs: { map: null, capacity: null, status: null }
      };
    }
  }

  // Cache miss - asset not in cache
  // This should rarely happen, but when it does, skip the asset instead of querying DB
  console.warn(`⚠️  Cache miss for ${params.id} - skipping (DB already closed after bulk fetch)`);

  // Throw 404 so SvelteKit handleHttpError can skip this page
  throw error(404, `Asset ${params.id} not found in cache`);
}
