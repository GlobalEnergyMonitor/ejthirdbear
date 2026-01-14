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
  <title>Dataset Factsheets - GEM Viz</title>
</svelte:head>

<main>
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
</main>

<style>
  main {
    max-width: 800px;
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

  h1 {
    font-size: 32px;
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #004a63;
  }

  h2 {
    font-size: 16px;
    text-transform: uppercase;
    color: #004a63;
    margin: 0 0 12px 0;
  }

  .lead {
    font-size: 14px;
    color: #666;
    margin: 0;
  }

  .tracker-list ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .tracker-list li {
    padding: 8px 0;
    border-bottom: 1px solid #eee;
  }

  .tracker-list a {
    color: #016b83;
    text-decoration: none;
    font-weight: 500;
  }

  .tracker-list a:hover {
    text-decoration: underline;
  }

  .unavailable {
    color: #999;
  }

  .redirect-notice {
    color: #666;
    font-style: italic;
    margin-top: 24px;
  }
</style>
