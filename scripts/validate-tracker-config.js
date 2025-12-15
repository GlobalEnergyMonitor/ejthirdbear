#!/usr/bin/env node

/**
 * Validation Script: Verify tracker-config.ts against actual parquet data
 *
 * Checks:
 * 1. All field names in tracker configs actually exist in data
 * 2. Status mappings cover all actual status values
 * 3. Sample records can be parsed with the config
 * 4. Location coordinates are reasonable
 * 5. Capacity fields contain numbers
 */

import duckdb from 'duckdb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Define tracker configs (copied from tracker-config.ts for validation)
const trackerConfigs = {
  'Coal Plant': {
    idField: 'GEM unit ID',
    nameFields: ['Plant name', 'Unit name'],
    statusField: 'Status',
    capacityField: 'Capacity (MW)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit (province, state)',
    },
    statusMap: {
      'operating': 'operating',
      'operating pre-retirement': 'operating',
      'construction': 'proposed',
      'permitted': 'proposed',
      'pre-permit': 'proposed',
      'pre-construction': 'proposed',
      'announced': 'proposed',
      'proposed': 'proposed',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'shelved': 'retired',
      'mothballed': 'retired',
      'cancelled - inferred 4 y': 'cancelled',
      'shelved - inferred 2 y': 'retired',
    },
  },
  'Gas Plant': {
    idField: 'GEM unit ID',
    nameFields: ['Plant name', 'Unit name'],
    statusField: 'Status',
    capacityField: 'Capacity (MW)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit (province, state)',
    },
    statusMap: {
      'operating': 'operating',
      'operating pre-retirement': 'operating',
      'construction': 'proposed',
      'permitted': 'proposed',
      'pre-permit': 'proposed',
      'pre-construction': 'proposed',
      'announced': 'proposed',
      'proposed': 'proposed',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'shelved': 'retired',
      'mothballed': 'retired',
      'cancelled - inferred 4 y': 'cancelled',
      'shelved - inferred 2 y': 'retired',
    },
  },
  'Coal Mine': {
    idField: 'GEM Mine ID',
    nameFields: 'Complex Name',
    statusField: 'Status',
    capacityField: 'Capacity (Mtpa)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country / Area',
      stateField: 'State / Province',
    },
    statusMap: {
      'operating': 'operating',
      'proposed': 'proposed',
      'mothballed': 'retired',
      'shelved': 'retired',
      'cancelled': 'cancelled',
      'retired': 'retired',
    },
  },
  'Iron Ore Mine': {
    idField: 'GEM Asset ID',
    nameFields: 'Asset name (English)',
    statusField: 'Status',
    capacityField: 'Production 2023 (ttpa)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit',
    },
    statusMap: {
      'operating': 'operating',
      'proposed': 'proposed',
      'unknown': 'unknown',
      'mothballed': 'retired',
      'cancelled': 'retired',
      'shelved': 'retired',
      'retired': 'retired',
    },
  },
  'Steel Plant': {
    idField: 'Steel Plant ID',
    nameFields: 'Plant name (English)',
    statusField: 'Status',
    capacityField: 'Nominal crude steel capacity (ttpa)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit (province, state)',
    },
    statusMap: {
      'operating': 'operating',
      'operating pre-retirement': 'operating',
      'construction': 'proposed',
      'announced': 'proposed',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'mothballed': 'retired',
      'mothballed pre-retirement': 'retired',
    },
  },
  'Cement and Concrete': {
    idField: 'GEM Plant ID',
    nameFields: 'GEM Asset name (English)',
    statusField: 'Status',
    capacityField: 'Cement Capacity (millions metric tonnes per annum)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit',
    },
    statusMap: {
      'operating': 'operating',
      'operating pre-retirement': 'operating',
      'construction': 'proposed',
      'announced': 'proposed',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'mothballed': 'retired',
      'mothballed pre-retirement': 'retired',
    },
  },
  'Gas Pipeline': {
    idField: 'ProjectID',
    nameFields: 'PipelineName',
    statusField: 'Status',
    capacityField: 'CapacityBcm/y',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Countries',
      stateField: 'States/Provinces',
    },
    statusMap: {
      'operating': 'operating',
      'proposed': 'proposed',
      'construction': 'proposed',
      'shelved': 'retired',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'mothballed': 'retired',
      'idle': 'retired',
    },
  },
  'Oil & NGL Pipeline': {
    idField: 'ProjectID',
    nameFields: 'PipelineName',
    statusField: 'Status',
    capacityField: 'CapacityBOEd',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Countries',
      stateField: 'States/Provinces',
    },
    statusMap: {
      'operating': 'operating',
      'proposed': 'proposed',
      'construction': 'proposed',
      'shelved': 'retired',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'mothballed': 'retired',
      'idle': 'retired',
    },
  },
  'Bioenergy Power': {
    idField: 'GEM unit ID',
    nameFields: ['Project Name', 'Unit Name'],
    statusField: 'Status',
    capacityField: 'Capacity (MW)',
    location: {
      latField: 'Latitude',
      lonField: 'Longitude',
      countryField: 'Country/Area',
      stateField: 'Subnational unit (province, state)',
    },
    statusMap: {
      'operating': 'operating',
      'operating pre-retirement': 'operating',
      'construction': 'proposed',
      'permitted': 'proposed',
      'pre-permit': 'proposed',
      'pre-construction': 'proposed',
      'announced': 'proposed',
      'proposed': 'proposed',
      'cancelled': 'cancelled',
      'retired': 'retired',
      'shelved': 'retired',
      'mothballed': 'retired',
      'cancelled - inferred 4 y': 'cancelled',
      'shelved - inferred 2 y': 'retired',
    },
  },
};

const results = {
  summary: { total: 0, passed: 0, failed: 0 },
  byTracker: {},
  issues: [],
};

function log(msg) {
  console.log(msg);
}

function error(msg) {
  console.error(`  ❌ ${msg}`);
  results.issues.push(msg);
}

function success(msg) {
  console.log(`  ✅ ${msg}`);
}

function warning(msg) {
  console.warn(`  ⚠️  ${msg}`);
}

async function validateTracker(db, tracker, config) {
  log(`\n📋 Validating: ${tracker}`);
  results.byTracker[tracker] = { checks: [], fieldsMissing: [], unmappedStatuses: [] };
  const tr = results.byTracker[tracker];

  // Query the data
  let rows;
  try {
    const result = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM 'gem-viz/public/all_trackers_ownership@1.parquet' WHERE Tracker = $1 LIMIT 100`,
        [tracker],
        (err, res) => {
          if (err) reject(err);
          else resolve(res || []);
        }
      );
    });
    rows = result;
  } catch (err) {
    error(`Failed to query ${tracker}: ${err.message}`);
    return;
  }

  if (rows.length === 0) {
    error(`No data found for tracker: ${tracker}`);
    return;
  }

  success(`Found ${rows.length} sample records`);

  // Check field names exist
  const firstRow = rows[0];
  const actualFields = Object.keys(firstRow);

  const requiredFields = [
    config.idField,
    config.statusField,
    config.capacityField,
    config.location.latField,
    config.location.lonField,
    config.location.countryField,
    config.location.stateField,
  ];

  if (Array.isArray(config.nameFields)) {
    requiredFields.push(...config.nameFields);
  } else {
    requiredFields.push(config.nameFields);
  }

  for (const field of requiredFields) {
    if (!actualFields.includes(field)) {
      error(`Missing field: "${field}"`);
      tr.fieldsMissing.push(field);
    }
  }

  if (tr.fieldsMissing.length === 0) {
    success(`All required fields exist`);
  }

  // Check status values are mapped
  const statusValues = new Set();
  for (const row of rows) {
    const status = row[config.statusField];
    if (status) {
      statusValues.add(status);
    }
  }

  const unmappedStatuses = [];
  for (const status of statusValues) {
    if (!config.statusMap[status]) {
      unmappedStatuses.push(status);
    }
  }

  if (unmappedStatuses.length === 0) {
    success(`All statuses are mapped: ${Array.from(statusValues).join(', ')}`);
  } else {
    error(
      `Unmapped statuses (${unmappedStatuses.length}): ${unmappedStatuses.join(', ')}`
    );
    tr.unmappedStatuses = unmappedStatuses;
  }

  // Sample validation: check a few records
  const sample = rows[0];

  // ID field
  if (!sample[config.idField]) {
    error(`Sample record has empty ID field "${config.idField}"`);
  } else {
    success(`Sample ID: ${sample[config.idField]}`);
  }

  // Coordinates
  const lat = sample[config.location.latField];
  const lon = sample[config.location.lonField];

  if (lat && lon) {
    const latNum = Number(lat);
    const lonNum = Number(lon);

    if (isFinite(latNum) && isFinite(lonNum)) {
      if (latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180) {
        success(`Sample coordinates valid: (${latNum.toFixed(2)}, ${lonNum.toFixed(2)})`);
      } else {
        error(
          `Sample coordinates out of range: lat=${latNum}, lon=${lonNum}`
        );
      }
    } else {
      error(`Sample coordinates not numeric: lat="${lat}", lon="${lon}"`);
    }
  } else {
    warning(`Sample has no coordinates`);
  }

  // Capacity
  if (config.capacityField) {
    const capacity = sample[config.capacityField];
    if (capacity) {
      const capNum = Number(capacity);
      if (isFinite(capNum)) {
        if (capNum > 0) {
          success(`Sample capacity valid: ${capNum}`);
        } else {
          warning(`Sample capacity is zero or negative: ${capNum}`);
        }
      } else if (capacity === '*' || capacity === 'unknown' || capacity === '') {
        warning(`Sample capacity is placeholder: "${capacity}"`);
      } else {
        error(`Sample capacity not numeric: "${capacity}"`);
      }
    } else {
      warning(`Sample has no capacity value`);
    }
  }

  // Country
  const country = sample[config.location.countryField];
  if (country) {
    success(`Sample country: ${country}`);
  } else {
    warning(`Sample has no country`);
  }

  results.summary.total++;
  if (tr.fieldsMissing.length === 0 && unmappedStatuses.length === 0) {
    results.summary.passed++;
  } else {
    results.summary.failed++;
  }
}

async function main() {
  log('\n' + '='.repeat(70));
  log('TRACKER CONFIGURATION VALIDATION');
  log('Checking tracker-config.ts against actual parquet data');
  log('='.repeat(70));

  const parquetPath = path.join(PROJECT_ROOT, 'gem-viz/public/all_trackers_ownership@1.parquet');

  if (!fs.existsSync(parquetPath)) {
    log(`\n❌ Parquet file not found at: ${parquetPath}`);
    log('Checked locations:');
    const possiblePaths = [
      parquetPath,
      path.join(PROJECT_ROOT, 'all_trackers_ownership@1.parquet'),
      path.join(PROJECT_ROOT, 'gem-viz/static/all_trackers_ownership@1.parquet'),
    ];
    for (const p of possiblePaths) {
      log(`  - ${p} ${fs.existsSync(p) ? '✓' : '✗'}`);
    }
    process.exit(1);
  }

  const db = new duckdb.Database(':memory:', async (err) => {
    if (err) {
      log(`\n❌ Failed to create DuckDB: ${err}`);
      process.exit(1);
    }

    try {
      // Test we can read the parquet
      await new Promise((resolve, reject) => {
        db.all(
          `SELECT DISTINCT Tracker FROM 'gem-viz/public/all_trackers_ownership@1.parquet' ORDER BY Tracker`,
          (err, res) => {
            if (err) reject(err);
            else resolve(res);
          }
        );
      });

      // Validate each tracker
      for (const [tracker, config] of Object.entries(trackerConfigs)) {
        await validateTracker(db, tracker, config);
      }

      // Summary
      log('\n' + '='.repeat(70));
      log('VALIDATION SUMMARY');
      log('='.repeat(70));
      log(
        `\nResults: ${results.summary.passed}/${results.summary.total} trackers passed`
      );

      if (results.summary.failed > 0) {
        log(`\n⚠️  ${results.summary.failed} tracker(s) have issues:\n`);
        for (const [tracker, tr] of Object.entries(results.byTracker)) {
          if (tr.fieldsMissing.length > 0 || tr.unmappedStatuses.length > 0) {
            log(`${tracker}:`);
            if (tr.fieldsMissing.length > 0) {
              log(`  - Missing fields: ${tr.fieldsMissing.join(', ')}`);
            }
            if (tr.unmappedStatuses.length > 0) {
              log(`  - Unmapped statuses: ${tr.unmappedStatuses.join(', ')}`);
            }
          }
        }
      }

      if (results.issues.length === 0) {
        log('\n✅ All validations passed!');
      } else {
        log(`\n❌ Found ${results.issues.length} issue(s)`);
      }

      log('\n' + '='.repeat(70) + '\n');

      db.close();
      process.exit(results.issues.length > 0 ? 1 : 0);
    } catch (err) {
      log(`\n❌ Error: ${err.message}`);
      db.close();
      process.exit(1);
    }
  });
}

main();
