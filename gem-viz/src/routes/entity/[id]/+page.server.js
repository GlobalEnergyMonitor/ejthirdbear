import { error } from '@sveltejs/kit';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import {
  listEntities,
  getEntity,
  getEntityGraphDown,
  graphToExplorerData,
} from '$lib/ownership-api';

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
  try {
    console.log('ENTITY FETCH: Loading all entities from Ownership API...');
    const startTime = Date.now();

    // Fetch all entities via pagination
    const allEntities = [];
    const pageSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      console.log(`  Fetching entities (offset: ${offset})...`);
      const response = await listEntities({ limit: pageSize, offset });
      allEntities.push(...response.results);

      offset += pageSize;
      hasMore = response.results.length === pageSize;

      // Log progress
      console.log(`  [OK] Fetched ${allEntities.length} entities so far...`);
    }

    const fetchTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`  [OK] Fetched ${allEntities.length} unique entities in ${fetchTime}s`);

    // Now fetch detailed data for each entity (with graph data)
    console.log('  Fetching detailed entity data with ownership graphs...');
    const detailStartTime = Date.now();
    const entitiesMap = {};

    // Process in batches to avoid overwhelming the API
    const batchSize = 10;
    for (let i = 0; i < allEntities.length; i += batchSize) {
      const batch = allEntities.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (entity) => {
          const entityId = entity['Entity ID'];
          try {
            // Fetch entity details and graph data
            const [entityDetails, graphDown] = await Promise.all([
              getEntity(entityId),
              getEntityGraphDown(entityId),
            ]);

            // Convert graph to explorer data format
            const ownerExplorerData = graphToExplorerData(
              entityId,
              entityDetails.Name,
              graphDown
            );

            // Compute stats from graph data
            const assetNodes = graphDown.nodes.filter((n) => n.type === 'asset');
            const subsidiaryNodes = graphDown.nodes.filter(
              (n) => n.type === 'entity' && n.id !== entityId
            );

            // Build sample assets (first 10)
            const sampleAssets = assetNodes.slice(0, 10).map((asset) => ({
              id: asset.id,
              name: asset.Name,
              status: 'Unknown', // API doesn't provide this yet
              tracker: 'Unknown',
              capacityMw: 0,
            }));

            // Convert ownerExplorerData to portfolioData format for backward compat
            const portfolioData = {
              assets: ownerExplorerData.assets || [],
              subsidiaries: Object.fromEntries(
                ownerExplorerData.subsidiariesMatched.map(([subId, assets]) => {
                  const edge = ownerExplorerData.matchedEdges.find(([id]) => id === subId);
                  const entityInfo = ownerExplorerData.entityMap.find(([id]) => id === subId);
                  return [
                    subId,
                    {
                      name: entityInfo ? entityInfo[1].Name : subId,
                      share: edge ? edge[1].value : 0,
                      assets,
                    },
                  ];
                })
              ),
              directlyOwned: ownerExplorerData.directlyOwned || [],
            };

            entitiesMap[entityId] = {
              id: entityId,
              name: entityDetails.Name,
              fullName: entityDetails['Full Name'] || entityDetails.Name,
              headquartersCountry: entityDetails['Headquarters Country'] || '',
              assetCount: assetNodes.length,
              totalCapacityMw: 0, // API doesn't provide capacity yet
              trackerCount: 0, // Would need tracker data from assets
              trackers: [],
              countryCount: 0, // Would need country data from assets
              sampleAssets,
              // Full portfolio for Owner Explorer (serialized - no Maps)
              portfolioData,
            };
          } catch (err) {
            console.error(`  [ERROR] Failed to fetch entity ${entityId}:`, err.message);
            // Skip entities that fail to fetch
          }
        })
      );

      // Log progress
      const processed = Math.min(i + batchSize, allEntities.length);
      const elapsed = ((Date.now() - detailStartTime) / 1000).toFixed(1);
      console.log(`  [OK] Processed ${processed}/${allEntities.length} entities (${elapsed}s)`);
    }

    const detailFetchTime = ((Date.now() - detailStartTime) / 1000).toFixed(2);
    console.log(
      `  [OK] Fetched detailed data for ${Object.keys(entitiesMap).length} entities in ${detailFetchTime}s`
    );

    // Write to disk cache
    const cacheData = {
      apiSource: 'ownership-api',
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
          apiSource: cacheData.apiSource,
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
      ownerExplorerData: null, // Let client fetch via API
    };
  }

  console.warn(`WARNING: Entity cache miss for ${params.id}`);
  throw error(404, `Entity ${params.id} not found`);
}
