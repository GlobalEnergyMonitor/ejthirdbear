# Component Data Audit - LOC Reduction Opportunities

## Current State

### Total LOC by Component (visualization components)
| Component | Lines | Self-Hydrating | Data Source |
|-----------|-------|----------------|-------------|
| AssetScreener.svelte | 950 | Yes | fetchOwnerPortfolio |
| DataTable.svelte | 926 | No (props) | Props from parent |
| OwnershipExplorerD3.svelte | 806 | Yes | MotherDuck |
| OwnershipChart.svelte | 494 | Yes | fetchOwnerPortfolio |
| RelationshipNetwork.svelte | 445 | Yes | MotherDuck |
| OwnershipScreener.svelte | 417 | No (props) | Props from parent |
| OwnershipHierarchy.svelte | 387 | Yes | MotherDuck + parseOwnershipPaths |
| MermaidOwnership.svelte | 333 | Yes | MotherDuck + parseOwnershipPaths |
| OwnershipFlower.svelte | 187 | Yes | MotherDuck |
| AssetMap.svelte | 181 | Yes | fetchAssetBasics |

---

## Duplicated Patterns Found

### 1. Loading/Error State (13 instances)
```javascript
let loading = $state(true);
let error = $state(null);
```

**Files:** AssetScreener, MermaidOwnership, OwnershipHierarchy, OwnershipChart,
RelationshipNetwork, OwnershipFlower, AssetMap, OwnershipExplorerD3, NetworkGraph,
asset/+page, asset/[id]/+page, entity/[id]/+page, export/+page

### 2. SQL Template Functions (5 instances of SCHEMA_SQL, 3 of ASSET_SQL)
```javascript
const SCHEMA_SQL = (schema, table) => `
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = '${schema}'
    AND table_name = '${table}'
  ORDER BY ordinal_position
`;

const ASSET_SQL = (fullTableName, idColumn, id) => `
  SELECT *
  FROM ${fullTableName}
  WHERE "${idColumn}" = '${id}'
`;
```

**Files:** OwnershipHierarchy, MermaidOwnership, asset/+page, asset/[id]/+page, entity/[id]/+page

### 3. escapeValue Function (3 instances)
```javascript
function escapeValue(val) {
  return String(val ?? '').replace(/'/g, "''");
}
```

**Files:** OwnershipHierarchy, MermaidOwnership, asset/[id]/+page

### 4. Page ID Resolution (6+ instances)
```javascript
const resolvedId = get(page)?.params?.id;
if (!resolvedId) throw new Error('Missing asset ID');
```

**Files:** OwnershipHierarchy, MermaidOwnership, AssetScreener, OwnershipChart, etc.

### 5. Hydration Pattern (8+ instances)
```javascript
async function hydrateXxx() {
  try {
    loading = true;
    error = null;
    // ... fetch data
  } catch (err) {
    error = err?.message || String(err);
  } finally {
    loading = false;
  }
}

onMount(() => {
  hydrateXxx();
});
```

---

## Proposed Consolidations

### A. Create `sql-helpers.ts` (~30 LOC savings across 5 files)
```typescript
// src/lib/component-data/sql-helpers.ts
export const SCHEMA_SQL = (schema: string, table: string) => `...`;
export const ASSET_SQL = (fullTableName: string, idColumn: string, id: string) => `...`;
export function escapeValue(val: unknown): string { ... }
export function findIdColumn(cols: string[]): string | null { ... }
export function findNameColumn(cols: string[]): string | null { ... }
```

### B. Create `useAssetData` hook (~50 LOC savings per component)
```typescript
// src/lib/component-data/use-asset-data.ts
export function useAssetData<T>() {
  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<T | null>(null);

  const assetId = $derived(/* from page store */);

  async function load(fetcher: () => Promise<T>) {
    loading = true;
    error = null;
    try {
      data = await fetcher();
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  }

  return { loading, error, data, assetId, load };
}
```

### C. Merge Similar Components

**Candidates for merge:**
- `OwnershipHierarchy` + `MermaidOwnership` → Both parse ownership paths, one renders SVG, one renders Mermaid
- `AssetScreener` + `OwnershipChart` → Both use fetchOwnerPortfolio, different visualizations
- `OwnershipExplorer` is already just a wrapper for `AssetScreener`

---

## Per-Component Data Concerns

### AssetMap
- **Input:** Asset ID from URL
- **Fetches:** `fetchAssetBasics(assetId)`
- **Data shape:** `{ lat, lon, name, locationId }`
- **Fallback:** If no coords, tries `fetchCoordinatesByLocation(locationId)`

### OwnershipHierarchy / MermaidOwnership
- **Input:** Asset ID from URL
- **Fetches:** Raw ownership records via MotherDuck
- **Transforms:** `parseOwnershipPaths()` → edges + nodes
- **Data shape:** `{ edges: OwnershipEdge[], nodes: OwnershipNode[] }`

### AssetScreener / OwnershipChart
- **Input:** Asset ID or Entity ID from URL
- **Fetches:** `fetchOwnerPortfolio(ownerId)`
- **Data shape:** `SpotlightOwnerData` (subsidiaries, assets, edges)

### RelationshipNetwork
- **Input:** Asset ID from URL
- **Fetches:** Multiple queries (ownership chain, same-owner, co-located)
- **Data shape:** Custom aggregation

### NetworkGraph
- **Input:** None (global view)
- **Fetches:** Parquet file via DuckDB WASM
- **Data shape:** All edges from ownership parquet

---

## Recommended Refactoring Order

1. **Extract SQL helpers** (quick win, ~30 LOC)
2. **Create loading state composable** (medium effort, ~100 LOC total savings)
3. **Document data contracts per component** (this file)
4. **Consider component consolidation** (larger effort)

---

## Questions for Review

1. Should `OwnershipHierarchy` and `MermaidOwnership` share a data layer and just differ in rendering?
2. Is `OwnershipExplorerD3` still needed given `AssetScreener`?
3. Should we prefer `ownership-data.ts` (Observable patterns) or `schema.ts` (MotherDuck) as the canonical fetcher?
4. Are there components that should become "dumb" (props only) vs "smart" (self-hydrating)?
