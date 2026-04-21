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
import type {
  ScreenerChartData,
  SubsidiaryGroupData,
  SubsidiaryExpansion,
  BarDatum,
} from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';

const COL_STROKE = '#d8d8ce';

// ---------------------------------------------------------------------------
// Subsidiary lane shapes
// ---------------------------------------------------------------------------

export function subsidiaryPath(
  d: SubsidiaryGroupData,
  yOffset: number,
  strokeOnly = false,
  extraWidth = 0
): string {
  const p = d3Path();
  const xS = 0;
  const yS = d.top;
  const xE =
    LAYOUT.subsidX + LAYOUT.assetsX - LAYOUT.regionPadding - LAYOUT.assetSpacing * 2 + extraWidth;
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
    .attr('d', (d) =>
      subsidiaryPath(d, -marginTop - 5, false, d.expansion ? LAYOUT.expansionShift : 0)
    )
    .style('fill', 'url(#gradient-fade)');

  regions
    .append('path')
    .attr('d', (d) =>
      subsidiaryPath(d, -marginTop - 5, true, d.expansion ? LAYOUT.expansionShift : 0)
    )
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', '3px')
    .style('stroke-linecap', 'round');
}

// ---------------------------------------------------------------------------
// Sub-subsidiary nested region shapes
// ---------------------------------------------------------------------------

function drawNestedSubRegions(
  group: Selection<SVGGElement, unknown, null, undefined>,
  parent: SubsidiaryGroupData,
  stemX: number,
  r: number,
  xE: number,
  markR: number,
  depth = 1
): void {
  const subGroups = parent.expansion!.subGroups;
  const lastSg = subGroups[subGroups.length - 1];
  // First layer of nesting needs a longer stem to clear the intermediary path widget;
  // deeper layers use a tighter offset since those widgets are compact.
  const stemStartY = parent.top + (depth === 1 ? 40 : 4) + markR;

  group
    .append('line')
    .attr('class', 'expansion-stem')
    .attr('x1', stemX)
    .attr('y1', stemStartY)
    .attr('x2', stemX)
    .attr('y2', lastSg.top - r)
    .style('stroke', COL_STROKE)
    .style('stroke-width', '1.5px');

  for (const sg of subGroups) {
    const sgG = group.append('g').attr('class', 'sub-subsidiary-region');
    const yS = sg.top;
    const p = d3Path();
    p.moveTo(stemX, yS - r);
    p.bezierCurveTo(stemX, yS - r * 0.2, stemX + r * 0.2, yS, stemX + r, yS);
    p.lineTo(xE, yS);
    sgG
      .append('path')
      .attr('d', p.toString())
      .style('fill', 'none')
      .style('stroke', COL_STROKE)
      .style('stroke-width', '1.5px');

    if (sg.expansion && sg.expansion.subGroups.length > 0) {
      drawNestedSubRegions(group, sg, stemX + r, r, xE, markR, depth + 1);
    }
  }
}

export function drawSubsidiarySubRegions(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  _marginTop: number
): void {
  const r = LAYOUT.yPadding;
  const stemX = LAYOUT.subsidX;
  const xE = LAYOUT.subsidX + LAYOUT.assetsX - LAYOUT.regionPadding - LAYOUT.assetSpacing * 2;
  const markR = (LAYOUT.subsidiaryMarkHeight / 2) * 0.7;

  for (const d of data) {
    if (!d.expansion || d.expansion.subGroups.length === 0) continue;
    drawNestedSubRegions(group, d, stemX, r, xE, markR);
  }
}

// ---------------------------------------------------------------------------
// Recursive sub-group label drawing
// ---------------------------------------------------------------------------

function drawSubGroupLabelsRecursive(
  group: Selection<SVGGElement, unknown, null, undefined>,
  expansion: SubsidiaryExpansion,
  originX: number,
  spotlightName: string,
  ownerChain: Array<{ name: string; pct: string }>,
  markR: number,
  labelX: number,
  options?: {
    expandedSubIds?: Set<string>;
    onExpandSubsidiary?: (id: string) => void;
    parentPath?: string;
    spotlightName?: string;
    ownerChain?: Array<{ name: string; pct: string }>;
    tooltipGroup?: Selection<SVGGElement, unknown, null, undefined>;
  }
): void {
  const entryR = LAYOUT.yPadding;
  // lineRelY: offset from the label group origin (sg.top + 26) to the entry line (sg.top)
  const lineRelY = -26;

  for (const sg of expansion.subGroups) {
    const isDirect = sg.id.endsWith(':direct');
    const rawName = expansion.entityMap.get(sg.id)?.Name ?? (isDirect ? 'Directly owned' : sg.id);
    const name = rawName.length > 28 ? rawName.slice(0, 27) + '\u2026' : rawName;

    const subLabel = group
      .append('g')
      .attr('class', 'sub-subsidiary-label')
      .attr('transform', `translate(${originX}, ${sg.top + 26})`);

    if (!isDirect) {
      // Pie centered ON the entry line (lineRelY = -26 relative to sg.top + 26 = sg.top)
      const pieCircle = subLabel
        .append('circle')
        .attr('cx', 0)
        .attr('cy', lineRelY)
        .attr('r', markR + 0.625)
        .style('fill', '#cce1e6')
        .style('stroke', '#ffffff')
        .style('stroke-width', '1.25px')
        .style('cursor', 'default');

      const edge = expansion.matchedEdges.get(sg.id);
      if (edge?.value != null) {
        // directValue = single-hop parent→child %; value = cumulative root→child % (for pie arc)
        const directPct =
          edge.directValue != null
            ? `${Math.round(edge.directValue)}%`
            : `${Math.round(edge.value)}%`;
        const sgAssetCount = sg.locations.length;
        const sgAssetLabel = sgAssetCount === 1 ? 'Asset owned via intermediary:' : `Assets owned via intermediary:`;
        const chainLines = [
          sgAssetLabel,
          rawName,
          'owner-chain:',
          `${spotlightName} owns`,
          ...ownerChain.map((c) => `${c.pct} of ${c.name}, which owns`),
          `${directPct} of ${rawName}`,
        ];
        // Append tooltip to the root group with absolute SVG coords so it renders
        // above all sibling sub-labels (SVG paints in document order).
        const tipX = originX + markR * 2 + 6;
        const tipY = sg.top + 26 + lineRelY - markR * 2 - 10; // sg.top + 26 = subLabel origin
        pieCircle
          .on('mouseover', () => showMultilineTooltip(group, tipX, tipY, chainLines, { preTitleCount: 1, titleCount: 1 }))
          .on('mouseout', () => group.select('.ownership-chain-tooltip').remove());

        const arc = d3Arc<{ endAngle: number }>()
          .innerRadius(0)
          .outerRadius(markR)
          .startAngle(0)
          .cornerRadius(markR * 0.1);
        subLabel
          .append('path')
          .attr('transform', `translate(0, ${lineRelY})`)
          .attr('d', arc({ endAngle: 2 * Math.PI * (edge.value / 100) }))
          .style('fill', colors.teal)
          .style('pointer-events', 'none');
      }
    }

    // Label above the line
    subLabel
      .append('text')
      .attr('x', isDirect ? 0 : labelX)
      .attr('y', lineRelY - markR)
      .style('fill', colors.navy)
      .style('font-size', '14px')
      .style('font-weight', 500)
      .style('letter-spacing', '0.03em')
      .text(name);

    if (sg.intermediary_data) {
      const sgEdge = expansion.matchedEdges.get(sg.id);
      const sgPct =
        sgEdge?.directValue != null
          ? `${Math.round(sgEdge.directValue)}%`
          : sgEdge?.value != null
            ? `${Math.round(sgEdge.value)}%`
            : '?%';
      drawIntermediaryPathForItem(
        subLabel as unknown as Selection<SVGGElement, SubsidiaryGroupData, null, undefined>,
        sg,
        Math.round(lineRelY + markR + 2),
        {
          ...options,
          xOffset: originX - LAYOUT.subsidX,
          compact: true,
          spotlightName,
          ownerChain: [...(ownerChain ?? []), { name: rawName, pct: sgPct }],
          tooltipGroup: options?.tooltipGroup ?? group,
        }
      );
    }

    if (sg.expansion && sg.expansion.subGroups.length > 0) {
      const edge = expansion.matchedEdges.get(sg.id);
      // Use direct edge % for the chain label so each hop shows the per-edge ownership
      const pct =
        edge?.directValue != null
          ? `${Math.round(edge.directValue)}%`
          : edge?.value != null
            ? `${Math.round(edge.value)}%`
            : '?%';
      drawSubGroupLabelsRecursive(
        group,
        sg.expansion,
        originX + entryR,
        spotlightName,
        [...ownerChain, { name: rawName, pct }],
        markR,
        labelX,
        { ...options, spotlightName, parentPath: options?.parentPath ? `${options.parentPath}::${sg.id}` : sg.id }
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Subsidiary labels with ownership pie charts
// ---------------------------------------------------------------------------

export function drawSubsidiaryLabels(
  group: Selection<SVGGElement, unknown, null, undefined>,
  data: SubsidiaryGroupData[],
  chartData: ScreenerChartData,
  options?: {
    expandedSubIds?: Set<string>;
    onExpandSubsidiary?: (id: string) => void;
  }
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

  const LINE_HEIGHT = 18;

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
      // Shift up half a line-height when wrapping so both lines stay centered on the pie
      if (wrapped) select(this).attr('y', markR - LINE_HEIGHT / 2);
      wrapTextTwoLines(select(this), name, 22);
    });

  // Ownership percentage text
  items
    .filter((d) => d.id !== 'Directly owned')
    .append('text')
    .attr('x', labelX)
    .attr('y', (d) => markR + 24 + (nameWrapped.get(d.id) ? LINE_HEIGHT / 2 : 0))
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
    const subName = chartData.entityMap.get(d.id)?.Name ?? d.id;
    const edge = chartData.matchedEdges.get(d.id);
    const subPct = edge?.value != null ? `${Math.round(edge.value)}%` : '?%';
    drawIntermediaryPathForItem(select(this), d, markR * 2 + 22, {
      ...options,
      spotlightName: chartData.spotlightOwner.Name,
      ownerChain: [{ name: subName, pct: subPct }],
      tooltipGroup: group,
    });
  });

  // Draw sub-group labels for expanded subsidiaries.
  // Sub-labels are indented by yPadding (= curve radius) so they sit inside the sub-region.
  const subEntryR = LAYOUT.yPadding; // matches drawSubsidiarySubRegions
  const subLabelOriginX = LAYOUT.subsidX + subEntryR;

  for (const d of data) {
    if (!d.expansion) continue;

    const spotlightName = chartData.spotlightOwner.Name;
    const parentEdge = chartData.matchedEdges.get(d.id);
    const parentPct = parentEdge?.value != null ? `${Math.round(parentEdge.value)}%` : '?%';
    const parentName = chartData.entityMap.get(d.id)?.Name ?? d.id;

    drawSubGroupLabelsRecursive(
      group,
      d.expansion,
      subLabelOriginX,
      spotlightName,
      [{ name: parentName, pct: parentPct }],
      markR,
      labelX,
      { ...options, spotlightName, parentPath: d.id, tooltipGroup: group }
    );
  }
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
  startY: number,
  options?: {
    expandedSubIds?: Set<string>;
    onExpandSubsidiary?: (id: string) => void;
    xOffset?: number;
    compact?: boolean;
    parentPath?: string;
    /** Spotlight owner name — used for chain pie tooltips. */
    spotlightName?: string;
    /** Owner chain from spotlight through to (and including) the current subsidiary/sub-sub. */
    ownerChain?: Array<{ name: string; pct: string }>;
    /** Root SVG group — tooltips are appended here so they paint above all other elements. */
    tooltipGroup?: Selection<SVGGElement, unknown, null, undefined>;
  }
): void {
  if (d.id === 'Directly owned') return;

  const intermediary = d.intermediary_data;
  if (!intermediary) return;

  const radius = LAYOUT.yPadding;
  // Scope the expansion key by parent path so the same entity at different tree positions
  // can be independently expanded/collapsed.
  const scopedKey = options?.parentPath ? `${options.parentPath}::${d.id}` : d.id;
  const isExpanded = options?.expandedSubIds?.has(scopedKey) ?? false;

  const tooltipLines =
    intermediary.total_descendants === 1
      ? ['Assets are directly owned by intermediary']
      : ['(Some) assets are owned', 'through other intermediaries'];

  const hasChain = !!(intermediary.chain && intermediary.chain.length > 0);
  // Suppress expand button when a single chain is shown as pies — expansion would be redundant.
  const canExpand = intermediary.total_descendants > 1 && !hasChain;

  const g = item
    .append('g')
    .attr('class', 'intermediary-path-group')
    .style('cursor', canExpand ? 'pointer' : 'default')
    .on('click', () => {
      if (canExpand) options?.onExpandSubsidiary?.(scopedKey);
    });

  if (!isExpanded && !hasChain) {
    g.on('mouseenter', function (event: MouseEvent) {
      const [mx, my] = d3Pointer(event, item.node()!);
      showMultilineTooltip(
        g as unknown as Selection<SVGGElement, unknown, null, undefined>,
        mx + 10,
        my - 50,
        tooltipLines
      );
    }).on('mouseleave', function () {
      g.select('.ownership-chain-tooltip').remove();
    });
  }

  const iconR = 8;
  const btnW = 74;
  const curveR = options?.compact ? Math.round(radius * 0.25) : Math.round(radius * 0.8);
  const lineY = startY + curveR;
  // Icon: when collapsed, sits just after the circles; when expanded, aligns under "% ownership"
  const maxCircles = canExpand ? Math.min(intermediary.total_descendants, 8) : 0;
  const circlesEndX = curveR + 6 + maxCircles * 8;
  const markRLocal = (LAYOUT.subsidiaryMarkHeight / 2) * 0.7;
  const iconCX = isExpanded
    ? markRLocal + 8 + btnW / 2 // left-aligned under ownership % text
    : circlesEndX + 20;

  if (!isExpanded) {
    // Chain geometry — computed upfront so path end X and lineY can be set before drawing.
    const chain = intermediary.chain ?? [];
    const pieR = markRLocal;
    const pieSpacing = pieR * 2 + 6;
    const arrowHeadSize = 6;
    const chainTailLength = 50;
    // Chain pies sit slightly lower than the default lineY for visual breathing room.
    const renderLineY = lineY + (hasChain ? 6 : 0);
    // End X of the last pie + gap + tail + arrowhead tip
    const chainPiesEndX = hasChain && chain.length > 0
      ? curveR + 6 + (chain.length - 1) * pieSpacing + pieR + pieR + chainTailLength
      : 0;
    const pathEndX = hasChain ? chainPiesEndX - arrowHeadSize : iconCX - iconR - 2;

    const xS = 0;
    const yS = startY;
    const path = d3Path();
    if (options?.compact) {
      path.moveTo(xS, yS);
    } else {
      path.moveTo(xS, yS - 16);
      path.lineTo(xS, yS);
    }
    path.bezierCurveTo(xS, yS + curveR * 0.8, xS + curveR * 0.2, renderLineY, xS + curveR, renderLineY);
    path.lineTo(pathEndX, renderLineY);

    g.append('path')
      .attr('class', 'intermediary-path')
      .attr('d', path.toString())
      .style('fill', 'none')
      .style('stroke', COL_STROKE)
      .style('stroke-width', 1.5);

    if (hasChain) {
      // Render an ownership pie for each entity in the single chain.
      const pieArc = d3Arc<{ endAngle: number }>()
        .innerRadius(0)
        .outerRadius(pieR)
        .startAngle(0)
        .cornerRadius(pieR * 0.1);

      const spotlightName = options?.spotlightName ?? '';
      const parentOwnerChain = options?.ownerChain ?? [];
      const pieGroup = g
        .append('g')
        .attr('class', 'intermediary-chain-pies')
        .attr('transform', `translate(${curveR + 6}, ${renderLineY})`);

      const assetCountLabel = d.locations.length === 1 ? 'Asset owned via intermediary:' : `Assets owned via intermediary:`;

      chain.forEach((entry, i) => {
        const cx = i * pieSpacing;
        const pct = entry.ownershipPct;
        const displayPct =
          entry.directPct != null
            ? `${Math.round(entry.directPct)}%`
            : pct != null
              ? `${Math.round(pct)}%`
              : '?%';

        // Build tooltip: entity name (title), "owner-chain:" label, then chain lines
        const prevChainLines = chain.slice(0, i).map((c) => {
          const p =
            c.directPct != null
              ? `${Math.round(c.directPct)}%`
              : c.ownershipPct != null
                ? `${Math.round(c.ownershipPct)}%`
                : '?%';
          return `${p} of ${c.name}, which owns`;
        });
        const tooltipLines = [
          assetCountLabel,
          entry.name,
          'owner-chain:',
          `${spotlightName} owns`,
          ...parentOwnerChain.map((c) => `${c.pct} of ${c.name}, which owns`),
          ...prevChainLines,
          `${displayPct} of ${entry.name}`,
        ];

        const pieG = pieGroup.append('g').attr('transform', `translate(${cx}, 0)`);

        pieG
          .append('circle')
          .attr('r', pieR + 0.625)
          .style('fill', '#cce1e6')
          .style('stroke', '#ffffff')
          .style('stroke-width', '1.25px')
          .style('cursor', 'default')
          .on('mouseover', (event: MouseEvent) => {
            showHtmlChainTooltip(event.clientX, event.clientY, tooltipLines, { preTitleCount: 1, titleCount: 1 });
          })
          .on('mouseout', () => {
            hideHtmlChainTooltip();
          });

        if (pct != null) {
          pieG
            .append('path')
            .attr('d', pieArc({ endAngle: 2 * Math.PI * (pct / 100) }))
            .style('fill', colors.teal)
            .style('pointer-events', 'none');
        }
      });

      // Arrowhead at the end of the tail line, pointing right toward the assets.
      g.append('polygon')
        .attr(
          'points',
          [
            `${chainPiesEndX},${renderLineY}`,
            `${chainPiesEndX - arrowHeadSize},${renderLineY - arrowHeadSize * 0.6}`,
            `${chainPiesEndX - arrowHeadSize},${renderLineY + arrowHeadSize * 0.6}`,
          ].join(' ')
        )
        .style('fill', COL_STROKE)
        .style('pointer-events', 'none');
    } else if (canExpand) {
      // Circles near the left, just after the curve ends
      const circles = g
        .append('g')
        .attr('class', 'intermediary-circles')
        .attr('transform', `translate(${curveR + 6}, ${lineY})`)
        .style('isolation', 'isolate');

      for (let i = 0; i < maxCircles; i++) {
        circles
          .append('circle')
          .attr('cx', i * 8)
          .attr('r', (LAYOUT.subsidiaryMarkHeight / 2) * 0.5)
          .style('fill', '#cacaca')
          .style('mix-blend-mode', 'multiply');
      }
    }
  }

  if (canExpand) {
    const btnGroup = g.append('g').attr('transform', `translate(${iconCX}, ${lineY})`);

    if (isExpanded) {
      // Pill button: "− Collapse"
      const btnW = 74;
      const btnH = 18;
      btnGroup
        .append('rect')
        .attr('x', -btnW / 2)
        .attr('y', -btnH / 2)
        .attr('width', btnW)
        .attr('height', btnH)
        .attr('rx', btnH / 2)
        .style('fill', colors.teal);
      btnGroup
        .append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', '0.35em')
        .style('font-size', '11px')
        .style('font-weight', 600)
        .style('fill', '#fff')
        .style('letter-spacing', '0.03em')
        .text('− Collapse');
    } else {
      // "+" circle icon
      const arm = 4;
      btnGroup
        .append('circle')
        .attr('r', iconR)
        .style('fill', '#dee4e7')
        .style('stroke', '#aab4b8')
        .style('stroke-width', '1px');
      btnGroup
        .append('line')
        .attr('x1', -arm)
        .attr('y1', 0)
        .attr('x2', arm)
        .attr('y2', 0)
        .style('stroke', colors.teal)
        .style('stroke-width', '1.5px')
        .style('stroke-linecap', 'round');
      btnGroup
        .append('line')
        .attr('x1', 0)
        .attr('y1', -arm)
        .attr('x2', 0)
        .attr('y2', arm)
        .style('stroke', colors.teal)
        .style('stroke-width', '1.5px')
        .style('stroke-linecap', 'round');
    }
  }
}

// ---------------------------------------------------------------------------
// HTML tooltip for chain pies (position:fixed so it renders above HTML footer)
// ---------------------------------------------------------------------------

const HTML_CHAIN_TIP_ID = 'screener-chain-pie-tooltip';

function showHtmlChainTooltip(
  clientX: number,
  clientY: number,
  lines: string[],
  opts?: { preTitleCount?: number; titleCount?: number }
): void {
  let tip = document.getElementById(HTML_CHAIN_TIP_ID);
  if (!tip) {
    tip = document.createElement('div');
    tip.id = HTML_CHAIN_TIP_ID;
    document.body.appendChild(tip);
  }

  const preTitleCount = opts?.preTitleCount ?? 0;
  const titleCount = opts?.titleCount ?? 0;
  const titleEnd = preTitleCount + titleCount;

  tip.innerHTML = lines
    .map((line, i) => {
      const isPreTitle = i < preTitleCount;
      const isTitle = i >= preTitleCount && i < titleEnd;
      const isLabel = i === titleEnd && titleCount > 0;
      const style = [
        isPreTitle || isLabel ? 'color:#8bbfcc;font-size:10px;font-style:italic;' : 'color:#fff;',
        isTitle ? 'font-size:13px;font-weight:700;' : isLabel ? 'font-size:10px;' : 'font-size:12px;',
        i === titleEnd - 1 && titleEnd > 0 ? 'margin-bottom:4px;' : '',
      ].join('');
      return `<div style="${style}">${line}</div>`;
    })
    .join('');

  Object.assign(tip.style, {
    position: 'fixed',
    background: '#004a63',
    borderRadius: '4px',
    padding: '8px 10px',
    pointerEvents: 'none',
    zIndex: '10000',
    whiteSpace: 'nowrap',
    display: 'block',
    // Place off-screen first so we can measure
    left: '-9999px',
    top: '-9999px',
  });

  // Measure then reposition above cursor, clamped to viewport
  const { width: tipW, height: tipH } = tip.getBoundingClientRect();
  const left = Math.min(clientX + 12, window.innerWidth - tipW - 8);
  const top = Math.max(8, clientY - tipH - 12);
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

function hideHtmlChainTooltip(): void {
  document.getElementById(HTML_CHAIN_TIP_ID)?.remove();
}

// ---------------------------------------------------------------------------
// Multiline ownership chain tooltip
// ---------------------------------------------------------------------------

function showMultilineTooltip(
  group: Selection<SVGGElement, unknown, null, undefined>,
  x: number,
  y: number,
  lines: string[],
  opts?: { titleCount?: number; preTitleCount?: number }
): void {
  group.select('.ownership-chain-tooltip').remove();
  const tip = group
    .append('g')
    .attr('class', 'ownership-chain-tooltip')
    .attr('transform', `translate(${x}, ${y})`)
    .style('pointer-events', 'none');

  const PRETITLE_H = 14;
  const TITLE_H = 20;
  const LABEL_H = 16;
  const LINE_H = 17;
  const PAD = 8;
  const preTitleCount = opts?.preTitleCount ?? 0;
  const titleCount = opts?.titleCount ?? 0;
  const titleEnd = preTitleCount + titleCount;

  // Compute cumulative y positions per line, with gap after the combined pre-title+title block.
  const lineYs: number[] = [];
  let curY = PAD + 4;
  lines.forEach((_, i) => {
    lineYs.push(curY);
    let h: number;
    if (i < preTitleCount) h = PRETITLE_H;
    else if (i < titleEnd) h = TITLE_H;
    else if (i === titleEnd && titleCount > 0) h = LABEL_H;
    else h = LINE_H;
    curY += h;
    if (i === titleEnd - 1 && titleEnd > 0) curY += 3;
  });
  const totalH = curY + PAD - 4;

  lines.forEach((line, i) => {
    const isPreTitle = i < preTitleCount;
    const isTitle = i >= preTitleCount && i < titleEnd;
    const isLabel = i === titleEnd && titleCount > 0;
    tip
      .append('text')
      .attr('x', isTitle ? PAD : PAD + 2)
      .attr('y', lineYs[i])
      .attr('dominant-baseline', 'hanging')
      .style('font-size', isPreTitle ? '10px' : isTitle ? '13px' : isLabel ? '10px' : '12px')
      .style('font-weight', isTitle ? '700' : '400')
      .style('font-style', isPreTitle ? 'italic' : 'normal')
      .style('fill', isPreTitle || isLabel ? '#8bbfcc' : '#ffffff')
      .text(line);
  });

  let maxW = 80;
  tip.selectAll<SVGTextElement, unknown>('text').each(function () {
    maxW = Math.max(maxW, this.getBBox().width);
  });

  tip
    .insert('rect', 'text')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', maxW + PAD * 2)
    .attr('height', totalH)
    .attr('rx', 4)
    .attr('ry', 4)
    .style('fill', '#004a63');
  // Raise to end of parent so it paints over all siblings regardless of append order.
  tip.raise();
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
