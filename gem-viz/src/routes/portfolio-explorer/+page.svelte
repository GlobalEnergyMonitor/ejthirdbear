<script>
  /**
   * Portfolio Explorer — Route wrapper
   * Reads URL params and passes them to the reusable core component.
   */
  import { page } from '$app/stores';
  import PortfolioExplorer from '$lib/components/portfolio/PortfolioExplorer.svelte';

  const entityId = $page.url.searchParams.get('entity') || '';
  const hidePicker = $page.url.searchParams.get('hidePicker') === 'true';
</script>

<svelte:head>
  <title>Portfolio Explorer — Global Energy Monitor</title>
  <meta name="description" content="Explore an entity's downstream asset portfolio with interactive ownership tree and crossfilter breakdowns." />
</svelte:head>

<PortfolioExplorer {entityId} {hidePicker} />
