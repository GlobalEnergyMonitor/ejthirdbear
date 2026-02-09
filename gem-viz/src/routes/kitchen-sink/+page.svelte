<script>
  /**
   * KITCHEN SINK - Complete Component Library
   * Live examples of all UI components with file paths and real data
   */

  // Core UI Components
  import Skeleton from '$lib/components/Skeleton.svelte';
  import StatusIcon from '$lib/components/StatusIcon.svelte';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import DataSourceBadge from '$lib/components/DataSourceBadge.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';
  import Citation from '$lib/components/Citation.svelte';

  // Cards
  import EntityMicroCard from '$lib/components/EntityMicroCard.svelte';
  import AssetMicroCard from '$lib/components/AssetMicroCard.svelte';

  // Charts
  import Sparkline from '$lib/components/Sparkline.svelte';
  import MiniBarChart from '$lib/components/MiniBarChart.svelte';
  import MiniFlower from '$lib/components/MiniFlower.svelte';
  import MiniHistogram from '$lib/components/MiniHistogram.svelte';
  import OwnershipPie from '$lib/components/OwnershipPie.svelte';

  // Navigation & Filters
  import ScreenerStepNav from '$lib/components/ScreenerStepNav.svelte';
  import FilterBreadcrumbs from '$lib/components/FilterBreadcrumbs.svelte';
  import RangeSlider from '$lib/components/RangeSlider.svelte';
  import AssetClassesPanel from '$lib/components/AssetClassesPanel.svelte';

  // Example data from extracted file
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
    componentIndex,
  } from './kitchen-sink-data';

  // Toggle states for interactive demos
  let showLoading = $state(false);
  let showError = $state(false);
  let showEmpty = $state(false);
  let rangeMin = $state(null);
  let rangeMax = $state(null);

  // Not shown in demos (complex/context-dependent)
  const complexComponents = [
    {
      name: 'AssetMap',
      path: 'src/lib/components/AssetMap.svelte',
      note: 'Requires MapLibre + coordinates',
    },
    {
      name: 'InvestigationMap',
      path: 'src/lib/components/InvestigationMap.svelte',
      note: 'Requires cart data',
    },
    {
      name: 'InvestigationNetwork',
      path: 'src/lib/components/InvestigationNetwork.svelte',
      note: 'Requires ownership graph',
    },
    {
      name: 'MermaidOwnership',
      path: 'src/lib/components/MermaidOwnership.svelte',
      note: 'Requires entity hierarchy',
    },
    {
      name: 'OwnershipExplorerD3',
      path: 'src/lib/components/OwnershipExplorerD3.svelte',
      note: 'Full-page D3 explorer',
    },
    {
      name: 'OwnershipFlower',
      path: 'src/lib/components/OwnershipFlower.svelte',
      note: 'Large radial diagram',
    },
    {
      name: 'RelationshipNetwork',
      path: 'src/lib/components/RelationshipNetwork.svelte',
      note: 'Force-directed graph',
    },
    {
      name: 'MiniNetworkGraph',
      path: 'src/lib/components/MiniNetworkGraph.svelte',
      note: 'Compact network viz',
    },
    { name: 'DataTable', path: 'src/lib/components/DataTable.svelte', note: 'Sortable data grid' },
    {
      name: 'FacetedFilter',
      path: 'src/lib/components/FacetedFilter.svelte',
      note: 'Multi-select facets',
    },
    { name: 'ExportPanel', path: 'src/lib/components/ExportPanel.svelte', note: 'Export modal' },
    {
      name: 'CommandPalette',
      path: 'src/lib/components/CommandPalette.svelte',
      note: 'Cmd+K palette',
    },
    {
      name: 'ProjectCard',
      path: 'src/lib/components/ProjectCard.svelte',
      note: 'Expandable asset card',
    },
    {
      name: 'UltimateOwners',
      path: 'src/lib/components/UltimateOwners.svelte',
      note: 'Ownership chain viz',
    },
    {
      name: 'PatternInsights',
      path: 'src/lib/components/PatternInsights.svelte',
      note: 'AI-generated insights',
    },
    {
      name: 'AssetRingVisualization',
      path: 'src/lib/components/ownership/AssetRingVisualization.svelte',
      note: 'Circular asset display',
    },
    {
      name: 'DagreOwnershipGraph',
      path: 'src/lib/components/ownership/DagreOwnershipGraph.svelte',
      note: 'Dagre layout graph',
    },
  ];
</script>

<svelte:head>
  <title>Kitchen Sink — GEM Viz Component Library</title>
  <meta name="description" content="Complete component library with live examples" />
</svelte:head>

<main>
  <header class="page-header">
    <p class="label">Component Library</p>
    <h1>Kitchen Sink</h1>
    <p class="subtitle">
      {componentIndex.length} documented components + {complexComponents.length} complex components.
      All examples use realistic data from Global Energy Monitor trackers.
    </p>
  </header>

  <!-- Table of Contents -->
  <nav class="toc">
    <span class="toc-label">Jump to:</span>
    <a href="#primitives">Primitives</a>
    <a href="#badges">Badges</a>
    <a href="#cards">Cards</a>
    <a href="#charts">Charts</a>
    <a href="#navigation">Navigation</a>
    <a href="#inputs">Inputs</a>
    <a href="#states">Loading States</a>
    <a href="#buttons">Buttons</a>
    <a href="#complex">Complex Components</a>
    <a href="#typography">Typography</a>
    <a href="#colors">Colors</a>
  </nav>

  <!-- ========================================
       PRIMITIVES
       ======================================== -->
  <section id="primitives">
    <h2>Primitives</h2>

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
    <h2>Badges & Attribution</h2>

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
        <DataSourceBadge source="motherduck" queryTime={230} />
        <DataSourceBadge source="local" queryTime={12} />
        <DataSourceBadge source="server" />
      </div>
      <div class="demo-row" style="margin-top: var(--space-3);">
        <DataSourceBadge source="api" label="Entity Search" size="md" queryTime={89} />
      </div>
      <pre
        class="code-hint">&lt;DataSourceBadge source="motherduck" queryTime=&#123;230&#125; /&gt;</pre>
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
        <Citation
          variant="footer"
          trackers={['Coal Plant']}
          dataSource="motherduck"
          queryTime={142}
        />
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
       CARDS
       ======================================== -->
  <section id="cards">
    <h2>Cards</h2>

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
  </section>

  <!-- ========================================
       CHARTS
       ======================================== -->
  <section id="charts">
    <h2>Charts & Visualizations</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>MiniFlower</h3>
        <code class="file-path">src/lib/components/MiniFlower.svelte</code>
      </div>
      <p class="component-desc">
        Nadieh Bremer-inspired radial petal chart showing tracker distribution by count & capacity
      </p>
      <div class="demo-row">
        {#each realCompanies as company}
          <div class="demo-item flower-demo">
            <MiniFlower trackers={company.trackers} size={48} />
            <span class="demo-label">{company.name.split(' ')[0]}</span>
          </div>
        {/each}
        <div class="demo-item flower-demo">
          <MiniFlower
            trackers={[{ tracker: 'Coal Plant', count: 100, capacity: 50000 }]}
            size={48}
          />
          <span class="demo-label">Single type</span>
        </div>
      </div>
      <pre
        class="code-hint">&lt;MiniFlower trackers=&#123;[&#123;tracker: 'Coal Plant', count: 312, capacity: 142000&#125;]&#125; size=&#123;48&#125; /&gt;</pre>
    </div>

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
       NAVIGATION
       ======================================== -->
  <section id="navigation">
    <h2>Navigation & Filtering</h2>

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
          onClear={() => console.log('Clear all')}
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
    <h2>Inputs</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>RangeSlider</h3>
        <code class="file-path">src/lib/components/RangeSlider.svelte</code>
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
    <h2>Loading States</h2>

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
  </section>

  <!-- ========================================
       BUTTONS
       ======================================== -->
  <section id="buttons">
    <h2>Buttons</h2>

    <div class="component-group">
      <div class="component-header">
        <h3>AddToCartButton</h3>
        <code class="file-path">src/lib/components/AddToCartButton.svelte</code>
      </div>
      <p class="component-desc">Toggle button for adding entities/assets to investigation cart</p>
      <div class="demo-row">
        <div class="demo-item">
          <AddToCartButton id="E100001000348" name="China Energy" variant="default" />
          <span class="demo-label">default</span>
        </div>
        <div class="demo-item">
          <AddToCartButton id="E100001000349" name="NTPC Limited" variant="default" size="small" />
          <span class="demo-label">small</span>
        </div>
        <div class="demo-item">
          <AddToCartButton id="E100001000350" name="Adani Power" variant="icon" />
          <span class="demo-label">icon</span>
        </div>
        <div class="demo-item">
          <AddToCartButton id="E100001000351" name="TotalEnergies" variant="minimal" />
          <span class="demo-label">minimal</span>
        </div>
      </div>
      <pre
        class="code-hint">&lt;AddToCartButton id="E100001000348" name="China Energy" variant="icon" /&gt;</pre>
    </div>

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
       COMPLEX COMPONENTS
       ======================================== -->
  <section id="complex">
    <h2>Complex Components</h2>
    <p class="section-intro">
      These components require specific data contexts (maps, graphs, ownership hierarchies) and are
      documented here for reference.
    </p>

    <div class="component-index">
      {#each complexComponents as comp}
        <div class="index-item">
          <code class="comp-name">{comp.name}</code>
          <code class="file-path">{comp.path}</code>
          <span class="comp-note">{comp.note}</span>
        </div>
      {/each}
    </div>
  </section>

  <!-- ========================================
       TYPOGRAPHY REFERENCE
       ======================================== -->
  <section id="typography">
    <h2>Typography Reference</h2>
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
    <h2>Color Reference</h2>
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
</main>

<style>
  main {
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
    color: var(--color-text-secondary);
    text-decoration: none;
    padding: var(--space-1) var(--space-2);
  }

  .toc a:hover {
    color: var(--color-text-primary);
    text-decoration: underline;
  }

  /* Sections */
  section {
    margin-bottom: var(--space-16);
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
  }

  .section-intro {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }

  /* Component Groups */
  .component-group {
    margin-bottom: var(--space-12);
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

  .comp-note {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
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

  .component-group h3:not(:first-of-type) {
    margin-top: var(--space-8);
  }

  @media (max-width: 768px) {
    main {
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
