<script lang="ts">
  /**
   * SeoMeta — OpenGraph + Twitter Card meta tags
   * Drop into any <svelte:head> or use the defaults from +layout.svelte
   */
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  let {
    title = 'Global Energy Monitor — Ownership Data Explorer',
    description = 'Explore ownership networks, filter assets by class and status, and export data across 8 energy trackers and 19,000+ assets worldwide.',
    image = '/og/default.png',
    type = 'website',
    twitterCard = 'summary_large_image',
  } = $props<{
    title?: string;
    description?: string;
    image?: string;
    type?: string;
    twitterCard?: string;
  }>();

  const canonicalUrl = $derived($page.url.href);
  const imageUrl = $derived(
    image.startsWith('http') ? image : `${$page.url.origin}${base}${image}`
  );
</script>

<!-- OpenGraph -->
<meta property="og:type" content={type} />
<meta property="og:title" content={title} />
<meta property="og:description" content={description} />
<meta property="og:image" content={imageUrl} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content={canonicalUrl} />
<meta property="og:site_name" content="GEM Viz — Global Energy Monitor" />

<!-- Twitter Card -->
<meta name="twitter:card" content={twitterCard} />
<meta name="twitter:title" content={title} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={imageUrl} />

<!-- Canonical -->
<link rel="canonical" href={canonicalUrl} />
