<script>
  /**
   * Portfolio Explorer — Route wrapper
   * Reads URL params and passes them to the reusable core component.
   * Handles URL ↔ state sync (component is URL-agnostic for widget compatibility).
   */
  import { page } from '$app/stores';
  import PortfolioExplorer from '$lib/components/portfolio/PortfolioExplorer.svelte';

  const entityId = $page.url.searchParams.get('entity') || '';
  const hidePicker = $page.url.searchParams.get('hidePicker') === 'true';

  /** Sync component state → URL via replaceState */
  function handleStateChange(state) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    // Entity
    if (state.entity) url.searchParams.set('entity', state.entity);
    else url.searchParams.delete('entity');
    // Color override
    if (state.color) url.searchParams.set('color', state.color);
    else url.searchParams.delete('color');
    // Filters
    const filterKeys = ['country', 'asset_type', 'operating_status', 'intermediary', 'ownership'];
    for (const key of filterKeys) {
      if (state.filters?.[key]) url.searchParams.set(key, state.filters[key]);
      else url.searchParams.delete(key);
    }
    if (url.toString() !== window.location.href) {
      history.replaceState(null, '', url);
    }
  }
</script>

<svelte:head>
  <title>Portfolio Explorer — Global Energy Monitor</title>
  <meta name="description" content="Explore an entity's downstream asset portfolio with interactive ownership tree and crossfilter breakdowns." />
</svelte:head>

<PortfolioExplorer {entityId} {hidePicker} onStateChange={handleStateChange} />
