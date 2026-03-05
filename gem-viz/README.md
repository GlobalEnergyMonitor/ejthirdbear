# GEM Viz

Interactive visualization platform for Global Energy Monitor data, powered by the GEM Ownership REST API.

## Features

- **Ownership Screener**: Filter and rank asset owners across 8 tracker types
- **Entity Explorer**: Ownership trees, portfolio flowers, network graphs
- **Interactive Maps**: MapLibre GL with geographic filtering
- **Compose**: Custom filtered views with charts and data export
- **Embeddable**: Any page works as an iframe via `?embed=true`

## Development

```bash
npm install
npm run dev
# Open http://localhost:3737
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for architecture details.

## Deploy

```bash
fly deploy
```

See [DEPLOY.md](./DEPLOY.md) for deployment configuration.

## Tech Stack

- **Framework**: SvelteKit 2 + Svelte 5
- **Data**: GEM Ownership REST API
- **Maps**: MapLibre GL
- **Styling**: Design tokens + utility classes
- **Build**: Vite
- **Deploy**: Fly.io (SSR)

## Routes

| Route | Description |
| --- | --- |
| `/` | Home — tracker overview with globe grid |
| `/screener` | Ownership screener (multi-step wizard) |
| `/compose` | Custom data views with filters and charts |
| `/entity/[id]` | Entity detail — portfolio, ownership tree, map |
| `/asset/[id]` | Asset detail — location, owners, status |
| `/tracker/[slug]` | Tracker factsheet |
| `/explore` | Browse trackers and entities |
| `/search` | Global asset search |
| `/downloads` | Bulk data export (CSV, GeoJSON, JSON) |
| `/embed/*` | Embeddable versions of key visualizations |

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

---

(c) 2025-2026 Global Energy Monitor
