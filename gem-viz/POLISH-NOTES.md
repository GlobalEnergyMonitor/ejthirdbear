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

---

# Visualization Components Reference

## Component Inventory

| Component | Lines | Purpose | Data Source |
|-----------|-------|---------|-------------|
| `OwnershipFlower` | 325 | Nadieh Bremer-style radial flower | prebaked or WASM fetch |
| `OwnershipPie` | 98 | Simple ownership percentage pie | props only |
| `OwnershipHierarchy` | 321 | Force-directed ownership network | props only |
| `MermaidOwnership` | 300 | Auto-generated Mermaid flowchart | props only |
| `RelationshipNetwork` | 462 | Related/co-located assets | prebaked or WASM fetch |
| `AssetScreener` | 962 | Full subsidiary portfolio viz | prebaked or WASM fetch |

## Component Details

### OwnershipFlower
**Location:** `src/lib/components/OwnershipFlower.svelte`

Radial "flower" encoding tracker mix:
- Petal angle → tracker share (by asset count)
- Petal length → capacity for that tracker
- Petal color → tracker color palette

**Props:**
```ts
ownerId?: string        // Entity ID (optional if portfolio provided)
portfolio?: object      // Prebaked portfolio data
size: 'small'|'medium'|'large'  // Size preset
showLabels: boolean     // Show tracker labels
showTitle: boolean      // Show entity name
title?: string          // Override title
```

**Key D3 usage:** `d3.arc()`, `d3.group()`

---

### OwnershipPie
**Location:** `src/lib/components/OwnershipPie.svelte`

Minimal pie chart showing ownership percentage. Pure SVG, no D3.

**Props:**
```ts
percentage: number      // 0-100
size: number           // Diameter in pixels
fillColor: string      // Fill color
strokeColor: string    // Stroke color
strokeWidth: number    // Stroke width
showLabel: boolean     // Show % label in center
```

---

### OwnershipHierarchy
**Location:** `src/lib/components/OwnershipHierarchy.svelte`

Force-directed graph showing ownership network.
Nodes positioned vertically by depth (asset at bottom).

**Props:**
```ts
assetId: string        // Asset being visualized
assetName: string      // Display name
edges: OwnershipEdge[] // From ownership-parser
nodes: OwnershipNode[] // From ownership-parser
width?: number         // Container width (responsive)
height?: number        // Container height
```

**Key D3 usage:** `d3-force` (forceSimulation, forceLink, forceManyBody, forceX, forceCollide)

---

### MermaidOwnership
**Location:** `src/lib/components/MermaidOwnership.svelte`

Auto-generated flowchart using Mermaid.js.
Converts ownership edges to Mermaid syntax.

**Props:**
```ts
edges: OwnershipEdge[] // Parsed ownership edges
nodeMap: Map           // ID -> {Name} lookup
assetId: string        // Asset ID
assetName: string      // Asset name
zoom: number           // Initial zoom (0.2-2.0)
direction: 'TD'|'LR'   // Flow direction
```

**Features:**
- Interactive zoom slider
- Clickable nodes navigate to asset/entity pages
- Theme customization via Mermaid config

---

### RelationshipNetwork
**Location:** `src/lib/components/RelationshipNetwork.svelte`

Shows related assets for an asset page:
1. Ownership chain (linear flow)
2. Same-owner assets (grid of cards)
3. Co-located assets (list)

**Props:**
```ts
prebakedData?: {
  ownershipChain: ChainItem[]
  sameOwnerAssets: Asset[]
  coLocatedAssets: Asset[]
  ownerStats: Stats
  currentAsset: Asset
}
```

---

### AssetScreener
**Location:** `src/lib/components/AssetScreener.svelte`

Complex visualization showing owner's full portfolio:
- Subsidiary groups with ownership pies
- Assets positioned by location
- Mini bar charts for tracker/status mix
- Status icons (proposed/cancelled/retired)

**Props:**
```ts
assetClassName: string      // Label ("assets", "plants", etc)
sortByOwnershipPct: boolean // Sort subsidiaries by ownership %
includeUnitNames: boolean   // Show full unit names
prebakedPortfolio?: Portfolio // Prebaked data
```

**Key features:**
- Uses shared utilities from `visualization-utils.ts`
- Supports truncated portfolios (>200 assets)
- Full legend for colors and status icons

## Shared Utilities

**Location:** `src/lib/component-data/visualization-utils.ts`

```ts
// Layout constants
LAYOUT_PARAMS    // Subsidiary/asset positioning
SVG_MARGIN       // Chart margins
SVG_WIDTH        // Default width

// Functions
scaleR(n)                    // Radius scaling for combined units
calculateFrequencyTables()   // Tracker/status frequency for bar charts
arcPath(value, radius)       // SVG arc path for pie slices
subsidiaryPath(group)        // SVG path for subsidiary connection
```

## Color System

**Location:** `src/lib/ownership-theme.ts`

```ts
// Core palette (monochrome-focused)
colors.navy = '#333333'
colors.grey = '#BECCCF'
colors.teal = '#016b83'
colors.mint = '#9df7e5'
colors.warmWhite = '#fafaf7'

// Status colors (mostly monochrome)
regroupStatus() → 'proposed' | 'operating' | 'retired' | 'cancelled'

// Tracker colors
colorByTracker: Map<string, string>
```

## Polish Opportunities

### Quick Fixes
- [ ] AssetScreener header uses hardcoded `#016b83` - could use `colors.teal`
- [ ] AssetScreener subtitle uses `#9df7e5` - could use `colors.mint`
- [ ] RelationshipNetwork uses `#4caf50` for operating - should be monochrome

### Enhancements
- [ ] Add hover transitions to OwnershipFlower petals
- [ ] OwnershipHierarchy could show ownership % on hover
- [ ] MermaidOwnership could have LR/TD toggle button
- [ ] AssetScreener tooltip could follow cursor
