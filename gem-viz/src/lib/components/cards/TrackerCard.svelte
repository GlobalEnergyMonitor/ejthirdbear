<script lang="ts">
  /**
   * TRACKER CARD
   * Dynamically loads and renders a tracker-specific detail card (e.g., CoalPlantCard)
   * based on the asset's facility type. Falls back to nothing if no specialized card exists.
   *
   * Usage: <TrackerCard {asset} />
   */

  import type { AssetSummary } from '$lib/ownership-api';
  import { getTrackerCardConfig, type TrackerCardConfig } from './tracker-card-registry';

  let { asset }: { asset: AssetSummary } = $props();

  // Look up the registry entry for this asset's facility type
  const config: TrackerCardConfig | null = $derived(getTrackerCardConfig(asset?.facilityType));

  // Dynamic component + props state
  let CardComponent = $state<any>(null);
  let cardProps = $state<Record<string, unknown> | null>(null);
  let loading = $state(false);
  let loadError = $state<string | null>(null);

  // Load component and data when config changes
  $effect(() => {
    const cfg = config;
    if (!cfg || !asset) {
      CardComponent = null;
      cardProps = null;
      return;
    }

    loading = true;
    loadError = null;
    CardComponent = null;
    cardProps = null;

    Promise.all([cfg.loadComponent(), cfg.fetchProps(asset)])
      .then(([mod, props]) => {
        if (props) {
          CardComponent = mod.default;
          cardProps = props;
        } else {
          // fetchProps returned null — no data available for this asset
          CardComponent = null;
          cardProps = null;
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) console.error('[TrackerCard]', err);
        loadError = err?.message || 'Failed to load tracker details';
      })
      .finally(() => {
        loading = false;
      });
  });
</script>

{#if config}
  <section class="tracker-card-section">
    <h2>{config.label}</h2>
    {#if loading}
      <p class="tracker-card-status">Loading tracker details…</p>
    {:else if loadError}
      <p class="tracker-card-status error">{loadError}</p>
    {:else if CardComponent && cardProps}
      <svelte:component this={CardComponent} {...cardProps} />
    {/if}
  </section>
{/if}

<style>
  .tracker-card-section {
    margin: var(--space-10) 0;
  }

  .tracker-card-section h2 {
    font-size: var(--font-size-2xl);
    font-weight: normal;
    margin: 0 0 var(--space-5) 0;
    border-bottom: var(--border-width) solid var(--color-border);
    padding-bottom: var(--space-3);
    font-family: var(--font-family-serif);
  }

  .tracker-card-status {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
    padding: var(--space-4) 0;
  }

  .tracker-card-status.error {
    color: var(--color-error);
  }
</style>
