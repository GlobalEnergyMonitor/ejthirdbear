<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    subtitle = '',
    children = null,
  }: {
    title: string;
    subtitle?: string;
    children?: Snippet | null;
  } = $props();
</script>

<section class="section-header">
  <div class="section-copy">
    <h2 class="section-title">{title}</h2>
    {#if subtitle}
      <p class="section-subtitle">{subtitle}</p>
    {/if}
  </div>
  {#if children}
    <div class="section-meta">
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .section-header {
    margin: var(--space-8) 0 var(--space-4);
    padding-top: var(--space-3);
    border-top: var(--border-width) solid var(--color-border-light);
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .section-copy {
    min-width: 220px;
  }

  .section-title {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 700;
  }

  .section-subtitle {
    margin: var(--space-1) 0 0 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .section-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  @media (max-width: 768px) {
    .section-header {
      margin-top: var(--space-6);
      gap: var(--space-2);
    }

    .section-copy {
      min-width: 0;
      width: 100%;
    }

    .section-title {
      font-size: var(--font-size-base);
    }

    .section-meta {
      width: 100%;
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
