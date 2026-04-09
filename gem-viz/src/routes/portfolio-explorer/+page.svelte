<script>
  /**
   * Portfolio Explorer — Route wrapper
   * Reads URL params and passes them to the reusable core component.
   * Handles URL ↔ state sync (component is URL-agnostic for widget compatibility).
   */
  import { page } from '$app/stores';
  import PortfolioExplorer from '$lib/components/portfolio/PortfolioExplorer.svelte';
  import { LAYOUT } from '$lib/responsive';

  const entityId = $page.url.searchParams.get('entity') || '';
  const hidePicker = $page.url.searchParams.get('hidePicker') === 'true';
  const isEmbed = $page.url.searchParams.get('embed') === 'true';
  const initialColor = $page.url.searchParams.get('color') || '';
  const initialFilters = {
    country: $page.url.searchParams.get('country') || '',
    asset_type: $page.url.searchParams.get('asset_type') || '',
    operating_status: $page.url.searchParams.get('operating_status') || '',
    intermediary: $page.url.searchParams.get('intermediary') || '',
    ownership: $page.url.searchParams.get('ownership') || '',
  };
  /** In embed mode the navbar is hidden, so subtract less chrome height */
  const heightOffset = isEmbed
    ? LAYOUT.portfolio.embedHeightOffset
    : LAYOUT.portfolio.defaultHeightOffset;

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

<PortfolioExplorer {entityId} {hidePicker} {heightOffset} {initialColor} {initialFilters} onStateChange={handleStateChange} />
