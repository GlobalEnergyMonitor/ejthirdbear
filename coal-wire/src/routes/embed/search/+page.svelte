<script lang="ts">
  /**
   * Embed: Search Widget
   *
   * URL params:
   *   q           - initial search query
   *   limit       - max results (default 10)
   *   tuner       - show search style + filter controls (true/false)
   *   compact     - compact mode (true/false)
   *   placeholder - custom placeholder text
   *   theme       - light/dark
   *   padding     - padding in px
   *   maxWidth    - max container width
   */
  import { page } from '$app/state';
  import EmbedShell from '$lib/components/EmbedShell.svelte';
  import SearchWidget from '$lib/components/SearchWidget.svelte';

  const params = $derived(page.url?.searchParams);
</script>

<EmbedShell>
  <SearchWidget
    initialQuery={params?.get('q') ?? ''}
    limit={parseInt(params?.get('limit') ?? '10')}
    showTuner={params?.get('tuner') !== 'false'}
    compact={params?.get('compact') === 'true'}
    placeholder={params?.get('placeholder') ?? 'Search Coal Wire…'}
  />
</EmbedShell>
