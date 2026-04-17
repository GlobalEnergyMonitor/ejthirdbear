/**
 * molecule-renderer.ts — Canonical asset "molecule" ring visualization.
 *
 * Draws a cluster of unit circles arranged in a ring with optional ownership
 * arcs. Used by AssetRingVisualization (Svelte wrapper), screener chart, and
 * portfolio explorer.
 *
 * Reference: Observable notebook 5a1f34aee34fe4cf (EJ Fox, GEM).
 *
 * Visual spec (from Observable, with -π/2 start angle):
 *  - Ring: stroke #aab2c0, 2px, fill none (only if N > 1)
 *  - Units: mix-blend-mode multiply, isolation isolate on parent <g>
 *  - Ownership arc: d3.arc innerRadius 0, outerRadius circleR + 0.625,
 *    startAngle -π/2, fill colors.midnight, fill-opacity 0.1,
 *    stroke white 1.25px opacity 0.6, only if 1 < pct < 100
 */

import { arc as d3Arc, type Selection } from 'd3';
import { colors } from '$lib/design-tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One unit in the molecule. Caller normalizes their data into this shape. */
export interface MoleculeUnit {
  /** Fill color for the unit circle (caller resolves from status/type/etc.) */
  color: string;
  /** Ownership percentage 0–100. Arc drawn only when 1 < pct < 100. */
  ownershipPct?: number;
  /** Optional opacity override for the unit circle. Default: 1. */
  opacity?: number;
}

export interface MoleculeOptions {
  /** Radius of the ring that units are arranged on (ignored for N=1). */
  ringRadius: number;
  /** Radius of each individual unit circle. */
  unitRadius: number;
  /** Ring stroke color. Default: '#aab2c0' (Observable spec). */
  ringStroke?: string;
  /** Ring stroke width. Default: 1. */
  ringStrokeWidth?: number;
  /** Whether to draw ownership arcs. Default: true. */
  showOwnership?: boolean;
  /** CSS class prefix for generated elements. Default: 'molecule'. */
  classPrefix?: string;
}

export interface MoleculeRenderResult {
  /** Computed (x, y) positions for each unit, in order. */
  positions: Array<{ x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// Constants (from Observable notebook, except startAngle which we keep at -π/2)
// ---------------------------------------------------------------------------

const START_ANGLE = -Math.PI / 2;
const TAU = Math.PI * 2;

const OWNERSHIP_FILL = colors.midnight; // #1D4961
const OWNERSHIP_FILL_OPACITY = 0.1;
const OWNERSHIP_STROKE = 'white';
const OWNERSHIP_STROKE_WIDTH = 1.25;
const OWNERSHIP_STROKE_OPACITY = 0.6;

const DEFAULT_RING_STROKE = '#aab2c0';
const DEFAULT_RING_STROKE_WIDTH = 2;

// ---------------------------------------------------------------------------
// Core drawing function
// ---------------------------------------------------------------------------

/**
 * Draw an asset molecule (ring of unit circles with ownership arcs)
 * into the given D3 selection (should be a `<g>` element).
 *
 * The molecule is drawn centered at (0, 0). Caller positions via transform.
 * Existing children are NOT cleared — caller manages lifecycle.
 */
export function drawMolecule(
  g: Selection<SVGGElement, unknown, any, any>,
  units: MoleculeUnit[],
  options: MoleculeOptions
): MoleculeRenderResult {
  const {
    ringRadius,
    unitRadius,
    ringStroke = DEFAULT_RING_STROKE,
    ringStrokeWidth = DEFAULT_RING_STROKE_WIDTH,
    showOwnership = true,
    classPrefix = 'molecule',
  } = options;

  const N = units.length;
  const positions = computePositions(N, ringRadius);

  // --- Connecting ring (multi-unit only) ---
  if (N > 1) {
    g.append('circle')
      .attr('class', `${classPrefix}-ring`)
      .attr('r', ringRadius)
      .style('fill', 'none')
      .style('stroke', ringStroke)
      .style('stroke-width', ringStrokeWidth)
      .style('pointer-events', 'none');
  }

  // --- Ownership arc generator ---
  const ownershipArc = d3Arc<{ endAngle: number }>()
    .innerRadius(0)
    .outerRadius(unitRadius + 0.625)
    .startAngle(START_ANGLE);

  // --- Unit groups ---
  const unitGroups = g
    .selectAll<SVGGElement, MoleculeUnit>(`.${classPrefix}-unit`)
    .data(units)
    .join('g')
    .attr('class', `${classPrefix}-unit`)
    .attr('transform', (_d, i) => `translate(${positions[i].x},${positions[i].y})`)
    .style('isolation', 'isolate');

  // Filled circle
  unitGroups
    .append('circle')
    .attr('class', `${classPrefix}-circle`)
    .attr('r', unitRadius)
    .style('fill', (d) => d.color)
    .style('opacity', (d) => d.opacity ?? 1)
    .style('mix-blend-mode', 'multiply')
    .style('pointer-events', 'none');

  // Ownership arc
  if (showOwnership) {
    unitGroups
      .filter((d) => d.ownershipPct != null && d.ownershipPct > 1 && d.ownershipPct < 100)
      .append('path')
      .attr('class', `${classPrefix}-ownership`)
      .attr('d', (d) =>
        ownershipArc({
          endAngle: START_ANGLE + TAU * ((d.ownershipPct ?? 0) / 100),
        })
      )
      .style('fill', OWNERSHIP_FILL)
      .style('fill-opacity', OWNERSHIP_FILL_OPACITY)
      .style('stroke', OWNERSHIP_STROKE)
      .style('stroke-width', OWNERSHIP_STROKE_WIDTH)
      .style('stroke-opacity', OWNERSHIP_STROKE_OPACITY)
      .style('pointer-events', 'none');
  }

  return { positions };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute unit positions for N units evenly spaced on a ring. */
export function computePositions(
  count: number,
  ringRadius: number
): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  if (count === 1) return [{ x: 0, y: 0 }];

  return Array.from({ length: count }, (_, i) => ({
    x: ringRadius * Math.cos(START_ANGLE + (TAU * i) / count),
    y: ringRadius * Math.sin(START_ANGLE + (TAU * i) / count),
  }));
}

/**
 * Ring-radius scale factor based on unit count.
 * Matches Observable notebook scale_r: d3.scaleLinear()
 *   .domain([2, 10, 20]).range([0.5, 1, 1.5]).clamp(true)
 * Extended with additional steps for very large counts so the
 * ring grows gently instead of clamping at 1.5.
 */
export function scaleR(n: number): number {
  // Piecewise linear: [2→0.5, 10→1.0, 20→1.5, 40→2.0]
  if (n <= 2) return 0.5;
  if (n <= 10) return 0.5 + ((n - 2) / 8) * 0.5; // 2→10: 0.5→1.0
  if (n <= 20) return 1.0 + ((n - 10) / 10) * 0.5; // 10→20: 1.0→1.5
  if (n <= 40) return 1.5 + ((n - 20) / 20) * 0.5; // 20→40: 1.5→2.0
  return 2.0; // 40+: clamp at 2.0
}

/**
 * Compute ring and unit radii given layout parameters and unit count.
 *
 * Follows the Observable notebook approach:
 *  - ringRadius = baseRadius * scaleR(N)
 *  - unitRadius = (assetMarkHeightSingle / 2) * 0.6
 *
 * The `maxDiameter` is used as `assetMarkHeightCombined` (the base for ring sizing).
 * An optional `singleUnitDiameter` maps to `assetMarkHeightSingle` (for unit dot size).
 */
export function computeMoleculeRadii(
  maxDiameter: number,
  unitCount: number,
  opts?: { singleUnitDiameter?: number; minUnitRadius?: number; maxUnitRadius?: number }
): { ringRadius: number; unitRadius: number } {
  const { singleUnitDiameter, minUnitRadius = 2, maxUnitRadius = 10 } = opts ?? {};
  const singleD = singleUnitDiameter ?? maxDiameter * 0.6;

  if (unitCount <= 1) {
    return { ringRadius: 0, unitRadius: Math.min(maxUnitRadius, singleD / 2) };
  }

  const ringRadius = (maxDiameter / 2) * scaleR(unitCount);
  const unitRadius = Math.max(minUnitRadius, Math.min(maxUnitRadius, (singleD / 2) * 0.6));

  return { ringRadius, unitRadius };
}
