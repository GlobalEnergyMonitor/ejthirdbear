import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

export const prerender = true;

// Disk cache path
const CACHE_FILE = join(process.cwd(), 'build/.entity-cache.json');

// In-memory cache
const ENTITY_CACHE = {
  entities: new Map(),
  metadata: null,
  initialized: false
};

export async function entries() {
  const motherduck = (await import('$lib/motherduck-node')).default;

  try {
    console.log('🚀 BULK FETCH: Loading all entities into memory...');
    const startTime = Date.now();

    // Get all entities from the master registry (with schema prefix)
    const entitiesResult = await motherduck.query(`
      SELECT *
      FROM global_energy_ownership_tracker_october_2025_v1.all_entities
      ORDER BY full_name
    `);

    if (!entitiesResult.success) {
      console.error('Failed to fetch entities:', entitiesResult.error);
      return [];
    }

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ Fetched ${entitiesResult.data.length} entities in ${fetchTime}s`);

    // Get schema info
    const schemaResult = await motherduck.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'global_energy_ownership_tracker_october_2025_v1'
        AND table_name = 'all_entities'
    `);

    const columns = schemaResult.data.map(c => c.column_name);

    // Build a lookup map of entities by their ID
    const entitiesMap = {};
    for (const entity of entitiesResult.data) {
      const entityId = String(entity['gem entity id']);
      entitiesMap[entityId] = entity;
    }

    // Store cache data
    const cacheData = {
      columns,
      entities: entitiesMap
    };

    // Write to disk
    const cacheJSON = JSON.stringify(cacheData);
    const cacheSizeMB = (cacheJSON.length / 1024 / 1024).toFixed(2);

    const cacheDir = dirname(CACHE_FILE);
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    writeFileSync(CACHE_FILE, cacheJSON);
    console.log(`  ✓ Wrote ${Object.keys(entitiesMap).length} entities to disk cache (${cacheSizeMB} MB)`);

    // Close DB connection immediately
    await motherduck.close();
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  ✓ DB connection closed (total lifetime: ${totalTime}s)`);

    // Filter to only entities with data (no empty stubs)
    const filledEntities = Object.keys(entitiesMap).filter(id => {
      const entity = entitiesMap[id];
      // Consider entity "filled" if it has a full_name or multiple fields populated
      return entity['full_name'] ||
             (Object.values(entity).filter(v => v && v !== '').length > 2);
    });

    // Check which pages already exist for incremental builds
    const unbuildEntities = filledEntities.filter(id => {
      const pagePath = join(process.cwd(), 'build', 'entity', id, 'index.html');
      return !existsSync(pagePath);
    });

    const alreadyBuilt = filledEntities.length - unbuildEntities.length;
    if (alreadyBuilt > 0) {
      console.log(`  📦 Skipping ${alreadyBuilt} already-built pages`);
    }
    console.log(`  🔨 Building ${unbuildEntities.length} entity pages`);

    return unbuildEntities.map(id => ({ id }));
  } catch (err) {
    console.error('Error in entries():', err);
    return [];
  }
}

// Helper to load cache from disk
function loadCacheFromDisk() {
  if (!ENTITY_CACHE.initialized && existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      ENTITY_CACHE.metadata = {
        columns: cacheData.columns
      };
      ENTITY_CACHE.entities = new Map(Object.entries(cacheData.entities));
      ENTITY_CACHE.initialized = true;
    } catch (err) {
      console.error('Failed to load entity cache from disk:', err);
    }
  }
}

export async function load({ params }) {
  loadCacheFromDisk();

  if (ENTITY_CACHE.initialized) {
    const entity = ENTITY_CACHE.entities.get(params.id);

    if (entity) {
      const { columns } = ENTITY_CACHE.metadata;
      return {
        entity,
        columns
      };
    }
  }

  console.warn(`⚠️  Cache miss for entity ${params.id}`);
  throw error(404, `Entity ${params.id} not found`);
}
