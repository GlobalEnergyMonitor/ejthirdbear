<script lang="ts">
  /**
   * GemUltimateOwners — Shadow DOM widget for ultimate parent owners.
   * Mirrors embed/ultimate-owners/+page.svelte.
   */
  import UltimateOwners from '$lib/components/tracker/UltimateOwners.svelte';

  interface Props {
    entityId: string;
    theme?: 'light' | 'dark';
  }

  let { entityId, theme = 'light' }: Props = $props();
</script>

<div class="uo-embed" class:dark={theme === 'dark'}>
  {#if entityId}
    <UltimateOwners {entityId} />
  {:else}
    <div class="embed-error"><p>Missing required parameter: entityId</p></div>
  {/if}
</div>

<style>
  .uo-embed {
    width: 100%;
    max-width: 600px;
    font-family: var(--font-family);
  }
</style>
