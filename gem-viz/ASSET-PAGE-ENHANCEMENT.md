# Asset Detail Page Enhancement Plan

## 🎯 Goal: Pre-Baked Network Topology

Add rich relationship context to each asset page, computed at build time for zero runtime overhead.

---

## 📊 CURRENT STATE AUDIT

### What We Show Now ✅
```
┌─────────────────────────────────────┐
│ Didcot Power Station Unit 3        │
├─────────────────────────────────────┤
│ Status: retired                     │
│ Owner: Blackrock Advisors LLC       │
│ Country: United Kingdom             │
├─────────────────────────────────────┤
│ 📍 Interactive Map                   │
├─────────────────────────────────────┤
│ All Properties (table)              │
│ - Owner GEM Entity ID               │
│ - Ownership Path (text string)      │
│ - Immediate Project Owner           │
│ - Capacity, Location, etc.          │
└─────────────────────────────────────┘
```

### Data We Already Have (Example):
```json
{
  "Owner": "Blackrock Advisors LLC",
  "Owner GEM Entity ID": "E100001015833",
  "Ownership Path": "Blackrock Advisors LLC -> BlackRock Inc [5.07%] -> RWE AG [6.3%] -> RWE Generation SE [100.0%] -> Didcot power station Didcot-A: Unit 3 [100.0%]",
  "Immediate Project Owner": "RWE Generation SE",
  "Immediate Project Owner GEM Entity ID": "E100000003873",
  "GEM location ID": "L100000401457",
  "GEM unit ID": "G100000102373",
  "Capacity (MW)": 543
}
```

---

## 🎨 PROPOSED ENHANCEMENTS

### 1. Ownership Network Section

**Visual ownership chain with clickable entities:**

```
┌────────────────────────────────────────────────────┐
│ 🏢 Ownership Network                               │
├────────────────────────────────────────────────────┤
│                                                    │
│  Blackrock Advisors LLC ───5.07%───▶ BlackRock Inc│
│        (12 assets)                   (847 assets) │
│                                           │        │
│                                         6.3%       │
│                                           ▼        │
│                                        RWE AG      │
│                                     (234 assets)   │
│                                           │        │
│                                        100%        │
│                                           ▼        │
│                                  RWE Generation SE │
│                                      (45 assets)   │
│                                           │        │
│                                        100%        │
│                                           ▼        │
│                            Didcot Power Station    │
│                                  (THIS ASSET)      │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Data to pre-compute:**
- Parse ownership path into structured nodes
- Count assets owned by each entity in the chain
- Total capacity owned by each entity
- Generate entity profile links

### 2. Related Assets - Same Owner

```
┌────────────────────────────────────────────────────┐
│ 🔗 Other Assets Owned by Blackrock Advisors LLC   │
├────────────────────────────────────────────────────┤
│                                                    │
│  📊 Portfolio Summary:                             │
│  • Total Assets: 12                                │
│  • Total Capacity: 6,543 MW                        │
│  • Countries: US (8), UK (3), Germany (1)          │
│  • Status: Operating (9), Retired (3)              │
│                                                    │
│  🏭 Assets:                                         │
│  ┌──────────────────────────────────────┐          │
│  │ ▸ Didcot Unit 1 (543 MW) - retired   │ ← link  │
│  │ ▸ Didcot Unit 2 (543 MW) - retired   │          │
│  │ ▸ Didcot Unit 4 (543 MW) - retired   │          │
│  │ ▸ Genessee Unit 1 (630 MW) - operating│         │
│  │ ...view all 12 assets                │          │
│  └──────────────────────────────────────┘          │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Data to pre-compute:**
- Query all assets with same `Owner GEM Entity ID`
- Aggregate capacity by status, country, tracker type
- Sort by capacity or status
- Limit to top 10 with "show all" link

### 3. Related Assets - Same Location

```
┌────────────────────────────────────────────────────┐
│ 📍 Co-Located Assets (Same GEM Location)          │
├────────────────────────────────────────────────────┤
│                                                    │
│  Location: Didcot, Oxfordshire, UK                │
│  GEM Location ID: L100000401457                    │
│                                                    │
│  4 units at this location:                         │
│  ┌──────────────────────────────────────┐          │
│  │ ▸ Didcot Unit 1 (543 MW)             │          │
│  │ ▸ Didcot Unit 2 (543 MW)             │          │
│  │ ▸ Didcot Unit 3 (543 MW) ← YOU ARE HERE│        │
│  │ ▸ Didcot Unit 4 (543 MW)             │          │
│  └──────────────────────────────────────┘          │
│                                                    │
│  Combined capacity: 2,172 MW                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Data to pre-compute:**
- Query all assets with same `GEM location ID`
- Show total capacity for site
- Highlight current asset

### 4. Parent Company Portfolio

```
┌────────────────────────────────────────────────────┐
│ 🏢 Parent Company: RWE AG                          │
├────────────────────────────────────────────────────┤
│                                                    │
│  Global Portfolio:                                 │
│  • 234 total assets                                │
│  • 45,678 MW total capacity                        │
│  • Primary regions: Germany (120), UK (45), US (32)│
│                                                    │
│  By Tracker Type:                                  │
│  ├─ Coal Plants: 89 assets (23,456 MW)            │
│  ├─ Gas Plants: 67 assets (15,432 MW)             │
│  ├─ Gas Pipelines: 45 assets                       │
│  └─ Other: 33 assets                               │
│                                                    │
│  [View RWE AG Full Portfolio →]                    │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Data to pre-compute:**
- Parse ownership path to find ultimate parent
- Query all assets owned by parent entity
- Aggregate by tracker type, country, status
- Create dedicated parent company pages

---

## 🔧 IMPLEMENTATION PLAN

### Phase 1: Data Pre-computation (Build Time)

**File:** `src/routes/asset/[id]/+page.server.js`

Add to `load()` function:

```javascript
export async function load({ params }) {
  const assetId = params.id;
  const asset = getAssetFromCache(assetId);

  // NEW: Pre-compute relationships
  const relationships = await computeRelationships(asset);

  return {
    asset,
    tableName,
    columns,
    svgs,
    relationships  // ← New!
  };
}

async function computeRelationships(asset) {
  const motherduck = (await import('$lib/motherduck-node')).default;

  const ownerEntityId = asset["Owner GEM Entity ID"];
  const locationId = asset["GEM location ID"];
  const immediateOwnerId = asset["Immediate Project Owner GEM Entity ID"];

  // Query 1: Same owner assets
  const sameOwnerAssets = await motherduck.query(`
    SELECT
      "Project",
      "GEM unit ID",
      "Status",
      "Capacity (MW)",
      "Owner Headquarters Country"
    FROM coal_plant_ownership
    WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
      AND "GEM unit ID" != '${asset["GEM unit ID"]}'
    ORDER BY "Capacity (MW)" DESC
    LIMIT 10
  `);

  // Query 2: Co-located assets
  const coLocatedAssets = await motherduck.query(`
    SELECT
      "Project",
      "GEM unit ID",
      "Status",
      "Capacity (MW)"
    FROM coal_plant_ownership
    WHERE "GEM location ID" = '${locationId}'
      AND "GEM unit ID" != '${asset["GEM unit ID"]}'
    ORDER BY "Capacity (MW)" DESC
  `);

  // Query 3: Ownership chain entities (parsed from path)
  const ownershipChain = parseOwnershipPath(asset["Ownership Path"]);

  // Query 4: Parent company portfolio summary
  const parentPortfolio = await motherduck.query(`
    SELECT
      COUNT(*) as total_assets,
      SUM("Capacity (MW)") as total_capacity,
      COUNT(DISTINCT "Owner Headquarters Country") as countries
    FROM coal_plant_ownership
    WHERE "Immediate Project Owner GEM Entity ID" = '${immediateOwnerId}'
  `);

  return {
    sameOwnerAssets: sameOwnerAssets.data,
    coLocatedAssets: coLocatedAssets.data,
    ownershipChain,
    parentPortfolio: parentPortfolio.data[0]
  };
}

function parseOwnershipPath(path) {
  // Parse: "Company A -> Company B [50%] -> Company C [100%]"
  const nodes = path.split(' -> ').map(node => {
    const match = node.match(/^(.+?)(?: \[([0-9.]+)%\])?$/);
    return {
      name: match[1],
      share: match[2] ? parseFloat(match[2]) : null
    };
  });
  return nodes;
}
```

### Phase 2: UI Components

**File:** `src/lib/components/RelationshipNetwork.svelte`

```svelte
<script>
  export let relationships;
  export let currentAssetId;
</script>

<section class="ownership-network">
  <h2>🏢 Ownership Network</h2>

  <div class="ownership-chain">
    {#each relationships.ownershipChain as node, i}
      <div class="chain-node">
        <div class="entity-name">{node.name}</div>
        {#if node.share}
          <div class="ownership-percent">{node.share}%</div>
        {/if}
      </div>
      {#if i < relationships.ownershipChain.length - 1}
        <div class="chain-arrow">→</div>
      {/if}
    {/each}
  </div>
</section>

<section class="related-assets">
  <h2>🔗 Other Assets by Same Owner ({relationships.sameOwnerAssets.length})</h2>

  <ul class="asset-list">
    {#each relationships.sameOwnerAssets as relatedAsset}
      <li>
        <a href="/asset/{relatedAsset['GEM unit ID']}/index.html">
          {relatedAsset.Project}
          <span class="capacity">{relatedAsset['Capacity (MW)']} MW</span>
          <span class="status">{relatedAsset.Status}</span>
        </a>
      </li>
    {/each}
  </ul>
</section>

<style>
  .ownership-chain {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 20px;
    overflow-x: auto;
  }

  .chain-node {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 15px;
    background: white;
    border: 2px solid #000;
    min-width: 150px;
  }

  .entity-name {
    font-weight: bold;
    font-size: 12px;
    text-align: center;
  }

  .ownership-percent {
    font-size: 18px;
    color: #666;
    margin-top: 5px;
  }

  .chain-arrow {
    font-size: 24px;
    color: #666;
  }

  .asset-list {
    list-style: none;
    padding: 0;
  }

  .asset-list li {
    border-bottom: 1px solid #eee;
    padding: 10px 0;
  }

  .asset-list a {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-decoration: none;
    color: #000;
  }

  .asset-list a:hover {
    background: #f5f5f5;
  }
</style>
```

### Phase 3: Caching Strategy

**Critical:** Don't query MotherDuck 6,000 times!

```javascript
// In entries() function, build relationship cache upfront:

const relationshipCache = {};

console.log('🔗 Pre-computing relationships...');
for (const asset of allAssets) {
  const relationships = await computeRelationships(asset);
  relationshipCache[asset.id] = relationships;
}

// Write to disk alongside asset cache
writeFileSync(
  'build/.relationship-cache.json',
  JSON.stringify(relationshipCache)
);

// In load() function, read from cache:
function getRelationshipsFromCache(assetId) {
  if (!relationshipCacheLoaded) {
    const cache = JSON.parse(readFileSync('build/.relationship-cache.json'));
    relationshipCache = cache;
    relationshipCacheLoaded = true;
  }
  return relationshipCache[assetId];
}
```

---

## 📈 PERFORMANCE IMPACT

### Build Time:
- **Current:** ~3 seconds to fetch all assets
- **With relationships:** +15-30 seconds for relationship queries
- **With caching:** Reuse across builds (incremental)

### Build Size:
- **Current:** 207 MB
- **With relationships:** +10-20 MB (relationship cache)

### Page Load Time:
- **Zero impact** - all pre-baked into HTML
- No client-side queries
- Instant navigation between related assets

---

## 🎯 MVP SCOPE (Ship First)

### Must Have:
- ✅ Same owner assets (top 10)
- ✅ Co-located assets
- ✅ Visual ownership chain
- ✅ Basic parent company summary

### Nice to Have (v2):
- Entity detail pages (one page per GEM Entity ID)
- Interactive network graph (D3.js/deck.gl)
- Capacity timelines (historical data)
- Geographic clustering map
- Export to CSV/JSON

---

## 🚀 IMPLEMENTATION STEPS

1. **Add relationship computation** to `+page.server.js` ✓ Design complete
2. **Build relationship cache** during entries() phase
3. **Create RelationshipNetwork component**
4. **Update asset detail page** to include component
5. **Test with US build** (6k pages)
6. **Verify build time acceptable** (<5 min)
7. **Ship it!**

---

## 💡 FUTURE ENHANCEMENTS

### Interactive Network Graph
Use deck.gl or D3 force layout to show:
- Node size = capacity
- Edge thickness = ownership percentage
- Color = tracker type or country
- Click to navigate

### Entity Pages
Create `/entity/[id]/` routes showing:
- All assets owned by entity
- Portfolio breakdown charts
- Timeline of acquisitions/retirements
- Geographic distribution map

### Search & Filter
- "Show me all assets owned by BlackRock"
- "Show me all coal plants in Germany"
- "Show me ownership chains with > 5 entities"

---

**Ready to implement? Let me know and I'll start coding!** 🎨
