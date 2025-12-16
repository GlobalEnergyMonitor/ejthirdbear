<script>
  // D3-based Ownership Explorer — literal port of the provided Observable snippet
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { assetLink, entityLink } from '$lib/links';
  import * as d3 from 'd3';
  import chroma from 'chroma-js';
  import {
    colors,
    colorByTracker,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
    colMaps,
    regroupStatus,
  } from '$lib/ownership-theme';
  import { fetchAssetBasics, fetchOwnerPortfolio } from '$lib/component-data/schema';

  // Accept owner entity ID and pre-baked data from parent to skip client-side fetch
  let { ownerEntityId: propsOwnerEntityId = null, prebakedData = null } = $props();

  let sectionEl;
  let loading = $state(true);
  let loadingStatus = $state('Initializing...');
  let error = $state(null);

  let curCase = $state({ assetClassName: 'assets' });

  const colField = 'status';
  const col = colMaps.byStatus;

  // Derived layout values
  let params = $state({
    subsidX: 20,
    subsidiaryMarkHeight: 19,
    subsidiaryMinHeight: 90,
    yPadding: 50,
    assetsX: 500,
    assetSpacing: 8,
    assetMarkHeightSingle: 16,
    assetMarkHeightCombined: 26,
  });

  let svgWidth = 900;
  let svgHeight = 400;

  // Helper: group assets by subsidiary and by location (similar to AssetScreener)
  function buildSubsidiaryGroups(portfolio) {
    const groups = Array.from(portfolio.subsidiariesMatched).map(([id, assetList]) => ({
      id,
      assets: assetList,
      isDirect: false,
    }));

    if (portfolio.directlyOwned.length > 0) {
      groups.push({ id: 'Directly owned', assets: portfolio.directlyOwned, isDirect: true });
    }

    const processed = groups.map((g) => {
      const locationMap = new Map();
      g.assets.forEach((asset) => {
        const locId = asset.locationId || asset.id;
        if (!locationMap.has(locId)) locationMap.set(locId, []);
        locationMap.get(locId).push(asset);
      });

      const locations = Array.from(locationMap.entries())
        .map(([locId, units]) => ({
          locationID: locId,
          units: units
            .map((u) => ({
              ...u,
              name: u.name || u.id,
              tracker: u.tracker,
              status: u.status,
              spotlightOwnershipSharePct: portfolio.matchedEdges.get(g.id)?.value || 0,
            }))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
        }))
        .sort((a, b) => (a.units[0]?.name || '').localeCompare(b.units[0]?.name || ''));

      const summary_data = calculateFrequencyTables(locations.flatMap((l) => l.units));
      return { ...g, locations, summary_data };
    });

    // Calculate heights and Y positions
    // @ts-ignore - dynamically adding layout properties
    let y = 0;
    processed.forEach((g) => {
      /** @type {any} */ (g).top = y;
      const nLocations = g.locations.length;
      g.locations.forEach((loc, j) => {
        const nUnits = loc.units.length;
        const height =
          nUnits === 1
            ? params.assetMarkHeightSingle
            : Math.max(
                params.assetMarkHeightSingle,
                params.assetMarkHeightCombined * scaleR(nUnits)
              );
        /** @type {any} */ (loc).y = y - /** @type {any} */ (g).top + height / 2;
        /** @type {any} */ (loc).r =
          nUnits === 1
            ? params.assetMarkHeightSingle / 2
            : (params.assetMarkHeightCombined / 2) * scaleR(nUnits);
        y += height + (j === nLocations - 1 ? 0 : params.assetSpacing);
      });

      /** @type {any} */ (g).height = Math.max(
        y - /** @type {any} */ (g).top,
        params.subsidiaryMarkHeight,
        params.subsidiaryMinHeight
      );
      /** @type {any} */ (g).bottom = /** @type {any} */ (g).top + /** @type {any} */ (g).height;
      y = /** @type {any} */ (g).top + /** @type {any} */ (g).height + params.yPadding;
    });

    svgHeight =
      processed.length > 0 ? /** @type {any} */ (processed[processed.length - 1]).bottom : 200;
    return processed;
  }

  function scaleR(n) {
    if (n <= 2) return 0.5;
    if (n <= 10) return 0.5 + (n - 2) * (0.5 / 8);
    if (n <= 20) return 1 + (n - 10) * (0.5 / 10);
    return 1.5;
  }

  function wrapTextTwoLines(selection, maxChars = 25) {
    selection.each(function (d) {
      const text = d3.select(this);
      const words = (typeof d === 'string' ? d : String(d)).split(/\s+/);
      let line = [];
      let lineNumber = 0;
      const lineHeight = 1.1;
      const y = text.attr('y');
      const dy = parseFloat(text.attr('dy')) || 0;
      let tspan = text
        .text(null)
        .append('tspan')
        .attr('x', text.attr('x'))
        .attr('y', y)
        .attr('dy', dy + 'em');
      words.forEach((word) => {
        line.push(word);
        tspan.text(line.join(' '));
        if (tspan.text().length > maxChars && line.length > 1) {
          line.pop();
          tspan.text(line.join(' '));
          line = [word];
          tspan = text
            .append('tspan')
            .attr('x', text.attr('x'))
            .attr('y', y)
            .attr('dy', ++lineNumber * lineHeight + dy + 'em')
            .text(word);
        }
      });
    });
  }

  function createLinearGradient(defs) {
    const gradient = defs
      .append('linearGradient')
      .attr('id', 'gradient-fade')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');
    gradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#fdfcf9')
      .attr('stop-opacity', 1);
    gradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#f9f7f2')
      .attr('stop-opacity', 1);
  }

  function addStatusIcon(selection, unit, radius, translate = [0, 0]) {
    const status = regroupStatus(unit.status || unit.Status);
    const x = translate[0] + radius * 1.1;
    const y = translate[1] - radius * 1.1;
    const colorVal = col.get(unit[colField]) || colors.navy;

    if (status === 'proposed') {
      selection
        .append('circle')
        .attr('transform', `translate(${x},${y})`)
        .attr('r', radius * 0.225)
        .style('fill', colors.yellow);
    } else if (status === 'cancelled') {
      selection
        .append('path')
        .attr('transform', `translate(${x},${y})`)
        .attr('d', () => {
          let s = radius * 0.225;
          const path = d3.path();
          path.moveTo(-s, s);
          path.lineTo(s, -s);
          path.moveTo(-s, -s);
          path.lineTo(s, s);
          return path.toString();
        })
        .style('stroke', colors.red || '#b10000')
        .style('stroke-width', 1.25)
        .style('stroke-linecap', 'round');
    } else if (status === 'retired') {
      selection
        .append('path')
        .attr('transform', `translate(${x},${y})`)
        .attr('d', () => {
          let s = radius * 0.225;
          const path = d3.path();
          path.moveTo(-s, 0);
          path.lineTo(s, 0);
          return path.toString();
        })
        .style('stroke', colors.grey)
        .style('stroke-width', 1.25)
        .style('stroke-linecap', 'round');
    } else {
      // default small dot
      selection
        .append('circle')
        .attr('transform', `translate(${x},${y})`)
        .attr('r', radius * 0.2)
        .style('fill', colorVal);
    }
  }

  function drawMiniBarChart(group, name, label, variable, color_var, x, y) {
    const scale_width = d3.scaleLinear().domain([0, 1]).range([0, 200]);

    const BAR_HEIGHT = 8;
    const BAR_PAD_X = 2;

    let bar_group = group
      .filter((s) => s.summary_data?.[variable] && s.locations.length > 1)
      .append('g')
      .attr('class', `bar-group-${name}`)
      .attr('transform', `translate(${x},${y})`);

    bar_group
      .append('text')
      .attr('class', 'bar-title')
      .attr('dy', '-0.5em')
      .style('font-size', '0.55em')
      .style('font-weight', 500)
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.07em')
      .style('fill', '#797975')
      .text(label);

    bar_group
      .selectAll('.bar')
      .data((d) => d.summary_data[variable])
      .join('rect')
      .attr('x', (d, i) => (d.x_percentage_offset = scale_width(d.x_percentage) + BAR_PAD_X * i))
      .attr('y', 0)
      .attr('height', BAR_HEIGHT)
      .attr('width', (d) => scale_width(d.percentage))
      .attr('rx', BAR_HEIGHT * 0.25)
      .attr('ry', BAR_HEIGHT * 0.25)
      .style('fill', (d) => color_var.get(d[variable]))
      .on('mouseover', function (_, d) {
        let xp = d.x_percentage_offset + scale_width(d.percentage) / 2;
        let yp = -10;

        const parent = d3.select(this.parentNode);

        let hover = parent
          .append('g')
          .attr('class', 'tooltip')
          .attr('transform', `translate(${xp},${yp})`)
          .style('pointer-events', 'none');

        let rect = hover
          .append('rect')
          .attr('class', 'background-rect')
          .attr('x', 0)
          .attr('y', -13)
          .attr('height', 18)
          .attr('width', '50px')
          .attr('rx', 4)
          .attr('ry', 4)
          .style('fill', '#333');

        let formatPercent = d3.format('.0%');
        let labelText = hover
          .append('text')
          .attr('transform', `translate(${0},${-5})`)
          .attr('dy', '0.35em')
          .style('font-size', '0.6em')
          .style('font-weight', 500)
          .style('font-style', 'italic')
          .style('text-transform', 'capitalize')
          .style('letter-spacing', '0.03em')
          .style('fill', '#ffffff')
          .style('text-anchor', 'middle')
          .text(`${d[variable]}: ${formatPercent(d.percentage)}`);

        let bbox = labelText.node().getBBox().width;
        const TEXT_WIDTH = bbox + 16;
        rect.attr('x', -TEXT_WIDTH / 2).attr('width', TEXT_WIDTH);
      })
      .on('mouseout', () => {
        group.select('.tooltip').remove();
      });
  }

  function buildColLegend(assets) {
    const trackers = new Set(assets.map((a) => a.tracker).filter(Boolean));
    const statuses = new Set(assets.map((a) => (a.status || '').toLowerCase()).filter(Boolean));
    if (trackers.size > 1) {
      return Array.from(colorByTracker)
        .filter(([t]) => trackers.has(t))
        .map(([k, v]) => [v, { descript: k }]);
    }
    const allProspective = Array.from(statuses).every((s) => prospectiveStatuses.includes(s));
    const source = allProspective ? statusColorsProspective : statusColors;
    return Array.from(source).map(([col, { descript }]) => [col, { descript }]);
  }

  function calculateFrequencyTables(units) {
    const total = units.length;
    if (total === 0) return { tracker: [], status: [] };

    const trackerMap = new Map();
    units.forEach((u) => {
      const t = u.tracker || 'Unknown';
      trackerMap.set(t, (trackerMap.get(t) || 0) + 1);
    });
    const trackerData = Array.from(trackerMap.entries())
      .map(([tracker, count]) => ({ tracker, count, percentage: count / total, x_percentage: 0 }))
      .sort((a, b) => b.count - a.count);
    let xTracker = 0;
    trackerData.forEach((d) => {
      d.x_percentage = xTracker;
      xTracker += d.percentage;
    });

    const statusMap = new Map();
    units.forEach((u) => {
      const s = regroupStatus(u.status || u.Status);
      statusMap.set(s, (statusMap.get(s) || 0) + 1);
    });
    const statusOrder = ['proposed', 'operating', 'retired', 'cancelled'];
    const statusData = Array.from(statusMap.entries())
      .map(([status, count]) => ({ status, count, percentage: count / total, x_percentage: 0 }))
      .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
    let xStatus = 0;
    statusData.forEach((d) => {
      d.x_percentage = xStatus;
      xStatus += d.percentage;
    });

    return { tracker: trackerData, status: statusData };
  }

  async function loadData() {
    // Use pre-baked data if available (production static build)
    if (prebakedData) {
      loadingStatus = 'Loading cached portfolio data...';
      // Convert serialized arrays back to Maps
      const portfolio = {
        spotlightOwner: prebakedData.spotlightOwner,
        subsidiariesMatched: new Map(prebakedData.subsidiariesMatched || []),
        directlyOwned: prebakedData.directlyOwned || [],
        matchedEdges: new Map(prebakedData.matchedEdges || []),
        entityMap: new Map(prebakedData.entityMap || []),
        assets: prebakedData.assets || [],
      };
      curCase = { assetClassName: 'assets' };
      return portfolio;
    }

    // Fallback: client-side fetch from MotherDuck (dev mode)
    loadingStatus = 'Connecting to database...';
    const pageData = get(page);
    const pathname = pageData.url?.pathname || '';
    const paramId = pageData.params?.id;
    let ownerId = null;

    // Use prop if provided (SSR mode)
    if (propsOwnerEntityId) {
      ownerId = propsOwnerEntityId;
    } else if (pathname.includes('/asset/')) {
      // Client-side: try to fetch asset basics
      loadingStatus = 'Fetching asset details...';
      const basics = await fetchAssetBasics(paramId);
      if (basics?.ownerEntityId) ownerId = basics.ownerEntityId;
      else throw new Error('Owner entity not found for asset');
    } else if (pathname.includes('/entity/')) {
      ownerId = paramId;
    } else {
      throw new Error('Unsupported route for ownership explorer');
    }

    loadingStatus = 'Fetching ownership portfolio...';
    const portfolio = await fetchOwnerPortfolio(ownerId);
    if (!portfolio) throw new Error('Failed to load owner portfolio');

    loadingStatus = 'Building visualization...';
    curCase = { assetClassName: 'assets' };
    return portfolio;
  }

  function renderChart(portfolio) {
    const section = sectionEl;
    if (!section) return;
    // Clear previous render
    section.innerHTML = '';

    // Build DOM structure identical to provided snippet
    section.insertAdjacentHTML(
      'beforeend',
      `<section class="sticky-section">
        <div id="chart-header">
          <div class="name-wrapper">
            <p id="subtitle-name" class="subtitle">Company</p>
            <h3 id="company-name"></h3>
          </div>
          <div>
            <p id="subtitle-details" class="subtitle">Details</p>
            <p id="company-details"></p>
          </div>
        </div>
        <div class="chart" id="chart-wrapper"></div>
        <div id="additional-info">
          <p><span></span></p>
        </div>
        <div id="legend-container">
          <div id="legend"></div>
        </div>
      </section>`
    );

    const container = d3.select(section).select('.sticky-section');
    const colLegend = buildColLegend(portfolio.assets);
    const subsidiaryGroups = buildSubsidiaryGroups(portfolio);

    container.select('#company-name').text(portfolio.spotlightOwner.Name);
    container
      .select('#company-details')
      .text(
        `${portfolio.assets.length} ${curCase.assetClassName} via ${portfolio.subsidiariesMatched.size} direct subsidiaries`
      );

    const legend = container.select('#legend');
    legend
      .selectAll('div')
      .data(colLegend)
      .join('div')
      .attr('class', 'legend-item')
      .html(
        (d) =>
          `<div class='legend-bubble' style="background-color:${/** @type {[string, {descript: string}]} */ (d)[0]};"></div><div>${/** @type {[string, {descript: string}]} */ (d)[1].descript}</div>`
      );

    container
      .select('#additional-info')
      .select('span')
      .text(
        `${portfolio.spotlightOwner.Name} has stakes in ${portfolio.assets.length} assets identified in the Global Energy Ownership Trackers`
      );

    // SVG setup
    const margin = { top: 70, right: 10, bottom: 30, left: 40 };
    const chart_height = svgHeight;
    const chart_width = svgWidth - margin.left - margin.right;
    const svg = d3
      .select(section.querySelector('.chart'))
      .append('svg')
      .attr('width', chart_width + margin.left + margin.right)
      .attr('height', chart_height + margin.top + margin.bottom);

    const g = svg.append('g').attr('transform', `translate(${margin.left}, ${margin.top})`);
    const defs = svg.append('defs');
    createLinearGradient(defs);

    const line_group = g.append('g').attr('class', 'line-group');
    const asset_group = g.append('g').attr('class', 'asset-group');
    const subsidiary_group = g.append('g').attr('class', 'subsidiary-group');

    const subsidiary_paths = line_group
      .selectAll('.subsidiaries-line-group')
      .data(subsidiaryGroups)
      .join('g')
      .attr('class', 'subsidiaries-line-group');

    const COL_STROKE = '#d8d8ce';
    subsidiary_paths
      .append('path')
      .attr('class', 'subsidiaries-shape')
      .attr('d', (d) => subsidiaryPath(d, -margin.top - 5))
      .style('fill', 'url(#gradient-fade)');

    subsidiary_paths
      .append('path')
      .attr('class', 'subsidiaries-line')
      .attr('d', (d) => subsidiaryPath(d, -margin.top - 5, true))
      .style('fill', 'none')
      .style('stroke', COL_STROKE)
      .style('stroke-width', '3px')
      .style('stroke-linecap', 'round');

    line_group
      .append('path')
      .attr('class', 'subsidiary-connection-line')
      .attr('d', () => `M${0},${-margin.top - 5} L${0},${chart_height + margin.bottom - 5}`)
      .style('fill', 'none')
      .style('stroke', COL_STROKE)
      .style('stroke-width', '3.5px')
      .style('stroke-linecap', 'round');

    // Subsidiary circles + labels
    const PAD = 20;
    const X_OFFSET_MAIN = params.subsidiaryMarkHeight / 2 + params.subsidX;
    const subsidiary_labels = subsidiary_group
      .selectAll('.subsidiary-item')
      .data(subsidiaryGroups)
      .join('g')
      .attr('class', 'subsidiary-item')
      .attr('id', (d) => `subsidiary-${d.id}`)
      .attr('transform', (d) => `translate(${X_OFFSET_MAIN}, ${/** @type {any} */ (d).top + PAD})`);

    subsidiary_labels
      .filter((d) => d.id !== 'Directly owned' && portfolio.matchedEdges.get(d.id)?.value !== 100)
      .append('circle')
      .attr('class', 'background-circle')
      .attr('cx', 0)
      .attr('cy', (params.subsidiaryMarkHeight / 2) * 0.7)
      .attr('r', (params.subsidiaryMarkHeight / 2) * 0.7 + 1.25 / 2)
      .style('fill', '#cce1e6')
      .style('stroke', '#ffffff')
      .style('stroke-width', '1.25px')
      .style('cursor', 'pointer')
      .on('mouseover', (e, d) => {
        // Hover hook
        void e;
        void d;
      })
      .on('click', (e, d) => {
        e.stopPropagation();
        if (d.id && d.id !== 'Directly owned') {
          goto(entityLink(d.id));
        }
      });

    const arcGen = d3
      .arc()
      .innerRadius(0)
      .outerRadius((params.subsidiaryMarkHeight / 2) * 0.7)
      .startAngle(0)
      .cornerRadius((params.subsidiaryMarkHeight / 2) * 0.1);

    subsidiary_labels
      .filter((d) => d.id !== 'Directly owned')
      .append('path')
      .attr('transform', `translate(0, ${(params.subsidiaryMarkHeight / 2) * 0.7})`)
      .attr('d', (d) =>
        arcGen(
          /** @type {any} */ ({
            endAngle: 2 * Math.PI * ((portfolio.matchedEdges.get(d.id)?.value || 100) / 100),
          })
        )
      )
      .style('pointer-events', 'none')
      .style('fill', (d) => (portfolio.matchedEdges.get(d.id)?.value ? colors.teal : 'none'));

    const LABEL_OFFSET_X = params.subsidiaryMarkHeight / 2 + 5;
    subsidiary_labels
      .append('text')
      .attr('class', 'subsidiary-text')
      .attr('x', LABEL_OFFSET_X)
      .attr('y', (params.subsidiaryMarkHeight / 2) * 0.7)
      .attr('dy', '0.35em')
      .style('fill', colors.navy)
      .style('font-size', '0.9em')
      .style('letter-spacing', '0.03em')
      .style('font-weight', 500)
      .style('cursor', (d) => (d.id !== 'Directly owned' ? 'pointer' : 'default'))
      .style('text-decoration', (d) => (d.id !== 'Directly owned' ? 'underline' : 'none'))
      .datum((d) => portfolio.entityMap.get(d.id)?.Name || 'Directly owned')
      .call(wrapTextTwoLines, 25)
      .on('click', function (e) {
        e.stopPropagation();
        const parent = d3.select(/** @type {Element} */ (this.parentNode));
        const groupData = /** @type {any} */ (parent.datum());
        if (groupData?.id && groupData.id !== 'Directly owned') {
          goto(entityLink(groupData.id));
        }
      });

    const PAD_BAR_X = LABEL_OFFSET_X + 230;
    const PAD_BAR_Y = PAD - 10;
    drawMiniBarChart(
      subsidiary_labels,
      'types',
      'Asset types',
      'tracker',
      colMaps.byTracker,
      PAD_BAR_X,
      PAD_BAR_Y
    );
    drawMiniBarChart(
      subsidiary_labels,
      'status',
      'Asset status',
      'status',
      colMaps.byStatus,
      PAD_BAR_X,
      PAD_BAR_Y + 30
    );

    // Assets
    const assets_outer_group = asset_group
      .selectAll('.subsidiary-asset-group')
      .data(subsidiaryGroups)
      .join('g')
      .attr('class', 'subsidiary-asset-group')
      .attr(
        'transform',
        (d) =>
          `translate(${params.subsidiaryMarkHeight / 2 + params.subsidX}, ${/** @type {any} */ (d).top})`
      );

    const assets = assets_outer_group
      .selectAll('.asset')
      .data((d) => d.locations)
      .join('g')
      .attr('class', 'asset')
      .attr('transform', (d) => `translate(${params.assetsX}, ${/** @type {any} */ (d).y})`)
      .style('cursor', 'pointer')
      .on('click', (e, d) => {
        e.stopPropagation();
        const assetId = d.units?.[0]?.id;
        if (assetId) {
          goto(assetLink(assetId));
        }
      });

    // Asset marks
    assets.each(function (d) {
      const el = d3.select(this);
      const r = /** @type {any} */ (d).r;
      if (d.units.length === 1) {
        el.append('circle')
          .attr('r', r)
          .style('fill', (p) => {
            const col = colMaps.byStatus.get((p.units?.[0]?.status || '').toLowerCase());
            return col || colors.grey;
          });
        addStatusIcon(el, d.units[0], r);
      } else {
        const unit_group = el.append('g').attr('class', 'unit-group');
        const N = d.units.length;
        const TAU = Math.PI * 2;

        unit_group
          .append('circle')
          .attr('r', r)
          .style('fill', 'none')
          .style('stroke', '#aab2c0')
          .style('stroke-width', '2px');

        const little_r = (params.assetMarkHeightSingle / 2) * 0.6;
        const units = unit_group
          .append('g')
          .attr('class', 'unit-ring')
          .style('isolation', 'isolate')
          .selectAll('.unit-mark')
          .data((p) => p.units)
          .join('circle')
          .attr('class', 'unit-mark')
          .attr('cx', (p, j) => r * Math.cos((TAU * j) / N))
          .attr('cy', (p, j) => r * Math.sin((TAU * j) / N))
          .attr('r', little_r)
          .style('fill', (p) => colMaps.byStatus.get((p.status || '').toLowerCase()) || colors.grey)
          .style('mix-blend-mode', 'multiply');

        units.each((p, j) => {
          addStatusIcon(el, p, little_r, [
            r * Math.cos((TAU * j) / N),
            r * Math.sin((TAU * j) / N),
          ]);
        });

        const arc = d3
          .arc()
          .innerRadius(0)
          .outerRadius(little_r)
          .startAngle(0)
          .cornerRadius((params.assetMarkHeightSingle / 2) * 0.2);

        unit_group
          .append('g')
          .attr('class', 'unit-ring-pie')
          .selectAll('.unit-mark-pie')
          .data((p) => p.units.filter((u) => u.spotlightOwnershipSharePct > 0))
          .join('path')
          .attr('class', 'unit-mark-pi')
          .attr(
            'transform',
            (p, j) => `translate(${r * Math.cos((TAU * j) / N)},${r * Math.sin((TAU * j) / N)})`
          )
          .attr('d', (p) =>
            arc(
              /** @type {any} */ ({
                endAngle: 2 * Math.PI * ((p.spotlightOwnershipSharePct || 100) / 100),
              })
            )
          )
          .style('fill', (p) => {
            const COL = colMaps.byStatus.get((p.status || '').toLowerCase()) || '#797975';
            const luminance = chroma(COL).luminance();
            return luminance < 0.2 ? chroma(COL).brighten(1).hex() : chroma(COL).darken(1).hex();
          });
      }
    });

    assets
      .append('text')
      .attr('y', 6)
      .attr('x', params.assetMarkHeightCombined + 5)
      .style('font-size', '0.75em')
      .style('font-weight', 500)
      .style('text-transform', 'uppercase')
      .style('letter-spacing', '0.07em')
      .style('fill', colors.navy)
      .text((d) => {
        let name = d.units[0].name;
        name = name.replace(
          /\b(plant|station|project|center|centre|complex|facility)\b[\s\S]*$/i,
          '$1'
        );
        return name;
      });
  }

  function subsidiaryPath(d, endY, upperStroke = false) {
    const startY = 0;
    const x0 = 0;
    const x1 = params.subsidX - 20 - params.subsidiaryMarkHeight / 2;
    const y1 = d.top + d.height / 2 + params.subsidiaryMarkHeight / 2;
    if (upperStroke) {
      return `M ${x0} ${startY} C ${x0} ${startY}, ${(x0 + x1) / 2} ${endY}, ${x1} ${endY}`;
    }
    return `M ${x0} ${startY} C ${x0} ${startY}, ${(x0 + x1) / 2} ${y1}, ${x1} ${y1}`;
  }

  onMount(async () => {
    try {
      loading = true;
      const portfolio = await loadData();
      renderChart(portfolio);
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  });
</script>

<section bind:this={sectionEl} class="ownership-explorer-d3">
  {#if loading}
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p class="loading-status">{loadingStatus}</p>
      <p class="loading-hint">Querying ownership relationships...</p>
    </div>
  {:else if error}
    <p class="error">{error}</p>
  {/if}
</section>

<style>
  .ownership-explorer-d3 {
    position: relative;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    gap: 12px;
    min-height: 200px;
    background: transparent;
    border: none;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: none;
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .loading-status {
    font-size: 14px;
    font-weight: 500;
    color: #333;
    margin: 0;
  }

  .loading-hint {
    font-size: 12px;
    color: #888;
    margin: 0;
  }

  :global(.sticky-section) {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0 16px 0;
  }

  :global(#chart-header) {
    position: sticky;
    top: 0;
    z-index: 5;
    background: transparent;
    border: none;
    padding: 12px 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  :global(.subtitle) {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 11px;
    margin: 0;
    color: #555;
  }

  :global(.name-wrapper h3) {
    margin: 4px 0 0 0;
    font-size: 20px;
    letter-spacing: 0.4px;
  }

  :global(.chart) {
    min-height: 420px;
    border: none;
    background: #fff;
    padding: 8px;
  }

  :global(#additional-info) {
    font-size: 12px;
    color: #444;
    padding: 4px 0 0 2px;
  }

  :global(#legend-container) {
    position: sticky;
    bottom: 0;
    z-index: 5;
    background: transparent;
    border: none;
    padding: 8px 12px;
  }

  :global(#legend) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  :global(.legend-item) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  :global(.legend-bubble) {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: none;
  }

  .error {
    color: #b10000;
    margin: 0;
  }

  @media (max-width: 900px) {
    :global(#chart-header) {
      grid-template-columns: 1fr;
    }
  }
</style>
