/**
 * Canonical viewport breakpoints for GEM Viz.
 *
 * These values are intentionally mirrored in `shared-styles.css`.
 * CSS media queries still need literal values, but JS viewport logic
 * should import from here instead of hardcoding widths in components.
 */

export const BREAKPOINTS = {
  xs: 640,
  sm: 768,
  md: 1024,
  lg: 1280,
  xl: 1536,
} as const;

export type BreakpointKey = keyof typeof BREAKPOINTS;

export function isViewportBelow(breakpoint: BreakpointKey, width = getViewportWidth()) {
  return width < BREAKPOINTS[breakpoint];
}

export function isViewportAtOrBelow(breakpoint: BreakpointKey, width = getViewportWidth()) {
  return width <= BREAKPOINTS[breakpoint];
}

export function getViewportWidth() {
  if (typeof window === 'undefined') return BREAKPOINTS.md;
  return window.innerWidth || BREAKPOINTS.md;
}
