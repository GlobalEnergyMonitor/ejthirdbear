<script lang="ts">
  /**
   * PROJECT CARDS PAGE
   * Showcase of ProjectCard and ProjectCardList components
   * Based on Observable notebook: https://observablehq.com/d/b73714688f61ab19
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link } from '$lib/links';
  import { TRACKERS } from '$lib/data-config/tracker-schema';
  import ProjectCardList from '$lib/components/cards/ProjectCardList.svelte';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';

  // Filter state — read from URL, fall back to Coal Plant
  const trackerParam = $derived($page.url.searchParams.get('tracker'));
  const resolvedTracker = $derived(
    trackerParam && (TRACKERS as readonly string[]).includes(trackerParam)
      ? trackerParam
      : TRACKERS[3]
  );
  let selectedTracker = $state<string>(TRACKERS[3]);

  // Sync URL → state when param changes (e.g. back/forward nav)
  $effect(() => {
    selectedTracker = resolvedTracker;
  });

  function selectTracker(tracker: string) {
    selectedTracker = tracker;
    const url = new URL($page.url);
    url.searchParams.set('tracker', tracker);
    goto(url.pathname + url.search, { replaceState: true, noScroll: true, keepFocus: true });
  }

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
  <SeoMeta
    title="Asset Cards — Global Energy Monitor"
    description="Browse energy assets as visual cards showing key information about ownership, status, and location."
    image="/og/cards.png"
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
          onclick={() => selectTracker(tracker.value)}
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

  @media (max-width: 640px) {
    .card-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
