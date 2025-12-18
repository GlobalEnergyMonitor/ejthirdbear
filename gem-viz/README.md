# GEM Viz

Interactive visualization platform for Global Energy Monitor data, powered by MotherDuck and DuckDB WASM.

## Features

- **Real-time Data Querying**: Direct browser access to MotherDuck cloud database
- **Interactive Maps**: MapLibre GL with shift-drag rectangle and polygon selection
- **Geographic Filtering**: Filter all visualizations by drawn map areas
- **Dual Database Mode**: Toggle between MotherDuck cloud and local DuckDB
- **Top Rankings**: Owners, projects, countries, and status breakdowns
- **Cross-Tabulation Tables**: Tracker types vs status analysis

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open http://localhost:3737
```

## Building & Deployment

### Static Build

```bash
# Build static site
npm run build

# Preview build locally
npm run preview
```

### Release Process

Create a new release with semantic versioning:

```bash
# Patch release (0.1.0 -> 0.1.1)
npm run release -- patch

# Minor release (0.1.0 -> 0.2.0)
npm run release -- minor

# Major release (0.1.0 -> 1.0.0)
npm run release -- major
```

This will:
1. Bump version in package.json
2. Update version in layout
3. Update CHANGELOG.md with release date
4. Create git commit and tag
5. Prompt you to push

### Deploy to Digital Ocean Spaces

```bash
# Build and deploy in one command
npm run deploy

# Or manually
npm run build
node scripts/deploy.js
```

**Requirements:**
- AWS CLI configured with Digital Ocean Spaces credentials
- Profile named `do-tor1` with access to bucket

**Configuration:**
```bash
# Set up AWS CLI for Digital Ocean Spaces
aws configure --profile do-tor1
# Access Key ID: [Your DO Spaces key]
# Secret Access Key: [Your DO Spaces secret]
# Default region name: sfo3
# Default output format: json
```

## Performance & Scale

### Build Metrics
- **Asset Pages**: 62,366 pages (from 65,341 database rows with composite IDs)
- **Total Files**: 124,769 files (HTML, CSS, JS, assets)
- **Build Size**: 842 MB
- **Build Time**: ~20 minutes (serial rendering at concurrency: 1)
- **Database Fetch**: Single 3.5s bulk query (all data loaded to memory, DB closed)

### Deployment Metrics
Upload times to Digital Ocean Spaces (via `just deploy`):

| Connection Speed | Initial Upload | Incremental Updates |
|------------------|----------------|---------------------|
| 10 Mbps (home)   | ~20-30 min     | ~2-5 min            |
| 25 Mbps (office) | ~10-15 min     | ~1-3 min            |
| 100 Mbps (fast)  | ~5-8 min       | ~30-60 sec          |

**Note**: Times include both bandwidth transfer (842 MB) and S3 API overhead (124k file operations). Incremental uploads only sync changed files using `aws s3 sync --delete`.

### Architecture Optimizations
- **Bulk Fetch Strategy**: Single MotherDuck query loads all 65k rows into memory
- **Disk Cache**: 2.6 MB JSON cache persists across SvelteKit worker processes
- **Composite IDs**: Handles ownership tables with duplicate owner/unit IDs (e.g., `E100000000014_G100000106283`)
- **Serial Rendering**: concurrency: 1 prevents DB timeout issues
- **Skip 404s**: handleHttpError allows build to continue on missing assets

## Architecture

### Static Generation
- **Adapter**: @sveltejs/adapter-static
- **SSR**: Disabled (required for WASM)
- **Prerendering**: Enabled for all routes

### Database Strategy
- **Development**: MotherDuck WASM for live queries
- **Production**: Static builds with data snapshot at build time
- **Future**: Client-side parquet loading for offline filtering

### Geographic Filtering
- **Rectangle Selection**: Shift + drag on map
- **Polygon Selection**: Click polygon tool to draw custom shapes
- **SQL Filtering**: Bounding box queries with optional point-in-polygon refinement
- **Visual Feedback**: Selected points highlighted in blue (0.8 opacity), non-selected dimmed to gray (0.2 opacity)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) or visit `/changelog` in the app.

## Environment Variables

Create a `.env` file:

```bash
# Ownership Tracing API (primary runtime data source)
PUBLIC_OWNERSHIP_API_BASE_URL=https://6b7c36096b12.ngrok.app

# Digital Ocean Spaces (for deployment)
DO_SPACES_BUCKET=ejthirdbear
DO_SPACES_REGION=sfo3
DO_SPACES_ENDPOINT=https://sfo3.digitaloceanspaces.com
```

## Tech Stack

- **Framework**: SvelteKit
- **Database**: DuckDB WASM, Ownership Tracing API
- **Maps**: MapLibre GL
- **Drawing**: maplibre-gl-draw
- **Styling**: Brutalist minimalism with Georgia serif
- **Build**: Vite
- **Deploy**: Digital Ocean Spaces (S3-compatible)

## Design Philosophy

Academic brutalism with Georgia serif typography:
- No borders except where structurally necessary
- Black text on white background
- Underlined links with hover inversion
- Em-dash list bullets (—)
- Generous whitespace
- 48px headlines, 15px body text

---

© 2025 Global Energy Monitor
