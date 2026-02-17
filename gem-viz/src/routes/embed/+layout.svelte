<script>
  /**
   * Embed Layout
   * Minimal chrome for embeddable widgets - no nav, no footer, just the viz
   */
  import '../../app.css';
  import { page } from '$app/stores';

  let { children } = $props();

  // Extract embed options from URL params
  const theme = $derived($page.url.searchParams.get('theme') || 'light');
  const padding = $derived($page.url.searchParams.get('padding') || '16');
</script>

<div class="embed-container" class:dark={theme === 'dark'} style="padding: {padding}px;">
  {@render children()}
</div>

<style>
  .embed-container {
    min-height: 100vh;
    background: var(--color-bg-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  /* Future dark mode support */
  .embed-container.dark {
    --color-bg-primary: var(--color-gray-900);
    --color-bg-secondary: var(--color-gray-800);
    --color-text-primary: var(--color-gray-100);
    --color-text-secondary: var(--color-gray-400);
    --color-border: var(--color-gray-700);
  }

  /* Reset any app-level styles that might leak in */
  :global(.embed-container *) {
    box-sizing: border-box;
  }

  /* ── Shared embed states (loading / error / hint / empty) ── */
  :global(.embed-loading) {
    padding: var(--space-5);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
  }

  :global(.embed-error) {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  :global(.embed-error p) {
    margin: 0 0 var(--space-2) 0;
  }

  :global(.embed-error code) {
    font-family: var(--font-family-mono);
    background: var(--color-bg-primary);
    padding: 2px 6px;
  }

  :global(.embed-hint) {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  :global(.embed-empty) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
  }
</style>
