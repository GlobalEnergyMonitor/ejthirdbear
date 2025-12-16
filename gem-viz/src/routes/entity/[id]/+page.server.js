import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Only prerender in production builds - dev mode uses client-side fetching
export const prerender = process.env.NODE_ENV !== 'development';

// Disk cache path (persists across worker processes)
const CACHE_FILE = join(process.cwd(), '.svelte-kit/.entity-cache.json');

// In-memory cache (loaded from disk)
const ENTITY_CACHE = {
  entities: new Map(),
  metadata: null,
  initialized: false,
};

// This function tells SvelteKit which entity IDs to prerender at build time
export async function entries() {
  // Use Node DuckDB for build time
  const motherduck = (await import('$lib/motherduck-node')).default;

  try {
    console.log('ENTITY FETCH: Loading all entities into memory...');
    const startTime = Date.now();

    // Query the catalog to find the ownership table
    const catalogResult = await motherduck.query(`
      SELECT schema_name, table_name, row_count
      FROM catalog
      WHERE LOWER(table_name) NOT IN ('about', 'metadata', 'readme')
        AND row_count > 100
      ORDER BY row_count DESC
      LIMIT 1
    `);

    if (!catalogResult.success || catalogResult.data.length === 0) {
      console.warn('No tables found for entity prerendering');
      return [];
    }

    const { schema_name, table_name } = catalogResult.data[0];
    const fullTableName = `${schema_name}.${table_name}`;
    console.log(`  Table: ${fullTableName}`);

    // Get all unique entity IDs with their aggregated data + sample assets
    // Column names: "Owner GEM Entity ID", "Parent", "Parent Headquarters Country"
    const entitiesResult = await motherduck.query(`
      WITH entity_assets AS (
        SELECT
          "Owner GEM Entity ID" as entity_id,
          "GEM Unit ID" as unit_id,
          "Project" as unit_name,
          "Status" as status,
          "Tracker" as tracker,
          CAST("Capacity (MW)" AS DOUBLE) as capacity_mw,
          ROW_NUMBER() OVER (PARTITION BY "Owner GEM Entity ID" ORDER BY "Capacity (MW)" DESC NULLS LAST) as rn
        FROM ${fullTableName}
        WHERE "Owner GEM Entity ID" IS NOT NULL
          AND "Owner GEM Entity ID" != ''
      )
      SELECT
        "Owner GEM Entity ID" as entity_id,
        "Parent" as name,
        COUNT(*) as asset_count,
        SUM(CAST("Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
        COUNT(DISTINCT "Tracker") as tracker_count,
        ARRAY_AGG(DISTINCT "Tracker") as trackers,
        COUNT(DISTINCT "Parent Headquarters Country") as country_count,
        (SELECT ARRAY_AGG(STRUCT_PACK(id := unit_id, name := unit_name, status := status, tracker := tracker, capacityMw := capacity_mw))
         FROM entity_assets ea WHERE ea.entity_id = main."Owner GEM Entity ID" AND ea.rn <= 10) as sample_assets
      FROM ${fullTableName} main
      WHERE "Owner GEM Entity ID" IS NOT NULL
        AND "Owner GEM Entity ID" != ''
      GROUP BY "Owner GEM Entity ID", "Parent"
      ORDER BY asset_count DESC
    `);

    // Also fetch ALL assets with subsidiary info for Owner Explorer
    console.log('  Fetching full asset data for Owner Explorer...');
    const allAssetsResult = await motherduck.query(`
      SELECT
        "GEM Unit ID" AS asset_id,
        "Project" AS name,
        "Tracker" AS tracker,
        "Status" AS status,
        "GEM location ID" AS location_id,
        CAST("Capacity (MW)" AS DOUBLE) AS capacity_mw,
        CAST("Share" AS DOUBLE) AS share,
        "Immediate Project Owner" AS immediate_owner,
        "Immediate Project Owner GEM Entity ID" AS immediate_owner_id,
        "Owner GEM Entity ID" AS parent_entity_id
      FROM ${fullTableName}
      WHERE "Owner GEM Entity ID" IS NOT NULL
        AND "Owner GEM Entity ID" != ''
    `);

    // Build a map of entity_id -> full assets list with subsidiary groupings
    const entityPortfolios = {};
    if (allAssetsResult.success && allAssetsResult.data) {
      for (const row of allAssetsResult.data) {
        const entityId = row.parent_entity_id;
        if (!entityId) continue;

        if (!entityPortfolios[entityId]) {
          entityPortfolios[entityId] = {
            assets: [],
            subsidiaries: {}, // immediate_owner_id -> { name, assets[], share }
            directlyOwned: [],
          };
        }

        const asset = {
          id: row.asset_id,
          name: row.name || row.asset_id,
          tracker: row.tracker,
          status: row.status,
          locationId: row.location_id,
          capacityMw: Number(row.capacity_mw || 0),
        };

        entityPortfolios[entityId].assets.push(asset);

        // Group by immediate owner (subsidiary) vs directly owned
        if (row.immediate_owner_id && row.immediate_owner_id !== entityId) {
          const subId = row.immediate_owner_id;
          if (!entityPortfolios[entityId].subsidiaries[subId]) {
            entityPortfolios[entityId].subsidiaries[subId] = {
              name: row.immediate_owner || subId,
              share: Number(row.share || 0),
              assets: [],
            };
          }
          entityPortfolios[entityId].subsidiaries[subId].assets.push(asset);
        } else {
          entityPortfolios[entityId].directlyOwned.push(asset);
        }
      }
    }
    console.log(`  [OK] Built portfolios for ${Object.keys(entityPortfolios).length} entities`);

    if (!entitiesResult.success) {
      console.error('Failed to fetch entities for prerendering:', entitiesResult.error);
      return [];
    }

    // Close DB connection
    await motherduck.close();
    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  [OK] Fetched ${entitiesResult.data.length} unique entities in ${fetchTime}s`);

    // Build entities map - convert BigInts to Numbers for JSON serialization
    const entitiesMap = {};
    for (const row of entitiesResult.data) {
      const entityId = String(row.entity_id);
      // Process sample assets - convert any BigInts
      const sampleAssets = (row.sample_assets || []).map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        tracker: a.tracker,
        capacityMw: Number(a.capacityMw || 0),
      }));

      // Get pre-built portfolio data for Owner Explorer
      const portfolioData = entityPortfolios[entityId] || {
        assets: [],
        subsidiaries: {},
        directlyOwned: [],
      };

      entitiesMap[entityId] = {
        id: entityId,
        name: row.name,
        assetCount: Number(row.asset_count),
        totalCapacityMw: Number(row.total_capacity_mw || 0),
        trackerCount: Number(row.tracker_count),
        trackers: row.trackers,
        countryCount: Number(row.country_count),
        sampleAssets,
        // Full portfolio for Owner Explorer (serialized - no Maps)
        portfolioData: {
          assets: portfolioData.assets,
          subsidiaries: portfolioData.subsidiaries, // { subId: { name, share, assets[] } }
          directlyOwned: portfolioData.directlyOwned,
        },
      };
    }

    // Write to disk cache
    const cacheData = {
      tableName: fullTableName,
      entities: entitiesMap,
    };

    const cacheJSON = JSON.stringify(cacheData);
    const cacheSizeMB = (cacheJSON.length / 1024 / 1024).toFixed(2);

    const cacheDir = dirname(CACHE_FILE);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    writeFileSync(CACHE_FILE, cacheJSON);

    const uniqueEntities = Object.keys(entitiesMap).length;
    console.log(`  [OK] Wrote entity cache to disk (${cacheSizeMB} MB)`);
    console.log(
      `  Entity IDs to build: ${Object.keys(entitiesMap).slice(0, 3).join(', ')}... (${uniqueEntities} total)`
    );

    // Return array of { id } objects for SvelteKit to prerender
    return Object.keys(entitiesMap).map((id) => ({ id }));
  } catch (err) {
    console.error('Error in entity entries():', err);
    return [];
  }
}

// Helper to load cache from disk
function loadCacheFromDisk() {
  if (!ENTITY_CACHE.initialized) {
    if (existsSync(CACHE_FILE)) {
      try {
        const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
        ENTITY_CACHE.metadata = {
          tableName: cacheData.tableName,
        };
        ENTITY_CACHE.entities = new Map(Object.entries(cacheData.entities));
        ENTITY_CACHE.initialized = true;
        console.log(
          `  [OK] Loaded entity cache: ${ENTITY_CACHE.entities.size} entities from ${CACHE_FILE}`
        );
      } catch (err) {
        console.error(`  [ERROR] Failed to load entity cache from ${CACHE_FILE}:`, err.message);
      }
    }
  }
}

// Load function runs at build time for prerendered pages
export async function load({ params }) {
  loadCacheFromDisk();

  if (ENTITY_CACHE.initialized) {
    const entity = ENTITY_CACHE.entities.get(params.id);

    if (entity) {
      // Build full portfolio in the format OwnershipExplorerD3 expects
      // Convert from serialized format to the structure the component needs
      const portfolioData = entity.portfolioData || {
        assets: [],
        subsidiaries: {},
        directlyOwned: [],
      };

      // Convert subsidiaries object to the format the component expects
      // subsidiariesMatched: array of [subId, assets[]]
      // matchedEdges: array of [subId, { value: share }]
      // entityMap: array of [subId, { id, Name, type }]
      const subsidiariesMatched = Object.entries(portfolioData.subsidiaries).map(
        ([subId, data]) => [subId, data.assets]
      );
      const matchedEdges = Object.entries(portfolioData.subsidiaries).map(([subId, data]) => [
        subId,
        { value: data.share },
      ]);
      const entityMap = Object.entries(portfolioData.subsidiaries).map(([subId, data]) => [
        subId,
        { id: subId, Name: data.name, type: 'entity' },
      ]);

      return {
        entityId: params.id,
        entityName: entity.name || params.id,
        entity,
        // For backward compat with existing page
        stats: {
          total_assets: entity.assetCount,
          total_capacity_mw: entity.totalCapacityMw,
          countries: entity.countryCount,
        },
        portfolio: {
          spotlightOwner: { id: params.id, Name: entity.name },
          assets: portfolioData.assets || [],
        },
        // Full portfolio for Owner Explorer (serialized as arrays, not Maps)
        ownerExplorerData: {
          spotlightOwner: { id: params.id, Name: entity.name },
          subsidiariesMatched, // Array of [subId, assets[]]
          directlyOwned: portfolioData.directlyOwned,
          matchedEdges, // Array of [subId, { value }]
          entityMap, // Array of [subId, { id, Name, type }]
          assets: portfolioData.assets,
        },
      };
    }
  }

  // Dev mode - let client handle it
  const isDev = process.env.NODE_ENV === 'development' || !ENTITY_CACHE.initialized;

  if (isDev) {
    console.log(`  [INFO] Dev mode: letting client-side fetch handle entity ${params.id}`);
    return {
      entityId: params.id,
      entityName: params.id,
      entity: null,
      stats: null,
      portfolio: null,
      ownerExplorerData: null, // Let client fetch via MotherDuck WASM
    };
  }

  console.warn(`WARNING: Entity cache miss for ${params.id}`);
  throw error(404, `Entity ${params.id} not found`);
}
