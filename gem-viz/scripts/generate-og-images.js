import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const ASSET_CACHE_PATH = process.env.ASSET_CACHE_PATH || '.svelte-kit/.asset-cache.json';
const ENTITY_CACHE_PATH = process.env.ENTITY_CACHE_PATH || '.svelte-kit/.entity-cache.json';
const OUTPUT_ROOT = process.env.OG_OUTPUT_DIR || (existsSync('build') ? 'build/og' : 'static/og');
const LIMIT = Number(process.env.OG_IMAGE_LIMIT || 0);

const WIDTH = 1200;
const HEIGHT = 630;

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, max) {
  const str = String(text || '');
  if (str.length <= max) return str;
  return `${str.slice(0, Math.max(0, max - 3))}...`;
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('en-US');
}

function formatCapacity(mw) {
  const num = Number(mw);
  if (!Number.isFinite(num)) return '—';
  if (num < 1) return `${num.toFixed(2)} MW`;
  if (num < 1000) return `${Math.round(num).toLocaleString('en-US')} MW`;
  if (num < 1000000) return `${(num / 1000).toFixed(2)} GW`;
  return `${(num / 1000000).toFixed(2)} TW`;
}

function getField(row, candidates) {
  for (const key of candidates) {
    if (row && Object.prototype.hasOwnProperty.call(row, key) && row[key] != null && row[key] !== '') {
      return row[key];
    }
  }
  return null;
}

function buildLine(parts) {
  return parts.filter(Boolean).join(' | ');
}

function renderAssetSvg({ assetId, name, tracker, status, country, ownerCount, capacity }) {
  const title = escapeXml(truncate(name || assetId || 'GEM Asset', 50));
  const line1 = escapeXml(buildLine([
    tracker ? `Tracker: ${tracker}` : null,
    status ? `Status: ${status}` : null,
    country ? `Country: ${country}` : null,
  ]));
  const line2 = escapeXml(buildLine([
    ownerCount ? `Owners: ${formatNumber(ownerCount)}` : null,
    capacity != null && !Number.isNaN(Number(capacity)) ? `Capacity: ${formatCapacity(capacity)}` : null,
  ]));
  const footer = escapeXml(assetId || 'GEM Asset');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dde3ea" stroke-width="1"/>
    </pattern>
    <pattern id="grid-bold" width="160" height="160" patternUnits="userSpaceOnUse">
      <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#cfd7e0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f7f9"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid-bold)"/>
  <rect x="60" y="60" width="${WIDTH - 120}" height="${HEIGHT - 120}" fill="#ffffff" stroke="#1b1b1b" stroke-width="2"/>
  <text x="96" y="124" font-size="18" font-family="IBM Plex Mono, monospace" fill="#1b1b1b">GEM VIZ</text>
  <text x="96" y="200" font-size="44" font-family="IBM Plex Mono, monospace" fill="#111111">${title}</text>
  <text x="96" y="244" font-size="18" font-family="IBM Plex Mono, monospace" fill="#333333">${line1 || 'GEM asset profile'}</text>
  <text x="96" y="288" font-size="16" font-family="IBM Plex Mono, monospace" fill="#333333">${line2}</text>
  <line x1="96" y1="330" x2="${WIDTH - 96}" y2="330" stroke="#d6dbe2" stroke-width="2"/>
  <text x="96" y="560" font-size="14" font-family="IBM Plex Mono, monospace" fill="#4f5964">${footer}</text>
</svg>`;
}

function renderEntitySvg({ entityId, name, assetCount, totalCapacityMw, countryCount, trackerCounts }) {
  const title = escapeXml(truncate(name || entityId || 'GEM Entity', 50));
  const line1 = escapeXml(buildLine([
    assetCount ? `${formatNumber(assetCount)} assets` : null,
    totalCapacityMw ? `${formatCapacity(totalCapacityMw)} capacity` : null,
    countryCount ? `${formatNumber(countryCount)} countries` : null,
  ]));
  const footer = escapeXml(entityId || 'GEM Entity');

  const barX = 680;
  const barY = 210;
  const barWidth = 430;
  const barHeight = 16;
  const barGap = 18;
  const maxCount = trackerCounts.length ? Math.max(...trackerCounts.map((t) => t.count)) : 0;
  const colors = ['#1b1b1b', '#2f3b47', '#4a5b6a', '#6b7a87', '#8a97a3'];

  const bars = trackerCounts.slice(0, 4).map((t, i) => {
    const width = maxCount ? Math.max(10, Math.round((t.count / maxCount) * barWidth)) : 10;
    const y = barY + i * (barHeight + barGap);
    const label = escapeXml(truncate(t.tracker, 18));
    return `
    <text x="${barX}" y="${y - 6}" font-size="14" font-family="IBM Plex Mono, monospace" fill="#444444">${label}</text>
    <rect x="${barX}" y="${y}" width="${width}" height="${barHeight}" fill="${colors[i % colors.length]}"/>
    <text x="${barX + width + 10}" y="${y + 13}" font-size="12" font-family="IBM Plex Mono, monospace" fill="#444444">${formatNumber(t.count)}</text>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#dde3ea" stroke-width="1"/>
    </pattern>
    <pattern id="grid-bold" width="160" height="160" patternUnits="userSpaceOnUse">
      <path d="M 160 0 L 0 0 0 160" fill="none" stroke="#cfd7e0" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#f6f7f9"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid-bold)"/>
  <rect x="60" y="60" width="${WIDTH - 120}" height="${HEIGHT - 120}" fill="#ffffff" stroke="#1b1b1b" stroke-width="2"/>
  <text x="96" y="124" font-size="18" font-family="IBM Plex Mono, monospace" fill="#1b1b1b">GEM VIZ</text>
  <text x="96" y="200" font-size="44" font-family="IBM Plex Mono, monospace" fill="#111111">${title}</text>
  <text x="96" y="244" font-size="18" font-family="IBM Plex Mono, monospace" fill="#333333">${line1 || 'GEM entity profile'}</text>
  <text x="96" y="560" font-size="14" font-family="IBM Plex Mono, monospace" fill="#4f5964">${footer}</text>
  <text x="${barX}" y="180" font-size="14" font-family="IBM Plex Mono, monospace" fill="#1b1b1b">Top trackers</text>
  ${bars}
</svg>`;
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function buildTrackerCounts(portfolioData) {
  const counts = new Map();
  const assets = portfolioData?.assets || [];
  for (const asset of assets) {
    const key = asset.tracker || 'Unknown';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts, ([tracker, count]) => ({ tracker, count }))
    .sort((a, b) => b.count - a.count);
}

function writeSvg(path, svg) {
  ensureDir(dirname(path));
  writeFileSync(path, svg);
}

function generateAssetImages(outputDir) {
  const cache = loadJson(ASSET_CACHE_PATH);
  if (!cache || !cache.assets) {
    console.warn(`[OG] Asset cache not found at ${ASSET_CACHE_PATH}, skipping asset images.`);
    return 0;
  }

  const assets = cache.assets;
  const assetIds = Object.keys(assets);
  const limit = LIMIT > 0 ? Math.min(LIMIT, assetIds.length) : assetIds.length;

  for (let i = 0; i < limit; i++) {
    const assetId = assetIds[i];
    const records = assets[assetId] || [];
    const row = records[0] || {};

    const name = getField(row, ['Project', 'Name', 'Asset Name', 'Unit Name', 'Facility Name']) || assetId;
    const tracker = getField(row, ['Tracker']);
    const status = getField(row, ['Status']);
    const country = getField(row, ['Country', 'Country.Area', 'Country Area']);
    const capacity = getField(row, ['Capacity (MW)', 'Capacity MW', 'Capacity']);

    const svg = renderAssetSvg({
      assetId,
      name,
      tracker,
      status,
      country,
      ownerCount: records.length,
      capacity,
    });
    const outPath = join(outputDir, 'asset', `${assetId}.svg`);
    writeSvg(outPath, svg);

    if ((i + 1) % 1000 === 0) {
      console.log(`[OG] Asset images: ${i + 1}/${limit}`);
    }
  }

  const fallbackSvg = renderAssetSvg({ assetId: 'GEM Asset', name: 'GEM Asset' });
  writeSvg(join(outputDir, 'asset', 'default.svg'), fallbackSvg);

  console.log(`[OG] Asset images generated: ${limit}`);
  return limit;
}

function generateEntityImages(outputDir) {
  const cache = loadJson(ENTITY_CACHE_PATH);
  if (!cache || !cache.entities) {
    console.warn(`[OG] Entity cache not found at ${ENTITY_CACHE_PATH}, skipping entity images.`);
    return 0;
  }

  const entities = cache.entities;
  const entityIds = Object.keys(entities);
  const limit = LIMIT > 0 ? Math.min(LIMIT, entityIds.length) : entityIds.length;

  for (let i = 0; i < limit; i++) {
    const entityId = entityIds[i];
    const entity = entities[entityId] || {};
    const trackerCounts = buildTrackerCounts(entity.portfolioData);

    const svg = renderEntitySvg({
      entityId,
      name: entity.name,
      assetCount: entity.assetCount,
      totalCapacityMw: entity.totalCapacityMw,
      countryCount: entity.countryCount,
      trackerCounts,
    });

    const outPath = join(outputDir, 'entity', `${entityId}.svg`);
    writeSvg(outPath, svg);

    if ((i + 1) % 500 === 0) {
      console.log(`[OG] Entity images: ${i + 1}/${limit}`);
    }
  }

  const fallbackSvg = renderEntitySvg({ entityId: 'GEM Entity', name: 'GEM Entity', trackerCounts: [] });
  writeSvg(join(outputDir, 'entity', 'default.svg'), fallbackSvg);

  console.log(`[OG] Entity images generated: ${limit}`);
  return limit;
}

function main() {
  if (process.env.SKIP_OG_IMAGES === 'true') {
    console.log('[OG] SKIP_OG_IMAGES=true, skipping.');
    return;
  }

  ensureDir(OUTPUT_ROOT);
  console.log(`[OG] Writing images to ${OUTPUT_ROOT}`);

  const assetCount = generateAssetImages(OUTPUT_ROOT);
  const entityCount = generateEntityImages(OUTPUT_ROOT);

  if (assetCount === 0 && entityCount === 0) {
    console.log('[OG] No cache data found. Nothing generated.');
  }
}

main();
