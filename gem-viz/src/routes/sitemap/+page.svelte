<script>
  /**
   * SITEMAP PAGE
   * Complete directory of all pages and routes in GEM Viz
   */
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  const sections = [
    {
      title: 'Main',
      routes: [
        { path: '/', name: 'Home', description: 'Landing page with key statistics' },
        { path: '/explore', name: 'Explore', description: 'Search and browse the database' },
        { path: '/about', name: 'About', description: 'About GEM Viz and data sources' },
      ],
    },
    {
      title: 'Report Tools',
      routes: [
        {
          path: '/screener',
          name: 'Screener',
          description: 'Asset-class screener for building reports',
        },
        {
          path: '/screener/results',
          name: 'Screener Results',
          description: 'View matched owners from screener',
        },
        {
          path: '/screener/owners',
          name: 'Owner Search',
          description: 'Search for specific owners',
        },
        { path: '/screener/visualize', name: 'Visualize', description: 'Visualization tools' },
        {
          path: '/report',
          name: 'Report',
          description: 'Build a report from selected assets and entities',
        },
        { path: '/compose', name: 'Compose', description: 'Build custom queries' },
      ],
    },
    {
      title: 'Asset & Entity Pages',
      routes: [
        { path: '/compose', name: 'Asset Filter', description: 'Filter and explore assets' },
        {
          path: '/asset/[id]',
          name: 'Asset Detail',
          description: 'Individual asset page (e.g. /asset/G100000109409)',
        },
        {
          path: '/entity/[id]',
          name: 'Entity Detail',
          description: 'Individual entity page (e.g. /entity/E100001000348)',
        },
      ],
    },
    {
      title: 'Visualizations',
      routes: [
        {
          path: '/controlchain',
          name: 'GEM ControlChain',
          description: 'Search assets/entities and explore ownership trees',
        },
        {
          path: '/network',
          name: 'Ownership Network',
          description: 'Full ownership network graph',
        },
        { path: '/globe', name: 'Globe', description: '3D globe visualization' },
        { path: '/cards', name: 'Cards', description: 'Card-based view' },
      ],
    },
    {
      title: 'Reference',
      routes: [
        {
          path: '/fieldguide',
          name: 'Tracker FieldGuide',
          description: 'Tracker field-level documentation',
        },
        {
          path: '/fieldguide/[tracker]',
          name: 'Tracker FieldGuide Detail',
          description: 'Individual tracker field documentation',
        },
        { path: '/factsheet', name: 'Factsheets (legacy)', description: 'Redirects to FieldGuide' },
        { path: '/presets', name: 'Presets', description: 'Saved query presets' },
        {
          path: '/manifest',
          name: 'Data Manifest',
          description: 'Data files and schema documentation',
        },
        {
          path: '/kitchen-sink',
          name: 'Kitchen Sink',
          description: 'Component library with live examples',
        },
      ],
    },
    {
      title: 'Embeds',
      description: 'Embeddable widgets for external use',
      routes: [
        { path: '/embed', name: 'Embed Index', description: 'Overview of available embeds' },
        { path: '/embed/asset', name: 'Asset Embed', description: 'Embed an asset card' },
        { path: '/embed/entity', name: 'Entity Embed', description: 'Embed an entity card' },
        {
          path: '/embed/coal-plant',
          name: 'Coal Plant Card',
          description: 'Rich coal plant detail card with 6 tabs',
        },
        {
          path: '/embed/viz',
          name: 'Modular Embed',
          description: 'Generic embed for modular visualizations',
        },
        {
          path: '/embed/asset-ring',
          name: 'Asset Ring',
          description: 'Circular asset visualization',
        },
        { path: '/embed/network-3d', name: '3D Network', description: '3D ownership network' },
        {
          path: '/embed/ownership-flower',
          name: 'Ownership Flower',
          description: 'Radial ownership diagram',
        },
        {
          path: '/embed/ownership-graph',
          name: 'Control Chain',
          description: 'Interactive control chain tree',
        },
        {
          path: '/embed/tracker-factsheet',
          name: 'Tracker Factsheet',
          description: 'Embeddable tracker stats',
        },
        {
          path: '/embed/ultimate-owners',
          name: 'Ultimate Owners',
          description: 'Ultimate beneficial owners widget',
        },
      ],
    },
  ];

  const totalRoutes = sections.reduce((sum, s) => sum + s.routes.length, 0);
</script>

<svelte:head>
  <title>Sitemap — GEM Viz</title>
  <meta name="description" content="Complete directory of all pages in GEM Viz" />
  <SeoMeta title="Sitemap — GEM Viz" description="Complete directory of all pages in GEM Viz" />
</svelte:head>

<div class="page-container--narrow">
  <PageHeader title="Sitemap" lead="{totalRoutes} pages" />

  <div class="sections">
    {#each sections as section}
      <section>
        <h2>{section.title}</h2>
        {#if section.description}
          <p class="section-desc">{section.description}</p>
        {/if}
        <ul>
          {#each section.routes as route}
            <li>
              <a href={route.path.includes('[') ? '#' : route.path}>
                <span class="route-name">{route.name}</span>
                <span class="route-path">{route.path}</span>
              </a>
              <span class="route-desc">{route.description}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--space-10);
  }

  section h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .section-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-4) 0;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    padding: var(--space-3) 0;
    border-bottom: 1px solid var(--color-border);
  }

  li:last-child {
    border-bottom: none;
  }

  li a {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    text-decoration: none;
    color: inherit;
  }

  li a:hover .route-name {
    text-decoration: underline;
  }

  .route-name {
    font-weight: 500;
    color: var(--color-black);
  }

  .route-path {
    font-family: var(--font-family-data);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .route-desc {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: var(--space-1);
  }

  @media (max-width: 640px) {
    li a {
      flex-direction: column;
      gap: 0;
    }

    .route-path {
      margin-top: 2px;
    }
  }
</style>
