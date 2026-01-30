<script>
  /**
   * AssetMicroCard - Compact asset summary for tooltips & map popups
   *
   * A tiny, information-dense card showing:
   * - Asset name & location
   * - Status badge with color
   * - Tracker type with icon
   * - Capacity
   * - Owner info
   *
   * Perfect for: map popups, tooltips, hover states, search results
   */
  import { assetLink } from '$lib/links';
  import { formatCompact } from '$lib/format';
  import { colorByTracker, colorByStatus } from '$lib/design-tokens';
  import TrackerIcon from './TrackerIcon.svelte';
  import StatusIcon from './StatusIcon.svelte';

  let {
    id = '',
    name = '',
    tracker = '',
    status = '',
    country = '',
    capacity = 0,
    owner = '',
    href = '',
    variant = 'default',
    onclick = undefined,
  } = $props();

  const trackerColor = $derived(colorByTracker.get(tracker) || '#888');
  const statusColor = $derived(colorByStatus.get(status?.toLowerCase()) || '#888');

  // Format capacity with smart units
  function formatCapacity(mw) {
    if (!mw || mw === 0) return null;
    if (mw >= 1000) {
      return `${(mw / 1000).toFixed(1)} GW`;
    }
    return `${formatCompact(mw)} MW`;
  }

  const formattedCapacity = $derived(formatCapacity(capacity));
  const linkHref = $derived(href || assetLink(id));
</script>

{#if onclick}
  <button class="asset-micro-card clickable" class:compact={variant === 'compact'} {onclick}>
    {@render cardContent()}
  </button>
{:else}
  <a class="asset-micro-card clickable" class:compact={variant === 'compact'} href={linkHref}>
    {@render cardContent()}
  </a>
{/if}

{#snippet cardContent()}
  <div class="card-header">
    <div class="tracker-badge" style="background: {trackerColor}">
      <TrackerIcon {tracker} size={10} />
    </div>
    <div class="card-info">
      <div class="asset-name" title={name}>{name || id}</div>
      {#if country}
        <div class="asset-location">{country}</div>
      {/if}
    </div>
  </div>

  <div class="card-meta">
    {#if status}
      <span class="status-badge" style="--status-color: {statusColor}">
        <StatusIcon {status} size={10} />
        <span class="status-text">{status}</span>
      </span>
    {/if}
    {#if formattedCapacity}
      <span class="capacity">{formattedCapacity}</span>
    {/if}
  </div>

  {#if tracker}
    <div class="tracker-label">{tracker}</div>
  {/if}

  {#if owner}
    <div class="owner-info" title={owner}>
      <span class="owner-label">Owner:</span>
      <span class="owner-name">{owner}</span>
    </div>
  {/if}
{/snippet}

<style>
  .asset-micro-card {
    display: block;
    background: var(--color-white);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 11px;
    min-width: 200px;
    max-width: 280px;
    box-shadow: var(--shadow-md);
    text-decoration: none;
    color: inherit;
    text-align: left;
    width: 100%;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    cursor: pointer;
  }

  .asset-micro-card.clickable {
    transition:
      border-color 0.15s,
      box-shadow 0.15s,
      transform 0.1s;
  }

  .asset-micro-card.clickable:hover {
    border-color: #999;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .asset-micro-card.compact {
    padding: 8px 10px;
    min-width: 160px;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }

  .tracker-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .card-info {
    flex: 1;
    min-width: 0;
  }

  .asset-name {
    font-weight: 600;
    font-size: 13px;
    color: #111;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .asset-location {
    font-size: 11px;
    color: #666;
    margin-top: 2px;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: color-mix(in srgb, var(--status-color) 15%, transparent);
    border-radius: 3px;
    font-size: 10px;
    text-transform: capitalize;
  }

  .status-text {
    color: var(--status-color);
    font-weight: 500;
  }

  .capacity {
    font-weight: 600;
    font-size: 12px;
    color: #222;
    font-variant-numeric: tabular-nums;
  }

  .tracker-label {
    font-size: 10px;
    color: #888;
    margin-bottom: 6px;
  }

  .owner-info {
    font-size: 10px;
    color: #666;
    border-top: 1px solid #eee;
    padding-top: 6px;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .owner-label {
    color: #999;
  }

  .owner-name {
    color: #444;
  }
</style>
