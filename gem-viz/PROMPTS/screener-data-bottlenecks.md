# Screener Performance Notes

Internal reference for the screener data flow and known bottlenecks.

---

## Data Flow Overview

```
Step 1: Asset Selection     → Static config (instant)
Step 2: Owner Search        → REST API (gem-ownership-api.fly.dev)
Step 3: Results             → MotherDuck (DuckDB WASM in browser) ← SLOW
```

---

## Bottleneck 1: Results Page Query (P0)

**Location:** `src/routes/screener/results/+page.svelte`
**Data source:** MotherDuck via `screener-api.ts`
**Time:** 2-8 seconds

### What happens

The query scans the ownership table (~700K rows) twice:

1. First CTE: count ALL assets per owner
2. Second CTE: count FILTERED assets per owner
3. Join them together

```sql
WITH owner_totals AS (...),      -- full table scan
     owner_filtered AS (...)     -- full table scan again
SELECT ... FROM owner_totals JOIN owner_filtered
```

### Why it's slow

- Two full table scans in browser WASM
- GROUP BY on string columns
- No server-side indexes
- Client machine dependent

### Solution

Backend endpoint: `GET /screener/owners?asset_type=Coal%20Plant`

See `backend-endpoint-specs.md` for full spec.

---

## Bottleneck 2: Bulk Owner Search (P1)

**Location:** `src/routes/screener/owners/+page.svelte`
**Data source:** REST API
**Time:** 3-15 seconds

### What happens

User pastes a list of 30 company names → fires 30 parallel HTTP requests.

```javascript
const promises = inputs.map(term => searchEntities(term));
await Promise.all(promises);
```

### Why it's slow

- 30 round trips to server
- Can hit rate limits
- Network latency multiplied

### Solution

Backend endpoint: `POST /entities/search/batch`

See `backend-endpoint-specs.md` for full spec.

---

## Bottleneck 3: Debug Query (P2)

**Location:** `src/routes/screener/results/+page.svelte`
**Time:** ~500ms

### What happens

Runs on every page load to validate asset types:

```sql
SELECT "Asset Type", COUNT(*) FROM ownership GROUP BY 1
```

### Solution

Either:
- Move to dev-only
- Backend endpoint: `GET /screener/asset-type-counts`
- Cache in localStorage

---

## Current API Inventory

Checked 2026-02-02. Available at `gem-ownership-api.fly.dev`:

| Endpoint | Useful for screener? |
|----------|---------------------|
| `GET /entities?q=` | Yes - single search |
| `GET /assets?asset_type=` | Partial - no owner info |
| `GET /metadata` | Yes - asset type list |
| `GET /ownership/graph` | No - entity chains only |

**Missing:**
- Owner aggregation by asset type
- Batch entity search

---

## Frontend Fixes Done

- [x] Centralized all data fetching in `screener-api.ts`
- [x] Added query logging for profiling
- [x] Prepped REST implementations (commented out, ready to swap)
- [x] Documented endpoint specs for backend team

## Waiting On Backend

- [ ] `GET /screener/owners` endpoint
- [ ] `POST /entities/search/batch` endpoint
- [ ] `GET /screener/asset-type-counts` endpoint (optional)
