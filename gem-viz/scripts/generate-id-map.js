#!/usr/bin/env node
/**
 * Generate G-prefix to compound ID mapping from parquet data.
 * This allows server-side ID resolution without DuckDB.
 *
 * Run: node scripts/generate-id-map.js
 * Output: src/lib/server/id-map.json
 */

import { createRequire } from 'module';
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function generateIdMap() {
  console.log('[id-map] Generating G-prefix to compound ID mapping...');

  // Try to use duckdb-wasm or fall back to API
  let mapping = {};

  try {
    // Use the ownership API to get all coal plant IDs
    const API_BASE = 'https://gem-ownership-api.fly.dev';

    // Fetch all assets in batches and extract compound IDs
    let offset = 0;
    const limit = 500; // API max is 500
    let total = null;

    console.log('[id-map] Fetching asset IDs from API...');

    while (total === null || offset < total) {
      const url = `${API_BASE}/assets?limit=${limit}&offset=${offset}`;
      console.log(`[id-map] Fetching: ${url}`);
      const response = await fetch(url);
      const data = await response.json();
      console.log(`[id-map] Response keys:`, Object.keys(data));

      if (total === null) {
        total = data.total ?? data.results?.length ?? 0;
        console.log(`[id-map] Total assets: ${total}`);
      }

      for (const asset of data.results || []) {
        const compoundId = asset.asset_id;
        if (compoundId && compoundId.includes('_G')) {
          // Extract G-prefix: L100000103878_G100000100001 -> G100000100001
          const gPrefix = compoundId.split('_')[1];
          if (gPrefix) {
            mapping[gPrefix] = compoundId;
          }
        }
      }

      offset += limit;
      process.stdout.write(`\r[id-map] Processed ${Math.min(offset, total)}/${total} assets`);

      // Safety limit
      if (offset > 50000) {
        console.log('\n[id-map] Hit safety limit at 50k assets');
        break;
      }
    }

    console.log(`\n[id-map] Found ${Object.keys(mapping).length} G-prefix mappings`);
  } catch (err) {
    console.error('[id-map] Failed to fetch from API:', err.message);
    console.log('[id-map] Generating empty mapping (will fall back to client-side)');
  }

  // Write the mapping file
  const outputPath = join(__dirname, '../src/lib/server/id-map.json');
  writeFileSync(outputPath, JSON.stringify(mapping, null, 2));
  console.log(`[id-map] Wrote mapping to ${outputPath}`);

  // Also output stats
  const stats = {
    generated: new Date().toISOString(),
    count: Object.keys(mapping).length,
    sampleEntries: Object.entries(mapping).slice(0, 5),
  };
  console.log('[id-map] Stats:', stats);
}

generateIdMap().catch(console.error);
