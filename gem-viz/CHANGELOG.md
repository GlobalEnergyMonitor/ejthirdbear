# Changelog

All notable changes to this project will be documented in this file.

## [0.3.2] - 2026-03-02

### Added

- **Asset Screener Chart** — new D3 ownership visualization ported from Observable notebook, showing subsidiary lanes with ownership % pie charts, tracker/status mini bar charts, circular asset clusters with status icons, and shared-asset bezier curves
- **Screener Visualize step** (`/screener/visualize`) now uses AssetScreenerChart instead of the 3D MiniNetworkGraph for a more structured, information-dense ownership view
- **Entity profile** (`/entity/[id]`) gains an "Ownership Structure" panel showing the full subsidiary → asset breakdown alongside the existing 3D network

### New files

- `src/lib/components/screener/AssetScreenerChart.svelte` — Svelte wrapper with loading/progress states
- `src/lib/components/screener/screener-chart-data.ts` — data adapter (ownership graph → chart layout)
- `src/lib/components/screener/screener-chart-render.ts` — imperative D3 rendering (~500 lines)

## [0.3.1] - 2026-03-02

### Changed

- **Screener asset class picker redesign** — replaced native `<select>` dropdown with a card-based tile grid grouped by category (Coal Plant, Gas, Steel & Iron, etc.). Each tile shows the class label, description, and multi-tracker badge. Selected tiles highlight with teal accent border.
- **Fill-width layout in AssetClassExpansion** — subclass/status checkbox rows now use CSS grid (`auto-fill`) to stretch across full panel width instead of huddling left. Continue buttons also span full width.

### Fixed

- **lucide-svelte SSR crash** — added `lucide-svelte` to Vite `ssr.noExternal` to work around broken ESM exports in v0.576.0 that caused `ERR_MODULE_NOT_FOUND` during server-side rendering.
- Layout shift on tile selection (default border-left now matches selected width so content doesn't jump).

## [0.2.1] - 2026-02-25

### Added

- **Compose page migrated to REST API** — no more DuckDB/parquet loading on compose, loads in ~0.5s instead of 3-5s
  - Multi-value server-side filters (multiple trackers, statuses, countries in one request)
  - Hybrid fast/slow path: simple filters hit API directly, owner/capacity filters use progressive fetch + client-side cache
  - Parametric faceted counts work correctly across all dimensions
  - Progress indicator for progressive fetch operations
- **Gembot database knowledge overhaul** — system prompt now includes exact asset counts, API slug mappings, field names, case-sensitivity rules, and data quirks
- **Gembot tool enhancements** — every tool got new pro-level parameters:
  - `search_entities`: `include_portfolio` flag to show portfolio size per result
  - `search_assets`: `statuses[]`/`countries[]` multi-value arrays, `include_facets` for inline stats
  - `get_entity_portfolio`: `include_assets` to show physical assets alongside subsidiaries
  - `get_entity_owners`: `include_ultimate` to trace to ultimate parent
  - `get_ownership_graph`: `direction: "both"` for full picture in one call
  - `get_asset_details`: `include_ownership_chain` to trace owner hierarchy
  - `get_top_owners`: `metric` param (assets vs capacity), capped at 2000 assets for speed
  - `get_top_owners_by_country`: `status` cross-filter
  - `get_country_breakdown`: `status` cross-filter
  - `get_status_breakdown`: `country` cross-filter
  - `get_owner_geographic_footprint`: `tracker` filter
  - `compare_entities`: `tracker` filter, now returns asset count and capacity
  - `find_common_owners`: `min_assets` threshold
  - `generate_map`: `query`/`tracker`/`country` search-based mapping (no IDs needed)

### Fixed

- **Red-team security fixes** in gembot tool executor:
  - Replaced hardcoded API URLs with env-configurable base
  - Added `fetchApiJson()` helper with proper HTTP error handling (no more crashes on non-JSON responses)
  - Added `clampLimit()` for all user-supplied limits (prevents negative/enormous values)
  - Capped `get_top_owners` pagination to 2000 assets (was unbounded, could take 90s)
  - Defensive null checks on `result.results` arrays
  - Type-safe status lowercasing and array coercion
- `capacity_value` field mapping in `normalizeAsset` (API returns `capacity_value` not `capacity`)
- Status case sensitivity: all status filters now lowercase (API is case-sensitive)

## [0.1.29] - 2026-02-02

### Added

- **OwnershipTreeGraph component** - New SVG-based ownership visualization ported from Observable notebook
  - Edge percentages hidden by default, shown on hover path only
  - Non-path nodes fade to 10% opacity on hover (matches Observable's `highlightNodes`)
  - `nodesToShowText` walks up ownership chain until split for label visibility
  - `placeOwnerLabels` with Rules 1a, 1b, 2, 3 for collision detection
  - Mint highlight stroke (#97E6DE) on hovered nodes
  - Smooth CSS transitions for opacity changes
- **Tracker availability warnings** - UI now shows warnings for trackers without MotherDuck aggregation data

### Fixed

- Screener preset filters now properly apply status and geography filters
- Enabled status filter clause in screener SQL queries (was commented out)
- Dynamic env imports for production builds (OPENROUTER_API_KEY, MOTHERDUCK_JWT)

## [0.1.28] - 2026-02-02

### Added

- Gembot AI assistant prototype
- MicroCards redesign with Tufte/Swiss design principles

### Fixed

- Changed "exposure to" to "ownership in" for clarity
- Removed investigation filter toggle from screener results
