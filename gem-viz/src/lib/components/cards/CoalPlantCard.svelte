<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import type { CoalPlantUnit } from './coal-plant-types';
  import {
    OPERATING_STATUSES,
    PLANNED_STATUSES,
    CANCELLED_STATUSES,
    RETIRED_STATUSES,
    getStatusGroupId,
  } from '$lib/data-config/tracker-schema';

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    units,
    open = false,
  }: {
    units: CoalPlantUnit[];
    open?: boolean;
  } = $props();

  // ── Constants ──────────────────────────────────────────────────────────────

  const CURRENT_YEAR = new Date().getFullYear();

  const STATUS_ORDER = [
    'operating', 'construction', 'permitted', 'pre-permit', 'pre-construction',
    'announced', 'proposed', 'mothballed', 'shelved', 'cancelled', 'retired',
  ];

  const DEVELOPMENT_STATUSES = PLANNED_STATUSES;

  // 1.5°C phaseout dates by subregion
  // TODO: confirm exact mapping with GEM data team
  const PHASEOUT_1_5C: Record<string, number> = {
    'Northern America': 2030,
    'Western Europe': 2030,
    'Northern Europe': 2030,
    'Southern Europe': 2030,
    'Eastern Europe': 2030,
    'Australia and New Zealand': 2030,
  };

  // ── Derived: plant-level fields ────────────────────────────────────────────

  const f = $derived(units[0]?.coal_plant_fields);
  const plantName = $derived(f?.plant_name ?? units[0]?.asset_name ?? '');
  const wikiUrl = $derived(f?.wiki_url ?? null);
  const database = $derived(f?.database ?? 'Global Coal Plant Tracker, January 2026');

  const locationStr = $derived.by(() => {
    const parts: string[] = [];
    if (f?.location) parts.push(f.location);
    if (f?.local_area && !parts.some(p => p.includes(f.local_area!))) parts.push(f.local_area);
    if (f?.subnational_unit && !parts.some(p => p.includes(f.subnational_unit!))) parts.push(f.subnational_unit);
    if (f?.country_area && !parts.some(p => p.includes(f.country_area))) parts.push(f.country_area);
    return parts.join(', ') || units[0]?.country || '';
  });

  const coords = $derived.by(() => {
    const lat = parseFloat(f?.latitude ?? '');
    const lon = parseFloat(f?.longitude ?? '');
    if (isNaN(lat) || isNaN(lon)) return null;
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  });

  const locationAccuracy = $derived.by(() => {
    const acc = f?.location_accuracy ?? null;
    return acc && acc !== 'exact' ? acc : null;
  });

  // Compact summary chips: operating total + planned total only (exclude retired/cancelled/mothballed)
  const compactChips = $derived.by(() => {
    const chips: { label: string; capacity: number; cls: string }[] = [];
    const opCap = units
      .filter(u => u.coal_plant_fields.status === 'operating')
      .reduce((s, u) => s + parseFloat(u.coal_plant_fields.capacity_megawatts || '0'), 0);
    const plannedCap = units
      .filter(u => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status))
      .reduce((s, u) => s + parseFloat(u.coal_plant_fields.capacity_megawatts || '0'), 0);
    if (opCap > 0) chips.push({ label: 'OPERATING', capacity: Math.round(opCap), cls: 'chip-operating' });
    if (plannedCap > 0) chips.push({ label: 'PLANNED', capacity: Math.round(plannedCap), cls: 'chip-planned' });
    return chips;
  });

  // Group units by status for plant summary table
  const statusGroups = $derived.by(() => {
    const groups = new Map<string, { count: number; capacity: number; technologies: Set<string> }>();
    for (const unit of units) {
      const status = unit.coal_plant_fields.status;
      if (!groups.has(status)) groups.set(status, { count: 0, capacity: 0, technologies: new Set() });
      const g = groups.get(status)!;
      g.count++;
      g.capacity += parseFloat(unit.coal_plant_fields.capacity_megawatts || '0');
      if (unit.coal_plant_fields.combustion_technology) {
        g.technologies.add(unit.coal_plant_fields.combustion_technology);
      }
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
      .map(([status, d]) => ({
        status,
        count: d.count,
        capacity: Math.round(d.capacity),
        technologies: [...d.technologies].join(', ') || '—',
      }));
  });

  // Primary owner — strip percentage annotations
  const primaryOwner = $derived.by(() => {
    const owner = f?.owner;
    if (!owner) return null;
    return owner
      .split(';')
      .map(o => o.replace(/\s*\[[\d.]+%\]\s*/g, '').trim())
      .filter(Boolean)
      .join(', ') || null;
  });

  // Plant age: max across operating/mothballed units
  const plantAge = $derived.by(() => {
    const ages = units
      .filter(u => OPERATING_STATUSES.has(u.coal_plant_fields.status) || u.coal_plant_fields.status === 'mothballed')
      .map(u => parseInt(u.coal_plant_fields.plant_age_years ?? '0'))
      .filter(a => a > 0);
    return ages.length ? Math.max(...ages) : null;
  });

  // Coal Information tab
  const coalTypes = $derived([...new Set(units.map(u => u.coal_plant_fields.coal_type).filter(Boolean))] as string[]);
  const coalSources = $derived([...new Set(units.map(u => u.coal_plant_fields.coal_source).filter(Boolean))] as string[]);

  const chpValue = $derived.by(() => {
    const vals = [...new Set(units.map(u => u.coal_plant_fields.cogeneration).filter(Boolean))];
    if (vals.includes('yes')) return 'Yes';
    if (vals.includes('no')) return 'No';
    return null;
  });

  const captiveValues = $derived(
    [...new Set(units.map(u => u.coal_plant_fields.captive).filter(v => v && v !== 'null'))] as string[]
  );

  // Emissions & Phaseout tab
  const isInDevelopment = $derived(units.some(u => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status)));

  const annualCO2 = $derived.by(() => {
    const sum = units.reduce((s, u) => s + parseFloat(u.coal_plant_fields.annual_co2_million_tonnes__annum ?? '0'), 0);
    return sum > 0 ? sum : null;
  });

  const lifetimeCO2 = $derived.by(() => {
    const sum = units.reduce((s, u) => s + parseFloat(u.coal_plant_fields.lifetime_co2_million_tonnes ?? '0'), 0);
    return sum > 0 ? sum : null;
  });

  const capacityFactor = $derived.by(() => {
    const raw = parseFloat(f?.capacity_factor ?? '');
    return isNaN(raw) ? null : Math.round(raw * 100);
  });

  const plannedRetirements = $derived(
    units
      .filter(u => u.coal_plant_fields.planned_retirement)
      .map(u => ({ name: u.coal_plant_fields.unit_name, year: u.coal_plant_fields.planned_retirement! }))
  );

  const remainingLifetime = $derived.by(() => {
    const vals = units
      .filter(u => OPERATING_STATUSES.has(u.coal_plant_fields.status) || u.coal_plant_fields.status === 'mothballed')
      .map(u => parseInt(u.coal_plant_fields.remaining_plant_lifetime_years ?? ''))
      .filter(v => !isNaN(v) && v > 0);
    return vals.length ? Math.max(...vals) : null;
  });

  const emissionFactor = $derived.by(() => {
    const vals = [...new Set(
      units.map(u => u.coal_plant_fields.emission_factor_co2).filter((v): v is string => !!v && v !== 'null')
    )];
    return vals.length ? vals.join(', ') : null;
  });

  const phaseoutCommitment = $derived(f?.phaseout_commitment ?? null);
  const netZeroCommitment = $derived(f?.['net-zero_commitment'] ?? f?.net_zero_year ?? null);
  const phaseout15C = $derived(PHASEOUT_1_5C[f?.subregion ?? ''] ?? 2040);

  const alignmentStatus = $derived.by((): 'aligned' | 'needs-acceleration' | 'not-aligned' | null => {
    const activeUnits = units.filter(u => {
      const s = u.coal_plant_fields.status;
      return !RETIRED_STATUSES.has(s) && !CANCELLED_STATUSES.has(s);
    });
    if (activeUnits.length === 0) return null;
    const allRetireByPhaseout = activeUnits.every(u => {
      const yr = parseInt(u.coal_plant_fields.planned_retirement ?? '');
      return !isNaN(yr) && yr <= phaseout15C;
    });
    if (allRetireByPhaseout) return 'aligned';
    if (phaseoutCommitment && parseInt(phaseoutCommitment) <= phaseout15C) return 'needs-acceleration';
    return 'not-aligned';
  });

  // Narrative sentences
  const overviewNarrative = $derived.by((): string | null => {
    if (plantAge && plantAge > 0) {
      const yearsText = plantAge >= 40 ? 'over 40' : `${plantAge}`;
      return `${plantName} has been operating for ${yearsText} years.`;
    }
    if (units.some(u => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status))) {
      return `${plantName} is a proposed coal plant in ${f?.country_area ?? units[0]?.country ?? ''}.`;
    }
    return null;
  });

  const unitsNarrative = $derived.by((): string => {
    const counts = new Map<string, number>();
    for (const u of units) {
      const s = u.coal_plant_fields.status;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const parts = Array.from(counts.entries())
      .sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
      .map(([status, count]) => `${count === 1 ? 'one' : count} ${status}`);
    let sentence = `${plantName} has ${parts.join(', ')} unit${units.length === 1 ? '' : 's'}.`;
    if (plannedRetirements.length === 1) {
      const r = plannedRetirements[0];
      sentence += ` ${r.name} is planned to be retired in ${r.year}.`;
    } else if (plannedRetirements.length > 1) {
      sentence += ` Planned retirements: ${plannedRetirements.map(r => `${r.name} (${r.year})`).join(', ')}.`;
    }
    return sentence;
  });

  // ── Additional Details tab ─────────────────────────────────────────────────

  // Fields displayed in other tabs — excluded from Additional Details
  const USED_FIELDS = new Set([
    'plant_name', 'unit_name', 'status', 'capacity_megawatts', 'start_year',
    'retired_year', 'planned_retirement', 'phaseout_commitment', 'net-zero_commitment',
    'net_zero_year', 'combustion_technology', 'coal_type', 'coal_source', 'cogeneration',
    'captive', 'owner', 'annual_co2_million_tonnes__annum', 'lifetime_co2_million_tonnes',
    'capacity_factor', 'plant_age_years', 'wiki_url', 'location', 'subnational_unit',
    'local_area', 'country_area', 'subregion', 'database', 'latitude', 'longitude',
    'remaining_plant_lifetime_years', 'emission_factor_co2', 'location_accuracy',
  ]);

  const FIELD_LABELS: Record<string, string> = {
    alternate_fuel:               'Alternate fuel',
    captive_industry_use:         'Captive industry use',
    captive_residential_use:      'Captive residential use',
    parent:                       'Parent company',
    parent_gem_entity_id:         'Parent GEM ID',
    owner_gem_entity_id:          'Owner GEM ID',
    heat_rate_btu:                'Heat rate (BTU/kWh)',
    major_area:                   'Major area',
    region:                       'Region',
    gem_location_id:              'GEM location ID',
    gem_unit_phase_id:            'GEM unit/phase ID',
  };

  const additionalDetails = $derived.by(() => {
    return Object.entries(FIELD_LABELS).flatMap(([key, label]) => {
      const values = [
        ...new Set(
          units
            .map(u => (u.coal_plant_fields as unknown as Record<string, string | null>)[key])
            .filter((v): v is string => !!v && v !== 'null' && v !== 'not found')
        ),
      ];
      return values.length ? [{ label, values }] : [];
    });
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const TABS = ['Overview', 'Timeline', 'Coal Information', 'Emissions & Phaseout', 'Ownership', 'Additional Details'] as const;
  type TabName = (typeof TABS)[number];
  let activeTab = $state<TabName>('Overview');

  // ── Timeline chart ─────────────────────────────────────────────────────────

  const TL = { labelW: 90, badgeW: 130, rowH: 52, barH: 8, axisH: 28, viewW: 860 };

  const timeline = $derived.by(() => {
    const barAreaW = TL.viewW - TL.labelW - TL.badgeW;
    const allYears = units.flatMap(u => {
      const cpf = u.coal_plant_fields;
      const start = parseInt(cpf.start_year ?? '');
      const retiredY = parseInt(cpf.retired_year ?? '');
      const plannedRetY = parseInt(cpf.planned_retirement ?? '');
      // Only use data-backed years for domain; open-ended units extend to chart edge separately
      const end = !isNaN(retiredY) && retiredY > 1900 ? retiredY
        : !isNaN(plannedRetY) && plannedRetY > 1900 ? plannedRetY
        : CURRENT_YEAR;
      return [start, end].filter(y => y > 1900 && y < 2200);
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
        (!isNaN(retiredY) && retiredY > 1900) ||
        (!isNaN(plannedRetY) && plannedRetY > 1900);

      // For bar geometry: use data years only; open-ended bars are rendered as a separate gradient rect
      const endY = !isNaN(retiredY) && retiredY > 1900 ? retiredY
        : !isNaN(plannedRetY) && plannedRetY > 1900 ? plannedRetY
        : CURRENT_YEAR;

      const hasStart = !isNaN(startY) && startY > 1900;
      const hasEnd = !isNaN(endY) && endY > 1900;
      const startX = hasStart ? scale(startY) : null;
      const endX = hasEnd ? scale(endY) : null;
      const barWidth = startX !== null && endX !== null ? Math.max(endX - startX, 2) : null;
      const isDot = hasStart && (!hasEnd || Math.abs(endY - startY) < 1);
      const isFuture = hasEnd && endY > CURRENT_YEAR;
      const solidWidth = hasStart && isFuture ? Math.max(0, nowX - scale(startY)) : barWidth;
      // Open-ended: operating/mothballed/construction with no retirement data
      const isOpenEnded = !hasKnownEnd && ['operating', 'mothballed', 'construction'].includes(cpf.status);

      return {
        unitName: cpf.unit_name,
        capacity: Math.round(parseFloat(cpf.capacity_megawatts ?? '0')),
        status: cpf.status,
        plannedRetirement: cpf.planned_retirement,
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  function formatCO2(value: number | null): string | null {
    if (value == null) return null;
    return value >= 1 ? `${value.toFixed(1)} Mt` : `${(value * 1000).toFixed(0)} kt`;
  }

  function formatMW(mw: number): string {
    return `${mw.toLocaleString()} MW`;
  }

  function statusClass(status: string): string {
    const group = getStatusGroupId(status);
    if (group === 'retired' && status === 'mothballed') return 'mothballed';
    return group;
  }

  function capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
</script>

<details class="coal-plant-card" {open}>
  <!-- ── Compact summary ─────────────────────────────────────────────────── -->
  <summary class="card-compact">
    <div class="compact-left">
      <h3 class="compact-name">{plantName}</h3>
      <div class="compact-location">{locationStr}</div>
    </div>
    <div class="compact-badges">
      {#each compactChips as chip}
        <span class="status-chip {chip.cls}">
          <span class="chip-status">{chip.label}</span>
          <span class="chip-capacity">{formatMW(chip.capacity)}</span>
        </span>
      {/each}
    </div>
  </summary>

  <!-- ── Full card ───────────────────────────────────────────────────────── -->
  <div class="card-full">

    <!-- Tab bar -->
    <nav class="tab-bar" role="tablist">
      {#each TABS as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab}
          role="tab"
          aria-selected={activeTab === tab}
          onclick={() => (activeTab = tab)}
        >{tab}</button>
      {/each}
    </nav>

    <!-- Tab content -->
    <div class="tab-content">

      <!-- ── Overview ──────────────────────────────────────────────────── -->
      {#if activeTab === 'Overview'}
        {#if overviewNarrative}
          <p class="narrative">{overviewNarrative}</p>
        {/if}

        <div class="overview-grid">
          <div class="overview-section">
            <div class="field-label">Location</div>
            <div class="field-value">{locationStr}</div>
            {#if coords}
              <div class="field-coords">
                {coords}{#if locationAccuracy}&nbsp;({locationAccuracy}){/if}
              </div>
            {/if}
          </div>
          <div class="overview-section">
            <div class="field-label">Primary Owner(s)</div>
            <div class="field-value">{primaryOwner ?? '—'}</div>
          </div>
          {#if plantAge}
            <div class="overview-section">
              <div class="field-label">
                Plant age
                <span class="info-dot" data-tip="Age since the first operating unit began commercial operation">i</span>
              </div>
              <div class="field-value">{plantAge} years</div>
            </div>
          {/if}
        </div>

        <div class="summary-section">
          <div class="summary-heading">Plant summary</div>
          <div class="summary-table">
            <div class="summary-row summary-header">
              <span>Status</span>
              <span>Capacity</span>
              <span>Units</span>
              <span>Combustion technology</span>
            </div>
            {#each statusGroups as group}
              <div class="summary-row">
                <span>
                  <span class="status-badge badge-{statusClass(group.status)}">{capitalize(group.status)}</span>
                </span>
                <span>{formatMW(group.capacity)}</span>
                <span>{group.count} unit{group.count === 1 ? '' : 's'}</span>
                <span>{group.technologies}</span>
              </div>
            {/each}
          </div>
        </div>

      <!-- ── Units ──────────────────────────────────────────────────────── -->
      {:else if activeTab === 'Timeline'}
        <p class="narrative">{unitsNarrative}</p>
        <div class="timeline-heading">Operational Timeline by Unit</div>

        <div class="timeline-wrap">
          <svg
            class="timeline-svg"
            viewBox="0 0 {TL.viewW} {timeline.svgH}"
            width="100%"
            role="img"
            aria-label="Operational timeline for {plantName}"
          >
            <defs>
              <!-- Gradients for open-ended bars (no retirement date). Each fades to transparent
                   over the last 20px of userSpace so the fade length is always visually consistent. -->
              {#each timeline.rows as row, i}
                {#if row.isOpenEnded && row.startX !== null}
                  {@const solidEndX = TL.labelW + row.startX + (row.solidWidth ?? 0)}
                  {@const rightEdgeX = TL.labelW + timeline.barAreaW}
                  {@const fadeW = Math.min(20, rightEdgeX - solidEndX)}
                  {@const fadeStart = rightEdgeX - fadeW}
                  {@const barColor = row.status === 'mothballed' ? '#bbb' : row.status === 'operating' ? '#111' : '#CA4A50'}
                  <linearGradient id="grad-open-{i}" x1={fadeStart} y1="0" x2={rightEdgeX} y2="0" gradientUnits="userSpaceOnUse">
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
                text-anchor="middle"
              >{tick.year}</text>
              <line
                x1={TL.labelW + tick.x} y1={TL.axisH - 4}
                x2={TL.labelW + tick.x} y2={timeline.svgH - 4}
                class="tl-gridline"
              />
            {/each}

            <!-- Now marker -->
            <line
              x1={TL.labelW + timeline.nowX} y1={TL.axisH - 4}
              x2={TL.labelW + timeline.nowX} y2={timeline.svgH - 4}
              class="tl-now-line"
            />

            <!-- Unit rows -->
            {#each timeline.rows as row, i}
              {@const rowY = TL.axisH + i * TL.rowH}
              {@const barY = rowY + (TL.rowH - TL.barH) / 2}

              <!-- Label: unit name + capacity -->
              <text x={TL.labelW - 8} y={rowY + TL.rowH * 0.38} class="tl-unit-name" text-anchor="end">{row.unitName}</text>
              <text x={TL.labelW - 8} y={rowY + TL.rowH * 0.65} class="tl-unit-cap" text-anchor="end">{row.capacity} MW</text>

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
                <!-- Planned retirement: dashed bar from now to that year (data-backed endpoint) -->
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
                <!-- Open-ended: fading gradient bar from now to the chart's right edge -->
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
                  <span class="status-badge badge-{statusClass(row.status)}">{capitalize(row.status)}</span>
                  {#if row.plannedRetirement}
                    <span class="tl-planned-note">Planned retirement<br />in {row.plannedRetirement}</span>
                  {/if}
                </div>
              </foreignObject>
            {/each}
          </svg>
        </div>

      <!-- ── Coal Information ────────────────────────────────────────────── -->
      {:else if activeTab === 'Coal Information'}
        <div class="coal-grid">
          <div class="coal-section">
            <div class="field-label">Coal Type(s)</div>
            {#if coalTypes.length > 0}
              {#each coalTypes as type}
                <div class="field-value">{capitalize(type)}</div>
              {/each}
            {:else}
              <div class="field-value muted">Unknown</div>
            {/if}
            <div class="field-label" style="margin-top:1.5rem;">Coal Source</div>
            {#if coalSources.length > 0}
              {#each coalSources as source}
                <div class="field-value">{source}</div>
              {/each}
            {:else}
              <div class="field-value muted">Unknown</div>
            {/if}
          </div>

          <div class="coal-section">
            <div class="field-label">Unit used for heat and power?</div>
            <div class="field-value">{chpValue ?? '—'}</div>
          </div>

          <div class="coal-section">
            <div class="field-label">
              Captive
              <span class="info-dot" data-tip="A captive plant generates power primarily for a specific industrial user rather than the public grid.">i</span>
            </div>
            <div class="field-value">{captiveValues.length > 0 ? captiveValues.join(', ') : 'Unknown'}</div>
            <!-- TODO: Add "XX% of plants in {country} are captive" once country-level stats are available -->
          </div>
        </div>

      <!-- ── Emissions & Phaseout ───────────────────────────────────────── -->
      {:else if activeTab === 'Emissions & Phaseout'}
        {#if alignmentStatus}
          <div class="alignment-banner alignment-{alignmentStatus}">
            {#if alignmentStatus === 'aligned'}
              ✅ Aligned with a 1.5°C pathway
            {:else if alignmentStatus === 'needs-acceleration'}
              ⏳ Closure commitment needs to accelerate
            {:else}
              ⚠️ Not aligned with 1.5°C pathway
            {/if}
          </div>
        {/if}

        <div class="emissions-grid">
          <div class="emissions-section">
            <div class="field-label">Planned retirement dates</div>
            {#if plannedRetirements.length > 0}
              {#each plannedRetirements as r}
                <div class="field-value">{r.name} – {r.year}</div>
              {/each}
            {:else}
              <div class="field-value muted">None on record</div>
            {/if}
            {#if remainingLifetime}
              <div class="field-label" style="margin-top:1rem;">Estimated remaining lifetime</div>
              <div class="field-value">{remainingLifetime} years</div>
            {/if}
          </div>

          <div class="emissions-section">
            <div class="field-label">Country 1.5°C phaseout date</div>
            <div class="field-value">{phaseout15C}</div>
            <div class="field-label" style="margin-top:1rem;">Country pledged phaseout date</div>
            <div class="field-value">{phaseoutCommitment ?? '—'}</div>
            <div class="field-label" style="margin-top:1rem;">Country pledged Net Zero date</div>
            <div class="field-value">{netZeroCommitment ?? '—'}</div>
          </div>

          <div class="emissions-section">
            <div class="field-label">
              {isInDevelopment ? 'Projected CO₂ emissions' : 'CO₂ emissions'}
              <span class="info-dot" data-tip="Estimated using capacity, capacity factor, heat rate, and emission factor. See gem.wiki for methodology.">i</span>
            </div>
            <div class="field-value">
              {#if annualCO2 || lifetimeCO2}
                {formatCO2(annualCO2) ?? '—'} per annum
                ({formatCO2(lifetimeCO2) ?? '—'} lifetime
                <span class="info-dot info-dot-inline" data-tip="Assumes a 35-year plant lifetime from commissioning. See gem.wiki for methodology.">i</span>)
              {:else}
                —
              {/if}
            </div>

            {#if emissionFactor}
              <div class="field-label" style="margin-top:1rem;">CO₂ emission factor</div>
              <div class="field-value">{emissionFactor}</div>
            {/if}

            {#if !isInDevelopment && capacityFactor != null}
              <div class="field-label" style="margin-top:1rem;">
                Capacity factor
                <span class="info-dot" data-tip="Country coal fleet average, based on GEM and Ember data. See gem.wiki for methodology.">i</span>
              </div>
              <div class="field-value">{capacityFactor}% (country coal fleet average)</div>
            {/if}
          </div>
        </div>

      <!-- ── Ownership ──────────────────────────────────────────────────── -->
      {:else if activeTab === 'Ownership'}
        <p class="narrative muted">
          <!-- TODO: embed AssetOwnershipTree component once available -->
          Ownership visualization coming soon.
        </p>

      <!-- ── Additional Details ─────────────────────────────────────────── -->
      {:else if activeTab === 'Additional Details'}
        {#if additionalDetails.length > 0}
          <dl class="details-list">
            {#each additionalDetails as row}
              <div class="details-row">
                <dt>{row.label}</dt>
                <dd>{row.values.join(' · ')}</dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="narrative muted">No additional fields with data for this plant.</p>
        {/if}
      {/if}

    </div><!-- /tab-content -->

    <!-- Footer -->
    <footer class="card-footer">
      <span>Database: {database}</span>
      {#if wikiUrl}
        · <a href={wikiUrl} target="_blank" rel="noopener noreferrer">Learn more on the GEM Wiki</a>
      {/if}
    </footer>

  </div><!-- /card-full -->
</details>

<style>
  .coal-plant-card {
    font-family: var(--gem-font, 'Plus Jakarta Sans', system-ui, sans-serif);
    background: #fff;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  /* ── Compact ──────────────────────────────────────────── */
  .card-compact {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .card-compact::-webkit-details-marker { display: none; }

  .compact-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #111;
  }
  .compact-location {
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.15rem;
  }
  .compact-badges {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
    flex-shrink: 0;
  }
  .status-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    line-height: 1.3;
  }
  .chip-status { font-size: 0.6rem; font-weight: 700; letter-spacing: 0.04em; }
  .chip-capacity { font-size: 0.78rem; font-weight: 400; }
  .chip-operating  { background: #7F142A; color: #fff; }
  .chip-planned    { background: #CA4A50; color: #fff; }
  .chip-retired    { background: #e0e0e0; color: #333; }
  .chip-cancelled  { background: #e0e0e0; color: #333; }
  .chip-mothballed { background: #e0e0e0; color: #333; }

  /* ── Full card ────────────────────────────────────────── */
  .card-full { border-top: 1px solid rgba(0,0,0,0.08); }

  /* ── Tab bar ──────────────────────────────────────────── */
  .tab-bar {
    display: flex;
    padding: 0 1.75rem;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .tab-btn {
    all: unset;
    cursor: pointer;
    padding: 0.85rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #666;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }
  .tab-btn:hover { color: #111; }
  .tab-btn.active { color: #111; border-bottom-color: #111; font-weight: 600; }

  /* ── Tab content ──────────────────────────────────────── */
  .tab-content {
    padding: 1.5rem 1.75rem;
    min-height: 220px;
  }
  .narrative {
    font-size: 0.9rem;
    color: #222;
    margin: 0 0 1.5rem;
    line-height: 1.6;
  }
  .narrative.muted { color: #999; font-style: italic; }

  /* ── Shared field styles ──────────────────────────────── */
  .field-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #111;
    margin-bottom: 0.2rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .field-value { font-size: 0.9rem; color: #222; }
  .field-value.muted { color: #999; }
  .field-coords { font-size: 0.75rem; color: #aaa; margin-top: 0.1rem; }

  .info-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: #111;
    color: #fff;
    border-radius: 50%;
    font-size: 0.6rem;
    font-weight: 700;
    cursor: help;
    flex-shrink: 0;
    font-style: normal;
    position: relative;
  }
  /* Inline variant (inside a field-value line) */
  .info-dot-inline {
    width: 12px;
    height: 12px;
    font-size: 0.55rem;
    vertical-align: middle;
    background: #888;
  }
  .info-dot::after {
    content: attr(data-tip);
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #222;
    color: #fff;
    font-size: 0.72rem;
    font-weight: 400;
    line-height: 1.4;
    padding: 0.4rem 0.6rem;
    border-radius: 4px;
    white-space: normal;
    width: max-content;
    max-width: 220px;
    text-align: left;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 100;
  }
  .info-dot:hover::after {
    opacity: 1;
  }

  /* ── Status badges ────────────────────────────────────── */
  .status-badge {
    display: inline-block;
    padding: 0.28rem 0.65rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-operating  { background: #7F142A; color: #fff; }
  .badge-planned    { background: #CA4A50; color: #fff; }
  .badge-retired    { background: #e0e0e0; color: #444; }
  .badge-cancelled  { background: #e0e0e0; color: #444; }
  .badge-mothballed { background: #e0e0e0; color: #444; }

  /* ── Overview tab ─────────────────────────────────────── */
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem 2rem;
    margin-bottom: 2rem;
  }
  .summary-heading {
    font-size: 0.8rem;
    font-weight: 700;
    color: #111;
    margin-bottom: 0.6rem;
  }
  .summary-row {
    display: grid;
    grid-template-columns: 150px 110px 80px 1fr;
    gap: 0;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    font-size: 0.85rem;
    align-items: center;
  }
  .summary-row:last-child { border-bottom: none; }
  .summary-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid rgba(0,0,0,0.15);
    padding-bottom: 0.4rem;
  }

  /* ── Units / Timeline tab ─────────────────────────────── */
  .timeline-heading {
    font-size: 0.8rem;
    font-weight: 700;
    color: #111;
    margin-bottom: 0.75rem;
  }
  .timeline-wrap { width: 100%; overflow-x: auto; }
  .timeline-svg { display: block; min-width: 500px; }

  /* SVG timeline elements — must be :global since they're inside SVG */
  :global(.tl-axis-label) {
    font-family: var(--gem-font, system-ui, sans-serif);
    font-size: 11px;
    fill: #888;
  }
  :global(.tl-gridline) { stroke: #ebebeb; stroke-width: 1; }
  :global(.tl-now-line) { stroke: #ccc; stroke-width: 1; }
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
  :global(.tl-bar) { fill: #111; }
  :global(.tl-bar.tl-bar-retired)    { fill: #bbb; }
  :global(.tl-bar.tl-bar-mothballed) { fill: #bbb; }
  :global(.tl-bar.tl-bar-cancelled)  { fill: #ccc; }
  :global(.tl-bar.tl-bar-planned)    { fill: #CA4A50; }
  :global(.tl-bar.tl-bar-future) { fill: none; stroke: #111; stroke-width: 2; }
  :global(.tl-dot)               { fill: #111; }
  :global(.tl-dot.tl-bar-mothballed) { fill: #bbb; }

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

  /* ── Coal Information tab ─────────────────────────────── */
  .coal-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }

  /* ── Emissions & Phaseout tab ─────────────────────────── */
  .alignment-banner {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
  }
  .alignment-aligned           { background: #f0fdf4; color: #166534; }
  .alignment-needs-acceleration { background: #fffbeb; color: #92400e; }
  .alignment-not-aligned       { background: #fff7ed; color: #9a3412; }

  .emissions-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 2rem;
  }
  .emissions-section { display: flex; flex-direction: column; }

  /* ── Additional Details tab ──────────────────────────── */
  .details-list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .details-row {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 0 1.5rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid rgba(0,0,0,0.06);
    align-items: baseline;
  }
  .details-row:last-child { border-bottom: none; }
  .details-row dt {
    font-size: 0.78rem;
    font-weight: 600;
    color: #555;
  }
  .details-row dd {
    margin: 0;
    font-size: 0.85rem;
    color: #222;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  /* ── Footer ───────────────────────────────────────────── */
  .card-footer {
    padding: 0.75rem 1.75rem;
    border-top: 1px solid rgba(0,0,0,0.08);
    font-size: 0.75rem;
    color: #888;
  }
  .card-footer a { color: #555; text-decoration: underline; }
  .card-footer a:hover { color: #111; }

  /* ── Responsive ───────────────────────────────────────── */
  @media (max-width: 700px) {
    .overview-grid,
    .coal-grid,
    .emissions-grid { grid-template-columns: 1fr; }
    .summary-row { grid-template-columns: 110px 90px 65px 1fr; font-size: 0.8rem; }
    .tab-btn { padding: 0.75rem 0.75rem; font-size: 0.8rem; }
  }
</style>
