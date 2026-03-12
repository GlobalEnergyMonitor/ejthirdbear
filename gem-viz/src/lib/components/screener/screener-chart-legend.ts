/**
 * Legend rendering for the Asset Screener Chart.
 * Draws tracker type and status legends at the bottom of the SVG.
 */

import { type Selection } from 'd3';
import { colors, statusColors, getTrackerColor } from '$lib/design-tokens';
import type { ScreenerChartData } from './screener-chart-data';
import { LAYOUT } from './screener-chart-data';
import { drawCross } from './screener-chart-assets';

// Re-export the ColorField type used by the orchestrator
export type ColorField = 'tracker' | 'status';

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

export function drawLegend(
  svg: Selection<SVGSVGElement, unknown, null, undefined>,
  chartData: ScreenerChartData,
  colorField: ColorField,
  width: number,
  svgHeight: number,
  margin: { top: number; right: number; bottom: number; left: number }
): void {
  const legendY = svgHeight - margin.bottom + 30;
  const legend = svg
    .append('g')
    .attr('class', 'legend')
    .attr('transform', `translate(${margin.left + LAYOUT.subsidX}, ${legendY})`);

  // Collect unique trackers from data
  const trackers = new Set<string>();
  for (const _unit of chartData.assets) {
    if (_unit.tracker && _unit.tracker !== 'Unknown') trackers.add(_unit.tracker);
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
      item.append('circle').attr('r', 5).attr('cy', 4).style('fill', getTrackerColor(tracker));
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
  const statusData = ['operating', 'planned', 'retired', 'cancelled'] as const;
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
      .style(
        'fill',
        colorField === 'status' ? statusColors[status] || statusColors.unknown : colors.grey
      );

    // Add status icon on the legend circle
    const iconG = item.append('g').attr('transform', `translate(0, 4)`);
    if (status === 'planned') {
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
