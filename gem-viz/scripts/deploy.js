#!/usr/bin/env node

/**
 * Deploy script for Digital Ocean Spaces (S3-compatible)
 *
 * Usage: npm run deploy
 *
 * Requires AWS CLI configured with Digital Ocean Spaces credentials:
 * aws configure --profile do-spaces
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load package.json to get version
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8')
);

const version = packageJson.version;
const buildDir = path.join(rootDir, 'build');

// Digital Ocean Spaces configuration
const BUCKET = process.env.DO_SPACES_BUCKET || 'ejthirdbear';
const REGION = process.env.DO_SPACES_REGION || 'sfo3';
const ENDPOINT = process.env.DO_SPACES_ENDPOINT || 'https://sfo3.digitaloceanspaces.com';
const PROFILE = 'do-tor1';
const DEPLOY_BASE = 'gem-viz'; // Base subdirectory in bucket
// Deploy path matches svelte.config.js base path: /gem-viz/v${version}
const DEPLOY_PATH = `${DEPLOY_BASE}/v${version}`;

console.log('\n🚀 GEM Viz Deployment');
console.log('===================\n');
console.log(`Version: ${version}`);
console.log(`Bucket: ${BUCKET}`);
console.log(`Path: ${DEPLOY_PATH}`);
console.log(`Region: ${REGION}\n`);

// Check if build directory exists
if (!fs.existsSync(buildDir)) {
  console.error('❌ Build directory not found. Run `npm run build` first.');
  process.exit(1);
}

try {
  // Copy CHANGELOG.md to build directory for serving
  const changelogSource = path.join(rootDir, 'CHANGELOG.md');
  const changelogDest = path.join(buildDir, 'CHANGELOG.md');

  if (fs.existsSync(changelogSource)) {
    fs.copyFileSync(changelogSource, changelogDest);
    console.log('✓ Copied CHANGELOG.md to build directory');
  }

  // Upload to Digital Ocean Spaces using AWS CLI
  // Note: CORS is configured via Digital Ocean dashboard, not here
  console.log('\n📦 Uploading to Digital Ocean Spaces...\n');
  console.log(`→ Syncing to s3://${BUCKET}/${DEPLOY_PATH}/`);
  execSync(
    `aws s3 sync ${buildDir} s3://${BUCKET}/${DEPLOY_PATH}/ ` +
    `--endpoint-url ${ENDPOINT} ` +
    `--profile ${PROFILE} ` +
    `--acl public-read ` +
    `--cache-control "public, max-age=3600" ` +
    `--only-show-errors`,
    { stdio: 'inherit' }
  );

  console.log('\n✅ Deployment successful!\n');
  console.log(`🌐 URL: https://${BUCKET}.${REGION}.digitaloceanspaces.com/${DEPLOY_PATH}/`);
  console.log(`📝 Version: ${version}\n`);
  console.log('⚠️  IMPORTANT: MotherDuck WASM requires these HTTP headers on your CDN/proxy:');
  console.log('   Cross-Origin-Opener-Policy: same-origin');
  console.log('   Cross-Origin-Embedder-Policy: require-corp\n');
  console.log('   These cannot be set on S3/Spaces directly - use CloudFlare, CloudFront, or nginx proxy.\n');

} catch (error) {
  console.error('\n❌ Deployment failed:', error.message);
  process.exit(1);
}
