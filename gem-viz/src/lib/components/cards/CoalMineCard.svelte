<script lang="ts">
  import CardShell from './shell/CardShell.svelte';
  import CardSection from './shell/CardSection.svelte';
  import type { StatusGroup, FieldDef } from './shell/card-types';
  import type { CoalMineAsset } from './coal-mine-types';
  import { AssetOwnershipTree } from '$lib/components/ownership';
  import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';
  import { getStatusGroupId } from '$lib/data-config/tracker-schema';

  // ── Props ──────────────────────────────────────────────────────────────────

  let {
    asset,
    open = false,
    initialTab,
    ownershipLoader,
  }: {
    asset: CoalMineAsset;
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

  // ── Constants ──────────────────────────────────────────────────────────────

  const TABS = ['Overview', 'Resources', 'Methane', 'Ownership', 'Additional Details'] as const;
  type TabName = (typeof TABS)[number];

  let activeTab = $state<TabName>('Overview');
  let ownershipActivated = $state(false);

  $effect(() => {
    if (activeTab === 'Ownership') ownershipActivated = true;
  });

  // ── Derived: shorthand ─────────────────────────────────────────────────────

  const f = $derived(asset.coal_mine_fields);

  // ── Status ─────────────────────────────────────────────────────────────────

  const statusGroup = $derived<StatusGroup>(
    (['operating', 'planned', 'retired', 'cancelled'] as const).includes(
      asset.operating_status as StatusGroup
    )
      ? (asset.operating_status as StatusGroup)
      : 'retired'
  );

  /** Human-readable label: prefer mine_site_status, fall back to operating_sub_status, then operating_status */
  const statusLabel = $derived(
    f.mine_site_status ??
    capitalize(asset.operating_sub_status ?? asset.operating_status)
  );

  // ── Location ───────────────────────────────────────────────────────────────

  const locationStr = $derived.by(() => {
    const parts: string[] = [];
    if (f.state_province && !parts.some(p => p.includes(f.state_province!)))
      parts.push(f.state_province);
    if (f.country_area) parts.push(f.country_area);
    return parts.join(', ') || asset.country || '';
  });

  const locationStrLong = $derived.by(() => {
    const parts: string[] = [];
    if (f.location) parts.push(f.location);
    if (f.prefecture_district && !parts.some(p => p.includes(f.prefecture_district!)))
      parts.push(f.prefecture_district);
    parts.push(locationStr);
    return parts.join(', ') || asset.country || '';
  });

  const coords = $derived.by(() => {
    const lat = parseFloat(f.latitude ?? '');
    const lon = parseFloat(f.longitude ?? '');
    if (isNaN(lat) || isNaN(lon)) return null;
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  });

  const altNames = $derived.by((): string | null => {
    const primary = (f.mine_name ?? '').toLowerCase();
    const names = [
      f.mine_name_non_eng,
      ...(f.mine_name_akas ?? '').split(',').map((s: string) => s.trim()),
    ]
      .filter((n): n is string => !!n && n.toLowerCase() !== primary)
      .filter((n, i, arr) => arr.indexOf(n) === i);
    return names.length ? names.join(' · ') : null;
  });

  // ── Owners ─────────────────────────────────────────────────────────────────

  const ownersList = $derived(
    f.owners ? f.owners.split(',').map(s => s.trim()).filter(Boolean) : []
  );

  // ── Numeric helpers ────────────────────────────────────────────────────────

  /** Parse Mtpa/numeric string fields that use "-" for no data */
  function parseMineNum(v: string | null | undefined): number | null {
    if (!v || v === '-') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  function fmtNum(v: string | null | undefined, decimals = 2): string | null {
    const n = parseMineNum(v);
    if (n === null) return null;
    return n % 1 === 0 ? n.toLocaleString() : n.toFixed(decimals);
  }

  function capitalize(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  // ── Source label ───────────────────────────────────────────────────────────

  const sourceLabel = 'Global Coal Mine Tracker, May 2025';

  // ── Overview: narrative + age ───────────────────────────────────────────────

  const CURRENT_YEAR = new Date().getFullYear();

  const mineAge = $derived.by((): number | null => {
    if (asset.operating_status !== 'operating') return null;
    const open = parseInt(f.opening_year ?? '');
    if (isNaN(open) || open < 1800) return null;
    return CURRENT_YEAR - open;
  });

  const mineNarrative = $derived.by((): string | null => {
    const name = asset.asset_name;
    const coalfield = f.coalfield || '';
    const country = f.country_area || asset.country || '';
    const typeDesc = [f.mine_type?.toLowerCase(), f.mining_method?.toLowerCase()]
      .filter(Boolean).join(' ');
    const coalDesc = [f.coal_grade?.toLowerCase(), f.coal_type?.toLowerCase()]
      .filter(Boolean).join(' ');

    if (asset.operating_status === 'operating') {
      let s = `${name} is an operating${typeDesc ? ` ${typeDesc}` : ''} mine`;
      if (coalfield) s += ` in the ${coalfield} coalfield`;
      s += '.';
      const prod = fmtNum(f.production_mtpa);
      const yr = f.year_of_production ? ` in ${f.year_of_production}` : '';
      if (prod && coalDesc) s += ` It produced ${prod} Mtpa of ${coalDesc} coal${yr}.`;
      else if (prod) s += ` It produced ${prod} Mtpa${yr}.`;
      else if (coalDesc) s += ` It extracts ${coalDesc} coal.`;
      return s;
    }
    if (asset.operating_status === 'retired') {
      const verb = asset.operating_sub_status === 'abandoned' ? 'abandoned' : 'closed';
      let s = `${name} is a ${verb}${typeDesc ? ` ${typeDesc}` : ''} mine`;
      if (coalfield) s += ` in the ${coalfield} coalfield`;
      if (f.opening_year && f.closing_year) s += `, active from ${f.opening_year} to ${f.closing_year}`;
      else if (f.closing_year) s += `, ${verb} in ${f.closing_year}`;
      s += '.';
      if (coalDesc) s += ` It extracted ${coalDesc} coal.`;
      return s;
    }
    if (asset.operating_status === 'planned') {
      let s = `${name} is a proposed${typeDesc ? ` ${typeDesc}` : ''} mine`;
      if (coalfield) s += ` in the ${coalfield} coalfield`;
      s += '.';
      if (coalDesc) s += ` It will extract ${coalDesc} coal.`;
      return s;
    }
    return null;
  });

  // ── Tab: Resources sections ────────────────────────────────────────────────

  const resourcesPhysicalSection = $derived<FieldDef[]>([
    { label: 'Workforce',  value: fmtNum(f.workforce_size, 0),
      valueTooltip: f.workforce_accuracy ? `Accuracy: ${f.workforce_accuracy}` : undefined },
    { label: 'Mine size',  value: fmtNum(f.mine_size_km2),   unit: 'km²' },
    { label: 'Mine depth', value: fmtNum(f.mine_depth_m, 0), unit: 'm',
      valueTooltip: f.depth_accuracy ? `Accuracy: ${f.depth_accuracy}` : undefined },
  ]);

  const resourcesReservesSection = $derived<FieldDef[]>([
    { label: 'Proven & probable reserves', value: fmtNum(f.total_reserves_proven_and_probable_mt), unit: 'Mt' },
    { label: 'Total resources (inferred+)', value: fmtNum(f.total_resource_inferred_indicated_measured), unit: 'Mt' },
    { label: 'Reserve/production ratio',   value: fmtNum(f.reserve_to_production_ratio_r_p) },
    { label: 'Reported mine life',         value: f.reported_life_of_mine,
      tooltip: f.reported_year_of_mine_life ? `As reported in ${f.reported_year_of_mine_life}` : undefined },
  ]);

  const resourcesCoalSplitSection = $derived<FieldDef[]>([
    { label: 'Thermal coal share',     value: fmtNum(f.percentage_of_thermal_coal), unit: '%' },
    { label: 'Metallurgical coal share', value: fmtNum(f.percentage_of_met_coal),   unit: '%' },
  ]);

  // ── Tab: Methane sections ──────────────────────────────────────────────────

  const methaneGasRatingSection = $derived<FieldDef[]>([
    { label: 'Gas-level rating',       value: f['gas-level_rating'],
      tooltip: f['gas-level_rating_appraisal_year']
        ? `Appraisal year: ${f['gas-level_rating_appraisal_year']}`
        : undefined },
    { label: 'Methane gas content',    value: fmtNum(f.methane_gas_content_m3tonne), unit: 'm³/tonne' },
  ]);

  const methaneEmissionsSection = $derived<FieldDef[]>([
    { label: 'GEM estimate',           value: fmtNum(f.gem_coal_mine_methane_emissions_estimate_mcm_yr),   unit: 'MCM/yr' },
    { label: 'GEM estimate (mass)',    value: fmtNum(f.gem_coal_mine_methane_emissions_estimate_m_tonnes_yr), unit: 'Mt/yr' },
    { label: 'Reported emissions',     value: fmtNum(f.reported_coal_mine_methane_emissions_thousand_tonnes_per_year), unit: 'kt/yr',
      tooltip: f.year_of_reported_coal_mine_methane_emissions
        ? `Reported in ${f.year_of_reported_coal_mine_methane_emissions}`
        : undefined },
  ]);

  const methaneCo2eSection = $derived<FieldDef[]>([
    { label: 'CO₂e (20-yr GWP)',       value: fmtNum(f.cmm_emissions_co2e_20_years),  unit: 'Mt' },
    { label: 'CO₂e (100-yr GWP)',      value: fmtNum(f.cmm_emissions_co2e_100_years), unit: 'Mt' },
  ]);

  const methaneMitigationSection = $derived<FieldDef[]>([
    { label: 'CMM mitigation data',    value: f.has_associated_cmm_mitigation_data },
    { label: 'Plume data',             value: f.has_associated_plume_data },
    { label: 'Emissions factor updated', value: f.methane_emissions_factor_updated },
  ]);

  // ── Tab: Additional Details ────────────────────────────────────────────────

  /** Fields already shown in other tabs — excluded from Additional Details */
  const SHOWN_FIELDS = new Set([
    'mine_name', 'mine_name_non_eng', 'mine_name_akas', 'complex_name',
    'status', 'mine_site_status', 'project_phase', 'project_type', 'reason_for_closure',
    'country_area', 'state_province', 'prefecture_district', 'location',
    'region', 'subregion', 'latitude', 'longitude', 'location_accuracy', 'coalfield',
    'mine_type', 'mining_method', 'opening_year', 'closing_year',
    'capacity_mtpa', 'production_mtpa', 'year_of_production',
    'coal_type', 'coal_grade',
    'mine_size_km2', 'mine_depth_m', 'depth_accuracy', 'workforce_size', 'workforce_accuracy',
    'total_reserves_proven_and_probable_mt', 'total_resource_inferred_indicated_measured',
    'reserve_to_production_ratio_r_p', 'reported_life_of_mine', 'reported_year_of_mine_life',
    'percentage_of_thermal_coal', 'percentage_of_met_coal',
    'gas-level_rating', 'gas-level_rating_appraisal_year',
    'gem_coal_mine_methane_emissions_estimate_mcm_yr', 'gem_coal_mine_methane_emissions_estimate_m_tonnes_yr',
    'cmm_emissions_co2e_20_years', 'cmm_emissions_co2e_100_years',
    'reported_coal_mine_methane_emissions_thousand_tonnes_per_year',
    'year_of_reported_coal_mine_methane_emissions', 'methane_gas_content_m3tonne',
    'has_associated_cmm_mitigation_data', 'has_associated_plume_data', 'methane_emissions_factor_updated',
    'owners', 'owner_gem_entity_id', 'parent_company', 'company_hqs', 'owners_non_eng',
    'gem_mine_id',
  ]);

  const ADDITIONAL_LABELS: Record<string, string> = {
    msha_id: 'MSHA ID',
    complex_name: 'Complex name',
    iso_code: 'ISO code',
    mine_size_km2_2: 'Mine size (alt. estimate)',
    mine_depth_m_2: 'Mine depth (alt. estimate)',
    coal_output_annual_mst: 'Annual output (MST)',
    status_detail: 'Status detail',
    coal_plant_steel_plant_terminal: 'End users (plants / terminals)',
    coal_plant_steel_plant_terminal_gem_wiki: 'End users (GEM wiki)',
    primary_consumer_destination: 'Primary consumer destination',
    gem_wiki_page_eng: 'GEM wiki (English)',
    gem_wiki_page_non_eng: 'GEM wiki (other language)',
    source_id: 'Source ID',
  };

  const additionalFields = $derived<FieldDef[]>(
    Object.entries(f)
      .filter(([key, val]) => !SHOWN_FIELDS.has(key) && val !== null && val !== '' && val !== '-')
      .map(([key, val]) => ({
        label: ADDITIONAL_LABELS[key] ?? key.replace(/_/g, ' '),
        value: String(val),
        link: (key === 'gem_wiki_page_eng' || key === 'gem_wiki_page_non_eng') && val
          ? String(val)
          : undefined,
      }))
  );
</script>

<CardShell
  name={asset.asset_name}
  {altNames}
  {statusLabel}
  {statusGroup}
  {locationStr}
  wikiUrl={f.gem_wiki_page_eng}
  {sourceLabel}
  tabs={TABS}
  {initialTab}
  {open}
  bind:activeTab
>
  {#snippet compactRight()}
    <span class="status-chip chip-{statusGroup}">{statusLabel}</span>
  {/snippet}

  {#snippet tabContent(tab)}
    <!-- ── Overview ───────────────────────────────────────────────────── -->
    {#if tab === 'Overview'}
      {#if mineNarrative}
        <p class="narrative">{mineNarrative}</p>
      {/if}

      <div class="overview-grid">
        <!-- Location -->
        <div class="overview-section">
          <div class="ov-label">Location</div>
          <div class="ov-value">{locationStrLong}</div>
          {#if coords}
            <div class="ov-coords">{coords}{#if f.location_accuracy == "Approximate"}&nbsp;({f.location_accuracy}){/if}</div>
          {/if}
        </div>

        <!-- Ownership -->
        <div class="overview-section">
          <div class="ov-label">Primary Owner(s)</div>
          <div class="ov-value">{ownersList.length ? ownersList.join(', ') : '—'}</div>
          {#if f.parent_company && !ownersList.includes(f.parent_company)}
            <div class="ov-coords">Parent: {f.parent_company}</div>
          {/if}
        </div>

        <!-- Age / Lifecycle -->
        <div class="overview-section">
          {#if asset.operating_status === 'operating'}
            <div class="ov-label">Mine age</div>
            <div class="ov-value">{mineAge != null ? `${mineAge} years` : '—'}</div>
            {#if f.opening_year}<div class="ov-coords">Operating since {f.opening_year}</div>{/if}
          {:else if asset.operating_status === 'retired'}
            <div class="ov-label">Mine lifetime</div>
            {#if f.opening_year && f.closing_year}
              {@const span = parseInt(f.closing_year) - parseInt(f.opening_year)}
              <div class="ov-value">{f.opening_year}–{f.closing_year}</div>
              {#if !isNaN(span) && span > 0}<div class="ov-coords">{span} years</div>{/if}
            {:else if f.closing_year}
              <div class="ov-value">Closed {f.closing_year}</div>
            {:else if f.opening_year}
              <div class="ov-value">Opened {f.opening_year}</div>
            {:else}
              <div class="ov-value">—</div>
            {/if}
          {:else if asset.operating_status === 'planned'}
            <div class="ov-label">Project phase</div>
            <div class="ov-value">{f.project_phase ?? f.project_type ?? '—'}</div>
          {:else}
            <div class="ov-label">Opened</div>
            <div class="ov-value">{f.opening_year ?? '—'}</div>
          {/if}
        </div>
      </div>

      <!-- Key metrics row -->
      {@const metrics = [
        { label: 'Mine type',   value: f.mine_type },
        { label: 'Method',      value: f.mining_method },
        { label: 'Coal type',   value: f.coal_type },
        { label: 'Coal grade',  value: f.coal_grade },
        { label: 'Capacity',    value: fmtNum(f.capacity_mtpa),   unit: 'Mtpa' },
        { label: 'Production',  value: fmtNum(f.production_mtpa), unit: 'Mtpa' },
        { label: 'Coalfield',   value: f.coalfield },
      ].filter(m => m.value != null)}
      {#if metrics.length > 0}
        <div class="mine-metrics">
          {#each metrics as m}
            <div class="metric-item">
              <div class="metric-label">{m.label}</div>
              <div class="metric-value">{m.value}{m.unit ? ' ' + m.unit : ''}</div>
            </div>
          {/each}
        </div>
      {/if}

    <!-- ── Resources ─────────────────────────────────────────────────── -->
    {:else if tab === 'Resources'}
      {@const hasPhysical = resourcesPhysicalSection.some(f => f.value != null && f.value !== '')}
      <div class="two-col-grid">
        <div>
          {#if hasPhysical}
            <CardSection title="Physical" fields={resourcesPhysicalSection} />
            <CardSection title="Coal composition" fields={resourcesCoalSplitSection} />
          {:else}
            <CardSection title="Reserves & mine life" fields={resourcesReservesSection} />
          {/if}
        </div>
        <div>
          {#if hasPhysical}
            <CardSection title="Reserves & mine life" fields={resourcesReservesSection} />
          {:else}
            <CardSection title="Coal composition" fields={resourcesCoalSplitSection} />
          {/if}
        </div>
      </div>

    <!-- ── Methane ────────────────────────────────────────────────────── -->
    {:else if tab === 'Methane'}
      <div class="two-col-grid">
        <div>
          <CardSection title="Gas rating" fields={methaneGasRatingSection} />
          <CardSection title="Emissions" fields={methaneEmissionsSection} />
        </div>
        <div>
          <CardSection title="CO₂ equivalents" fields={methaneCo2eSection} />
          <CardSection title="Additional" fields={methaneMitigationSection} />
        </div>
      </div>
      {#if !methaneGasRatingSection.some(f => f.value) && !methaneEmissionsSection.some(f => f.value)}
        <p class="empty-tab">No methane data recorded for this mine.</p>
      {/if}

    <!-- ── Ownership ──────────────────────────────────────────────────── -->
    {:else if tab === 'Ownership'}
      {#if ownershipActivated}
        <div class="ownership-tree-wrap">
          <AssetOwnershipTree
            assetId={asset.location_id}
            compact={false}
            fullWidth={true}
            showViewFull={false}
            emptyMessage="No ownership data available"
            errorMessage="Failed to load ownership data"
            {ownershipLoader}
          />
        </div>
      {/if}

    <!-- ── Additional Details ─────────────────────────────────────────── -->
    {:else if tab === 'Additional Details'}
      {#if additionalFields.length > 0}
        <CardSection fields={additionalFields} />
      {:else}
        <p class="empty-tab">No additional fields with data for this mine.</p>
      {/if}
    {/if}
  {/snippet}
</CardShell>

<style>
  /* ── Compact chip ─────────────────────────────────────────────── */
  .status-chip {
    display: inline-block;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .chip-operating { background: #7f142a; color: #fff; }
  .chip-planned   { background: #ca4a50; color: #fff; }
  .chip-retired   { background: #e0e0e0; color: #444; }
  .chip-cancelled { background: #e0e0e0; color: #444; }

  /* ── Narrative ────────────────────────────────────────────────── */
  .narrative {
    font-size: 0.9rem;
    color: #222;
    margin: 0 0 1.5rem;
    line-height: 1.6;
  }

  /* ── 3-col overview grid ──────────────────────────────────────── */
  .overview-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1.5rem 2rem;
    margin-bottom: 1.75rem;
  }
  .ov-label {
    font-size: 0.78rem;
    font-weight: 600;
    color: #111;
    margin-bottom: 0.2rem;
  }
  .ov-value {
    font-size: 0.9rem;
    color: #222;
  }
  .ov-coords {
    font-size: 0.75rem;
    color: #aaa;
    margin-top: 0.15rem;
  }

  /* ── Key metrics row ─────────────────────────────────────────── */
  .mine-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border-top: 1px solid rgba(0, 0, 0, 0.08);
    border-left: 1px solid rgba(0, 0, 0, 0.08);
    margin-bottom: 0;
  }
  .metric-item {
    padding: 0.55rem 1rem;
    border-right: 1px solid rgba(0, 0, 0, 0.08);
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }
  .metric-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #888;
    margin-bottom: 0.15rem;
  }
  .metric-value {
    font-size: 0.875rem;
    color: #111;
    font-weight: 500;
  }

  /* ── Two-column layout (Resources, Methane) ───────────────────── */
  .two-col-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem 2.5rem;
  }

  /* ── Empty state ──────────────────────────────────────────────── */
  .empty-tab {
    font-size: 0.9rem;
    color: #999;
    font-style: italic;
    margin: 0;
  }

  /* ── Ownership ────────────────────────────────────────────────── */
  .ownership-tree-wrap {
    min-height: 120px;
  }

  /* ── Responsive ───────────────────────────────────────────────── */
  @media (max-width: 640px) {
    .overview-grid,
    .two-col-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
