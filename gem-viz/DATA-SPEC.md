# GEM Viz Data Spec

Reference notes on what data we fetch, where it comes from, and the column shapes we assume in the UI.

## Data Stack

- **Primary data source:** GEM Ownership REST API (`src/lib/ownership-api.ts`).
- **Asset data:** `src/lib/asset-data.ts` fetches from API, resolves G-prefix IDs via `/api/resolve-id`.
- **Barrel export:** `src/lib/data/index.ts` re-exports from `ownership-api` + `asset-data`.

## Source Artifacts

- **REST API** (`https://gem-api.thirdbear.net`)
  - `/assets` - Asset listing with filters (asset_type, status, country, q)
  - `/assets/{id}` - Asset details with owners array
  - `/entities` - Entity listing/search
  - `/entities/{id}` - Entity details
  - `/entities/{id}/owners` - Direct owners with ownership %
  - `/ownership/graph` - Graph traversal (up/down with configurable depth)
  - `?facets=true` on `/assets` returns counts by type/status/country

- **Static GeoJSON**
  - `points.geojson` (generated from REST API via `generate-geojson.js`) with `metadata.columns` mapping `{ locationId, lat, lon, country, state, tracker }`; features carry those properties and point geometries. Consumed by `src/lib/SimpleMap.svelte`.

## API Asset Type Slugs

| Slug | Database Value | Approximate Count |
|------|---------------|-------------------|
| `coal-plant` | Coal Plant | 14,363 |
| `oil-gas-plant` | Oil & Gas Plant | 14,407 |
| `bioenergy-plant` | Bioenergy Plant | 4,537 |
| `gas-pipeline` | Natural Gas Transmission Pipeline | 4,246 |
| `cement-plant` | Cement or Concrete Plant | 3,515 |
| `oil-pipeline` | Oil or NGL Pipeline | 1,873 |
| `iron-steel-plant` | Iron & Steel Plant | 1,204 |
| `iron-ore-mine` | Iron Ore Mine | 949 |

## Data Fetching Flows

- **Entity pages**: `streamOwnerPortfolio` uses `/ownership/graph?root=ENTITY_ID&direction=down&max_depth=<uncapped>` (we pass `Number.MAX_SAFE_INTEGER`) which returns both entities and assets in one call. Asset nodes include `asset_type`, `operating_status`, `capacity_value`, `country`, `latitude`, `longitude`.
- **Asset pages**: `getAsset(id)` fetches from `/assets/{id}`, returns asset details with `owners[]` array (entity_id, name, ownership_share, hq_country).
- **Globe page**: Uses `points.geojson` (~9MB static) + REST API facets.
- **NetworkGraph**: Builds edges from paginated REST API asset data.
- **ExportPanel**: Fetches assets via REST API and formats CSV client-side.
- **Screener**: Fetches owner aggregation data from REST API with client-side filtering for multi-value status.

## ID Resolution

- Coal plant G-prefix IDs (e.g., `G100000102961`) are resolved server-side via `/api/resolve-id` endpoint, which uses `src/lib/server/id-map.json` to map to compound IDs (e.g., `L100000104107_G100000102961`).
- `resolveApiSlug()` in `ownership-api.ts` maps any identifier to an API slug.

## Caching & Filesystem Notes

- Asset/entity prerender caches live at `.svelte-kit/.asset-cache.json` and `.svelte-kit/.entity-cache.json` and are reused across build workers.
- Entity cache built from `getEntityGraphDown()` API calls.
- Query logs capped at 100 entries; G-prefix cache capped at 5000 entries.
