#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Get git information
let commit = 'unknown';
let message = 'unknown';
let author = 'unknown';
let timestamp = new Date().toISOString();

try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  message = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim();
  author = execSync('git log -1 --format=%an', { encoding: 'utf8' }).trim();
} catch {
  console.warn('⚠️  Unable to read git info (running in CI/detached state?)');
}

const versionInfo = {
  version: commit,
  commit,
  message,
  author,
  timestamp,
  deployed: timestamp,
  buildTime: new Date().toLocaleString()
};

// Write to static directory so it gets served as a static file
const staticDir = 'static';
mkdirSync(staticDir, { recursive: true });
writeFileSync(`${staticDir}/version.json`, JSON.stringify(versionInfo, null, 2));

console.log('✅ Version info injected');
console.log(`   Commit: ${commit}`);
console.log(`   Message: ${message}`);
console.log(`   Timestamp: ${timestamp}`);
