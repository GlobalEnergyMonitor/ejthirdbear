# Global Energy Monitor Visualization

Cross-tracker ownership visualization and geospatial analysis.

## Structure

- `gem-viz/` - SvelteKit static site generator
- `data-processing/` - Data pipeline scripts
- `docs/` - Technical documentation
- `Onwership_ConvertDataToParquet.R` - R data conversion

## Quick Start

```bash
cd gem-viz
npm install
npm run dev
```

Visit http://localhost:3737

## Build

```bash
npm run build    # ~2 minutes for US assets
npm run preview  # Preview production build
```

## Deploy

```bash
npm run deploy   # To Digital Ocean Spaces
```

See `docs/DEPLOY-CHECKLIST.md` for configuration.

## Data

- 156,004 ownership records
- 7 tracker types (coal, gas, steel, mines, etc.)
- MotherDuck integration for build-time queries

## Documentation

- `docs/MOTHERDUCK_QUICKSTART.md` - Database setup
- `docs/DEPLOY-CHECKLIST.md` - Deployment instructions
- `docs/RELATIONSHIP-INTEGRATION.md` - Ownership network implementation
- `docs/ASSET-PAGE-ENHANCEMENT.md` - Architecture details

## Current Status

Test deployment: https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/index.html

6,303 US assets currently built (207 MB). Full global build (62K+ assets) available.

## Technical Notes

Static site generation with zero runtime queries. All data pre-rendered at build time from MotherDuck. MapLibre GL for interactive maps. Relationship networks pre-computed during build.

Stack: SvelteKit, DuckDB/MotherDuck, MapLibre GL, Digital Ocean Spaces.
