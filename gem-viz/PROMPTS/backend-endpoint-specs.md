# Backend Endpoint Requests

Hey backend team! The screener is working great, but we've hit some performance walls that need server-side help. The frontend code is already prepped and ready to swap in new endpoints - just need the APIs.

Thank you for all your work on the ownership API. It's been a pleasure to build on top of.

---

## Quick Summary

| Priority | Endpoint | Why | Current Pain |
|----------|----------|-----|--------------|
| **P0** | `GET /screener/owners` | Owner aggregation by asset type | 2-8s browser query |
| **P1** | `POST /entities/search/batch` | Bulk entity lookup | 30 parallel requests |
| **P2** | `GET /screener/asset-type-counts` | Cached counts | Redundant query every load |

---

## P0: Owner Aggregation

### The Problem

We need to show "which companies own the most coal plants" (or steel plants, etc). Currently this runs in-browser via MotherDuck WASM and scans the ownership table twice:

```sql
-- Scans ~700K rows TWICE, takes 2-8 seconds in browser
WITH owner_totals AS (
  SELECT entity_id, name, COUNT(DISTINCT asset_id) as total_assets
  FROM ownership GROUP BY 1, 2
),
owner_filtered AS (
  SELECT entity_id, name, COUNT(DISTINCT asset_id) as filtered_assets
  FROM ownership WHERE asset_type = 'Coal Plant' GROUP BY 1, 2
)
SELECT ... FROM owner_totals JOIN owner_filtered ...
```

### Proposed Endpoint

```
GET /screener/owners?asset_type=Coal%20Plant&limit=200
```

**Parameters:**
| Param | Required | Example |
|-------|----------|---------|
| `asset_type` | Yes | `Coal Plant`, `Iron & Steel Plant` |
| `status` | No | `operating`, `construction` |
| `country` | No | `China`, `United States` |
| `limit` | No | Default: 200 |
| `offset` | No | Default: 0 |

**Response:**
```json
{
  "total": 1234,
  "results": [
    {
      "entity_id": "E100001000348",
      "name": "China Energy Investment",
      "total_assets": 156,
      "filtered_assets": 42,
      "headquarters_country": "China"
    }
  ]
}
```

**Fields explained:**
- `total_assets` = count of ALL assets this entity owns (any type)
- `filtered_assets` = count matching the `asset_type` filter

### Implementation Idea

A pre-aggregated table updated daily would make queries instant:

```sql
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

Then queries just sum from the small table instead of scanning 700K rows.

---

## P1: Batch Entity Search

### The Problem

Bulk owner search (user pastes 30 company names) currently fires 30 parallel HTTP requests to `/entities?q=`. This takes 3-15 seconds and risks rate limits.

### Proposed Endpoint

```
POST /entities/search/batch
```

**Request:**
```json
{
  "queries": ["Shell", "BP", "TotalEnergies", "E100001000348"],
  "limit_per_query": 10
}
```

**Response:**
```json
{
  "results": {
    "Shell": [
      { "id": "E100001000201", "name": "Shell plc", "headquarters_country": "UK" }
    ],
    "BP": [
      { "id": "E100001000300", "name": "BP plc", "headquarters_country": "UK" }
    ],
    "E100001000348": [
      { "id": "E100001000348", "name": "China Energy Investment", "headquarters_country": "China" }
    ],
    "TotalEnergies": []
  },
  "query_count": 4
}
```

Note: If a query looks like an entity ID (starts with `E` + digits), do an exact lookup instead of text search.

---

## P2: Asset Type Counts

### The Problem

We run this on every page load for debugging/validation:

```sql
SELECT "Asset Type", COUNT(*) FROM ownership GROUP BY 1
```

### Proposed Endpoint

```
GET /screener/asset-type-counts
```

**Response:**
```json
{
  "counts": {
    "Coal Plant": 14363,
    "Iron & Steel Plant": 3421,
    "Coal Mine": 4532
  },
  "last_updated": "2026-02-02T00:00:00Z"
}
```

This could be a static JSON regenerated hourly - data barely changes.

---

## Asset Type Mapping

The frontend uses friendly names. Please accept either:

| Frontend | Database Value |
|----------|----------------|
| Coal Plant | Coal Plant |
| Steel Plant | Iron & Steel Plant |
| Gas Pipeline | Natural Gas Transmission Pipeline |
| Oil & NGL Pipeline | Oil or NGL Pipeline |
| Coal Mine | Coal Mine |
| Iron Mine | Iron Ore Mine |
| Cement Plant | Cement or Concrete Plant |

---

## Nice-to-Have Headers

```
Cache-Control: public, max-age=300
X-Query-Time-Ms: 234
```

---

## Frontend Is Ready

All the integration code is written and waiting in:
- `src/lib/data-config/screener-api.ts`

When endpoints are live, we just uncomment the REST functions and delete the MotherDuck ones. Should take ~5 minutes to swap over.

Thanks again!
