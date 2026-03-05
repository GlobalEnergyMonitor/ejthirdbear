<script lang="ts">
  /**
   * PageHeader — standardized page header with breadcrumbs, title, and optional lead text.
   * Replaces 10+ inline header patterns across pages.
   */
  import { type Snippet } from 'svelte';

  let {
    breadcrumbs = [],
    title,
    lead = '',
    children,
  }: {
    breadcrumbs?: { label: string; href?: string }[];
    title: string;
    lead?: string;
    children?: Snippet;
  } = $props();
</script>

<header class="page-header">
  {#if breadcrumbs.length > 0}
    <nav class="page-header__breadcrumb" aria-label="Breadcrumb">
      {#each breadcrumbs as crumb, i}
        {#if i > 0}
          <span class="page-header__sep">/</span>
        {/if}
        {#if crumb.href}
          <a href={crumb.href}>{crumb.label}</a>
        {:else}
          <span>{crumb.label}</span>
        {/if}
      {/each}
    </nav>
  {/if}
  <h1>{title}</h1>
  {#if lead}
    <p class="lead">{lead}</p>
  {/if}
  {#if children}
    {@render children()}
  {/if}
</header>

<style>
  .page-header {
    margin-bottom: var(--space-10);
  }

  .page-header__breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: var(--space-3);
  }

  .page-header__breadcrumb a {
    color: var(--gem-navy);
    text-decoration: none;
  }

  .page-header__breadcrumb a:hover {
    text-decoration: underline;
  }

  .page-header__sep {
    color: var(--color-text-tertiary);
  }

  h1 {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0 0 var(--space-3) 0;
  }
</style>
