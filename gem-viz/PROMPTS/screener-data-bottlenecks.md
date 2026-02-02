# Screener Data Loading Bottlenecks

## Overview

The screener flow has three pages with different data sources:
1. **Step 1 (Asset Selection)** - Static config, no API calls
2. **Step 2 (Owner Search)** - REST API (`gem-ownership-api.fly.dev`)
3. **Step 3 (Results)** - MotherDuck (DuckDB WASM in browser)

---

## Critical Bottleneck: Results Page Query

**File:** `src/routes/screener/results/+page.svelte`
**Source:** MotherDuck via `unified-query.ts`

### The Problem

The results page runs a complex CTE query that scans the ownership table twice:

```sql
WITH owner_totals AS (
  SELECT
    "Immediate Owner Entity Name" as name,
    "Immediate Owner Entity ID" as entity_id,
    COUNT(DISTINCT "Asset ID") as total_assets
  FROM ownership
  WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
  GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
),
owner_filtered AS (
  SELECT
    "Immediate Owner Entity Name" as name,
    "Immediate Owner Entity ID" as entity_id,
    COUNT(DISTINCT "Asset ID") as filtered_assets
  FROM ownership
  WHERE "Immediate Owner Entity Name" IS NOT NULL AND "Immediate Owner Entity Name" != ''
    AND "Asset Type" = 'Coal Plant'  -- Filter by tracker
  GROUP BY "Immediate Owner Entity Name", "Immediate Owner Entity ID"
)
SELECT t.name, t.entity_id, t.total_assets, COALESCE(f.filtered_assets, 0) as filtered_assets
FROM owner_totals t
LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
WHERE f.filtered_assets > 0
ORDER BY f.filtered_assets DESC, t.total_assets DESC
LIMIT 200
```

### Why It's Slow

1. **Two full table scans** - Both CTEs scan the entire ownership table
2. **GROUP BY on strings** - Grouping by entity name/ID on large table
3. **Browser WASM** - Query runs in browser via DuckDB WASM, limited by client resources
4. **No indexes** - MotherDuck may not have optimal indexes

### Suggested Backend Solutions

**Option A: Pre-aggregated table**
Create a materialized view or table with owner stats per asset type:
```sql
-- Pre-compute once daily
CREATE TABLE owner_asset_counts AS
SELECT
  "Immediate Owner Entity ID" as entity_id,
  "Immediate Owner Entity Name" as name,
  "Asset Type" as asset_type,
  COUNT(DISTINCT "Asset ID") as asset_count
FROM ownership
WHERE "Immediate Owner Entity Name" IS NOT NULL
GROUP BY 1, 2, 3;
```

Then the query becomes a simple join:
```sql
SELECT name, entity_id,
  SUM(asset_count) as total_assets,
  SUM(CASE WHEN asset_type = 'Coal Plant' THEN asset_count ELSE 0 END) as filtered_assets
FROM owner_asset_counts
GROUP BY 1, 2
HAVING filtered_assets > 0
ORDER BY filtered_assets DESC
LIMIT 200;
```

**Option B: REST API endpoint**
Add to `gem-ownership-api`:
```
GET /owners/by-asset-type?type=Coal%20Plant&limit=200
```

Returns:
```json
{
  "results": [
    { "entity_id": "E123", "name": "Company A", "total_assets": 50, "filtered_assets": 12 },
    ...
  ]
}
```

**Option C: Server-side query**
Move MotherDuck query to SvelteKit server endpoint (`+page.server.ts`) with connection pooling.

---

## Secondary Bottleneck: Owner Search Bulk API

**File:** `src/routes/screener/owners/+page.svelte`
**Source:** REST API (`gem-ownership-api.fly.dev`)

### The Problem

Bulk search fires up to 30 parallel API requests:
```javascript
const searchPromises = inputs.slice(0, 30).map(async (term) => {
  const results = await searchSingleEntity(term);
  return { term, results, matchCount: results.length };
});
const groups = await Promise.all(searchPromises);
```

### Why It's Slow

1. **30 parallel requests** - Can overwhelm API, hit rate limits
2. **30 second timeout** - Suggests known slowness
3. **No batching** - Each search is a separate HTTP request

### Suggested Backend Solutions

**Option A: Batch search endpoint**
```
POST /entities/search/batch
Body: { "queries": ["Shell", "BP", "TotalEnergies", ...] }
```

**Option B: Increase single search limit**
Allow `?q=Shell,BP,TotalEnergies` with OR matching

---

## Additional Issues

### Debug Query in Production
Results page runs a debug query every load:
```sql
SELECT DISTINCT "Asset Type" as asset_type, COUNT(*) as cnt
FROM ownership
GROUP BY "Asset Type"
ORDER BY cnt DESC
LIMIT 20
```
**Fix:** Move to dev-only or cache this (it rarely changes)

### No Caching
- No HTTP caching headers from API
- No client-side cache for repeat queries
- MotherDuck WASM re-initializes on each page load

**Fix:** Add `Cache-Control` headers, consider service worker caching

### Status Filter Not Implemented
`_statusVal` is declared but unused in results query. When implemented, will add another filter clause.

---

## Priority Ranking

| Issue | Impact | Effort | Priority |
|-------|--------|--------|----------|
| Results page CTE query | High | Medium | **P0** |
| Bulk search batching | Medium | Low | P1 |
| Remove debug query | Low | Low | P2 |
| Add caching | Medium | Medium | P2 |
| Status filter | Low | Low | P3 |

---

## Frontend Can Fix

1. Remove debug query in production
2. Add debouncing to owner search
3. Add client-side caching (localStorage/sessionStorage)
4. Progressive loading / pagination on results

## Backend Needs To Fix

1. Pre-aggregated owner counts table
2. Batch entity search endpoint
3. HTTP cache headers on API responses
