<script lang="ts">
  /**
   * AssetMicroCard - Tufte/Swiss-inspired asset summary
   *
   * Grid-based, typography-driven, high data-ink ratio.
   * Shows asset name, tracker type, status, and capacity.
   */
  import { assetLink } from '$lib/links';
  import { colorByTracker, colorByStatus } from '$lib/design-tokens';
  import TrackerIcon from '$lib/components/tracker/TrackerIcon.svelte';
  import { formatCapacityNullable as formatCapacity } from '$lib/utils/format';
  import { RASTER_TILE_URL } from '$lib/map-config';

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
    latitude = undefined,
    longitude = undefined,
  } = $props();

  const trackerColor = $derived(colorByTracker.get(tracker) || 'var(--color-gray-400)');
  const statusColor = $derived(
    colorByStatus.get(status?.toLowerCase()) || 'var(--color-text-tertiary)'
  );

  const formattedCapacity = $derived(formatCapacity(capacity));
  const linkHref = $derived(href || assetLink(id));

  // Static map tile URL — zoom level 6 gives good regional context
  const miniMapUrl = $derived(
    latitude && longitude
      ? RASTER_TILE_URL.replace('{z}', String(latLngToTile(latitude, longitude, 6).z))
          .replace('{x}', String(latLngToTile(latitude, longitude, 6).x))
          .replace('{y}', String(latLngToTile(latitude, longitude, 6).y))
      : null
  );
  const miniMapPixelOffset = $derived(
    latitude && longitude ? latLngToPixelInTile(latitude, longitude, 6) : null
  );

  function latLngToTile(lat: number, lng: number, z: number) {
    const x = Math.floor(((lng + 180) / 360) * (1 << z));
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * (1 << z)
    );
    return { x, y, z };
  }

  function latLngToPixelInTile(lat: number, lng: number, z: number) {
    const n = 1 << z;
    const xTile = ((lng + 180) / 360) * n;
    const latRad = (lat * Math.PI) / 180;
    const yTile = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    // pixel within 256x256 tile
    return { x: (xTile % 1) * 256, y: (yTile % 1) * 256 };
  }
</script>

{#if onclick}
  <button class="amc" class:compact={variant === 'compact'} {onclick} type="button">
    {@render cardContent()}
  </button>
{:else}
  <a class="amc" class:compact={variant === 'compact'} href={linkHref}>
    {@render cardContent()}
  </a>
{/if}

{#snippet cardContent()}
  <div class="amc-layout" class:has-map={!!miniMapUrl}>
    {#if miniMapUrl}
      <div
        class="amc-minimap"
        style="background-image: url({miniMapUrl}); background-position: -{Math.max(
          0,
          (miniMapPixelOffset?.x || 128) - 24
        )}px -{Math.max(0, (miniMapPixelOffset?.y || 128) - 24)}px;"
      >
        <span class="amc-map-dot" style="background: {trackerColor}"></span>
      </div>
    {/if}
    <div class="amc-grid">
      <!-- Row 1: Tracker indicator + Name -->
      <div class="amc-header">
        <span class="amc-tracker-dot" style="background: {trackerColor}">
          <TrackerIcon {tracker} size={8} />
        </span>
        <span class="amc-name" title={name}>{name || id}</span>
      </div>

      <!-- Row 2: Metadata line -->
      <div class="amc-meta">
        {#if tracker}<span class="amc-tracker-name">{tracker}</span>{/if}
        {#if country}<span class="amc-country">{country}</span>{/if}
      </div>

      <!-- Row 3: Stats -->
      <div class="amc-stats">
        {#if status}
          <span class="amc-status" style="color: {statusColor}">{status}</span>
        {/if}
        {#if formattedCapacity}
          <span class="amc-capacity">{formattedCapacity}</span>
        {/if}
      </div>

      <!-- Row 4: Owner (optional) -->
      {#if owner}
        <div class="amc-owner" title={owner}>{owner}</div>
      {/if}
    </div>
  </div>
{/snippet}

<style>
  /* ═══════════════════════════════════════════════════════════════════
     ASSET MICRO CARD — Tufte/Swiss Design
     Grid-based · Typography-driven · High data-ink ratio
     ═══════════════════════════════════════════════════════════════════ */

  .amc {
    display: block;
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: none;
    border-left: 2px solid var(--color-gray-200);
    text-decoration: none;
    color: inherit;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    width: 100%;
    min-width: 0;
    transition: border-color 0.15s ease;
  }

  .amc:hover {
    border-left-color: var(--color-black);
  }

  .amc.compact {
    padding: var(--space-2) var(--space-3);
  }

  /* Layout with optional map */
  .amc-layout {
    display: flex;
    gap: var(--space-2);
    align-items: flex-start;
  }

  .amc-minimap {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: var(--radius-sm, 4px);
    background-size: 256px 256px;
    background-color: var(--color-bg-secondary, #f5f5f5);
    position: relative;
    overflow: hidden;
  }

  .amc-map-dot {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1.5px solid white;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.3);
  }

  .amc.compact .amc-minimap {
    width: 40px;
    height: 40px;
  }

  /* Grid Layout */
  .amc-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  /* Header: Tracker dot + Name */
  .amc-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .amc-tracker-dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .amc-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-black);
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Metadata line */
  .amc-meta {
    display: flex;
    gap: var(--space-2);
    font-size: 11px;
    color: var(--color-text-tertiary);
    margin-left: 22px; /* Align with name after dot */
  }

  .amc-tracker-name {
    color: var(--color-text-secondary);
  }

  .amc-country::before {
    content: '·';
    margin-right: var(--space-2);
  }

  /* Stats row */
  .amc-stats {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-top: var(--space-1);
    margin-left: 22px;
  }

  .amc-status {
    font-size: 11px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .amc-capacity {
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-family-data, inherit);
    font-variant-numeric: tabular-nums;
    color: var(--color-black);
  }

  /* Owner */
  .amc-owner {
    font-size: 11px;
    color: var(--color-text-tertiary);
    margin-top: var(--space-1);
    margin-left: 22px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Compact variant */
  .amc.compact .amc-name {
    font-size: 13px;
  }

  .amc.compact .amc-tracker-dot {
    width: 12px;
    height: 12px;
  }

  .amc.compact .amc-meta,
  .amc.compact .amc-stats,
  .amc.compact .amc-owner {
    margin-left: 20px;
  }

  .amc.compact .amc-capacity {
    font-size: 12px;
  }
</style>
