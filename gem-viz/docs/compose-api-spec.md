# Compose Page API Specification

This document describes the API endpoints needed to replace DuckDB queries in the `/compose` page with a REST API.

## Current State

The compose page uses 4 DuckDB query patterns:

1. Facet counts (parametric search)
2. Range data (min/max/histogram)
3. Filtered results
4. Schema inspection

## Required Endpoints

### 1. GET /assets/facets (NEW)

Returns facet counts for all filterable dimensions. Supports "parametric search" where counts update based on other active filters.

**Query Params** (all optional):

- `tracker` - Filter by tracker type
- `status` - Filter by status
- `country` - Filter by asset country
- `ownerCountry` - Filter by owner HQ country
- `owner` - Filter by owner name

**Response:**

```json
{
  "trackers": [{"value": "Coal Plant", "count": 15234}, ...],
  "statuses": [{"value": "operating", "count": 8432}, ...],
  "countries": [{"value": "China", "count": 6120}, ...],
  "ownerCountries": [{"value": "USA", "count": 3890}, ...],
  "owners": [{"value": "BlackRock", "count": 456}, ...]
}
```

**Key Behavior:** Each facet's counts should EXCLUDE its own filter (e.g., tracker counts ignore `?tracker=` param) so users see what's available if they change that selection.

### 2. GET /assets/ranges (NEW)

Returns min/max/histogram for numeric fields.

**Response:**

```json
{
  "capacity": {
    "min": 0,
    "max": 9876,
    "histogram": [1234, 5678, 910, ...]
  },
  "startYear": {
    "min": 1952,
    "max": 2030
  },
  "share": {
    "min": 0,
    "max": 100
  }
}
```

### 3. GET /assets (ENHANCED)

Existing endpoint with additional filter params.

**New Query Params:**

- `tracker` - Multi-value: `Coal+Plant,Gas+Plant`
- `status` - Multi-value: `operating,proposed`
- `country` - Asset country (from locations)
- `ownerCountry` - Owner HQ country
- `owner` - Owner name
- `capacityMin`, `capacityMax` - Numeric range
- `startYearMin`, `startYearMax` - Numeric range
- `shareMin`, `shareMax` - Numeric range
- `search` - Full-text search
- `limit`, `offset` - Pagination

**Response:**

```json
{
  "total": 12345,
  "assets": [...]
}
```

## Migration Complexity

**Medium**

- `/assets/facets` is the main new work (parametric counting logic)
- `/assets/ranges` is straightforward (just min/max/histogram queries)
- `/assets` filter params are additive to existing endpoint

## Alternative: Single POST Endpoint

If query string gets too complex, consider `POST /assets/search`:

```json
{
  "filters": {
    "tracker": ["Coal Plant"],
    "status": ["operating"]
  },
  "facets": true,
  "ranges": true,
  "limit": 500
}
```

Returns results + facets + ranges in one response (fewer round trips).
