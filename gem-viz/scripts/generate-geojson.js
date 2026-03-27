#!/usr/bin/env node

/**
 * Generate static GeoJSON from REST API for client-side map rendering.
 * Paginates through all asset types and builds a points.geojson file.
 *
 * If static/points.geojson already exists and is less than 7 days old,
 * skips regeneration (use --force to override).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.join(__dirname, '../static/points.geojson');

const API_BASE =
  process.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  process.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

const FORCE = process.argv.includes('--force');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Asset type slugs to paginate
const ASSET_SLUGS = [
  'coal-plant',
  'oil-gas-plant',
  'bioenergy-plant',
  'gas-pipeline',
  'cement-plant',
  'oil-pipeline',
  'iron-steel-plant',
  'iron-ore-mine',
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function generateGeoJSON() {
  // Skip if file is fresh
  if (!FORCE && fs.existsSync(outputPath)) {
    const stat = fs.statSync(outputPath);
    const age = Date.now() - stat.mtimeMs;
    if (age < MAX_AGE_MS) {
      const days = (age / (24 * 60 * 60 * 1000)).toFixed(1);
      console.log(`[SKIP] points.geojson is ${days} days old (max 7). Use --force to regenerate.`);
      return;
    }
  }

  console.log(`\nGenerating GeoJSON from REST API (${API_BASE})...\n`);

  const features = [];
  const seen = new Set();

  for (const slug of ASSET_SLUGS) {
    let offset = 0;
    const limit = 500;
    let pageCount = 0;

    while (true) {
      const url = `${API_BASE}/assets?asset_type=${slug}&format=json&limit=${limit}&offset=${offset}`;
      let data;
      try {
        data = await fetchJSON(url);
      } catch (err) {
        console.warn(`  [WARN] Failed to fetch ${slug} offset=${offset}: ${err.message}`);
        break;
      }

      const results = data.results || data;
      if (!Array.isArray(results) || results.length === 0) break;

      for (const asset of results) {
        const lat = parseFloat(asset.latitude);
        const lon = parseFloat(asset.longitude);
        const hasCoords = !isNaN(lat) && !isNaN(lon);

        const id = asset.asset_id || asset.id || asset.gem_id || `${slug}_${offset}`;
        if (seen.has(id)) continue;
        seen.add(id);

        features.push({
          type: 'Feature',
          id,
          properties: {
            id,
            'GEM location ID': id,
            lat: hasCoords ? lat : null,
            lon: hasCoords ? lon : null,
            country: asset.country || null,
            state: asset.state || asset.subnational_unit || null,
            tracker: asset.asset_type || slug,
          },
          geometry: hasCoords
            ? { type: 'Point', coordinates: [lon, lat] }
            : null,
        });
      }

      pageCount++;
      offset += limit;

      if (results.length < limit) break;
    }

    console.log(`  [OK] ${slug}: ${pageCount} pages fetched`);
  }

  const geojson = {
    type: 'FeatureCollection',
    metadata: {
      source: 'REST API',
      generated: new Date().toISOString(),
      count: features.length,
    },
    features,
  };

  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  const stats = fs.statSync(outputPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

  console.log('\nGeoJSON Statistics:');
  console.log(`   File: static/points.geojson`);
  console.log(`   Size: ${sizeMB} MB (uncompressed)`);
  console.log(`   Features: ${features.length.toLocaleString()}`);
  console.log('\nGeoJSON generation complete!\n');
}

generateGeoJSON().catch((err) => {
  console.error('ERROR: GeoJSON generation failed:', err);
  // Don't exit with error if file already exists — build can continue
  if (fs.existsSync(outputPath)) {
    console.log('[WARN] Using existing points.geojson despite generation failure');
  } else {
    process.exit(1);
  }
});
