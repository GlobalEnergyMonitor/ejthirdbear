<script lang="ts">
  /**
   * Factsheet index - redirect to default tracker
   */
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { link, fieldguideLink, factsheetLink } from '$lib/links';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import { TRACKER_TO_URL_SLUG } from '$lib/data-config/tracker-schema';

  const trackers = Object.entries(TRACKER_TO_URL_SLUG).map(([name, slug]) => ({
    slug, name, available: true,
  }));

  onMount(() => {
    // Redirect to new FieldGuide page
    goto(fieldguideLink(), { replaceState: true });
  });
</script>

<svelte:head>
  <title>Dataset Factsheets — Global Energy Monitor</title>
  <meta
    name="description"
    content="Explore detailed field-level documentation for each tracker dataset including Coal Plants, Gas Plants, Steel Plants, and more."
  />
</svelte:head>

<div class="page-container--narrow">
  <PageHeader
    breadcrumbs={[
      { label: 'Home', href: link('index') },
      { label: 'Explore', href: link('explore') },
      { label: 'Factsheets' },
    ]}
    title="Dataset Factsheets"
    lead="Explore field metadata and data distributions for GEM trackers."
  />

  <section class="tracker-list">
    <h2>Available Trackers</h2>
    <ul>
      {#each trackers as tracker}
        <li>
          {#if tracker.available}
            <a href={factsheetLink(tracker.name)}>{tracker.name}</a>
          {:else}
            <span class="unavailable">{tracker.name} (coming soon)</span>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <p class="redirect-notice">Redirecting to Coal Mine factsheet...</p>
</div>

<style>
  h2 {
    font-size: var(--font-size-xl);
    text-transform: uppercase;
    color: var(--color-accent);
    margin: 0 0 var(--space-3) 0;
  }

  .tracker-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .tracker-list li {
    padding: var(--space-2) 0;
    border-bottom: var(--border-width) solid var(--color-gray-100);
  }

  .tracker-list a {
    color: var(--color-link);
    text-decoration: none;
    font-weight: 500;
  }

  .tracker-list a:hover {
    text-decoration: underline;
  }

  .unavailable {
    color: var(--color-text-tertiary);
  }

  .redirect-notice {
    color: var(--color-text-secondary);
    font-style: italic;
    margin-top: var(--space-6);
  }
</style>
