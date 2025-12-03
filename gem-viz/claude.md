# GEM Viz Development Status

Last updated: 2025-11-25

## Current Status: Production Ready ✅

Successfully building 62,366 static asset pages from MotherDuck data.

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

### Cloudflare Pages (Recommended - Nov 25, 2025)

**Why not R2?** R2 is just object storage - it doesn't serve static websites. You'd need a Worker to handle routing, which defeats the purpose of pure static hosting.

**Cloudflare Pages** is the right tool: pure static hosting, automatic CDN, no Workers needed.

```bash
# 1. Build the site (~20 min)
npm run build

# 2. Deploy to Cloudflare Pages
npx wrangler pages deploy build --project-name=gem-viz
```

First deployment prompts for Cloudflare login and project creation. After that it's automatic.

**Base path consideration:** Currently `svelte.config.js` has `base: '/gem-viz'`
- Keep it → site at `gem-viz.pages.dev/gem-viz/`
- Remove it → site at `gem-viz.pages.dev/` (cleaner)

**TODO:** Add `deploy-pages` command to justfile once deployment is tested.

### Digital Ocean Spaces (Legacy)

Still available via `just deploy` - uses S3-compatible API:

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

- [ ] **Deploy to Cloudflare Pages** - test `npx wrangler pages deploy build`
- [ ] Decide on base path (keep `/gem-viz` or deploy to root)
- [ ] Add `deploy-pages` command to justfile
- [ ] Set up automated rebuilds (GitHub Actions → Pages)
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
npx wrangler pages deploy build --project-name=gem-viz  # Cloudflare Pages
just deploy              # Digital Ocean Spaces (legacy)
```

## Commit History

- `96ead47` Remove zombie code and outdated documentation (Nov 22, 2025)
- `e3d64a8` Add bulk fetch architecture and asset location maps (Nov 22, 2025)
- `9e715bb` Add automated GEM data processing pipeline
- `ebb2d1c` Add directory-based URLs and server-side D3 SVG generation
- `0f17022` Fix browser rendering and implement static GeoJSON generation
