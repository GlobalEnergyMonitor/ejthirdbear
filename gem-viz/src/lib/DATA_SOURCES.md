# Data Sources Architecture

This document describes when and why we use each data source.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA SOURCE DECISION TREE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Need ownership relationships?  ──────────────────────►  REST API          │
│   Need single asset/entity?      ──────────────────────►  REST API          │
│   Need search results?           ──────────────────────►  REST API          │
│                                                                             │
│   Need map coordinates (bulk)?   ──────────────────────►  DuckDB            │
│   Need aggregate statistics?     ──────────────────────►  DuckDB            │
│   Need field distributions?      ──────────────────────►  DuckDB            │
│   Need custom SQL analysis?      ──────────────────────►  DuckDB            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## REST API (Preferred)

**Module:** `$lib/ownership-api.ts`

The Ownership Tracing API is the preferred data source for most operations.
It provides normalized, relationship-aware data with proper caching.

### When to Use

- **Asset/Entity Details** - Single record lookups
- **Ownership Graphs** - Tracing ownership up/down the hierarchy
- **Search** - Finding assets or entities by name
- **Relationships** - Who owns what, parent/child chains

### API Functions

```typescript
import {
  getAsset,           // GET /assets/{id}
  getEntity,          // GET /entities/{id}
  getOwnershipGraph,  // GET /ownership/graph?root={id}&direction=up|down
  getEntityGraphDown, // GET /entities/{id}/graph/down
  getEntityGraphUp,   // GET /entities/{id}/graph/up
  searchAssets,       // GET /assets/search?q={query}
  searchEntities,     // GET /entities/search?q={query}
} from '$lib/ownership-api';
```

### Files Using REST API

| File | Usage |
|------|-------|
| `routes/asset/[id]/+page.svelte` | Asset detail page |
| `routes/embed/asset/+page.svelte` | Embeddable asset card |
| `routes/embed/entity/+page.svelte` | Embeddable entity card |
| `components/UltimateOwners.svelte` | Ownership chain display |
| `components/CommandPalette.svelte` | Global search |
| `component-data/schema.ts` | Data abstraction layer |

---

## DuckDB / MotherDuck (When Required)

**Module:** `$lib/widgets/widget-utils.ts` → `widgetQuery()`

DuckDB is used for operations that require:
- Bulk data access (thousands of records)
- Geographic coordinates (not in REST API)
- Aggregate statistics across the full dataset
- Custom SQL for analysis/reporting

### When to Use

- **Maps/Globe** - Bulk lat/lon lookups from `locations` table
- **Faceted Filters** - Counting assets by tracker/status/country
- **Factsheets** - Field value distributions
- **Reports/Compose** - Custom analytical queries
- **Export** - Bulk data extraction

### Query Function

```typescript
import { widgetQuery } from '$lib/widgets/widget-utils';

const result = await widgetQuery<{ count: number }>(`
  SELECT COUNT(*) as count
  FROM ownership
  WHERE "Tracker" = 'Coal Plant'
`);
```

### Files Using DuckDB

| File | Usage | Why Not REST API |
|------|-------|------------------|
| `routes/globe/+page.svelte` | 3D globe visualization | Needs bulk coordinates |
| `components/InvestigationMap.svelte` | Map with markers | Needs lat/lon joins |
| `routes/factsheet/[tracker]/+page.svelte` | Field statistics | Aggregate queries |
| `routes/explore/+page.svelte` | Filter counts | Need full dataset counts |
| `routes/compose/+page.svelte` | Report builder | Custom SQL |
| `routes/report/+page.svelte` | Report generation | Custom SQL |
| `factsheet/queries.ts` | Distribution queries | Aggregate stats |
| `compose-queries.ts` | Analysis queries | Custom SQL |

### Tables Available

```sql
-- Main ownership data
SELECT * FROM ownership LIMIT 1;

-- Location coordinates (for maps)
SELECT * FROM locations LIMIT 1;
```

---

## Fallback Pattern

Some components use REST API with DuckDB fallback:

```typescript
// In routes/asset/[id]/+page.svelte
try {
  // Try REST API first (preferred)
  const asset = await getAsset(assetId);
} catch (apiError) {
  // Fall back to DuckDB if API fails
  const result = await widgetQuery(`SELECT ... FROM ownership WHERE ...`);
}
```

This ensures data availability even when the API is down.

---

## Adding New Features

### Decision Checklist

1. **Single record lookup?** → Use REST API
2. **Need ownership relationships?** → Use REST API
3. **Need coordinates for 100+ points?** → Use DuckDB
4. **Need counts/aggregates?** → Use DuckDB
5. **Building a report/export?** → Use DuckDB

### Example: New Component

```typescript
// ✅ Good: REST API for entity details
import { getEntity } from '$lib/ownership-api';
const entity = await getEntity(entityId);

// ✅ Good: DuckDB for bulk map data
import { widgetQuery } from '$lib/widgets/widget-utils';
const points = await widgetQuery(`
  SELECT lat, lon, name FROM locations WHERE country = 'USA'
`);

// ❌ Bad: DuckDB for single record (use REST API)
const asset = await widgetQuery(`SELECT * FROM ownership WHERE id = '${id}'`);
```
