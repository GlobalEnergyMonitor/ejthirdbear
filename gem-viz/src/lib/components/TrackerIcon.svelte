<script>
  /**
   * TrackerIcon - Inline colored indicator for tracker type
   * Shows a colored dot/shape representing the tracker type using GEM brand colors.
   *
   * Usage:
   *   <TrackerIcon tracker="Coal Plant" />
   *   <TrackerIcon tracker="Gas Pipeline" size={16} showLabel />
   */
  import { colorByTracker, colors } from '$lib/ownership-theme';

  /** @type {{ tracker: string, size?: number, showLabel?: boolean, variant?: 'dot' | 'pill' }} */
  let { tracker = 'Unknown', size = 12, showLabel = false, variant = 'dot' } = $props();

  const color = $derived(colorByTracker.get(tracker) || colors.grey);

  // Short labels for common trackers
  const shortLabels = {
    'Coal Plant': 'Coal',
    'Gas Plant': 'Gas',
    'Coal Mine': 'Mine',
    'Iron Ore Mine': 'Iron',
    'Steel Plant': 'Steel',
    'Gas Pipeline': 'Pipeline',
    'Bioenergy Power': 'Bio',
    'Cement and Concrete': 'Cement',
  };

  const label = $derived(shortLabels[tracker] || tracker);
</script>

{#if variant === 'pill'}
  <span class="tracker-pill" style="--tracker-color: {color}">
    <span class="dot" style="width: {size}px; height: {size}px;"></span>
    {#if showLabel}
      <span class="label">{label}</span>
    {/if}
  </span>
{:else}
  <span class="tracker-dot-wrapper" title={tracker}>
    <span class="tracker-dot" style="width: {size}px; height: {size}px; background-color: {color};"
    ></span>
    {#if showLabel}
      <span class="label" style="color: {color};">{label}</span>
    {/if}
  </span>
{/if}

<style>
  .tracker-dot-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    vertical-align: middle;
  }

  .tracker-dot {
    display: inline-block;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-weight: 600;
  }

  .tracker-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border: 1px solid var(--tracker-color);
    background: color-mix(in srgb, var(--tracker-color) 10%, white);
    border-radius: 12px;
    vertical-align: middle;
  }

  .tracker-pill .dot {
    display: inline-block;
    border-radius: 50%;
    background-color: var(--tracker-color);
    flex-shrink: 0;
  }

  .tracker-pill .label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    font-weight: 600;
    color: var(--tracker-color);
  }
</style>
