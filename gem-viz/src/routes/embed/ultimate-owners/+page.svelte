<script>
  /**
   * Embeddable Ultimate Owners
   * Standalone route for embedding the ultimate owners visualization
   *
   * URL params:
   *   entityId - Required. Entity ID to display
   */
  import { page } from '$app/stores';
  import UltimateOwners from '$lib/components/UltimateOwners.svelte';

  const entityId = $derived($page.url.searchParams.get('entityId'));
</script>

<svelte:head>
  <title>Ultimate Owners — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if entityId}
  <div class="ultimate-owners-embed">
    <UltimateOwners {entityId} />
  </div>
{:else}
  <div class="error">
    <p>Missing required parameter: <code>entityId</code></p>
    <p class="hint">Example: ?entityId=E12345</p>
  </div>
{/if}

<style>
  .ultimate-owners-embed {
    width: 100%;
    max-width: 600px;
  }

  .error {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  .error p {
    margin: 0 0 var(--space-2) 0;
  }

  .error code {
    font-family: var(--font-family-mono);
    background: var(--color-bg-primary);
    padding: 2px 6px;
  }

  .hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }
</style>
