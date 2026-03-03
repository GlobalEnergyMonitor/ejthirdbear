# Style Consolidation Prep - Visual Design Pass

## Current Architecture

### Source Files

| File                        | Purpose                                               | Lines |
| --------------------------- | ----------------------------------------------------- | ----- |
| `src/lib/design-tokens.ts`  | TypeScript source of truth for colors, fonts, spacing | 531   |
| `src/lib/shared-styles.css` | CSS custom properties + utility classes               | 919   |
| `src/app.css`               | Base styles, resets, print styles                     | 341   |

### What's Working Well

- Design tokens are comprehensive (colors, typography, spacing)
- CSS custom properties mirror TS tokens
- Good utility classes: `.panel`, `.card`, `.grid-*`, `.data-table`, `.btn`, `.badge`
- Semantic color tokens (text-primary, bg-secondary, etc.)
- Dark mode prep already in place

---

## Problem Areas

### 1. Hardcoded Values in Screener Pages

```
Screener pages contain:
- 97 inline font-size declarations
- 61 inline background declarations
- 253 hardcoded hex color values
```

### 2. Repeated Patterns Not Extracted

These patterns appear 5+ times across components but aren't in shared-styles:

#### Stat Displays

```css
/* Big hero numbers - used in results, entity, asset pages */
.stat-value {
  font-size: 32px;
  font-weight: 300;
  line-height: 1;
}
.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
```

#### Breakdown Bars (Status/Tracker)

```css
/* Horizontal segmented bars showing distribution */
.breakdown-bar {
  display: flex;
  height: 8px;
  overflow: hidden;
  gap: 1px;
}
.bar-segment {
  min-width: 3px;
  transition: width 0.3s ease;
}
```

#### Legend Items

```css
/* Color dot + label + count pattern */
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
```

#### Tracker/Status Badges with Progress Bars

```css
/* Badge with colored progress bar at bottom */
.progress-badge {
  position: relative;
  padding: 10px 12px;
  overflow: hidden;
}
.progress-badge::after {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
}
```

#### Expandable Row Pattern

```css
/* Clickable row that expands to show details */
.expandable-row {
  border: 1px solid #e0e0e0;
}
.expandable-row.expanded {
  border-color: #999;
}
.row-toggle {
  display: grid;
  grid-template-columns: ...;
  cursor: pointer;
}
.row-details {
  background: #fafafa;
  border-top: 1px solid #eee;
}
```

#### Mini Visualization Containers

```css
/* Wrapper for MiniFlower, donut charts, etc. */
.mini-viz {
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 3. Missing Semantic Classes

Need to add to shared-styles.css:

```css
/* Section Labels */
.section-label {
  /* "BY STATUS", "TOP COUNTRIES" etc */
}

/* Inline Stat (used in rows) */
.inline-stat {
  /* "42 assets" inline display */
}

/* Country/Tracker badges */
.data-badge {
  /* Generic badge with progress bar */
}

/* Asset Item (in lists) */
.asset-item {
  /* Clickable asset row in expanded views */
}

/* Donut Chart */
.donut-chart {
  /* SVG donut container */
}
```

---

## Recommended Actions

### Phase 1: Extract to shared-styles.css

Add these reusable classes:

```css
/* ==========================================================================
   DATA VISUALIZATION COMPONENTS
   ========================================================================== */

/* Stat Hero - Big numbers display */
.stat-hero {
  display: flex;
  gap: var(--space-8);
}

.stat-hero-item {
  display: flex;
  flex-direction: column;
}

.stat-hero-value {
  font-size: var(--font-size-3xl);
  font-weight: 300;
  color: var(--color-text-primary);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.stat-hero-label {
  font-size: var(--font-size-md);
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  margin-top: var(--space-1);
}

/* Breakdown Bar - Segmented horizontal bar */
.breakdown-bar {
  display: flex;
  height: 8px;
  overflow: hidden;
  background: var(--color-gray-100);
  gap: 1px;
}

.breakdown-bar-segment {
  min-width: 3px;
  transition: width var(--transition-slow);
}

/* Breakdown Legend */
.breakdown-legend {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  margin-top: var(--space-2);
}

.breakdown-legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
}

.breakdown-legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.breakdown-legend-count {
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Section Label */
.section-label {
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-caps);
  margin: 0 0 var(--space-2) 0;
}

/* Data Badge - Badge with optional progress bar */
.data-badge {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-primary);
  border: var(--border-width) solid var(--color-border);
  overflow: hidden;
}

.data-badge-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  transition: width var(--transition-slow);
}

.data-badge-label {
  font-size: var(--font-size-body);
  font-weight: 500;
  color: var(--color-text-primary);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-badge-count {
  font-size: var(--font-size-body);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

/* Expandable Row */
.expandable-row {
  background: var(--color-bg-primary);
  border: var(--border-width) solid var(--color-border);
}

.expandable-row.expanded {
  border-color: var(--color-gray-400);
}

.expandable-row-toggle {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--space-4) var(--space-5);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background var(--transition-fast);
}

.expandable-row-toggle:hover {
  background: var(--color-bg-secondary);
}

.expandable-row-details {
  padding: var(--space-5);
  background: var(--color-bg-secondary);
  border-top: var(--border-width) solid var(--color-border);
}

/* Asset Item */
.asset-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-primary);
  border: var(--border-width) solid var(--color-border-light);
  text-decoration: none;
  transition: border-color var(--transition-fast);
}

.asset-item:hover {
  border-color: var(--color-gray-300);
}

.asset-item-name {
  font-size: var(--font-size-body);
  color: var(--color-text-primary);
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-item-meta {
  font-size: var(--font-size-md);
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

/* Donut Chart Container */
.donut-chart {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.donut-chart-svg {
  flex-shrink: 0;
}

.donut-chart-svg path {
  transition: opacity var(--transition-fast);
}

.donut-chart-svg path:hover {
  opacity: 0.8;
}

.donut-chart-center {
  font-size: var(--font-size-body);
  font-weight: 600;
  fill: var(--color-text-primary);
}

.donut-chart-legend {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
```

### Phase 2: Replace Hardcoded Values

1. **Colors**: Replace all `#xxx` with CSS variables
   - `#fafafa` → `var(--color-bg-secondary)`
   - `#888` → `var(--color-text-tertiary)`
   - `#222` → `var(--color-text-primary)`
   - etc.

2. **Font sizes**: Replace all `font-size: Npx` with variables
   - `10px` → `var(--font-size-base)`
   - `12px` → `var(--font-size-body)`
   - `14px` → `var(--font-size-lg)`
   - etc.

3. **Spacing**: Replace all `padding/margin/gap` with variables
   - `8px` → `var(--space-2)`
   - `16px` → `var(--space-4)`
   - `24px` → `var(--space-6)`
   - etc.

### Phase 3: Refactor Components

For each screener page:

1. Replace inline styles with shared classes
2. Keep only page-specific overrides in component `<style>`
3. Use semantic tokens instead of raw colors

---

## Files to Update

### High Priority (lots of duplication)

- [ ] `src/routes/screener/results/+page.svelte` - 489 lines of CSS
- [ ] `src/routes/screener/+page.svelte` - ~200 lines of CSS
- [ ] `src/routes/screener/owners/+page.svelte`
- [ ] `src/routes/entity/[id]/+page.svelte`
- [ ] `src/routes/asset/[id]/+page.svelte`

### Medium Priority

- [ ] `src/lib/components/DataTable.svelte`
- [ ] `src/lib/components/FacetedFilter.svelte`
- [ ] `src/lib/components/CommandPalette.svelte`

### Low Priority (smaller components)

- [ ] Various widget components

---

## Color Mapping Reference

### Current Hardcoded → Should Be

```
#faf9f7  →  var(--color-bg-secondary)
#fafafa  →  var(--color-bg-secondary)
#fff     →  var(--color-bg-primary)
#f5f5f5  →  var(--color-bg-tertiary)
#e0e0e0  →  var(--color-border)
#eee     →  var(--color-border-light)
#ddd     →  var(--color-gray-300)
#ccc     →  var(--color-gray-300)
#999     →  var(--color-text-tertiary)
#888     →  var(--color-text-tertiary)
#666     →  var(--color-text-secondary)
#555     →  var(--color-text-secondary)
#333     →  var(--color-text-primary)
#222     →  var(--color-text-primary)
#000     →  var(--color-black)
```

---

## Next Steps

When ready to do the visual design pass:

1. **First**: Add new classes to `shared-styles.css` (Phase 1)
2. **Then**: Update `results/+page.svelte` as the template
3. **Finally**: Apply same patterns to other pages

This prep ensures:

- Single source of truth for all visual styles
- Easy theming/dark mode later
- Consistent look across all pages
- Smaller CSS bundle (no duplication)
