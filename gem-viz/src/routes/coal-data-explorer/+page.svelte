<script lang="ts">
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

<svelte:head>
  <title>Coal Data Explorer — GEM</title>
</svelte:head>

<div class="coal-explorer">
  <main class="explorer-main">
    <CoalQueryBuilder />
  </main>
</div>

<style>
  .coal-explorer {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    font-family: inherit;
    background: var(--gem-warm-white, #fffffe);
  }

  .explorer-main {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }
</style>
