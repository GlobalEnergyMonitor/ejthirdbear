# Development

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:3737
```

## Architecture

- **Framework**: SvelteKit 2 + Svelte 5 (runes)
- **Data**: GEM Ownership REST API (`https://gem-api.thirdbear.net`)
- **Maps**: MapLibre GL
- **Build**: Vite
- **Deploy**: Fly.io (SSR via adapter-node)

## Key Directories

```
src/
├── lib/
│   ├── components/        # UI components (organized by purpose)
│   │   ├── cards/         # ProjectCard, AssetMicroCard, EntityMicroCard
│   │   ├── cart/          # AddToCartButton, export-panel-utils
│   │   ├── charts/        # MiniBarChart, Sparkline, OwnershipPie, etc.
│   │   ├── compose/       # Compose page components
│   │   ├── data/          # Citation, DataSourceBadge, ApiCallLog
│   │   ├── feedback/      # Spinner, Skeleton, LoadingWrapper
│   │   ├── map/           # AssetMap, EntityMap, InvestigationMap
│   │   ├── nav/           # SiteNav, PageHeader, ScreenerLayout
│   │   ├── network/       # MiniNetworkGraph, OwnershipFlower
│   │   ├── ownership/     # Ownership tree/graph visualizations
│   │   ├── screener/      # Screener step components
│   │   ├── search/        # CommandPalette, AssetSearchBar
│   │   ├── table/         # DataTable, FacetedFilter, RangeSlider
│   │   └── tracker/       # TrackerIcon, TrackerFactsheet, StatusIcon
│   ├── data/              # Data barrel exports
│   ├── data-config/       # Asset class definitions, tracker config
│   ├── stores/            # Svelte stores (compose state, etc.)
│   ├── widgets/           # Dashboard widgets (TopOwners, CountryBreakdown)
│   ├── ownership-api.ts   # REST API client
│   ├── ownership-data.ts  # Ownership graph utilities
│   ├── asset-data.ts      # Asset fetching + G-prefix ID resolution
│   ├── design-tokens.ts   # Color scales, tracker colors
│   ├── links.ts           # Route helper functions
│   └── format-utils.ts    # Number/capacity formatting
├── routes/                # SvelteKit file-based routing
└── app.css                # Global styles + design tokens
```

## REST API

All data comes from `https://gem-api.thirdbear.net`. Key endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /assets` | List assets (filterable by type, status, country) |
| `GET /assets/{id}` | Asset details with owners |
| `GET /entities` | Search entities |
| `GET /entities/{id}` | Entity details |
| `GET /ownership/graph` | Ownership graph traversal |

API slug format: `coal-plant`, `oil-gas-plant`, `bioenergy-plant`, `gas-pipeline`, `cement-plant`, `oil-pipeline`, `iron-steel-plant`, `iron-ore-mine`.

Max 500 results per request. Use `?facets=true` for aggregated counts.

## Build

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

## Design System

- CSS custom properties in `src/app.css` and `src/lib/shared-styles.css`
- Utility classes in `src/lib/utilities.css`
- Design tokens: `--gem-navy`, `--color-*`, `--space-*`, `--font-size-*`
- Typography: Georgia serif headings, system sans body

## Svelte 5 Notes

- Uses runes: `$state`, `$derived`, `$effect`, `$props`
- Snippets replace slots (`{@render children()}`)
- `{@const}` must be inside `{#if}` / `{#each}` blocks, not `<div>`
- `$derived` works during SSR; `$effect` is client-only (like `onMount`)
