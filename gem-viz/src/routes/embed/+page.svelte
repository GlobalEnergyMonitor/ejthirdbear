<script lang="ts">
  /**
   * Widget Embed Showcase
   * Live specimens of every embeddable widget with copy-paste embed codes.
   * Shadow DOM only — no iframes.
   */
  import { browser } from '$app/environment';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import { link } from '$lib/links';

  const ORIGIN = browser ? window.location.origin : 'https://gem-viz.fly.dev';

  interface WidgetSpec {
    slug: string;
    name: string;
    description: string;
    dataSrc: string;
    height?: number;
  }

  const widgets: WidgetSpec[] = [
    {
      slug: 'entity',
      name: 'Entity Card',
      description: 'Company profile with ownership flower and asset list',
      dataSrc: '/embed/entity?id=E100000000650',
      height: 600,
    },
    {
      slug: 'asset',
      name: 'Asset Card',
      description: 'Asset profile with owners and metadata',
      dataSrc: '/embed/asset?id=G100000109409',
      height: 500,
    },
    {
      slug: 'ownership-flower',
      name: 'Ownership Flower',
      description: 'Radial ownership diagram for an entity',
      dataSrc: '/embed/ownership-flower?ownerId=E100000000650',
      height: 500,
    },
    {
      slug: 'ownership-graph',
      name: 'Control Chain',
      description: 'Interactive ownership tree (upstream or downstream)',
      dataSrc: '/embed/ownership-graph?entityId=E100000000650&direction=down',
      height: 600,
    },
    {
      slug: 'controlchain',
      name: 'Control Chain Search',
      description: 'Full search + ownership tree flow',
      dataSrc: '/embed/controlchain',
      height: 700,
    },
    {
      slug: 'coal-plant',
      name: 'Coal Plant Card',
      description: 'Rich 6-tab coal plant detail card',
      dataSrc: '/embed/coal-plant?id=L100000104107',
      height: 600,
    },
    {
      slug: 'project-card',
      name: 'Project Card',
      description: 'Tabbed asset detail card (any tracker)',
      dataSrc: '/embed/project-card?id=G100000109409',
      height: 500,
    },
    {
      slug: 'asset-ring',
      name: 'Asset Ring',
      description: 'Circular asset distribution visualization',
      dataSrc: '/embed/asset-ring?entityId=E100000000650',
      height: 500,
    },
    {
      slug: 'ultimate-owners',
      name: 'Ultimate Owners',
      description: 'Ultimate beneficial owners at top of chain',
      dataSrc: '/embed/ultimate-owners?entityId=E100000000650',
      height: 400,
    },
    {
      slug: 'network-3d',
      name: '3D Network Graph',
      description: 'Force-directed ownership network',
      dataSrc: '/embed/network-3d?entityId=E100000000650',
      height: 500,
    },
    {
      slug: 'asset-search',
      name: 'Asset Search',
      description: 'Search bar for assets',
      dataSrc: '/embed/asset-search',
      height: 300,
    },
    {
      slug: 'tracker-factsheet',
      name: 'Tracker Factsheet',
      description: 'Field metadata explorer for a tracker',
      dataSrc: '/embed/tracker-factsheet?tracker=coal-plant',
      height: 500,
    },
    {
      slug: 'coal-data-explorer',
      name: 'Coal Data Explorer',
      description: 'Interactive coal plant data query builder',
      dataSrc: '/embed/coal-data-explorer',
      height: 600,
    },
    {
      slug: 'screener',
      name: 'Asset Class Screener',
      description: 'Multi-step asset class screening tool',
      dataSrc: '/embed/screener',
      height: 700,
    },
    {
      slug: 'portfolio-explorer',
      name: 'Portfolio Explorer',
      description: 'Search for an owner to explore their downstream asset portfolio',
      dataSrc: '/embed/portfolio-explorer',
      height: 500,
    },
  ];

  let copiedSlug = $state<string | null>(null);

  function embedCode(w: WidgetSpec): string {
    // eslint-disable-next-line no-useless-escape -- `<\/script>` escape prevents an enclosing <script> tag from closing if this string is ever inlined as script source
    return `<!-- Custom Element (recommended) -->\n<gem-embed src="${w.dataSrc}" height="${w.height || 500}"></gem-embed>\n\n<!-- Class-based (CMS fallback) -->\n<div class="gem-embed" data-src="${w.dataSrc}" data-height="${w.height || 500}"></div>\n\n<script src="${ORIGIN}/embed.js"><\/script>`;
  }

  function copyCode(w: WidgetSpec) {
    navigator.clipboard.writeText(embedCode(w));
    copiedSlug = w.slug;
    setTimeout(() => {
      if (copiedSlug === w.slug) copiedSlug = null;
    }, 2000);
  }
</script>

<svelte:head>
  <title>Widget Embeds — Global Energy Monitor</title>
  <meta
    name="description"
    content="Copy-paste embed codes for GEM ownership visualizations. Shadow DOM widgets — no iframes."
  />
  <!-- Load embed.js exactly as an external page would — full dogfooding -->
  <script src="/embed.js"></script>
</svelte:head>

<div class="page-container--wide">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'Embeds' }]}
    title="Widget Embeds"
    lead="Shadow DOM widgets for embedding on any page. Copy the embed code and paste into your CMS."
  />

  <p class="intro">
    All widgets render via Shadow DOM — no iframes. CSS is isolated from the host page. Each widget
    loads on-demand when scrolled into view. Use the <code>&lt;gem-embed&gt;</code> Custom Element
    or the class-based <code>&lt;div class="gem-embed"&gt;</code> for CMS environments that strip unknown
    tags.
  </p>

  <div class="widget-grid">
    {#each widgets as w}
      <section class="widget-card" id={w.slug}>
        <div class="widget-header">
          <h2>{w.name}</h2>
          <p class="widget-desc">{w.description}</p>
        </div>

        <div class="widget-specimen">
          <div class="gem-embed" data-src={w.dataSrc} data-height={String(w.height || 500)}></div>
        </div>

        <div class="widget-code">
          <pre><code>{embedCode(w)}</code></pre>
          <button class="copy-btn" onclick={() => copyCode(w)}>
            {copiedSlug === w.slug ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .intro {
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
    margin-bottom: var(--space-8);
    max-width: 60ch;
  }

  .widget-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  .widget-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
  }

  .widget-header {
    padding: var(--space-4) var(--space-6);
    border-bottom: 1px solid var(--color-border-light);
    background: var(--color-bg-secondary);
  }

  .widget-header h2 {
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin: 0 0 var(--space-1) 0;
  }

  .widget-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .widget-specimen {
    padding: var(--space-4);
    min-height: 200px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .widget-code {
    position: relative;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-tertiary);
    border-top: 1px solid var(--color-border-light);
  }

  .widget-code pre {
    margin: 0;
    overflow-x: auto;
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    line-height: 1.4;
    color: var(--color-text-secondary);
  }

  .copy-btn {
    position: absolute;
    top: var(--space-2);
    right: var(--space-3);
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: 500;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .copy-btn:hover {
    border-color: var(--gem-navy);
    color: var(--gem-navy);
  }
</style>
