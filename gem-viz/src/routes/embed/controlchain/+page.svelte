<script>
  /**
   * Embeddable ControlChain — full search + results + ownership tree modal.
   * State is stored in window.location.hash so Drupal never sees URL changes,
   * and deep-links are shareable via the iframe hash.
   *
   * URL params (initial state, overridden by hash if present):
   *   q    - Initial search query
   *   type - Initial search type: "all" | "assets" | "entities" (default: "all")
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ControlChainApp from '$lib/components/controlchain/ControlChainApp.svelte';

  const qParam = $page.url.searchParams.get('q') || '';
  const typeParam = $page.url.searchParams.get('type') || 'all';

  let initialQuery = $state(qParam);
  let initialType = $state(typeParam);
  let mounted = $state(false);

  function readHash() {
    if (typeof window === 'undefined') return {};
    const raw = window.location.hash.slice(1);
    if (!raw) return {};
    return Object.fromEntries(new URLSearchParams(raw));
  }

  function writeHash(q, type) {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (type && type !== 'all') p.set('type', type);
    const s = p.toString();
    history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
  }

  onMount(() => {
    const h = readHash();
    initialQuery = h.q || qParam;
    initialType = h.type || typeParam;
    mounted = true;
  });
</script>

<svelte:head>
  <title>ControlChain — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="cc-embed-wrap">
  {#if mounted}
    <ControlChainApp {initialQuery} {initialType} onStateChange={writeHash} />
  {/if}
</div>

<style>
  .cc-embed-wrap {
    width: 100%;
    padding: var(--space-4);
    box-sizing: border-box;
  }
</style>
