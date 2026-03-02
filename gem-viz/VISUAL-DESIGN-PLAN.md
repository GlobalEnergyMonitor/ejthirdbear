# GEM Viz Visual Design Implementation Plan

## Executive Summary

The design tokens and CSS variables are **already well-structured** but several components bypass them with hardcoded values. This plan focuses on enforcing consistency across all views by fixing the ~15 components that still use inconsistent colors.

---

## Current State Assessment

### What's Already Done (Good Foundation)
- `design-tokens.ts` - Comprehensive with GEM brand colors, tracker colors, status colors
- `shared-styles.css` - CSS variables mirror design tokens perfectly
- Typography system - Plus Jakarta Sans + Barlow Semi-Condensed already set up
- Container/layout utilities - Already implemented

### What Needs Fixing (74 files use colors, ~15 have issues)

| Component | Issue | Fix Required |
|-----------|-------|--------------|
| `StatusDistribution.svelte` | Hardcoded status colors `#4A57A8` instead of design tokens | Use `statusColors` from design-tokens |
| `CountryBreakdown.svelte` | Generic gray bars | Use tracker-specific colors |
| `OwnershipExplorerD3.svelte` | Mix of CSS vars and hardcoded values | Standardize to CSS vars |
| `AssetScreener.svelte` | Some inline colors | Move to design tokens |
| `InvestigationMap.svelte` | Map colors may not match design system | Verify against `mapColors` |
| `TopOwners.svelte` | Status indicator colors | Use `statusColors` |
| `MiniHistogram.svelte` | Generic bar colors | Use semantic colors |
| `MiniBarChart.svelte` | Generic bar colors | Use tracker/semantic colors |
| `Sparkline.svelte` | Hardcoded stroke colors | Use CSS variables |
| Various D3/SVG visualizations | Fill/stroke values | Use design token utilities |

---

## Implementation Plan (4 Phases)

### Phase 1: Status Color Standardization
**Goal:** All status-based visualizations use the same red/green/grey scale

**Files to update:**
1. `StatusDistribution.svelte` - Replace hardcoded colors with:
   ```js
   import { statusColors } from '$lib/design-tokens';
   // operating: #7F142A (deep red)
   // prospective: #CA4A50 (light red)
   // retired: #6e8c91 (grey-teal)
   // cancelled: #dce3e5 (light grey)
   ```

2. All components using status colors should import from `design-tokens.ts` rather than defining locally

**GEM Color Guide Reference:**
- Fossil Operating = Deep Red (#7F142A)
- Fossil Prospective = Light Red (#CA4A50)
- Renewable Operating = Dark Green (#348D59)
- Renewable Prospective = Light Green (#51BF7E)
- Retired = Grey-Teal (#6E8C91)
- Cancelled = Light Grey (#DCE3E5)

### Phase 2: Tracker Color Enforcement
**Goal:** All tracker-based visualizations use consistent industry colors

**Tracker Color Reference (already in design-tokens):**
- Coal: #7F142A (Deep Red)
- Gas/Oil: #CA4A50 (Light Red)
- Cement: #6E8C91 (Grey-Teal)
- Bioenergy: #A0AAE5 (Purple)
- Iron/Steel: #004F61 (Midnight Green)
- Solar: #FFE366 (Yellow)
- Wind: #51BF7E (Green)
- Hydro: #099ED8 (Blue)

**Files to update:**
- `CountryBreakdown.svelte` - Add tracker context colors
- `MiniBarChart.svelte` - Use tracker colors when applicable
- Any component displaying assets by tracker

### Phase 3: Semantic Color Application
**Goal:** Positive/negative/neutral values use consistent semantic colors

**From GEM Color Guide:**
- Positive: #099ED8 (Blue), #016B83 (Teal) - for good/growth
- Negative: #7F142A (Deep Red), #CA4A50 (Light Red) - for bad/decline
- Neutral: #4A57A8 (Purple) - for baseline/comparison

**Apply to:**
- Change indicators (+/-) in data tables
- Sparklines showing trends
- Comparison charts
- Any delta/change visualizations

### Phase 4: Component Audit & Cleanup
**Goal:** Remove all remaining hardcoded color values

**Search patterns to find violations:**
```bash
# Find hardcoded hex colors in Svelte files
grep -r "#[0-9a-fA-F]\{6\}" src --include="*.svelte"

# Find inline style colors
grep -r "fill:\|stroke:\|background:\|color:" src --include="*.svelte" | grep "#"
```

**For each violation:**
1. Map to existing CSS variable or design token
2. If no match exists, add to design-tokens.ts first
3. Update component to use CSS variable

---

## Color Quick Reference (From GEM Guide)

### Core Brand
| Name | Hex | Usage |
|------|-----|-------|
| Navy | #004A63 | Primary UI, headers |
| Mint Dataviz | #A5E9E4 | Charts, highlights |
| Orange | #FE4F2D | CTAs, selection |
| Teal | #016B83 | Secondary UI |
| Midnight | #002430 | Text, dark backgrounds |
| Warm White | #F2F2EB | Page backgrounds |

### Dataviz - Tracker Industry Colors
| Tracker | Hex | CSS Variable |
|---------|-----|--------------|
| Coal | #7F142A | `--color-tracker-coal` |
| Gas/Oil | #CA4A50 | `--color-tracker-gas-plant` |
| Cement | #6E8C91 | `--color-tracker-cement` |
| Bioenergy | #A0AAE5 | `--color-tracker-bioenergy` |
| Iron/Steel | #004F61 | `--color-tracker-steel` |
| Solar | #FFE366 | `--color-tracker-solar` |
| Wind | #51BF7E | `--color-tracker-wind` |
| Hydro | #099ED8 | `--color-tracker-hydro` |

### Status Colors (Fossil = Reds)
| Status | Hex | CSS Variable |
|--------|-----|--------------|
| Operating | #7F142A | `--color-status-operating` |
| Construction | #7F142A | `--color-status-construction` |
| Pre-construction | #CA4A50 | `--color-status-pre-construction` |
| Announced | #F4B7B3 | `--color-status-announced` |
| Retired | #6E8C91 | `--color-status-retired` |
| Cancelled | #DCE3E5 | `--color-status-cancelled` |

### Semantic Colors
| Meaning | Hex | CSS Variable |
|---------|-----|--------------|
| Positive 1 | #099ED8 | `--color-positive-1` |
| Positive 2 | #016B83 | `--color-positive-2` |
| Negative 1 | #7F142A | `--color-negative-1` |
| Negative 2 | #CA4A50 | `--color-negative-2` |
| Neutral | #4A57A8 | `--color-neutral` |

---

## Implementation Progress

### Phase 1 - Status Colors (COMPLETE)
- [x] **StatusDistribution.svelte** - Now uses `statusColors` from design-tokens
- [x] **InvestigationStatusChart.svelte** - Now uses `statusColors` from design-tokens
- [x] **screener/results/+page.svelte** - Now uses `designStatusColors` from design-tokens
- [x] **AssetScreener.svelte** - Now uses centralized `getStatusColor()` with design tokens

### Phase 2 - Component Cleanup (COMPLETE)
- [x] **CountryBreakdown.svelte** - Bars now use `--gem-navy`
- [x] **MiniBarChart.svelte** - Default color now uses `colors.navy`
- [x] **DatasetFactsheet.svelte** - Category expand icon now uses `--gem-teal`
- [x] **InvestigationNetwork.svelte** - All D3 colors now use design tokens
- [x] **RelationshipNetwork.svelte** - Status badges now use design token colors
- [x] **globe/+page.svelte** - Tracker fallbacks, map background now use tokens
- [x] **entity/[id]/+page.svelte** - Phase indicators use `--gem-orange`, `--color-success`
- [x] **asset/[id]/+page.svelte** - Code block uses `--gem-midnight`
- [x] **manifest/+page.svelte** - Error banner uses `--color-error-light`
- [x] **CommandPalette.svelte** - Entity/asset badges use `--gem-teal`, `--gem-navy`
- [x] **LoadingWrapper.svelte** - Error state uses `--color-error-light`
- [x] **AssetMicroCard.svelte** - Border, shadow use design tokens
- [x] **InvestigationMap.svelte** - Loading state uses `--color-bg-secondary`
- [x] **MiniNetworkGraph.svelte** - Background, borders, target badge use tokens
- [x] **ExportPanel.svelte** - Error colors, entity border use GEM palette
- [x] **FilterBreadcrumbs.svelte** - Range chips use `--gem-teal-10/25`
- [x] **AssetScreener.svelte** - SVG gradients, strokes, circles use design tokens

### Remaining (Intentional/Low Priority)
- [ ] **OwnershipExplorerD3.svelte** - Complex D3 visualization (15 colors) - functional but could be cleaner
- [ ] **SimpleMap.svelte** - Intentionally defines local theme system (29 colors) - working as designed

---

## Success Criteria

- [ ] Zero hardcoded hex colors in Svelte components (except design-tokens.ts)
- [ ] All status visualizations use red scale for fossil, green for renewable
- [ ] All tracker visualizations use consistent industry colors
- [ ] Semantic colors (positive/negative) applied to change indicators
- [ ] Typography uses centralized system (no component-level font overrides)
