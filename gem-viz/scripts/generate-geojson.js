#!/usr/bin/env node

/**
 * Generate static GeoJSON from MotherDuck for client-side map rendering
 * No WASM required in browser - just fetch and render!
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import duckdb from 'duckdb';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(__dirname, '../static');
const assetLocationsPath = path.join(__dirname, '../public/asset_locations.parquet');

const { Database } = duckdb;
let db = null;

async function initDB() {
  return new Promise((resolve, reject) => {
    db = new Database(':memory:', (err) => {
      if (err) {
        reject(err);
        return;
      }
      const token = process.env.PUBLIC_MOTHERDUCK_TOKEN;
      db.exec(`
        INSTALL motherduck;
        LOAD motherduck;
        SET motherduck_token='${token}';
        ATTACH 'md:gem_data' AS gem;
        USE gem;
      `, (err) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('[OK] Connected to MotherDuck (Node.js)');
        resolve(db);
      });
    });
  });
}

async function query(sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ success: true, data: rows });
    });
  });
}

async function generateGeoJSON() {
  console.log('\nGenerating GeoJSON from MotherDuck...\n');

  try {
    // Fast path: build from local asset_locations.parquet if available
    if (fs.existsSync(assetLocationsPath)) {
      console.log('📂 Using local asset_locations.parquet');
      db = new Database(':memory:');

      const parquetEscaped = assetLocationsPath.replace(/'/g, "''");
      const { success, data, error: queryError } = await query(`
        SELECT DISTINCT
          "GEM.location.ID" AS location_id,
          Latitude AS lat,
          Longitude AS lon,
          "Country.Area" AS country,
          "State.Province" AS state,
          tracker
        FROM read_parquet('${parquetEscaped}')
        WHERE Latitude IS NOT NULL AND Longitude IS NOT NULL
      `);

      if (!success) {
        throw new Error(`Failed to load asset_locations.parquet: ${queryError}`);
      }

      console.log(`[OK] Loaded ${data.length.toLocaleString()} point rows from local parquet\n`);

      const features = data.map((row) => ({
        type: 'Feature',
        id: row.location_id,
        properties: {
          id: row.location_id,
          'GEM location ID': row.location_id,
          lat: row.lat,
          lon: row.lon,
          country: row.country,
          state: row.state,
          tracker: row.tracker,
        },
        geometry: {
          type: 'Point',
          coordinates: [row.lon, row.lat],
        },
      }));

      const geojson = {
        type: 'FeatureCollection',
        metadata: {
          source: 'asset_locations.parquet',
          generated: new Date().toISOString(),
          count: features.length,
          columns: {
            locationId: 'GEM location ID',
            lat: 'Latitude',
            lon: 'Longitude',
            country: 'Country.Area',
            state: 'State.Province',
            tracker: 'tracker',
          },
        },
        features,
      };

      const outputPath = path.join(outputDir, 'points.geojson');
      fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
      const stats = fs.statSync(outputPath);
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
      console.log('GeoJSON Statistics:');
      console.log(`   File: static/points.geojson`);
      console.log(`   Size: ${sizeMB} MB (uncompressed)`);
      console.log(`   Features: ${geojson.features.length.toLocaleString()}`);
      console.log(`   Estimated gzip size: ~${(sizeMB / 5).toFixed(2)} MB`);
      console.log('\nGeoJSON generation complete!\n');
      return;
    }

    await initDB();

    // Get all data tables and check for lat/lon columns
    const catalogResult = await query(`
      SELECT schema_name, table_name, row_count
      FROM catalog
      WHERE LOWER(table_name) NOT IN ('about', 'metadata', 'readme', 'catalog')
        AND row_count > 100
      ORDER BY row_count DESC
    `);

    if (!catalogResult.success || catalogResult.data.length === 0) {
      throw new Error('No data tables found in catalog');
    }

    console.log(`Searching ${catalogResult.data.length} tables for geographic coordinates...\n`);

    let schema_name, table_name, row_count, columns, latCol, lonCol;

    // Find first table with lat/lon
    for (const table of catalogResult.data) {
      const schemaResult = await query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = '${table.schema_name}'
          AND table_name = '${table.table_name}'
      `);

      const cols = schemaResult.data.map(c => c.column_name);
      const lat = cols.find(c => c.toLowerCase().includes('lat'));
      const lon = cols.find(c => c.toLowerCase().includes('lon'));

      if (lat && lon) {
        schema_name = table.schema_name;
        table_name = table.table_name;
        row_count = table.row_count;
        columns = cols;
        latCol = lat;
        lonCol = lon;
        break;
      } else {
        console.log(`  [SKIP] ${table.schema_name}.${table.table_name} - no coordinates`);
      }
    }

    if (!latCol || !lonCol) {
      throw new Error('No tables with latitude/longitude columns found');
    }

    const fullTableName = `${schema_name}.${table_name}`;
    console.log(`\n[OK] Found table with coordinates: ${fullTableName}`);
    console.log(`Total rows: ${row_count.toLocaleString()}\n`);

    // Find ID column
    const idCol = columns.find(c => {
      const lower = c.toLowerCase();
      return lower === 'id' || lower === 'wiki page' || lower === 'project id' || lower.includes('_id');
    }) || columns[0];

    // Find name column
    const nameCol = columns.find(c => {
      const lower = c.toLowerCase();
      return lower === 'mine' || lower === 'plant' || lower === 'project' || lower === 'facility' ||
             lower === 'mine name' || lower === 'plant name' || lower === 'project name';
    });

    // Find other columns
    const statusCol = columns.find(c => c.toLowerCase() === 'status');
    const countryCol = columns.find(c => c.toLowerCase() === 'country');

    console.log(`Detected columns:`);
    console.log(`   ID: ${idCol}`);
    console.log(`   Name: ${nameCol || 'N/A'}`);
    console.log(`   Lat: ${latCol}`);
    console.log(`   Lon: ${lonCol}`);
    console.log(`   Status: ${statusCol || 'N/A'}`);
    console.log(`   Country: ${countryCol || 'N/A'}\n`);

    // Query all points with metadata
    const selectCols = [idCol, latCol, lonCol];
    if (nameCol) selectCols.push(nameCol);
    if (statusCol) selectCols.push(statusCol);
    if (countryCol) selectCols.push(countryCol);

    const pointsResult = await query(`
      SELECT ${selectCols.map(c => `"${c}"`).join(', ')}
      FROM ${fullTableName}
      WHERE "${latCol}" IS NOT NULL
        AND "${lonCol}" IS NOT NULL
    `);

    if (!pointsResult.success) {
      throw new Error(`Query failed: ${pointsResult.error}`);
    }

    console.log(`[OK] Loaded ${pointsResult.data.length.toLocaleString()} points\n`);

    // Convert to GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      metadata: {
        table: fullTableName,
        generated: new Date().toISOString(),
        count: pointsResult.data.length,
        columns: {
          id: idCol,
          name: nameCol,
          lat: latCol,
          lon: lonCol,
          status: statusCol,
          country: countryCol
        }
      },
      features: pointsResult.data.map(row => ({
        type: 'Feature',
        id: row[idCol],
        properties: {
          id: row[idCol],
          name: nameCol ? row[nameCol] : null,
          status: statusCol ? row[statusCol] : null,
          country: countryCol ? row[countryCol] : null,
          lat: row[latCol],
          lon: row[lonCol]
        },
        geometry: {
          type: 'Point',
          coordinates: [row[lonCol], row[latCol]]
        }
      }))
    };

    // Write GeoJSON to static directory
    const outputPath = path.join(outputDir, 'points.geojson');
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

    const stats = fs.statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

    console.log('GeoJSON Statistics:');
    console.log(`   File: static/points.geojson`);
    console.log(`   Size: ${sizeMB} MB (uncompressed)`);
    console.log(`   Features: ${geojson.features.length.toLocaleString()}`);
    console.log(`   Estimated gzip size: ~${(sizeMB / 5).toFixed(2)} MB`);
    console.log('\nGeoJSON generation complete!\n');

  } catch (error) {
    console.error('\nERROR: GeoJSON generation failed:', error);
    process.exit(1);
  }
}

generateGeoJSON();
