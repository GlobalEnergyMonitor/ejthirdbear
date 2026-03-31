<script lang="ts">
  /**
   * Embeddable Ownership Flower
   * Radial visualization showing an entity's portfolio mix by tracker type.
   *
   * URL params (all overridable via URL hash for Drupal deep-linking):
   *   entityId - Required. Entity ID to display
   *   size - Optional. "small", "medium", "large" (default: medium)
   *   showLabels - Optional. "true" or "false" (default: true)
   *   showTitle - Optional. "true" or "false" (default: true)
   *
   * Hash params: entityId, size, showLabels, showTitle
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import OwnershipFlower from '$lib/components/network/OwnershipFlower.svelte';
  import {
    loadEntityPortfolio,
    errorMessage,
    boolParam,
    readHash,
    type EmbedPortfolio,
  } from '../embed-utils';

  type FlowerSize = 'small' | 'medium' | 'large';
  const VALID_SIZES: FlowerSize[] = ['small', 'medium', 'large'];

  // URL params (converted to $state so hash can override on mount)
  let entityId = $state($page.url.searchParams.get('entityId'));
  let sizeParam = $state($page.url.searchParams.get('size') || 'medium');
  let showLabels = $state(boolParam($page.url.searchParams.get('showLabels')));
  let showTitle = $state(boolParam($page.url.searchParams.get('showTitle')));
  const validSize = $derived<FlowerSize>(
    VALID_SIZES.includes(sizeParam as FlowerSize) ? (sizeParam as FlowerSize) : 'medium'
  );

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let portfolio = $state<EmbedPortfolio | null>(null);

  onMount(async () => {
    // Read hash — hash params override query params for deep-linking
    const h = readHash();
    if (h.entityId) entityId = h.entityId;
    if (h.size) sizeParam = h.size;
    if (h.showLabels !== undefined) showLabels = boolParam(h.showLabels);
    if (h.showTitle !== undefined) showTitle = boolParam(h.showTitle);

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

<svelte:head>
  <title>Ownership Flower — GEM Embed</title>
  <meta name="robots" content="noindex" />
</svelte:head>

{#if loading}
  <div class="embed-loading">Loading ownership flower...</div>
{:else if error}
  <div class="embed-error">
    <p>{error}</p>
    {#if !entityId}
      <p class="embed-hint">Example: ?entityId=YOUR_ENTITY_ID</p>
    {/if}
  </div>
{:else if entityId && portfolio && (portfolio.assets as any[]).length > 0}
  <OwnershipFlower ownerId={entityId} {portfolio} size={validSize} {showLabels} {showTitle} />
{:else if entityId && portfolio}
  <div class="embed-empty">
    <p>
      This entity owns subsidiaries but no direct assets. Try the <a
        href="/embed/entity?id={entityId}"
        target="_blank"
        rel="noopener noreferrer">Entity Card</a
      > embed for subsidiary details.
    </p>
  </div>
{:else}
  <div class="embed-error">
    <p>No data found for this entity</p>
  </div>
{/if}
