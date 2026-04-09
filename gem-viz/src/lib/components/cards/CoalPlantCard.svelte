<script lang="ts">
  import { scaleLinear } from 'd3-scale';
  import type { CoalPlantUnit } from './coal-plant-types';
  import { AssetOwnershipTree } from '$lib/components/ownership';
  import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';
  import {
    OPERATING_STATUSES,
    PLANNED_STATUSES,
    CANCELLED_STATUSES,
    RETIRED_STATUSES,
    getStatusGroupId,
  } from '$lib/data-config/tracker-schema';
  import CardShell from './shell/CardShell.svelte';

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    units: allUnits,
    open = false,
    initialTab,
    ownershipLoader,
  }: {
    units: CoalPlantUnit[];
    open?: boolean;
    initialTab?: string;
    ownershipLoader?: (_params: {
      root: string;
      direction: 'up' | 'down';
      max_depth?: number;
    }) => Promise<{
      nodes?: GraphNode[];
      edges?: GraphEdge[];
      paths?: Record<string, OwnershipPathEntry[]>;
    }>;
  } = $props();

  // Filter to coal units only; track other asset types for the "additional units" note
  const units = $derived(allUnits.filter((u) => !u.asset_type || u.asset_type === 'Coal Plant'));
  const otherUnits = $derived(allUnits.filter((u) => u.asset_type && u.asset_type !== 'Coal Plant'));

  const otherUnitsNote = $derived.by((): string | null => {
    if (otherUnits.length === 0) return null;
    const byType = new Map<string, number>();
    for (const u of otherUnits) {
      const label = (u.asset_type ?? 'Unknown').replace(/\s*Plant\s*$/i, '');
      byType.set(label, (byType.get(label) ?? 0) + 1);
    }
    const coalCount = units.length;
    const breakdown = Array.from(byType.entries())
      .map(([type, count]) => `${count} ${type} unit${count === 1 ? '' : 's'}`)
      .join(', ');
    return `In addition to ${coalCount} coal unit${coalCount === 1 ? '' : 's'}, it has ${breakdown} not included here.`;
  });

  // ── Constants ──────────────────────────────────────────────────────────────

  const CURRENT_YEAR = new Date().getFullYear();

  const STATUS_ORDER = [
    'operating',
    'construction',
    'permitted',
    'pre-permit',
    'pre-construction',
    'announced',
    'proposed',
    'mothballed',
    'shelved',
    'cancelled',
    'retired',
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
  const locationId = $derived(units[0]?.location_id ?? null);
  const wikiUrl = $derived(f?.wiki_url ?? null);
  const database = $derived(f?.database ?? 'Global Coal Plant Tracker, January 2026');

  const altNames = $derived.by((): string | null => {
    if (!f) return null;
    const primary = (f.plant_name ?? '').toLowerCase();
    const names = [
      f.plant_name_2,
      ...(f.plant_name_3 ?? '').split(',').map((s) => s.trim()),
    ]
      .filter((n): n is string => !!n && n.toLowerCase() !== primary)
      .filter((n, i, arr) => arr.indexOf(n) === i); // dedupe
    return names.length ? names.join(' · ') : null;
  });

  const locationStr = $derived.by(() => {
    const parts: string[] = [];
    if (f?.location) parts.push(f.location);
    if (f?.local_area && !parts.some((p) => p.includes(f.local_area!))) parts.push(f.local_area);
    if (f?.subnational_unit && !parts.some((p) => p.includes(f.subnational_unit!)))
      parts.push(f.subnational_unit);
    if (f?.country_area && !parts.some((p) => p.includes(f.country_area)))
      parts.push(f.country_area);
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
      .filter((u) => u.coal_plant_fields.status === 'operating')
      .reduce((s, u) => s + parseFloat(u.coal_plant_fields.capacity_megawatts || '0'), 0);
    const plannedCap = units
      .filter((u) => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status))
      .reduce((s, u) => s + parseFloat(u.coal_plant_fields.capacity_megawatts || '0'), 0);
    if (opCap > 0)
      chips.push({ label: 'OPERATING', capacity: Math.round(opCap), cls: 'chip-operating' });
    if (plannedCap > 0)
      chips.push({ label: 'PLANNED', capacity: Math.round(plannedCap), cls: 'chip-planned' });
    return chips;
  });

  let tableByUnit = $state(false);

  const unitRows = $derived(
    [...units]
      .sort((a, b) => {
        const si =
          STATUS_ORDER.indexOf(a.coal_plant_fields.status) -
          STATUS_ORDER.indexOf(b.coal_plant_fields.status);
        if (si !== 0) return si;
        return (a.coal_plant_fields.unit_name ?? '').localeCompare(
          b.coal_plant_fields.unit_name ?? ''
        );
      })
      .map((u) => {
        const cpf = u.coal_plant_fields;
        return {
          status: cpf.status,
          name: cpf.unit_name,
          capacity: Math.round(parseFloat(cpf.capacity_megawatts || '0')),
          technology: cpf.combustion_technology || '—',
          coalType: cpf.coal_type || '—',
          coalSource: cpf.coal_source || '—',
          chp: cpf.cogeneration && cpf.cogeneration !== 'not found' ? cpf.cogeneration : '—',
        };
      })
  );

  // Group units by status for plant summary table
  const statusGroups = $derived.by(() => {
    const groups = new Map<
      string,
      {
        count: number;
        capacity: number;
        technologies: Set<string>;
        coalTypes: Set<string>;
        coalSources: Set<string>;
        chpValues: Set<string>;
      }
    >();
    for (const unit of units) {
      const cpf = unit.coal_plant_fields;
      const status = cpf.status;
      if (!groups.has(status))
        groups.set(status, {
          count: 0,
          capacity: 0,
          technologies: new Set(),
          coalTypes: new Set(),
          coalSources: new Set(),
          chpValues: new Set(),
        });
      const g = groups.get(status)!;
      g.count++;
      g.capacity += parseFloat(cpf.capacity_megawatts || '0');
      if (cpf.combustion_technology) g.technologies.add(cpf.combustion_technology);
      if (cpf.coal_type) g.coalTypes.add(cpf.coal_type);
      if (cpf.coal_source) g.coalSources.add(cpf.coal_source);
      if (cpf.cogeneration && cpf.cogeneration !== 'not found') g.chpValues.add(cpf.cogeneration);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b))
      .map(([status, d]) => ({
        status,
        count: d.count,
        capacity: Math.round(d.capacity),
        technologies: [...d.technologies].join(', ') || '—',
        coalTypes: [...d.coalTypes].join(', ') || '—',
        coalSources: [...d.coalSources].join(', ') || '—',
        chp: [...d.chpValues].join(', ') || '—',
      }));
  });

  // Primary owner — strip percentage annotations
  const primaryOwner = $derived.by(() => {
    const owner = f?.owner;
    if (!owner) return null;
    return (
      owner
        .split(';')
        .map((o) => o.replace(/\s*\[[\d.]+%\]\s*/g, '').trim())
        .filter(Boolean)
        .join(', ') || null
    );
  });

  // Plant age: max across operating/mothballed units
  const plantAge = $derived.by(() => {
    const ages = units
      .filter(
        (u) =>
          OPERATING_STATUSES.has(u.coal_plant_fields.status) ||
          u.coal_plant_fields.status === 'mothballed'
      )
      .map((u) => parseInt(u.coal_plant_fields.plant_age_years ?? '0'))
      .filter((a) => a > 0);
    return ages.length ? Math.max(...ages) : null;
  });

  // Coal Information tab
  const coalTypes = $derived([
    ...new Set(units.map((u) => u.coal_plant_fields.coal_type).filter(Boolean)),
  ] as string[]);
  const coalSources = $derived([
    ...new Set(units.map((u) => u.coal_plant_fields.coal_source).filter(Boolean)),
  ] as string[]);

  const chpValue = $derived.by(() => {
    const vals = [...new Set(units.map((u) => u.coal_plant_fields.cogeneration).filter(Boolean))];
    if (vals.includes('yes')) return 'Yes';
    if (vals.includes('no')) return 'No';
    return null;
  });

  const captiveValues = $derived([
    ...new Set(units.map((u) => u.coal_plant_fields.captive).filter((v) => v && v !== 'null')),
  ] as string[]);

  // Emissions & Phaseout tab
  const isInDevelopment = $derived(
    units.some((u) => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status))
  );

  const annualCO2 = $derived.by(() => {
    const sum = units.reduce(
      (s, u) => s + parseFloat(u.coal_plant_fields.annual_co2_million_tonnes__annum ?? '0'),
      0
    );
    return sum > 0 ? sum : null;
  });

  const lifetimeCO2 = $derived.by(() => {
    const sum = units.reduce(
      (s, u) => s + parseFloat(u.coal_plant_fields.lifetime_co2_million_tonnes ?? '0'),
      0
    );
    return sum > 0 ? sum : null;
  });

  const unitEmissions = $derived(
    units
      .map((u) => {
        const annual = parseFloat(u.coal_plant_fields.annual_co2_million_tonnes__annum ?? '');
        const lifetime = parseFloat(u.coal_plant_fields.lifetime_co2_million_tonnes ?? '');
        const status = u.coal_plant_fields.status;
        let cls: string;
        if (OPERATING_STATUSES.has(status)) cls = 'chip-operating';
        else if (DEVELOPMENT_STATUSES.has(status)) cls = 'chip-planned';
        else if (status === 'mothballed') cls = 'chip-mothballed';
        else if (RETIRED_STATUSES.has(status)) cls = 'chip-retired';
        else cls = 'chip-cancelled';
        return {
          name: u.coal_plant_fields.unit_name,
          annual: isNaN(annual) ? null : annual,
          lifetime: isNaN(lifetime) ? null : lifetime,
          cls,
        };
      })
      .filter((u) => u.annual != null || u.lifetime != null)
  );

  let emissionsExpanded = $state(false);

  const capacityFactor = $derived.by(() => {
    const raw = parseFloat(f?.capacity_factor ?? '');
    return isNaN(raw) ? null : Math.round(raw * 100);
  });

  const plannedRetirements = $derived(
    units
      .filter((u) => u.coal_plant_fields.planned_retirement)
      .map((u) => ({
        name: u.coal_plant_fields.unit_name,
        year: u.coal_plant_fields.planned_retirement!,
      }))
  );

  const remainingLifetime = $derived.by(() => {
    const vals = units
      .filter(
        (u) =>
          OPERATING_STATUSES.has(u.coal_plant_fields.status) ||
          u.coal_plant_fields.status === 'mothballed'
      )
      .map((u) => parseInt(u.coal_plant_fields.remaining_plant_lifetime_years ?? ''))
      .filter((v) => !isNaN(v) && v > 0);
    return vals.length ? Math.max(...vals) : null;
  });

  const emissionFactor = $derived.by(() => {
    const vals = [
      ...new Set(
        units
          .map((u) => u.coal_plant_fields.emission_factor_co2)
          .filter((v): v is string => !!v && v !== 'null')
      ),
    ];
    return vals.length ? vals.join(', ') : null;
  });

  const phaseoutCommitment = $derived(f?.phaseout_commitment ?? null);
  const netZeroCommitment = $derived(f?.['net-zero_commitment'] ?? f?.net_zero_year ?? null);
  const phaseout15C = $derived(PHASEOUT_1_5C[f?.subregion ?? ''] ?? 2040);

  const alignmentStatus = $derived.by(
    (): 'aligned' | 'needs-acceleration' | 'not-aligned' | null => {
      const activeUnits = units.filter((u) => {
        const s = u.coal_plant_fields.status;
        return !RETIRED_STATUSES.has(s) && !CANCELLED_STATUSES.has(s);
      });
      if (activeUnits.length === 0) return null;
      const allRetireByPhaseout = activeUnits.every((u) => {
        const yr = parseInt(u.coal_plant_fields.planned_retirement ?? '');
        return !isNaN(yr) && yr <= phaseout15C;
      });
      if (allRetireByPhaseout) return 'aligned';
      if (phaseoutCommitment && parseInt(phaseoutCommitment) <= phaseout15C)
        return 'needs-acceleration';
      return 'not-aligned';
    }
  );

  // Narrative sentences
  const captiveNote = $derived.by((): string => {
    const vals = captiveValues.filter(
      (v) => v && v.toLowerCase() !== 'no' && v.toLowerCase() !== 'unknown'
    );
    if (vals.length === 0) return '';
    return ` — a captive plant generating power primarily for ${vals.join(', ')}, rather than the grid —`;
  });

  const overviewNarrative = $derived.by((): string | null => {
    if (plantAge && plantAge > 0) {
      const yearsText = plantAge >= 40 ? 'over 40' : `${plantAge}`;
      return `${plantName}${captiveNote} has been operating for ${yearsText} years.`;
    }
    if (units.some((u) => DEVELOPMENT_STATUSES.has(u.coal_plant_fields.status))) {
      return `${plantName}${captiveNote} is a proposed coal plant in ${f?.country_area ?? units[0]?.country ?? ''}.`;
    }
    if (captiveNote) {
      return `${plantName}${captiveNote}.`;
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
      sentence += ` Planned retirements: ${plannedRetirements.map((r) => `${r.name} (${r.year})`).join(', ')}.`;
    }
    return sentence;
  });

  // ── Additional Details tab ─────────────────────────────────────────────────

  // Fields displayed in other tabs — excluded from Additional Details
  const _USED_FIELDS = new Set([
    'plant_name',
    'unit_name',
    'status',
    'capacity_megawatts',
    'start_year',
    'retired_year',
    'planned_retirement',
    'phaseout_commitment',
    'net-zero_commitment',
    'net_zero_year',
    'combustion_technology',
    'coal_type',
    'coal_source',
    'cogeneration',
    'captive',
    'owner',
    'annual_co2_million_tonnes__annum',
    'lifetime_co2_million_tonnes',
    'plant_age_years',
    'wiki_url',
    'location',
    'subnational_unit',
    'local_area',
    'country_area',
    'subregion',
    'database',
    'latitude',
    'longitude',
    'remaining_plant_lifetime_years',
    'location_accuracy',
  ]);

  const FIELD_LABELS: Record<string, string> = {
    alternate_fuel: 'Alternate fuel',
    captive_industry_use: 'Captive industry use',
    captive_residential_use: 'Captive residential use',
    parent: 'Parent company',
    parent_gem_entity_id: 'Parent GEM ID',
    owner_gem_entity_id: 'Owner GEM ID',
    capacity_factor: 'Capacity factor',
    emission_factor_co2: 'CO₂ emission factor',
    heat_rate_btu: 'Heat rate (BTU/kWh)',
    major_area: 'Major area',
    region: 'Region',
    gem_location_id: 'GEM location ID',
    gem_unit_phase_id: 'GEM unit/phase ID',
  };

  const additionalDetails = $derived.by(() => {
    return Object.entries(FIELD_LABELS).flatMap(([key, label]) => {
      const values = [
        ...new Set(
          units
            .map((u) => (u.coal_plant_fields as unknown as Record<string, string | null>)[key])
            .filter((v): v is string => !!v && v !== 'null' && v !== 'not found')
        ),
      ];
      return values.length ? [{ label, values }] : [];
    });
  });

  // ── Tabs ───────────────────────────────────────────────────────────────────

  const TABS = [
    'Overview',
    'Timeline',
    'Emissions & Phaseout',
    'Ownership',
    'Additional Details',
  ] as const;
  type TabName = (typeof TABS)[number];
  let activeTab = $state<TabName>(
    initialTab && TABS.includes(initialTab as TabName) ? (initialTab as TabName) : 'Overview'
  );
  let ownershipActivated = $state(false);

  $effect(() => {
    if (activeTab === 'Ownership') ownershipActivated = true;
  });

  // CardShell needs StatusGroup type for the badge
  const statusGroup = $derived(
    (() => {
      const s = units[0]?.coal_plant_fields?.status ?? '';
      return (getStatusGroupId(s) ?? 'operating') as 'operating' | 'planned' | 'retired' | 'cancelled';
    })()
  );

  // ── Timeline chart ─────────────────────────────────────────────────────────

  const TL = { labelW: 90, badgeW: 130, rowH: 52, barH: 8, axisH: 28 };
  const TL_MIN_W = 560; // minimum before horizontal scroll kicks in

  let tlContainerW = $state(860);
  let tlWrapEl = $state<HTMLDivElement | null>(null);

  $effect(() => {
    if (!tlWrapEl) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) tlContainerW = Math.max(w, TL_MIN_W);
    });
    ro.observe(tlWrapEl);
    return () => ro.disconnect();
  });

  const timeline = $derived.by(() => {
    const viewW = tlContainerW;
    const barAreaW = viewW - TL.labelW - TL.badgeW;
    const allYears = units.flatMap((u) => {
      const cpf = u.coal_plant_fields;
      const start = parseInt(cpf.start_year ?? '');
      const retiredY = parseInt(cpf.retired_year ?? '');
      const plannedRetY = parseInt(cpf.planned_retirement ?? '');
      // Only use data-backed years for domain; open-ended units extend to chart edge separately
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

      // For bar geometry: use data years only; open-ended bars are rendered as a separate gradient rect
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
      // Open-ended: operating/mothballed/construction with no retirement data
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

  // ── Timeline tooltip ───────────────────────────────────────────────────────

  let tlTooltip = $state<{ text: string; x: number; y: number } | null>(null);
  let hoveredRowIndex = $state<number | null>(null);

  function rowTooltip(row: (typeof timeline.rows)[number]): string {
    const cap = row.capacity ? `${row.capacity} MW` : null;
    const header = cap ? `${row.unitName} · ${cap}` : row.unitName;
    const status = row.status.charAt(0).toUpperCase() + row.status.slice(1);
    const lines = [header];
    if (row.startY) {
      if (row.retiredYear) {
        lines.push(`Start year: ${row.startY}`);
        lines.push(`Retired: ${row.retiredYear}`);
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

<CardShell
  name={plantName}
  {altNames}
  statusLabel={capitalize(units[0]?.coal_plant_fields?.status ?? '')}
  {statusGroup}
  {locationStr}
  {wikiUrl}
  sourceLabel="Database: {database}"
  tabs={TABS}
  {initialTab}
  {open}
  bind:activeTab
>
  {#snippet compactRight()}
    {#each compactChips as chip}
      <span class="status-chip {chip.cls}">
        <span class="chip-status">{chip.label}</span>
        <span class="chip-capacity">{formatMW(chip.capacity)}</span>
      </span>
    {/each}
  {/snippet}

  {#snippet tabContent(tab)}
    {#if tab === 'Overview'}
        {#if overviewNarrative || otherUnitsNote}
          <p class="narrative">{overviewNarrative ?? ''}{overviewNarrative && otherUnitsNote ? ' ' : ''}{otherUnitsNote ?? ''}</p>
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
          <div class="overview-section">
            <div class="field-label">
              Plant age
              <span
                class="info-dot"
                data-tip="Age since the first operating unit began commercial operation">i</span
              >
            </div>
            <div class="field-value">{plantAge ? `${plantAge} years` : '—'}</div>
          </div>
        </div>

        <div class="summary-section">
          <div class="summary-heading-row">
            <div class="summary-heading">Plant summary</div>
            {#if units.length > 1}
              <button
                class="table-view-toggle"
                onclick={() => (tableByUnit = !tableByUnit)}
                aria-pressed={tableByUnit}
              >{tableByUnit ? '▲ grouped' : '▼ by unit'}</button>
            {/if}
          </div>
          <div class="summary-table" class:summary-table--by-unit={tableByUnit}>
            {#if tableByUnit}
              <div class="summary-row summary-header">
                <span>Status</span>
                <span>Unit</span>
                <span>Capacity</span>
                <span>Technology</span>
                <span>Coal type</span>
                <span>Coal source</span>
                <span>CHP <span class="info-dot info-dot-inline" data-tip="Unit used for heat and power">i</span></span>
              </div>
              {#each unitRows as row}
                <div class="summary-row">
                  <span><span class="status-badge badge-{statusClass(row.status)}">{capitalize(row.status)}</span></span>
                  <span>{row.name}</span>
                  <span>{formatMW(row.capacity)}</span>
                  <span>{row.technology}</span>
                  <span>{row.coalType}</span>
                  <span>{row.coalSource}</span>
                  <span>{row.chp}</span>
                </div>
              {/each}
            {:else}
              <div class="summary-row summary-header">
                <span>Status</span>
                <span>Capacity</span>
                <span>Units</span>
                <span>Technology</span>
                <span>Coal type</span>
                <span>Coal source</span>
                <span>CHP <span class="info-dot info-dot-inline" data-tip="Unit used for heat and power">i</span></span>
              </div>
              {#each statusGroups as group}
                <div class="summary-row">
                  <span><span class="status-badge badge-{statusClass(group.status)}">{capitalize(group.status)}</span></span>
                  <span>{formatMW(group.capacity)}</span>
                  <span>{group.count} unit{group.count === 1 ? '' : 's'}</span>
                  <span>{group.technologies}</span>
                  <span>{group.coalTypes}</span>
                  <span>{group.coalSources}</span>
                  <span>{group.chp}</span>
                </div>
              {/each}
            {/if}
          </div>
        </div>
    {:else if tab === 'Timeline'}
        <p class="narrative">{unitsNarrative}</p>
        <div class="timeline-heading">Operational Timeline by Unit</div>

        <div class="timeline-wrap" bind:this={tlWrapEl}>
          <svg
            class="timeline-svg"
            viewBox="0 0 {tlContainerW} {timeline.svgH}"
            width={tlContainerW}
            height={timeline.svgH}
            role="img"
            aria-label="Operational timeline for {plantName}"
            onmouseleave={() => {
              tlTooltip = null;
              hoveredRowIndex = null;
            }}
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

              <!-- Visual group: pointer-events disabled so hit rect above catches all events -->
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
                    <span class="status-badge badge-{statusClass(row.status)}"
                      >{capitalize(row.status)}</span
                    >
                  </div>
                </foreignObject>
              </g>

              <!-- Hit target rendered last so it sits on top in z-order -->
              <rect
                x={0}
                y={rowY}
                width={tlContainerW}
                height={TL.rowH}
                fill="transparent"
                role="presentation"
                aria-hidden="true"
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
    {:else if tab === 'Emissions & Phaseout'}
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
            <div class="field-label" style="margin-top:1rem;">Estimated remaining lifetime</div>
            <div class="field-value">{remainingLifetime ? `${remainingLifetime} years` : '—'}</div>
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
              <span
                class="info-dot"
                data-tip="Estimated using capacity, capacity factor, heat rate, and emission factor. See gem.wiki for methodology."
                >i</span
              >
            </div>
            <div class="field-value">
              {#if annualCO2 || lifetimeCO2}
                {formatCO2(annualCO2) ?? '—'} per annum ({formatCO2(lifetimeCO2) ?? '—'} lifetime
                <span
                  class="info-dot info-dot-inline"
                  data-tip="Assumes a 35-year plant lifetime from commissioning. See gem.wiki for methodology."
                  >i</span
                >)
                {#if unitEmissions.length > 1}
                  <button
                    class="emissions-expand-btn"
                    onclick={() => (emissionsExpanded = !emissionsExpanded)}
                    aria-expanded={emissionsExpanded}
                    >{emissionsExpanded ? '▲ hide units' : '▼ by unit'}</button
                  >
                {/if}
              {:else}
                —
              {/if}
            </div>
            {#if emissionsExpanded && unitEmissions.length > 1}
              <div class="unit-emissions-list">
                {#each unitEmissions as u}
                  <div class="unit-emission-row">
                    <span class="unit-emission-dot {u.cls}"></span>
                    <span class="unit-emission-name">{u.name}</span>
                    <span class="unit-emission-vals">
                      {formatCO2(u.annual) ?? '—'}/yr · {formatCO2(u.lifetime) ?? '—'} lifetime
                    </span>
                  </div>
                {/each}
              </div>
            {/if}

          </div>
        </div>
    {:else if tab === 'Ownership'}
        {#if ownershipActivated && units[0]?.asset_id}
          <div class="ownership-tree-wrap">
            <AssetOwnershipTree
              assetId={locationId}
              compact={false}
              fullWidth={true}
              showViewFull={false}
              emptyMessage="No ownership data available"
              errorMessage="Failed to load ownership data"
              {ownershipLoader}
            />
          </div>
        {:else if ownershipActivated}
          <div class="ownership-status">No ownership data available</div>
        {/if}
    {:else if tab === 'Additional Details'}
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
  {/snippet}
</CardShell>

{#if tlTooltip}
  <div class="tl-tooltip" style="left:{tlTooltip.x + 14}px; top:{tlTooltip.y + 10}px;">
    {tlTooltip.text}
  </div>
{/if}

<style>
  .status-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    line-height: 1.3;
  }
  .chip-status {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .chip-capacity {
    font-size: 0.78rem;
    font-weight: 400;
  }
  .chip-operating {
    background: #7f142a;
    color: #fff;
  }
  .chip-planned {
    background: #ca4a50;
    color: #fff;
  }
  .chip-retired {
    background: #e0e0e0;
    color: #333;
  }
  .chip-cancelled {
    background: #e0e0e0;
    color: #333;
  }
  .chip-mothballed {
    background: #e0e0e0;
    color: #333;
  }

  .narrative {
    font-size: 0.9rem;
    color: #222;
    margin: 0 0 1.5rem;
    line-height: 1.6;
  }
  .narrative.muted {
    color: #999;
    font-style: italic;
  }
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
  .field-value {
    font-size: 0.9rem;
    color: #222;
  }
  .field-value.muted {
    color: #999;
  }
  .field-coords {
    font-size: 0.75rem;
    color: #aaa;
    margin-top: 0.1rem;
  }

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
    text-transform: none;
    letter-spacing: 0;
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
    top: calc(100% + 6px);
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
    grid-template-columns: 130px 90px 70px 1fr 1fr 1fr 50px;
    gap: 0;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 0.85rem;
    align-items: center;
  }
  .summary-row:last-child {
    border-bottom: none;
  }
  .summary-header {
    font-size: 0.7rem;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    padding-bottom: 0.4rem;
  }

  .summary-heading-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-bottom: 0.6rem;
  }
  .summary-heading-row .summary-heading {
    margin-bottom: 0;
  }
  .table-view-toggle {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    color: #888;
  }
  .table-view-toggle:hover {
    color: #333;
  }
  .summary-table--by-unit .summary-row {
    grid-template-columns: 130px 1fr 90px 1fr 1fr 1fr 70px;
  }
  /* Right-align tooltip for info-dots in the last column so it doesn't overflow */
  .summary-row > span:last-child .info-dot::after {
    left: auto;
    right: 0;
    transform: none;
  }

  /* ── Units / Timeline tab ─────────────────────────────── */
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

  /* ── Ownership tab ────────────────────────────────── */
  .ownership-status {
    font-size: 0.82rem;
    color: #888;
    padding: 1rem 0;
  }
  .ownership-status.error {
    color: #b00;
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

  /* SVG timeline elements — must be :global since they're inside SVG */
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

  /* ── Emissions & Phaseout tab ─────────────────────────── */
  .alignment-banner {
    padding: 0.65rem 1rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 1.5rem;
  }
  .alignment-aligned {
    background: #f0fdf4;
    color: #166534;
  }
  .alignment-needs-acceleration {
    background: #fffbeb;
    color: #92400e;
  }
  .alignment-not-aligned {
    background: #fff7ed;
    color: #9a3412;
  }

  .emissions-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 2rem;
  }
  .emissions-section {
    display: flex;
    flex-direction: column;
  }

  .emissions-expand-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.72rem;
    color: #888;
    margin-left: 0.4rem;
    white-space: nowrap;
  }
  .emissions-expand-btn:hover {
    color: #333;
  }

  .unit-emissions-list {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-top: 0.6rem;
  }
  .unit-emission-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.82rem;
    color: #333;
  }
  .unit-emission-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  /* Reuse chip background colors for the dot */
  .unit-emission-dot.chip-operating {
    background: #7f142a;
  }
  .unit-emission-dot.chip-planned {
    background: #ca4a50;
  }
  .unit-emission-dot.chip-retired,
  .unit-emission-dot.chip-cancelled,
  .unit-emission-dot.chip-mothballed {
    background: #bbb;
  }

  .unit-emission-name {
    font-weight: 600;
    min-width: 60px;
    white-space: nowrap;
  }
  .unit-emission-vals {
    color: #555;
  }

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
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    align-items: baseline;
  }
  .details-row:last-child {
    border-bottom: none;
  }
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

  /* ── Responsive ───────────────────────────────────────── */
  @media (max-width: 768px) {
    .overview-grid,
    .coal-grid,
    .emissions-grid {
      grid-template-columns: 1fr;
    }
    .summary-row {
      grid-template-columns: 110px 90px 65px 1fr;
      font-size: 0.8rem;
    }
  }
</style>
