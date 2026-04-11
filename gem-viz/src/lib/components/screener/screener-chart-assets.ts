/**
 * Asset rendering for the Asset Screener Chart.
 * Draws asset circle clusters, hover expand/collapse, status icons,
 * and common asset connection lines.
 */

import {
  select,
  path as d3Path,
  scaleLinear,
  format,
  type Selection,
  type BaseType,
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

  renderAssetLocations(assets, getColor, getAssetHref);

  // For expanded subsidiaries, render assets from each sub-group (and recursively for nested expansions)
  for (const d of data) {
    if (!d.expansion) continue;
    for (const sg of d.expansion.subGroups) {
      const sgShift = LAYOUT.assetsX + LAYOUT.expansionShift;

      if (sg.expansion && sg.expansion.subGroups.length > 0) {
        // Sub-group is itself expanded — render its sub-sub-group assets with extra shift
        for (const ssg of sg.expansion.subGroups) {
          const ssgG = group
            .append('g')
            .attr('class', 'subsidiary-asset-group subsidiary-asset-subgroup subsidiary-asset-subgroup--depth2')
            .attr('id', `subsidiary-asset-group-${CSS.escape(ssg.id)}`)
            .attr('transform', `translate(${sgShift + LAYOUT.expansionShift}, ${ssg.top})`);

          const ssgAssets = ssgG
            .selectAll<SVGGElement, LocationGroup>('.asset')
            .data(ssg.locations)
            .join('g')
            .attr('class', 'asset')
            .attr('id', (loc) => `asset-${loc.locationID}`)
            .attr('transform', (loc) => `translate(0, ${loc.y})`)
            .style('cursor', 'pointer')
            .attr('role', 'link')
            .attr('tabindex', 0)
            .attr('aria-label', (loc) => `Open asset ${loc.units[0]?.name || loc.units[0]?.id || loc.locationID}`)
            .on('click', (_event, locData) => { openAsset(locData.units[0]?.id); })
            .on('keydown', (event, locData) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAsset(locData.units[0]?.id); }
            });

          renderAssetLocations(ssgAssets, getColor, getAssetHref);
        }
      } else {
        // Normal sub-group: render its direct assets
        const subG = group
          .append('g')
          .attr('class', 'subsidiary-asset-group subsidiary-asset-subgroup')
          .attr('id', `subsidiary-asset-group-${CSS.escape(sg.id)}`)
          .attr('transform', `translate(${sgShift}, ${sg.top})`);

        const subAssets = subG
          .selectAll<SVGGElement, LocationGroup>('.asset')
          .data(sg.locations)
          .join('g')
          .attr('class', 'asset')
          .attr('id', (loc) => `asset-${loc.locationID}`)
          .attr('transform', (loc) => `translate(0, ${loc.y})`)
          .style('cursor', 'pointer')
          .attr('role', 'link')
          .attr('tabindex', 0)
          .attr('aria-label', (loc) => `Open asset ${loc.units[0]?.name || loc.units[0]?.id || loc.locationID}`)
          .on('click', (_event, locData) => { openAsset(locData.units[0]?.id); })
          .on('keydown', (event, locData) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAsset(locData.units[0]?.id); }
          });

        renderAssetLocations(subAssets, getColor, getAssetHref);
      }
    }
  }
}

/**
 * Shared rendering logic for a selection of location groups.
 * Used for both top-level subsidiary assets and sub-group assets.
 */
function renderAssetLocations(
  assets: Selection<SVGGElement, LocationGroup, SVGGElement, SubsidiaryGroupData>,
  getColor: (_unit: ChartUnit) => string,
  _getAssetHref: (_assetId: string) => string
): void {
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

  // Draw unit circles for each location via shared molecule renderer
  assets.each(function (locData) {
    const el = select<SVGGElement, LocationGroup>(this);
    const unitGroup = el.append('g').attr('class', 'unit-group');
    const N = locData.units.length;
    const r = locData.r;
    const littleR = (LAYOUT.assetMarkHeightSingle / 2) * 0.6;
    const circleR = N === 1 ? r : littleR;

    // Normalize to MoleculeUnit[]
    const moleculeUnits: MoleculeUnit[] = locData.units.map((u) => ({
      color: getColor(u),
      ownershipPct: u.spotlightOwnershipSharePct,
    }));

    const { positions } = drawMolecule(unitGroup, moleculeUnits, {
      ringRadius: r,
      unitRadius: circleR,
    });

    // Stash positions on data for hover expand/collapse
    locData.units.forEach((p, j) => {
      (p as ChartUnit & { _x: number; _y: number })._x = positions[j].x;
      (p as ChartUnit & { _y: number; _x: number })._y = positions[j].y;
    });

    // Status icons (appended to each molecule-unit group)
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
      const name = cleanAssetName(unit.name, unit.project_name);

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
    .style('font-size', '14px')
    .style('font-weight', 800)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.1em')
    .style('fill', colors.midnight)
    .text((u) => getStatusLabel(u.status));

  labels
    .filter((u) => getStatusLabel(u.status) !== 'operating')
    .append('tspan')
    .style('font-size', '13px')
    .style('font-weight', 800)
    .style('fill', colors.grey)
    .text(' | ');

  // Asset name
  labels
    .append('tspan')
    .style('font-size', '14px')
    .style('font-weight', 500)
    .style('letter-spacing', '0.03em')
    .style('fill', colors.navy)
    .text((u) => u.name);

  // Ownership percentage
  labels
    .filter((u) => u.spotlightOwnershipSharePct > 1)
    .append('tspan')
    .style('font-size', '13px')
    .style('font-weight', 800)
    .style('fill', colors.grey)
    .text(' | ');

  labels
    .filter((u) => u.spotlightOwnershipSharePct > 1)
    .append('tspan')
    .style('font-size', '14px')
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

  if (status === 'planned' || PLANNED_STATUSES.has(status)) {
    // Yellow dot for planned/prospective
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
    locationTop: number; // global top of the group that owns this location
    offsetX: number;
    xShift: number; // additional horizontal shift (expansionShift for sub-group assets)
  }

  const lineData: LineDatum[][] = [];

  /**
   * Find a location by asset ID, searching top-level locations and, if the
   * subsidiary is expanded, its sub-group locations too.
   */
  function findLocation(
    subsidiary: SubsidiaryGroupData,
    assetId: string
  ): { location: LocationGroup; locationTop: number; xShift: number } | null {
    // Check direct locations first (non-expanded subsidiaries)
    const direct = subsidiary.locations.find((loc) => loc.units.some((u) => u.id === assetId));
    if (direct) return { location: direct, locationTop: subsidiary.top, xShift: 0 };

    // Check sub-group locations for expanded subsidiaries
    if (subsidiary.expansion) {
      for (const sg of subsidiary.expansion.subGroups) {
        const inSub = sg.locations.find((loc) => loc.units.some((u) => u.id === assetId));
        if (inSub) return { location: inSub, locationTop: sg.top, xShift: LAYOUT.expansionShift };
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

      // Try to get text width from rendered label — search in direct group or sub-group
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
