#!/usr/bin/env node
/**
 * Spot Check Script
 *
 * Tests all major routes on a deployed GEM Viz instance.
 * Usage: node scripts/spot-check.js [base-url]
 *
 * Default: Production URL from version.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sample IDs for dynamic routes (known good IDs from the data)
const SAMPLE_ENTITY_IDS = [
  'E100000000834',
  'E100001000348',
];

// Interesting asset IDs to spot-check (from Observable notebooks)
// Note: Current dataset only has G-prefix (coal plants). P (steel) and M (mines) are different trackers.
const SAMPLE_ASSETS = [
  { id: 'G100000109409', name: 'Sines Power Station' },
  { id: 'G100001057899', name: 'Baghlan Power Station' },
  { id: 'G100000106660', name: 'Maranhão São Luís Coal' },
  { id: 'G100000107258', name: 'Nanshan Aluminum Donghai' },
  // These are from other trackers (not in current coal dataset):
  // { id: 'P100000120066', name: 'CAP Acero Huachipato Steel' },
  // { id: 'M4499', name: 'PKN Coal Mines' },
];

// Routes to check
// Each route can have multiple path variants to try (first success wins)
// Static adapter outputs .html files at root level
// csr: true means page is client-side rendered (check for SvelteKit shell, not specific content)
const ROUTES = [
  { paths: ['/index.html', '/'], name: 'Home', expect: 'GEM' },
  { paths: ['/asset.html', '/asset/index.html'], name: 'All Assets', expect: 'assets' },
  { paths: ['/asset/search.html', '/asset/search/index.html'], name: 'Asset Search', csr: true },
  // Check all sample assets
  ...SAMPLE_ASSETS.map(a => ({
    paths: [`/asset/${a.id}.html`, `/asset/${a.id}/index.html`],
    name: a.name,
    expect: a.id
  })),
  ...SAMPLE_ENTITY_IDS.map(id => ({
    paths: [`/entity/${id}.html`, `/entity/${id}/index.html`],
    name: `Entity ${id.slice(-4)}`,
    expect: id
  })),
  { paths: ['/network.html', '/network/index.html'], name: 'Network', expect: 'network' },
  { paths: ['/export.html', '/export/index.html'], name: 'Export', csr: true },
];

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

async function checkRoute(baseUrl, route) {
  // Try each path variant until one succeeds
  for (const path of route.paths) {
    const url = `${baseUrl}${path}`;
    const start = Date.now();

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GEM-Viz-SpotCheck/1.0' }
      });
      const elapsed = Date.now() - start;

      // Skip 404s and try next variant
      if (res.status === 404) continue;

      const text = await res.text();

      // For CSR pages, check for SvelteKit shell marker
      // For SSR pages, check for expected content
      let hasExpected;
      if (route.csr) {
        hasExpected = text.includes('__sveltekit_') || text.includes('sveltekit-preload');
      } else if (route.expect) {
        hasExpected = text.toLowerCase().includes(route.expect.toLowerCase());
      } else {
        hasExpected = true;
      }

      return {
        route,
        url,
        status: res.status,
        elapsed,
        ok: res.ok && hasExpected,
        contentOk: hasExpected,
        size: text.length,
      };
    } catch {
      // Network error - try next variant
      continue;
    }
  }

  // All variants failed
  return {
    route,
    url: `${baseUrl}${route.paths[0]}`,
    status: 404,
    elapsed: 0,
    ok: false,
    error: `All path variants failed: ${route.paths.join(', ')}`,
  };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function main() {
  // Get base URL from arg or version.json
  let baseUrl = process.argv[2];

  if (!baseUrl) {
    try {
      const versionPath = path.join(__dirname, '../static/version.json');
      const version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
      baseUrl = version.deployUrl;
    } catch {
      baseUrl = 'http://localhost:3737';
    }
  }

  // Ensure no trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');

  console.log(`\n${CYAN}GEM Viz Spot Check${RESET}`);
  console.log(`${DIM}Testing: ${baseUrl}${RESET}\n`);

  const results = [];

  for (const route of ROUTES) {
    process.stdout.write(`  ${route.name.padEnd(16)} `);
    const result = await checkRoute(baseUrl, route);
    results.push(result);

    if (result.ok) {
      const csrTag = result.route.csr ? `${DIM}(CSR)${RESET} ` : '';
      console.log(
        `${GREEN}[OK]${RESET} ${result.status} ${csrTag}` +
        `${DIM}${result.elapsed}ms ${formatSize(result.size)}${RESET}`
      );
    } else if (result.error) {
      console.log(`${RED}[FAIL] ERROR${RESET} ${result.error}`);
    } else if (!result.contentOk) {
      console.log(
        `${YELLOW}[WARN]${RESET} ${result.status} ` +
        `${DIM}(missing expected content: "${route.expect}")${RESET}`
      );
    } else {
      console.log(`${RED}[FAIL]${RESET} ${result.status}`);
    }
  }

  // Summary
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;

  console.log(`\n${DIM}─────────────────────────────────────${RESET}`);

  if (failed === 0) {
    console.log(`${GREEN}All ${passed} routes OK${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}${failed} route(s) failed${RESET}, ${passed} passed\n`);

    // Show failed URLs for debugging
    console.log(`${DIM}Failed URLs:${RESET}`);
    for (const r of results.filter(r => !r.ok)) {
      console.log(`  ${r.url}`);
    }
    console.log('');

    process.exit(1);
  }
}

main().catch(err => {
  console.error(`${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});
