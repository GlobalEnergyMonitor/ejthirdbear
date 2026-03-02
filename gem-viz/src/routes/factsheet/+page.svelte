<script lang="ts">
  /**
   * Factsheet index - redirect to default tracker
   */
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { link, factsheetLink } from '$lib/links';

  const trackers = [
    { slug: 'coal-mine', name: 'Coal Mine', available: true },
    { slug: 'coal-plant', name: 'Coal Plant', available: false },
    { slug: 'gas-plant', name: 'Gas Plant', available: false },
    { slug: 'steel-plant', name: 'Steel Plant', available: false },
  ];

  onMount(() => {
    // Auto-redirect to first available tracker
    goto(factsheetLink('Coal Mine'), { replaceState: true });
  });
</script>

<svelte:head>
  <title>Dataset Factsheets — Global Energy Monitor</title>
  <meta
    name="description"
    content="Explore detailed field-level documentation for each tracker dataset including Coal Plants, Gas Plants, Steel Plants, and more."
  />
</svelte:head>

<div class="page">
  <header>
    <nav class="breadcrumb">
      <a href={link('index')}>Home</a> /
      <a href={link('explore')}>Explore</a> / Factsheets
    </nav>
    <h1>Dataset Factsheets</h1>
    <p class="lead">Explore field metadata and data distributions for GEM trackers.</p>
  </header>

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
  .page {
    max-width: 800px;
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

  h1 {
    font-size: var(--font-size-3xl);
    margin: 0 0 var(--space-2) 0;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-accent);
  }

  h2 {
    font-size: var(--font-size-xl);
    text-transform: uppercase;
    color: var(--color-accent);
    margin: 0 0 var(--space-3) 0;
  }

  .lead {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
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
