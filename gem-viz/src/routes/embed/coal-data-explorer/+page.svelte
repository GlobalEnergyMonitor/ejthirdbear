<script lang="ts">
  /**
   * Embeddable Coal Data Explorer
   * Renders the full CoalQueryBuilder in embed mode.
   *
   * URL params (passed through to CoalQueryState):
   *   tracker          - coal-plant, coal-mine (comma-separated)
   *   filter.status    - operating, construction, etc.
   *   filter.country_area - China, India, etc.
   *   filter.*         - any coal-field-schema filter key
   *   groupBy          - comma-separated field keys
   *   aggregate        - e.g. sum:capacity_mw,avg:plant_age_years
   *   granularity      - project or unit
   *   view             - table, cards, summary
   *
   * Embed params (handled by EmbedShell via layout):
   *   theme, padding, autoHeight, embedId, branding, linkBase, linkTarget
   */
  import { onMount, setContext } from 'svelte';
  import { page } from '$app/stores';
  import { CoalQueryState, COAL_QUERY_KEY } from '$lib/state/coal-query.svelte';
  import CoalQueryBuilder from '$lib/components/coal/CoalQueryBuilder.svelte';

  const coalState = new CoalQueryState();
  setContext(COAL_QUERY_KEY, coalState);

  onMount(() => {
    coalState.init($page.url.searchParams);
  });
</script>

<CoalQueryBuilder />
