<script lang="ts">
  import { page } from '$app/state';
  import { onMount } from 'svelte';

  let { children } = $props();

  // Read embed config from URL params
  const params = $derived(page.url?.searchParams);
  const theme = $derived(params?.get('theme') ?? 'light');
  const padding = $derived(params?.get('padding') ?? '16');
  const maxWidth = $derived(params?.get('maxWidth') ?? '100%');
  const autoHeight = $derived(params?.get('autoHeight') !== 'false');

  let container: HTMLElement;

  onMount(() => {
    if (!autoHeight) return;

    // Post height to parent for iframe resizing
    const observer = new ResizeObserver(() => {
      const height = container.scrollHeight;
      window.parent.postMessage({ type: 'coalwire-resize', height }, '*');
    });

    observer.observe(container);
    return () => observer.disconnect();
  });
</script>

<div
  bind:this={container}
  class="embed-shell"
  class:dark={theme === 'dark'}
  style:padding="{padding}px"
  style:max-width={maxWidth}
>
  {@render children()}
</div>

<style>
  .embed-shell {
    margin: 0;
    box-sizing: border-box;
    font-family: var(--font-family);
    color: var(--color-text-primary);
    background: transparent;
    width: 100%;
  }

  .embed-shell.dark {
    color: var(--color-gray-200);
    background: var(--gem-navy);
  }

  .embed-shell.dark :global(mark) {
    background: #5c4b00;
    color: var(--color-bg-primary);
  }

  :global(body) {
    margin: 0;
    overflow-x: hidden;
  }
</style>
