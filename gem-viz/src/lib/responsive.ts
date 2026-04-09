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

export const LAYOUT = {
  containers: {
    narrow: 800,
    card: 900,
    reading: 960,
    wide: 1100,
    content: 1200,
    full: 1400,
  },
  portfolio: {
    chartMinHeight: 300,
    defaultHeightOffset: 320,
    embedHeightOffset: 120,
    chartMaxHeightOffset: 260,
    modal: {
      maxWidth: 360,
      maxHeight: 400,
      viewportPadding: 20,
      anchorOffsetY: 8,
    },
  },
  ownershipGraph: {
    minWidth: 720,
    inlineWidth: 800,
    maxWidth: 1400,
    viewportGutter: 64,
  },
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

export function clampViewportPosition(
  position: number,
  overlaySize: number,
  viewportSize: number,
  padding = 0
) {
  const maxPosition = Math.max(padding, viewportSize - overlaySize - padding);
  return Math.max(padding, Math.min(position, maxPosition));
}
