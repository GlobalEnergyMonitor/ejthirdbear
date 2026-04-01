<script>
  /**
   * Embeddable Portfolio Explorer
   * Renders the full portfolio explorer inside the embed shell.
   * Reads entity ID from URL param or hash, pre-selects it, hides picker by default.
   *
   * URL params (overridable via hash):
   *   id         - Required. Entity ID (e.g. E100001000347)
   *   hidePicker - Hide entity selector bar (default: true)
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { readHash } from '../embed-utils';

  let entityId = $state($page.url.searchParams.get('id') || '');
  let hidePicker = $state($page.url.searchParams.get('hidePicker') !== 'false');
  let iframeSrc = $state('');

  onMount(() => {
    const h = readHash();
    if (h.id) entityId = h.id;
    if (h.hidePicker === 'false') hidePicker = false;

    if (entityId) {
      // Load the full portfolio-explorer page in an iframe with the entity pre-selected
      const params = new URLSearchParams({ entity: entityId });
      if (hidePicker) params.set('hidePicker', 'true');
      iframeSrc = `/portfolio-explorer/?${params.toString()}`;
    }
  });
</script>

<svelte:head>
  <title>Portfolio Explorer — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if !entityId}
  <p class="embed-msg">Missing required <code>id</code> parameter</p>
{:else if iframeSrc}
  <iframe
    src={iframeSrc}
    title="Portfolio Explorer"
    class="pe-iframe"
    frameborder="0"
    allow="clipboard-write"
  ></iframe>
{/if}

<style>
  .embed-msg {
    padding: 20px;
    color: var(--color-error, #7f142a);
    font-size: var(--font-size-sm, 14px);
    text-align: center;
  }
  .pe-iframe {
    width: 100%;
    height: 100%;
    min-height: 600px;
    border: none;
  }
</style>
