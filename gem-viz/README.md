# GEM Viz

Interactive visualization platform for Global Energy Monitor data, powered by the GEM Ownership REST API.

## Features

- **Real-time Data Querying**: REST API for entity/asset data and ownership traversal
- **Interactive Maps**: MapLibre GL with shift-drag rectangle and polygon selection
- **Geographic Filtering**: Filter all visualizations by drawn map areas
- **Top Rankings**: Owners, projects, countries, and status breakdowns
- **Cross-Tabulation Tables**: Tracker types vs status analysis

## Routes (SvelteKit, file-based)

SvelteKit maps files under `src/routes` directly to URLs. Each folder is a path segment, and the files inside that folder define what renders and how data is loaded.

- `+page.svelte` - The UI for that route.
- `+page.js` / `+page.ts` - Optional data loader for the route (runs at build time for this static site).
- `+layout.svelte` - Shared layout for all nested routes.
- `[param]` folders - Dynamic route segments (e.g., `[id]` becomes a URL parameter).

Examples from this project:

- `/` → `src/routes/+page.svelte`
- `/asset` → `src/routes/asset/+page.svelte`
- `/asset/[id]` → `src/routes/asset/[id]/+page.svelte`
- `/asset/search` → `src/routes/asset/search/+page.svelte`
- `/entity/[id]` → `src/routes/entity/[id]/+page.svelte`
- `/explore` → `src/routes/explore/+page.svelte` (with data loading in `+page.ts`)

How the `+` files fit together:

- The `+` prefix is a SvelteKit convention that marks route-specific files (not arbitrary components).
- `+page.svelte` is the visual component. Think of it as the template for that URL.
- `+page.js`/`+page.ts` is the data hook. It can export a `load` function that fetches/prepares data for the page.
- When both exist, SvelteKit runs `load` first and passes the returned data into the `+page.svelte` component as `data`.
- Some routes only need a `+page.svelte` file. Others need a loader too, which is why you see both side-by-side.

If you are not familiar with SvelteKit, the key idea is: "the folder name is the URL, and `+page` files define what users see and what data is prepared for that page."

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
| ---------------- | -------------- | ------------------- |
| 10 Mbps (home)   | ~20-30 min     | ~2-5 min            |
| 25 Mbps (office) | ~10-15 min     | ~1-3 min            |
| 100 Mbps (fast)  | ~5-8 min       | ~30-60 sec          |

**Note**: Times include both bandwidth transfer (842 MB) and S3 API overhead (124k file operations). Incremental uploads only sync changed files using `aws s3 sync --delete`.

### Architecture Optimizations

- **Disk Cache**: 2.6 MB JSON cache persists across SvelteKit worker processes
- **Composite IDs**: Handles ownership tables with duplicate owner/unit IDs (e.g., `E100000000014_G100000106283`)
- **Serial Rendering**: concurrency: 1 prevents DB timeout issues
- **Skip 404s**: handleHttpError allows build to continue on missing assets

## Architecture

### Dynamic SSR

- **Adapter**: @sveltejs/adapter-node
- **SSR**: Server-side rendering with Fly.io
- **Data**: REST API for all runtime queries

### Geographic Filtering

- **Rectangle Selection**: Shift + drag on map
- **Polygon Selection**: Click polygon tool to draw custom shapes
- **Visual Feedback**: Selected points highlighted in blue (0.8 opacity), non-selected dimmed to gray (0.2 opacity)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) or visit `/changelog` in the app.

## Environment Variables

Create a `.env` file:

```bash
# Ownership Tracing API (primary runtime data source)
PUBLIC_OWNERSHIP_API_BASE_URL=https://gem-api.thirdbear.net

# Digital Ocean Spaces (for deployment)
DO_SPACES_BUCKET=ejthirdbear
DO_SPACES_REGION=sfo3
DO_SPACES_ENDPOINT=https://sfo3.digitaloceanspaces.com
```

## Tech Stack

- **Framework**: SvelteKit
- **Data**: GEM Ownership REST API
- **Maps**: MapLibre GL
- **Drawing**: maplibre-gl-draw
- **Styling**: Brutalist minimalism with Georgia serif
- **Build**: Vite
- **Deploy**: Fly.io (SSR), Digital Ocean Spaces (static assets)

## Design Philosophy

Academic brutalism with Georgia serif typography:

- No borders except where structurally necessary
- Black text on white background
- Underlined links with hover inversion
- Em-dash list bullets (-)
- Generous whitespace
- 48px headlines, 15px body text

---

(c) 2025 Global Energy Monitor
