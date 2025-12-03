# Relationship Network Integration Guide

## 🎯 What We Built

Three new files that enable pre-baked relationship networks:

1. **`src/lib/buildRelationships.js`** - Core computation engine
2. **`src/lib/components/RelationshipNetwork.svelte`** - UI component
3. **This doc** - Integration instructions

## 🔧 Integration Steps

### Step 1: Update `+page.server.js` (entries function)

Add relationship cache building to the bulk fetch:

```javascript
// File: src/routes/asset/[id]/+page.server.js

import { buildRelationshipCache } from '$lib/buildRelationships';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Add this constant near the top
const RELATIONSHIP_CACHE_FILE = join(process.cwd(), 'build/.relationship-cache.json');

export async function entries() {
  // ... existing code to fetch all assets ...

  // NEW: Build relationship cache AFTER fetching all assets
  console.log('\n🔗 Building relationship cache...');
  const relationshipCache = await buildRelationshipCache(
    assetsMap,  // The Map of all assets
    motherduck, // MotherDuck connection
    fullTableName // e.g., "schema.table_name"
  );

  // Write relationship cache to disk
  const relationshipJSON = JSON.stringify(relationshipCache);
  const cacheDir = dirname(RELATIONSHIP_CACHE_FILE);
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  writeFileSync(RELATIONSHIP_CACHE_FILE, relationshipJSON);
  console.log(`  ✓ Relationship cache written (${(relationshipJSON.length / 1024 / 1024).toFixed(2)} MB)`);

  // ... rest of existing code ...
}
```

### Step 2: Update `+page.server.js` (load function)

Load relationships from cache and pass to page:

```javascript
// In-memory cache for relationships
let RELATIONSHIP_CACHE = null;
let relationshipCacheLoaded = false;

function getRelationshipsFromCache(assetId) {
  if (!relationshipCacheLoaded) {
    if (existsSync(RELATIONSHIP_CACHE_FILE)) {
      const cacheData = readFileSync(RELATIONSHIP_CACHE_FILE, 'utf-8');
      RELATIONSHIP_CACHE = JSON.parse(cacheData);
      relationshipCacheLoaded = true;
      console.log(`Loaded relationship cache: ${Object.keys(RELATIONSHIP_CACHE).length} assets`);
    } else {
      RELATIONSHIP_CACHE = {};
      relationshipCacheLoaded = true;
    }
  }

  return RELATIONSHIP_CACHE[assetId] || {
    sameOwnerAssets: [],
    coLocatedAssets: [],
    ownershipChain: [],
    ownerStats: null
  };
}

export async function load({ params }) {
  const assetId = params.id;

  // ... existing code to load asset from cache ...

  // NEW: Load relationships from cache
  const relationships = getRelationshipsFromCache(assetId);

  return {
    asset,
    tableName,
    columns,
    svgs,
    relationships  // ← NEW!
  };
}
```

### Step 3: Update `+page.svelte` (render component)

Add the RelationshipNetwork component to the page:

```svelte
<script>
  import { base } from '$app/paths';
  import AssetMap from '$lib/components/AssetMap.svelte';
  import RelationshipNetwork from '$lib/components/RelationshipNetwork.svelte';  // ← NEW

  export let data;

  const { asset, tableName, columns, svgs, relationships } = data;  // ← Add relationships

  // ... existing code ...
</script>

<main>
  <header>
    <!-- ... existing header ... -->
  </header>

  <article class="asset-detail">
    <!-- ... existing h1, meta-grid ... -->

    <!-- Interactive location map -->
    {#if gemUnitIdCol && asset[gemUnitIdCol]}
      <section class="map-section">
        <h2>Location</h2>
        <AssetMap
          gemUnitId={asset[gemUnitIdCol]}
          assetName={(nameCol && asset[nameCol]) ? asset[nameCol] : `ID: ${asset[columns[0]]}`}
        />
      </section>
    {/if}

    <!-- NEW: Relationship Network -->
    {#if relationships}
      <RelationshipNetwork
        relationships={relationships}
        currentAsset={asset}
      />
    {/if}

    <!-- ... rest of existing sections ... -->
  </article>
</main>
```

## 📊 Performance Impact

### Build Time Analysis

**Without relationships:**
```
🚀 BULK FETCH: Loading all assets into memory...
  ✓ Fetched 6,303 assets in 3.69s
  ✓ Wrote 6,303 assets to disk cache (42.30 MB)
  🔨 Building 6,303 pages
```

**With relationships (estimated):**
```
🚀 BULK FETCH: Loading all assets into memory...
  ✓ Fetched 6,303 assets in 3.69s

🔗 Building relationship cache...
  📊 Unique owners: ~1,200
  📍 Unique locations: ~800
  ⏳ Processed 1,200 owners...
  ✓ Built relationships in 25-40s  ← Additional time
  📦 Cache size: 6,303 assets

  ✓ Wrote relationship cache (15-20 MB)
  🔨 Building 6,303 pages
```

**Total impact:** +25-40 seconds build time, +15-20 MB cache

### Runtime Performance

**Zero impact!** Everything is pre-baked into HTML.

- No client-side queries
- No additional JavaScript
- No loading spinners
- Instant navigation

## 🧪 Testing Plan

### Test 1: Verify Cache Generation

```bash
npm run build

# Check if cache was created
ls -lh build/.relationship-cache.json

# Verify contents
node -e "const c = require('./build/.relationship-cache.json'); console.log('Assets with relationships:', Object.keys(c).length)"
```

### Test 2: Spot Check Asset Page

```bash
# Pick a random asset
ASSET=$(ls build/asset/ | shuf -n 1)

# Check if relationships are in the HTML
grep -o "🏢 Ownership Network" "build/asset/$ASSET/index.html" && echo "✓ Found ownership network"
grep -o "🔗 Other Assets" "build/asset/$ASSET/index.html" && echo "✓ Found related assets"
```

### Test 3: Local Preview

```bash
npm run preview

# Visit: http://localhost:4173/gem-viz/asset/E100001015833_G100000102373/index.html
# Should see ownership network and related assets
```

## 🐛 Troubleshooting

### "TypeError: Cannot read property 'GEM unit ID' of undefined"

**Cause:** Asset not in cache
**Fix:** Verify asset ID format matches cache keys (composite vs single ID)

### "Relationship cache is empty"

**Cause:** Cache file not created during build
**Fix:** Check build logs for errors in `buildRelationshipCache()`

### "Too many MotherDuck queries"

**Cause:** Not grouping by entity properly
**Fix:** Verify `assetsByOwner` Map is being used correctly

### "Build times out after 10 minutes"

**Cause:** Querying for each asset individually
**Fix:** Ensure you're using the optimized grouping strategy

## 🎨 Customization Options

### Limit Related Assets

```javascript
// In buildRelationships.js, change LIMIT:
ORDER BY "Capacity (MW)" DESC NULLS LAST
LIMIT 5  // ← Change from 10 to 5
```

### Add More Relationship Types

```javascript
// In computeAssetRelationships(), add new query:
const sameCountryQuery = `
  SELECT * FROM ${tableName}
  WHERE "Owner Headquarters Country" = '${asset["Owner Headquarters Country"]}'
  LIMIT 20
`;
```

### Change Visual Style

Edit `RelationshipNetwork.svelte` styles:
- Colors: `.chain-node { background: ... }`
- Layout: `.ownership-flow { display: grid; ... }`
- Spacing: `.asset-grid { gap: ... }`

## 📈 Next Steps (Optional)

### Phase 2 Enhancements:

1. **Entity Detail Pages**
   - Create `/entity/[id]/` routes
   - Show full portfolio for each entity
   - Generate during same build pass

2. **Interactive Network Graph**
   - Use deck.gl or D3 force layout
   - Make ownership chains interactive
   - Add zoom/pan capabilities

3. **Relationship Strength Indicators**
   - Thickness based on ownership %
   - Color based on capacity
   - Highlight critical paths

4. **Search & Filter**
   - "Find all assets owned by X"
   - "Show ownership chains > 5 levels"
   - "Filter by country/tracker type"

## ✅ Checklist

Before deploying with relationships:

- [ ] Update `entries()` function with `buildRelationshipCache()`
- [ ] Update `load()` function to read from cache
- [ ] Add `RelationshipNetwork` import to `+page.svelte`
- [ ] Add `<RelationshipNetwork>` component to template
- [ ] Test build locally (`npm run build`)
- [ ] Verify cache file created
- [ ] Spot check 3-5 asset pages
- [ ] Check build time is acceptable (<5 min)
- [ ] Preview locally and verify UI
- [ ] Deploy to staging first

---

**Ready to integrate? Start with Step 1 and work through sequentially!** 🚀
