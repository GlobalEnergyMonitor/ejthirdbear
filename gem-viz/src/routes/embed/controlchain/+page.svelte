<script>
  /**
   * Embeddable ControlChain — full search + results + ownership tree modal.
   * State is stored in window.location.hash so Drupal never sees URL changes,
   * and deep-links are shareable via the iframe hash.
   *
   * URL params (initial state, overridden by hash if present):
   *   q    - Initial search query
   *   type - Initial search type; currently coerced to "assets"
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import ControlChainApp from '$lib/components/controlchain/ControlChainApp.svelte';
  import { readHash, writeHash } from '../embed-utils';

  const qParam = $page.url.searchParams.get('q') || '';
  const typeParam = 'assets';

  let initialQuery = $state(qParam);
  let initialType = $state(typeParam);
  let mounted = $state(false);

  function handleStateChange(q, type) {
    writeHash({ q: q || null, type: type !== 'all' ? type : null });
  }

  onMount(() => {
    const h = readHash();
    initialQuery = h.q || qParam;
    initialType = 'assets';
    mounted = true;
  });
</script>

<svelte:head>
  <title>ControlChain — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="cc-embed-wrap">
  {#if mounted}
    <ControlChainApp {initialQuery} {initialType} onStateChange={handleStateChange} />
  {/if}
</div>

<style>
  .cc-embed-wrap {
    width: 100%;
    padding: var(--space-4);
    box-sizing: border-box;
  }
</style>
