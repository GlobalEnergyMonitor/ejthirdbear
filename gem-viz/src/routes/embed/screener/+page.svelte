<script lang="ts">
  /**
   * Embed entry point for Asset Class Screener.
   * Reads hash state and redirects to /screener?embed=true with classes param.
   * This keeps the canonical URL clean for Drupal while using the real screener flow.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { readScreenerHash, buildScreenerUrl } from '$lib/screener-url';

  let redirectError = $state('');

  onMount(() => {
    try {
      const h = readScreenerHash();
      const url = buildScreenerUrl('screener', {
        classes: h.classes || undefined,
        owners: h.owners || undefined,
      });
      goto(url + (url.includes('?') ? '&' : '?') + 'embed=true', { replaceState: true });
    } catch (err) {
      redirectError = err instanceof Error ? err.message : 'Failed to load screener';
    }
  });
</script>

<svelte:head>
  <title>Asset Class Screener — GEM</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if redirectError}
  <div class="embed-error">
    <p>Unable to load screener</p>
    <p class="embed-hint">{redirectError}</p>
  </div>
{:else}
  <div
    style="padding: 2rem; color: var(--color-text-tertiary); font-family: var(--font-family); font-size: 0.875rem;"
  >
    Loading screener…
  </div>
{/if}
