# Page Polish Notes

Quick reference for tomorrow's asset/entity page polish session.

## Completed Today

- [x] Removed dead `.back-link` CSS from both pages
- [x] Removed dead `.ownership-explorer` CSS from entity page
- [x] Unified meta-grid column width to 180px
- [x] Renamed `.viz-subtitle` → `.section-subtitle` for consistency
- [x] Added checkmark + active state to AddToCartButton
- [x] Made report/export pages use monochrome entity styling (#333 vs purple)
- [x] Cleaned up status chips in report page (border-based monochrome)

## Page Comparison

| Aspect | Asset Page | Entity Page |
|--------|-----------|-------------|
| Lines | ~625 | ~505 |
| File | `src/routes/asset/[id]/+page.svelte` | `src/routes/entity/[id]/+page.svelte` |
| Header | Table name | "Entity Profile" |
| Hero | Name + ID | Name + Flower viz |

## Section Inventory

### Asset Page Sections
1. Header (table name)
2. Title + GEM Unit ID + AddToCart
3. Meta grid: Status, Tracker, Owners, Total %, Country, Coordinates
4. Owners Table (full ownership records)
5. Ownership Structure (Mermaid flowchart)
6. Ownership Network (force-directed)
7. Owner Portfolio (AssetScreener)
8. Related Assets (RelationshipNetwork)
9. Location (MapLibre)
10. All Properties (dl/dt/dd list)
11. Raw Data (collapsible JSON)

### Entity Page Sections
1. Header ("Entity Profile")
2. Hero: Name + stats subtitle + AddToCart + OwnershipFlower
3. Meta grid: ID, Assets, Capacity, Countries
4. Connected Entities (ConnectionFinder widget)
5. Tracker Mix (pill list)
6. Status Breakdown (icon list)
7. Representative Assets (20 cards)
8. Asset Portfolio (AssetScreener)

## Components Used

**Shared:**
- `StatusIcon`, `TrackerIcon`, `OwnershipPie`
- `AddToCartButton` (now with ✓ checkmark when active)
- `AssetScreener`

**Asset only:**
- `AssetMap` (MapLibre)
- `MermaidOwnership`, `OwnershipHierarchy`
- `RelationshipNetwork`

**Entity only:**
- `OwnershipFlower` (radial viz)
- `ConnectionFinder` (widget)

## Remaining Polish Ideas

**Quick wins:**
- Add subtle hover states to asset cards
- Add capacity bars to Representative Assets cards

**Medium effort:**
- Add Raw JSON section to entity page (for consistency)
- Extract shared CSS to a `page-common.css` or shared Svelte snippet
- Coordinate links → open in Google Maps / OSM

**Larger polish:**
- Asset "All Properties" section could use a cleaner two-column grid
- Consider collapsing some sections by default (long pages)

## Investigation Cart System

**Files:**
- `src/lib/investigationCart.ts` - core Svelte store
- `src/lib/components/AddToCartButton.svelte` - add/toggle button
- `src/lib/components/SiteNav.svelte` - shows cart badge count
- `src/routes/report/+page.svelte` - investigation report with co-ownership analysis
- `src/routes/export/+page.svelte` - CSV/JSON export page

**Features:**
- Add assets (G-prefix) or entities (E-prefix) to cart
- Shareable URLs with `?ids=` param
- Co-ownership detection (shared assets, common owners)
- Geographic breakdown
- Export to CSV/JSON
- Print-friendly PDF

## CSS Variables in Use

From `ownership-theme.ts`:
```
colors.navy = '#333333'
colors.grey = '#BECCCF'
```

Status colors → monochrome palette (prospective=#888, operating=#333, retired=#000, cancelled=#bbb)

## Quick Reference: Server Data Shape

**Asset page** receives from `+page.server.js`:
```js
{ assetId, assetName, owners[], asset{}, tableName, columns[], ownerExplorerData, relationshipData }
```

**Entity page** receives from `+page.server.js`:
```js
{ entityId, entityName, entity{}, stats{}, portfolio{}, ownerExplorerData }
```

## Files to Touch

```
src/routes/asset/[id]/+page.svelte
src/routes/entity/[id]/+page.svelte
(optionally) src/lib/styles/page-common.css (new shared CSS)
```
