/**
 * D3 rendering module for the Asset Screener Chart.
 * Ported from Observable notebook a8d94cdc4a420709@929.
 *
 * This file is the orchestrator — it imports sub-modules for subsidiary,
 * asset, and legend rendering, and exports the single `renderChart` entry point.
 */

import { select, type Selection } from 'd3';
import { statusColors, getTrackerColor } from '$lib/design-tokens';
import type { ScreenerChartData, SubsidiaryGroupData, ChartUnit } from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';
import { drawSubsidiaryRegions, drawSubsidiaryLabels } from './screener-chart-subsidiaries';
import { drawAssetGroups, drawCommonAssetLines } from './screener-chart-assets';
import { drawLegend, type ColorField } from './screener-chart-legend';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MARGIN = { top: 20, right: 40, bottom: 40, left: 20 };
const COL_STROKE = '#d8d8ce';
const COL_BG_LIGHT = '#f7f7f3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RenderOptions {
  width?: number;
  colorField?: ColorField;
  showLegend?: boolean;
  assetHref?: (_assetId: string) => string;
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
  const requestedColorField: ColorField = options.colorField ?? 'tracker';
  const showLegend = options.showLegend ?? false;
  const assetHref =
    options.assetHref ?? ((assetId: string) => `/asset/${encodeURIComponent(assetId)}`);

  container.innerHTML = '';

  if (subsidiaryGroups.length === 0) return () => {};

  // Compute total height
  const lastGroup = subsidiaryGroups[subsidiaryGroups.length - 1];
  const contentHeight = lastGroup.bottom + LAYOUT.yPadding;
  const svgHeight = contentHeight + MARGIN.top + MARGIN.bottom;

  const trackerSet = new Set(
    chartData.assets.map((a) => a.tracker).filter((t) => t && t !== 'Unknown')
  );
  const statusSet = new Set(chartData.assets.map((a) => a.status_agg).filter(Boolean));
  const colorField: ColorField =
    requestedColorField === 'tracker' && trackerSet.size <= 1 && statusSet.size > 1
      ? 'status'
      : requestedColorField;

  // Color resolver for units
  const getUnitColor = (unit: ChartUnit): string => {
    if (colorField === 'status') {
      return statusColors[unit.status_agg] || statusColors.unknown;
    }
    return getTrackerColor(unit.tracker);
  };

  // Create SVG — extend width to accommodate asset labels that start at assetsX
  const svgWidth = Math.max(width, LAYOUT.assetsX + MARGIN.left + 420);
  const svg = select(container)
    .append('svg')
    .attr('width', svgWidth)
    .attr('height', svgHeight)
    .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`)
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

  // --- Draw subsidiary groups ---
  const regionGroup = main.append('g').attr('class', 'regions');
  const labelGroup = main.append('g').attr('class', 'labels');
  const assetGroup = main.append('g').attr('class', 'assets');
  const lineGroup = main.append('g').attr('class', 'shared-lines');

  drawSubsidiaryRegions(regionGroup, subsidiaryGroups, contentHeight, MARGIN.top);
  drawSubsidiaryLabels(labelGroup, subsidiaryGroups, chartData);
  drawAssetGroups(assetGroup, subsidiaryGroups, getUnitColor, assetHref);
  drawCommonAssetLines(assetGroup, lineGroup, subsidiaryGroups, chartData, contentHeight);

  // --- Vertical connection line (appended last so it renders above regions) ---
  main
    .append('path')
    .attr('d', `M0,-5 L0,${contentHeight - 5}`)
    .style('fill', 'none')
    .style('stroke', COL_STROKE)
    .style('stroke-width', '3.5px')
    .style('stroke-linecap', 'round');

  // --- Legend ---
  if (showLegend) {
    drawLegend(svg, chartData, colorField, width, svgHeight, MARGIN);
  }

  return () => {
    container.innerHTML = '';
  };
}

// ---------------------------------------------------------------------------
// Gradient def
// ---------------------------------------------------------------------------

function addGradient(defs: Selection<SVGDefsElement, unknown, null, undefined>): void {
  const gradient = defs
    .append('linearGradient')
    .attr('id', 'gradient-fade')
    .attr('x1', '0%')
    .attr('y1', '0%')
    .attr('x2', '100%')
    .attr('y2', '100%');

  gradient
    .append('stop')
    .attr('offset', '0%')
    .attr('stop-color', '#fafaf7')
    .attr('stop-opacity', 1);
  gradient
    .append('stop')
    .attr('offset', '100%')
    .attr('stop-color', COL_BG_LIGHT)
    .attr('stop-opacity', 1);

  // Drop shadow for hover expansion
  const filter = defs
    .append('filter')
    .attr('id', 'hover-shadow')
    .attr('x', '-10%')
    .attr('y', '-10%')
    .attr('width', '120%')
    .attr('height', '130%');
  filter
    .append('feDropShadow')
    .attr('dx', 0)
    .attr('dy', 2)
    .attr('stdDeviation', 6)
    .attr('flood-color', 'rgba(0,0,0,0.08)');
}
