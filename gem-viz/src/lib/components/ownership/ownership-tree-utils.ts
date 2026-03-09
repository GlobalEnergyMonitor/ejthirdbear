/**
 * Pure utility functions and design constants for OwnershipTreeGraph.
 */

import type { GraphNode, LayoutPoint } from '$lib/component-data/graph-types';
import { line, curveBasis } from 'd3-shape';

// Design tokens — matched to Observable notebook
export const TREE_COLORS = {
  navy: '#004A63',
  teal: '#016B83',
  mint: '#9DF7E5',
  warmWhite: '#fafaf7',
  nodeFill: '#BECCCF',
  edge: '#74d2cc',
  edgeImputed: '#d2d2cb',
  midnight: '#002430',
};

// Entity type colors — matched to Observable's colorByOwnershipEntity
export const OWNERSHIP_ENTITY_COLORS: Record<string, { bg: string; fg: string; light: string }> = {
  Government: { bg: '#A0AAE5', fg: '#1a2351', light: '#d0d5f2' },
  'Publicly Listed Corp.': { bg: '#099ED8', fg: '#04304a', light: '#84cfec' },
  'Private Company': { bg: '#65BD8B', fg: '#1a3828', light: '#b2dec5' },
  Other: { bg: '#BECCCF', fg: '#3a4a4f', light: '#dfe6e7' },
};

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

/** Get paired colors for a node using Observable's 4-category classification. */
export function getNodeColors(
  nodeId: string,
  rootId: string,
  nodes: GraphNode[]
): { bg: string; fg: string; light: string } {
  const orig = nodes.find((n) => n.id === nodeId);
  if (!orig || orig.type === 'asset' || orig.id === rootId) {
    return { bg: TREE_COLORS.nodeFill, fg: TREE_COLORS.teal, light: '#dfe6e7' };
  }
  const category = classifyOwnerType(orig);
  return OWNERSHIP_ENTITY_COLORS[category] || OWNERSHIP_ENTITY_COLORS['Other'];
}
