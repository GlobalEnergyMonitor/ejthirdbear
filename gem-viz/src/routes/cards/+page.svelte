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
    { value: 'Coal Mine', label: 'Coal Mines' },
    { value: 'Gas Plant', label: 'Gas Plants' },
    { value: 'Steel Plant', label: 'Steel Plants' },
  ];
</script>

<svelte:head>
  <title>Project Cards - GEM Viz</title>
</svelte:head>

<main>
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
    {:else if selectedTracker === 'Coal Mine'}
      <ProjectCardList
        title="Largest Proposed Coal Mines"
        description="The 5 largest proposed coal mine projects globally"
        tracker="Coal Mine"
        statusFilter={['proposed', 'announced', 'pre-permit', 'permitted', 'construction']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Operating Coal Mines"
        description="The 5 largest operating coal mines globally by capacity"
        tracker="Coal Mine"
        statusFilter={['operating']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Cancelled/Shelved Mine Projects"
        description="The 5 largest cancelled or shelved coal mine projects"
        tracker="Coal Mine"
        statusFilter={['cancelled', 'shelved']}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />
    {:else}
      <ProjectCardList
        title="Largest Assets"
        description="Top 10 assets by capacity"
        tracker={selectedTracker}
        sortBy="capacity"
        sortOrder="desc"
        limit={10}
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
</main>

<style>
  main {
    width: 100%;
    max-width: 1400px;
    margin: 0 auto;
    padding: 40px 20px;
    font-family: system-ui, sans-serif;
  }

  header {
    margin-bottom: 32px;
  }

  .breadcrumb {
    font-size: 12px;
    margin-bottom: 12px;
  }

  .breadcrumb a {
    color: #333;
    text-decoration: none;
  }

  .breadcrumb a:hover {
    text-decoration: underline;
  }

  h1 {
    font-size: 32px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #004a63;
  }

  .lead {
    font-size: 14px;
    color: #666;
    margin: 0;
    max-width: 600px;
  }

  .filter-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }

  .filter-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 6px 12px;
    font-size: 12px;
    border: 1px solid #ddd;
    background: #fff;
    cursor: pointer;
    transition: all 0.15s;
    border-radius: 4px;
  }

  .chip:hover {
    border-color: #999;
  }

  .chip.active {
    background: #004a63;
    color: #fff;
    border-color: #004a63;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 32px;
    margin-bottom: 48px;
  }

  @media (max-width: 500px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }

  .page-footer {
    border-top: 1px solid #ddd;
    padding-top: 20px;
    font-size: 12px;
    color: #666;
  }

  .page-footer a {
    color: #016b83;
  }
</style>
