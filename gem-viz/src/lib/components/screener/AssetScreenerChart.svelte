<script lang="ts">
  /**
   * AssetScreenerChart — Svelte wrapper for the D3 ownership screener chart.
   *
   * Fetches the ownership graph for an entity, transforms it into chart data,
   * and renders the D3 visualization imperatively into a bound container.
   */

  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import {
    getTrackerColor,
    statusColors,
    statusColorsProspective,
    prospectiveStatuses,
  } from '$lib/design-tokens';
  import { fetchChartData, expandSubsidiary, buildSubsidiaryGroups } from './screener-chart-data';
  import type { LocationGroup } from './screener-chart-data';
  import { renderChart } from './screener-chart-render';
  import { cleanAssetName } from './screener-utils';
  import type { GraphNode } from '$lib/ownership-api';
  import { matchesStatusFilter, getStatusGroupId } from '$lib/data-config/tracker-schema';
  import Spinner from '$lib/components/feedback/Spinner.svelte';

  const API_BASE =
    import.meta.env?.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

  // Props
  let {
    entityId = '',
    entityName = '',
    assetClassName = '',
    trackerSlug = '',
    filteredAssetCount = null,
    filteredProjectCount = null,
    /** Optional: only show assets whose raw status is in this list */
    statusFilter = undefined,
    /** Optional: only show assets whose tracker matches one of these names */
    trackerFilter = undefined,
    /**
     * Optional fully-qualified assets URL (the screener's catalogUrl).
     * When provided, assets are fetched from this URL and used to restrict
     * the ownership graph to only assets in the selected asset class.
     */
    catalogUrl = undefined,
    /** Field keys from the selected asset class filter URL (e.g. ['asset_type', 'captive']). */
    classFieldKeys = [] as string[],
    /**
     * Optional total asset count for this entity across ALL GEM trackers (from the screener
     * owner table). When provided, used to compute "additional assets" beyond this class.
     */
    totalPortfolioAssets = null as number | null,
    onDataLoaded = undefined,
    onContainerReady = undefined,
    fillHeight = false,
  } = $props();

  // State
  let container = $state(null);
  let scrollEl = $state(null);
  let loading = $state(true);
  let error = $state(null);
  let progressMsg = $state('');
  let chartCleanup = null;
  let isEmpty = $state(false);
  let totalAssets = $state(0);
  let totalAssetsPreFilter = $state(0);
  let directSubsidiaries = $state(0);
  let trackerLegend = $state([]);
  let statusLegend = $state([]);
  let prospectiveLegend = $state(false);
  // Mirrors the colorField logic in screener-chart-render.ts:
  // use tracker coloring unless there's ≤1 tracker type AND >1 status to differentiate
  const colorByTracker = $derived(!(trackerLegend.length <= 1 && statusLegend.length > 1));

  // Subsidiary expansion state
  let expansions = $state(new Map()); // Map<subId, SubsidiaryExpansion>

  // Hover tooltip state (D3 mouseover → Svelte)
  let hoveredAsset: LocationGroup | null = $state(null);
  let tooltipPos = $state({ x: 0, y: 0 });

  // Click modal state
  let selectedAsset: LocationGroup | null = $state(null);
  let modalPos = $state({ x: 0, y: 0 });

  // Stable reference to the filtered chart data for use in toggleExpansion
  let currentChartData = null;

  let destroyed = false;

  const hasFilteredAssetCount = $derived(
    typeof filteredAssetCount === 'number' && !Number.isNaN(filteredAssetCount)
  );
  const matchedAssets = $derived(
    hasFilteredAssetCount
      ? totalAssets > 0
        ? Math.max(0, Math.min(filteredAssetCount, totalAssets))
        : filteredAssetCount
      : totalAssets
  );
  const additionalAssets = $derived(
    totalPortfolioAssets != null
      ? Math.max(0, totalPortfolioAssets - matchedAssets)
      : Math.max(0, (totalAssetsPreFilter || totalAssets) - matchedAssets)
  );

  function formatOwnershipPct(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return null;
    return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
  }

  /** Max ownership % across all units in a location (used in tooltip/modal). */
  function maxOwnershipPct(loc: LocationGroup): number {
    return Math.max(...loc.units.map((u) => u.spotlightOwnershipSharePct ?? 0));
  }

  /** Look up GraphNode for a unit ID from the cached chart data. */
  function graphNodeFor(unitId: string): GraphNode | undefined {
    return currentChartData?.graphNodeMap?.get(unitId);
  }

  /** Get project_name from a ChartUnit (field exists at runtime but isn't in the TS type). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function projectName(unit: any): string | undefined {
    return unit?.project_name;
  }

  /** Build clamped modal style string. */
  function modalStyle(x: number, y: number): string {
    const p = clampPos(x, y, 760, 520);
    return `left:${p.left}px; top:${p.top}px;`;
  }

  /** Clamp tooltip so it stays within the sticky-section container. */
  function clampPos(x: number, y: number, w = 300, h = 200) {
    const containerW = (scrollEl as HTMLElement | null)?.offsetWidth ?? 800;
    const containerH = (scrollEl as HTMLElement | null)?.offsetHeight ?? 600;
    return {
      left: Math.min(x + 10, containerW - w - 8),
      top: Math.min(y + 14, containerH - h - 8),
    };
  }

  function handleAssetHover(loc: LocationGroup, event: MouseEvent) {
    if (!loc?.units?.length) return; // guard: ignore if datum is not a valid LocationGroup
    hoveredAsset = loc;
    // Position relative to the component root (scrollEl), accounting for its scroll offset.
    // This avoids issues with position:fixed being broken by ancestor CSS transforms.
    if (scrollEl) {
      const rect = (scrollEl as HTMLElement).getBoundingClientRect();
      tooltipPos = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top + (scrollEl as HTMLElement).scrollTop,
      };
    } else {
      tooltipPos = { x: event.clientX, y: event.clientY };
    }
  }

  function handleAssetHoverOut() {
    hoveredAsset = null;
  }

  function handleAssetClick(loc: LocationGroup, event: MouseEvent) {
    if (!loc?.units?.length) return; // guard: ignore if datum is not a valid LocationGroup
    hoveredAsset = null;
    selectedAsset = loc;
    modalPos = { x: event.clientX, y: event.clientY };
    classFieldData = null;
  }

  // Fetched full location data for the selected location (for class-specific fields).
  // Map keyed by asset_id → full unit record from /locations/{id}.
  let classFieldData: Map<string, Record<string, unknown>> | null = $state(null);
  // All units at the location (not filtered by asset class) — used to populate the table.
  let locationUnits: Record<string, unknown>[] | null = $state(null);

  $effect(() => {
    const locId = selectedAsset?.locationID;
    if (!locId || !classFieldKeys.length) {
      classFieldData = null;
      locationUnits = null;
      return;
    }
    console.log('[AssetScreenerChart] class field keys:', classFieldKeys);
    fetch(`${API_BASE}/locations/${encodeURIComponent(locId)}?format=json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { units?: Record<string, unknown>[] } | null) => {
        console.log('[AssetScreenerChart] /locations/ response:', d);
        if (!d?.units) {
          classFieldData = null;
          locationUnits = null;
          return;
        }
        const map = new Map<string, Record<string, unknown>>();
        for (const u of d.units) {
          if (typeof u.asset_id === 'string') map.set(u.asset_id, u);
        }
        classFieldData = map;
        locationUnits = d.units;
      })
      .catch(() => {
        classFieldData = null;
        locationUnits = null;
      });
  });

  /** Find the tracker-specific nested fields object (key ends with _fields, e.g. iron_steel_plant_fields). */
  function getTrackerFields(unitData: Record<string, unknown>): Record<string, unknown> | null {
    for (const key of Object.keys(unitData)) {
      if (key.endsWith('_fields') && unitData[key] !== null && typeof unitData[key] === 'object') {
        return unitData[key] as Record<string, unknown>;
      }
    }
    return null;
  }

  /** Format a snake_case field key as Title Case for display. */
  function fieldLabel(key: string): string {
    return key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  }

  /** Get a class field value — checks tracker nested fields, then top-level unit data, then GraphNode. */
  function classFieldValue(key: string, unitId: string): string {
    const unitData = classFieldData?.get(unitId);
    if (unitData) {
      // Check tracker-specific nested object first (e.g. iron_steel_plant_fields)
      const trackerFields = getTrackerFields(unitData);
      if (trackerFields && key in trackerFields) {
        const v = trackerFields[key];
        if (v === null || v === undefined || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        return String(v);
      }
      // Check top-level unit data (asset_type, country, capacity, etc.)
      if (key in unitData) {
        const v = unitData[key];
        if (v === null || v === undefined || v === '') return '—';
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        return String(v);
      }
    }
    // Fall back to GraphNode
    const node = graphNodeFor(unitId);
    if (node && key in node) {
      const v = (node as unknown as Record<string, unknown>)[key];
      if (v === null || v === undefined || v === '') return '—';
      return String(v);
    }
    return '—';
  }

  const assetCallbacks = {
    onAssetHover: handleAssetHover,
    onAssetHoverOut: handleAssetHoverOut,
    onAssetClick: handleAssetClick,
  };

  function rerenderWithExpansions(exp) {
    if (!container || !currentChartData) return;
    const savedScroll = scrollEl?.scrollTop ?? 0;
    if (chartCleanup) {
      chartCleanup();
      chartCleanup = null;
    }
    const subsidiaryGroups = buildSubsidiaryGroups(currentChartData, exp);
    const containerWidth = container.clientWidth || 960;
    chartCleanup = renderChart(container, currentChartData, subsidiaryGroups, {
      width: containerWidth,
      colorField: 'tracker',
      showLegend: false,
      assetHref: (assetId) => `${base}/asset/${encodeURIComponent(assetId)}`,
      expandedSubIds: new Set(exp.keys()),
      onExpandSubsidiary: toggleExpansion,
      ...assetCallbacks,
    });
    if (scrollEl) scrollEl.scrollTop = savedScroll;
  }

  // Recursively remove scopedKey and all its descendants from the expansions map.
  // Children are stored under scopedKey::childEntityId.
  function collapseDescendants(scopedKey, map) {
    const exp = map.get(scopedKey);
    if (!exp) return;
    map.delete(scopedKey);
    for (const sg of exp.subGroups) {
      collapseDescendants(`${scopedKey}::${sg.id}`, map);
    }
  }

  // Recursively search a subGroups tree for a matching subId, returning its units
  function findSubGroupUnits(subId, subGroups) {
    for (const sg of subGroups) {
      if (sg.id === subId) return sg.locations.flatMap((loc) => loc.units);
      if (sg.expansion?.subGroups?.length) {
        const found = findSubGroupUnits(subId, sg.expansion.subGroups);
        if (found) return found;
      }
    }
    return null;
  }

  function toggleExpansion(scopedKey) {
    // scopedKey is path-scoped: "EntityId" for top-level, "ParentId::ChildId" for nested.
    // Extract the actual entity ID (last segment) for graph lookups.
    const entityId = scopedKey.split('::').pop();

    if (expansions.has(scopedKey)) {
      // Collapse — recursively remove this and all descendant expansions
      const next = new Map(expansions);
      collapseDescendants(scopedKey, next);
      expansions = next;
      rerenderWithExpansions(next);
      return;
    }

    if (!currentChartData) return;

    // Find parent units: check top-level subsidiaries first, then recursively search expansions
    let parentUnits = currentChartData.subsidiariesMatched.get(entityId) ?? null;
    if (!parentUnits?.length) {
      for (const [, exp] of expansions) {
        const found = findSubGroupUnits(entityId, exp.subGroups);
        if (found) {
          parentUnits = found;
          break;
        }
      }
    }
    if (!parentUnits?.length) return;

    const expansion = expandSubsidiary(
      entityId,
      parentUnits,
      currentChartData.graphNodeMap,
      currentChartData.graphPaths,
      currentChartData.graphEdgeMap
    );
    const next = new Map(expansions);
    next.set(scopedKey, expansion);
    expansions = next;
    rerenderWithExpansions(next);
  }

  async function loadAndRender() {
    if (!entityId || !container) return;

    try {
      loading = true;
      error = null;
      isEmpty = false;
      totalAssetsPreFilter = 0;

      // Reset expansion state when entity changes
      expansions = new Map();
      currentChartData = null;

      // Clean up previous render
      if (chartCleanup) {
        chartCleanup();
        chartCleanup = null;
      }

      // Fetch and transform data
      const chartData = await fetchChartData(entityId, catalogUrl || undefined, (msg) => {
        progressMsg = msg;
      });

      if (destroyed || !container) return;

      // Record pre-filter total for "additional assets" calculation
      totalAssetsPreFilter = chartData.assets.length;

      // Apply status filter if provided (checks both status and sub-status)
      if (statusFilter && statusFilter.length > 0) {
        const allowed = statusFilter.map((s) => s.toLowerCase());
        const matchStatus = (u) => matchesStatusFilter(u.status, u.subStatus, allowed);
        chartData.assets = chartData.assets.filter(matchStatus);
        chartData.directlyOwned = chartData.directlyOwned.filter(matchStatus);
        for (const [subId, units] of chartData.subsidiariesMatched) {
          const filtered = units.filter(matchStatus);
          if (filtered.length === 0) {
            chartData.subsidiariesMatched.delete(subId);
          } else {
            chartData.subsidiariesMatched.set(subId, filtered);
          }
        }
      }

      // Apply tracker filter if provided and no catalogUrl.
      // When catalogUrl is set, the catalog already returns all units for matching projects
      // (including units with different tracker types at the same location); re-filtering by
      // tracker here would strip those out, which is not what we want.
      // Normalize both sides: strip all non-alphanumeric chars so slugs ('oil-gas-plant'),
      // display names ('Oil & Gas Plant'), and abbreviated names ('Gas Plant') all reduce
      // to the same canonical form for comparison.
      if (!catalogUrl && trackerFilter && trackerFilter.length > 0) {
        const normTracker = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const allowed = new Set(trackerFilter.map(normTracker));
        const matchTracker = (u) => allowed.has(normTracker(u.tracker));
        chartData.assets = chartData.assets.filter(matchTracker);
        chartData.directlyOwned = chartData.directlyOwned.filter(matchTracker);
        for (const [subId, units] of chartData.subsidiariesMatched) {
          const filtered = units.filter(matchTracker);
          if (filtered.length === 0) {
            chartData.subsidiariesMatched.delete(subId);
          } else {
            chartData.subsidiariesMatched.set(subId, filtered);
          }
        }
      }

      if (chartData.assets.length === 0) {
        isEmpty = true;
        loading = false;
        return;
      }

      // Store filtered chart data for expansion fetches
      currentChartData = chartData;

      // Build subsidiary group layout (no expansions yet on initial load)
      const subsidiaryGroups = buildSubsidiaryGroups(chartData, new Map());
      totalAssets = chartData.assets.length;
      directSubsidiaries = chartData.subsidiariesMatched.size;

      const trackers = Array.from(
        new Set(chartData.assets.map((a) => a.tracker).filter((t) => t && t !== 'Unknown'))
      );
      trackerLegend = trackers.map((label) => ({
        label,
        color: getTrackerColor(label),
      }));

      const rawStatuses = chartData.assets
        .map((a) => String(a.status || '').toLowerCase())
        .filter(Boolean);
      const allPlanned =
        rawStatuses.length > 0 && rawStatuses.every((s) => prospectiveStatuses.includes(s));
      prospectiveLegend = allPlanned;

      if (allPlanned) {
        const items = [];
        for (const [color, { descript, statuses }] of statusColorsProspective) {
          if (statuses.some((s) => rawStatuses.includes(s))) {
            items.push({ label: descript, color, kind: 'planned-detail' });
          }
        }
        // If no granular match (e.g. API returned aggregate 'planned'), fall through to normal legend
        if (items.length > 0) {
          statusLegend = items;
        } else {
          prospectiveLegend = false;
        }
      }
      if (!prospectiveLegend) {
        const order = ['operating', 'planned', 'retired', 'cancelled', 'unknown'];
        const aggregated = Array.from(
          new Set(chartData.assets.map((a) => a.status_agg).filter(Boolean))
        ).sort((a, b) => order.indexOf(a) - order.indexOf(b));
        statusLegend = aggregated.map((kind) => ({
          label: kind,
          color: statusColors[kind] || statusColors.unknown,
          kind,
        }));
      }

      // Measure container width
      const containerWidth = container.clientWidth || 960;
      container.dataset.trackerSlug = trackerSlug || '';

      // Render D3 chart
      chartCleanup = renderChart(container, chartData, subsidiaryGroups, {
        width: containerWidth,
        colorField: 'tracker',
        showLegend: false,
        assetHref: (assetId) => `${base}/asset/${encodeURIComponent(assetId)}`,
        expandedSubIds: new Set(expansions.keys()),
        onExpandSubsidiary: toggleExpansion,
        ...assetCallbacks,
      });

      loading = false;

      // Notify parent with loaded data (status-filtered asset IDs)
      const filteredAssetIds = new Set(chartData.assets.map((a) => a.id));
      onDataLoaded?.({
        entityId,
        assets: Array.from(chartData.assetDetails.values()).filter((a) =>
          filteredAssetIds.has(a.id)
        ),
        chartData,
      });
      onContainerReady?.(container);
    } catch (err) {
      if (import.meta.env.DEV) console.error('[AssetScreenerChart] Error:', err);
      error = err?.message || 'Failed to load ownership chart';
      loading = false;
    }
  }

  onMount(() => {
    loadAndRender();

    return () => {
      destroyed = true;
      if (chartCleanup) {
        chartCleanup();
        chartCleanup = null;
      }
    };
  });

  // Reload when entityId changes
  $effect(() => {
    if (entityId && container) {
      loadAndRender();
    }
  });
</script>

<section class="sticky-section" class:fill-height={fillHeight} bind:this={scrollEl}>
  <div id="chart-header">
    <div class="name-wrapper">
      <p class="subtitle">Owner</p>
      <h3>{entityName || entityId}</h3>
    </div>
    <div>
      <p class="subtitle">Details</p>
      <p class="company-details">
        {#if filteredProjectCount != null}
          {filteredProjectCount} matched {filteredProjectCount === 1 ? 'asset' : 'assets'} ({assetClassName})
          {#if filteredProjectCount < matchedAssets}
            with {matchedAssets} {matchedAssets === 1 ? 'unit' : 'units'}
          {/if}
        {:else}
          {matchedAssets} matched {matchedAssets === 1 ? 'unit' : 'units'} ({assetClassName})
        {/if}
        {#if loading}
          <span class="loading-hint">loading…</span>
        {:else}
          via {directSubsidiaries} direct {directSubsidiaries === 1 ? 'subsidiary' : 'subsidiaries'}
        {/if}
      </p>
    </div>
  </div>

  {#if loading}
    <div class="chart-state">
      <Spinner size={20} />
      <p class="progress-msg">{progressMsg || 'Loading ownership data...'}</p>
    </div>
  {:else if error}
    <div class="chart-state chart-state--error">
      <p>{error}</p>
    </div>
  {:else if isEmpty}
    <div class="chart-state">
      <p>No assets found in ownership network for {entityName || entityId}</p>
    </div>
  {/if}

  <div class="chart-wrapper" class:hidden={loading || !!error || isEmpty}>
    <div bind:this={container} class="chart-render"></div>
  </div>

  <!-- Hover tooltip — project name + ownership % -->
  {#if hoveredAsset?.units?.length}
    {@const tt = clampPos(tooltipPos.x, tooltipPos.y, 260, 60)}
    {@const pct = maxOwnershipPct(hoveredAsset)}
    {@const u0 = hoveredAsset.units[0]}
    <div class="asset-tooltip" style="left:{tt.left}px; top:{tt.top}px;">
      <div class="tt-name">{cleanAssetName(u0.name, projectName(u0))}</div>
      {#if pct > 1 && pct < 100}
        <div class="tt-eff">{pct % 1 === 0 ? pct : pct.toFixed(1)}% ownership</div>
      {/if}
    </div>
  {/if}

  <!-- Click modal — unit-level table -->
  {#if selectedAsset?.units?.length}
    {@const u0 = selectedAsset.units[0]}
    {@const node0 = graphNodeFor(u0.id)}
    {@const pct = maxOwnershipPct(selectedAsset)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="modal-backdrop"
      onclick={() => (selectedAsset = null)}
      onkeydown={(e) => e.key === 'Escape' && (selectedAsset = null)}
    >
      <div
        class="asset-modal"
        role="dialog"
        tabindex="-1"
        style={modalStyle(modalPos.x, modalPos.y)}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.key === 'Escape' && (selectedAsset = null)}
      >
        <button class="modal-close" onclick={() => (selectedAsset = null)}>&times;</button>
        <div class="modal-header">
          <h4>{cleanAssetName(u0.name, projectName(u0))}</h4>
          {#if selectedAsset.units.length > 1}
            <span class="unit-badge">{selectedAsset.units.length} units</span>
          {/if}
        </div>
        <div class="tt-meta">
          {node0?.asset_type || u0.tracker || ''}{#if node0?.country}
            · {node0.country}{/if}
        </div>
        {#if pct > 1 && pct < 100}
          <div class="tt-eff" style="margin-bottom:6px">
            {pct % 1 === 0 ? pct : pct.toFixed(1)}% ownership
          </div>
        {/if}
        <table class="tt-table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Status</th>
              <th class="num">Capacity</th>
              {#each classFieldKeys as key}
                <th>{fieldLabel(key)}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#if locationUnits}
              {#each locationUnits as locUnit}
                {@const assetId = String(locUnit.asset_id ?? '')}
                {@const statusAgg = getStatusGroupId(String(locUnit.operating_status ?? ''))}
                <tr>
                  <td class="unit-name">{locUnit.asset_name ?? '—'}</td>
                  <td>
                    <span class="status-dot" style="background:{statusColors[statusAgg] || '#999'}"
                    ></span>{locUnit.operating_status ?? '—'}
                  </td>
                  <td class="num">
                    {locUnit.capacity_value != null
                      ? `${Number(locUnit.capacity_value).toLocaleString()} ${locUnit.capacity_unit ?? 'MW'}`
                      : '—'}
                  </td>
                  {#each classFieldKeys as key}
                    <td>{classFieldValue(key, assetId)}</td>
                  {/each}
                </tr>
              {/each}
            {:else}
              {#each selectedAsset.units as unit}
                {@const node = graphNodeFor(unit.id)}
                <tr>
                  <td class="unit-name">{unit.name}</td>
                  <td>
                    <span
                      class="status-dot"
                      style="background:{statusColors[unit.status_agg] || '#999'}"
                    ></span>{unit.status || '—'}
                  </td>
                  <td class="num">
                    {node?.capacity_value
                      ? `${node.capacity_value.toLocaleString()} ${node.capacity_unit || 'MW'}`
                      : '—'}
                  </td>
                  {#each classFieldKeys as key}
                    <td>{classFieldValue(key, unit.id)}</td>
                  {/each}
                </tr>
              {/each}
            {/if}
          </tbody>
        </table>
        <a
          class="asset-link"
          href="{base}/asset/{encodeURIComponent(u0.id)}"
          target="_blank"
          rel="noopener">View full asset page &rarr;</a
        >
      </div>
    </div>
  {/if}

  <div id="additional-info" class:hidden={loading || !!error || isEmpty || additionalAssets === 0}>
    <p>
      <span>
        {entityName || entityId} has stakes in
        <strong>{additionalAssets.toLocaleString()}</strong> additional assets identified in the Global
        Energy Ownership Trackers
      </span>
    </p>
  </div>

  <div id="legend-container" class:hidden={loading || !!error || isEmpty}>
    <div
      id="legend-container-status"
      class="legend-container"
      class:tracker-colored={colorByTracker}
    >
      <p class="title">Asset Status <span>(top-right icons)</span></p>
      <div id="legend-status" class="legend" class:single={trackerLegend.length === 0}>
        {#each statusLegend as item}
          <div class="legend-item">
            <span class="legend-dot-wrap">
              <span
                class="legend-bubble"
                style={colorByTracker ? '' : `background-color:${item.color};`}
              ></span>
              {#if !prospectiveLegend}
                {#if item.kind === 'planned'}
                  <span class="legend-mark proposed"></span>
                {:else if item.kind === 'retired'}
                  <span class="legend-mark cross retired">✕</span>
                {:else if item.kind === 'cancelled'}
                  <span class="legend-mark cross cancelled">✕</span>
                {/if}
              {/if}
            </span>
            <span class="legend-label">{item.label}</span>
          </div>
        {/each}
      </div>
    </div>

    {#if trackerLegend.length > 0}
      <div id="legend-container-type" class="legend-container">
        <p class="title">Asset Types</p>
        <div id="legend-type" class="legend">
          {#each trackerLegend as item}
            <div class="legend-item">
              {#if colorByTracker}
                <span class="legend-bubble" style="background-color:{item.color};"></span>
              {/if}
              <span class="legend-label">{item.label}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .sticky-section {
    position: relative;
    width: 100%;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    max-height: 760px;
    overflow: auto;
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-xl);
    background: var(--color-gray-50, #fafaf7);
  }

  .sticky-section.fill-height {
    max-height: none;
    height: 100%;
    border: none;
    border-radius: 0;
  }

  #chart-header {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: flex-start;
    gap: 2em;
    padding: 0.5em 1.4em;
    border-bottom: 3px solid var(--color-border);
    background: var(--gem-primary-blue);
    color: var(--gem-white);
  }

  .name-wrapper {
    min-width: 250px;
  }

  .subtitle {
    font-size: 0.7em;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    color: var(--gem-mint);
    margin: 0 0 0.5em 0;
  }

  h3 {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--gem-white);
  }

  .company-details {
    font-size: 0.9em;
    margin: 0;
  }

  .loading-hint {
    opacity: 0.6;
    font-style: italic;
    font-size: 0.85em;
  }

  .chart-wrapper {
    overflow: visible;
    background: var(--color-gray-50, #fafaf7);
  }

  .chart-render {
    width: 100%;
    overflow-x: auto;
    overflow-y: visible;
  }

  .chart-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    text-align: center;
    color: var(--color-text-tertiary);
    font-size: 13px;
  }

  .chart-state p {
    margin: 0;
  }

  .chart-state--error {
    color: var(--color-error);
  }

  .progress-msg {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  #additional-info p {
    max-width: 100%;
    text-align: center;
    font-style: italic;
    color: var(--gem-primary-blue);
    font-weight: 500;
    font-size: 0.95em;
    margin: 0.6em auto 0.8em auto;
  }

  #additional-info span {
    display: inline-block;
    padding: 0.8em;
    border-top: 2px solid var(--gem-orange, #d45f42);
  }

  #legend-container {
    position: sticky;
    bottom: 0;
    z-index: 20;
    padding: 0.6em 1.2em 1em 1.2em;
    border-top: 3px solid var(--gem-primary-blue);
    background: var(--color-gray-50, #fafaf7);
    color: var(--color-text-primary, #002c40);
    backdrop-filter: blur(4px);
  }

  .legend-container .title {
    width: 100%;
    text-align: center;
    font-size: 0.7em;
    text-transform: uppercase;
    font-weight: 700;
    letter-spacing: 0.07em;
    margin: 0.2em 0 0.5em 0;
    color: var(--gem-primary-blue);
  }

  .legend-container .title span {
    text-transform: lowercase;
    font-weight: 500;
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 1.2em;
    align-items: flex-start;
    justify-content: center;
    font-size: 0.9em;
  }

  #legend-status {
    border-bottom: 2px solid var(--color-border);
    width: fit-content;
    margin: 0 auto 1em auto;
    padding: 0.5em 3em;
  }

  #legend-status.single {
    border-bottom: none;
    margin: 0 auto;
    padding: 0;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.45em;
  }

  .legend-dot-wrap {
    position: relative;
    width: 14px;
    height: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .chart-render :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .legend-bubble {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    display: inline-block;
  }

  .legend-mark.proposed {
    position: absolute;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    top: -1px;
    right: -1px;
    background: #f9d14f;
  }

  .legend-mark.cross {
    position: absolute;
    top: -4px;
    right: -4px;
    font-size: 8px;
    line-height: 1;
    font-weight: 700;
  }

  .legend-mark.cross.retired {
    color: #6e8c91;
  }

  .legend-mark.cross.cancelled {
    color: #dce3e5;
  }

  .legend-label {
    text-transform: capitalize;
  }

  /* When assets are colored by tracker type, show status legend circles as grey outlines.
     Shrink by 1.5px (stroke is centered on the path, so 0.75px bleeds inward on each side). */
  .tracker-colored .legend-bubble {
    background-color: transparent;
    border: 1.5px solid #9ca3af;
    width: 11.5px;
    height: 11.5px;
  }

  .tracker-colored .legend-mark.proposed {
    background: #9ca3af;
  }

  .tracker-colored .legend-mark.cross.retired,
  .tracker-colored .legend-mark.cross.cancelled {
    color: #9ca3af;
  }

  /* ---- Hover tooltip ---- */
  .asset-tooltip {
    position: absolute;
    z-index: 1000;
    pointer-events: none;
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 6px 10px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    animation: tt-in 80ms ease-out;
  }
  .tt-name {
    font-size: 11px;
    font-weight: 700;
    color: var(--gem-navy, #002c40);
    line-height: 1.2;
  }
  .tt-meta {
    font-size: 10px;
    color: #999;
    margin-top: 1px;
  }
  .tt-eff {
    font-size: 10px;
    font-weight: 700;
    color: var(--gem-teal, #007b7f);
    margin-top: 1px;
  }
  @keyframes tt-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* ---- Click modal ---- */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.12);
  }
  .asset-modal {
    position: fixed;
    z-index: 10001;
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
    padding: 14px 16px;
    min-width: 320px;
    max-width: min(760px, 90vw);
    max-height: 520px;
    overflow: auto;
    scrollbar-width: thin;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }
  .modal-close {
    position: absolute;
    top: 6px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: #999;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .modal-close:hover {
    color: #333;
  }
  .modal-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
    padding-right: 20px;
  }
  .modal-header h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--gem-navy, #002c40);
    line-height: 1.3;
  }
  .unit-badge {
    font-size: 10px;
    background: #eee;
    color: #666;
    padding: 1px 6px;
    border-radius: 999px;
    font-weight: 500;
    flex-shrink: 0;
  }
  .tt-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    border-top: 1px solid #eee;
    margin-top: 6px;
  }
  .tt-table th {
    text-align: left;
    font-weight: 600;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #aaa;
    padding: 4px 6px 3px 0;
  }
  .tt-table th.num {
    text-align: right;
  }
  .tt-table td {
    padding: 3px 12px 3px 0;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 180px;
    border-bottom: 1px solid #f5f5f5;
  }
  .tt-table td.num {
    text-align: right;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10px;
  }
  .tt-table td.unit-name {
    max-width: 140px;
    font-weight: 500;
  }
  .status-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    margin-right: 3px;
    vertical-align: middle;
    flex-shrink: 0;
  }
  .asset-link {
    display: inline-block;
    margin-top: 8px;
    font-size: 11px;
    color: var(--gem-teal, #007b7f);
    text-decoration: none;
    font-weight: 500;
  }
  .asset-link:hover {
    text-decoration: underline;
  }
</style>
