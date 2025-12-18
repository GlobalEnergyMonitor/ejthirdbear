/**
 * About Page Server - Load real stats at build time
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../..');

export async function load() {
  const stats = {
    // Default values (will be overwritten with real data if available)
    totalLocations: 0,
    totalCountries: 0,
    totalAssets: 13472,  // From build stats
    totalEntities: 3952, // From build stats
    trackerBreakdown: [],
    buildTime: null,
    version: null,
  };

  // Load GeoJSON stats - check multiple possible locations during build
  let geojson = null;
  try {
    const possiblePaths = [
      path.join(rootDir, 'static/points.geojson'),
      path.join(rootDir, '.svelte-kit/output/client/points.geojson'),
      path.join(rootDir, 'build/points.geojson'),
    ];

    for (const geojsonPath of possiblePaths) {
      if (fs.existsSync(geojsonPath)) {
        geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
        break;
      }
    }

    if (!geojson) {
      throw new Error('GeoJSON not found in any expected location');
    }

    stats.totalLocations = geojson.metadata?.count || geojson.features?.length || 0;

    // Count by tracker and unique countries
    const trackerCounts = {};
    const countries = new Set();

    for (const feature of geojson.features || []) {
      const props = feature.properties || {};
      const tracker = props.tracker || 'Unknown';
      trackerCounts[tracker] = (trackerCounts[tracker] || 0) + 1;

      if (props.country) {
        countries.add(props.country);
      }
    }

    stats.totalCountries = countries.size;
    stats.trackerBreakdown = Object.entries(trackerCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

  } catch (e) {
    // GeoJSON stats are optional during prerender - silently continue with defaults
  }

  // Load version info - check multiple possible locations during build
  try {
    const possiblePaths = [
      path.join(rootDir, 'static/version.json'),
      path.join(rootDir, '.svelte-kit/output/client/version.json'),
      path.join(rootDir, 'build/version.json'),
    ];

    let version = null;
    for (const versionPath of possiblePaths) {
      if (fs.existsSync(versionPath)) {
        version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
        break;
      }
    }

    if (version) {
      stats.version = version.version;
      stats.buildTime = version.buildTime;
    }
  } catch (e) {
    // Version info is optional - silently continue with defaults
  }

  // Load entity cache count if available
  // Cache structure: { tableName: string, entities: { [id]: data } }
  try {
    const entityCachePath = path.join(rootDir, '.svelte-kit/.entity-cache.json');
    if (fs.existsSync(entityCachePath)) {
      const cache = JSON.parse(fs.readFileSync(entityCachePath, 'utf-8'));
      // Handle nested structure
      const entities = cache.entities || cache;
      const count = Object.keys(entities).length;
      if (count > 100) {
        stats.totalEntities = count;
      }
    }
  } catch (e) {
    // Use default
  }

  // Load asset cache count if available
  // Cache structure: { tableName: string, assets: { [id]: data } } or flat { [id]: data }
  try {
    const assetCachePath = path.join(rootDir, '.svelte-kit/.asset-cache.json');
    if (fs.existsSync(assetCachePath)) {
      const cache = JSON.parse(fs.readFileSync(assetCachePath, 'utf-8'));
      // Handle nested structure
      const assets = cache.assets || cache;
      const count = Object.keys(assets).length;
      if (count > 100) {
        stats.totalAssets = count;
      }
    }
  } catch (e) {
    // Use default
  }

  return { stats };
}
