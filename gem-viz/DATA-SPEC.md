# GEM Viz Data Spec

Reference notes on what data we fetch, where it comes from, and the column shapes we assume in the UI and prerenderers.

## Data Stack
- **Primary DB:** MotherDuck `gem_data` (server-side via `src/lib/motherduck-node.ts`, client-side via `src/lib/motherduck-wasm.ts`).
- **Local engine:** DuckDB WASM (`src/lib/duckdb-utils.ts`) for client queries against static Parquet/GeoJSON assets.
- **Routing helper:** `src/lib/db.ts` swaps between the two for shared query helpers.

## Source Artifacts
- **MotherDuck tables (duckdb extension)**  
  - **`catalog`** (schema discovery) expected columns: `original_filename`, `original_tabname`, `db_name`, `schema_name`, `table_name`, `row_count`, `column_count`, `loaded_at` (`src/lib/schemas.ts` `CatalogSchema`).  
  - Asset/ownership tables are auto-detected by picking the largest non-metadata table (`src/routes/asset/+page.server.js`, `src/routes/asset/[id]/+page.server.js`, `src/routes/entity/[id]/+page.server.js`).
- **Static Parquet** (served under the app base path)
  - `all_trackers_ownership@1.parquet`  
    - Used for ownership traversal, exports, network graph, asset search fallback.  
    - Columns relied on across code:  
      - Asset IDs: `"GEM unit ID"`, `"Asset ID"`, `"ProjectID"`  
      - Ownership IDs: `"Owner GEM Entity ID"`, `"Immediate Owner Entity ID"`, `"Interested Party ID"`, `"Subject Entity ID"`  
      - Names: `"Owner"`, `"Unit"`, `"Project"`, `"Subject Entity Name"`, `"Immediate Project Owner"`  
      - Shares/metadata: `"% Share of Ownership"`, `"Share"`, `"Share Imputed?"`, `"Ownership Path"`  
      - Classification: `"Tracker"`, `"Status"`, `"Country"`, `"Country/Area"`  
      - Capacity fields (per tracker mappings in `src/lib/ownership-data.ts`): `"Capacity (MW)"`, `"Capacity (Mtpa)"`, `"Production 2023 (ttpa)"`, `"CapacityBcm/y"`, `"CapacityBOEd"`, `"Nominal crude steel capacity (ttpa)"`, `"Cement Capacity (millions metric tonnes per annum)"`  
      - Location join keys: `"GEM location ID"`
  - `asset_locations.parquet`  
    - Used for map/search/export location joins.  
    - Columns referenced: `"GEM.location.ID"` (or `"GEM location ID"`), `"Latitude"`, `"Longitude"`, `"Country.Area"`, `"State.Province"`.
  - `tiles/*.parquet` + `tiles/manifest.json` (spatial tiles built at deploy time)  
    - Manifest shape (`src/lib/tileLoader.ts`): `version`, `generated`, `tileSize`, `totalAssets`, `totalRows`, `tiles[]` where each tile has `{ name, file, bounds{minLat,maxLat,minLon,maxLon}, tileBounds{minLat,maxLat,minLon,maxLon}, assetCount, rowCount, sizeMB }`.  
    - Tile tables are named from the file (hyphens -> underscores) and store location-level rows with at least `id`, `tracker`, `country`, `state`, `"Latitude"`, `"Longitude"` (queried in `src/routes/asset/search/+page.svelte`).
- **Static GeoJSON**  
  - `points.geojson` (generated from `asset_locations.parquet`) with `metadata.columns` mapping `{ locationId, lat, lon, country, state, tracker }`; features carry those properties and point geometries. Consumed by `src/lib/SimpleMap.svelte`.

## Schemas & Type Expectations
- **Zod schemas (`src/lib/schemas.ts`):**  
  - `CatalogSchema` as above.  
  - `BaseAssetSchema` optional fields covering IDs (`"GEM unit id"`, `"GEM location id"`, `"Wiki page"`), names (`Project`, `Plant`, `Mine`, `Unit`), location (`Country`, `Region`, `Latitude`, `Longitude`), ownership (`Owner`, `Parent`), status/type (`Status`, `Tracker`), capacity (`"Capacity (MW)"`, `"Capacity (Mt)"`).  
  - Extensions: `CoalPlantSchema` (adds required `Plant`, optional `"Combustion technology"`, `"Heat rate (Btu per kWh)"`); `CoalMineSchema` (adds required `Mine`, optional `"Mine type"`).  
  - Helpers: `parseTableData()` (partial validation) and `inferTableSchema()` (first-row inference).
- **Ownership helper mappings (`src/lib/ownership-data.ts`):**  
  - `idFields` map tracker → ID column (e.g., `Coal Plant` → `"GEM unit ID"`, `Coal Mine` → `"GEM Mine ID"`, `Steel Plant` → `"Steel Plant ID"`).  
  - `capacityFields` map tracker → numeric capacity column.
- **Tile manifest interfaces:** `TileManifest`, `TileInfo`, `MapBounds` in `src/lib/tileLoader.ts`.
- **Query result shapes:** `QueryResult` in `src/lib/db.ts` / `src/lib/duckdb-utils.ts` adds `{ data?: T[], executionTime?, success, error?, rowCount? }`; MotherDuck WASM uses similar `MotherDuckQueryResult`.

## Data Fetching Flows
- **Server prerender (MotherDuck Node)**  
  - **Asset list** (`src/routes/asset/+page.server.js`): pick largest catalog table (non-`about`/`metadata`), detect columns (country, owner, owner/entity IDs, name/status), fetch up to 10k rows for list, return column names for client rendering.  
  - **Asset detail** (`src/routes/asset/[id]/+page.server.js`): bulk fetch *all* rows from the chosen table, group by `"GEM unit ID"` (fallback to first ID-like column), cache to `.svelte-kit/.asset-cache.json`; prerender entries are unique asset IDs.  
  - **Entity detail** (`src/routes/entity/[id]/+page.server.js`): bulk aggregate over the same table, grouping by `"Owner GEM Entity ID"` and `"Parent"`; derives counts, capacity sums, tracker lists, sample assets (`ROW_NUMBER` window), and full portfolios (direct vs subsidiary ownership) for Owner Explorer; cached to `.svelte-kit/.entity-cache.json`.
- **Client-side DuckDB WASM**
  - **Map** (`src/lib/SimpleMap.svelte`): fetches `points.geojson` only; uses `metadata.columns.lat/lon` to style selection; no live DB access.  
  - **Spatial search** (`src/routes/asset/search/+page.svelte`): prefers tile pipeline (`loadManifest` → `findTilesForBounds` → `loadTiles` → UNION query with spatial WHERE); falls back to loading full `all_trackers_ownership@1.parquet` + `asset_locations.parquet` and joins on `"GEM location ID"` when no bounds or tile load fails; polygon filters re-checked client-side.  
  - **Network graph** (`src/lib/NetworkGraph.svelte`): loads `all_trackers_ownership@1.parquet` into DuckDB, counts edges, then samples edges (top/random/all) using `"GEM unit ID"` → `"Owner GEM Entity ID"` relationships; expects columns `Project`, `Owner`, `Share`.  
  - **Ownership utilities** (`src/lib/ownership-data.ts`):  
    - `getAssetOwners(assetId)`: loads ownership parquet, filters by asset IDs (`"GEM unit ID"` | `"Asset ID"` | `"ProjectID"`), walks upstream via recursive CTE on `"Interested Party ID"`/`"Subject Entity ID"`, produces edges/nodes.  
    - `getSpotlightOwnerData(entityId)`: finds subsidiaries (`"Interested Party ID"` → `"Subject Entity ID"`), then assets per subsidiary and direct holdings (`"Owner GEM Entity ID"`), assembling `matchedEdges`, `subsidiariesMatched`, `directlyOwned`.  
    - `getTopOwners(limit)`: grouped counts over `"Owner GEM Entity ID"` and `"GEM unit ID"`.  
  - **Export** (`src/routes/export/+page.svelte`): ensures both Parquet files loaded, then exports full ownership rows joined to locations for selected IDs (IN clause against `"GEM location ID"`), includes lat/lon and location country/state.
- **Link helpers** (`src/lib/links.ts`): `assetPath()` prepends `$app/paths` `base` for static assets so paths above resolve in dev/prod.

## Caching & Filesystem Notes
- Asset/entity prerender caches live at `.svelte-kit/.asset-cache.json` and `.svelte-kit/.entity-cache.json` and are reused across build workers.  
- Tile loading keeps an in-memory `loadedTiles` set (`src/lib/tileLoader.ts`) to avoid re-fetching.  
- DuckDB query helpers coerce `bigint` → `number` for JSON serialization in WASM (`src/lib/duckdb-utils.ts`).
