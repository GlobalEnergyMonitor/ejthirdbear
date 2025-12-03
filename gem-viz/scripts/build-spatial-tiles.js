#!/usr/bin/env node
/**
 * Build Spatial Tiles
 *
 * Partitions the full GEM dataset into geographic tiles for efficient
 * client-side loading. Only tiles intersecting the user's view are loaded.
 *
 * Output structure:
 *   static/tiles/
 *     manifest.json       - Index of all tiles with bounds/counts
 *     tile_-20_40.parquet - Tile for lat -20 to 0, lon 40 to 60
 *     tile_0_-120.parquet - etc.
 *
 * Usage:
 *   node scripts/build-spatial-tiles.js
 *
 * Requires: MOTHERDUCK_TOKEN in environment or .env
 */

import duckdb from 'duckdb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '../static/tiles');

// Tile size in degrees (20° gives ~180 tiles globally)
const TILE_SIZE = 20;

// Load environment
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const MOTHERDUCK_TOKEN = process.env.PUBLIC_MOTHERDUCK_TOKEN || process.env.MOTHERDUCK_TOKEN;

if (!MOTHERDUCK_TOKEN) {
  console.error('Error: MOTHERDUCK_TOKEN not found in environment');
  console.log('Checked: PUBLIC_MOTHERDUCK_TOKEN, MOTHERDUCK_TOKEN');
  process.exit(1);
}

async function main() {
  console.log('=== Building Spatial Tiles ===\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Connect to DuckDB (in-memory, attach MotherDuck)
  console.log('Connecting to MotherDuck...');
  const db = new duckdb.Database(':memory:');

  // Promisify query
  const query = (sql) => new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });

  // Run query (no return)
  const exec = (sql) => new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Load and connect to MotherDuck
  console.log('Loading MotherDuck extension...');
  await exec(`INSTALL motherduck`);
  await exec(`LOAD motherduck`);
  await exec(`SET motherduck_token='${MOTHERDUCK_TOKEN}'`);
  console.log('Attaching database...');
  await exec(`ATTACH 'md:gem_data' AS gem`);
  await exec(`USE gem`);

  try {
    // Step 1: Get all unique tiles that have data
    console.log('Analyzing data distribution...');
    const tiles = await query(`
      SELECT
        FLOOR(Latitude / ${TILE_SIZE}) * ${TILE_SIZE} as tile_lat,
        FLOOR(Longitude / ${TILE_SIZE}) * ${TILE_SIZE} as tile_lon,
        COUNT(*) as row_count,
        COUNT(DISTINCT "GEM.location.ID") as asset_count,
        MIN(Latitude) as min_lat,
        MAX(Latitude) as max_lat,
        MIN(Longitude) as min_lon,
        MAX(Longitude) as max_lon
      FROM gem.main.asset_locations
      WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
      GROUP BY 1, 2
      ORDER BY row_count DESC
    `);

    console.log(`Found ${tiles.length} tiles with data\n`);

    // Step 2: Build manifest
    const manifest = {
      version: 1,
      generated: new Date().toISOString(),
      tileSize: TILE_SIZE,
      totalAssets: 0,
      totalRows: 0,
      tiles: []
    };

    // Step 3: Export each tile as parquet
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const tileName = `tile_${tile.tile_lat}_${tile.tile_lon}`;
      const tilePath = path.join(OUTPUT_DIR, `${tileName}.parquet`);

      console.log(`[${i + 1}/${tiles.length}] ${tileName}: ${tile.asset_count} assets, ${tile.row_count} rows`);

      // Export tile data with all columns
      const minLat = tile.tile_lat;
      const maxLat = tile.tile_lat + TILE_SIZE;
      const minLon = tile.tile_lon;
      const maxLon = tile.tile_lon + TILE_SIZE;

      await exec(`
        COPY (
          SELECT
            l."GEM.location.ID" as id,
            l."Latitude",
            l."Longitude",
            l."Country.Area" as country,
            l."State.Province" as state,
            l."tracker"
          FROM gem.main.asset_locations l
          WHERE l.Latitude >= ${minLat}
            AND l.Latitude < ${maxLat}
            AND l.Longitude >= ${minLon}
            AND l.Longitude < ${maxLon}
            AND l.Latitude IS NOT NULL
            AND l.Longitude IS NOT NULL
        ) TO '${tilePath}' (FORMAT PARQUET, COMPRESSION ZSTD)
      `);

      // Get actual file size
      const stats = fs.statSync(tilePath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

      // Convert BigInts to Numbers
      const assetCount = Number(tile.asset_count);
      const rowCount = Number(tile.row_count);

      manifest.tiles.push({
        name: tileName,
        file: `${tileName}.parquet`,
        bounds: {
          minLat: tile.min_lat,
          maxLat: tile.max_lat,
          minLon: tile.min_lon,
          maxLon: tile.max_lon
        },
        tileBounds: { minLat, maxLat, minLon, maxLon },
        assetCount,
        rowCount,
        sizeMB: parseFloat(sizeMB)
      });

      manifest.totalAssets += assetCount;
      manifest.totalRows += rowCount;
    }

    // Step 4: Write manifest
    const manifestPath = path.join(OUTPUT_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Summary
    console.log('\n=== Build Complete ===');
    console.log(`Tiles: ${manifest.tiles.length}`);
    console.log(`Total assets: ${manifest.totalAssets.toLocaleString()}`);
    console.log(`Total rows: ${manifest.totalRows.toLocaleString()}`);
    console.log(`Output: ${OUTPUT_DIR}/`);

    // Size summary
    const totalSizeMB = manifest.tiles.reduce((sum, t) => sum + t.sizeMB, 0);
    console.log(`Total size: ${totalSizeMB.toFixed(2)} MB`);
    console.log(`Avg tile: ${(totalSizeMB / manifest.tiles.length).toFixed(2)} MB`);

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
