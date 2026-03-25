<script>
  /**
   * Embed Layout
   * Minimal chrome for embeddable widgets - no nav, no footer, just the viz.
   * Delegates to EmbedShell for postMessage/resize/theme/branding logic.
   */
  import '../../app.css';
  import EmbedShell from '$lib/components/nav/EmbedShell.svelte';
  import { page } from '$app/stores';

  let { children } = $props();

  // Extract embed options from URL params
  const theme = $derived($page.url.searchParams.get('theme') || 'light');
  const padding = $derived($page.url.searchParams.get('padding') || '16');
  const autoHeight = $derived($page.url.searchParams.get('autoHeight') !== 'false');
  const embedId = $derived($page.url.searchParams.get('embedId') || '');
  const branding = $derived($page.url.searchParams.get('branding') === 'true');
  const linkBase = $derived($page.url.searchParams.get('linkBase') || '');
  const linkTarget = $derived($page.url.searchParams.get('linkTarget') || '_blank');
</script>

<EmbedShell {theme} {padding} {autoHeight} {embedId} {branding} {linkBase} {linkTarget}>
  {@render children()}
</EmbedShell>
