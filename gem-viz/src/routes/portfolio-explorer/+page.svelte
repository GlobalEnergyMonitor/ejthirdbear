<script>
  /**
   * Portfolio Explorer — Route wrapper
   * Shows owner search by default; auto-opens modal if `entity` URL param is set.
   * Syncs search query and selected entity back to URL via replaceState.
   */
  import { page } from '$app/stores';
  import OwnerSearchApp from '$lib/components/portfolio/OwnerSearchApp.svelte';

  const initialQuery = $page.url.searchParams.get('q') || '';
  const initialEntityId = $page.url.searchParams.get('entity') || '';

  /** @param {{ q?: string, entity?: string }} state */
  function handleStateChange({ q, entity } = {}) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    if (entity) url.searchParams.set('entity', entity);
    else url.searchParams.delete('entity');
    if (url.toString() !== window.location.href) {
      history.replaceState(null, '', url);
    }
  }
</script>

<svelte:head>
  <title>Portfolio Explorer — Global Energy Monitor</title>
  <meta
    name="description"
    content="Search for an owner and explore their downstream asset portfolio with interactive ownership breakdowns."
  />
</svelte:head>

<div class="page-wrap">
  <div class="page-header">
    <h1>Portfolio Explorer</h1>
    <p class="page-desc">Search for an owner to explore their full downstream asset portfolio.</p>
  </div>
  <OwnerSearchApp {initialQuery} {initialEntityId} onStateChange={handleStateChange} />
</div>

<style>
  .page-wrap {
    max-width: 860px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-5);
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-header h1 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
  }

  .page-desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin: 0;
  }
</style>
