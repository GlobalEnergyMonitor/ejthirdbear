import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import duckdb from 'duckdb';

const ENTITY_CACHE_PATH = process.env.ENTITY_CACHE_PATH || '.svelte-kit/.entity-cache.json';
const OUTPUT_DIR = process.env.FLOWER_OUTPUT_DIR || 'static/flowers';
const LIMIT = Number(process.env.FLOWER_LIMIT || 0);
const SIZE = Number(process.env.FLOWER_SIZE || 64);
const PARQUET_PATH =
  process.env.FLOWER_PARQUET_PATH || 'static/all_trackers_ownership@1.parquet';

const trackerColors = new Map([
  ['Coal Plant', '#7F142A'],
  ['Coal Mine', '#4A0D19'],
  ['Gas Plant', '#A0AAE5'],
  ['Gas Pipeline', '#7B86C9'],
  ['Oil & NGL Pipeline', '#061F5F'],
  ['Iron Ore Mine', '#DC153D'],
  ['Steel Plant', '#004F61'],
  ['Cement and Concrete', '#BECCCF'],
  ['Bioenergy Power', '#51BF7E'],
]);
const fallbackColor = '#e0e0e0';

function normalizeTrackerName(tracker) {
  const raw = String(tracker || '').trim();
  if (!raw) return 'Unknown';

  const explicit = new Map([
    ['Global Coal Plant Tracker', 'Coal Plant'],
    ['Global Coal Mine Tracker', 'Coal Mine'],
    ['Global Gas Plant Tracker', 'Gas Plant'],
    ['Global Gas Infrastructure Tracker', 'Gas Pipeline'],
    ['Global Oil Infrastructure Tracker', 'Oil & NGL Pipeline'],
    ['Global Oil and Gas Extraction Tracker', 'Oil & NGL Pipeline'],
    ['Global Steel Plant Tracker', 'Steel Plant'],
    ['Global Iron Mine Tracker', 'Iron Ore Mine'],
    ['Global Cement and Concrete Tracker', 'Cement and Concrete'],
    ['Global Bioenergy Power Tracker', 'Bioenergy Power'],
  ]);

  if (explicit.has(raw)) return explicit.get(raw);

  const match = raw.match(/^Global\s+(.+?)\s+(Plant|Mine|Infrastructure|Tracker)$/i);
  if (match) {
    const name = match[1].trim();
    const type = match[2].toLowerCase();
    if (type === 'plant') return `${name} Plant`;
    if (type === 'mine') return name.toLowerCase() === 'iron' ? 'Iron Ore Mine' : `${name} Mine`;
    if (type === 'infrastructure') {
      if (name.toLowerCase().includes('gas')) return 'Gas Pipeline';
      if (name.toLowerCase().includes('oil')) return 'Oil & NGL Pipeline';
    }
    return name;
  }

  return raw;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function _escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFilename(value) {
  return String(value || 'unknown').replace(/[^\w.-]/g, '_');
}

function arcPath(startAngle, endAngle, innerR, outerR) {
  const start = startAngle - Math.PI / 2;
  const end = endAngle - Math.PI / 2;

  const x1 = Math.cos(start) * innerR;
  const y1 = Math.sin(start) * innerR;
  const x2 = Math.cos(start) * outerR;
  const y2 = Math.sin(start) * outerR;
  const x3 = Math.cos(end) * outerR;
  const y3 = Math.sin(end) * outerR;
  const x4 = Math.cos(end) * innerR;
  const y4 = Math.sin(end) * innerR;

  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1} Z`;
}

function buildTrackerStats(portfolioData) {
  const assets = portfolioData?.assets || [];
  const counts = new Map();
  for (const asset of assets) {
    const tracker = normalizeTrackerName(asset.tracker);
    const entry = counts.get(tracker) || { tracker, count: 0, capacity: 0 };
    entry.count += 1;
    entry.capacity += Number(asset.capacityMw || 0);
    counts.set(tracker, entry);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function renderFlowerSvg(trackerStats) {
  if (!trackerStats.length) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}">
  <circle r="${SIZE * 0.22}" fill="none" stroke="#c7c7c7" stroke-width="1"/>
</svg>`;
  }

  const totalCount = trackerStats.reduce((sum, t) => sum + t.count, 0) || 1;
  const maxCapacity = Math.max(...trackerStats.map((t) => t.capacity || 0)) || 1;
  const innerRadius = SIZE * 0.14;
  const minRadius = SIZE * 0.3;
  const maxRadius = SIZE * 0.48;

  let angleAcc = 0;
  const petals = trackerStats.map((t) => {
    const angle = (t.count / totalCount) * 2 * Math.PI;
    const angleStart = angleAcc;
    const angleEnd = angleAcc + angle;
    angleAcc = angleEnd;

    const capacityRatio =
      t.capacity > 0 ? Math.log10(t.capacity) / Math.log10(maxCapacity) : 0.3;
    const radius = minRadius + (maxRadius - minRadius) * Math.max(capacityRatio, 0.3);
    return {
      tracker: t.tracker,
      angleStart,
      angleEnd,
      innerRadius,
      outerRadius: radius,
      color: trackerColors.get(t.tracker) || fallbackColor,
    };
  });

  const petalsMarkup = petals
    .map(
      (petal) => `<path d="${arcPath(
        petal.angleStart,
        petal.angleEnd,
        petal.innerRadius,
        petal.outerRadius
      )}" fill="${petal.color}" stroke="#111" stroke-width="1" fill-opacity="0.9"/>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="${-SIZE / 2} ${-SIZE / 2} ${SIZE} ${SIZE}">
  <g>
    ${petalsMarkup}
    <circle r="${SIZE * 0.09}" fill="#fff" stroke="#111" stroke-width="1.5"/>
  </g>
</svg>`;
}

function loadJson(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeFile(path, contents) {
  ensureDir(dirname(path));
  writeFileSync(path, contents);
}

function runQuery(conn, sql) {
  return new Promise((resolve, reject) => {
    conn.all(sql, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

async function loadTrackerCountsFromParquet() {
  if (!existsSync(PARQUET_PATH)) {
    throw new Error(`Parquet file not found at ${PARQUET_PATH}`);
  }

  const db = new duckdb.Database(':memory:');
  const conn = db.connect();

  const sql = `
    SELECT
      "Owner GEM Entity ID" AS entity_id,
      "Tracker" AS tracker,
      COUNT(*) AS asset_count,
      SUM(CAST("Capacity (MW)" AS DOUBLE)) AS total_capacity
    FROM read_parquet('${PARQUET_PATH}')
    WHERE "Owner GEM Entity ID" IS NOT NULL
      AND "Owner GEM Entity ID" != ''
      AND "Tracker" IS NOT NULL
    GROUP BY entity_id, tracker
  `;

  const rows = await runQuery(conn, sql);
  conn.close();
  db.close();

  const map = new Map();
  for (const row of rows) {
    const entityId = String(row.entity_id || '').trim();
    if (!entityId) continue;
    const tracker = normalizeTrackerName(row.tracker);
    const count = Number(row.asset_count || 0);
    const capacity = Number(row.total_capacity || 0);
    if (!map.has(entityId)) map.set(entityId, []);
    map.get(entityId).push({ tracker, count, capacity });
  }
  return map;
}

async function generateFlowers() {
  let trackerMap = null;
  try {
    trackerMap = await loadTrackerCountsFromParquet();
    console.log(`[flowers] Loaded tracker counts from ${PARQUET_PATH}`);
  } catch (err) {
    console.warn(`[flowers] Parquet load failed, falling back to entity cache: ${err.message}`);
  }

  let entityIds = [];
  let portfolioLookup = null;

  if (trackerMap) {
    entityIds = Array.from(trackerMap.keys());
  } else {
    const cache = loadJson(ENTITY_CACHE_PATH);
    if (!cache || !cache.entities) {
      console.warn(`[flowers] Entity cache not found at ${ENTITY_CACHE_PATH}.`);
      return 0;
    }
    portfolioLookup = cache.entities;
    entityIds = Object.keys(portfolioLookup);
  }

  const limit = LIMIT > 0 ? Math.min(LIMIT, entityIds.length) : entityIds.length;
  const manifest = { size: SIZE, icons: {} };

  ensureDir(OUTPUT_DIR);

  for (let i = 0; i < limit; i++) {
    const entityId = entityIds[i];
    const trackerStats = trackerMap
      ? trackerMap.get(entityId) || []
      : buildTrackerStats(portfolioLookup[entityId]?.portfolioData);

    const svg = renderFlowerSvg(trackerStats);
    const filename = `${safeFilename(entityId)}.svg`;
    const outPath = join(OUTPUT_DIR, filename);
    writeFile(outPath, svg);
    manifest.icons[entityId] = filename;

    if ((i + 1) % 1000 === 0) {
      console.log(`[flowers] ${i + 1}/${limit}`);
    }
  }

  const fallbackSvg = renderFlowerSvg([]);
  writeFile(join(OUTPUT_DIR, 'default.svg'), fallbackSvg);

  writeFile(join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  console.log(`[flowers] Generated ${limit} flower icons in ${OUTPUT_DIR}`);
  return limit;
}

generateFlowers();
