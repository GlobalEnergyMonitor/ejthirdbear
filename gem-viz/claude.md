# GEM Viz Development Status

Last updated: 2025-12-12

## Current Status: Production Ready ✅

### Latest Deploy: v0.1.11 (Dec 12, 2025)

**Live URL:** https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/v0.1.11/index.html

### Changes This Session

**1. DO Spaces URL Fix**
- Changed `trailingSlash` to `'always'` → generates `/entity/E123/index.html`
- Updated `links.ts` to generate explicit `/index.html` URLs in production
- All internal links now work on static S3/Spaces hosting

**2. Owner Explorer Pre-baking**
- Removed dependency on MotherDuck WASM at runtime (requires COOP/COEP headers)
- Pre-baked all portfolio data at build time in `+page.server.js`
- Entity cache now includes full subsidiary/asset groupings (26.59 MB)
- Component uses pre-baked data in production, falls back to WASM in dev

**3. Map Color Coding by Type**
- Added tracker-based coloring to SimpleMap
- Coal Plant → Black, Coal Mine → Dark Gray, Gas Plant → Orange
- Steel Plant → Purple, Iron Mine → Red, Bioenergy → Green
- Added legend overlay in top-left corner

**4. Cleanup**
- Removed GitHub Pages workflow (`.github/workflows/deploy.yml`)
- Removed AWS S3 workflow (`.github/workflows/deploy-s3.yml`)
- Removed Cloudflare R2 script (`scripts/deploy-r2.sh`)
- Removed VPS deploy scripts and SSR config

### Recent Changes (Dec 12, 2025)
- Removed ~400 lines of dead hydration code from ownership visualization components
- Simplified `MermaidOwnership.svelte` and `OwnershipHierarchy.svelte` to props-only pattern
- Added smart redirects: `/entity/G...` → `/asset/G...` and `/asset/E...` → `/entity/E...`
- Fixed homepage links (was using `entityLink()` for asset IDs)
- Added `E100001000348` (BlackRock Inc) to homepage featured entities and spot-check

## Previous Status: URL Architecture ✅

### Major Change: GEM Unit ID URLs (Dec 10, 2025)

**The Problem:** Asset URLs were using composite IDs like `/asset/E100000000834_G100000109409/` (entity + unit). Users couldn't navigate to assets using the bare GEM unit IDs they had.

**The Solution:** URLs now use bare GEM unit IDs: `/asset/G100001057899/`

**What Changed:**
- `+page.server.js`: Groups ownership rows by GEM unit ID instead of composite IDs
- `+page.svelte`: Displays all owners in a table per asset page
- Search page: Returns GEM unit IDs, not composite IDs

**Impact:**
- Pages reduced from 62,366 → ~13,472 (one page per unique asset)
- Average 4.6 ownership records per asset now shown as table
- URLs match Stephen's example IDs: `G100000109409`, `G100001057899`, etc.

---

## Previous Status

Successfully built 62,366 static asset pages from MotherDuck data (now rebuilding with new URL structure).

## Recent Accomplishments

### Codebase Cleanup (Nov 22, 2025)
Removed zombie code and outdated documentation:
- Deleted unused lib files (query-helpers.js, svg-generator.js, motherduck-query.ts)
- Removed old interactive query route (src/routes/asset/query/)
- Removed unused API endpoint (src/routes/api/query/)
- Removed changelog route dependent on outdated docs
- Deleted outdated markdown files (CHANGELOG.md, DEPLOYMENT.md, MOTHERDUCK_INTEGRATION.md)
- Cleaned up commented imports

Result: Cleaner codebase focused on current static site generation architecture.

### Bulk Fetch Architecture (Nov 22, 2025)
**Problem:** MotherDuck was timing out after 10 minutes when building 62k+ pages
**Solution:** Single upfront bulk query loads ALL data into memory before rendering

**Implementation:**
- `entries()` function fetches all 65,341 rows in 3.5s
- Writes 2.6MB JSON cache to disk (`build/.asset-cache.json`)
- Closes DB connection immediately
- `load()` function reads from cache instead of querying DB
- Composite IDs handle ownership tables: `E100000000014_G100000106283`

**Results:**
- Build time: ~20 minutes (serial rendering, concurrency: 1)
- Zero database timeout issues
- 62,366 pages successfully generated
- Total size: 842 MB (124,769 files)

### Asset Location Maps (Nov 22, 2025)
Added interactive MapLibre maps to every asset detail page.

**Implementation:**
- Client-side component loads `points.geojson` (5.6 MB, 14k points)
- Finds matching asset by GEM unit ID
- Shows 400px map with marker and popup
- Uses Carto Positron basemap (brutalist-friendly)
- Graceful degradation if coordinates not found

**Files:**
- `src/lib/components/AssetMap.svelte` - MapLibre component
- `src/routes/asset/[id]/+page.svelte` - Updated to include map

### Performance Documentation (Nov 22, 2025)
Added comprehensive metrics to README:
- Build stats (62k pages, 842 MB, ~20 min)
- Deployment time estimates for different connection speeds
- Architecture optimizations explained
- Deployment ready via `just deploy`

## Deployment Path

### Digital Ocean Spaces

Deploy via `just deploy` - uses S3-compatible API:

```bash
# Configure AWS CLI (one-time setup)
aws configure --profile do-tor1

# Deploy (builds + uploads)
just deploy
```

Expected upload times:
- 10 Mbps: ~20-30 min initial, ~2-5 min incremental
- 25 Mbps: ~10-15 min initial, ~1-3 min incremental
- 100 Mbps: ~5-8 min initial, ~30-60 sec incremental

## Technical Architecture

### Build Process
1. `scripts/generate-geojson.js` - Creates points.geojson from MotherDuck
2. `entries()` in +page.server.js - Bulk fetch all assets, write cache
3. SvelteKit prerenders 62k pages using cache
4. Output: `build/` directory with 124k static files

### Data Flow
- **Database**: MotherDuck (cloud DuckDB)
- **Build Time**: Single bulk query (3.5s)
- **Runtime**: Zero DB queries, all data pre-baked into HTML
- **Maps**: Client-side GeoJSON lookup

### Key Files
- `src/routes/asset/[id]/+page.server.js` - Bulk fetch & cache logic
- `src/routes/asset/[id]/+page.svelte` - Asset detail page
- `src/lib/components/AssetMap.svelte` - Location map component
- `svelte.config.js` - Serial rendering, error handling
- `scripts/deploy.js` - S3 sync to Digital Ocean Spaces

## Next Steps

- [ ] Set up automated rebuilds (GitHub Actions)
- [ ] Explore parquet loading for client-side filtering
- [ ] Add more visualization types (capacity gauges, status badges)

## Known Issues

None currently! Build is stable and performant.

## Commands

```bash
# Development
npm run dev              # Start dev server (localhost:3737)

# Building
npm run build            # Full build (~20 min)
npm run build:log        # Build with detailed logging

# Preview
npm run preview          # Preview production build locally

# Deployment
just deploy              # Digital Ocean Spaces
```

## Commit History

- `96ead47` Remove zombie code and outdated documentation (Nov 22, 2025)
- `e3d64a8` Add bulk fetch architecture and asset location maps (Nov 22, 2025)
- `9e715bb` Add automated GEM data processing pipeline
- `ebb2d1c` Add directory-based URLs and server-side D3 SVG generation
- `0f17022` Fix browser rendering and implement static GeoJSON generation
