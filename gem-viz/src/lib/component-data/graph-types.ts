/**
 * Graph visualization types for ownership tree components.
 *
 * These interfaces describe the data shapes used by OwnershipTreeGraph
 * for dagre layout and SVG rendering of ownership structures.
 *
 * Dagre types from @types/dagre are re-exported for convenience.
 */

import type { Edge as DagreEdge, GraphLabel as DagreGraphLabel } from 'dagre';

export type { DagreEdge, DagreGraphLabel };

// =============================================================================
// Input Types (data shapes received as props or processed from API)
// =============================================================================

/**
 * Node in the ownership graph visualization.
 *
 * The `name`/`Name` duality exists because different API code paths use
 * different casing: getOwnershipGraph normalizes to `Name` (uppercase),
 * while direct fetches normalize to `name` (lowercase).
 * Components defensively check both via `n.name || n.Name`.
 *
 * Uses `string` for `type` (not a strict union) to remain compatible with
 * both strict TS callers (ownership-api.ts) and loose JS callers
 * (entity/asset pages using JSDoc or untyped $state).
 */
export interface GraphNode {
  id: string;
  type?: string;
  /** Lowercase name (from MiniTree API processing or raw API) */
  name?: string;
  /** Uppercase Name (from getOwnershipGraph normalization) */
  Name?: string;
  entity_id?: string;
  is_terminal?: boolean;
  is_root?: boolean;
  headquarters_country?: string;
  entity_type?: string;
  /** Whether the entity is publicly listed (used by Observable's ownerType classification) */
  publiclylisted?: boolean;
  /** Asset type label (e.g. "Coal Plant", "Gas Pipeline") for the asset node sub-label */
  asset_type?: string;
  isRoot?: boolean;
  assetType?: string;
  country?: string;
  status?: string;
  // Extended fields from /ownership/graph API (used in tooltips)
  full_name?: string;
  headquarters_subdivision?: string;
  legal_entity_type?: string;
  operating_status?: string;
  capacity_value?: number;
  capacity_unit?: string;
}

/**
 * Edge in the ownership graph visualization.
 * Connects a source (parent/owner) to a target (child/owned entity or asset).
 */
export interface GraphEdge {
  source: string;
  target: string;
  value?: number | null;
  type?: string;
  refUrl?: string | null;
  imputed_share?: boolean;
  closes_cycle?: boolean;
  depth?: number;
}

/**
 * A single ownership path entry from the paths record.
 * Each entry represents one route from the root to a terminal entity,
 * with the cumulative ownership percentage along that route.
 */
export interface OwnershipPathEntry {
  route: string[];
  cumulative_pct: number;
}

// =============================================================================
// Layout Types (positioned by dagre for SVG rendering)
// =============================================================================

/** A 2D point used for edge routing by dagre */
export interface LayoutPoint {
  x: number;
  y: number;
}

/** Label positioning computed by the label placement algorithm in OwnershipTreeGraph */
export interface LabelPosition {
  dx: number;
  dy: number;
  below: boolean;
  small?: boolean;
  above?: boolean;
}

/**
 * A node positioned by dagre layout for OwnershipTreeGraph.
 * Includes circle radius and computed label position for the
 * vertical bottom-to-top tree layout.
 */
export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isAsset: boolean;
  label: string;
  pct: number;
  /** Circle radius for entity nodes (0 for asset nodes) */
  r: number;
  /** Actual visible circle radius after padding/stroke adjustments (for edge trimming) */
  visualR: number;
  /** Whether this is a small ownership node (< 2% cumulative) — gets half-size rendering */
  isSmallOwnership: boolean;
  /** Computed label position from the placement algorithm */
  labelPos: LabelPosition;
  /** Dagre rank (depth from root), used for staggered entrance animation */
  rank: number;
}

/**
 * An edge positioned by dagre layout, with routed points for SVG path rendering.
 * Used by OwnershipTreeGraph.
 */
export interface LayoutEdge {
  source: string;
  target: string;
  points: LayoutPoint[];
  value: number;
  /** Whether this edge's ownership share was imputed (tree graph only) */
  imputed_share?: boolean;
  /** True if this edge closes a cycle in the ownership graph (back-edge) */
  closes_cycle?: boolean;
}
