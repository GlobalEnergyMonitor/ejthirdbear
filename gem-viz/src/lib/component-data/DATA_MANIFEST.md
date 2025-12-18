# GEM Viz Component Data Manifest

This document defines the data contracts for visualization components.
Backend developers can provide data in any format/source as long as the final shape matches these interfaces.

**Reference implementations:** Queries ported from Observable notebooks in `$lib/ownership-data.ts`

---

## Primary Data Source

### Ownership Parquet File
**File:** `all_trackers_ownership@1.parquet`

**Key columns:**
- `GEM unit ID` / `Asset ID` / `ProjectID` - Asset identifiers
- `Owner GEM Entity ID` - Immediate owner entity ID
- `Interested Party ID` - Parent entity in ownership edge
- `Subject Entity ID` - Child entity in ownership edge
- `% Share of Ownership` - Ownership percentage (0-100)
- `Ownership Path` - Full path string (e.g., "Parent [50%] -> Child [75%] -> Asset")
- `Owner` - Owner name (display)
- `Unit` / `Project` - Asset name
- `Status` - Operating, Retired, Construction, etc.
- `Tracker` - GCPT, GGIT, GCMT, etc.
- `Country` - Country name

---

## Core Query Patterns (from Observable notebooks)

### 1. Get Immediate Owners of an Asset
*From notebook: bdcdb445752833fa*

```sql
SELECT * FROM ownership
WHERE "GEM unit ID" = '{assetId}'
   OR "Asset ID" = '{assetId}'
   OR "ProjectID" = '{assetId}'
```

### 2. Recursive Upstream Traversal (Asset -> Ultimate Parent)
*From notebook: bdcdb445752833fa*

```sql
WITH RECURSIVE edges AS (
  SELECT
    o."Interested Party ID" AS parent,
    o."Subject Entity ID" AS child,
    LIST_VALUE(o."Subject Entity ID") AS visited,
    1 AS depth
  FROM ownership o
  WHERE o."Subject Entity ID" IN ({immediateOwnerIds})

  UNION ALL

  SELECT
    o."Interested Party ID" AS parent,
    o."Subject Entity ID" AS child,
    LIST_APPEND(e.visited, o."Subject Entity ID") AS visited,
    e.depth + 1 AS depth
  FROM ownership o
  JOIN edges e ON o."Subject Entity ID" = e.parent
  WHERE NOT (o."Subject Entity ID" = ANY(e.visited))
)
SELECT DISTINCT e.parent as parent_id, e.child as child_id, e.depth
FROM edges e
```

### 3. Get Subsidiaries of an Entity (Spotlight Owner)
*From notebook: 32dcab6db3a0f0b6*

```sql
SELECT DISTINCT
  "Subject Entity ID" as subsidiary_id,
  "Subject Entity Name" as subsidiary_name,
  "% Share of Ownership" as share
FROM ownership
WHERE "Interested Party ID" = '{entityId}'
  AND "Subject Entity ID" IS NOT NULL
```

### 4. Get Assets Owned by Subsidiaries
*From notebook: 32dcab6db3a0f0b6*

```sql
SELECT
  "GEM unit ID" as id,
  "Unit" as name,
  "Project" as project,
  "Status" as Status,
  "Tracker" as tracker,
  "Country" as country,
  "Owner GEM Entity ID" as owner_id,
  "Owner" as owner_name,
  "% Share of Ownership" as share
FROM ownership
WHERE "Owner GEM Entity ID" IN ({subsidiaryIds})
  AND "GEM unit ID" IS NOT NULL
```

### 5. Top Owners by Asset Count

```sql
SELECT
  "Owner GEM Entity ID" as id,
  "Owner" as name,
  COUNT(DISTINCT "GEM unit ID") as asset_count,
  COUNT(*) as ownership_count
FROM ownership
WHERE "Owner GEM Entity ID" IS NOT NULL
  AND "GEM unit ID" IS NOT NULL
GROUP BY "Owner GEM Entity ID", "Owner"
ORDER BY asset_count DESC
LIMIT {limit}
```

---

## Component Data Contracts

### AssetMap
**Purpose:** Display single asset location on map

```typescript
interface AssetMapData {
  assetId: string;        // GEM unit ID
  name: string;           // Display name
  lat: number | null;     // Latitude
  lon: number | null;     // Longitude
  locationId?: string;    // For coordinate lookup fallback
}
```

---

### OwnershipHierarchy / MermaidOwnership
**Purpose:** Visualize ownership path from ultimate parent to asset

**Data source:** `Ownership Path` column parsed by `parseOwnershipPaths()` in `$lib/component-data/ownership-parser.ts`

```typescript
interface OwnershipPathData {
  assetId: string;
  assetName: string;
  edges: Array<{
    source: string;       // Sanitized entity ID
    target: string;       // Sanitized entity/asset ID
    value: number | null; // Ownership percentage
    depth: number;        // Distance from asset (0 = direct owner)
  }>;
  nodes: Array<{
    id: string;
    Name: string;
  }>;
}
```

**Ownership Path format:** `"Parent [50%] -> Subsidiary [75%] -> Asset [100%]"`

---

### AssetScreener / OwnershipChart / OwnershipExplorer
**Purpose:** Display all assets owned by an entity through subsidiaries

**Reference:** `getSpotlightOwnerData()` in `$lib/ownership-data.ts`

```typescript
interface SpotlightOwnerData {
  spotlightOwner: { id: string; Name: string };
  subsidiariesMatched: Map<string, Asset[]>;  // Subsidiary ID -> Assets
  directlyOwned: Asset[];
  assets: Asset[];                             // All assets flat
  entityMap: Map<string, { id: string; Name: string }>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;                      // e.g., "Coal Plant"
}

interface Asset {
  id: string;           // GEM unit ID
  name: string;         // Unit/Project name
  project?: string;     // Project name
  Status: string;       // Operating, Retired, etc.
  tracker?: string;     // GCPT, GGIT, etc.
  country?: string;
  owner_id?: string;
  share?: number;       // Ownership percentage
}
```

---

### RelationshipNetwork
**Purpose:** Show ownership chain, same-owner assets, co-located assets

**Reference:** `getAssetOwners()` in `$lib/ownership-data.ts`

```typescript
interface AssetOwnersData {
  assetId: string;
  assetName: string;
  edges: Array<{
    source: string;
    target: string;
    value: number | null;
    type: 'intermediateEdge' | 'leafEdge';
    refUrl: string | null;
    imputedShare: boolean;
    depth: number;
  }>;
  nodes: Array<{
    id: string;
    Name: string;
    type: 'entity' | 'asset';
  }>;
  immediateOwners: unknown[];
  parentOwners: unknown[];
  allEntityIds: string[];
}
```

---

### NetworkGraph
**Purpose:** Force-directed graph of all ownership relationships

**Source:** `all_trackers_ownership@1.parquet` loaded via DuckDB WASM

```typescript
interface NetworkGraphData {
  edges: Array<{
    "Owner Entity ID": string;
    "GEM unit ID": string;
    "Share (%)": number | null;
    Owner?: string;
  }>;
  nodes: Array<{
    id: string;
    name: string;
    type: "entity" | "asset";
    connections: number;
  }>;
}
```

---

### SimpleMap
**Purpose:** Interactive map with all asset points

**Source:** `points.geojson` (pre-generated GeoJSON)

```typescript
interface MapPointsData {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: {
      id: string;
      name: string;
      status?: string;
      tracker?: string;
      capacity_mw?: number;
    };
  }>;
}
```

---

## Data Loading Options

### Option 1: Client-side Parquet (Current)
Uses `$lib/duckdb-utils.ts` to load parquet files in browser via DuckDB WASM.

```typescript
import { loadParquetFromPath, query } from '$lib/duckdb-utils';

await loadParquetFromPath('/all_trackers_ownership@1.parquet', 'ownership');
const result = await query('SELECT * FROM ownership WHERE ...');
```

### Option 2: Ownership Tracing API
Uses `$lib/ownership-api.ts` for ownership graph and entity/asset detail queries.

```typescript
import { getAsset, getOwnershipGraph } from '$lib/ownership-api';
const asset = await getAsset('G100000109409');
const graph = await getOwnershipGraph({ root: asset.id, direction: 'up' });
```

### Option 3: REST API (Backend Implementation)
Backend implements the query patterns above and exposes REST endpoints:

```
GET /api/assets/:id/owners
GET /api/entities/:id/portfolio
GET /api/entities/:id/subsidiaries
GET /api/owners/top?limit=20
```

---

## ID Field Mapping by Tracker

Different trackers use different ID columns:

| Tracker | ID Field |
|---------|----------|
| Bioenergy Power | GEM unit ID |
| Coal Plant | GEM unit ID |
| Gas Plant | GEM unit ID |
| Coal Mine | GEM Mine ID |
| Iron Ore Mine | GEM Asset ID |
| Gas Pipeline | ProjectID |
| Oil & NGL Pipeline | ProjectID |
| Steel Plant | Steel Plant ID |
| Cement and Concrete | GEM Plant ID |

---

## Notes for Implementation

1. **IDs are strings** - e.g., "G100001057899", "E100000000834"
2. **Percentages are 0-100** - Not decimals
3. **Null handling** - Many percentage fields can be null (unknown)
4. **Name fields vary** - Project, Plant, Mine, Unit, Unit Name
5. **Status values** - Operating, Retired, Construction, Cancelled, Proposed, Announced
6. **Prefer Observable patterns** - Reference `$lib/ownership-data.ts` for canonical queries
