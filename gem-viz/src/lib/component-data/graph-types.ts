/**
 * Graph visualization types for ownership tree components.
 *
 * These interfaces describe the data shapes used by OwnershipTreeGraph
 * and OwnershipMiniTree for dagre layout and SVG rendering of
 * ownership structures.
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
 * while MiniTree's direct fetch normalizes to `name` (lowercase).
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
  /** MiniTree-specific: whether this is the root entity */
  isRoot?: boolean;
  /** MiniTree-specific: asset tracker type slug */
  assetType?: string;
  /** MiniTree-specific: country */
  country?: string;
  /** MiniTree-specific: operating status */
  status?: string;
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
  /** Computed label position from the placement algorithm */
  labelPos: LabelPosition;
}

/**
 * A node positioned by dagre layout for OwnershipMiniTree.
 * Uses a horizontal left-to-right layout with root/entity/asset
 * differentiation instead of circle radius.
 */
export interface MiniLayoutNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  isAsset: boolean;
  label: string;
  pct: number;
  /** Whether this is the root entity node */
  isRoot: boolean;
}

/**
 * An edge positioned by dagre layout, with routed points for SVG path rendering.
 * Used by both OwnershipTreeGraph and OwnershipMiniTree.
 */
export interface LayoutEdge {
  source: string;
  target: string;
  points: LayoutPoint[];
  value: number;
  /** Whether this edge's ownership share was imputed (tree graph only) */
  imputed_share?: boolean;
}

// =============================================================================
// Raw API Response Types (for MiniTree direct fetch from /ownership/graph)
// =============================================================================

/** Raw node shape from the /ownership/graph API endpoint */
export interface RawOwnershipAPINode {
  entity_id?: string;
  asset_id?: string;
  id?: string;
  name?: string;
  asset_name?: string;
  full_name?: string;
  node_type?: string;
  is_root?: boolean;
  asset_type?: string;
  country?: string;
  operating_status?: string;
}

/** Raw edge shape from the /ownership/graph API endpoint */
export interface RawOwnershipAPIEdge {
  source: string;
  target: string;
  value?: number;
  ownership_percentage?: number;
}

/** Shape of the /ownership/graph API JSON response (used by MiniTree direct fetch) */
export interface OwnershipGraphAPIResponse {
  nodes?: RawOwnershipAPINode[];
  edges?: RawOwnershipAPIEdge[];
}
