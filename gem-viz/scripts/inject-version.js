#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Record build start time for deploy.js to calculate total duration
writeFileSync(join(rootDir, '.build-start'), Date.now().toString());

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
  console.warn('WARNING: Unable to read git info (running in CI/detached state?)');
}

// Get package version for deploy URL
let pkgVersion = 'latest';
try {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  pkgVersion = pkg.version || 'latest';
} catch {
  console.warn('WARNING: Unable to read package.json');
}

const DEPLOY_BASE_URL = process.env.DEPLOY_BASE_URL || 'https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz';
const deployUrl = `${DEPLOY_BASE_URL}/v${pkgVersion}`;

const versionInfo = {
  version: commit,
  commit,
  message,
  author,
  timestamp,
  deployed: timestamp,
  buildTime: new Date().toLocaleString(),
  deployUrl
};

// Write to static directory so it gets served as a static file
const staticDir = 'static';
mkdirSync(staticDir, { recursive: true });
writeFileSync(`${staticDir}/version.json`, JSON.stringify(versionInfo, null, 2));

console.log('[OK] Version info injected');
console.log(`   Commit: ${commit}`);
console.log(`   Message: ${message}`);
console.log(`   Timestamp: ${timestamp}`);
