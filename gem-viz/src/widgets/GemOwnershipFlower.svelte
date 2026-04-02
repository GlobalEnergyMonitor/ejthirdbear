<script lang="ts">
  /**
   * GemOwnershipFlower — Dynamic embed widget for ownership flower visualization.
   * Mirrors embed/ownership-flower/+page.svelte but uses widget-api.
   */
  import { onMount } from 'svelte';
  import { loadEntityPortfolio, errorMessage, type EmbedPortfolio } from './widget-data';
  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';

  type FlowerSize = 'small' | 'medium' | 'large';
  const VALID_SIZES: FlowerSize[] = ['small', 'medium', 'large'];

  interface Props {
    entityId: string;
    size?: string;
    showLabels?: boolean;
    showTitle?: boolean;
    theme?: 'light' | 'dark';
  }

  let {
    entityId,
    size = 'medium',
    showLabels = true,
    showTitle = true,
    theme = 'light',
  }: Props = $props();

  const validSize = $derived<FlowerSize>(
    VALID_SIZES.includes(size as FlowerSize) ? (size as FlowerSize) : 'medium'
  );

  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<EmbedPortfolio | null>(null);

  function navigate(url: string) {
    window.open(url, '_blank', 'noopener');
  }

  onMount(async () => {
    if (!entityId) {
      error = 'Missing required parameter: entityId';
      loading = false;
      return;
    }
    try {
      const result = await loadEntityPortfolio(entityId);
      portfolio = result.portfolio;
    } catch (err) {
      error = errorMessage(err, 'Failed to load entity');
    } finally {
      loading = false;
    }
  });
</script>

<div class="flower-embed" class:dark={theme === 'dark'}>
  {#if loading}
    <div class="embed-loading">Loading ownership flower...</div>
  {:else if error}
    <div class="embed-error">
      <p>{error}</p>
    </div>
  {:else if entityId && portfolio && portfolio.assets.length > 0}
    <OwnershipFlower
      ownerId={entityId}
      {portfolio}
      size={validSize}
      {showLabels}
      {showTitle}
      onNavigate={navigate}
    />
  {:else if entityId && portfolio}
    <div class="embed-loading">
      <p>This entity owns subsidiaries but no direct assets.</p>
    </div>
  {:else}
    <div class="embed-error">
      <p>No data found for this entity</p>
    </div>
  {/if}
</div>

<style>
  .flower-embed {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-family);
  }
</style>
