<script lang="ts">
  /**
   * GemPortfolioExplorer — Shadow DOM widget for the portfolio explorer.
   * Thin wrapper around the reusable PortfolioExplorer component.
   *
   * Props:
   *   entityId   — Entity ID to explore (e.g. E100001000347)
   *   hidePicker — Hide the sample owner picker (default: true for embeds)
   *   linkBase   — Base URL for generated links (for Drupal embedding)
   *   linkTarget — Navigation mode: 'parent'|'message'|'self'|'blank'
   */
  import PortfolioExplorer from '$lib/components/portfolio/PortfolioExplorer.svelte';

  let {
    entityId = '',
    entity = '',
    id = '',
    hidePicker = true,
    linkBase = '',
    linkTarget = '',
  }: {
    entityId?: string;
    entity?: string;
    id?: string;
    hidePicker?: boolean;
    linkBase?: string;
    linkTarget?: string;
  } = $props();

  // Accept multiple param names for flexibility
  const resolvedEntityId = $derived(entityId || entity || id);
</script>

<PortfolioExplorer entityId={resolvedEntityId} {hidePicker} {linkBase} {linkTarget} />
