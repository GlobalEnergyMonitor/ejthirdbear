<script>
  import { base } from '$app/paths';
  import DataTable from '$lib/components/DataTable.svelte';

  let selectedRows = $state([]);

  const columns = [
    { key: 'Unit', label: 'Unit Name', sortable: true, filterable: true, width: '200px' },
    { key: 'Owner', label: 'Owner', sortable: true, filterable: true, width: '180px' },
    { key: 'Country', label: 'Country', sortable: true, filterable: true },
    { key: 'Tracker', label: 'Tracker', sortable: true, filterable: true },
    { key: 'Status', label: 'Status', sortable: true, filterable: true },
    { key: 'capacity', label: 'Capacity (MW)', sortable: true, type: 'number' },
    { key: 'startYear', label: 'Start Year', sortable: true, type: 'number' },
  ];

  // Sample data for demo
  const data = [
    { Unit: 'Solar Farm Alpha', Owner: 'SunPower Corp', Country: 'USA', Tracker: 'Solar', Status: 'Operating', capacity: 500, startYear: 2020 },
    { Unit: 'Wind Valley 1', Owner: 'WindGen LLC', Country: 'Germany', Tracker: 'Wind', Status: 'Operating', capacity: 320, startYear: 2019 },
    { Unit: 'Coal Plant Beta', Owner: 'Legacy Energy', Country: 'China', Tracker: 'Coal', Status: 'Mothballed', capacity: 1200, startYear: 1995 },
    { Unit: 'Nuclear Station Gamma', Owner: 'AtomEnergy', Country: 'France', Tracker: 'Nuclear', Status: 'Operating', capacity: 2500, startYear: 2010 },
    { Unit: 'Gas Turbine Delta', Owner: 'FlexPower Inc', Country: 'UK', Tracker: 'Gas', Status: 'Construction', capacity: 450, startYear: 2024 },
    { Unit: 'Solar Array Epsilon', Owner: 'GreenLight Energy', Country: 'India', Tracker: 'Solar', Status: 'Announced', capacity: 800, startYear: 2025 },
    { Unit: 'Offshore Wind Zeta', Owner: 'SeaBreeze Corp', Country: 'Netherlands', Tracker: 'Wind', Status: 'Construction', capacity: 750, startYear: 2024 },
    { Unit: 'Hydro Dam Eta', Owner: 'WaterPower Ltd', Country: 'Brazil', Tracker: 'Hydro', Status: 'Operating', capacity: 1800, startYear: 2008 },
    { Unit: 'Coal Mine Theta', Owner: 'DarkRock Mining', Country: 'Australia', Tracker: 'Coal', Status: 'Retired', capacity: 950, startYear: 1988 },
    { Unit: 'Battery Storage Iota', Owner: 'GridStore Inc', Country: 'USA', Tracker: 'Storage', Status: 'Operating', capacity: 200, startYear: 2022 },
    { Unit: 'Wind Turbine Kappa', Owner: 'AirFlow Energy', Country: 'Spain', Tracker: 'Wind', Status: 'Operating', capacity: 280, startYear: 2018 },
    { Unit: 'Solar Thermal Lambda', Owner: 'HeatCapture Co', Country: 'Morocco', Tracker: 'Solar', Status: 'Operating', capacity: 580, startYear: 2016 },
    { Unit: 'Gas Peaker Mu', Owner: 'PeakGen Systems', Country: 'Japan', Tracker: 'Gas', Status: 'Operating', capacity: 150, startYear: 2021 },
    { Unit: 'Geothermal Nu', Owner: 'EarthHeat Ltd', Country: 'Iceland', Tracker: 'Geothermal', Status: 'Operating', capacity: 100, startYear: 2014 },
    { Unit: 'Biomass Plant Xi', Owner: 'BioEnergy Corp', Country: 'Sweden', Tracker: 'Biomass', Status: 'Operating', capacity: 75, startYear: 2017 },
    { Unit: 'Tidal Power Omicron', Owner: 'OceanWave Inc', Country: 'Canada', Tracker: 'Tidal', Status: 'Pilot', capacity: 25, startYear: 2023 },
    { Unit: 'Floating Solar Pi', Owner: 'AquaSolar Ltd', Country: 'Singapore', Tracker: 'Solar', Status: 'Construction', capacity: 120, startYear: 2024 },
    { Unit: 'Pumped Hydro Rho', Owner: 'MountainPower', Country: 'Switzerland', Tracker: 'Hydro', Status: 'Operating', capacity: 600, startYear: 2005 },
    { Unit: 'Combined Cycle Sigma', Owner: 'EfficientGen', Country: 'USA', Tracker: 'Gas', Status: 'Operating', capacity: 850, startYear: 2015 },
    { Unit: 'Solar Park Tau', Owner: 'DesertSun Co', Country: 'UAE', Tracker: 'Solar', Status: 'Operating', capacity: 1100, startYear: 2019 },
    { Unit: 'Wind Farm Upsilon', Owner: 'PrairieWind LLC', Country: 'USA', Tracker: 'Wind', Status: 'Operating', capacity: 420, startYear: 2020 },
    { Unit: 'Coal Station Phi', Owner: 'Industrial Power', Country: 'Poland', Tracker: 'Coal', Status: 'Operating', capacity: 1400, startYear: 1992 },
    { Unit: 'Nuclear Plant Chi', Owner: 'StateNuclear', Country: 'South Korea', Tracker: 'Nuclear', Status: 'Operating', capacity: 2800, startYear: 2012 },
    { Unit: 'Waste-to-Energy Psi', Owner: 'CleanWaste Ltd', Country: 'Denmark', Tracker: 'Waste', Status: 'Operating', capacity: 60, startYear: 2018 },
    { Unit: 'Hydrogen Plant Omega', Owner: 'H2Future Inc', Country: 'Germany', Tracker: 'Hydrogen', Status: 'Announced', capacity: 300, startYear: 2026 },
  ];

  function handleRowClick(row, index) {
    console.log('Row clicked:', row, index);
  }
</script>

<svelte:head>
  <title>Data Table Demo | GEM Viz</title>
</svelte:head>

<div class="demo-page">
  <header>
    <a href="{base}/" class="back-link">← Back to GEM Viz</a>
    <h1>DATA TABLE DEMO</h1>
    <p class="subtitle">
      Feature-rich Svelte table component with sorting, filtering,
      multi-filters, pagination, and export capabilities.
    </p>
  </header>

  <main>
    <div class="selection-info">
      {#if selectedRows.length > 0}
        <strong>{selectedRows.length} rows selected</strong>
        <button class="btn-small" onclick={() => selectedRows = []}>Clear Selection</button>
      {/if}
    </div>

    <DataTable
      {columns}
      {data}
      pageSize={10}
      showGlobalSearch={true}
      showColumnFilters={true}
      showPagination={true}
      showExport={true}
      showColumnToggle={true}
      stickyHeader={true}
      striped={true}
      onRowClick={handleRowClick}
      bind:selectedRows
    />

    <section class="features">
      <h2>Features</h2>
      <div class="feature-grid">
        <div class="feature">
          <h3>Column Sorting</h3>
          <p>Click any column header to sort. Click again to reverse.</p>
        </div>
        <div class="feature">
          <h3>Per-Column Filters</h3>
          <p>Filter inputs in each column header for precise filtering.</p>
        </div>
        <div class="feature">
          <h3>Advanced Filters</h3>
          <p>Add multiple filter conditions with AND/OR logic.</p>
        </div>
        <div class="feature">
          <h3>Global Search</h3>
          <p>Search across all visible columns at once.</p>
        </div>
        <div class="feature">
          <h3>Pagination</h3>
          <p>Navigate large datasets with configurable page sizes.</p>
        </div>
        <div class="feature">
          <h3>Column Toggle</h3>
          <p>Show/hide columns to focus on what matters.</p>
        </div>
        <div class="feature">
          <h3>Row Selection</h3>
          <p>Select multiple rows for batch operations.</p>
        </div>
        <div class="feature">
          <h3>Export</h3>
          <p>Export filtered data to CSV or JSON.</p>
        </div>
      </div>
    </section>
  </main>
</div>

<style>
  .demo-page {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
    font-family: 'IBM Plex Mono', 'Fira Code', monospace;
  }

  header {
    margin-bottom: 30px;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 15px;
    color: #000;
    text-decoration: none;
    font-size: 12px;
    font-weight: 600;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  h1 {
    margin: 0 0 10px;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: 2px;
  }

  .subtitle {
    color: #666;
    font-size: 13px;
    margin: 0;
  }

  .loading, .error {
    text-align: center;
    padding: 60px 20px;
    background: #f8f8f8;
    border: 2px solid #000;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #eee;
    border-top-color: #000;
    border-radius: 50%;
    margin: 0 auto 15px;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error {
    background: #fee;
    border-color: #c00;
    color: #900;
  }

  .error button {
    margin-top: 15px;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }

  .selection-info {
    height: 30px;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }

  .btn-small {
    padding: 4px 8px;
    background: #666;
    color: #fff;
    border: none;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
  }

  .features {
    margin-top: 40px;
    padding: 30px;
    background: #f8f8f8;
    border: 2px solid #000;
  }

  .features h2 {
    margin: 0 0 25px;
    font-size: 18px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
  }

  .feature {
    background: #fff;
    padding: 15px;
    border: 1px solid #ddd;
  }

  .feature h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .feature p {
    margin: 0;
    font-size: 11px;
    color: #666;
    line-height: 1.5;
  }
</style>
