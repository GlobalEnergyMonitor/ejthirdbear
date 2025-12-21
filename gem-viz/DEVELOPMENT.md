# GEM Viz Development Status

Last updated: 2025-12-17

## Current Status: Production Ready (Local Changes Pending)

### Latest Deploy: v0.1.20 (Dec 16, 2025)

**Live URL:** https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/v0.1.20/

---

### Local Changes (Not Yet Deployed)

**1. "Components Fetch Their Own Data" Pattern (Dec 17)**
- New `src/lib/component-data/use-fetch.svelte.ts` - SSR-aware data fetching helper
- Components call `useFetch()` which checks context cache first, then fetches on client
- Entity pages set up SSR cache via `setContext(SSR_CACHE_KEY, buildSSRCache({...}))`
- AssetScreener refactored to use this pattern instead of `prebakedPortfolio` prop

**2. Investigation Cart Enhancements (Dec 17)**
- CSV export split into two functions:
  - `exportMetadataCSV()` - Summary, cart contents, geographic breakdown
  - `exportDataCSV()` - Clean data files per tracker for Excel/Pandas import
- Added "Clear Cart" button with confirmation modal dialog

---

### Feature Branch: `feature/ownership-api-integration` (Dec 17)

**New Ownership Tracing API Integration**

Replaces MotherDuck queries with the new Ownership API (`https://6b7c36096b12.ngrok.app`).

**New Files:**
- `src/lib/ownership-api.ts` - API client with all endpoints

**Modified Files:**
- `src/lib/component-data/schema.ts` - Now uses API for ownership queries
- `src/lib/ownership-data.ts` - Rewritten to use API instead of DuckDB
- `src/routes/entity/[id]/+page.server.js` - Uses API for entity prebaking
- `src/routes/asset/[id]/+page.server.js` - API fallback for dev mode

**API Endpoints Used:**
| Endpoint | Purpose |
|----------|---------|
| `GET /entities` | List/search entities (paginated) |
| `GET /entities/{id}` | Entity details |
| `GET /entities/{id}/owners` | Direct owners with % |
| `GET /entities/{id}/graph/down` | Full ownership graph |
| `GET /assets/{id}` | Asset details |
| `GET /ownership/graph` | Universal graph traversal |

**What Still Uses MotherDuck:**
- Asset `entries()` bulk fetch (for geography/S2 cells)
- Co-located assets queries (API doesn't support location-based queries)
- Production cache building (hybrid approach)

---

## Recent Fix: Asset Screener SSR Bug (Dec 16, 2025)

### The Problem
Asset Screener on entity pages showed "Unknown Owner" with "0 assets via 0 direct subsidiaries" instead of real portfolio data. This happened despite prebaked data being passed correctly from the server.

### Root Cause
In Svelte 5, `$effect` only runs on the **client** during hydration. The server pre-renders HTML with default state values (null, empty Map, etc.), so the static HTML contained the wrong data.

```javascript
// BROKEN: $effect doesn't run during SSR
$effect(() => {
  if (prebakedPortfolio) {
    applyPortfolio(prebakedPortfolio);  // Never runs on server!
  }
});
```

### The Fix
Changed from `$effect` + `$state` to `$derived` for all portfolio values. `$derived` computes values immediately from props during SSR.

**File:** `src/lib/components/AssetScreener.svelte`

```javascript
// FIXED: $derived works during SSR
const effectivePortfolio = $derived(prebakedPortfolio || fetchedPortfolio);
const spotlightOwner = $derived(effectivePortfolio?.spotlightOwner ?? null);
const subsidiariesMatched = $derived(toMap(effectivePortfolio?.subsidiariesMatched));
const directlyOwned = $derived(effectivePortfolio?.directlyOwned || []);
const assets = $derived(effectivePortfolio?.assets || []);
const entityMap = $derived(toMap(effectivePortfolio?.entityMap));
const matchedEdges = $derived(toMap(effectivePortfolio?.matchedEdges));
```

### Verification
BlackRock entity page (E100001000348) now correctly shows:
- **Company:** "BlackRock Inc" (was "Unknown Owner")
- **Assets:** "1115 assets via 183 direct subsidiaries" (was "0 assets")
- Full subsidiary groupings with mini bar charts

### Key Lesson: Svelte 5 SSR
- `$effect` = client-side only (like `onMount`)
- `$derived` = computed during SSR and reactive on client
- For prebaked data in static builds, always use `$derived` to ensure values are in the HTML

---

## Data Flow for Entity Pages

```
Build Time:
  +page.server.js entries() → Bulk fetch from MotherDuck → .entity-cache.json

  +page.server.js load() → Read cache → ownerExplorerData {
    spotlightOwner: { id, Name },
    subsidiariesMatched: [[subId, assets[]]],  // Array of tuples (JSON-safe)
    directlyOwned: [],
    matchedEdges: [[subId, { value }]],
    entityMap: [[subId, { id, Name, type }]],
    assets: []
  }

Page Render:
  +page.svelte → passes data?.ownerExplorerData to AssetScreener

  AssetScreener → $derived converts tuples back to Maps via toMap() helper
```

### toMap() Helper
Handles the JSON serialization round-trip (Maps serialize as empty objects):
```javascript
function toMap(data) {
  if (!data) return new Map();
  if (data instanceof Map) return data;
  if (Array.isArray(data)) return new Map(data);  // [[key, value]] tuples
  return new Map(Object.entries(data));
}
```

---

## Build & Deploy

### Commands
```bash
npm run dev          # Dev server (localhost:3737)
npm run build        # Full build (~5 min build + prerender)
npm run deploy       # Build + upload to DO Spaces (~50 min total)
```

### Build Stats
- 13,472 asset pages
- 3,952 entity pages
- ~26 MB entity cache
- ~42 MB asset cache
- Upload time: ~50 minutes

### Deploy Process
1. `inject-version.js` - Stamps commit info into version.json
2. `generate-geojson.js` - Creates points.geojson from MotherDuck
3. Vite build - Compiles SSR + client bundles
4. Static adapter - Prerenders all pages using cached data
5. `deploy.js` - Syncs build/ to Digital Ocean Spaces via S3 API

---

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/component-data/use-fetch.svelte.ts` | SSR-aware data fetching helper (`useFetch()`) |
| `src/lib/components/AssetScreener.svelte` | Portfolio visualization (uses useFetch pattern) |
| `src/routes/entity/[id]/+page.server.js` | Entity cache + data prebaking |
| `src/routes/entity/[id]/+page.svelte` | Entity detail page + SSR cache context |
| `src/routes/report/+page.svelte` | Investigation cart, CSV exports, clear cart |
| `src/lib/ownership-theme.ts` | Colors, status grouping |
| `scripts/deploy.js` | S3 sync to DO Spaces |

---

## Recent Commits

- `c827d9b` Fix AssetScreener SSR: use $derived instead of $effect (Dec 16)
- `2110b34` Use $effect for prebaked data to fix hydration timing (Dec 16) - didn't work
- `f09b0ef` Add optional DuckDB geography extension hooks
- `74c0e54` Bump version to 0.1.13

---

## Known Issues

**Parquet Schema Limitation:** The `all_trackers_ownership@1.parquet` file doesn't have a "Country" column directly. To get country data, queries must JOIN with the locations parquet: `LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"` and use `l."Country.Area"`.

---

## Architecture Notes

### useFetch Pattern (New - Dec 17)
Components declare their data needs clearly:
```javascript
const { data, loading, error } = useFetch(() => fetchOwnerPortfolio(id), `portfolio:${id}`);
```

How it works:
1. During SSR/prerender: checks context cache (populated by +page.server.js)
2. During client: calls the fetcher function via onMount
3. Build-time caching layer can dedupe repeated fetches

Page setup (in +page.svelte):
```javascript
import { SSR_CACHE_KEY, buildSSRCache } from '$lib/component-data/use-fetch.svelte';
setContext(SSR_CACHE_KEY, buildSSRCache({
  [`portfolio:${data?.entityId}`]: data?.ownerExplorerData,
}));
```

### Prebaked Data Pattern (Legacy)
All visualization components follow this pattern for static builds:
1. Server fetches data at build time in `+page.server.js`
2. Data passed to page via `load()` return value
3. Page passes data to components via props (`prebakedPortfolio`, `prebakedData`)
4. Components use `$derived` to compute from props (NOT `$effect`)
5. Fallback: `onMount` fetches client-side if no prebaked data (dev mode)

### Why Not $effect for Prebaked Data?
- SSR renders HTML on server before any effects run
- Effects are deferred to client hydration
- Static builds need data in the initial HTML
- `$derived` evaluates immediately when props are available
