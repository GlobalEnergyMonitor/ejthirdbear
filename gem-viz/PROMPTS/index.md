# GEM Dataset Guide

Global Energy Monitor tracks energy infrastructure worldwide: power plants, mines, pipelines, steel/cement facilities. This doc covers what you need to query and reason about the data.

## Core Concepts

**Entity**: A company/organization (investors, operators, governments). ID prefix: `E` (e.g., E100000000650 = BlackRock)

**Asset**: Physical infrastructure (a power plant, mine, pipeline). ID prefixes vary by tracker:

- `G` = Coal/Gas/Bioenergy plants (GEM unit ID)
- `M` = Coal mines
- `P` = Pipelines, Steel plants, Iron mines

**Ownership**: Links entities to assets (or entities to entities). Has `ownershipPct` (0-100). Can be:

- Direct: Entity owns Asset
- Indirect: Entity owns Entity that owns Asset
- Chains can be 5+ levels deep

## The 7 Trackers

| Tracker         | ID Field           | Capacity Unit | Notes                       |
| --------------- | ------------------ | ------------- | --------------------------- |
| Coal Plant      | GEM unit ID (G)    | MW            | Largest dataset             |
| Gas Plant       | GEM unit ID (G)    | MW            |                             |
| Coal Mine       | GEM Mine ID (M)    | Mtpa          |                             |
| Iron Mine       | GEM Asset ID (P)   | Mtpa          |                             |
| Steel Plant     | Steel Plant ID (P) | ttpa          | Look for BF = blast furnace |
| Gas Pipeline    | ProjectID (P)      | Bcm/y         | Short IDs like P0061        |
| Bioenergy Power | GEM unit ID (G)    | MW            |                             |

## Status Values

Operating states: `operating`, `idle`, `mothballed`
Pipeline states: `announced`, `pre-permit`, `permitted`, `pre-construction`, `construction`, `proposed`
End states: `retired`, `cancelled`, `shelved`

For simple analysis, normalize to: **operating / proposed / retired / cancelled**

## Ownership Model

- `ownershipPct` = percentage stake (50 = 50%)
- Multiple owners per asset is common (joint ventures)
- Percentages may not sum to 100 (unknown stakes, public float)
- "Parent" = ultimate owner (trace up the chain)
- "Direct owner" = immediate holder

To find who really controls an asset, walk UP the ownership graph until you hit entities with no parents.

## ID Gotchas

1. **Compound IDs**: REST API sometimes returns `L100000104107_G100000102961` (location_unit). Extract the G/M/P part.
2. **P-prefix varies**: Pipelines use short (P0061), Steel/Iron use long (P100000120xxx)
3. **Entity IDs are stable**, asset IDs may have duplicates across trackers (use tracker + ID as key)

## Data Access

**REST API** (`gem-api.thirdbear.net`): Primary data source for all queries

- Ownership queries, entity search, single asset lookup
- Graph traversal (up/down)
- Faceted counts by type/status/country
- Asset listing with filters

## Common Query Patterns

**"Who are the biggest coal plant owners?"**
→ Group by owner entity ID, count assets or sum capacity

**"What does Company X own?"**
→ Get entity ID, then fetch portfolio (subsidiaries + direct holdings)

**"Who ultimately owns Asset Y?"**
→ Walk ownership graph UP from asset until no more parents

**"Assets in Country Z"**
→ Filter by country field via REST API

## Known Limitations

1. Location data comes from static GeoJSON (points.geojson) for map rendering
2. Some ownership percentages are estimated or outdated
3. Pipeline geometry is partial (not full routes)
4. Historical ownership changes not fully tracked
5. "Captive" plants (not grid-connected) need special field checks
