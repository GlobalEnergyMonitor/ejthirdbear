<script>
  /**
   * EXPLORE - Entry point to GEM's coal infrastructure data
   *
   * This is the "front door" - showcasing what's available and providing
   * curated starting points for exploration.
   */
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { encodeFilters, getAssetClasses, deleteAssetClass } from '$lib/filter-state';

  // User-created asset classes (loaded from localStorage)
  let userClasses = $state([]);

  onMount(() => {
    userClasses = getAssetClasses();
  });

  function handleDelete(id) {
    if (confirm('Delete this saved query?')) {
      deleteAssetClass(id);
      userClasses = getAssetClasses();
    }
  }

  // Featured queries - from GEM's Boom and Bust report framing
  const featured = [
    {
      id: 'global-pipeline',
      name: 'The Global Coal Plant Pipeline',
      description:
        'All capacity under development — from announced projects through construction. Ten countries account for 96% of coal power under development.',
      filters: {
        trackers: ['Coal Plant'],
        statuses: ['announced', 'pre-permit', 'permitted', 'construction'],
      },
      stat: '~500 GW',
      statLabel: 'under development',
    },
    {
      id: 'china-fleet',
      name: 'China: 55% of Global Coal Power',
      description:
        'Home to 69% of all capacity under development. In 2024, 94.5 GW moved into construction — the highest level since 2015.',
      filters: {
        trackers: ['Coal Plant'],
        countries: ['China'],
      },
      stat: '1,100+ GW',
      statLabel: 'operating capacity',
    },
    {
      id: 'retirements',
      name: 'Permanently Decommissioned',
      description:
        'Units that have been retired. Outside China, retirements (22.8 GW) exceeded commissioning (13.5 GW) in 2024 — a net decrease of 9.2 GW.',
      filters: {
        trackers: ['Coal Plant'],
        statuses: ['retired'],
      },
      stat: '25.2 GW',
      statLabel: 'retired in 2024',
    },
  ];

  // Quick queries organized by GEM's key analytical angles
  const queryCategories = [
    {
      question: 'Where is capacity being commissioned?',
      subtext: 'China and India account for 92% of newly proposed capacity in 2024',
      queries: [
        {
          id: 'china',
          name: 'China',
          description: '30.5 GW commissioned in 2024',
          filters: {
            trackers: ['Coal Plant'],
            countries: ['China'],
          },
        },
        {
          id: 'india',
          name: 'India',
          description: '38 GW newly proposed in 2024',
          filters: {
            trackers: ['Coal Plant'],
            countries: ['India'],
          },
        },
        {
          id: 'southeast-asia',
          name: 'Southeast Asia',
          description: 'Indonesia, Vietnam, Bangladesh',
          filters: {
            trackers: ['Coal Plant'],
            countries: ['Indonesia', 'Vietnam', 'Bangladesh', 'Philippines', 'Thailand'],
          },
        },
      ],
    },
    {
      question: 'Where are retirements outpacing commissioning?',
      subtext: 'Outside China, coal capacity decreased by 9.2 GW in 2024',
      queries: [
        {
          id: 'eu',
          name: 'European Union',
          description: '11 GW retired in 2024 (4x over 2023)',
          filters: {
            trackers: ['Coal Plant'],
            countries: [
              'Germany',
              'Poland',
              'Italy',
              'Spain',
              'Czech Republic',
              'Netherlands',
              'Greece',
              'Romania',
              'Bulgaria',
              'France',
            ],
          },
        },
        {
          id: 'us',
          name: 'United States',
          description: '4.7 GW retired in 2024',
          filters: {
            trackers: ['Coal Plant'],
            countries: ['United States'],
          },
        },
        {
          id: 'phase-out',
          name: 'Countries with Coal Phase-out',
          description: 'UK, Portugal, Austria, Belgium, Sweden',
          filters: {
            trackers: ['Coal Plant'],
            countries: ['United Kingdom', 'Portugal', 'Austria', 'Belgium', 'Sweden'],
          },
        },
      ],
    },
    {
      question: 'Pre-construction pipeline',
      subtext: 'Projects moving from announcement through permitting',
      queries: [
        {
          id: 'announced',
          name: 'Announced',
          description: 'In corporate/government plans',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['announced'],
          },
        },
        {
          id: 'pre-permit',
          name: 'Pre-permit Development',
          description: 'Seeking permits, financing, or land',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['pre-permit'],
          },
        },
        {
          id: 'permitted',
          name: 'Permitted',
          description: 'All permits secured',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['permitted'],
          },
        },
      ],
    },
    {
      question: 'Construction and operation',
      subtext: '44.1 GW commissioned globally in 2024 — lowest in 20 years',
      queries: [
        {
          id: 'construction',
          name: 'Under Construction',
          description: 'Site preparation underway',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['construction'],
          },
        },
        {
          id: 'operating',
          name: 'Operating',
          description: 'Formally commissioned units',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['operating'],
          },
        },
        {
          id: 'large',
          name: '1 GW+ Capacity',
          description: 'Largest generating units',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['operating'],
            capacityMin: 1000,
          },
        },
      ],
    },
    {
      question: 'Stalled and inactive',
      subtext: 'Projects that have stopped progressing or been deactivated',
      queries: [
        {
          id: 'shelved',
          name: 'Shelved',
          description: 'No activity for 2+ years',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['shelved'],
          },
        },
        {
          id: 'cancelled',
          name: 'Cancelled',
          description: 'Discontinued or 4+ years inactive',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['cancelled'],
          },
        },
        {
          id: 'mothballed',
          name: 'Mothballed',
          description: 'Deactivated but not retired',
          filters: {
            trackers: ['Coal Plant'],
            statuses: ['mothballed'],
          },
        },
      ],
    },
  ];

  function getComposeUrl(filters) {
    const encoded = encodeFilters({
      trackers: filters.trackers || [],
      trackersAnd: [],
      statuses: filters.statuses || [],
      statusesAnd: [],
      countries: filters.countries || [],
      countriesAnd: [],
      ownerCountries: [],
      ownerCountriesAnd: [],
      owners: [],
      ownersAnd: [],
      capacityMin: filters.capacityMin || null,
      capacityMax: filters.capacityMax || null,
      shareMin: null,
      shareMax: null,
      startYearMin: null,
      startYearMax: null,
      logic: 'AND',
      search: '',
    });
    return `${base}/compose?${encoded}`;
  }
</script>

<svelte:head>
  <title>Global Coal Plant Tracker - GEM Viz</title>
</svelte:head>

<main>
  <header class="page-header">
    <p class="source-label">Data from Global Energy Monitor</p>
    <h1>Global Coal Plant Tracker</h1>
    <p class="lead">
      Tracking every coal-fired generating unit worldwide — from announced projects through
      commissioning and retirement. Data from GEM's
      <a
        href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/"
        target="_blank"
        rel="noopener">Global Coal Plant Tracker</a
      >, updated bi-annually.
    </p>
    <p class="data-note">
      Statistics from <a
        href="https://globalenergymonitor.org/report/boom-and-bust-coal-2025/"
        target="_blank"
        rel="noopener">Boom and Bust Coal 2025</a
      >
    </p>
  </header>

  <!-- Featured queries - big cards -->
  <section class="featured">
    {#each featured as item}
      <a href={getComposeUrl(item.filters)} class="featured-card">
        <div class="featured-content">
          <h2>{item.name}</h2>
          <p>{item.description}</p>
        </div>
        <div class="featured-stat">
          <span class="stat-value">{item.stat}</span>
          <span class="stat-label">{item.statLabel}</span>
        </div>
      </a>
    {/each}
  </section>

  <!-- Quick queries by analytical angle -->
  <section class="query-categories">
    {#each queryCategories as category}
      <div class="category">
        <div class="category-header">
          <h2>{category.question}</h2>
          {#if category.subtext}
            <p class="category-subtext">{category.subtext}</p>
          {/if}
        </div>
        <div class="query-row">
          {#each category.queries as query}
            <a href={getComposeUrl(query.filters)} class="query-card">
              <h3>{query.name}</h3>
              <p>{query.description}</p>
            </a>
          {/each}
        </div>
      </div>
    {/each}
  </section>

  <!-- User's saved queries -->
  {#if userClasses.length > 0}
    <section class="saved-queries">
      <h2>Your Saved Queries</h2>
      <div class="saved-grid">
        {#each userClasses as ac}
          <div class="saved-card">
            <a href={getComposeUrl(ac.filters)} class="saved-link">
              <h3>{ac.name}</h3>
              {#if ac.description}
                <p>{ac.description}</p>
              {/if}
            </a>
            <button class="delete-btn" onclick={() => handleDelete(ac.id)}>Remove</button>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <!-- Tools in this app -->
  <section class="tools-section">
    <h2>Tools</h2>
    <div class="tools-grid">
      <a href="{base}/compose" class="tool-card">
        <h3>Query Builder</h3>
        <p>Filter by country, status, capacity, ownership. Save queries for later.</p>
      </a>
      <a href="{base}/explore" class="tool-card">
        <h3>Dashboard</h3>
        <p>Live statistics on status distribution, top owners, country breakdown.</p>
      </a>
      <a href="{base}/report" class="tool-card">
        <h3>Report Generator</h3>
        <p>Export filtered data as PDF reports or CSV for further analysis.</p>
      </a>
      <a href="{base}/network" class="tool-card">
        <h3>Ownership Network</h3>
        <p>Visualize ownership relationships between entities and assets.</p>
      </a>
    </div>
  </section>

  <!-- GEM Resources -->
  <section class="resources-section">
    <h2>GEM Resources</h2>
    <p class="resources-intro">
      This tool visualizes data from Global Energy Monitor's trackers. For the complete dataset and
      methodology, visit GEM directly.
    </p>
    <div class="resources-grid">
      <div class="resource-group">
        <h3>Coal Plant Tracker</h3>
        <ul>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/summary-tables/"
              target="_blank"
              rel="noopener">Summary Tables</a
            > — Capacity by country, status, year
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/dashboard/"
              target="_blank"
              rel="noopener">Dashboard</a
            > — Interactive maps and charts
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/download-data/"
              target="_blank"
              rel="noopener">Download Data</a
            > — Full dataset (CSV, Excel)
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/methodology/"
              target="_blank"
              rel="noopener">Methodology</a
            > — Status definitions, data sources
          </li>
        </ul>
      </div>
      <div class="resource-group">
        <h3>Reports & Analysis</h3>
        <ul>
          <li>
            <a
              href="https://globalenergymonitor.org/report/boom-and-bust-coal-2025/"
              target="_blank"
              rel="noopener">Boom and Bust Coal 2025</a
            > — Annual pipeline analysis
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-plant-tracker/coal-phaseout-tracking-retirements-and-paris-aligned-goals/"
              target="_blank"
              rel="noopener">Coal Phaseout Tracker</a
            > — Paris-aligned retirement tracking
          </li>
          <li>
            <a href="https://www.gem.wiki/Global_Coal_Plant_Tracker" target="_blank" rel="noopener"
              >GEM Wiki</a
            > — Detailed pages for each plant
          </li>
        </ul>
      </div>
      <div class="resource-group">
        <h3>Related Trackers</h3>
        <ul>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-coal-mine-tracker/"
              target="_blank"
              rel="noopener">Global Coal Mine Tracker</a
            >
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-steel-plant-tracker/"
              target="_blank"
              rel="noopener">Global Steel Plant Tracker</a
            >
          </li>
          <li>
            <a
              href="https://globalenergymonitor.org/projects/global-gas-plant-tracker/"
              target="_blank"
              rel="noopener">Global Gas Plant Tracker</a
            >
          </li>
        </ul>
      </div>
    </div>
  </section>

  <!-- Attribution -->
  <footer class="page-footer">
    <p>
      Data: <a href="https://globalenergymonitor.org/" target="_blank" rel="noopener"
        >Global Energy Monitor</a
      >
      ·
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener"
        >CC BY 4.0</a
      > · Updated bi-annually
    </p>
  </footer>
</main>

<style>
  main {
    padding: 40px 20px 80px;
    max-width: 1000px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 48px;
    text-align: center;
  }

  .source-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--color-gray-500);
    margin: 0 0 8px 0;
  }

  h1 {
    font-size: 36px;
    margin: 0 0 16px 0;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .lead {
    font-size: 16px;
    color: var(--color-gray-600);
    margin: 0 auto;
    line-height: 1.6;
    max-width: 600px;
  }

  .lead a {
    color: var(--color-black);
    text-decoration: underline;
  }

  .data-note {
    font-size: 12px;
    color: var(--color-gray-400);
    margin: 12px 0 0 0;
  }

  .data-note a {
    color: var(--color-gray-500);
  }

  /* Featured cards - big hero queries */
  .featured {
    display: grid;
    gap: 16px;
    margin-bottom: 64px;
  }

  .featured-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 28px 32px;
    background: var(--color-black);
    color: white;
    text-decoration: none;
    transition:
      transform 0.15s,
      box-shadow 0.15s;
  }

  .featured-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .featured-content h2 {
    font-size: 22px;
    margin: 0 0 8px 0;
    font-weight: 600;
  }

  .featured-content p {
    font-size: 14px;
    margin: 0;
    opacity: 0.8;
    max-width: 400px;
  }

  .featured-stat {
    text-align: right;
    flex-shrink: 0;
    margin-left: 24px;
  }

  .stat-value {
    display: block;
    font-size: 28px;
    font-weight: 700;
    font-family: var(--font-mono, monospace);
  }

  .stat-label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.7;
  }

  /* Query categories - organized by question */
  .query-categories {
    margin-bottom: 64px;
  }

  .category {
    margin-bottom: 40px;
  }

  .category-header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border);
  }

  .category h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-black);
    margin: 0;
  }

  .category-subtext {
    font-size: 13px;
    color: var(--color-gray-500);
    margin: 4px 0 0 0;
  }

  .query-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }

  .query-card {
    display: block;
    padding: 20px;
    border: 1px solid var(--color-border);
    background: white;
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .query-card:hover {
    border-color: var(--color-black);
    box-shadow: 3px 3px 0 var(--color-gray-200);
  }

  .query-card h3 {
    font-size: 16px;
    margin: 0 0 6px 0;
    font-weight: 600;
  }

  .query-card p {
    font-size: 13px;
    margin: 0;
    color: var(--color-gray-500);
  }

  /* Saved queries section */
  .saved-queries {
    margin-bottom: 64px;
    padding: 24px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
  }

  .saved-queries h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-gray-500);
    margin: 0 0 16px 0;
  }

  .saved-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .saved-card {
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid var(--color-border);
  }

  .saved-link {
    display: block;
    padding: 16px;
    text-decoration: none;
    color: inherit;
    flex: 1;
  }

  .saved-link:hover {
    background: var(--color-gray-50);
  }

  .saved-card h3 {
    font-size: 14px;
    margin: 0 0 4px 0;
    font-weight: 600;
  }

  .saved-card p {
    font-size: 12px;
    margin: 0;
    color: var(--color-gray-500);
  }

  .delete-btn {
    padding: 8px;
    border: none;
    border-top: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-gray-400);
    font-size: 11px;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .delete-btn:hover {
    background: var(--color-gray-100);
    color: var(--color-gray-600);
  }

  /* Tools section */
  .tools-section {
    margin-bottom: 48px;
  }

  .tools-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-gray-500);
    margin: 0 0 16px 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--color-border);
  }

  .tools-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .tool-card {
    padding: 20px;
    border: 1px solid var(--color-border);
    background: white;
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .tool-card:hover {
    border-color: var(--color-black);
    box-shadow: 3px 3px 0 var(--color-gray-200);
  }

  .tool-card h3 {
    font-size: 14px;
    margin: 0 0 6px 0;
    font-weight: 600;
  }

  .tool-card p {
    font-size: 12px;
    margin: 0;
    color: var(--color-gray-500);
    line-height: 1.4;
  }

  /* Resources section */
  .resources-section {
    margin-bottom: 48px;
    padding: 32px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
  }

  .resources-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-gray-500);
    margin: 0 0 8px 0;
  }

  .resources-intro {
    font-size: 14px;
    color: var(--color-gray-600);
    margin: 0 0 24px 0;
  }

  .resources-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }

  .resource-group h3 {
    font-size: 13px;
    font-weight: 600;
    margin: 0 0 12px 0;
    color: var(--color-black);
  }

  .resource-group ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .resource-group li {
    font-size: 13px;
    margin-bottom: 8px;
    line-height: 1.4;
  }

  .resource-group a {
    color: var(--color-black);
    text-decoration: underline;
  }

  .resource-group li a:first-child {
    font-weight: 500;
  }

  /* Footer */
  .page-footer {
    text-align: center;
    padding-top: 32px;
    border-top: 1px solid var(--color-border);
  }

  .page-footer p {
    font-size: 12px;
    color: var(--color-gray-400);
    margin: 0;
  }

  .page-footer a {
    color: var(--color-gray-500);
  }

  @media (max-width: 768px) {
    .featured-card {
      flex-direction: column;
      align-items: flex-start;
      gap: 16px;
    }

    .featured-stat {
      text-align: left;
      margin-left: 0;
    }

    .query-row {
      grid-template-columns: 1fr;
    }

    .saved-grid {
      grid-template-columns: 1fr;
    }

    .tools-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .resources-grid {
      grid-template-columns: 1fr;
      gap: 24px;
    }
  }
</style>
