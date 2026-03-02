/**
 * D3 rendering module for the Asset Screener Chart.
 * Ported from Observable notebook a8d94cdc4a420709@929.
 *
 * All drawing is imperative D3 — called once per data change into a container element.
 */

import { select, arc as d3Arc, path as d3Path, scaleLinear, format } from 'd3';
import {
  colors,
  trackerColors,
  statusColors,
  colorByTracker,
  colorByStatus,
  getStatusGroup,
  getTrackerColor,
} from '$lib/design-tokens';
import type {
  ScreenerChartData,
  SubsidiaryGroupData,
  LocationGroup,
  ChartUnit,
  BarDatum,
} from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = { top: 80, right: 40, bottom: 120, left: 20 };
const COL_STROKE = '#d8d8ce';
const COL_FILL = '#fafaf7';
const COL_BG_LIGHT = '#f7f7f3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ColorField = 'tracker' | 'status';

export interface RenderOptions {
  width?: number;
  colorField?: ColorField;
}

// ---------------------------------------------------------------------------
// Main render entry point
// ---------------------------------------------------------------------------

/**
 * Render the full screener chart into a container element.
 * Returns a cleanup function.
 */
export function renderChart(
  container: HTMLElement,
  chartData: ScreenerChartData,
  subsidiaryGroups: SubsidiaryGroupData[],
  options: RenderOptions = {}
): () => void {
  const width = options.width ?? 1000;
  const colorField: ColorField = options.colorField ?? 'tracker';

  container.innerHTML = '';

  if (subsidiaryGroups.length === 0) return () => {};

  // Compute total height
  const lastGroup = subsidiaryGroups[subsidiaryGroups.length - 1];
  const contentHeight = lastGroup.bottom + LAYOUT.yPadding;
  const svgHeight = contentHeight + MARGIN.top + MARGIN.bottom;

  // Color resolver for units
  const getUnitColor = (unit: ChartUnit): string => {
    if (colorField === 'status') {
      return colorByStatus.get(unit.status_agg) || statusColors.unknown;
    }
    return getTrackerColor(unit.tracker);
  };

  // Create SVG
  const svg = select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${width} ${svgHeight}`)
    .style('font-family', "'Plus Jakarta Sans', system-ui, sans-serif")
    .style('overflow', 'visible');

  // Defs
  const defs = svg.append('defs');
  addGradient(defs);

  // Main group
  const main = svg
    .append('g')
    .attr('class', 'chart-main')
    .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`);

  // --- Title ---
  main
    .append('text')
    .attr('x', LAYOUT.subsidX)
    .attr('y', -MARGIN.top + 30)
    .style('font-size', '18px')
    .style('font-weight', 700)
    .style('fill', colors.navy)
    .style('letter-spacing', '0.02em')
    .text(chartData.spotlightOwner.Name);

  const nSubs = chartData.subsidiariesMatched.size;
  const nDirect = chartData.directlyOwned.length;
  let subtitle = `${chartData.assets.length} assets`;
  if (nSubs > 0) subtitle += ` across ${nSubs} ${nSubs === 1 ? 'subsidiary' : 'subsidiaries'}`;
  if (nDirect > 0) subtitle += ` (${nDirect} directly owned)`;

  main
    .append('text')
    .attr('x', LAYOUT.subsidX)
    .attr('y', -MARGIN.top + 50)
    .style('font-size', '12px')
    .style('font-weight', 500)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.07em')
    .style('fill', colors.gray500)
    .text(subtitle);

  // --- Vertical connection line ---
  main
    .append('path')
    .attr('d', `M0,-5 L0,${contentHeight - 5}`)
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', '3.5px')
    .style('stroke-linecap', 'round');

  // --- Draw subsidiary groups ---
  const regionGroup = main.append('g').attr('class', 'regions');
  const labelGroup = main.append('g').attr('class', 'labels');
  const assetGroup = main.append('g').attr('class', 'assets');
  const lineGroup = main.append('g').attr('class', 'shared-lines');

  drawSubsidiaryRegions(regionGroup, subsidiaryGroups, contentHeight);
  drawSubsidiaryLabels(labelGroup, subsidiaryGroups, chartData);
  drawAssetGroups(assetGroup, subsidiaryGroups, getUnitColor);
  drawCommonAssetLines(assetGroup, lineGroup, subsidiaryGroups, chartData, contentHeight);

  // --- Legend ---
  drawLegend(svg, chartData, colorField, width, svgHeight);

  return () => {
    container.innerHTML = '';
  };
}

// ---------------------------------------------------------------------------
// Gradient def
// ---------------------------------------------------------------------------

function addGradient(defs: d3.Selection<SVGDefsElement, unknown, null, undefined>) {
  const gradient = defs
    .append('linearGradient')
    .attr('id', 'gradient-fade')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '100%');

  gradient.append('stop').attr('offset', '0%').attr('stop-color', '#fafaf7').attr('stop-opacity', 1);
  gradient
    .append('stop')
    .attr('offset', '100%')
    .attr('stop-color', COL_BG_LIGHT)
    .attr('stop-opacity', 1);
}

// ---------------------------------------------------------------------------
// Subsidiary lane shapes
// ---------------------------------------------------------------------------

function subsidiaryPath(
  d: SubsidiaryGroupData,
  yOffset: number,
  strokeOnly = false
): string {
  const p = d3Path();
  const xS = 0;
  const yS = d.top;
  const xE = LAYOUT.subsidX + LAYOUT.assetsX - LAYOUT.assetSpacing * 2;
  const yE = d.bottom;
  const radius = LAYOUT.yPadding;
  const xSU = xS;
  const ySU = yS - radius;

  const xCP1 = xS;
  const yCP1 = yS - radius * 0.2;
  const xCP2 = xS + radius * 0.2;
  const yCP2 = yS;

  p.moveTo(xSU, ySU);
  p.bezierCurveTo(xCP1, yCP1, xCP2, yCP2, xS + radius, yS);
  p.lineTo(xE, yS);

  if (strokeOnly) return p.toString();

  const rC = radius * 0.3;
  p.lineTo(xE, yE - rC);
  p.arc(xE - rC, yE - rC, rC, 0, Math.PI / 2, false);
  p.lineTo(xS + rC, yE);
  p.arc(xS + rC, yE - rC, rC, Math.PI / 2, Math.PI, false);
  p.closePath();

  return p.toString();
}

function drawSubsidiaryRegions(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  totalHeight: number
) {
  const regions = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-region')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-region');

  // Background fill
  regions
    .append('path')
    .attr('d', (d) => subsidiaryPath(d, -MARGIN.top - 5))
    .style('fill', 'url(#gradient-fade)');

  // Stroke line (top edge only)
  regions
    .append('path')
    .attr('d', (d) => subsidiaryPath(d, -MARGIN.top - 5, true))
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', '3px')
    .style('stroke-linecap', 'round');
}

// ---------------------------------------------------------------------------
// Subsidiary labels with ownership pie charts
// ---------------------------------------------------------------------------

function drawSubsidiaryLabels(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  chartData: ScreenerChartData
) {
  const markR = (LAYOUT.subsidiaryMarkHeight / 2) * 0.7;
  const labelX = markR + 8;

  const items = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-label')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-label')
    .attr('transform', (d) => `translate(${LAYOUT.subsidX}, ${d.top})`);

  // --- Ownership pie circle ---
  // Background circle
  items
    .filter((d) => d.id !== 'Directly owned')
    .append('circle')
    .attr('cx', 0)
    .attr('cy', markR)
    .attr('r', markR + 0.625)
    .style('fill', '#cce1e6')
    .style('stroke', '#ffffff')
    .style('stroke-width', '1.25px');

  // Ownership arc
  const ownershipArc = d3Arc<{ endAngle: number }>()
    .innerRadius(0)
    .outerRadius(markR)
    .startAngle(0)
    .cornerRadius(markR * 0.1);

  items
    .filter((d) => d.id !== 'Directly owned')
    .append('path')
    .attr('transform', `translate(0, ${markR})`)
    .attr('d', (d) => {
      const edge = chartData.matchedEdges.get(d.id);
      const pct = edge?.value ?? 100;
      return ownershipArc({ endAngle: 2 * Math.PI * (pct / 100) });
    })
    .style('pointer-events', 'none')
    .style('fill', (d) => {
      const edge = chartData.matchedEdges.get(d.id);
      return edge?.value ? colors.teal : 'none';
    });

  // --- Name text ---
  // Track whether each name wraps so we can offset subsequent elements
  const nameWrapped = new Map<string, boolean>();

  items
    .append('text')
    .attr('x', labelX)
    .attr('y', markR)
    .attr('dy', '0.35em')
    .style('fill', colors.navy)
    .style('font-size', '13px')
    .style('letter-spacing', '0.03em')
    .style('font-weight', 500)
    .each(function (d) {
      const name = chartData.entityMap.get(d.id)?.Name || (d.id === 'Directly owned' ? 'Directly owned' : d.id);
      const wrapped = name.length > 22;
      nameWrapped.set(d.id, wrapped);
      wrapTextTwoLines(select(this), name, 22);
    });

  // Vertical offsets: account for two-line names
  const LINE_HEIGHT = 18; // extra space when name wraps

  // --- Ownership percentage text ---
  items
    .filter((d) => d.id !== 'Directly owned')
    .append('text')
    .attr('x', labelX)
    .attr('y', (d) => markR + 24 + (nameWrapped.get(d.id) ? LINE_HEIGHT : 0))
    .style('font-size', '10px')
    .style('font-weight', 500)
    .style('font-style', 'italic')
    .style('fill', colors.gray500)
    .style('letter-spacing', '0.05em')
    .text((d) => {
      const edge = chartData.matchedEdges.get(d.id);
      if (!edge?.value) return '';
      return `${format('.0f')(edge.value)}% ownership`;
    });

  // --- Mini bar charts ---
  // Each item gets its own offset based on whether name wrapped
  items.each(function (d) {
    const wrapped = nameWrapped.get(d.id) || false;
    const barY = markR + 42 + (wrapped ? LINE_HEIGHT : 0);
    drawMiniBarChartsForItem(select(this), d, barY);
  });
}

// ---------------------------------------------------------------------------
// Mini bar charts (tracker type + status per subsidiary)
// ---------------------------------------------------------------------------

function drawMiniBarChartsForItem(
  item: d3.Selection<SVGGElement, SubsidiaryGroupData, null, undefined>,
  d: SubsidiaryGroupData,
  startY: number
) {
  const scaleW = scaleLinear().domain([0, 1]).range([0, 160]);
  const BAR_HEIGHT = 7;
  const BAR_PAD = 2;

  // Tracker bars
  const trackerGroup = item
    .append('g')
    .attr('class', 'bar-group-tracker')
    .attr('transform', `translate(0, ${startY})`);

  trackerGroup
    .append('text')
    .attr('dy', '-0.4em')
    .style('font-size', '8px')
    .style('font-weight', 500)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.07em')
    .style('fill', colors.gray400)
    .text('TYPE');

  trackerGroup
    .selectAll<SVGRectElement, BarDatum>('.bar-tracker')
    .data(d.summary_data.tracker)
    .join('rect')
    .attr('class', 'bar-tracker')
    .attr('x', (bd, i) => scaleW(bd.x_percentage) + BAR_PAD * i)
    .attr('y', 0)
    .attr('height', BAR_HEIGHT)
    .attr('width', (bd) => Math.max(0, scaleW(bd.percentage)))
    .attr('rx', BAR_HEIGHT * 0.25)
    .attr('ry', BAR_HEIGHT * 0.25)
    .style('fill', (bd) => getTrackerColor(bd.tracker || ''));

  // Status bars
  const statusGroup = item
    .append('g')
    .attr('class', 'bar-group-status')
    .attr('transform', `translate(0, ${startY + BAR_HEIGHT + 14})`);

  statusGroup
    .append('text')
    .attr('dy', '-0.4em')
    .style('font-size', '8px')
    .style('font-weight', 500)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.07em')
    .style('fill', colors.gray400)
    .text('STATUS');

  statusGroup
    .selectAll<SVGRectElement, BarDatum>('.bar-status')
    .data(d.summary_data.status)
    .join('rect')
    .attr('class', 'bar-status')
    .attr('x', (bd, i) => scaleW(bd.x_percentage) + BAR_PAD * i)
    .attr('y', 0)
    .attr('height', BAR_HEIGHT)
    .attr('width', (bd) => Math.max(0, scaleW(bd.percentage)))
    .attr('rx', BAR_HEIGHT * 0.25)
    .attr('ry', BAR_HEIGHT * 0.25)
    .style('fill', (bd) => colorByStatus.get(bd.status || '') || statusColors.unknown);
}

// ---------------------------------------------------------------------------
// Asset groups (circular clusters with status icons)
// ---------------------------------------------------------------------------

function drawAssetGroups(
  group: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  getColor: (unit: ChartUnit) => string
) {
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
    .attr('transform', (d) => `translate(0, ${d.y})`);

  // Hover background rect
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
    .style('fill', COL_BG_LIGHT)
    .style('opacity', 0)
    .on('mouseover', function () {
      select(this).transition().duration(200).style('opacity', 1);
    })
    .on('mouseout', function () {
      select(this).transition().duration(200).style('opacity', 0);
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
        (p as ChartUnit & { _x: number; _y: number })._x = N === 1 ? 0 : r * Math.cos((TAU * j) / N);
        (p as ChartUnit & { _x: number; _y: number })._y = N === 1 ? 0 : r * Math.sin((TAU * j) / N);
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
      let name = unit.name;
      // Truncate after facility type keyword
      name = name.replace(
        /\b(plant|station|project|center|centre|complex|facility)\b[\s\S]*$/i,
        '$1'
      );

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
// Status icons (proposed, retired, cancelled)
// ---------------------------------------------------------------------------

function addStatusIcon(
  el: d3.Selection<SVGGElement, ChartUnit, SVGGElement | null, unknown>,
  statusAgg: string,
  r: number,
  center: [number, number] = [0, 0]
) {
  const status = statusAgg;
  const x = center[0] + r * 1.15;
  const y = center[1] - r * 1.15;

  if (status === 'prospective' || status === 'proposed') {
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

function drawCross(r: number): string {
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

function drawCommonAssetLines(
  assetGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  lineGroup: d3.Selection<SVGGElement, unknown, null, undefined>,
  subsidiaryGroups: SubsidiaryGroupData[],
  chartData: ScreenerChartData,
  totalHeight: number
) {
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

      const location = subsidiary.locations.find((loc) =>
        loc.units.some((u) => u.id === assetId)
      );
      if (!location) continue;

      // Try to get text width from rendered label
      const labelEl = assetGroup
        .select(`#subsidiary-asset-group-${subId}`)
        .select(`#asset-${location.locationID}`)
        .select('text');
      const bbox = labelEl.node()
        ? (labelEl.node() as SVGTextElement).getBBox()
        : { width: 100 };

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

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function drawLegend(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  chartData: ScreenerChartData,
  colorField: ColorField,
  width: number,
  svgHeight: number
) {
  const legendY = svgHeight - MARGIN.bottom + 30;
  const legend = svg
    .append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${MARGIN.left + LAYOUT.subsidX}, ${legendY})`);

  // Collect unique trackers from data
  const trackers = new Set<string>();
  for (const unit of chartData.assets) {
    if (unit.tracker && unit.tracker !== 'Unknown') trackers.add(unit.tracker);
  }

  // Tracker legend
  if (colorField === 'tracker' && trackers.size > 0) {
    const trackerLegend = legend.append('g').attr('class', 'tracker-legend');
    trackerLegend
      .append('text')
      .attr('y', -6)
      .style('font-size', '9px')
      .style('font-weight', 600)
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.08em')
      .style('fill', colors.gray500)
      .text('ASSET TYPE');

    let x = 0;
    for (const tracker of trackers) {
      const item = trackerLegend.append('g').attr('transform', `translate(${x}, 8)`);
      item
        .append('circle')
        .attr('r', 5)
        .attr('cy', 4)
        .style('fill', getTrackerColor(tracker));
      item
        .append('text')
        .attr('x', 10)
        .attr('y', 4)
        .attr('dy', '0.35em')
        .style('font-size', '11px')
        .style('fill', colors.gray600)
        .text(tracker);

      // Estimate text width
      x += tracker.length * 7 + 30;
    }
  }

  // Status legend (always shown)
  const statusData = ['operating', 'proposed', 'retired', 'cancelled'] as const;
  const statusLegend = legend
    .append('g')
    .attr('class', 'status-legend')
    .attr('transform', `translate(0, ${trackers.size > 0 ? 36 : 0})`);

  statusLegend
    .append('text')
    .attr('y', -6)
    .style('font-size', '9px')
    .style('font-weight', 600)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.08em')
    .style('fill', colors.gray500)
    .text('STATUS');

  let sx = 0;
  for (const status of statusData) {
    const item = statusLegend.append('g').attr('transform', `translate(${sx}, 8)`);
    const circleR = 6;

    item
      .append('circle')
      .attr('r', circleR)
      .attr('cy', 4)
      .style('fill', colorField === 'status'
        ? (colorByStatus.get(status) || statusColors.unknown)
        : colors.grey);

    // Add status icon on the legend circle
    const iconG = item.append('g').attr('transform', `translate(0, 4)`);
    if (status === 'proposed') {
      iconG
        .append('circle')
        .attr('cx', circleR * 1.15)
        .attr('cy', -circleR * 1.15)
        .attr('r', circleR * 0.275)
        .style('fill', colors.yellow);
    } else if (status === 'retired') {
      iconG
        .append('path')
        .attr('transform', `translate(${circleR * 1.15},${-circleR * 1.15})`)
        .attr('d', drawCross(circleR))
        .style('fill', 'none')
        .style('stroke', statusColors.retired)
        .style('stroke-width', '1.5px')
        .style('stroke-linecap', 'round');
    } else if (status === 'cancelled') {
      iconG
        .append('path')
        .attr('transform', `translate(${circleR * 1.15},${-circleR * 1.15})`)
        .attr('d', drawCross(circleR))
        .style('fill', 'none')
        .style('stroke', statusColors.cancelled)
        .style('stroke-width', '1.5px')
        .style('stroke-linecap', 'round');
    }

    item
      .append('text')
      .attr('x', 16)
      .attr('y', 4)
      .attr('dy', '0.35em')
      .style('font-size', '11px')
      .style('text-transform', 'capitalize')
      .style('fill', colors.gray600)
      .text(status);

    sx += status.length * 7 + 40;
  }
}

// ---------------------------------------------------------------------------
// Text wrapping helper
// ---------------------------------------------------------------------------

function wrapTextTwoLines(
  textEl: d3.Selection<SVGTextElement, unknown, null, undefined>,
  text: string,
  charLimit: number
) {
  textEl.selectAll('*').remove();

  if (text.length <= charLimit) {
    textEl.append('tspan').text(text);
    return;
  }

  let breakPos = text.lastIndexOf(' ', charLimit);
  if (breakPos === -1) breakPos = charLimit;

  const line1 = text.slice(0, breakPos).trim();
  let rest = text.slice(breakPos).trim();
  const line2 = rest.length > charLimit ? rest.slice(0, charLimit).trim() + '\u2026' : rest;

  textEl.append('tspan').text(line1);
  textEl
    .append('tspan')
    .attr('x', textEl.attr('x'))
    .attr('dy', '1.2em')
    .text(line2);
}
