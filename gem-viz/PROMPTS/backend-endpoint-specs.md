# Backend Endpoint Specifications for Screener

## Overview

The frontend screener (`/screener/*`) currently has two major performance bottlenecks that require new backend endpoints. This document provides detailed specs for each endpoint.

**Frontend code location:** `src/lib/data/screener-api.ts` (centralized, ready to swap implementations)

---

## Priority 1: Screener Owners Endpoint

### Current Problem

The results page (`/screener/results`) runs this expensive MotherDuck query:

```sql
-- THIS SCANS THE OWNERSHIP TABLE TWICE
WITH owner_totals AS (
  SELECT
    "Immediate Owner Entity Name" as name,
    "Immediate Owner Entity ID" as entity_id,
    COUNT(DISTINCT "Asset ID") as total_assets
  FROM ownership
  WHERE "Immediate Owner Entity Name" IS NOT NULL
  GROUP BY 1, 2
),
owner_filtered AS (
  SELECT
    "Immediate Owner Entity Name" as name,
    "Immediate Owner Entity ID" as entity_id,
    COUNT(DISTINCT "Asset ID") as filtered_assets
  FROM ownership
  WHERE "Immediate Owner Entity Name" IS NOT NULL
    AND "Asset Type" = 'Coal Plant'  -- Filter varies
  GROUP BY 1, 2
)
SELECT t.name, t.entity_id, t.total_assets, COALESCE(f.filtered_assets, 0) as filtered_assets
FROM owner_totals t
LEFT JOIN owner_filtered f ON t.entity_id = f.entity_id
WHERE f.filtered_assets > 0
ORDER BY f.filtered_assets DESC, t.total_assets DESC
LIMIT 200
```

**Performance:** 2-8 seconds in browser WASM, depending on table size

### Proposed Endpoint

```
GET /screener/owners
```

### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `asset_type` | string | Yes | Asset type filter (e.g., "Coal Plant", "Iron & Steel Plant") |
| `status` | string | No | Status filter (e.g., "operating", "construction") |
| `country` | string | No | Country filter (e.g., "China", "United States") |
| `owner_ids` | string | No | Comma-separated entity IDs to filter to specific owners |
| `limit` | int | No | Max results (default: 200) |
| `offset` | int | No | Pagination offset (default: 0) |

### Response Schema

```json
{
  "total": 1234,
  "limit": 200,
  "offset": 0,
  "results": [
    {
      "entity_id": "E100001000348",
      "name": "China Energy Investment",
      "total_assets": 156,
      "filtered_assets": 42,
      "headquarters_country": "China"
    },
    {
      "entity_id": "E100001000001",
      "name": "NTPC Limited",
      "total_assets": 89,
      "filtered_assets": 31,
      "headquarters_country": "India"
    }
  ]
}
```

### Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `entity_id` | string | GEM Entity ID (E-prefixed) |
| `name` | string | Entity display name |
| `total_assets` | int | Count of ALL assets this entity owns (across all types) |
| `filtered_assets` | int | Count of assets matching the `asset_type` filter |
| `headquarters_country` | string | Entity HQ country (optional, for display) |

### Backend Implementation Notes

**Option A: Pre-aggregated table (recommended)**

Create a materialized table updated daily:

```sql
CREATE TABLE owner_asset_counts AS
SELECT
  "Immediate Owner Entity ID" as entity_id,
  "Immediate Owner Entity Name" as name,
  "Asset Type" as asset_type,
  "Status" as status,
  COUNT(DISTINCT "Asset ID") as asset_count
FROM ownership
WHERE "Immediate Owner Entity Name" IS NOT NULL
  AND "Immediate Owner Entity Name" != ''
GROUP BY 1, 2, 3, 4;

CREATE INDEX idx_oac_asset_type ON owner_asset_counts(asset_type);
CREATE INDEX idx_oac_entity ON owner_asset_counts(entity_id);
```

Then the endpoint query becomes:

```sql
SELECT
  entity_id,
  name,
  SUM(asset_count) as total_assets,
  SUM(CASE WHEN asset_type = :asset_type THEN asset_count ELSE 0 END) as filtered_assets
FROM owner_asset_counts
WHERE (:asset_type IS NULL OR asset_type = :asset_type OR 1=1)
GROUP BY entity_id, name
HAVING filtered_assets > 0
ORDER BY filtered_assets DESC
LIMIT :limit OFFSET :offset
```

**Option B: Cached query results**

If pre-aggregation is too complex, cache query results with key:
`screener:owners:{asset_type}:{status}:{country}`

TTL: 5-15 minutes (data doesn't change frequently)

### Frontend Integration

Already prepared in `src/lib/data/screener-api.ts`:

```typescript
// Just uncomment this function and delete the MotherDuck one:
async function getOwnersByAssetTypeREST(
  filters: ScreenerFilters,
  limit: number
): Promise<ScreenerResultsResponse> {
  const params = new URLSearchParams();
  params.set('asset_type', getAssetTypeForTracker(filters.tracker) || filters.tracker);
  if (filters.status) params.set('status', filters.status);
  if (filters.country) params.set('country', filters.country);
  params.set('limit', String(limit));

  const response = await fetch(`${API_BASE}/screener/owners?${params}`);
  const data = await response.json();

  return {
    owners: data.results,
    source: 'rest-api',
    queryTimeMs: data.query_time_ms || 0,
    totalCount: data.total,
  };
}
```

---

## Priority 2: Batch Entity Search

### Current Problem

Bulk search on `/screener/owners` fires up to 30 parallel requests:

```javascript
// CURRENT: 30 HTTP requests
const searchPromises = inputs.slice(0, 30).map(async (term) => {
  const results = await searchEntities(term);
  return { term, results };
});
await Promise.all(searchPromises);
```

**Performance:** 3-15 seconds depending on network, can hit rate limits

### Proposed Endpoint

```
POST /entities/search/batch
```

### Request Body

```json
{
  "queries": ["Shell", "BP", "TotalEnergies", "E100001000348"],
  "limit_per_query": 10
}
```

### Query Parameters (alternative to body)

Could also support GET with comma-separated queries:
```
GET /entities/search/batch?q=Shell,BP,TotalEnergies&limit=10
```

### Response Schema

```json
{
  "results": {
    "Shell": [
      {
        "id": "E100001000201",
        "name": "Shell plc",
        "headquarters_country": "United Kingdom"
      },
      {
        "id": "E100001000202",
        "name": "Shell USA Inc",
        "headquarters_country": "United States"
      }
    ],
    "BP": [
      {
        "id": "E100001000300",
        "name": "BP plc",
        "headquarters_country": "United Kingdom"
      }
    ],
    "E100001000348": [
      {
        "id": "E100001000348",
        "name": "China Energy Investment",
        "headquarters_country": "China"
      }
    ],
    "TotalEnergies": []
  },
  "query_count": 4,
  "total_results": 4,
  "query_time_ms": 234
}
```

### Backend Implementation Notes

```python
@app.post("/entities/search/batch")
async def batch_search(body: BatchSearchRequest):
    results = {}

    for query in body.queries[:50]:  # Limit to 50 queries
        # Check if it's an entity ID
        if query.upper().startswith('E') and query[1:].isdigit():
            entity = get_entity_by_id(query.upper())
            results[query] = [entity] if entity else []
        else:
            # Text search
            results[query] = search_entities(query, limit=body.limit_per_query)

    return {"results": results, "query_count": len(body.queries)}
```

### Frontend Integration

Already prepared in `src/lib/data/screener-api.ts`:

```typescript
// Just uncomment this function:
async function searchEntitiesBulkREST(
  queries: string[],
  limitPerQuery: number
): Promise<BulkSearchResponse> {
  const response = await fetch(`${API_BASE}/entities/search/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ queries, limit_per_query: limitPerQuery }),
  });

  const data = await response.json();

  return {
    results: data.results,
    source: 'rest-api',
    queryTimeMs: data.query_time_ms || 0,
    apiCallCount: 1,
  };
}
```

---

## Priority 3: Asset Type Counts

### Current Problem

Debug query runs on every page load:

```sql
SELECT "Asset Type", COUNT(*) as cnt
FROM ownership
GROUP BY "Asset Type"
```

### Proposed Endpoint

```
GET /screener/asset-type-counts
```

### Response Schema

```json
{
  "counts": {
    "Coal Plant": 12543,
    "Iron & Steel Plant": 3421,
    "Natural Gas Transmission Pipeline": 8765,
    "Coal Mine": 4532
  },
  "last_updated": "2026-02-02T00:00:00Z"
}
```

### Backend Implementation Notes

- Cache aggressively (1 hour+)
- Could be a static JSON file updated by cron
- Data rarely changes

---

## Asset Type Mapping Reference

The frontend uses friendly names that need to map to database values:

| Frontend Name | Database "Asset Type" Value |
|---------------|----------------------------|
| Coal Plant | Coal Plant |
| Steel Plant | Iron & Steel Plant |
| Gas Pipeline | Natural Gas Transmission Pipeline |
| Oil & NGL Pipeline | Oil or NGL Pipeline |
| Coal Mine | Coal Mine |
| Iron Mine | Iron Ore Mine |
| Cement Plant | Cement or Concrete Plant |
| Gas Plant | Gas Plant |
| Bioenergy Power | Bioenergy Power |

The mapping is defined in:
- Frontend: `src/lib/data-config/tracker-schema.ts` → `TRACKER_TO_ASSET_TYPE`
- The backend should accept either the friendly name or the database value

---

## HTTP Response Headers

Please include these headers for caching:

```
Cache-Control: public, max-age=300  # 5 minutes for owner queries
Cache-Control: public, max-age=3600 # 1 hour for asset type counts
X-Query-Time-Ms: 234               # For performance monitoring
```

---

## Error Response Format

```json
{
  "error": "Invalid asset_type parameter",
  "code": "INVALID_PARAM",
  "details": {
    "param": "asset_type",
    "value": "Unknown Type",
    "valid_values": ["Coal Plant", "Iron & Steel Plant", ...]
  }
}
```

---

## Contact

Frontend code is ready to integrate:
- `src/lib/data/screener-api.ts` - Centralized API layer
- `src/routes/screener/results/+page.svelte` - Results page
- `src/routes/screener/owners/+page.svelte` - Owner search page

When endpoints are ready, we just uncomment the REST implementations and delete the MotherDuck ones.
