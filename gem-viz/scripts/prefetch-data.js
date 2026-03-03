#!/usr/bin/env node
/**
 * Prefetch all asset and entity data in parallel for fast prerendering
 * Optimized for speed with high concurrency and resume capability
 */

import 'dotenv/config';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const API_BASE = process.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-ownership-api.fly.dev';

// Tuned for API rate limits - 100 seems to work well
const BATCH_SIZE = parseInt(process.env.PREFETCH_BATCH_SIZE || '100', 10);
const TIMEOUT_MS = parseInt(process.env.PREFETCH_TIMEOUT || '30000', 10);

const ASSET_CACHE_DIR = '.svelte-kit/asset-cache';
const ENTITY_CACHE_DIR = '.svelte-kit/entity-cache';

// Track progress for resume capability
let successCount = 0;
let failCount = 0;

async function fetchJSON(path, retries = 2) {
  const url = `${API_BASE}${path}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt)); // Faster retry
    }
  }
}

async function listAllAssets() {
  console.log('[Prefetch] Listing all assets...');
  const allIds = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchJSON(`/assets?limit=500&offset=${offset}`);
    data.results.forEach((a) => {
      const id = a.asset_id || a.id;
      if (id) allIds.push(id);
    });
    offset += 500;
    hasMore = data.results.length === 500;
    console.log(`[Prefetch] Assets: ${allIds.length} listed...`);
  }
  return allIds;
}

async function listAllEntities() {
  console.log('[Prefetch] Listing all entities...');
  const allIds = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const data = await fetchJSON(`/entities?limit=500&offset=${offset}`);
    // Entity API returns different field names - check all possibilities
    data.results.forEach((e) => {
      const id = e['Entity ID'] || e['GEM Entity ID'] || e.entity_id || e.id;
      if (id) allIds.push(id);
    });
    offset += 500;
    hasMore = data.results.length === 500;
    console.log(`[Prefetch] Entities: ${allIds.length} listed...`);
  }
  return allIds;
}

async function fetchAssetData(id) {
  try {
    const [asset, graph] = await Promise.all([
      fetchJSON(`/assets/${encodeURIComponent(id)}`),
      fetchJSON(`/ownership/graph?root=${encodeURIComponent(id)}&direction=up&max_depth=12`),
    ]);
    return { id, asset, graph, success: true };
  } catch (err) {
    return { id, asset: null, graph: null, success: false, error: err.message };
  }
}

async function fetchEntityData(id) {
  try {
    const [entity, owners, owned] = await Promise.all([
      fetchJSON(`/entities/${encodeURIComponent(id)}`),
      fetchJSON(`/entities/${encodeURIComponent(id)}/owners`),
      fetchJSON(`/entities/${encodeURIComponent(id)}/owned`),
    ]);
    return { id, entity, owners, owned, success: true };
  } catch (err) {
    return { id, entity: null, owners: null, owned: null, success: false, error: err.message };
  }
}

async function fetchInBatches(ids, fetchFn, label, existingCache = {}, saveCallback = null) {
  const cache = { ...existingCache };
  const idsToFetch = ids.filter((id) => !cache[id]?.success);
  const totalBatches = Math.ceil(idsToFetch.length / BATCH_SIZE);

  if (Object.keys(existingCache).length > 0) {
    console.log(
      `[Prefetch] ${label}: Resuming - ${Object.keys(existingCache).length} already cached, ${idsToFetch.length} remaining`
    );
  }

  const startTime = Date.now();
  let batchSuccess = 0;
  let batchFail = 0;
  const SAVE_EVERY = 10; // Save progress every 10 batches

  for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
    const batch = idsToFetch.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (Object.keys(cache).length / Math.max(1, elapsed)).toFixed(1);
    const eta =
      idsToFetch.length > 0
        ? (
            (idsToFetch.length - Object.keys(cache).length + Object.keys(existingCache).length) /
            Math.max(0.1, parseFloat(rate)) /
            60
          ).toFixed(1)
        : 0;

    process.stdout.write(
      `\r[Prefetch] ${label}: ${batchNum}/${totalBatches} | ${Object.keys(cache).length}/${ids.length} | ${rate}/sec | ETA: ${eta}min | ${batchFail} failed    `
    );

    const results = await Promise.allSettled(batch.map(fetchFn));
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        cache[r.value.id] = r.value;
        if (r.value.success) batchSuccess++;
        else batchFail++;
      } else {
        batchFail++;
      }
    });

    // Incremental save every N batches to avoid losing progress
    if (saveCallback && batchNum % SAVE_EVERY === 0) {
      saveCallback(cache);
    }
  }

  // Final save
  if (saveCallback) saveCallback(cache);

  console.log(
    `\n[Prefetch] ${label}: Complete! ${Object.keys(cache).length} items (${batchFail} failed)`
  );
  successCount += batchSuccess;
  failCount += batchFail;
  return cache;
}

function loadExistingCache(filePath) {
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8');
      if (data.length > 10) {
        // Not an empty/tiny file
        return JSON.parse(data);
      }
    }
  } catch (e) {
    console.log(`[Prefetch] Could not load existing cache: ${e.message}`);
  }
  return {};
}

async function main() {
  const startTime = Date.now();
  const resume = process.argv.includes('--resume');

  console.log(
    `[Prefetch] Starting parallel data prefetch (batch=${BATCH_SIZE}, timeout=${TIMEOUT_MS}ms)...`
  );
  if (resume) console.log('[Prefetch] Resume mode enabled - will skip already-cached items\n');
  else console.log('');

  [ASSET_CACHE_DIR, ENTITY_CACHE_DIR].forEach((dir) => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  });

  // Load existing caches for resume capability
  const existingAssetCache = resume ? loadExistingCache(join(ASSET_CACHE_DIR, 'assets.json')) : {};
  const existingEntityCache = resume
    ? loadExistingCache(join(ENTITY_CACHE_DIR, 'entities.json'))
    : {};

  // Phase 1: List all IDs in parallel
  console.log('=== Phase 1: Listing IDs ===');
  const [assetIds, entityIds] = await Promise.all([listAllAssets(), listAllEntities()]);
  console.log(`\nFound ${assetIds.length} assets and ${entityIds.length} entities\n`);

  // Phase 2: Fetch data SEQUENTIALLY to avoid API rate limits
  // (Running both in parallel = 2x concurrent requests = too many failures)
  console.log('=== Phase 2: Fetching Data ===');

  // Save callbacks for incremental progress saving
  const saveAssetCache = (cache) => {
    writeFileSync(join(ASSET_CACHE_DIR, 'assets.json'), JSON.stringify(cache));
  };
  const saveEntityCache = (cache) => {
    writeFileSync(join(ENTITY_CACHE_DIR, 'entities.json'), JSON.stringify(cache));
  };

  // Run sequentially to avoid overwhelming the API
  const assetCache = await fetchInBatches(
    assetIds,
    fetchAssetData,
    'Assets',
    existingAssetCache,
    saveAssetCache
  );
  const entityCache = await fetchInBatches(
    entityIds,
    fetchEntityData,
    'Entities',
    existingEntityCache,
    saveEntityCache
  );

  // Phase 3: Write caches
  console.log('\n=== Phase 3: Writing Caches ===');
  const assetJson = JSON.stringify(assetCache);
  const entityJson = JSON.stringify(entityCache);

  writeFileSync(join(ASSET_CACHE_DIR, 'assets.json'), assetJson);
  writeFileSync(join(ENTITY_CACHE_DIR, 'entities.json'), entityJson);
  writeFileSync(join(ASSET_CACHE_DIR, 'ids.json'), JSON.stringify(assetIds));
  writeFileSync(join(ENTITY_CACHE_DIR, 'ids.json'), JSON.stringify(entityIds));

  const assetMB = (assetJson.length / 1024 / 1024).toFixed(1);
  const entityMB = (entityJson.length / 1024 / 1024).toFixed(1);
  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  console.log(`[Prefetch] Cache sizes: assets=${assetMB}MB, entities=${entityMB}MB`);
  console.log(
    `[Prefetch] DONE! ${assetIds.length} assets + ${entityIds.length} entities in ${elapsed} min`
  );
  console.log(`[Prefetch] Success: ${successCount}, Failed: ${failCount}`);
}

main().catch((err) => {
  console.error('[Prefetch] Fatal:', err);
  process.exit(1);
});
