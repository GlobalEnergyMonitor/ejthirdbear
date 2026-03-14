/**
 * Asset rendering for the Asset Screener Chart.
 * Draws asset circle clusters, hover expand/collapse, status icons,
 * and common asset connection lines.
 */

import {
  select,
  arc as d3Arc,
  path as d3Path,
  scaleLinear,
  format,
  type Selection,
  type BaseType,
} from 'd3';
import { colors, statusColors } from '$lib/design-tokens';
import type {
  ScreenerChartData,
  SubsidiaryGroupData,
  LocationGroup,
  ChartUnit,
} from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';
import { cleanAssetName } from './screener-utils';

// ---------------------------------------------------------------------------
// Asset groups (circular clusters with status icons)
// ---------------------------------------------------------------------------

export function drawAssetGroups(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  getColor: (_unit: ChartUnit) => string,
  getAssetHref: (_assetId: string) => string
): void {
  const openAsset = (assetId?: string) => {
    if (!assetId) return;
    const href = getAssetHref(assetId);
    if (!href || typeof window === 'undefined') return;
    window.location.assign(href);
  };

  const outerGroups = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-asset-group')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-asset-group')
    .attr('id', (d) => `subsidiary-asset-group-${d.id}`)
    .attr('transform', (d) => `translate(${LAYOUT.assetsX}, ${d.top})`);

  // For each location within the subsidiary
  const assets = outerGroups
    .selectAll<SVGGElement, LocationGroup>('.asset')
    .data((d) => d.locations)
    .join('g')
    .attr('class', 'asset')
    .attr('id', (d) => `asset-${d.locationID}`)
    .attr('transform', (d) => `translate(0, ${d.y})`)
    .style('cursor', 'pointer')
    .attr('role', 'link')
    .attr('tabindex', 0)
    .attr('aria-label', (d) => `Open asset ${d.units[0]?.name || d.units[0]?.id || d.locationID}`)
    .on('click', (_event, locData) => {
      openAsset(locData.units[0]?.id);
    })
    .on('keydown', (event, locData) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openAsset(locData.units[0]?.id);
      }
    });

  // Hover background rect (invisible hit area, expands on hover)
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
    .style('filter', 'none')
    .style('opacity', 0)
    .on('mouseover', function (_event, locData) {
      expandAssetHover(select(this), locData);
    })
    .on('mouseout', function (_event, locData) {
      collapseAssetHover(select(this), locData);
    });

  // Draw unit circles for each location
  assets.each(function (locData) {
    const el = select<SVGGElement, LocationGroup>(this);
    const unitGroup = el.append('g').attr('class', 'unit-group');
    const N = locData.units.length;
    const TAU = Math.PI * 2;
    const r = locData.r;
    const littleR = (LAYOUT.assetMarkHeightSingle / 2) * 0.6;
    const circleR = N === 1 ? r : littleR;

    // Ring for multi-unit locations
    if (N > 1) {
      unitGroup
        .append('circle')
        .attr('class', 'unit-ring')
        .attr('r', r)
        .style('fill', 'none')
        .style('stroke', '#aab2c0')
        .style('stroke-width', '2px')
        .style('pointer-events', 'none');
    }

    // Ownership arc generator
    const ownershipArc = d3Arc<{ endAngle: number }>()
      .innerRadius(0)
      .outerRadius(circleR + 0.625)
      .startAngle(0);

    // Unit circles
    const unitMarks = unitGroup
      .selectAll<SVGGElement, ChartUnit>('.unit-mark')
      .data(locData.units)
      .join('g')
      .attr('class', 'unit-mark')
      .each(function (p, j) {
        (p as ChartUnit & { _x: number; _y: number })._x =
          N === 1 ? 0 : r * Math.cos((TAU * j) / N);
        (p as ChartUnit & { _x: number; _y: number })._y =
          N === 1 ? 0 : r * Math.sin((TAU * j) / N);
      })
      .attr('transform', (p) => {
        const px = (p as ChartUnit & { _x: number })._x ?? 0;
        const py = (p as ChartUnit & { _y: number })._y ?? 0;
        return `translate(${px},${py})`;
      })
      .style('isolation', 'isolate');

    // Filled circle
    unitMarks
      .append('circle')
      .attr('class', 'unit-circle')
      .attr('r', circleR)
      .style('fill', (d) => getColor(d))
      .style('mix-blend-mode', 'multiply')
      .style('pointer-events', 'none');

    // Partial ownership indicator
    unitMarks
      .filter((p) => p.spotlightOwnershipSharePct > 1 && p.spotlightOwnershipSharePct < 100)
      .append('path')
      .attr('class', 'unit-ownership-arc')
      .attr('d', (p) =>
        ownershipArc({ endAngle: 2 * Math.PI * (p.spotlightOwnershipSharePct / 100) })
      )
      .style('fill', colors.midnight)
      .style('fill-opacity', 0.1)
      .style('stroke', 'white')
      .style('stroke-width', '1.25px')
      .style('stroke-opacity', 0.6)
      .style('pointer-events', 'none');

    // Status icons
    unitMarks.each(function (p) {
      addStatusIcon(select(this), p.status_agg, circleR);
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
      const name = cleanAssetName(unit.name);

      const type = unit.tracker.toLowerCase();
      let typeLabel = '';
      if (type.includes('pipeline')) typeLabel = 'Pipeline';
      else if (type.includes('mine')) typeLabel = 'Mine';

      if (typeLabel) {
        el.append('tspan')
          .style('font-size', '9px')
          .style('font-weight', 800)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.12em')
          .style('fill', colors.midnight)
          .text(typeLabel);

        el.append('tspan')
          .style('font-size', '10px')
          .style('font-weight', 800)
          .style('fill', colors.grey)
          .text(' | ');
      }

      el.append('tspan')
        .style('font-size', '12px')
        .style('font-weight', 500)
        .style('letter-spacing', '0.03em')
        .style('fill', colors.navy)
        .text(name);

      if (locData.units.length > 1) {
        el.append('tspan')
          .style('font-size', '10px')
          .style('font-weight', 800)
          .style('fill', colors.grey)
          .text(' | ');
        el.append('tspan')
          .style('font-size', '9px')
          .style('font-weight', 500)
          .style('text-transform', 'uppercase')
          .style('letter-spacing', '0.07em')
          .style('fill', '#879294')
          .text(`${locData.units.length} units`);
      }
    });
}

// ---------------------------------------------------------------------------
// Hover expand / collapse
// ---------------------------------------------------------------------------

function expandAssetHover(
  bgRect: Selection<SVGRectElement, LocationGroup, BaseType, unknown>,
  locData: LocationGroup
): void {
  const parent = select(bgRect.node()?.parentNode as SVGGElement);
  const N = locData.units.length;
  const LINE_H = 25;

  // Raise to top of SVG stacking order
  parent.raise();

  // Expand background rect with warm fill + subtle shadow
  bgRect
    .transition('reshape')
    .duration(400)
    .attr('x', -20)
    .attr('y', -LAYOUT.assetMarkHeightSingle / 2 - 10)
    .attr('width', 560)
    .attr('height', N * LINE_H + LINE_H / 2)
    .attr('rx', 12)
    .attr('ry', 12)
    .style('opacity', 1)
    .style('stroke', '#e0ddd4')
    .style('stroke-width', '1px')
    .style('filter', 'url(#hover-shadow)');

  // Fade out ring + summary label
  parent.selectAll('.unit-ring').transition('fade').duration(300).style('opacity', 0);
  parent.selectAll('.asset-label-main').transition('fade').duration(300).style('opacity', 0);

  // Spread unit marks vertically with scale-up
  parent
    .selectAll<SVGGElement, ChartUnit>('.unit-mark')
    .transition('move')
    .duration(400)
    .delay(100)
    .attr('transform', (_p, j) => `translate(0,${j * LINE_H}) scale(${N === 1 ? 1 : 1.5})`);

  // Add detail labels to each unit mark
  // Scale compensates for unit-mark's 1.5x transform so text is readable
  const textScale = N === 1 ? 0.85 : 0.55;
  const labels = parent
    .selectAll<SVGGElement, ChartUnit>('.unit-mark')
    .append('text')
    .attr('class', 'unit-name')
    .attr('transform', `scale(${textScale})`)
    .attr('x', ((LAYOUT.assetMarkHeightCombined + 10) / textScale) * (N === 1 ? textScale : 0.55))
    .attr('dy', '0.35em')
    .style('pointer-events', 'none');

  // Status label (skip for operating)
  labels
    .filter((u) => getStatusLabel(u.status) !== 'operating')
    .append('tspan')
    .style('font-size', '10px')
    .style('font-weight', 800)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.1em')
    .style('fill', colors.midnight)
    .text((u) => getStatusLabel(u.status));

  labels
    .filter((u) => getStatusLabel(u.status) !== 'operating')
    .append('tspan')
    .style('font-size', '11px')
    .style('font-weight', 800)
    .style('fill', colors.grey)
    .text(' | ');

  // Asset name
  labels
    .append('tspan')
    .style('font-size', '12px')
    .style('font-weight', 500)
    .style('letter-spacing', '0.03em')
    .style('fill', colors.navy)
    .text((u) => u.name);

  // Ownership percentage
  labels
    .filter((u) => u.spotlightOwnershipSharePct > 1)
    .append('tspan')
    .style('font-size', '11px')
    .style('font-weight', 800)
    .style('fill', colors.grey)
    .text(' | ');

  labels
    .filter((u) => u.spotlightOwnershipSharePct > 1)
    .append('tspan')
    .style('font-size', '10px')
    .style('font-weight', 500)
    .style('font-style', 'italic')
    .style('letter-spacing', '0.05em')
    .style('fill', '#879294')
    .text((u) => `Ownership: ${format('.0%')(u.spotlightOwnershipSharePct / 100)}`);

  // Fade labels in after units have moved
  labels.style('opacity', 0).transition('fade').duration(200).delay(300).style('opacity', 1);
}

function collapseAssetHover(
  bgRect: Selection<SVGRectElement, LocationGroup, BaseType, unknown>,
  _locData: LocationGroup
): void {
  const parent = select(bgRect.node()?.parentNode as SVGGElement);

  // Collapse background rect
  bgRect
    .transition('reshape')
    .duration(400)
    .attr('x', -10)
    .attr('y', -LAYOUT.assetMarkHeightSingle / 2)
    .attr('width', 300)
    .attr('height', LAYOUT.assetMarkHeightSingle)
    .attr('rx', LAYOUT.assetMarkHeightSingle * 0.25)
    .attr('ry', LAYOUT.assetMarkHeightSingle * 0.25)
    .style('opacity', 0)
    .style('stroke', 'none')
    .style('filter', 'none');

  // Restore ring + summary label
  parent.selectAll('.unit-ring').transition('fade').duration(300).style('opacity', 1);
  parent.selectAll('.asset-label-main').transition('fade').duration(300).style('opacity', 1);

  // Return unit marks to circular cluster positions
  parent
    .selectAll<SVGGElement, ChartUnit>('.unit-mark')
    .transition('move')
    .duration(300)
    .attr('transform', (u) => {
      const ux = (u as ChartUnit & { _x?: number })._x ?? 0;
      const uy = (u as ChartUnit & { _y?: number })._y ?? 0;
      return `translate(${ux},${uy}) scale(1)`;
    });

  // Remove detail labels immediately
  parent.selectAll('.unit-name').remove();
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function getStatusLabel(status: string): string {
  const s = status?.toLowerCase() || '';
  if (s.includes('retired') || s.includes('mothballed')) return 'retired';
  if (s.includes('cancel')) return 'cancelled';
  if (s.includes('propos') || s.includes('announce') || s.includes('permit')) return 'proposed';
  return 'operating';
}

function addStatusIcon(
  el: Selection<SVGGElement, ChartUnit, SVGGElement | null, unknown>,
  statusAgg: string,
  r: number,
  center: [number, number] = [0, 0]
): void {
  const status = statusAgg;
  const x = center[0] + r * 1.15;
  const y = center[1] - r * 1.15;

  if (status === 'planned' || status === 'proposed') {
    // Yellow dot
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
// Common (shared) asset lines — bezier curves connecting assets owned by
// multiple subsidiaries
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
    offsetX: number;
  }

  const lineData: LineDatum[][] = [];

  chartData.multiplePathAssets.forEach((subsidiaryIds, assetId) => {
    const points: LineDatum[] = [];

    for (const subId of subsidiaryIds) {
      const subsidiary = subsidiaryGroups.find((s) => s.id === subId);
      if (!subsidiary) continue;

      const location = subsidiary.locations.find((loc) => loc.units.some((u) => u.id === assetId));
      if (!location) continue;

      // Try to get text width from rendered label
      const labelEl = assetGroup
        .select(`#subsidiary-asset-group-${subId}`)
        .select(`#asset-${location.locationID}`)
        .select('text');
      const bbox = labelEl.node() ? (labelEl.node() as SVGTextElement).getBBox() : { width: 100 };

      points.push({
        subsidiary,
        location,
        offsetX: bbox.width + LAYOUT.assetMarkHeightCombined + 15,
      });
    }

    if (points.length !== 2) return;
    points.sort((a, b) => a.subsidiary.top - b.subsidiary.top);

    // Dedup
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
    const xS = LAYOUT.assetsX + points[0].offsetX;
    const yS = points[0].subsidiary.top + points[0].location.y;
    const xE = LAYOUT.assetsX + points[1].offsetX;
    const yE = points[1].subsidiary.top + points[1].location.y;

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
