#!/usr/bin/env node

const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./gem-viz/.svelte-kit/.asset-cache.json', 'utf-8'));

console.log('='.repeat(80));
console.log('DATA VALIDATION AGAINST TRACKER CONFIGURATION');
console.log('='.repeat(80));

console.log('\n📊 ACTUAL DATA STRUCTURE\n');
console.log('Table:', data.tableName);
console.log('Assets:', Object.keys(data.assets).length);
console.log('Total ownership records:', Object.values(data.assets).reduce((sum, rows) => sum + rows.length, 0));
console.log('\nAvailable columns:');
data.columns.forEach(c => console.log(`  • ${c}`));

// Group by tracker
const byTracker = {};
Object.values(data.assets).forEach(rows => {
  const tracker = rows[0]?.Tracker;
  if (tracker) {
    if (!byTracker[tracker]) byTracker[tracker] = 0;
    byTracker[tracker]++;
  }
});

console.log('\n\n📈 ASSETS BY TRACKER\n');
Object.entries(byTracker).sort((a, b) => b[1] - a[1]).forEach(([tracker, count]) => {
  console.log(`  ${tracker}: ${count} assets`);
});

// Sample data for each tracker
console.log('\n\n🔍 SAMPLE RECORDS BY TRACKER\n');
for (const [tracker, count] of Object.entries(byTracker)) {
  const assetId = Object.entries(data.assets).find(([id, rows]) => rows[0]?.Tracker === tracker)?.[0];
  if (assetId) {
    const rows = data.assets[assetId];
    const sample = rows[0];
    console.log(`${tracker}:`);
    console.log(`  GEM unit ID: ${sample['GEM unit ID']}`);
    console.log(`  Project: ${sample['Project']}`);
    console.log(`  Status: ${sample['Status']}`);
    console.log(`  Capacity (MW): ${sample['Capacity (MW)']}`);
    console.log(`  Owner: ${sample['Immediate Project Owner']}`);
    console.log(`  Ownership records for this asset: ${rows.length}`);
    console.log();
  }
}

// Check status values
console.log('\n📋 STATUS VALUES BY TRACKER\n');
const statuses = {};
Object.values(data.assets).forEach(rows => {
  const tracker = rows[0]?.Tracker;
  const status = rows[0]?.Status;
  if (tracker && status) {
    if (!statuses[tracker]) statuses[tracker] = new Set();
    statuses[tracker].add(status);
  }
});

Object.entries(statuses).sort(([a], [b]) => a.localeCompare(b)).forEach(([tracker, statusSet]) => {
  console.log(`${tracker}:`);
  const sorted = Array.from(statusSet).sort();
  sorted.forEach(s => console.log(`  • ${s}`));
  console.log();
});

// Check what fields are actually missing
console.log('\n⚠️  FIELDS IN CONFIG BUT NOT IN DATA\n');
const missingFields = [
  'Plant name',
  'Unit name',
  'Latitude',
  'Longitude',
  'Country/Area',
  'Subnational unit (province, state)',
  'Complex Name',
  'Asset name (English)',
  'Plant name (English)',
  'PipelineName',
  'Countries',
  'States/Provinces',
];

const existingColumns = new Set(data.columns);
missingFields.forEach(field => {
  if (!existingColumns.has(field)) {
    console.log(`  ❌ "${field}"`);
  }
});

console.log('\n✅ FIELDS IN BOTH CONFIG AND DATA\n');
const expectedFields = [
  'GEM unit ID',
  'Status',
  'Capacity (MW)',
  'GEM location ID',
  'Tracker',
];

expectedFields.forEach(field => {
  if (existingColumns.has(field)) {
    console.log(`  ✓ "${field}"`);
  } else {
    console.log(`  ✗ "${field}"`);
  }
});

console.log('\n' + '='.repeat(80));
console.log('\nKEY FINDINGS:\n');
console.log('1. The Ownership Tracker parquet is an AGGREGATED table');
console.log('   - Contains consolidated ownership relationships');
console.log('   - NOT the full tracker detail from underlying sources');
console.log('   - Missing location (lat/lon) and detailed tracker fields');
console.log();
console.log('2. Available fields for data access:');
console.log('   ✓ GEM unit ID (asset identifier)');
console.log('   ✓ Project (asset name)');
console.log('   ✓ Tracker (asset type)');
console.log('   ✓ Status (operating/retired/etc)');
console.log('   ✓ Capacity (MW) (only for power plants)');
console.log('   ✓ Ownership chain (Owner, Parent, Immediate Project Owner)');
console.log('   ✗ Location coordinates (stored in GeoJSON instead)');
console.log('   ✗ Detailed tracker fields (name, units, etc.)');
console.log();
console.log('3. Recommendation:');
console.log('   - For Ownership Tracker parquet: use simplified config');
console.log('   - For full tracker data: need to access underlying trackers');
console.log('   - For location: use points.geojson (already in place)');
console.log('\n' + '='.repeat(80));
