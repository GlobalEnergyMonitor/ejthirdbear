<script lang="ts">
  /**
   * Spinner — single source of @keyframes spin.
   * Replaces 13 duplicate spinner definitions across the codebase.
   */
  let {
    size = 24,
  }: {
    size?: number;
  } = $props();
</script>

<div
  class="spinner"
  style="width: {size}px; height: {size}px;"
  role="status"
  aria-label="Loading"
></div>

<style>
  .spinner {
    border: 2px solid var(--color-gray-200);
    border-top-color: var(--gem-navy);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
