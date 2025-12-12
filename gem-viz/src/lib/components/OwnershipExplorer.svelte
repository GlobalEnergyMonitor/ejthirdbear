<script>
  /**
   * OwnershipExplorer - Layout wrapper for AssetScreener
   *
   * AssetScreener is now fully self-hydrating.
   * This component provides a styled container wrapper.
   */
  import AssetScreener from '$lib/components/AssetScreener.svelte';
</script>

<section class="ownership-explorer">
  <AssetScreener />
</section>

<style>
  .ownership-explorer {
    padding: 12px 0;
  }
</style>
