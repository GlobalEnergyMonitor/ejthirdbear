<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import type { CoalPlantUnit } from '../coal-plant-types';
  import { statusClass, capitalize } from './coal-plant-utils';
  import {
    OPERATING_STATUSES,
    PLANNED_STATUSES,
    RETIRED_STATUSES,
  } from '$lib/data-config/tracker-schema';

  let {
    plantName,
    unitsNarrative,
    units,
  }: {
    plantName: string;
    unitsNarrative: string;
    units: CoalPlantUnit[];
  } = $props();

  // ── Constants ──────────────────────────────────────────────────────────────
  const CURRENT_YEAR = new Date().getFullYear();
  const TL = { labelW: 90, badgeW: 130, rowH: 52, barH: 8, axisH: 28 };
  const TL_MIN_W = 560;

  // ── Local state ────────────────────────────────────────────────────────────
  let tlWrapEl = $state<HTMLDivElement | null>(null);
  let containerW = $state(860);
  let tlTooltip = $state<{ text: string; x: number; y: number } | null>(null);
  let hoveredRowIndex = $state<number | null>(null);

  $effect(() => {
    if (!tlWrapEl) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) containerW = Math.max(w, TL_MIN_W);
    });
    ro.observe(tlWrapEl);
    return () => ro.disconnect();
  });

  // ── Timeline computation ───────────────────────────────────────────────────
  const timeline = $derived.by(() => {
    const viewW = containerW;
    const barAreaW = viewW - TL.labelW - TL.badgeW;
    const allYears = units.flatMap((u) => {
      const cpf = u.coal_plant_fields;
      const start = parseInt(cpf.start_year ?? '');
      const retiredY = parseInt(cpf.retired_year ?? '');
      const plannedRetY = parseInt(cpf.planned_retirement ?? '');
      const end =
        !isNaN(retiredY) && retiredY > 1900
          ? retiredY
          : !isNaN(plannedRetY) && plannedRetY > 1900
            ? plannedRetY
            : CURRENT_YEAR;
      return [start, end].filter((y) => y > 1900 && y < 2200);
    });
    const minYear = allYears.length ? Math.min(...allYears) : CURRENT_YEAR - 20;
    const maxYear = allYears.length ? Math.max(...allYears, CURRENT_YEAR + 5) : CURRENT_YEAR + 10;
    const scale = scaleLinear().domain([minYear, maxYear]).range([0, barAreaW]);

    const span = maxYear - minYear;
    const interval = span > 60 ? 20 : span > 30 ? 10 : 5;
    const ticks: { year: number; x: number }[] = [];
    for (let y = Math.ceil(minYear / interval) * interval; y <= maxYear; y += interval) {
      ticks.push({ year: y, x: scale(y) });
    }

    const nowX = scale(CURRENT_YEAR);

    const rows = units.map((unit) => {
      const cpf = unit.coal_plant_fields;
      const startY = parseInt(cpf.start_year ?? '');
      const retiredY = parseInt(cpf.retired_year ?? '');
      const plannedRetY = parseInt(cpf.planned_retirement ?? '');

      const hasKnownEnd =
        (!isNaN(retiredY) && retiredY > 1900) || (!isNaN(plannedRetY) && plannedRetY > 1900);

      const endY =
        !isNaN(retiredY) && retiredY > 1900
          ? retiredY
          : !isNaN(plannedRetY) && plannedRetY > 1900
            ? plannedRetY
            : CURRENT_YEAR;

      const hasStart = !isNaN(startY) && startY > 1900;
      const hasEnd = !isNaN(endY) && endY > 1900;
      const startX = hasStart ? scale(startY) : null;
      const endX = hasEnd ? scale(endY) : null;
      const barWidth = startX !== null && endX !== null ? Math.max(endX - startX, 2) : null;
      const isDot = hasStart && (!hasEnd || Math.abs(endY - startY) < 1);
      const isFuture = hasEnd && endY > CURRENT_YEAR;
      const solidWidth = hasStart && isFuture ? Math.max(0, nowX - scale(startY)) : barWidth;
      const isOpenEnded =
        !hasKnownEnd && ['operating', 'mothballed', 'construction'].includes(cpf.status);

      return {
        unitName: cpf.unit_name,
        capacity: Math.round(parseFloat(cpf.capacity_megawatts ?? '0')),
        status: cpf.status,
        plannedRetirement: cpf.planned_retirement,
        startY: hasStart ? startY : null,
        retiredYear: !isNaN(retiredY) && retiredY > 1900 ? retiredY : null,
        startX,
        barWidth,
        solidWidth,
        isDot,
        isFuture,
        hasKnownEnd,
        isOpenEnded,
        isOperating: cpf.status === 'operating',
      };
    });

    const svgH = TL.axisH + units.length * TL.rowH + 8;
    return { scale, ticks, rows, nowX, svgH, barAreaW };
  });

  // ── Tooltip helper ─────────────────────────────────────────────────────────
  function rowTooltip(row: (typeof timeline.rows)[number]): string {
    const cap = row.capacity ? `${row.capacity} MW` : null;
    const header = cap ? `${row.unitName} · ${cap}` : row.unitName;
    const status = row.status.charAt(0).toUpperCase() + row.status.slice(1);
    const lines = [header];
    if (row.startY) {
      if (row.retiredYear) {
        const yrs = row.retiredYear - row.startY;
        lines.push(`${status} · ${row.startY}–${row.retiredYear} (${yrs} yr)`);
      } else if (row.plannedRetirement) {
        lines.push(`${status} since ${row.startY}`);
        lines.push(`Planned retirement: ${row.plannedRetirement}`);
      } else if (row.isOpenEnded) {
        lines.push(`${status} since ${row.startY}`);
        lines.push(`No planned retirement date recorded`);
      } else {
        lines.push(`${status} since ${row.startY}`);
      }
    } else {
      lines.push(status);
      if (row.plannedRetirement) lines.push(`Planned retirement: ${row.plannedRetirement}`);
      else lines.push(`No start year recorded`);
    }
    return lines.join('\n');
  }
</script>

<p class="narrative">{unitsNarrative}</p>
<div class="timeline-heading">Operational Timeline by Unit</div>

<div class="timeline-wrap" bind:this={tlWrapEl}>
  <svg
    class="timeline-svg"
    viewBox="0 0 {containerW} {timeline.svgH}"
    width={containerW}
    height={timeline.svgH}
    role="img"
    aria-label="Operational timeline for {plantName}"
    onmouseleave={() => {
      tlTooltip = null;
      hoveredRowIndex = null;
    }}
  >
    <defs>
      {#each timeline.rows as row, i}
        {#if row.isOpenEnded && row.startX !== null}
          {@const solidEndX = TL.labelW + row.startX + (row.solidWidth ?? 0)}
          {@const rightEdgeX = TL.labelW + timeline.barAreaW}
          {@const fadeW = Math.min(20, rightEdgeX - solidEndX)}
          {@const fadeStart = rightEdgeX - fadeW}
          {@const barColor =
            row.status === 'mothballed'
              ? '#bbb'
              : row.status === 'operating'
                ? '#111'
                : '#CA4A50'}
          <linearGradient
            id="grad-open-{i}"
            x1={fadeStart}
            y1="0"
            x2={rightEdgeX}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stop-color={barColor} stop-opacity="0.3" />
            <stop offset="100%" stop-color={barColor} stop-opacity="0" />
          </linearGradient>
        {/if}
      {/each}
    </defs>

    <!-- Grid lines and axis labels -->
    {#each timeline.ticks as tick}
      <text
        x={TL.labelW + tick.x}
        y={TL.axisH - 8}
        class="tl-axis-label"
        text-anchor="middle">{tick.year}</text
      >
      <line
        x1={TL.labelW + tick.x}
        y1={TL.axisH - 4}
        x2={TL.labelW + tick.x}
        y2={timeline.svgH - 4}
        class="tl-gridline"
      />
    {/each}

    <!-- Now marker -->
    <line
      x1={TL.labelW + timeline.nowX}
      y1={TL.axisH - 4}
      x2={TL.labelW + timeline.nowX}
      y2={timeline.svgH - 4}
      class="tl-now-line"
    />

    <!-- Unit rows -->
    {#each timeline.rows as row, i}
      {@const rowY = TL.axisH + i * TL.rowH}
      {@const barY = rowY + (TL.rowH - TL.barH) / 2}
      {@const dimmed = hoveredRowIndex !== null && hoveredRowIndex !== i}

      <g
        pointer-events="none"
        style="opacity: {dimmed ? 0.15 : 1}; transition: opacity 0.15s;"
      >
        <!-- Label: unit name + capacity -->
        <text
          x={TL.labelW - 8}
          y={rowY + TL.rowH * 0.38}
          class="tl-unit-name"
          text-anchor="end">{row.unitName}</text
        >
        <text
          x={TL.labelW - 8}
          y={rowY + TL.rowH * 0.65}
          class="tl-unit-cap"
          text-anchor="end">{row.capacity} MW</text
        >

        <!-- Bar or dot -->
        {#if row.isDot && row.startX !== null}
          <circle
            cx={TL.labelW + row.startX}
            cy={barY + TL.barH / 2}
            r="4"
            class="tl-dot tl-bar-{statusClass(row.status)}"
          />
        {:else if row.startX !== null && row.barWidth !== null}
          <!-- Solid portion -->
          {#if (row.solidWidth ?? 0) > 0}
            <rect
              x={TL.labelW + row.startX}
              y={barY}
              width={row.solidWidth}
              height={TL.barH}
              rx={TL.barH / 2}
              class="tl-bar tl-bar-{statusClass(row.status)}"
            />
          {/if}
          <!-- Planned retirement: dashed bar from now to that year -->
          {#if row.isFuture && row.hasKnownEnd && row.barWidth > (row.solidWidth ?? 0)}
            {@const futureX = TL.labelW + row.startX + (row.solidWidth ?? 0)}
            {@const futureW = row.barWidth - (row.solidWidth ?? 0)}
            <rect
              x={futureX}
              y={barY}
              width={futureW}
              height={TL.barH}
              rx={TL.barH / 2}
              class="tl-bar tl-bar-future"
              stroke-dasharray="4 3"
            />
          {/if}
          <!-- Open-ended: fading gradient bar -->
          {#if row.isOpenEnded}
            {@const openStartX = TL.labelW + row.startX + (row.solidWidth ?? 0)}
            {@const openW = TL.labelW + timeline.barAreaW - openStartX}
            {#if openW > 0}
              <rect
                x={openStartX}
                y={barY}
                width={openW}
                height={TL.barH}
                rx={TL.barH / 2}
                fill="url(#grad-open-{i})"
              />
            {/if}
          {/if}
        {/if}

        <!-- Status badge (right side) -->
        <foreignObject
          x={TL.labelW + timeline.barAreaW + 8}
          y={rowY + 6}
          width={TL.badgeW - 8}
          height={TL.rowH - 6}
        >
          <div xmlns="http://www.w3.org/1999/xhtml" class="tl-badge-wrap">
            <span class="status-badge badge-{statusClass(row.status)}"
              >{capitalize(row.status)}</span
            >
            {#if row.plannedRetirement}
              <span class="tl-planned-note"
                >Planned retirement<br />in {row.plannedRetirement}</span
              >
            {/if}
          </div>
        </foreignObject>
      </g>

      <!-- Hit target -->
      <rect
        x={0}
        y={rowY}
        width={containerW}
        height={TL.rowH}
        fill="transparent"
        style="cursor: default;"
        onmouseenter={(e) => {
          hoveredRowIndex = i;
          tlTooltip = { text: rowTooltip(row), x: e.clientX, y: e.clientY };
        }}
        onmousemove={(e) => {
          if (tlTooltip) tlTooltip = { text: tlTooltip.text, x: e.clientX, y: e.clientY };
        }}
        onmouseleave={() => {
          hoveredRowIndex = null;
          tlTooltip = null;
        }}
      />
    {/each}
  </svg>
</div>

{#if tlTooltip}
  <div class="tl-tooltip" style="left:{tlTooltip.x + 14}px; top:{tlTooltip.y + 10}px;">
    {tlTooltip.text}
  </div>
{/if}

<style>
  .narrative {
    font-size: 0.9rem;
    color: #222;
    margin: 0 0 1.5rem;
    line-height: 1.6;
  }
  .timeline-heading {
    font-size: 0.8rem;
    font-weight: 700;
    color: #111;
    margin-bottom: 0.75rem;
  }
  .timeline-wrap {
    width: 100%;
    overflow-x: auto;
  }
  .timeline-svg {
    display: block;
  }
  .tl-tooltip {
    position: fixed;
    z-index: 1000;
    background: rgba(20, 20, 20, 0.93);
    color: #fff;
    border-radius: 5px;
    padding: 7px 11px;
    font-size: 0.72rem;
    line-height: 1.6;
    pointer-events: none;
    white-space: pre-line;
    max-width: 240px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  /* SVG timeline elements -- must be :global since they're inside SVG */
  :global(.tl-axis-label) {
    font-family: var(--gem-font, system-ui, sans-serif);
    font-size: 11px;
    fill: #888;
  }
  :global(.tl-gridline) {
    stroke: #ebebeb;
    stroke-width: 1;
  }
  :global(.tl-now-line) {
    stroke: #ccc;
    stroke-width: 1;
  }
  :global(.tl-unit-name) {
    font-family: var(--gem-font, system-ui, sans-serif);
    font-size: 11px;
    fill: #111;
    font-weight: 500;
  }
  :global(.tl-unit-cap) {
    font-family: var(--gem-font, system-ui, sans-serif);
    font-size: 10px;
    fill: #999;
  }
  :global(.tl-bar) {
    fill: #111;
  }
  :global(.tl-bar.tl-bar-retired) {
    fill: #bbb;
  }
  :global(.tl-bar.tl-bar-mothballed) {
    fill: #bbb;
  }
  :global(.tl-bar.tl-bar-cancelled) {
    fill: #ccc;
  }
  :global(.tl-bar.tl-bar-planned) {
    fill: #ca4a50;
  }
  :global(.tl-bar.tl-bar-future) {
    fill: none;
    stroke: #111;
    stroke-width: 2;
  }
  :global(.tl-dot) {
    fill: #111;
  }
  :global(.tl-dot.tl-bar-mothballed) {
    fill: #bbb;
  }

  .tl-badge-wrap {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding-left: 8px;
  }
  .tl-planned-note {
    font-size: 0.65rem;
    color: #777;
    font-style: italic;
    line-height: 1.3;
  }

  /* Status badges reused here */
  .status-badge {
    display: inline-block;
    padding: 0.28rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-operating {
    background: #7f142a;
    color: #fff;
  }
  .badge-planned {
    background: #ca4a50;
    color: #fff;
  }
  .badge-retired {
    background: #e0e0e0;
    color: #444;
  }
  .badge-cancelled {
    background: #e0e0e0;
    color: #444;
  }
  .badge-mothballed {
    background: #e0e0e0;
    color: #444;
  }
</style>
