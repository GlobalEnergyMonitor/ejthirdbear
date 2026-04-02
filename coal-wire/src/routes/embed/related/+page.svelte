<script lang="ts">
  /**
   * Embed: Related Articles
   *
   * URL params:
   *   q         - search query to find related articles
   *   id        - article ID for "similar to this" mode
   *   limit     - max results (default 5)
   *   title     - widget title
   *   compact   - compact mode
   *   theme     - light/dark
   *   padding   - padding in px
   */
  import { page } from '$app/state';
  import EmbedShell from '$lib/components/EmbedShell.svelte';
  import RelatedArticles from '$lib/components/RelatedArticles.svelte';

  const params = $derived(page.url?.searchParams);
</script>

<EmbedShell>
  <RelatedArticles
    query={params?.get('q') ?? ''}
    articleId={params?.get('id') ? parseInt(params.get('id')!) : null}
    limit={parseInt(params?.get('limit') ?? '5')}
    title={params?.get('title') ?? 'Related from Coal Wire'}
    compact={params?.get('compact') === 'true'}
  />
</EmbedShell>
