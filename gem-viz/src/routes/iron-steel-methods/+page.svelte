<script lang="ts">
  import { browser } from '$app/environment';
  import IronSteelMethodsWidget from '$lib/components/iron-steel/IronSteelMethodsWidget.svelte';
</script>

<svelte:head>
  <title>Iron & Steel Production Methods — Global Energy Monitor</title>
  <meta
    name="description"
    content="Explore iron and steelmaking capacity by technology type and operating status across countries and regions."
  />
</svelte:head>

<div class="page-wrap">
  <div class="page-header">
    <h1>Iron &amp; Steel Production Methods</h1>
    <p class="page-desc">
      Ironmaking and steelmaking capacity by technology type and operating status.
      Select a country or region to filter, or view global totals.
    </p>
  </div>

  {#if browser}
    <IronSteelMethodsWidget />
  {/if}
</div>

<style>
  .page-wrap {
    max-width: 1000px;
    margin: 0 auto;
    padding: var(--space-8, 40px) var(--space-5, 20px);
  }

  .page-header {
    margin-bottom: var(--space-7, 32px);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl, 28px);
    font-weight: var(--font-weight-bold, 700);
    color: var(--color-text-primary, #1a2c3a);
    margin: 0 0 8px;
  }

  .page-desc {
    font-size: var(--font-size-sm, 14px);
    color: var(--color-text-secondary, #5a7080);
    margin: 0;
    max-width: 60ch;
    line-height: 1.5;
  }
</style>
