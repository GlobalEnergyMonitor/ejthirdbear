/**
 * Asset rendering for the Asset Screener Chart.
 * Draws asset circle clusters, status icons, and common asset connection lines.
 */

import {
  select,
  path as d3Path,
  scaleLinear,
  type Selection,
} from 'd3';
import { colors, statusColors } from '$lib/design-tokens';
import { PLANNED_STATUSES } from '$lib/data-config/tracker-schema';
import { drawMolecule, type MoleculeUnit } from '$lib/components/ownership/molecule-renderer';
import type {
  ScreenerChartData,
  SubsidiaryGroupData,
  LocationGroup,
  ChartUnit,
} from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';
import { cleanAssetName } from './screener-utils';

// ---------------------------------------------------------------------------
// Asset render callbacks (bridge D3 events → Svelte state)
// ---------------------------------------------------------------------------

export interface AssetRenderCallbacks {
  onAssetHover?: (locData: LocationGroup, event: MouseEvent) => void;
  onAssetHoverOut?: () => void;
  onAssetClick?: (locData: LocationGroup, event: MouseEvent) => void;
}

// ---------------------------------------------------------------------------
// Asset groups (circular clusters with status icons)
// ---------------------------------------------------------------------------

export function drawAssetGroups(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  getColor: (_unit: ChartUnit) => string,
  _getAssetHref: (_assetId: string) => string,
  callbacks: AssetRenderCallbacks = {}
): void {
  // For expanded subsidiaries, render no direct locations (they go into sub-groups below)
  const outerGroups = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-asset-group')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-asset-group')
    .attr('id', (d) => `subsidiary-asset-group-${d.id}`)
    .attr('transform', (d) => `translate(${LAYOUT.assetsX}, ${d.top})`);

  // For each location within the subsidiary — skip if expanded (assets come from sub-groups)
  const assets = outerGroups
    .selectAll<SVGGElement, LocationGroup>('.asset')
    .data((d) => (d.expansion ? [] : d.locations))
    .join('g')
    .attr('class', 'asset')
    .attr('id', (d) => `asset-${d.locationID}`)
    .attr('transform', (d) => `translate(0, ${d.y})`)
    .style('cursor', 'pointer')
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `Open details for ${d.units[0]?.name || d.locationID}`)
    .on('click', (event, locData) => {
      callbacks.onAssetClick?.(locData, event);
    })
    .on('keydown', (event, locData) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        callbacks.onAssetClick?.(locData, event);
      }
    });

  renderAssetLocations(assets, getColor, callbacks);

  // For expanded subsidiaries, render sub-groups recursively at any depth
  for (const d of data) {
    if (!d.expansion) continue;
    renderExpandedSubGroups(group, d.expansion.subGroups, 1, getColor, callbacks);
  }
}

/**
 * Recursively render asset groups for expanded sub-groups at any depth.
 * depth=1 → first level of expansion, depth=2 → second level, etc.
 */
function renderExpandedSubGroups(
  group: Selection<SVGGElement, unknown, null, undefined>,
  subGroups: SubsidiaryGroupData[],
  depth: number,
  getColor: (_unit: ChartUnit) => string,
  callbacks: AssetRenderCallbacks
): void {
  const xShift = LAYOUT.assetsX + depth * LAYOUT.expansionShift;

  for (const sg of subGroups) {
    const sgG = group
      .append('g')
      .attr('class', `subsidiary-asset-group subsidiary-asset-subgroup subsidiary-asset-subgroup--depth${depth}`)
      .attr('id', `subsidiary-asset-group-${CSS.escape(sg.id)}`)
      .attr('transform', `translate(${xShift}, ${sg.top})`);

    if (sg.expansion && sg.expansion.subGroups.length > 0) {
      // Sub-group itself is expanded — recurse, don't render assets at this level
      renderExpandedSubGroups(group, sg.expansion.subGroups, depth + 1, getColor, callbacks);
    } else {
      // Leaf sub-group — render its asset locations
      const sgAssets = sgG
        .selectAll<SVGGElement, LocationGroup>('.asset')
        .data(sg.locations)
        .join('g')
        .attr('class', 'asset')
        .attr('id', (loc) => `asset-${loc.locationID}`)
        .attr('transform', (loc) => `translate(0, ${loc.y})`)
        .style('cursor', 'pointer')
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr('aria-label', (loc) => `Open details for ${loc.units[0]?.name || loc.locationID}`)
        .on('click', (event, locData) => { callbacks.onAssetClick?.(locData, event); })
        .on('keydown', (event, locData) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); callbacks.onAssetClick?.(locData, event); }
        });

      renderAssetLocations(sgAssets, getColor, callbacks);
    }
  }
}

/**
 * Shared rendering logic for a selection of location groups.
 */
function renderAssetLocations(
  assets: Selection<SVGGElement, LocationGroup, SVGGElement, SubsidiaryGroupData>,
  getColor: (_unit: ChartUnit) => string,
  callbacks: AssetRenderCallbacks
): void {
  // Hover background rect — subtle highlight, no expand
  assets
    .append('rect')
    .attr('class', 'asset-hover-bg')
    .attr('x', -10)
    .attr('y', -LAYOUT.assetMarkHeightSingle / 2)
    .attr('width', 300)
    .attr('height', LAYOUT.assetMarkHeightSingle)
    .attr('rx', LAYOUT.assetMarkHeightSingle * 0.25)
    .style('pointer-events', 'all')
    .style('cursor', 'pointer')
    .style('fill', '#f5f0e8')
    .style('stroke', 'none')
    .style('opacity', 0)
    .on('mouseover', function (event, locData) {
      select(this).style('opacity', 0.5);
      callbacks.onAssetHover?.(locData, event);
    })
    .on('mousemove', function (event, locData) {
      callbacks.onAssetHover?.(locData, event);
    })
    .on('mouseout', function () {
      select(this).style('opacity', 0);
      callbacks.onAssetHoverOut?.();
    });

  // Draw unit circles via shared molecule renderer (no ownership arcs)
  assets.each(function (locData) {
    const el = select<SVGGElement, LocationGroup>(this);
    const unitGroup = el.append('g').attr('class', 'unit-group');
    const N = locData.units.length;
    const r = locData.r;
    const littleR = (LAYOUT.assetMarkHeightSingle / 2) * 0.6;
    const circleR = N === 1 ? r : littleR;

    const moleculeUnits: MoleculeUnit[] = locData.units.map((u) => ({
      color: getColor(u),
    }));

    drawMolecule(unitGroup, moleculeUnits, {
      ringRadius: r,
      unitRadius: circleR,
      showOwnership: false,
    });

    // Status icons
    unitGroup.selectAll<SVGGElement, MoleculeUnit>('.molecule-unit').each(function (_d, j) {
      addStatusIcon(select(this) as any, locData.units[j].status_agg, circleR);
    });
  });

  // Asset labels
  assets
    .append('text')
    .attr('class', 'asset-label-main')
    .attr('y', 6)
    .attr('x', LAYOUT.assetMarkHeightCombined + 5)
    .attr('dy', '-0.1em')
    .style('pointer-events', 'none')
    .each(function (locData) {
      const el = select(this);
      const unit = locData.units[0];
      const name = cleanAssetName(unit.name, (unit as any).project_name);

      const type = unit.tracker.toLowerCase();
      let typeLabel = '';
      if (type.includes('pipeline')) typeLabel = 'Pipeline';
      else if (type.includes('mine')) typeLabel = 'Mine';

      if (typeLabel) {
        el.append('tspan')
          .style('font-size', '13px')
          .style('font-weight', 800)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.12em')
          .style('fill', colors.midnight)
          .text(typeLabel);

        el.append('tspan')
          .style('font-size', '14px')
          .style('font-weight', 800)
          .style('fill', colors.grey)
          .text(' | ');
      }

      el.append('tspan')
        .style('font-size', '14px')
        .style('font-weight', 500)
        .style('letter-spacing', '0.03em')
        .style('fill', colors.navy)
        .text(name);

      if (locData.units.length > 1) {
        el.append('tspan')
          .style('font-size', '14px')
          .style('font-weight', 800)
          .style('fill', colors.grey)
          .text(' | ');
        el.append('tspan')
          .style('font-size', '13px')
          .style('font-weight', 500)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.07em')
          .style('fill', '#879294')
          .text(`${locData.units.length} units`);
      }
    });
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function addStatusIcon(
  el: Selection<SVGGElement, ChartUnit, SVGGElement | null, unknown>,
  statusAgg: string,
  r: number,
  center: [number, number] = [0, 0]
): void {
  const status = statusAgg;
  const x = center[0] + r * 1.15;
  const y = center[1] - r * 1.15;

  if (status === 'planned' || PLANNED_STATUSES.has(status)) {
    el.append('circle')
      .attr('transform', `translate(${x},${y})`)
      .attr('r', r * 0.275)
      .style('fill', colors.yellow);
  } else if (status === 'retired') {
    el.append('path')
      .attr('transform', `translate(${x},${y})`)
      .attr('d', drawCross(r))
      .style('fill', 'none')
      .style('stroke', statusColors.retired)
      .style('stroke-width', '1.5px')
      .style('stroke-linecap', 'round');
  } else if (status === 'cancelled') {
    el.append('path')
      .attr('transform', `translate(${x},${y})`)
      .attr('d', drawCross(r))
      .style('fill', 'none')
      .style('stroke', statusColors.cancelled)
      .style('stroke-width', '1.5px')
      .style('stroke-linecap', 'round');
  }
}

/** Draw a small X cross path — exported for use by legend. */
export function drawCross(r: number): string {
  const s = r * 0.25;
  const p = d3Path();
  p.moveTo(-s, s);
  p.lineTo(s, -s);
  p.moveTo(-s, -s);
  p.lineTo(s, s);
  return p.toString();
}

// ---------------------------------------------------------------------------
// Common (shared) asset lines
// ---------------------------------------------------------------------------

export function drawCommonAssetLines(
  assetGroup: Selection<SVGGElement, unknown, null, undefined>,
  lineGroup: Selection<SVGGElement, unknown, null, undefined>,
  subsidiaryGroups: SubsidiaryGroupData[],
  chartData: ScreenerChartData,
  totalHeight: number
): void {
  if (chartData.multiplePathAssets.size === 0) return;

  const scaleDistance = scaleLinear().domain([0, totalHeight]).range([30, 300]);
  const scaleOpacity = scaleLinear().domain([1, 20]).range([0.7, 0.2]).clamp(true);

  interface LineDatum {
    subsidiary: SubsidiaryGroupData;
    location: LocationGroup;
    locationTop: number;
    offsetX: number;
    xShift: number;
  }

  const lineData: LineDatum[][] = [];

  function findLocation(
    node: SubsidiaryGroupData,
    assetId: string,
    xShiftAcc = 0
  ): { location: LocationGroup; locationTop: number; xShift: number } | null {
    const direct = node.locations.find((loc) => loc.units.some((u) => u.id === assetId));
    if (direct) return { location: direct, locationTop: node.top, xShift: xShiftAcc };

    if (node.expansion) {
      for (const sg of node.expansion.subGroups) {
        const result = findLocation(sg, assetId, xShiftAcc + LAYOUT.expansionShift);
        if (result) return result;
      }
    }

    return null;
  }

  chartData.multiplePathAssets.forEach((subsidiaryIds, assetId) => {
    const points: LineDatum[] = [];

    for (const subId of subsidiaryIds) {
      const subsidiary = subsidiaryGroups.find((s) => s.id === subId);
      if (!subsidiary) continue;

      const found = findLocation(subsidiary, assetId);
      if (!found) continue;

      const { location, locationTop, xShift } = found;

      const groupSel = assetGroup.select(`#subsidiary-asset-group-${subId}`);
      const subGroupSel = assetGroup.select(`#subsidiary-asset-group-${CSS.escape(`${subId}`)}`);
      const labelEl = groupSel.empty()
        ? subGroupSel.select(`#asset-${location.locationID}`).select('text')
        : groupSel.select(`#asset-${location.locationID}`).select('text');
      const bbox = labelEl.node() ? (labelEl.node() as SVGTextElement).getBBox() : { width: 100 };

      points.push({
        subsidiary,
        location,
        locationTop,
        xShift,
        offsetX: bbox.width + LAYOUT.assetMarkHeightCombined + 15,
      });
    }

    if (points.length !== 2) return;
    points.sort((a, b) => a.locationTop - b.locationTop);

    const startId = points[0].location.locationID;
    const endId = points[1].location.locationID;
    const exists = lineData.some(
      (line) =>
        (line[0].location.locationID === startId && line[1].location.locationID === endId) ||
        (line[0].location.locationID === endId && line[1].location.locationID === startId)
    );
    if (!exists) lineData.push(points);
  });

  if (lineData.length === 0) return;

  for (const points of lineData) {
    const p = d3Path();
    const xS = LAYOUT.assetsX + points[0].xShift + points[0].offsetX;
    const yS = points[0].locationTop + points[0].location.y;
    const xE = LAYOUT.assetsX + points[1].xShift + points[1].offsetX;
    const yE = points[1].locationTop + points[1].location.y;

    const R = scaleDistance(yE - yS) + Math.random() * 45 + 5;
    p.moveTo(xS, yS);
    p.arc(xS, yS + R, R, -Math.PI / 2, 0, false);
    p.lineTo(xE + R, yE - R);
    p.arc(xE, yE - R, R, 0, Math.PI / 2, false);

    lineGroup
      .append('path')
      .attr('d', p.toString())
      .style('fill', 'none')
      .style('stroke', colors.grey)
      .style('stroke-width', '1.5px')
      .style('opacity', scaleOpacity(lineData.length))
      .style('stroke-linecap', 'round')
      .style('mix-blend-mode', 'multiply');
  }
}
