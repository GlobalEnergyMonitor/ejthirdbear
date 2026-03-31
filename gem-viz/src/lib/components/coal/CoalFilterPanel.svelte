<script lang="ts">
  import { getContext, untrack } from 'svelte';
  import FacetedFilter from '$lib/components/table/FacetedFilter.svelte';
  import { COAL_QUERY_KEY } from '$lib/state/coal-query.svelte';
  import type { CoalQueryState } from '$lib/state/coal-query.svelte';
  import type { CoalQueryFilters } from '$lib/data-config/coal-field-schema';

  const coalQuery = getContext<CoalQueryState>(COAL_QUERY_KEY);
  const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // ── Stats loading ─────────────────────────────────────────────────────────

  type Option = { value: string; count: number };
  let statsMap = $state<Record<string, Option[]>>({});
  let loadingKeys = $state(new Set<string>());

  async function fetchFieldStats(tracker: 'coal-plant' | 'coal-mine', key: string) {
    const mapKey = `${tracker}:${key}`;
    if (statsMap[mapKey] !== undefined || loadingKeys.has(mapKey)) return;

    loadingKeys = new Set([...loadingKeys, mapKey]);
    try {
      const slug = tracker === 'coal-plant' ? 'coal-plants' : 'coal-mines';
      const res = await fetch(`${API_BASE}/catalog/metadata/${slug}/fields/${key}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.value_counts)) {
        statsMap = {
          ...statsMap,
          [mapKey]: data.value_counts.map((vc: { value: string; count: number }) => ({
            value: String(vc.value),
            count: vc.count,
          })),
        };
      }
    } catch {
      // silently ignore — options just won't populate
    } finally {
      const next = new Set(loadingKeys);
      next.delete(mapKey);
      loadingKeys = next;
    }
  }

  function getOptions(tracker: 'coal-plant' | 'coal-mine', key: string): Option[] {
    return statsMap[`${tracker}:${key}`] ?? [];
  }

  function isLoading(tracker: 'coal-plant' | 'coal-mine', key: string): boolean {
    return loadingKeys.has(`${tracker}:${key}`);
  }

  // Primary tracker for shared fields (country, status)
  const primaryTracker = $derived<'coal-plant' | 'coal-mine'>(
    coalQuery.query.trackers.includes('coal-plant') ? 'coal-plant' : 'coal-mine'
  );

  const showPlant = $derived(coalQuery.query.trackers.includes('coal-plant'));
  const showMine = $derived(coalQuery.query.trackers.includes('coal-mine'));

  $effect(() => {
    const pt = primaryTracker;
    fetchFieldStats(pt, 'country_area');
    fetchFieldStats(pt, 'status');
  });

  $effect(() => {
    if (showPlant) {
      fetchFieldStats('coal-plant', 'combustion_technology');
      fetchFieldStats('coal-plant', 'coal_type');
      fetchFieldStats('coal-plant', 'chp');
      fetchFieldStats('coal-plant', 'captive');
      fetchFieldStats('coal-plant', 'subnational_unit_province_state');
      fetchFieldStats('coal-plant', 'region');
      fetchFieldStats('coal-plant', 'subregion');
      fetchFieldStats('coal-plant', 'alternate_fuel');
    }
  });

  $effect(() => {
    if (showMine) {
      fetchFieldStats('coal-mine', 'mine_type');
      fetchFieldStats('coal-mine', 'mining_method');
      fetchFieldStats('coal-mine', 'coal_grade');
    }
  });

  // ── Local filter state ────────────────────────────────────────────────────
  // Forward effects (local → query): run when local var changes, call setFilter.
  // ONE backward effect (query → local): runs only when coalQuery.query.filters
  // changes, reads all locals via untrack so local changes don't trigger it.

  // Categorical
  let localCountry    = $state<string[]>([]);
  let localStatus     = $state<string[]>([]);
  let localTechnology = $state<string[]>([]);
  let localCoalType   = $state<string[]>([]);
  let localChp        = $state<string[]>([]);
  let localCaptive    = $state<string[]>([]);
  let localSubnational = $state<string[]>([]);
  let localRegion     = $state<string[]>([]);
  let localSubregion  = $state<string[]>([]);
  let localAltFuel    = $state<string[]>([]);
  let localMineType   = $state<string[]>([]);
  let localMiningMethod = $state<string[]>([]);
  let localCoalGrade  = $state<string[]>([]);

  // Forward effects — each runs when its local var changes
  $effect(() => { coalQuery.setFilter('country_area',                    localCountry.length     ? localCountry     : undefined); });
  $effect(() => { coalQuery.setFilter('status',                          localStatus.length      ? localStatus      : undefined); });
  $effect(() => { coalQuery.setFilter('combustion_technology',           localTechnology.length  ? localTechnology  : undefined); });
  $effect(() => { coalQuery.setFilter('coal_type',                       localCoalType.length    ? localCoalType    : undefined); });
  $effect(() => { coalQuery.setFilter('chp',                             localChp.length         ? localChp         : undefined); });
  $effect(() => { coalQuery.setFilter('captive',                         localCaptive.length     ? localCaptive     : undefined); });
  $effect(() => { coalQuery.setFilter('subnational_unit_province_state', localSubnational.length ? localSubnational : undefined); });
  $effect(() => { coalQuery.setFilter('region',                          localRegion.length      ? localRegion      : undefined); });
  $effect(() => { coalQuery.setFilter('subregion',                       localSubregion.length   ? localSubregion   : undefined); });
  $effect(() => { coalQuery.setFilter('alternate_fuel',                  localAltFuel.length     ? localAltFuel     : undefined); });
  $effect(() => { coalQuery.setFilter('mine_type',                       localMineType.length    ? localMineType    : undefined); });
  $effect(() => { coalQuery.setFilter('mining_method',                   localMiningMethod.length ? localMiningMethod : undefined); });
  $effect(() => { coalQuery.setFilter('coal_grade',                      localCoalGrade.length   ? localCoalGrade   : undefined); });

  // ── Range filters ─────────────────────────────────────────────────────────

  function applyRange(key: keyof CoalQueryFilters, min: number | null, max: number | null) {
    if (min == null && max == null) {
      coalQuery.clearFilter(key);
    } else {
      const range: { min?: number; max?: number } = {};
      if (min != null) range.min = min;
      if (max != null) range.max = max;
      coalQuery.setFilter(key, range as CoalQueryFilters[typeof key]);
    }
  }

  // Range vars (ranges are applied directly via applyRange, no forward effects needed)
  let startYearMin   = $state<number | null>(null);
  let startYearMax   = $state<number | null>(null);
  let retiredYearMin = $state<number | null>(null);
  let retiredYearMax = $state<number | null>(null);
  let plannedRetMin  = $state<number | null>(null);
  let plannedRetMax  = $state<number | null>(null);
  let metCoalMin     = $state<number | null>(null);
  let metCoalMax     = $state<number | null>(null);
  let thermalCoalMin = $state<number | null>(null);
  let thermalCoalMax = $state<number | null>(null);
  let openingYearMin = $state<number | null>(null);
  let openingYearMax = $state<number | null>(null);
  let closingYearMin = $state<number | null>(null);
  let closingYearMax = $state<number | null>(null);

  // ── Text filters ──────────────────────────────────────────────────────────

  // Text filters committed on blur/Enter, no forward effect
  let localOwner           = $state('');
  let localCoalSource      = $state('');
  let localPrimaryConsumer = $state('');

  // ── Single backward effect: query → all locals ───────────────────────────
  // Depends only on coalQuery.query.filters. Reads locals inside untrack so
  // user-driven local changes do NOT trigger this, preventing the reset loop.
  $effect(() => {
    const f = coalQuery.query.filters;
    untrack(() => {
      // helpers
      const syncArr = (ext: string[] | undefined, local: string[], set: (v: string[]) => void) => {
        const e = ext ?? [];
        if (JSON.stringify(e) !== JSON.stringify(local)) set([...e]);
      };
      const syncNum = (ext: number | undefined, local: number | null, set: (v: number | null) => void) => {
        const e = ext ?? null;
        if (e !== local) set(e);
      };

      syncArr(f.country_area,                    localCountry,     v => localCountry     = v);
      syncArr(f.status,                          localStatus,      v => localStatus      = v);
      syncArr(f.combustion_technology,           localTechnology,  v => localTechnology  = v);
      syncArr(f.coal_type,                       localCoalType,    v => localCoalType    = v);
      syncArr(f.chp,                             localChp,         v => localChp         = v);
      syncArr(f.captive,                         localCaptive,     v => localCaptive     = v);
      syncArr(f.subnational_unit_province_state, localSubnational, v => localSubnational = v);
      syncArr(f.region,                          localRegion,      v => localRegion      = v);
      syncArr(f.subregion,                       localSubregion,   v => localSubregion   = v);
      syncArr(f.alternate_fuel,                  localAltFuel,     v => localAltFuel     = v);
      syncArr(f.mine_type,                       localMineType,    v => localMineType    = v);
      syncArr(f.mining_method,                   localMiningMethod,v => localMiningMethod= v);
      syncArr(f.coal_grade,                      localCoalGrade,   v => localCoalGrade   = v);

      syncNum(f.start_year?.min,                startYearMin,   v => startYearMin   = v);
      syncNum(f.start_year?.max,                startYearMax,   v => startYearMax   = v);
      syncNum(f.retired_year?.min,              retiredYearMin, v => retiredYearMin = v);
      syncNum(f.retired_year?.max,              retiredYearMax, v => retiredYearMax = v);
      syncNum(f.planned_retirement?.min,        plannedRetMin,  v => plannedRetMin  = v);
      syncNum(f.planned_retirement?.max,        plannedRetMax,  v => plannedRetMax  = v);
      syncNum(f.percentage_of_met_coal?.min,    metCoalMin,     v => metCoalMin     = v);
      syncNum(f.percentage_of_met_coal?.max,    metCoalMax,     v => metCoalMax     = v);
      syncNum(f.percentage_of_thermal_coal?.min,thermalCoalMin, v => thermalCoalMin = v);
      syncNum(f.percentage_of_thermal_coal?.max,thermalCoalMax, v => thermalCoalMax = v);
      syncNum(f.opening_year?.min,              openingYearMin, v => openingYearMin = v);
      syncNum(f.opening_year?.max,              openingYearMax, v => openingYearMax = v);
      syncNum(f.closing_year?.min,              closingYearMin, v => closingYearMin = v);
      syncNum(f.closing_year?.max,              closingYearMax, v => closingYearMax = v);

      const e_owner = f.owner ?? '';
      if (e_owner !== localOwner) localOwner = e_owner;
      const e_coal_source = f.coal_source ?? '';
      if (e_coal_source !== localCoalSource) localCoalSource = e_coal_source;
      const e_primary = f.primary_consumer_destination ?? '';
      if (e_primary !== localPrimaryConsumer) localPrimaryConsumer = e_primary;
    });
  });

  // Text filter commit helpers (apply on blur or Enter)
  function commitText(key: keyof CoalQueryFilters, value: string) {
    if (value.trim()) {
      coalQuery.setFilter(key, value.trim() as CoalQueryFilters[typeof key]);
    } else {
      coalQuery.clearFilter(key);
    }
  }

  function onTextKeydown(
    e: KeyboardEvent & { currentTarget: HTMLInputElement },
    key: keyof CoalQueryFilters,
    getValue: () => string
  ) {
    if (e.key === 'Enter') commitText(key, getValue());
  }

  // ── Section open state ────────────────────────────────────────────────────
  let plantOpen = $state(true);
  let mineOpen = $state(true);
</script>

<div class="filter-panel">
  <div class="panel-header">
    <span class="panel-title">Filters</span>
    {#if coalQuery.isDirty}
      <button class="clear-all-btn" onclick={() => coalQuery.clearAllFilters()}>Clear all</button>
    {/if}
  </div>

  <!-- ── Common ──────────────────────────────────────────────────────────── -->

  <FacetedFilter
    label="Country / Area"
    options={getOptions(primaryTracker, 'country_area')}
    bind:selected={localCountry}
    initialVisible={5}
    searchThreshold={8}
    loading={isLoading(primaryTracker, 'country_area')}
  />

  <FacetedFilter
    label="Status"
    options={getOptions(primaryTracker, 'status')}
    bind:selected={localStatus}
    initialVisible={10}
    loading={isLoading(primaryTracker, 'status')}
  />

  <!-- ── Coal Plants ─────────────────────────────────────────────────────── -->

  {#if showPlant}
    <details class="filter-section" bind:open={plantOpen}>
      <summary class="section-heading">Coal Plants</summary>

      <FacetedFilter
        label="Technology"
        options={getOptions('coal-plant', 'combustion_technology')}
        bind:selected={localTechnology}
        initialVisible={5}
        loading={isLoading('coal-plant', 'combustion_technology')}
      />

      <FacetedFilter
        label="Coal type"
        options={getOptions('coal-plant', 'coal_type')}
        bind:selected={localCoalType}
        initialVisible={5}
        loading={isLoading('coal-plant', 'coal_type')}
      />

      <FacetedFilter
        label="CHP"
        options={getOptions('coal-plant', 'chp')}
        bind:selected={localChp}
        initialVisible={5}
        loading={isLoading('coal-plant', 'chp')}
      />

      <FacetedFilter
        label="Captive"
        options={getOptions('coal-plant', 'captive')}
        bind:selected={localCaptive}
        initialVisible={5}
        loading={isLoading('coal-plant', 'captive')}
      />

      <FacetedFilter
        label="Subnational unit"
        options={getOptions('coal-plant', 'subnational_unit_province_state')}
        bind:selected={localSubnational}
        initialVisible={5}
        searchThreshold={8}
        loading={isLoading('coal-plant', 'subnational_unit_province_state')}
      />

      <FacetedFilter
        label="Region"
        options={getOptions('coal-plant', 'region')}
        bind:selected={localRegion}
        initialVisible={5}
        loading={isLoading('coal-plant', 'region')}
      />

      <FacetedFilter
        label="Subregion"
        options={getOptions('coal-plant', 'subregion')}
        bind:selected={localSubregion}
        initialVisible={5}
        loading={isLoading('coal-plant', 'subregion')}
      />

      <FacetedFilter
        label="Alternate fuel"
        options={getOptions('coal-plant', 'alternate_fuel')}
        bind:selected={localAltFuel}
        initialVisible={5}
        loading={isLoading('coal-plant', 'alternate_fuel')}
      />

      <div class="range-group">
        <span class="range-label">Start year</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="From"
            value={startYearMin ?? ''}
            onchange={(e) => {
              startYearMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('start_year', startYearMin, startYearMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="To"
            value={startYearMax ?? ''}
            onchange={(e) => {
              startYearMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('start_year', startYearMin, startYearMax);
            }}
          />
        </div>
      </div>

      <div class="range-group">
        <span class="range-label">Retired year</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="From"
            value={retiredYearMin ?? ''}
            onchange={(e) => {
              retiredYearMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('retired_year', retiredYearMin, retiredYearMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="To"
            value={retiredYearMax ?? ''}
            onchange={(e) => {
              retiredYearMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('retired_year', retiredYearMin, retiredYearMax);
            }}
          />
        </div>
      </div>

      <div class="range-group">
        <span class="range-label">Planned retirement</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="From"
            value={plannedRetMin ?? ''}
            onchange={(e) => {
              plannedRetMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('planned_retirement', plannedRetMin, plannedRetMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="To"
            value={plannedRetMax ?? ''}
            onchange={(e) => {
              plannedRetMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('planned_retirement', plannedRetMin, plannedRetMax);
            }}
          />
        </div>
      </div>

      <div class="text-group">
        <span class="range-label">Coal source</span>
        <input
          type="text"
          class="text-input"
          placeholder="Search…"
          value={localCoalSource}
          oninput={(e) => (localCoalSource = e.currentTarget.value)}
          onblur={() => commitText('coal_source', localCoalSource)}
          onkeydown={(e) => onTextKeydown(e, 'coal_source', () => localCoalSource)}
        />
      </div>
    </details>
  {/if}

  <!-- ── Coal Mines ──────────────────────────────────────────────────────── -->

  {#if showMine}
    <details class="filter-section" bind:open={mineOpen}>
      <summary class="section-heading">Coal Mines</summary>

      <FacetedFilter
        label="Mine type"
        options={getOptions('coal-mine', 'mine_type')}
        bind:selected={localMineType}
        initialVisible={5}
        loading={isLoading('coal-mine', 'mine_type')}
      />

      <FacetedFilter
        label="Mining method"
        options={getOptions('coal-mine', 'mining_method')}
        bind:selected={localMiningMethod}
        initialVisible={5}
        loading={isLoading('coal-mine', 'mining_method')}
      />

      <FacetedFilter
        label="Coal grade"
        options={getOptions('coal-mine', 'coal_grade')}
        bind:selected={localCoalGrade}
        initialVisible={5}
        loading={isLoading('coal-mine', 'coal_grade')}
      />

      <div class="range-group">
        <span class="range-label">% Met coal</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="Min"
            min="0"
            max="100"
            value={metCoalMin ?? ''}
            onchange={(e) => {
              metCoalMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('percentage_of_met_coal', metCoalMin, metCoalMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="Max"
            min="0"
            max="100"
            value={metCoalMax ?? ''}
            onchange={(e) => {
              metCoalMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('percentage_of_met_coal', metCoalMin, metCoalMax);
            }}
          />
        </div>
      </div>

      <div class="range-group">
        <span class="range-label">% Thermal coal</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="Min"
            min="0"
            max="100"
            value={thermalCoalMin ?? ''}
            onchange={(e) => {
              thermalCoalMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('percentage_of_thermal_coal', thermalCoalMin, thermalCoalMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="Max"
            min="0"
            max="100"
            value={thermalCoalMax ?? ''}
            onchange={(e) => {
              thermalCoalMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('percentage_of_thermal_coal', thermalCoalMin, thermalCoalMax);
            }}
          />
        </div>
      </div>

      <div class="range-group">
        <span class="range-label">Opening year</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="From"
            value={openingYearMin ?? ''}
            onchange={(e) => {
              openingYearMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('opening_year', openingYearMin, openingYearMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="To"
            value={openingYearMax ?? ''}
            onchange={(e) => {
              openingYearMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('opening_year', openingYearMin, openingYearMax);
            }}
          />
        </div>
      </div>

      <div class="range-group">
        <span class="range-label">Closing year</span>
        <div class="range-inputs">
          <input
            type="number"
            class="range-input"
            placeholder="From"
            value={closingYearMin ?? ''}
            onchange={(e) => {
              closingYearMin = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('closing_year', closingYearMin, closingYearMax);
            }}
          />
          <span class="range-sep">–</span>
          <input
            type="number"
            class="range-input"
            placeholder="To"
            value={closingYearMax ?? ''}
            onchange={(e) => {
              closingYearMax = e.currentTarget.value ? Number(e.currentTarget.value) : null;
              applyRange('closing_year', closingYearMin, closingYearMax);
            }}
          />
        </div>
      </div>

      <div class="text-group">
        <span class="range-label">Primary consumer</span>
        <input
          type="text"
          class="text-input"
          placeholder="Search…"
          value={localPrimaryConsumer}
          oninput={(e) => (localPrimaryConsumer = e.currentTarget.value)}
          onblur={() => commitText('primary_consumer_destination', localPrimaryConsumer)}
          onkeydown={(e) => onTextKeydown(e, 'primary_consumer_destination', () => localPrimaryConsumer)}
        />
      </div>
    </details>
  {/if}

  <!-- ── Owner (shared text) ─────────────────────────────────────────────── -->

  <div class="text-group text-group--standalone">
    <span class="range-label">Owner</span>
    <input
      type="text"
      class="text-input"
      placeholder="Search by owner name…"
      value={localOwner}
      oninput={(e) => (localOwner = e.currentTarget.value)}
      onblur={() => commitText('owner', localOwner)}
      onkeydown={(e) => onTextKeydown(e, 'owner', () => localOwner)}
    />
  </div>
</div>

<style>
  .filter-panel {
    padding: 0.75rem 0.75rem 1.5rem;
    overflow-y: auto;
    height: 100%;
    font-size: 0.82rem;
  }

  /* ── Panel header ─────────────────────────────────────────────── */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  }

  .panel-title {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
  }

  .clear-all-btn {
    all: unset;
    cursor: pointer;
    font-size: 0.75rem;
    color: #444;
    font-weight: 500;
  }

  .clear-all-btn:hover {
    text-decoration: underline;
  }

  /* ── Collapsible sections ─────────────────────────────────────── */
  .filter-section {
    margin-top: 0.5rem;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    padding-top: 0.5rem;
  }

  .section-heading {
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #666;
    cursor: pointer;
    list-style: none;
    padding: 0.3rem 0 0.5rem;
    user-select: none;
  }

  .section-heading::-webkit-details-marker {
    display: none;
  }

  .section-heading::before {
    content: '▶';
    display: inline-block;
    font-size: 0.55rem;
    margin-right: 0.4rem;
    transition: transform 0.15s;
    color: #999;
  }

  details[open] > .section-heading::before {
    transform: rotate(90deg);
  }

  /* ── Range inputs ─────────────────────────────────────────────── */
  .range-group {
    margin-bottom: 0.75rem;
  }

  .range-label {
    display: block;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin-bottom: 0.3rem;
  }

  .range-inputs {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  .range-input {
    width: 0;
    flex: 1;
    padding: 0.25rem 0.4rem;
    font-size: 0.78rem;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 3px;
    min-width: 0;
    color: #222;
    background: #fff;
  }

  .range-input:focus {
    outline: none;
    border-color: #555;
  }

  /* Hide browser number spinners */
  .range-input::-webkit-outer-spin-button,
  .range-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .range-input[type='number'] {
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .range-sep {
    color: #aaa;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  /* ── Text inputs ──────────────────────────────────────────────── */
  .text-group {
    margin-bottom: 0.75rem;
  }

  .text-group--standalone {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }

  .text-input {
    width: 100%;
    box-sizing: border-box;
    padding: 0.25rem 0.4rem;
    font-size: 0.78rem;
    border: 1px solid rgba(0, 0, 0, 0.18);
    border-radius: 3px;
    color: #222;
    background: #fff;
  }

  .text-input:focus {
    outline: none;
    border-color: #555;
  }
</style>
