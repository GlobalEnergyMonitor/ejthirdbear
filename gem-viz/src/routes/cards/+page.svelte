<script lang="ts">
  /**
   * PROJECT CARDS PAGE
   * Showcase of ProjectCard and ProjectCardList components
   * Based on Observable notebook: https://observablehq.com/d/b73714688f61ab19
   */
  import { link } from '$lib/links';
  import ProjectCardList from '$lib/components/ProjectCardList.svelte';

  // Filter state
  let selectedTracker = $state<string | null>('Coal Plant');

  const trackers = [
    { value: 'Coal Plant', label: 'Coal Plants' },
    { value: 'Gas Plant', label: 'Gas Plants' },
    { value: 'Steel Plant', label: 'Steel Plants' },
    { value: 'Gas Pipeline', label: 'Gas Pipelines' },
    { value: 'Iron Mine', label: 'Iron Mines' },
    { value: 'Bioenergy Power', label: 'Bioenergy' },
  ];
</script>

<svelte:head>
  <title>Asset Cards — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse energy assets as visual cards showing key information about ownership, status, and location."
  />
</svelte:head>

<div class="page">
  <header>
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> /
      <a href={link('explore')}>Explore</a> / Cards
    </nav>
    <h1>Project Cards</h1>
    <p class="lead">
      Expandable cards showing detailed asset information. Click a card to expand and see ownership,
      capacity percentiles, age, emissions, and more.
    </p>
  </header>

  <!-- Tracker Filter -->
  <section class="filter-bar">
    <span class="filter-label">Filter by tracker:</span>
    <div class="filter-chips">
      {#each trackers as tracker}
        <button
          class="chip"
          class:active={selectedTracker === tracker.value}
          onclick={() => (selectedTracker = tracker.value)}
        >
          {tracker.label}
        </button>
      {/each}
    </div>
  </section>

  <!-- Card Lists -->
  <div class="card-grid">
    {#if selectedTracker === 'Coal Plant'}
      <ProjectCardList
        title="Largest Proposed Coal Plants"
        description="The 5 largest proposed (announced, pre-permit, permitted, construction) coal units globally"
        tracker="Coal Plant"
        statusFilter={['announced', 'pre-permit', 'permitted', 'construction']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Operating Coal Plants"
        description="The 5 largest operating coal units globally by capacity"
        tracker="Coal Plant"
        statusFilter={['operating']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Cancelled/Shelved Projects"
        description="The 5 largest cancelled or shelved coal plant projects"
        tracker="Coal Plant"
        statusFilter={['cancelled', 'shelved']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Retired/Mothballed Units"
        description="The 5 largest retired or mothballed coal units"
        tracker="Coal Plant"
        statusFilter={['retired', 'mothballed']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />
    {:else}
      <ProjectCardList
        title="Largest Proposed"
        description="Top 5 proposed assets by capacity"
        tracker={selectedTracker}
        statusFilter={['proposed', 'announced', 'pre-permit', 'permitted', 'construction']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Operating"
        description="Top 5 operating assets by capacity"
        tracker={selectedTracker}
        statusFilter={['operating']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Cancelled / Retired"
        description="Top 5 cancelled, shelved, or retired assets"
        tracker={selectedTracker}
        statusFilter={['cancelled', 'shelved', 'retired', 'mothballed']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />
    {/if}
  </div>

  <footer class="page-footer">
    <p>
      Project cards display asset data from GEM trackers. Cards can be embedded in reports,
      articles, and search results.
    </p>
    <a href={link('explore')}>Back to Explore</a>
  </footer>
</div>

<style>
  .page {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }

  header {
    margin-bottom: var(--space-8);
  }

  .breadcrumb {
    font-size: var(--font-size-body);
    margin-bottom: var(--space-3);
  }

  .breadcrumb a {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: var(--font-size-3xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-accent);
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    max-width: 600px;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-bottom: var(--space-8);
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: var(--font-size-body);
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    color: var(--color-text-secondary);
  }

  .filter-chips {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .chip {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-body);
    border: var(--border-width) solid var(--color-border);
    background: var(--color-white);
    cursor: pointer;
    transition: all var(--transition-fast);
    border-radius: var(--radius-md);
  }

  .chip:hover {
    border-color: var(--color-gray-500);
  }

  .chip.active {
    background: var(--color-accent);
    color: var(--color-white);
    border-color: var(--color-accent);
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: var(--space-8);
    margin-bottom: var(--space-12);
  }

  @media (max-width: 500px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }

  .page-footer {
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-5);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .page-footer a {
    color: var(--color-link);
  }
</style>
