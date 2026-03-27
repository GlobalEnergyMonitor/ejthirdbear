<script>
  /**
   * ScreenerLayout - Common layout wrapper for all screener pages
   * Provides consistent header, step navigation, and styling with animation support
   *
   * @example
   * <ScreenerLayout currentStep={1} subtitle="Select your criteria">
   *   {#snippet headerRight()}
   *     <SelectedClassesBadge />
   *   {/snippet}
   *   <MyContent />
   * </ScreenerLayout>
   */

  import { page } from '$app/stores';
  import ScreenerStepNav from './ScreenerStepNav.svelte';

  /**
   * @type {{
   *   currentStep?: 1 | 2 | 3 | 4,
   *   subtitle?: string,
   *   showStepNav?: boolean,
   *   isEmbed?: boolean,
   *   classesParam?: string,
   *   ownersParam?: string,
   *   maxWidth?: 'narrow' | 'default' | 'wide',
   *   children?: import('svelte').Snippet,
   *   headerContent?: import('svelte').Snippet,
   *   headerRight?: import('svelte').Snippet,
   *   footer?: import('svelte').Snippet,
   * }}
   */
  let {
    currentStep = 1,
    subtitle = '',
    showStepNav = true,
    isEmbed = false,
    classesParam = '',
    ownersParam = '',
    maxWidth = 'default',
    children,
    headerContent,
    headerRight,
    footer,
  } = $props();

  // Derive classesParam from URL if not provided
  const derivedClassesParam = $derived(classesParam || $page.url.searchParams.get('classes') || '');

  const maxWidthClass = $derived(
    maxWidth === 'narrow' ? 'max-w-narrow' : maxWidth === 'wide' ? 'max-w-wide' : ''
  );
</script>

<main class="screener-page">
  <div class="screener-layout {maxWidthClass}">
    {#if showStepNav}
      <ScreenerStepNav {currentStep} classesParam={derivedClassesParam} {ownersParam} {isEmbed} />
    {/if}

    <header class="screener-header">
      <div class="header-content">
        {#if subtitle}
          <p class="subtitle">{subtitle}</p>
        {/if}
        {#if headerContent}
          {@render headerContent()}
        {/if}
      </div>
      <div class="header-right">
        {#if headerRight}
          {@render headerRight()}
        {/if}
      </div>
    </header>

    <div class="screener-content">
      {#if children}
        {@render children()}
      {/if}
    </div>

    {#if footer}
      <footer class="screener-footer">
        {@render footer()}
      </footer>
    {/if}
  </div>
</main>

<style>
  .screener-page {
    min-height: 100vh;
    background: var(--color-bg-primary);
  }

  .screener-layout {
    max-width: 960px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-8) 80px;
  }

  .screener-layout.max-w-narrow {
    max-width: 800px;
  }

  .screener-layout.max-w-wide {
    max-width: 1100px;
  }

  .screener-header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-8);
    align-items: start;
    margin-bottom: var(--space-10);
  }

  .header-content {
    min-width: 0; /* Prevent overflow */
  }

  .subtitle {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: var(--line-height-relaxed);
    max-width: 560px;
  }

  .header-right {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-3);
    align-items: start;
  }

  .screener-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-12);
  }

  /* Animate content when step changes */
  :global(.screener-content > *) {
    animation: fadeSlideIn 0.3s ease-out;
  }

  @keyframes fadeSlideIn {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .screener-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--color-bg-primary);
    border-top: var(--border-width) solid var(--color-border);
    padding: var(--space-4) var(--space-8);
    animation: footerSlideUp 0.4s var(--ease-out-back);
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
    z-index: 100;
  }

  @keyframes footerSlideUp {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (max-width: 640px) {
    .screener-layout {
      padding: var(--space-8) var(--space-5) 80px;
    }

    .screener-header {
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    .header-right {
      grid-auto-flow: row;
      width: 100%;
    }

    .screener-footer {
      padding: var(--space-3) var(--space-5);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.screener-content > *) {
      animation: none;
    }

    .screener-footer {
      animation: none;
    }
  }
</style>
