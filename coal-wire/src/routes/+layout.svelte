<script lang="ts">
  import '$lib/gem-styles.css';
  let { children } = $props();
</script>

{@render children()}

<style>
  :global(body) {
    margin: 0;
    font-family: var(--font-family);
    background: var(--color-bg-secondary);
    color: var(--color-text-primary);
  }
</style>
