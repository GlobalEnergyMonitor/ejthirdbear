<script>
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { link } from '$lib/links';
  import PageHeader from '$lib/components/nav/PageHeader.svelte';
  import SeoMeta from '$lib/components/nav/SeoMeta.svelte';
  import ControlChainApp from '$lib/components/controlchain/ControlChainApp.svelte';

  const initialQuery = $page.url.searchParams.get('q') || '';
  const initialType = 'assets';

  function onStateChange(q, type) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type && type !== 'all') params.set('type', type);
    const qs = params.toString();
    goto(`${link('controlchain')}${qs ? `?${qs}` : ''}`, { replaceState: true, keepFocus: true });
  }
</script>

<svelte:head>
  <title>GEM ControlChain — Global Energy Monitor</title>
  <SeoMeta
    title="GEM ControlChain — Global Energy Monitor"
    description="Explore ownership structures for energy assets worldwide. Search for any asset to see who controls it."
  />
</svelte:head>

<div class="controlchain-page">
  <PageHeader
    breadcrumbs={[{ label: 'Home', href: link('index') }, { label: 'ControlChain' }]}
    title="GEM ControlChain"
    lead="Explore ownership structures for energy assets worldwide. Search for any asset to trace who controls it."
  />

  <ControlChainApp {initialQuery} {initialType} {onStateChange} />
</div>

<style>
  .controlchain-page {
    width: 100%;
    max-width: var(--container-xl);
    margin: 0 auto;
    padding: var(--space-10) var(--space-5);
    font-family: var(--font-family-sans);
  }
</style>
