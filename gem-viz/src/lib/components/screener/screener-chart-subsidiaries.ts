/**
 * Subsidiary rendering for the Asset Screener Chart.
 * Draws subsidiary lane shapes, labels with ownership pies, mini bar charts,
 * and intermediary path hints.
 */

import {
  select,
  arc as d3Arc,
  path as d3Path,
  scaleLinear,
  format,
  pointer as d3Pointer,
  type Selection,
} from 'd3';
import { colors, statusColors, getTrackerColor } from '$lib/design-tokens';
import type { ScreenerChartData, SubsidiaryGroupData, BarDatum } from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';

const COL_STROKE = '#d8d8ce';

// ---------------------------------------------------------------------------
// Subsidiary lane shapes
// ---------------------------------------------------------------------------

export function subsidiaryPath(
  d: SubsidiaryGroupData,
  yOffset: number,
  strokeOnly = false
): string {
  const p = d3Path();
  const xS = 0;
  const yS = d.top;
  const xE = LAYOUT.subsidX + LAYOUT.assetsX - LAYOUT.regionPadding - LAYOUT.assetSpacing * 2;
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

export function drawSubsidiaryRegions(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  _totalHeight: number,
  marginTop: number
): void {
  const regions = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-region')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-region');

  regions
    .append('path')
    .attr('d', (d) => subsidiaryPath(d, -marginTop - 5))
    .style('fill', 'url(#gradient-fade)');

  regions
    .append('path')
    .attr('d', (d) => subsidiaryPath(d, -marginTop - 5, true))
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', '3px')
    .style('stroke-linecap', 'round');
}

// ---------------------------------------------------------------------------
// Subsidiary labels with ownership pie charts
// ---------------------------------------------------------------------------

export function drawSubsidiaryLabels(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  chartData: ScreenerChartData
): void {
  const markR = (LAYOUT.subsidiaryMarkHeight / 2) * 0.7;
  const labelX = markR + 8;

  const items = group
    .selectAll<SVGGElement, SubsidiaryGroupData>('.subsidiary-label')
    .data(data)
    .join('g')
    .attr('class', 'subsidiary-label')
    .attr('transform', (d) => `translate(${LAYOUT.subsidX}, ${d.top + 26})`);

  // Ownership pie circle background
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

  // Name text
  const nameWrapped = new Map<string, boolean>();

  items
    .append('text')
    .attr('x', labelX)
    .attr('y', markR)
    .attr('dy', '0.35em')
    .style('fill', colors.navy)
    .style('font-size', '14px')
    .style('letter-spacing', '0.03em')
    .style('font-weight', 500)
    .each(function (d) {
      const name =
        chartData.entityMap.get(d.id)?.Name ||
        (d.id === 'Directly owned' ? 'Directly owned' : d.id);
      const wrapped = name.length > 22;
      nameWrapped.set(d.id, wrapped);
      wrapTextTwoLines(select(this), name, 22);
    });

  const LINE_HEIGHT = 18;

  // Ownership percentage text
  items
    .filter((d) => d.id !== 'Directly owned')
    .append('text')
    .attr('x', labelX)
    .attr('y', (d) => markR + 24 + (nameWrapped.get(d.id) ? LINE_HEIGHT : 0))
    .style('font-size', '12px')
    .style('font-weight', 500)
    .style('font-style', 'italic')
    .style('fill', colors.gray500)
    .style('letter-spacing', '0.05em')
    .text((d) => {
      const edge = chartData.matchedEdges.get(d.id);
      if (!edge?.value) return '';
      return `${format('.0f')(edge.value)}% ownership`;
    });

  // Mini bar charts + intermediary path hints
  // Bars are placed to the right of the name/pie area; intermediary hint goes below the name
  const BAR_X = 200;
  items.each(function (d) {
    drawMiniBarChartsForItem(select(this), d, markR - 4, BAR_X);
    drawIntermediaryPathForItem(select(this), d, markR * 2 + 18);
  });
}

// ---------------------------------------------------------------------------
// Mini bar charts (tracker type + status per subsidiary)
// ---------------------------------------------------------------------------

function drawMiniBarChartsForItem(
  item: Selection<SVGGElement, SubsidiaryGroupData, null, undefined>,
  d: SubsidiaryGroupData,
  startY: number,
  startX = 0
): void {
  const scaleW = scaleLinear().domain([0, 1]).range([0, 160]);
  const BAR_HEIGHT = 7;
  const BAR_PAD = 2;

  // Tracker bars
  const trackerGroup = item
    .append('g')
    .attr('class', 'bar-group-tracker')
    .attr('transform', `translate(${startX}, ${startY})`);

  trackerGroup
    .append('text')
    .attr('dy', '-0.4em')
    .style('font-size', '0.75rem')
    .style('font-weight', 500)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.07em')
    .style('fill', 'rgb(121, 121, 117)')
    .text('TYPE');

  const trackerBars = trackerGroup
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

  trackerBars
    .on('mouseover', function (event, bd) {
      const [mx] = d3Pointer(event, this);
      showBarTooltip(
        trackerGroup,
        mx,
        -8,
        `${bd.tracker || 'Unknown'}: ${format('.0%')(bd.percentage)}`
      );
    })
    .on('mouseout', () => {
      trackerGroup.select('.bar-tooltip').remove();
    });

  // Status bars
  const statusGroup = item
    .append('g')
    .attr('class', 'bar-group-status')
    .attr('transform', `translate(${startX}, ${startY + BAR_HEIGHT + 20})`);

  statusGroup
    .append('text')
    .attr('dy', '-0.4em')
    .style('font-size', '0.75rem')
    .style('font-weight', 500)
    .style('text-transform', 'uppercase')
    .style('letter-spacing', '0.07em')
    .style('fill', 'rgb(121, 121, 117)')
    .text('STATUS');

  const statusBars = statusGroup
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
    .style('fill', (bd) => statusColors[bd.status || ''] || statusColors.unknown);

  statusBars
    .on('mouseover', function (event, bd) {
      const [mx] = d3Pointer(event, this);
      showBarTooltip(
        statusGroup,
        mx,
        -8,
        `${bd.status || 'Unknown'}: ${format('.0%')(bd.percentage)}`
      );
    })
    .on('mouseout', () => {
      statusGroup.select('.bar-tooltip').remove();
    });
}

function showBarTooltip(
  group: Selection<SVGGElement, unknown, null, undefined>,
  x: number,
  y: number,
  label: string
): void {
  group.select('.bar-tooltip').remove();
  const tip = group
    .append('g')
    .attr('class', 'bar-tooltip')
    .attr('transform', `translate(${x}, ${y})`)
    .style('pointer-events', 'none');

  const text = tip
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '-0.2em')
    .style('font-size', '14px')
    .style('font-weight', 500)
    .style('fill', '#ffffff')
    .text(label);

  const bbox = (text.node() as SVGTextElement).getBBox();
  tip
    .insert('rect', 'text')
    .attr('x', bbox.x - 6)
    .attr('y', bbox.y - 3)
    .attr('width', bbox.width + 12)
    .attr('height', bbox.height + 6)
    .attr('rx', 4)
    .attr('ry', 4)
    .style('fill', '#004a63');
}

// ---------------------------------------------------------------------------
// Intermediary path hints
// ---------------------------------------------------------------------------

function drawIntermediaryPathForItem(
  item: Selection<SVGGElement, SubsidiaryGroupData, null, undefined>,
  d: SubsidiaryGroupData,
  startY: number
): void {
  if (d.id === 'Directly owned') return;

  const intermediary = d.intermediary_data;
  if (!intermediary) return;

  const radius = LAYOUT.yPadding;
  const endWidth = LAYOUT.assetsX - LAYOUT.regionPadding - LAYOUT.subsidX - radius - 20;
  const COL_HINT = '#61615c';

  const g = item.append('g').attr('class', 'intermediary-path-group');

  const path = d3Path();
  const xS = 0;
  const yS = startY;
  const xE = radius;
  const yE = startY + radius;
  path.moveTo(xS, yS - 10);
  path.lineTo(xS, yS);
  path.bezierCurveTo(xS, yS + radius * 0.8, xE - radius * 0.8, yE, xE, yE);
  path.lineTo(xE + endWidth, yE);

  g.append('path')
    .attr('class', 'intermediary-path')
    .attr('d', path.toString())
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', 1.5);

  if (intermediary.total_descendants > 1) {
    const circles = g
      .append('g')
      .attr('class', 'intermediary-circles')
      .attr('transform', `translate(${190}, ${startY + radius})`)
      .style('isolation', 'isolate');

    const N = intermediary.total_descendants;
    const maxCircles = Math.min(N, 12);
    for (let i = 0; i < maxCircles; i++) {
      circles
        .append('circle')
        .attr('cx', i * 8)
        .attr('r', (LAYOUT.subsidiaryMarkHeight / 2) * 0.5)
        .style('fill', '#cacaca')
        .style('mix-blend-mode', 'multiply');
    }
  }

  g.append('text')
    .attr('transform', `translate(${radius - 10}, ${startY + radius + 14})`)
    .style('font-size', '14px')
    .style('font-weight', 500)
    .style('font-style', 'italic')
    .style('letter-spacing', '0.03em')
    .style('fill', COL_HINT)
    .text(
      intermediary.total_descendants === 1
        ? 'Assets are directly owned by intermediary'
        : '(Some) assets are owned through other intermediaries'
    );

  if (intermediary.total_descendants > 1) {
    const fold = g
      .append('g')
      .attr('transform', `translate(${radius - 2}, ${startY + radius + 34})`);
    fold
      .append('rect')
      .attr('x', -8)
      .attr('y', -3)
      .attr('width', 68)
      .attr('height', 18)
      .attr('rx', 4)
      .attr('ry', 4)
      .style('fill', '#dee4e7');
    fold
      .append('text')
      .attr('dy', '1em')
      .style('font-size', '14px')
      .style('font-weight', 700)
      .style('letter-spacing', '0.03em')
      .style('fill', colors.teal)
      .text('Details below');
  }
}

// ---------------------------------------------------------------------------
// Text wrapping helper
// ---------------------------------------------------------------------------

function wrapTextTwoLines(
  textEl: Selection<SVGTextElement, unknown, null, undefined>,
  text: string,
  charLimit: number
): void {
  textEl.selectAll('*').remove();

  if (text.length <= charLimit) {
    textEl.append('tspan').text(text);
    return;
  }

  let breakPos = text.lastIndexOf(' ', charLimit);
  if (breakPos === -1) breakPos = charLimit;

  const line1 = text.slice(0, breakPos).trim();
  const rest = text.slice(breakPos).trim();
  const line2 = rest.length > charLimit ? rest.slice(0, charLimit).trim() + '\u2026' : rest;

  textEl.append('tspan').text(line1);
  textEl.append('tspan').attr('x', textEl.attr('x')).attr('dy', '1.2em').text(line2);
}
