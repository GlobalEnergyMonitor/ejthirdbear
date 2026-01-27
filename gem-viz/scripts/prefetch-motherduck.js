#!/usr/bin/env node
/**
 * FAST prefetch: Query MotherDuck directly instead of 180k API calls
 * ~10 seconds vs ~2 hours
 */

import 'dotenv/config';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import duckdb from 'duckdb';

const ASSET_CACHE_DIR = '.svelte-kit/asset-cache';
const ENTITY_CACHE_DIR = '.svelte-kit/entity-cache';

function initDB() {
  return new Promise((resolve, reject) => {
    const db = new duckdb.Database(':memory:', (err) => {
      if (err) return reject(err);

      const token = process.env.PUBLIC_MOTHERDUCK_TOKEN;
      if (!token) return reject(new Error('PUBLIC_MOTHERDUCK_TOKEN not set'));

      db.exec(`
        INSTALL motherduck;
        LOAD motherduck;
        SET motherduck_token='${token}';
        ATTACH 'md:gem_data' AS gem;
      `, (err) => {
        if (err) return reject(err);
        console.log('[OK] Connected to MotherDuck');
        resolve(db);
      });
    });
  });
}

function query(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

async function main() {
  const startTime = Date.now();
  console.log('[Prefetch] Starting MotherDuck bulk export...\n');

  // Ensure cache dirs exist
  [ASSET_CACHE_DIR, ENTITY_CACHE_DIR].forEach(dir => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });

  const db = await initDB();

  const SCHEMA = 'gem.global_energy_ownership_tracker_october_2025_v1';

  // 1. Fetch all asset ownership (immediate owners only - graph built client-side)
  console.log('[Prefetch] Fetching asset_ownership...');
  const assetOwnership = await query(db, `
    SELECT
      "Asset ID" as asset_id,
      "Asset Name" as asset_name,
      "Asset Type" as asset_type,
      "Asset Unit ID" as unit_id,
      "Immediate Owner Entity ID" as owner_id,
      "Immediate Owner Entity Name" as owner_name,
      "% Share of Ownership" as share
    FROM ${SCHEMA}.asset_ownership
  `);
  console.log(`   → ${assetOwnership.length.toLocaleString()} asset ownership records`);

  // 2. Fetch all entity ownership (for building ownership graphs)
  console.log('[Prefetch] Fetching entity_ownership...');
  const entityOwnership = await query(db, `
    SELECT
      "Subject Entity ID" as entity_id,
      "Subject Entity Name" as entity_name,
      "Interested Party ID" as parent_id,
      "Interested Party Name" as parent_name,
      "% Share of Ownership" as share
    FROM ${SCHEMA}.entity_ownership
  `);
  console.log(`   → ${entityOwnership.length.toLocaleString()} entity ownership records`);

  // 3. Fetch all entities
  console.log('[Prefetch] Fetching all_entities...');
  const allEntities = await query(db, `
    SELECT
      "Entity ID" as id,
      "Full Name" as full_name,
      "Name" as name,
      "Entity Type" as entity_type,
      "Legal Entity Type" as legal_type,
      "PubliclyListed" as publicly_listed,
      "Home Page" as homepage,
      "Registration Country" as reg_country,
      "Headquarters Country" as hq_country
    FROM ${SCHEMA}.all_entities
  `);
  console.log(`   → ${allEntities.length.toLocaleString()} entities`);

  // Build lookup structures
  console.log('\n[Prefetch] Building caches...');

  // Asset cache: keyed by asset_id, includes ownership chain
  const assetCache = {};
  const assetIds = [...new Set(assetOwnership.map(a => a.asset_id))];

  // Group asset ownership by asset_id
  const assetOwnershipByAsset = {};
  assetOwnership.forEach(row => {
    if (!assetOwnershipByAsset[row.asset_id]) {
      assetOwnershipByAsset[row.asset_id] = [];
    }
    assetOwnershipByAsset[row.asset_id].push(row);
  });

  // Entity ownership lookup for graph building
  const entityParents = {};
  entityOwnership.forEach(row => {
    if (!entityParents[row.entity_id]) {
      entityParents[row.entity_id] = [];
    }
    entityParents[row.entity_id].push({
      id: row.parent_id,
      name: row.parent_name,
      share: row.share
    });
  });

  // Entity details lookup
  const entityDetails = {};
  allEntities.forEach(e => {
    entityDetails[e.id] = e;
  });

  // Build ownership graph for each asset (up to depth 12)
  function buildOwnershipGraph(assetId, maxDepth = 12) {
    const owners = assetOwnershipByAsset[assetId] || [];
    if (owners.length === 0) return { nodes: [], edges: [] };

    const nodes = [];
    const edges = [];
    const visited = new Set();

    // Add asset as root node
    const firstOwner = owners[0];
    nodes.push({
      id: assetId,
      name: firstOwner?.asset_name || assetId,
      type: 'asset',
      assetType: firstOwner?.asset_type
    });

    // BFS to build ownership tree
    let queue = owners.map(o => ({
      entityId: o.owner_id,
      entityName: o.owner_name,
      fromId: assetId,
      share: o.share,
      depth: 1
    }));

    while (queue.length > 0) {
      const { entityId, entityName, fromId, share, depth } = queue.shift();
      if (!entityId || visited.has(entityId) || depth > maxDepth) continue;
      visited.add(entityId);

      // Add entity node
      const details = entityDetails[entityId] || {};
      nodes.push({
        id: entityId,
        name: entityName || details.name || entityId,
        type: 'entity',
        entityType: details.entity_type,
        country: details.hq_country || details.reg_country
      });

      // Add edge
      edges.push({
        source: fromId,
        target: entityId,
        share: share
      });

      // Queue parent entities
      const parents = entityParents[entityId] || [];
      parents.forEach(p => {
        queue.push({
          entityId: p.id,
          entityName: p.name,
          fromId: entityId,
          share: p.share,
          depth: depth + 1
        });
      });
    }

    return { nodes, edges };
  }

  // Build asset cache with graphs
  console.log('[Prefetch] Building asset ownership graphs...');
  assetIds.forEach((assetId, i) => {
    if (i % 5000 === 0) process.stdout.write(`\r   → ${i.toLocaleString()}/${assetIds.length.toLocaleString()} assets processed`);

    const owners = assetOwnershipByAsset[assetId] || [];
    const graph = buildOwnershipGraph(assetId, 12);

    assetCache[assetId] = {
      id: assetId,
      asset: {
        id: assetId,
        name: owners[0]?.asset_name,
        type: owners[0]?.asset_type,
        owners: owners.map(o => ({
          entity_id: o.owner_id,
          entity_name: o.owner_name,
          share: o.share
        }))
      },
      graph: graph,
      success: true
    };
  });
  console.log(`\r   → ${assetIds.length.toLocaleString()}/${assetIds.length.toLocaleString()} assets processed`);

  // Build entity cache
  console.log('[Prefetch] Building entity cache...');
  const entityCache = {};
  const entityIds = Object.keys(entityDetails);

  entityIds.forEach(entityId => {
    const entity = entityDetails[entityId];
    const parents = entityParents[entityId] || [];

    // Find assets owned by this entity
    const ownedAssets = assetOwnership
      .filter(a => a.owner_id === entityId)
      .map(a => ({
        asset_id: a.asset_id,
        asset_name: a.asset_name,
        asset_type: a.asset_type,
        share: a.share
      }));

    entityCache[entityId] = {
      id: entityId,
      entity: entity,
      owners: parents,
      owned: ownedAssets,
      success: true
    };
  });

  // Write caches
  console.log('\n[Prefetch] Writing cache files...');

  const assetJson = JSON.stringify(assetCache);
  const entityJson = JSON.stringify(entityCache);

  writeFileSync(join(ASSET_CACHE_DIR, 'assets.json'), assetJson);
  writeFileSync(join(ENTITY_CACHE_DIR, 'entities.json'), entityJson);
  writeFileSync(join(ASSET_CACHE_DIR, 'ids.json'), JSON.stringify(assetIds));
  writeFileSync(join(ENTITY_CACHE_DIR, 'ids.json'), JSON.stringify(entityIds));

  const assetMB = (assetJson.length / 1024 / 1024).toFixed(1);
  const entityMB = (entityJson.length / 1024 / 1024).toFixed(1);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n[Prefetch] COMPLETE in ${elapsed} seconds!`);
  console.log(`   Assets: ${assetIds.length.toLocaleString()} (${assetMB} MB)`);
  console.log(`   Entities: ${entityIds.length.toLocaleString()} (${entityMB} MB)`);

  process.exit(0);
}

main().catch(err => {
  console.error('[Prefetch] Fatal:', err);
  process.exit(1);
});
