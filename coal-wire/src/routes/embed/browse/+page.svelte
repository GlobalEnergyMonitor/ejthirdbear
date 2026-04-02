<script lang="ts">
  /**
   * Embed: Issue Browser
   *
   * URL params:
   *   limit   - number of issues to show (default 15)
   *   title   - widget title
   *   compact - compact mode
   *   theme   - light/dark
   *   padding - padding in px
   */
  import { page } from '$app/state';
  import EmbedShell from '$lib/components/EmbedShell.svelte';
  import BrowseWidget from '$lib/components/BrowseWidget.svelte';

  const params = $derived(page.url?.searchParams);
</script>

<EmbedShell>
  <BrowseWidget
    limit={parseInt(params?.get('limit') ?? '15')}
    title={params?.get('title') ?? 'Coal Wire Archive'}
    compact={params?.get('compact') === 'true'}
  />
</EmbedShell>
