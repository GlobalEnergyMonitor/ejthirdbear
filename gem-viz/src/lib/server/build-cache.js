/**
 * In-memory cache singleton for prerendering
 * Parses JSON files ONCE and keeps them in memory for all page renders
 * This avoids re-parsing 100MB+ JSON files 13,000+ times during build
 */

import { readFileSync, existsSync } from 'fs';

const ASSET_CACHE_FILE = '.svelte-kit/asset-cache/assets.json';
const ASSET_IDS_FILE = '.svelte-kit/asset-cache/ids.json';
const ENTITY_CACHE_FILE = '.svelte-kit/entity-cache/entities.json';
const ENTITY_IDS_FILE = '.svelte-kit/entity-cache/ids.json';

// Module-level singletons - parsed once per Node.js process
let assetCache = null;
let assetIds = null;
let entityCache = null;
let entityIds = null;
let assetCacheLoaded = false;
let entityCacheLoaded = false;

function loadAssetCache() {
  if (assetCacheLoaded) return;
  assetCacheLoaded = true;

  const start = Date.now();

  if (existsSync(ASSET_CACHE_FILE)) {
    const raw = readFileSync(ASSET_CACHE_FILE, 'utf-8');
    assetCache = JSON.parse(raw);
    console.log(
      `[BuildCache] Asset cache loaded: ${Object.keys(assetCache).length} items in ${Date.now() - start}ms`
    );
  } else {
    console.warn('[BuildCache] No asset cache found - run npm run prefetch first');
    assetCache = {};
  }

  if (existsSync(ASSET_IDS_FILE)) {
    assetIds = JSON.parse(readFileSync(ASSET_IDS_FILE, 'utf-8'));
  } else {
    assetIds = [];
  }
}

function loadEntityCache() {
  if (entityCacheLoaded) return;
  entityCacheLoaded = true;

  const start = Date.now();

  if (existsSync(ENTITY_CACHE_FILE)) {
    const raw = readFileSync(ENTITY_CACHE_FILE, 'utf-8');
    entityCache = JSON.parse(raw);
    console.log(
      `[BuildCache] Entity cache loaded: ${Object.keys(entityCache).length} items in ${Date.now() - start}ms`
    );
  } else {
    console.warn('[BuildCache] No entity cache found - run npm run prefetch first');
    entityCache = {};
  }

  if (existsSync(ENTITY_IDS_FILE)) {
    entityIds = JSON.parse(readFileSync(ENTITY_IDS_FILE, 'utf-8'));
  } else {
    entityIds = [];
  }
}

// Export functions that lazy-load on first call
export function getAssetCache() {
  loadAssetCache();
  return assetCache;
}

export function getAssetIds() {
  loadAssetCache();
  return assetIds;
}

export function getAsset(id) {
  loadAssetCache();
  return assetCache[id] || null;
}

export function getEntityCache() {
  loadEntityCache();
  return entityCache;
}

export function getEntityIds() {
  loadEntityCache();
  return entityIds;
}

export function getEntity(id) {
  loadEntityCache();
  return entityCache[id] || null;
}
