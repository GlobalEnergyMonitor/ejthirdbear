<script lang="ts">
  /**
   * PROJECT CARDS PAGE
   * Showcase of ProjectCard and ProjectCardList components
   * Based on Observable notebook: https://observablehq.com/d/b73714688f61ab19
   */
  import { link } from '$lib/links';
  import { TRACKERS } from '$lib/data-config/tracker-schema';
  import ProjectCardList from '$lib/components/cards/ProjectCardList.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';

  // Filter state
  let selectedTracker = $state<string>(TRACKERS[3]); // Default to 'Coal Plant'

  const trackers = TRACKERS.map((t) => ({ value: t, label: t + 's' }));

  // Status groups for card lists
  const proposedStatuses = ['announced', 'proposed', 'pre-permit', 'permitted', 'construction'];
  const operatingStatuses = ['operating'];
  const cancelledStatuses = ['cancelled', 'shelved'];
  const retiredStatuses = ['retired', 'mothballed'];
</script>

<svelte:head>
  <title>Asset Cards — Global Energy Monitor</title>
  <meta
    name="description"
    content="Browse energy assets as visual cards showing key information about ownership, status, and location."
  />
</svelte:head>

<div class="page-container--xl">
  <PageHeader
    breadcrumbs={[
      { label: 'Home', href: link('index') },
      { label: 'Explore', href: link('explore') },
      { label: 'Cards' },
    ]}
    title="Project Cards"
    lead="Browse assets across all GEM trackers. Click a card to expand and see ownership, size, age, status, and tracker-specific details."
  />

  <!-- Tracker Filter -->
  <section class="filter-bar">
    <span class="filter-label">Filter by tracker:</span>
    <div class="filter-chips">
      {#each trackers as tracker}
        <button
          class="chip"
          class:chip--selected={selectedTracker === tracker.value}
          onclick={() => (selectedTracker = tracker.value)}
        >
          {tracker.label}
        </button>
      {/each}
    </div>
  </section>

  <!-- Card Lists -->
  <div class="card-grid">
    {#key selectedTracker}
      <ProjectCardList
        title="Largest Proposed {selectedTracker}s"
        description="The 5 largest proposed (announced, pre-permit, permitted, construction) {selectedTracker.toLowerCase()}s globally"
        tracker={selectedTracker}
        statusFilter={proposedStatuses}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Operating {selectedTracker}s"
        description="The 5 largest operating {selectedTracker.toLowerCase()}s globally by capacity"
        tracker={selectedTracker}
        statusFilter={operatingStatuses}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Cancelled/Shelved {selectedTracker}s"
        description="The 5 largest cancelled or shelved {selectedTracker.toLowerCase()} projects"
        tracker={selectedTracker}
        statusFilter={cancelledStatuses}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />

      <ProjectCardList
        title="Largest Retired/Mothballed {selectedTracker}s"
        description="The 5 largest retired or mothballed {selectedTracker.toLowerCase()}s"
        tracker={selectedTracker}
        statusFilter={retiredStatuses}
        sortBy="capacity"
        sortOrder="desc"
        limit={5}
        variant="compact"
      />
    {/key}
  </div>

  <footer class="page-back-footer">
    <p>
      Project cards display asset data from GEM trackers. Cards can be embedded in reports,
      articles, and search results.
    </p>
    <a href={link('explore')}>Back to Explore</a>
  </footer>
</div>

<style>
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
</style>
