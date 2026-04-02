<script lang="ts">
  /**
   * GemControlChain — Shadow DOM widget for full search + ownership tree flow.
   * Mirrors embed/controlchain/+page.svelte.
   */
  import ControlChainApp from '$lib/components/controlchain/ControlChainApp.svelte';

  interface Props {
    q?: string;
    type?: string;
    theme?: 'light' | 'dark';
  }

  let { q = '', type = 'assets', theme = 'light' }: Props = $props();
</script>

<div class="cc-embed" class:dark={theme === 'dark'}>
  <ControlChainApp initialQuery={q} initialType={type} />
</div>

<style>
  .cc-embed {
    width: 100%;
    font-family: var(--font-family);
    padding: var(--space-4, 16px);
    box-sizing: border-box;
  }
</style>
