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

<div
  class="embed-container"
  class:dark={theme === 'dark'}
  style="padding: {padding}px;"
>
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
</style>
