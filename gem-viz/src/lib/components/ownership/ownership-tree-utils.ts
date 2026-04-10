/**
 * Pure utility functions and design constants for OwnershipTreeGraph.
 */

import type { GraphNode, LayoutPoint } from '$lib/component-data/graph-types';
import { line, curveBasis } from 'd3-shape';
import { ownershipColors, countryPalette, countryGray } from '$lib/design-tokens';

// =============================================================================
// LAYOUT CONSTANTS — single source of truth for magic numbers
// =============================================================================

/** Ownership % below this threshold → node rendered at half size */
export const SMALL_OWNERSHIP_PCT = 2;

/** Max countries shown with distinct colors in country mode (rest → gray) */
export const MAX_COUNTRY_COLORS = 5;

/** Node radius by graph size: [<10 nodes, 10-25, >25, compact]
 * Increased ~1.25x so ownership pie nodes read more clearly in the tree graph.
 */
export const NODE_RADIUS = { small: 35, medium: 28, large: 23, compact: 13 } as const;

/** When graph exceeds this node count, switch to "large graph" mode (dimmer, denser) */
export const LARGE_GRAPH_THRESHOLD = 30;

/** Zoom range limits */
export const ZOOM = { min: 0.15, max: 8, wheelStep: 0.1 } as const;

/** SVG margins around the dagre layout */
export const GRAPH_MARGIN = { top: 20, right: 30, bottom: 24, left: 40 } as const;

/** Opacity values for various node/edge states */
export const OPACITY = {
  fadedNode: 0.15,
  fadedEdge: 0.08,
  inactiveNode: 0.1,
  largeGraphBase: 0.92,
  largeGraphEdge: 0.55,
  frozenPathEdge: 0.06,
  hoverPathEdge: 0.1,
} as const;

/** dagre layout spacing */
export const DAGRE = { ranksep: 60, edgesep: 0 } as const;

/** Edge weight assignments for dagre priority */
export const EDGE_WEIGHT = { asset: 3, bothSmall: 1, oneSmall: 2, normal: 3 } as const;

/** Pan vs click distance threshold (pixels) */
export const PAN_CLICK_THRESHOLD = 4;

// =============================================================================
// DESIGN TOKENS
// =============================================================================

// Design tokens — sourced from design-tokens.ts (GEM brand)
export const TREE_COLORS = {
  navy: ownershipColors.treeNavy,
  teal: ownershipColors.treeTeal,
  mint: ownershipColors.treeMint,
  warmWhite: ownershipColors.treeWarmWhite,
  nodeFill: ownershipColors.treeNodeFill,
  edge: ownershipColors.treeEdge,
  edgeImputed: ownershipColors.treeEdgeImputed,
  midnight: ownershipColors.treeMidnight,
};

// Entity type colors — sourced from design-tokens.ts (GEM brand)
export const OWNERSHIP_ENTITY_COLORS: Record<string, { bg: string; fg: string; light: string }> = {
  Government: {
    bg: ownershipColors.entityGovernment,
    fg: ownershipColors.entityGovernmentDark,
    light: ownershipColors.entityGovernmentLight,
  },
  'Publicly Listed Corp.': {
    bg: ownershipColors.entityPublicCorp,
    fg: ownershipColors.entityPublicCorpDark,
    light: ownershipColors.entityPublicCorpLight,
  },
  'Private Company': {
    bg: ownershipColors.entityPrivate,
    fg: ownershipColors.entityPrivateDark,
    light: ownershipColors.entityPrivateLight,
  },
  Other: {
    bg: ownershipColors.entityOther,
    fg: ownershipColors.entityOtherDark,
    light: ownershipColors.entityOtherLight,
  },
};

// Color-by mode for the ownership tree
export type ColorMode = 'entity-type' | 'country';

export const COUNTRY_COLORS = countryPalette;
export const COUNTRY_GRAY = countryGray;

/** Observable's ownerType classification function. */
export function classifyOwnerType(node: GraphNode): string {
  const et = (node.entity_type || '').toLowerCase();
  if (et === 'state' || et === 'state body') return 'Government';
  if (node.publiclylisted) return 'Publicly Listed Corp.';
  if (et === 'legal entity') return 'Private Company';
  return 'Other';
}

/** Break text into max 2 lines at word boundary, truncate with ellipsis. */
export function wrapText(text: string, max = 12): { line1: string; line2?: string } {
  if (text.length <= max) return { line1: text };
  const brk = text.lastIndexOf(' ', max);
  const line1 = text.slice(0, brk > 0 ? brk : max).trim();
  const rest = text.slice(line1.length).trim();
  return { line1, line2: rest.length > max ? rest.slice(0, max - 1).trim() + '…' : rest };
}

/** Pie arc SVG path generator. */
export function pieArc(pct: number, r: number): string {
  if (pct <= 0) return '';
  const angle = (Math.min(pct, 100) / 100) * 2 * Math.PI;
  if (pct >= 100) return `M 0 ${-r} A ${r} ${r} 0 1 1 0 ${r} A ${r} ${r} 0 1 1 0 ${-r}`;
  const x = Math.sin(angle) * r;
  const y = -Math.cos(angle) * r;
  return `M 0 0 L 0 ${-r} A ${r} ${r} 0 ${pct > 50 ? 1 : 0} 1 ${x} ${y} Z`;
}

/** Edge path generator using d3 curveBasis. */
export function edgePath(pts: LayoutPoint[]): string {
  if (!pts || pts.length < 2) return '';
  return (
    line<LayoutPoint>()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveBasis)(pts) || ''
  );
}

/**
 * Trim edge points so the path starts at the visual boundary of a node
 * (circle or rect) rather than dagre's bounding box edge. Call with pts
 * starting at the node end (reverse+call+reverse for source trimming).
 */
export function trimEdgeToNode(
  pts: LayoutPoint[],
  cx: number,
  cy: number,
  r: number,
  isRect: boolean,
  w: number,
  h: number
): LayoutPoint[] {
  if (pts.length < 2) return pts;

  const outside = (p: LayoutPoint) =>
    isRect
      ? Math.abs(p.x - cx) > w / 2 || Math.abs(p.y - cy) > h / 2
      : Math.hypot(p.x - cx, p.y - cy) > r;

  // Walk from pts[0] (node end) until we exit the boundary
  let i = 0;
  while (i < pts.length - 1 && !outside(pts[i])) i++;
  if (i === 0) return pts;

  const p0 = pts[i - 1]; // last inside point
  const p1 = pts[i];     // first outside point

  let t = 0.5;
  if (isRect) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 10; k++) {
      t = (lo + hi) / 2;
      const x = p0.x + t * (p1.x - p0.x);
      const y = p0.y + t * (p1.y - p0.y);
      if (Math.abs(x - cx) > w / 2 || Math.abs(y - cy) > h / 2) hi = t;
      else lo = t;
    }
  } else {
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const fx = p0.x - cx, fy = p0.y - cy;
    const a = dx * dx + dy * dy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0 && a > 0) {
      const sq = Math.sqrt(disc);
      const t1 = (-b - sq) / (2 * a);
      const t2 = (-b + sq) / (2 * a);
      const valid = [t1, t2].filter((v) => v >= 0 && v <= 1);
      if (valid.length) t = Math.min(...valid);
    }
  }

  const intersect: LayoutPoint = {
    x: p0.x + t * (p1.x - p0.x),
    y: p0.y + t * (p1.y - p0.y),
  };
  return [intersect, ...pts.slice(i)];
}

/** Get paired colors for a node based on active color mode. */
export function getNodeColors(
  nodeId: string,
  rootId: string,
  nodes: GraphNode[],
  mode: ColorMode = 'entity-type',
  countryRanks?: Map<string, number>
): { bg: string; fg: string; light: string } {
  const orig = nodes.find((n) => n.id === nodeId);
  if (!orig || orig.type === 'asset' || orig.id === rootId) {
    return {
      bg: TREE_COLORS.nodeFill,
      fg: TREE_COLORS.teal,
      light: COUNTRY_GRAY.light,
    };
  }

  if (mode === 'country' && countryRanks) {
    const country = orig.headquarters_country || '';
    const rank = countryRanks.get(country);
    if (rank != null && rank < COUNTRY_COLORS.length) return { ...COUNTRY_COLORS[rank] };
    return { ...COUNTRY_GRAY };
  }

  const category = classifyOwnerType(orig);
  return OWNERSHIP_ENTITY_COLORS[category] || OWNERSHIP_ENTITY_COLORS['Other'];
}
