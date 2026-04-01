<script lang="ts">
  /**
   * GemCoalDataExplorer — Shadow DOM widget for coal data query builder.
   * Mirrors embed/coal-data-explorer/+page.svelte.
   */
  import { onMount, setContext } from 'svelte';
  import { CoalQueryState, COAL_QUERY_KEY } from '$lib/state/coal-query.svelte';
  import CoalQueryBuilder from '$lib/components/coal/CoalQueryBuilder.svelte';

  interface Props {
    tracker?: string;
    theme?: 'light' | 'dark';
    [key: string]: unknown;
  }

  let { tracker = 'coal-plant', theme = 'light', ...restProps }: Props = $props();

  const coalState = new CoalQueryState();
  setContext(COAL_QUERY_KEY, coalState);

  onMount(() => {
    // Build URLSearchParams from widget props to initialize the state
    const params = new URLSearchParams();
    if (tracker) params.set('tracker', tracker);
    // Pass through any filter.* props
    for (const [k, v] of Object.entries(restProps)) {
      if (v != null && k !== 'theme') params.set(k, String(v));
    }
    coalState.init(params);
  });
</script>

<div class="coal-embed" class:dark={theme === 'dark'}>
  <CoalQueryBuilder />
</div>

<style>
  .coal-embed {
    width: 100%;
    font-family: var(--font-family);
  }
</style>
