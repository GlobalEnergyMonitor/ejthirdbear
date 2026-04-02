# GEM Viz — Claude Code Reference

## Project Overview
SvelteKit (Svelte 5) app for Global Energy Monitor data visualization. Deployed on Fly.io.
- **Prod:** https://gem-viz.fly.dev — `fly deploy --config fly.toml`
- **Staging:** https://gem-viz-staging.fly.dev — `fly deploy --config fly.staging.toml`

**ALWAYS confirm before deploying to production.** Default to staging. Prod freeze was active week of 2026-03-23 — check if still active before deploying prod.

---

## Key Commands
```bash
npm run dev              # start dev server
npm run build            # inject-version + generate-geojson + vite build
npm run lint             # eslint .
npm run lint:fix         # eslint . --fix
npm run format           # prettier --write src/**
npm run type-check       # svelte-check
npm run check            # lint + format + type-check
npm run test             # vitest run
npm run build:widgets    # compile src/widgets/ → static/widgets/
```

---

## Architecture

### Data Source
All data from REST API at `https://gem-api.thirdbear.net`. **No DuckDB, no MotherDuck, no parquet files.**
- Main API module: `src/lib/ownership-api.ts` (47+ importers — don't move)
- Asset fetching: `src/lib/asset-data.ts`
- Barrel re-export: `src/lib/data/index.ts`

### lib/ Layout
```
src/lib/
  ownership-api.ts       # main REST API client (do not move)
  asset-data.ts          # asset fetching + G-prefix ID resolution
  ownership-data.ts      # entity portfolio streaming
  design-tokens.ts       # barrel re-export → src/lib/tokens/
  tokens/                # colors.ts, typography.ts, spacing.ts, color-utils.ts
  api/                   # compose-api.ts, catalog-api.ts, segments-api.ts + index.ts
  utils/                 # animations.ts, format.js, geo-utils.ts, slug.ts + index.ts
  components/            # all Svelte components
  component-data/        # static data / config for components
  data/                  # index.ts barrel only
  shims/                 # child_process.js — Vite alias stub for @loaders.gl/worker-utils (DO NOT DELETE)
```

### Embed Systems (Two distinct systems)
1. **iframe embeds** — `src/routes/embed/*` — 12+ routes, all `ssr=false, prerender=false`
   - `EmbedShell.svelte` handles theme, padding, autoHeight, branding, postMessage
   - Hash-based URL state (Drupal safe): `readHash()` / `writeHash()` in `embed-utils.ts`
   - `hooks.server.ts` skips COEP/COOP headers for `/embed/` routes

2. **Shadow DOM widgets** — `src/widgets/` → built to `static/widgets/`
   - Entry: `src/widgets/index.ts` — `configure()`, `mountWidget()`, `parseSrc()`
   - API: `src/widgets/widget-api.ts` (imports `buildQuery` from `$lib/ownership-api`)
   - Build: `npm run build:widgets` (separate Vite entry point)
   - `static/embed.js` selects mode: `data-mode="dynamic"` → widgets, default → iframe

### Tracker Card System
- `src/lib/tracker-card-registry.ts` maps facilityType → card component + data fetcher
- `TrackerCard.svelte` wrapper auto-loads on `/asset/[id]`
- Currently implemented: Coal Plant (`CoalPlantCard` + `/locations/` API)

---

## API Reference

### Key Endpoints
- `GET /assets?asset_type=coal-plant&format=json` — asset list (max 500/page)
- `GET /assets/{id}` — single asset with `owners[]` array
- `GET /entities/{id}` — entity details
- `GET /ownership/graph?root=ENTITY_ID&direction=down&max_depth=5` — full tree (entities + assets)
- `GET /assets?facets=true` — counts by type/status/country

### Asset Type Slugs
| Slug | Name | Count |
|------|------|-------|
| coal-plant | Coal Plant | ~14k |
| oil-gas-plant | Oil & Gas Plant | ~14k |
| bioenergy-plant | Bioenergy Plant | ~4.5k |
| gas-pipeline | Natural Gas Transmission Pipeline | ~4.2k |
| cement-plant | Cement or Concrete Plant | ~3.5k |
| oil-pipeline | Oil or NGL Pipeline | ~1.9k |
| iron-steel-plant | Iron & Steel Plant | ~1.2k |
| iron-ore-mine | Iron Ore Mine | ~950 |

### Known API Limitations
- Multi-value status filters don't work (client-side filter instead)
- `/entities/{id}/owned` returns entities, NOT assets — don't use for asset fetching
- `startYear` filter wired but API returns null
- No batch `/assets?ids=X,Y,Z` endpoint yet (N+1 still present in report/export)
- No server-side `/screener/owners` aggregation yet

---

## Svelte 5 Patterns
- Runes: `$state`, `$derived`, `$effect`, `$props`, `$bindable`
- `{@const}` must be inside control flow blocks, NOT bare inside `<div>`
- Embed routes: use `$state` for params + `onMount` to read hash → never `$derived` for URL-sourced values
- No `state_unsafe_mutation`: don't write `$state` inside `$derived.by()`

---

## ESLint Config
Flat config (`eslint.config.js`) — key rules per glob:
- `src/widgets/**/*.ts` — `globals.browser`, `no-undef: off` (TypeScript handles DOM types)
- `src/**/*.svelte.ts` — Svelte 5 rune globals declared
- `static/embed.js` — `globals.browser`
- Unused vars: warn with `^_` prefix escape hatch

---

## Git Notes
- `cd` is aliased to zoxide — use `git -C /path/to/repo` or absolute paths
- Glob patterns with brackets need quoting: `"gem-viz/src/routes/tracker/[slug]/+page.svelte"`
- `.gitignore` has `/data/` (root only) — `src/lib/data/` is NOT ignored

---

## Asana
Work tracked in "Data Interfaces" Asana project. Key active areas:
- Screener / Asset Classes (filter bugs, layout, owner search)
- Project Cards (coal mines + plants, embeds, mobile)
- Asset Ownership Tree (enhancements, mobile)
- Downloads widget
- Tracker Metadata / FieldGuide
