<script>
  /**
   * KITCHEN SINK - Complete Component Library
   * Live examples of all UI components with file paths and real data.
   * 69 components across 15 directories — this page demos ~30 live,
   * lists the rest organized by category.
   */

  import { onMount } from 'svelte';

  // Core UI
  import Skeleton from '$lib/components/feedback/Skeleton.svelte';
  import Spinner from '$lib/components/feedback/Spinner.svelte';
  import StatusIcon from '$lib/components/tracker/StatusIcon.svelte';
  import TrackerIcon from '$lib/components/tracker/TrackerIcon.svelte';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';
  import LoadingWrapper from '$lib/components/feedback/LoadingWrapper.svelte';
  import ReportLoadingTerminal from '$lib/components/feedback/ReportLoadingTerminal.svelte';
  import Citation from '$lib/components/data/Citation.svelte';

  // Layout
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SectionHeader from '$lib/components/nav/SectionHeader.svelte';

  // Cards
  import EntityMicroCard from '$lib/components/cards/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/cards/AssetMicroCard.svelte';
  import ProjectCard from '$lib/components/cards/ProjectCard.svelte';
  import CoalPlantCard from '$lib/components/cards/CoalPlantCard.svelte';

  // Charts
  import Sparkline from '$lib/components/charts/Sparkline.svelte';
  import MiniBarChart from '$lib/components/charts/MiniBarChart.svelte';
  import MiniHistogram from '$lib/components/charts/MiniHistogram.svelte';
  import OwnershipPie from '$lib/components/charts/OwnershipPie.svelte';
  // Ownership & network viz
  import OwnershipTreeGraph from '$lib/components/ownership/OwnershipTreeGraph.svelte';
  import AssetRingVisualization from '$lib/components/ownership/AssetRingVisualization.svelte';

  // Tables & data
  import DataTable from '$lib/components/table/DataTable.svelte';
  import ApiCallLog from '$lib/components/data/ApiCallLog.svelte';

  // Inputs & search
  import AssetSearchBar from '$lib/components/search/AssetSearchBar.svelte';
  import CountryMultiSelect from '$lib/components/screener/CountryMultiSelect.svelte';

  // Navigation & Filters
  import ScreenerStepNav from '$lib/components/nav/ScreenerStepNav.svelte';
  import FilterBreadcrumbs from '$lib/components/table/FilterBreadcrumbs.svelte';
  import RangeSlider from '$lib/components/table/RangeSlider.svelte';
  import AssetClassesPanel from '$lib/components/tracker/AssetClassesPanel.svelte';

  // Data
  import {
    trackers,
    statuses,
    realCompanies,
    realAssets,
    countryData,
    capacityTimeSeries,
    capacityDistribution,
    sampleFilters,
    sampleClassesParam,
    rangeHistogram,
    treeGraphSmall,
    treeGraphDeep,
    treeGraphLarge,
    sampleProjectAssets,
    sampleRingAssets,
    tableColumns,
    tableData,
    sampleReportSteps,
    sampleCountries,
    componentIndex,
  } from './kitchen-sink-data';

  // Featured assets from Observable notebook — for ownership tree parity testing
  import { getOwnershipGraph, fetchCoalPlantLocation } from '$lib/ownership-api';
  const featuredAssets = new Map([
    ['sinesPowerStation', 'G100000109409'],
    ['BaghlanPowerStation', 'G100001057899'],
    ['CAPAceroHuachipatoSteelPlant', 'P100000120066'],
    ['PKNCoalMines', 'M4499'],
    ['MaranhãoSãoLuísCoalPlant', 'G100000106660'],
    ['NanshanAluminumDonghaiCoalPlant', 'G100000107258'],
    ['Bayernoil Refinery', 'G100000400116'],
    ['Cebu Energy', 'G100000110218'],
  ]);
  let selectedFeaturedAsset = $state('sinesPowerStation');
  let featuredGraphData = $state(null);
  let featuredLoading = $state(false);
  let featuredError = $state('');

  async function loadFeaturedAsset(name) {
    const assetId = featuredAssets.get(name);
    if (!assetId) return;
    featuredLoading = true;
    featuredError = '';
    try {
      const result = await getOwnershipGraph({ root: assetId, direction: 'up', max_depth: 12 });
      featuredGraphData = result;
    } catch (e) {
      featuredError = e.message || 'Failed to load';
      featuredGraphData = null;
    } finally {
      featuredLoading = false;
    }
  }

  // Load the first featured asset on mount
  $effect(() => {
    if (selectedFeaturedAsset) {
      loadFeaturedAsset(selectedFeaturedAsset);
    }
  });

  // CoalPlantCard test harness
  const COAL_PRESETS = [
    { label: 'Boundary Dam', id: 'L100000100176' },
    { label: 'Eraring', id: 'L100000100005' },
    { label: 'Yancheng Binhai', id: 'L100000100973' },
    { label: 'Maritsa 3', id: 'L100000100136' },
    { label: 'Gubin Power Project', id: 'L100000103227' },
    { label: 'Liuzhi', id: 'L100000100463' },
    { label: 'Worsley Refinery', id: 'L100000100043' },
    { label: 'Zhunger Weijiamao', id: 'L100000100896' },
    { label: 'Huaiyin', id: 'L100000100991' },
    { label: 'Zhenxiong', id: 'L100000101719' },
    { label: 'Rovinari', id: 'L100000103294' },
    { label: 'Nabinagar Thermal', id: 'L100000102114' },
    { label: 'Shanying Cogen', id: 'L100000101755' },
    { label: 'Lixin Banji', id: 'L100000100233' },
    { label: 'Gansu Huating', id: 'L100000100340' },
  ];
  let coalSelectedPreset = $state('L100000100176');
  let coalCustomId = $state('');
  let coalUseCustom = $state(false);
  let coalLocationId = $derived(coalUseCustom ? coalCustomId : coalSelectedPreset);
  let coalLocation = $state(null);
  let coalLoading = $state(false);
  let coalError = $state('');

  async function loadCoalPlant() {
    if (!coalLocationId.trim()) return;
    coalLoading = true;
    coalError = '';
    coalLocation = null;
    try {
      coalLocation = await fetchCoalPlantLocation(coalLocationId.trim());
    } catch (e) {
      coalError = e.message || 'Failed to load';
    } finally {
      coalLoading = false;
    }
  }

  // Deep-link: scroll to hash on mount + update hash on scroll
  let activeSection = $state('');

  onMount(() => {
    // Add copy buttons to all code-hint blocks
    document.querySelectorAll('pre.code-hint').forEach((pre) => {
      if (!(pre instanceof HTMLElement)) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'copy';
      btn.addEventListener('click', async () => {
        await navigator.clipboard.writeText(pre.textContent || '');
        btn.textContent = '✓ copied';
        setTimeout(() => (btn.textContent = 'copy'), 1500);
      });
      pre.style.position = 'relative';
      btn.style.cssText =
        'position:absolute;top:6px;right:6px;font-size:11px;padding:2px 6px;border:1px solid #ccc;border-radius:3px;background:#f0f0f0;cursor:pointer;font-family:monospace;color:#555;';
      pre.appendChild(btn);
    });

    // Scroll to hash fragment on page load
    const hash = window.location.hash?.slice(1);
    if (hash) {
      // Wait for DOM to settle, then scroll
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'instant' });
          activeSection = hash;
        }
      });
    }

    // Track which section is visible and update URL hash
    const sections = document.querySelectorAll('section[id]');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            activeSection = id;
            // Update URL hash without triggering scroll
            history.replaceState(null, '', `#${id}`);
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  });

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      activeSection = id;
      history.replaceState(null, '', `#${id}`);
    }
  }

  // Toggle states for interactive demos
  let showLoading = $state(false);
  let showError = $state(false);
  let showEmpty = $state(false);
  let rangeMin = $state(null);
  let rangeMax = $state(null);
  let selectedCountries = $state([]);
  let searchValue = $state('');

  // Derived stats
  const liveComponentCount = 30;
  const totalComponentCount = componentIndex.length;
  const _registryCategories = [...new Set(componentIndex.map((c) => c.category))];

  // Registry search/filter
  let registrySearch = $state('');
  const filteredComponentIndex = $derived(
    registrySearch.trim()
      ? componentIndex.filter(
          (c) =>
            c.name.toLowerCase().includes(registrySearch.toLowerCase()) ||
            c.category.toLowerCase().includes(registrySearch.toLowerCase())
        )
      : componentIndex
  );
  const filteredCategories = $derived([...new Set(filteredComponentIndex.map((c) => c.category))]);

  // Components that need API/complex context — not demoed live
  const complexComponents = [
    {
      name: 'OwnershipFlower',
      path: 'src/lib/components/network/OwnershipFlower.svelte',
      what: 'Nadieh Bremer–style radial flower where petal angle encodes tracker mix (by asset count) and petal length encodes total capacity.',
      api: 'Calls fetchOwnerPortfolio(ownerId) → /ownership/graph?root=…&direction=down. Pass pre-fetched portfolio via portfolio prop to skip the fetch.',
      usage: `<OwnershipFlower ownerId="E100001000348" size="medium" showLabels />`,
    },
    {
      name: 'MiniNetworkGraph',
      path: 'src/lib/components/network/MiniNetworkGraph.svelte',
      what: 'Interactive 3-D force-directed network (deck.gl + d3-force-3d) showing the ownership neighborhood around a single entity — nodes are entities/assets, edges are ownership links.',
      api: 'Calls getOwnershipGraph({ root: entityId, direction: "both", max_depth: maxHops }) from ownership-api.ts.',
      usage: `<MiniNetworkGraph entityId="E100001000348" maxHops={2} height={300} />`,
    },
    {
      name: 'UltimateOwners',
      path: 'src/lib/components/tracker/UltimateOwners.svelte',
      what: 'Traces ownership chains upward to find terminal ancestor entities and shows effective ownership percentages (multiplied through intermediate holdings).',
      api: 'Calls getEntityGraphUp(entityId) → /ownership/graph?root=…&direction=up.',
      usage: `<UltimateOwners entityId="E100001000348" />`,
    },
    {
      name: 'FacetedFilter',
      path: 'src/lib/components/table/FacetedFilter.svelte',
      what: 'Shopping-style checkbox facet list: selected items float to top with FLIP animation, live-updating counts, search-within-facet, and Shift+click for AND logic.',
      api: 'Pure UI — no API calls. Caller provides options array with { value, count? }. Bind selected and selectedAnd for two-way state.',
      usage: `<FacetedFilter label="Status" options={[{value:'operating',count:847}]} bind:selected={statusFilter} />`,
    },
    {
      name: 'CommandPalette',
      path: 'src/lib/components/search/CommandPalette.svelte',
      what: 'Cmd+K universal search and command interface (Linear/VS Code–style) — searches assets and entities, runs page navigation commands, and shows recent searches.',
      api: 'Calls listAssets() and listEntities() from ownership-api.ts on query. Opened/closed via commandPaletteOpen Svelte store.',
      usage: `<CommandPalette /> <!-- mounted once in layout; toggle via commandPaletteOpen.set(true) -->`,
    },
    {
      name: 'ProjectCardList',
      path: 'src/lib/components/cards/ProjectCardList.svelte',
      what: 'Paginated grid of ProjectCards with optional map view and capacity-percentile bars for context within a tracker dataset.',
      api: 'Calls fetchAssets({ tracker, statusFilter, sortBy, limit }) and fetchCapacities(tracker) from $lib/factsheet.',
      usage: `<ProjectCardList tracker="Coal Plant" statusFilter={['operating']} sortBy="capacity" limit={5} />`,
    },
    {
      name: 'AssetMap / EntityMap',
      path: 'src/lib/components/map/',
      what: 'MapLibre GL–based maps rendering asset points or entity footprints on a Natural Earth base layer with hover tooltips and click-to-navigate.',
      api: 'Needs asset coordinate data (latitude/longitude from REST API or points.geojson). Tile config from $lib/map-config.',
      usage: `<AssetMap assets={assetArray} zoom={2} center={[0, 20]} />`,
    },
    {
      name: 'TrackerGlobeGrid',
      path: 'src/lib/components/tracker/TrackerGlobeGrid.svelte',
      what: 'Hero visualization with a center globe plus 6 surrounding satellite globes, each filtered to one tracker type, spinning in sync via MapLibre.',
      api: 'Fetches static/points.geojson (~9 MB) and renders point layers filtered by asset_type field.',
      usage: `<TrackerGlobeGrid /> <!-- self-contained, no props needed -->`,
    },
    {
      name: 'TrackerFactsheet',
      path: 'src/lib/components/tracker/TrackerFactsheet.svelte',
      what: 'Dataset field-metadata previewer — shows field categories, definitions, and inline distribution charts (bar charts for enums, histograms for numerics).',
      api: 'Receives fieldsMetadata array and a fetchDistribution(field) callback; caller supplies both from tracker-specific API calls.',
      usage: `<TrackerFactsheet tracker="Coal Plant" fieldsMetadata={fields} fetchDistribution={fetchFn} />`,
    },
  ];
</script>

<svelte:head>
  <title>Kitchen Sink — GEM Viz Component Library</title>
  <meta name="description" content="Complete component library with live examples" />
</svelte:head>

<div class="page">
  <header class="page-header">
    <p class="label">Component Library</p>
    <h1>Kitchen Sink</h1>
    <p class="subtitle">
      {totalComponentCount} components across 15 directories.
      {liveComponentCount} demoed live below, {complexComponents.length} need API context. All examples
      use realistic data from Global Energy Monitor trackers.
    </p>
  </header>

  <!-- Table of Contents -->
  <nav class="toc">
    <span class="toc-label">Jump to:</span>
    {#each [['primitives', 'Primitives'], ['badges', 'Badges'], ['layout', 'Layout'], ['cards', 'Cards'], ['charts', 'Charts'], ['ownership-tree', 'Ownership Tree'], ['tables', 'Tables'], ['inputs', 'Inputs'], ['navigation', 'Navigation'], ['states', 'Loading States'], ['buttons', 'Buttons'], ['typography', 'Typography'], ['colors', 'Colors'], ['debug', 'Debug'], ['complex', 'Complex'], ['coal-plant-card', 'Coal Plant Card'], ['registry', 'Full Registry']] as [id, label]}
      <a
        href="#{id}"
        class:active={activeSection === id}
        onclick={(e) => {
          e.preventDefault();
          scrollToSection(id);
        }}>{label}</a
      >
    {/each}
  </nav>

  <!-- ========================================
       TYPOGRAPHY REFERENCE
       ======================================== -->
  <section id="typography">
    <h2><a href="#typography" class="section-anchor">#</a>Typography Reference</h2>
    <div class="component-group">
      <div class="type-samples">
        <div class="type-row">
          <span class="type-label">--font-size-xs</span>
          <span style="font-size: var(--font-size-xs);">10px - Smallest labels, badges</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-sm</span>
          <span style="font-size: var(--font-size-sm);">11px - Secondary text, captions</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-base</span>
          <span style="font-size: var(--font-size-base);">12px - Form labels</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-body</span>
          <span style="font-size: var(--font-size-body);">13px - Body text, paragraphs</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-md</span>
          <span style="font-size: var(--font-size-md);">14px - Emphasis</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-lg</span>
          <span style="font-size: var(--font-size-lg);">15px - Large text</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-xl</span>
          <span style="font-size: var(--font-size-xl);">18px - Section headings</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-2xl</span>
          <span style="font-size: var(--font-size-2xl);">24px - Page titles</span>
        </div>
        <div class="type-row">
          <span class="type-label">--font-size-3xl</span>
          <span style="font-size: var(--font-size-3xl);">32px - Hero headings</span>
        </div>
      </div>
    </div>
  </section>

  <!-- ========================================
       COLOR REFERENCE
       ======================================== -->
  <section id="colors">
    <h2><a href="#colors" class="section-anchor">#</a>Color Reference</h2>
    <div class="component-group">
      <h3>Text Colors</h3>
      <div class="color-swatches">
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-text-primary);"></div>
          <span>--color-text-primary</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-text-secondary);"></div>
          <span>--color-text-secondary</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-text-tertiary);"></div>
          <span>--color-text-tertiary</span>
        </div>
      </div>

      <h3>GEM Brand</h3>
      <div class="color-swatches">
        <div class="swatch">
          <div class="swatch-box" style="background: var(--gem-primary-blue);"></div>
          <span>--gem-primary-blue</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--gem-teal);"></div>
          <span>--gem-teal</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--gem-navy);"></div>
          <span>--gem-navy</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--gem-orange);"></div>
          <span>--gem-orange</span>
        </div>
      </div>

      <h3>Semantic</h3>
      <div class="color-swatches">
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-accent);"></div>
          <span>--color-accent</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-error);"></div>
          <span>--color-error</span>
        </div>
        <div class="swatch">
          <div class="swatch-box" style="background: var(--color-border);"></div>
          <span>--color-border</span>
        </div>
      </div>

      <h3>Gray Scale</h3>
      <div class="color-swatches grays">
        {#each [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as shade}
          <div class="swatch">
            <div class="swatch-box" style="background: var(--color-gray-{shade});"></div>
            <span>{shade}</span>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- ========================================
       PRIMITIVES
       ======================================== -->
  <section id="primitives">
    <h2><a href="#primitives" class="section-anchor">#</a>Primitives</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>StatusIcon</h3>
        <code class="file-path">src/lib/components/StatusIcon.svelte</code>
      </div>
      <p class="component-desc">
        Inline SVG icons representing asset operational status. Operating shows nothing for a clean
        look.
      </p>
      <div class="demo-row">
        {#each statuses as status}
          <div class="demo-item">
            <StatusIcon {status} size={14} />
            <span class="demo-label">{status}</span>
          </div>
        {/each}
      </div>
      <pre class="code-hint">&lt;StatusIcon status="proposed" size=&#123;14&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>TrackerIcon</h3>
        <code class="file-path">src/lib/components/TrackerIcon.svelte</code>
      </div>
      <p class="component-desc">Colored indicators for GEM tracker/asset types</p>
      <div class="demo-row">
        {#each trackers as tracker}
          <div class="demo-item">
            <TrackerIcon {tracker} size={12} />
            <span class="demo-label">{tracker}</span>
          </div>
        {/each}
      </div>
      <div class="demo-row" style="margin-top: var(--space-4);">
        <TrackerIcon tracker="Coal Plant" size={10} showLabel variant="pill" />
        <TrackerIcon tracker="LNG" size={10} showLabel variant="pill" />
        <TrackerIcon tracker="Steel Plant" size={10} showLabel variant="pill" />
      </div>
      <pre
        class="code-hint">&lt;TrackerIcon tracker="Coal Plant" showLabel variant="pill" /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Spinner</h3>
        <code class="file-path">src/lib/components/feedback/Spinner.svelte</code>
      </div>
      <p class="component-desc">Rotating loading indicator at various sizes</p>
      <div class="demo-row">
        <div class="demo-item">
          <Spinner size={16} />
          <span class="demo-label">16px</span>
        </div>
        <div class="demo-item">
          <Spinner size={24} />
          <span class="demo-label">24px</span>
        </div>
        <div class="demo-item">
          <Spinner size={40} />
          <span class="demo-label">40px</span>
        </div>
      </div>
      <pre class="code-hint">&lt;Spinner size=&#123;24&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Skeleton</h3>
        <code class="file-path">src/lib/components/Skeleton.svelte</code>
      </div>
      <p class="component-desc">Placeholder loading states with shimmer animation</p>
      <div class="demo-grid">
        <div class="demo-block">
          <span class="variant-label">text</span>
          <Skeleton variant="text" width="200px" />
        </div>
        <div class="demo-block">
          <span class="variant-label">paragraph</span>
          <Skeleton variant="paragraph" lines={3} width="280px" />
        </div>
        <div class="demo-block">
          <span class="variant-label">card</span>
          <Skeleton variant="card" width="200px" />
        </div>
        <div class="demo-block">
          <span class="variant-label">table-row</span>
          <Skeleton variant="table-row" />
          <Skeleton variant="table-row" />
        </div>
        <div class="demo-block">
          <span class="variant-label">stat</span>
          <Skeleton variant="stat" width="140px" />
        </div>
      </div>
      <pre class="code-hint">&lt;Skeleton variant="paragraph" lines=&#123;3&#125; /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       BADGES
       ======================================== -->
  <section id="badges">
    <h2><a href="#badges" class="section-anchor">#</a>Badges & Attribution</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>DataSourceBadge</h3>
        <code class="file-path">src/lib/components/DataSourceBadge.svelte</code>
      </div>
      <p class="component-desc">
        Shows data provenance - where the data came from and query performance
      </p>
      <div class="demo-row">
        <DataSourceBadge source="api" queryTime={45} />
        <DataSourceBadge source="local" queryTime={12} />
        <DataSourceBadge source="server" />
      </div>
      <div class="demo-row" style="margin-top: var(--space-3);">
        <DataSourceBadge source="api" label="Entity Search" size="md" queryTime={89} />
      </div>
      <pre class="code-hint">&lt;DataSourceBadge source="api" queryTime=&#123;45&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Citation</h3>
        <code class="file-path">src/lib/components/Citation.svelte</code>
      </div>
      <p class="component-desc">
        Data attribution with copy-to-clipboard citation in AP/academic formats
      </p>
      <div class="demo-block full-width">
        <span class="variant-label">footer variant</span>
        <Citation variant="footer" trackers={['Coal Plant']} dataSource="api" queryTime={142} />
      </div>
      <div class="demo-row" style="margin-top: var(--space-4);">
        <span class="variant-label" style="margin-right: var(--space-2);">compact:</span>
        <Citation variant="compact" />
      </div>
      <pre
        class="code-hint">&lt;Citation variant="footer" trackers=&#123;['Coal Plant']&#125; dataSource="api" /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       LAYOUT
       ======================================== -->
  <section id="layout">
    <h2><a href="#layout" class="section-anchor">#</a>Layout Components</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>PageHeader</h3>
        <code class="file-path">src/lib/components/nav/PageHeader.svelte</code>
      </div>
      <p class="component-desc">
        Page header with breadcrumb navigation, title, and optional lead text
      </p>
      <div class="demo-block full-width">
        <PageHeader
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Trackers', href: '/tracker' },
            { label: 'Coal Plant' },
          ]}
          title="Shenhua Ningxia Coal Power Station"
          lead="3,200 MW coal plant in Ningxia, China — operating since 2011"
        />
      </div>
      <pre
        class="code-hint">&lt;PageHeader breadcrumbs=&#123;[...]&#125; title="..." lead="..." /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>SectionHeader</h3>
        <code class="file-path">src/lib/components/nav/SectionHeader.svelte</code>
      </div>
      <p class="component-desc">Section heading with optional subtitle and right-aligned slot</p>
      <div class="demo-block full-width">
        <SectionHeader title="Ownership Structure" subtitle="Based on most recent filings" />
      </div>
      <div class="demo-block full-width" style="margin-top: var(--space-3);">
        <SectionHeader title="Asset Portfolio">
          <button class="btn btn-sm">Export CSV</button>
        </SectionHeader>
      </div>
      <pre
        class="code-hint">&lt;SectionHeader title="..." subtitle="..."&gt;&#123;slot&#125;&lt;/SectionHeader&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       CARDS
       ======================================== -->
  <section id="cards">
    <h2><a href="#cards" class="section-anchor">#</a>Cards</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>EntityMicroCard</h3>
        <code class="file-path">src/lib/components/EntityMicroCard.svelte</code>
      </div>
      <p class="component-desc">
        Compact entity summary with mini flower visualization showing tracker distribution
      </p>
      <div class="demo-row cards-row">
        {#each realCompanies as company}
          <EntityMicroCard
            name={company.name}
            location={company.location}
            assetCount={company.assetCount}
            totalCapacity={company.totalCapacity}
            trackers={company.trackers}
          />
        {/each}
      </div>
      <pre
        class="code-hint">&lt;EntityMicroCard name="China Energy" assetCount=&#123;847&#125; trackers=&#123;[&#123;tracker: 'Coal Plant', count: 312, capacity: 142000&#125;]&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>AssetMicroCard</h3>
        <code class="file-path">src/lib/components/AssetMicroCard.svelte</code>
      </div>
      <p class="component-desc">Compact asset summary for map popups and search results</p>
      <div class="demo-row cards-row">
        {#each realAssets as asset}
          <AssetMicroCard {...asset} />
        {/each}
      </div>
      <pre
        class="code-hint">&lt;AssetMicroCard id="G100000109409" name="Shenhua Ningxia" tracker="Coal Plant" status="operating" capacity=&#123;3200&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>ProjectCard</h3>
        <code class="file-path">src/lib/components/cards/ProjectCard.svelte</code>
      </div>
      <p class="component-desc">
        Expandable asset detail card with tabbed layout for factsheet data
      </p>
      <div class="demo-stack">
        {#each sampleProjectAssets as asset}
          <div class="demo-block full-width">
            <ProjectCard {asset} variant="compact" showLink={false} />
          </div>
        {/each}
      </div>
      <pre
        class="code-hint">&lt;ProjectCard asset=&#123;assetData&#125; variant="compact" /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       CHARTS
       ======================================== -->
  <section id="charts">
    <h2><a href="#charts" class="section-anchor">#</a>Charts & Visualizations</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>OwnershipPie</h3>
        <code class="file-path">src/lib/components/OwnershipPie.svelte</code>
      </div>
      <p class="component-desc">Circular ownership percentage indicator</p>
      <div class="demo-row">
        <div class="demo-item">
          <OwnershipPie percentage={100} size={40} showLabel />
          <span class="demo-label">100%</span>
        </div>
        <div class="demo-item">
          <OwnershipPie percentage={75} size={40} showLabel />
          <span class="demo-label">75%</span>
        </div>
        <div class="demo-item">
          <OwnershipPie percentage={50} size={40} showLabel />
          <span class="demo-label">50%</span>
        </div>
        <div class="demo-item">
          <OwnershipPie percentage={25} size={40} showLabel />
          <span class="demo-label">25%</span>
        </div>
        <div class="demo-item">
          <OwnershipPie percentage={10} size={40} showLabel />
          <span class="demo-label">10%</span>
        </div>
      </div>
      <pre
        class="code-hint">&lt;OwnershipPie percentage=&#123;75&#125; size=&#123;40&#125; showLabel /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Sparkline</h3>
        <code class="file-path">src/lib/components/Sparkline.svelte</code>
      </div>
      <p class="component-desc">
        Lightweight trend line for temporal data (e.g., coal capacity added per year)
      </p>
      <div class="demo-row">
        <Sparkline
          data={capacityTimeSeries}
          width={240}
          height={50}
          label="Coal Capacity Added (MW)"
        />
        <Sparkline data={capacityTimeSeries} width={180} height={50} color="#dc2626" showDots />
        <Sparkline data={capacityTimeSeries} width={120} height={35} compact label="Trend" />
      </div>
      <pre
        class="code-hint">&lt;Sparkline data=&#123;[&#123;x: 2015, y: 72000&#125;, ...]&#125; label="Capacity Added" /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>MiniBarChart</h3>
        <code class="file-path">src/lib/components/MiniBarChart.svelte</code>
      </div>
      <p class="component-desc">
        Horizontal bar chart for categorical breakdowns (countries, trackers, etc.)
      </p>
      <div class="demo-row">
        <MiniBarChart data={countryData} width={260} label="Coal Plants by Country" maxItems={5} />
        <MiniBarChart data={countryData} width={200} label="Top 3" maxItems={3} color="#0d47a1" />
        <MiniBarChart data={countryData} width={150} maxItems={4} compact label="Countries" />
      </div>
      <pre
        class="code-hint">&lt;MiniBarChart data=&#123;[&#123;label: 'China', value: 2847&#125;]&#125; label="By Country" /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>MiniHistogram</h3>
        <code class="file-path">src/lib/components/MiniHistogram.svelte</code>
      </div>
      <p class="component-desc">Distribution visualization (e.g., plant capacity sizes)</p>
      <div class="demo-row">
        <MiniHistogram
          data={capacityDistribution}
          width={240}
          height={70}
          label="Plant Capacity Distribution"
          unit="MW"
          bins={12}
        />
        <MiniHistogram
          data={capacityDistribution}
          width={180}
          height={60}
          color="#059669"
          bins={8}
        />
        <MiniHistogram
          data={capacityDistribution}
          width={140}
          height={50}
          compact
          label="Sizes"
          bins={6}
        />
      </div>
      <pre
        class="code-hint">&lt;MiniHistogram data=&#123;[150, 200, 660, 1000, ...]&#125; label="Capacity" unit="MW" /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       OWNERSHIP TREE GRAPH
       ======================================== -->
  <section id="ownership-tree">
    <h2><a href="#ownership-tree" class="section-anchor">#</a>Ownership Tree Graph</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>Featured Assets (API — Observable parity testing)</h3>
        <code class="file-path">src/lib/components/ownership/OwnershipTreeGraph.svelte</code>
      </div>
      <p class="component-desc">
        Same featured assets from the Observable notebook. Select one to fetch live data and compare
        rendering parity.
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;">
        {#each [...featuredAssets] as [name, id]}
          <button
            style="padding: 4px 10px; border: 1px solid {selectedFeaturedAsset === name
              ? '#016B83'
              : '#ccc'}; border-radius: 4px; background: {selectedFeaturedAsset === name
              ? '#016B83'
              : '#fff'}; color: {selectedFeaturedAsset === name
              ? '#fff'
              : '#333'}; cursor: pointer; font-size: 12px;"
            onclick={() => {
              selectedFeaturedAsset = name;
            }}
          >
            {name} <span style="opacity: 0.6; font-size: 10px;">({id})</span>
          </button>
        {/each}
      </div>
      <div class="demo-block full-width">
        <span class="variant-label"
          >API: {selectedFeaturedAsset} ({featuredAssets.get(selectedFeaturedAsset)})</span
        >
        {#if featuredLoading}
          <div style="padding: 40px; text-align: center; color: #888;">
            Loading {selectedFeaturedAsset}...
          </div>
        {:else if featuredError}
          <div style="padding: 40px; text-align: center; color: #c00;">{featuredError}</div>
        {:else if featuredGraphData}
          <OwnershipTreeGraph
            nodes={featuredGraphData.nodes}
            edges={featuredGraphData.edges}
            paths={featuredGraphData.paths}
            rootId={featuredGraphData.root?.id || ''}
          />
        {/if}
      </div>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Default mode</h3>
        <code class="file-path">src/lib/components/ownership/OwnershipTreeGraph.svelte</code>
      </div>
      <p class="component-desc">
        Small tree (6 nodes, depth 2) — all labels centered below nodes. Color-by toggle and legend
        visible.
      </p>
      <div class="demo-block full-width">
        <span class="variant-label">labelMode: default</span>
        <OwnershipTreeGraph
          nodes={treeGraphSmall.nodes}
          edges={treeGraphSmall.edges}
          paths={treeGraphSmall.paths}
          rootId={treeGraphSmall.rootId}
        />
      </div>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Deep-narrow mode</h3>
      </div>
      <p class="component-desc">
        Deep chain (12 nodes, depth 7) — ranks compressed, labels shifted to the right of nodes.
      </p>
      <div class="demo-block full-width">
        <span class="variant-label">labelMode: deep-narrow</span>
        <OwnershipTreeGraph
          nodes={treeGraphDeep.nodes}
          edges={treeGraphDeep.edges}
          paths={treeGraphDeep.paths}
          rootId={treeGraphDeep.rootId}
        />
      </div>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Large mode</h3>
      </div>
      <p class="component-desc">
        Large tree (30 nodes) — labels hidden by default, only shown for high-pct (&gt;20%) nodes.
        Hover to reveal others.
      </p>
      <div class="demo-block full-width">
        <span class="variant-label">labelMode: large</span>
        <OwnershipTreeGraph
          nodes={treeGraphLarge.nodes}
          edges={treeGraphLarge.edges}
          paths={treeGraphLarge.paths}
          rootId={treeGraphLarge.rootId}
        />
      </div>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>Compact mode</h3>
      </div>
      <p class="component-desc">
        Same small tree data but in compact/embed mode — no side panel, smaller nodes.
      </p>
      <div class="demo-block full-width">
        <span class="variant-label">compact: true</span>
        <OwnershipTreeGraph
          nodes={treeGraphSmall.nodes}
          edges={treeGraphSmall.edges}
          paths={treeGraphSmall.paths}
          rootId={treeGraphSmall.rootId}
          compact
        />
      </div>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>AssetRingVisualization</h3>
        <code class="file-path">src/lib/components/ownership/AssetRingVisualization.svelte</code>
      </div>
      <p class="component-desc">
        Ring-of-circles showing multiple units at a single location with status coloring and
        ownership pies.
      </p>
      <div class="demo-row">
        <div class="demo-item flower-demo">
          <AssetRingVisualization assets={sampleRingAssets} size={200} interactive={false} />
          <span class="demo-label">6 units, mixed status</span>
        </div>
        <div class="demo-item flower-demo">
          <AssetRingVisualization
            assets={sampleRingAssets.slice(0, 3)}
            size={140}
            interactive={false}
          />
          <span class="demo-label">3 units</span>
        </div>
      </div>
      <pre
        class="code-hint">&lt;AssetRingVisualization assets=&#123;[&#123;id, name, status, capacityMw, share&#125;]&#125; size=&#123;200&#125; /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       TABLES
       ======================================== -->
  <section id="tables">
    <h2><a href="#tables" class="section-anchor">#</a>Tables & Data</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>DataTable</h3>
        <code class="file-path">src/lib/components/table/DataTable.svelte</code>
      </div>
      <p class="component-desc">
        Feature-rich data table with search, column filters, sorting, pagination, and CSV/JSON
        export.
      </p>
      <div class="demo-block full-width">
        <DataTable
          columns={tableColumns}
          data={tableData}
          pageSize={5}
          striped
          showExport
          showGlobalSearch
          showColumnFilters={false}
        />
      </div>
      <pre
        class="code-hint">&lt;DataTable columns=&#123;[...]&#125; data=&#123;[...]&#125; pageSize=&#123;25&#125; showExport /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       NAVIGATION
       ======================================== -->
  <section id="navigation">
    <h2><a href="#navigation" class="section-anchor">#</a>Navigation & Filtering</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>ScreenerStepNav</h3>
        <code class="file-path">src/lib/components/ScreenerStepNav.svelte</code>
      </div>
      <p class="component-desc">Step indicator for multi-page wizard flows</p>
      <div class="demo-stack">
        <div class="demo-block full-width">
          <span class="variant-label">Step 1 - Select Assets</span>
          <ScreenerStepNav currentStep={1} />
        </div>
        <div class="demo-block full-width">
          <span class="variant-label">Step 2 - Find Owners</span>
          <ScreenerStepNav currentStep={2} />
        </div>
        <div class="demo-block full-width">
          <span class="variant-label">Step 3 - View Results</span>
          <ScreenerStepNav currentStep={3} />
        </div>
      </div>
      <pre class="code-hint">&lt;ScreenerStepNav currentStep=&#123;2&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>FilterBreadcrumbs</h3>
        <code class="file-path">src/lib/components/FilterBreadcrumbs.svelte</code>
      </div>
      <p class="component-desc">Active filter pills with remove functionality</p>
      <div class="demo-block full-width">
        <FilterBreadcrumbs
          filters={sampleFilters}
          onRemove={(filter) => console.log('Remove:', filter)}
        />
      </div>
      <pre
        class="code-hint">&lt;FilterBreadcrumbs filters=&#123;[&#123;type: 'tracker', label: 'Coal Plant'&#125;]&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>AssetClassesPanel</h3>
        <code class="file-path">src/lib/components/AssetClassesPanel.svelte</code>
      </div>
      <p class="component-desc">
        Collapsible panel showing selected asset classes in screener flows
      </p>
      <div class="demo-row" style="align-items: flex-start;">
        <div class="demo-block">
          <span class="variant-label">default panel</span>
          <AssetClassesPanel classesParam={sampleClassesParam} />
        </div>
        <div class="demo-block">
          <span class="variant-label">badge variant</span>
          <AssetClassesPanel classesParam={sampleClassesParam} variant="badge" />
        </div>
        <div class="demo-block">
          <span class="variant-label">compact</span>
          <AssetClassesPanel classesParam={sampleClassesParam} variant="compact" />
        </div>
      </div>
      <pre
        class="code-hint">&lt;AssetClassesPanel classesParam=&#123;JSON.stringify([...])&#125; variant="badge" /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       INPUTS
       ======================================== -->
  <section id="inputs">
    <h2><a href="#inputs" class="section-anchor">#</a>Inputs & Search</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>AssetSearchBar</h3>
        <code class="file-path">src/lib/components/search/AssetSearchBar.svelte</code>
      </div>
      <p class="component-desc">
        Search input with optional mode selector, clear button, and submit
      </p>
      <div class="demo-block full-width" style="max-width: 500px;">
        <AssetSearchBar
          bind:value={searchValue}
          modes={[
            { id: 'name', label: 'Name', placeholder: 'Search by asset name...' },
            { id: 'owner', label: 'Owner', placeholder: 'Search by owner name...' },
            { id: 'id', label: 'ID', placeholder: 'Enter asset ID (e.g. G100...)' },
          ]}
          helperText="Try searching for 'Shenhua' or 'China Energy'"
        />
      </div>
      <div class="demo-block" style="max-width: 300px; margin-top: var(--space-3);">
        <span class="variant-label">compact, no button</span>
        <AssetSearchBar compact showButton={false} placeholder="Quick search..." />
      </div>
      <pre
        class="code-hint">&lt;AssetSearchBar bind:value modes=&#123;[...]&#125; helperText="..." /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>CountryMultiSelect</h3>
        <code class="file-path">src/lib/components/screener/CountryMultiSelect.svelte</code>
      </div>
      <p class="component-desc">
        Searchable multi-select combobox with preset country groups (G7, EU, BRICS). Type "G7" to
        add all G7 countries at once.
      </p>
      <div class="demo-block full-width" style="max-width: 400px;">
        <CountryMultiSelect bind:selected={selectedCountries} countries={sampleCountries} />
      </div>
      <pre
        class="code-hint">&lt;CountryMultiSelect bind:selected countries=&#123;[...]&#125; /&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>RangeSlider</h3>
        <code class="file-path">src/lib/components/table/RangeSlider.svelte</code>
      </div>
      <p class="component-desc">
        Dual-handle range slider with histogram preview for numeric filters
      </p>
      <div class="demo-block" style="max-width: 320px;">
        <RangeSlider
          label="Plant Capacity"
          bind:min={rangeMin}
          bind:max={rangeMax}
          dataMin={0}
          dataMax={10000}
          step={100}
          unit=" MW"
          histogram={rangeHistogram}
        />
      </div>
      <pre
        class="code-hint">&lt;RangeSlider label="Capacity" bind:min bind:max dataMax=&#123;10000&#125; unit=" MW" histogram=&#123;[...]&#125; /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       LOADING STATES
       ======================================== -->
  <section id="states">
    <h2><a href="#states" class="section-anchor">#</a>Loading States</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>LoadingWrapper</h3>
        <code class="file-path">src/lib/components/LoadingWrapper.svelte</code>
      </div>
      <p class="component-desc">Standardized loading/error/empty state wrapper</p>

      <div class="state-controls">
        <label>
          <input type="checkbox" bind:checked={showLoading} />
          Loading
        </label>
        <label>
          <input type="checkbox" bind:checked={showError} />
          Error
        </label>
        <label>
          <input type="checkbox" bind:checked={showEmpty} />
          Empty
        </label>
      </div>

      <div class="demo-block full-width state-demo">
        <LoadingWrapper
          loading={showLoading}
          error={showError ? 'Failed to load ownership data: Connection timeout after 30s' : null}
          empty={showEmpty}
          emptyMessage="No assets match your filters. Try broadening your search."
        >
          <div class="sample-content">
            <p>This content displays when not loading, error, or empty.</p>
            <p>Toggle the checkboxes above to see different states.</p>
          </div>
        </LoadingWrapper>
      </div>

      <div class="demo-row" style="margin-top: var(--space-6);">
        <div class="demo-block">
          <span class="variant-label">skeleton="card"</span>
          <LoadingWrapper loading={true} skeleton="card" skeletonCount={2}>
            <p>Content</p>
          </LoadingWrapper>
        </div>
        <div class="demo-block">
          <span class="variant-label">skeleton="table-row"</span>
          <LoadingWrapper loading={true} skeleton="table-row" skeletonCount={4}>
            <p>Content</p>
          </LoadingWrapper>
        </div>
      </div>
      <pre
        class="code-hint">&lt;LoadingWrapper loading error=&#123;errorMsg&#125; skeleton="card"&gt;...&lt;/LoadingWrapper&gt;</pre>
    </div>

    <div class="component-group">
      <div class="component-header">
        <h3>ReportLoadingTerminal</h3>
        <code class="file-path">src/lib/components/feedback/ReportLoadingTerminal.svelte</code>
      </div>
      <p class="component-desc">
        Terminal-style progress display for long-running report generation, with step status
        indicators
      </p>
      <div class="demo-block full-width" style="max-width: 480px;">
        <ReportLoadingTerminal
          elapsedMs={2910}
          cartCount={3}
          entityCount={12}
          assetCount={847}
          steps={sampleReportSteps}
        />
      </div>
      <pre
        class="code-hint">&lt;ReportLoadingTerminal elapsedMs=&#123;2910&#125; steps=&#123;[&#123;id, label, status, rows?, ms?&#125;]&#125; /&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       BUTTONS
       ======================================== -->
  <section id="buttons">
    <h2><a href="#buttons" class="section-anchor">#</a>Buttons</h2>

    <div class="component-group">
      <h3>Global Button Styles</h3>
      <p class="component-desc">Shared button classes from app.css</p>
      <div class="demo-row">
        <button class="btn">Default</button>
        <button class="btn btn-primary">Primary</button>
        <button class="btn btn-sm">Small</button>
        <button class="btn btn-lg">Large</button>
        <button class="btn" disabled>Disabled</button>
      </div>
      <div class="demo-row" style="margin-top: var(--space-3);">
        <button class="btn btn-icon">+</button>
        <button class="btn btn-link">Link style</button>
      </div>
      <pre class="code-hint">&lt;button class="btn btn-primary"&gt;Primary&lt;/button&gt;</pre>
    </div>
  </section>

  <!-- ========================================
       DEBUG
       ======================================== -->
  <section id="debug">
    <h2><a href="#debug" class="section-anchor">#</a>Debug & Diagnostics</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>ApiCallLog</h3>
        <code class="file-path">src/lib/components/ApiCallLog.svelte</code>
      </div>
      <p class="component-desc">
        Collapsible panel showing every REST API call made on the current page — URL, status,
        timing, and reason. Rendered globally in the layout, clears on route change.
      </p>
      <div class="demo-block full-width">
        <ApiCallLog />
        <p
          style="font-size: var(--font-size-sm); color: var(--color-text-tertiary); margin-top: var(--space-3);"
        >
          Any API calls made by this page (e.g. from EntityMicroCard or other live components) will
          appear above.
        </p>
      </div>
      <pre class="code-hint">&lt;ApiCallLog /&gt; &mdash; also available globally via layout</pre>
    </div>
  </section>

  <!-- ========================================
       COMPLEX COMPONENTS
       ======================================== -->
  <section id="complex">
    <h2><a href="#complex" class="section-anchor">#</a>Complex Components</h2>
    <p class="section-intro">
      These components require API data or complex runtime context and can't be demoed with static
      data. See them live on their respective pages.
    </p>

    <div class="complex-list">
      {#each complexComponents as comp}
        <div class="complex-item">
          <div class="complex-header">
            <code class="comp-name">{comp.name}</code>
            <code class="file-path">{comp.path}</code>
          </div>
          <p class="complex-what">{comp.what}</p>
          <p class="complex-api"><strong>API:</strong> {comp.api}</p>
          <pre class="code-hint">{comp.usage}</pre>
        </div>
      {/each}
    </div>
  </section>

  <!-- ========================================
       COAL PLANT CARD TEST HARNESS
       ======================================== -->
  <section id="coal-plant-card">
    <h2><a href="#coal-plant-card" class="section-anchor">#</a>CoalPlantCard</h2>
    <p class="section-intro">
      Test harness for <code>src/lib/components/cards/CoalPlantCard.svelte</code>.
    </p>
    <div class="demo-block">
      <!-- Preset radio buttons -->
      <div class="coal-presets">
        {#each COAL_PRESETS as preset}
          <label
            class="coal-preset-label"
            class:active={!coalUseCustom && coalSelectedPreset === preset.id}
          >
            <input
              type="radio"
              name="coal-preset"
              value={preset.id}
              checked={!coalUseCustom && coalSelectedPreset === preset.id}
              onchange={() => {
                coalSelectedPreset = preset.id;
                coalUseCustom = false;
                loadCoalPlant();
              }}
            />
            <span class="coal-preset-name">{preset.label}</span>
            <span class="coal-preset-id">{preset.id}</span>
          </label>
        {/each}
      </div>

      <!-- Custom ID row -->
      <div
        style="display: flex; gap: var(--space-3); align-items: center; margin-top: var(--space-3); margin-bottom: var(--space-4);"
      >
        <label
          class="coal-preset-label"
          class:active={coalUseCustom}
          style="margin: 0; padding: var(--space-2) var(--space-3);"
        >
          <input
            type="radio"
            name="coal-preset"
            checked={coalUseCustom}
            onchange={() => {
              coalUseCustom = true;
            }}
          />
          <span class="coal-preset-name">Custom</span>
        </label>
        <input
          type="text"
          bind:value={coalCustomId}
          placeholder="e.g. L100000103058"
          onfocus={() => {
            coalUseCustom = true;
          }}
          onkeydown={(e) => e.key === 'Enter' && loadCoalPlant()}
          style="font-family: var(--font-family-mono); font-size: var(--font-size-sm); padding: var(--space-2) var(--space-3); border: var(--border-width) solid var(--color-border); border-radius: var(--radius-sm); width: 220px;"
        />
        <button class="btn" onclick={loadCoalPlant} disabled={coalLoading}>
          {coalLoading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {#if coalError}
        <p style="color: var(--color-status-retired); font-size: var(--font-size-sm);">
          {coalError}
        </p>
      {:else if coalLocation}
        <CoalPlantCard units={coalLocation.units} open={true} />
      {/if}
    </div>
  </section>

  <!-- ========================================
       FULL REGISTRY
       ======================================== -->
  <section id="registry">
    <h2><a href="#registry" class="section-anchor">#</a>Full Component Registry</h2>
    <p class="section-intro">
      All {totalComponentCount} components in the codebase, organized by category.
    </p>

    <input
      type="search"
      class="registry-search"
      placeholder="Filter components by name or category…"
      bind:value={registrySearch}
    />
    {#if registrySearch && filteredComponentIndex.length === 0}
      <p class="registry-empty">No components match "{registrySearch}"</p>
    {/if}

    {#each filteredCategories as cat}
      <div class="registry-category">
        <h3 class="registry-cat-label">{cat}</h3>
        <div class="component-index">
          {#each filteredComponentIndex.filter((c) => c.category === cat) as comp}
            <div class="index-item">
              <code class="comp-name">{comp.name}</code>
              <code class="file-path">{comp.path}</code>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </section>
</div>

<style>
  /* ── CoalPlantCard preset picker ── */
  .coal-presets {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .coal-preset-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    cursor: pointer;
    font-size: var(--font-size-sm);
    user-select: none;
    transition:
      border-color 0.1s,
      background 0.1s;
  }
  .coal-preset-label:hover {
    border-color: #888;
  }
  .coal-preset-label.active {
    border-color: #111;
    background: #111;
    color: #fff;
  }
  .coal-preset-label input[type='radio'] {
    display: none;
  }
  .coal-preset-name {
    font-weight: 500;
  }
  .coal-preset-id {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    opacity: 0.6;
  }
  .coal-preset-label.active .coal-preset-id {
    opacity: 0.7;
  }

  .page {
    max-width: 1000px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-6) var(--space-16);
  }

  .page-header {
    margin-bottom: var(--space-10);
    padding-bottom: var(--space-6);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .label {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: 400;
    margin: 0 0 var(--space-3) 0;
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 640px;
    line-height: var(--line-height-relaxed);
  }

  /* Table of Contents */
  .toc {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-4) 0;
    margin-bottom: var(--space-10);
    border-bottom: var(--border-width) solid var(--color-border-light);
    position: sticky;
    top: 0;
    background: var(--color-bg-primary);
    z-index: 10;
  }

  .toc-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
  }

  .toc a {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    text-decoration: none;
    padding: var(--space-1) var(--space-2);
    border-radius: 2px;
    transition:
      color 0.15s,
      background 0.15s;
  }

  .toc a:hover {
    color: var(--color-text-primary);
    background: var(--color-gray-50);
  }

  .toc a.active {
    color: var(--color-text-primary);
    background: var(--color-gray-100);
    font-weight: 500;
  }

  /* Sections */
  section {
    margin-bottom: 80px;
    padding-top: var(--space-6);
    scroll-margin-top: 60px;
  }

  section h2 {
    font-size: var(--font-size-xl);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    margin: 0 0 var(--space-8) 0;
    padding-bottom: var(--space-3);
    border-bottom: var(--border-width) solid var(--color-border);
    color: var(--color-text-secondary);
    position: relative;
  }

  .section-anchor {
    color: var(--color-gray-300);
    text-decoration: none;
    margin-right: var(--space-2);
    opacity: 0;
    transition: opacity 0.15s;
    font-weight: 400;
  }

  section h2:hover .section-anchor {
    opacity: 1;
  }

  .section-anchor:hover {
    color: var(--color-text-primary);
  }

  .section-intro {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  /* Component Groups */
  .component-group {
    margin-bottom: var(--space-16);
  }

  .component-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-2);
    flex-wrap: wrap;
  }

  .component-group h3 {
    font-size: var(--font-size-lg);
    font-weight: 500;
    margin: 0;
    color: var(--color-text-primary);
  }

  .file-path {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    background: var(--color-gray-100);
    padding: 2px 6px;
  }

  .component-desc {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-5) 0;
  }

  /* Demo Layouts */
  .demo-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-6);
    align-items: flex-start;
  }

  .demo-row.cards-row {
    gap: var(--space-4);
  }

  .demo-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .demo-item.flower-demo {
    flex-direction: column;
    gap: var(--space-1);
  }

  .demo-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .demo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-6);
  }

  .demo-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .demo-block {
    padding: var(--space-4);
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border-light);
  }

  .demo-block.full-width {
    width: 100%;
  }

  .variant-label {
    display: block;
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3);
  }

  /* Code Hints */
  .code-hint {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: var(--color-gray-100);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    overflow-x: auto;
    white-space: nowrap;
  }

  /* State Controls */
  .state-controls {
    display: flex;
    gap: var(--space-6);
    margin-bottom: var(--space-4);
  }

  .state-controls label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .state-demo {
    min-height: 120px;
  }

  .sample-content {
    padding: var(--space-4);
    background: var(--color-bg-primary);
  }

  .sample-content p {
    margin: 0 0 var(--space-2) 0;
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .sample-content p:last-child {
    margin-bottom: 0;
  }

  /* Component Index */
  .component-index {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .index-item {
    display: grid;
    grid-template-columns: 200px 1fr auto;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-bottom: var(--border-width) solid var(--color-border-light);
    align-items: center;
  }

  .comp-name {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-body);
    font-weight: 500;
    color: var(--color-text-primary);
  }


  /* Typography Reference */
  .type-samples {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .type-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-6);
  }

  .type-label {
    width: 160px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }

  /* Color Swatches */
  .color-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .color-swatches.grays {
    gap: var(--space-2);
  }

  .swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
  }

  .swatch-box {
    width: 48px;
    height: 48px;
    border: var(--border-width) solid var(--color-border);
  }

  .grays .swatch-box {
    width: 36px;
    height: 36px;
  }

  .swatch span {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  .registry-search {
    display: block;
    width: 100%;
    max-width: 360px;
    margin-bottom: var(--space-6);
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-body);
    font-family: var(--font-family-sans);
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-primary);
  }
  .registry-search:focus {
    outline: none;
    border-color: var(--gem-primary-blue, #1d4961);
  }
  .registry-empty {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-4);
  }
  .registry-category {
    margin-bottom: var(--space-6);
  }
  .registry-cat-label {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
    font-weight: 600;
  }
  .component-group h3:not(:first-of-type) {
    margin-top: var(--space-8);
  }

  .complex-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }
  .complex-item {
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-5);
  }
  .complex-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
    flex-wrap: wrap;
  }
  .complex-what {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2) 0;
  }
  .complex-api {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }
  .complex-api strong {
    color: var(--color-text-tertiary);
    font-weight: 600;
    text-transform: uppercase;
    font-size: var(--font-size-xs);
    letter-spacing: var(--tracking-caps);
  }

  @media (max-width: 768px) {
    .page {
      padding: var(--space-6) var(--space-4);
    }

    .toc {
      position: relative;
    }

    .demo-grid {
      grid-template-columns: 1fr;
    }

    .demo-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .demo-row.cards-row {
      flex-direction: row;
      flex-wrap: wrap;
    }

    .type-row {
      flex-direction: column;
      gap: var(--space-1);
    }

    .type-label {
      width: auto;
    }

    .index-item {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }

    .component-header {
      flex-direction: column;
      gap: var(--space-1);
    }
  }
</style>
