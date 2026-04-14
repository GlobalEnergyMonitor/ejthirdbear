<script lang="ts">
  /**
   * GemPortfolioExplorer — Shadow DOM widget for the portfolio explorer.
   *
   * When an entity ID is provided: renders PortfolioExplorer directly (no picker, no modal).
   * When no entity ID: renders OwnerSearchApp (search-first, opens explorer in modal).
   *
   * Props:
   *   entityId   — Entity ID to explore (e.g. E100001000347)
   *   linkBase   — Base URL for generated links (for Drupal embedding)
   *   linkTarget — Navigation mode: 'parent'|'message'|'self'|'blank'
   */
  import PortfolioExplorer from '$lib/components/portfolio/PortfolioExplorer.svelte';
  import OwnerSearchApp from '$lib/components/portfolio/OwnerSearchApp.svelte';

  let {
    entityId = '',
    entity = '',
    id = '',
    linkBase = '',
    linkTarget = '',
  }: {
    entityId?: string;
    entity?: string;
    id?: string;
    linkBase?: string;
    linkTarget?: string;
  } = $props();

  // Accept multiple param names for flexibility
  const resolvedEntityId = $derived(entityId || entity || id);
</script>

{#if resolvedEntityId}
  <PortfolioExplorer entityId={resolvedEntityId} hidePicker={true} {linkBase} {linkTarget} />
{:else}
  <OwnerSearchApp embedded={true} />
{/if}
